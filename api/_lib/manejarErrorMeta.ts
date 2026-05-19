/**
 * Helper centralizado para manejar errores de Meta Cloud API (códigos
 * estructurados) con persistencia, logging y notificación a admins.
 *
 * SPRINT-WA-BILLING-VERIFY (2026-05-19). Diseño: cuando `api/whatsapp/send.ts`
 * o `api/whatsapp/webhook.ts` reciben un error del Graph API o de un status
 * callback (failed) con `errorMeta.code` poblado, invocan este helper para:
 *
 *  1. Mapear el código a severidad ('critica' | 'alta' | 'media' | 'baja').
 *     Códigos billing (`131056`, `131057`) → `esBilling=true`.
 *  2. Loggear con tag específico (`META_BILLING_ERROR_*`,
 *     `META_SPAM_RATE_LIMIT_*`, etc.) sin PII (wa_id truncado a 4 dígitos).
 *  3. Persistir el evento en `whatsapp_errores_meta` (audit + analítica).
 *  4. Notificar a admins activos cuando severidad es 'critica' o 'alta',
 *     creando docs en `notificaciones` (uno por admin) vía Admin SDK directo.
 *
 * Best-effort: si persistencia o notificación fallan, NO bloquea el endpoint
 * que llamó. Devuelve flags `{ esBilling, severidad, notificacionEnviada }`
 * para que el caller pueda ajustar el status code/payload de respuesta al
 * cliente (p.ej. send.ts devuelve `'meta-billing-error'` con código 502 en
 * lugar del genérico `'meta-envio-fallo'`).
 *
 * Códigos de error de Meta cubiertos (referencia:
 * https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes):
 *
 * | Code   | Severidad | esBilling | Significado                                   |
 * |--------|-----------|-----------|-----------------------------------------------|
 * | 131056 | critica   | true      | Account billing must be configured (WABA sin tarjeta o suspendido) |
 * | 131031 | critica   | true      | Account locked / WABA suspendida permanentemente |
 * | 131057 | alta      | true      | Trial account exceeded message limit (cap del trial pre-billing) |
 * | 131048 | alta      | false     | Spam rate limit (Meta detectó patrón abusivo) |
 * | 132000 | alta      | false     | Template params mismatch (cron de recordatorios se rompe en masa) |
 * | 132001 | alta      | false     | Template not found (eliminada o nunca aprobada) |
 * | 131047 | media     | false     | Re-engagement required (>24h, requiere plantilla — window 24h race) |
 * | 131051 | media     | false     | Unsupported message type (tipo de payload no aceptado) |
 * | 131026 | baja      | false     | Message undeliverable (número inválido — volumen alto en marketing) |
 * | otros  | baja      | false     | Loggea + persiste pero NO notifica admins     |
 *
 * Cualquier otro código (incluyendo undefined) cae a severidad 'baja' — el
 * caller persiste igual el doc para análisis post-hoc pero no escala.
 *
 * Logs sin PII:
 *  - wa_id se trunca a `***1234` vía `truncarWaIdParaLog`.
 *  - Mensajes de Meta truncados a 150 chars.
 *  - NO se loggea el access token.
 *
 * Lección WA-1 FieldValue: `FieldValue` se importa DIRECTO de
 * `firebase-admin/firestore`, NO del wrapper local (`firebaseAdmin.ts`) —
 * el wrapper sólo expone helpers de init, no re-exporta tipos del SDK.
 */
import { FieldValue } from 'firebase-admin/firestore';
import type { getAdminFirestore } from './firebaseAdmin.js';
import { stripUndefinedDeep, truncarWaIdParaLog } from './whatsappWebhook.js';

const LOG_PREFIX = '[manejarErrorMeta]';

export type SeveridadErrorMeta = 'critica' | 'alta' | 'media' | 'baja';

export interface ErrorMetaInput {
  code?: number;
  mensaje?: string;
  title?: string;
  detalles?: unknown;
}

export interface ContextoErrorMeta {
  /** `send` (POST a Meta) | `webhook` (status callback con `failed`) | `otro`. */
  fuente: 'send' | 'webhook' | 'otro';
  /** Teléfono RD 10 dígitos del destinatario (se trunca antes de loggear). */
  wa_id?: string;
  /** Phone Number ID que envió o recibió el callback. */
  phoneNumberId?: string;
  /** Id del doc en `whatsapp_mensajes_outbox` (cuando aplica). */
  outboxId?: string;
  /** Id del mensaje en Meta (cuando aplica — status callbacks). */
  wamid?: string;
  /** Uid del solicitante del send (no se setea desde webhook). */
  callerUid?: string;
}

export interface ResultadoManejarError {
  esBilling: boolean;
  severidad: SeveridadErrorMeta;
  notificacionEnviada: boolean;
}

/**
 * Mapea el código de error de Meta a severidad + flag billing + tag de log.
 *
 * El tag de log es informativo (`META_BILLING_ERROR_131056`, etc.) y se
 * concatena con el código para que el operador pueda filtrar logs en Vercel
 * por la combinación específica. Códigos no listados → `META_ERROR` genérico.
 */
function mapearCodigoError(code: number | undefined): {
  severidad: SeveridadErrorMeta;
  esBilling: boolean;
  tagLog: string;
} {
  // Billing / cuenta — críticos para operación del módulo.
  if (code === 131056) {
    return { severidad: 'critica', esBilling: true, tagLog: 'BILLING_ERROR' };
  }
  if (code === 131057) {
    return { severidad: 'alta', esBilling: true, tagLog: 'BILLING_ERROR' };
  }
  // WABA suspendida / cuenta bloqueada permanentemente.
  // Sin esto, todo el módulo deja de funcionar y solo Meta puede reactivar.
  if (code === 131031) {
    return { severidad: 'critica', esBilling: true, tagLog: 'ACCOUNT_LOCKED' };
  }
  // Spam / abuso de rate.
  if (code === 131048) {
    return { severidad: 'alta', esBilling: false, tagLog: 'SPAM_RATE_LIMIT' };
  }
  // Plantillas: parámetros mal armados → cron de recordatorios se rompe en masa.
  if (code === 132000) {
    return {
      severidad: 'alta',
      esBilling: false,
      tagLog: 'TEMPLATE_PARAMS_MISMATCH',
    };
  }
  // Plantilla no existe (eliminada o nunca aprobada). Mismo impacto crítico
  // que params mismatch para el caller que la solicitó.
  if (code === 132001) {
    return {
      severidad: 'alta',
      esBilling: false,
      tagLog: 'TEMPLATE_NOT_FOUND',
    };
  }
  // Mensaje requiere re-engagement (>24h sin contacto, necesita plantilla HSM).
  // Window 24h en send.ts ya lo previene, pero si llega desde webhook por
  // race condition vale loggearlo + escalar para investigar.
  if (code === 131047) {
    return { severidad: 'media', esBilling: false, tagLog: 'REENGAGEMENT_REQUIRED' };
  }
  // Tipo de mensaje no soportado por la versión del API que estamos usando.
  if (code === 131051) {
    return {
      severidad: 'media',
      esBilling: false,
      tagLog: 'UNSUPPORTED_MSG_TYPE',
    };
  }
  // Número destinatario no existe / formato inválido. Volumen alto esperado en
  // campañas marketing — severidad baja para no spamear admins; igual persiste
  // para análisis en `whatsapp_errores_meta`.
  if (code === 131026) {
    return { severidad: 'baja', esBilling: false, tagLog: 'MESSAGE_UNDELIVERABLE' };
  }
  return { severidad: 'baja', esBilling: false, tagLog: 'ERROR' };
}

/**
 * Maneja un error estructurado de Meta. Best-effort para los side effects
 * (persistencia + notificación) — cualquier fallo se loggea con `console.warn`
 * pero no rompe el caller.
 *
 * @returns flags útiles para que el caller decida el response al cliente.
 */
export async function manejarErrorMeta(input: {
  db: ReturnType<typeof getAdminFirestore>;
  errorMeta: ErrorMetaInput;
  contexto: ContextoErrorMeta;
}): Promise<ResultadoManejarError> {
  const { db, errorMeta, contexto } = input;
  const { severidad, esBilling, tagLog } = mapearCodigoError(errorMeta.code);

  // 1) Logging estructurado sin PII.
  const codigoStr = errorMeta.code !== undefined ? String(errorMeta.code) : 'unknown';
  const waLog = contexto.wa_id ? truncarWaIdParaLog(contexto.wa_id) : 'n/a';
  const phoneLog = contexto.phoneNumberId ?? 'n/a';
  const mensajeRecortado = (errorMeta.mensaje ?? '').substring(0, 150);

  console.error(
    `${LOG_PREFIX} [META_${tagLog}_${codigoStr}] ` +
      `fuente=${contexto.fuente} wa=${waLog} phone=${phoneLog} ` +
      `mensaje=${mensajeRecortado}`,
  );

  // 2) Persistir el evento en whatsapp_errores_meta (best-effort).
  //    Caveat PII (security audit): Meta puede ecear el payload original en
  //    `error_data.details` para códigos como 132000 (template params) o
  //    131051 (unsupported type). Trunco `mensaje` y stringify+truncar
  //    `detalles` antes de persistir para limitar leak si el doc se lee
  //    desde UI admin más adelante.
  const mensajePersistir = errorMeta.mensaje
    ? errorMeta.mensaje.substring(0, 500)
    : null;
  const detallesPersistir = (() => {
    if (errorMeta.detalles === undefined || errorMeta.detalles === null) return null;
    try {
      const s = typeof errorMeta.detalles === 'string'
        ? errorMeta.detalles
        : JSON.stringify(errorMeta.detalles);
      if (s.length <= 1000) return s;
      return s.substring(0, 1000) + '...[truncado]';
    } catch {
      return '[no serializable]';
    }
  })();

  try {
    const payload: Record<string, unknown> = {
      codigo: errorMeta.code ?? null,
      titulo: errorMeta.title ?? null,
      mensaje: mensajePersistir,
      detalles: detallesPersistir,
      esBilling,
      severidad,
      fuente: contexto.fuente,
      wa_id_truncado: contexto.wa_id ? truncarWaIdParaLog(contexto.wa_id) : null,
      phoneNumberId: contexto.phoneNumberId ?? null,
      outboxId: contexto.outboxId ?? null,
      wamid: contexto.wamid ?? null,
      callerUid: contexto.callerUid ?? null,
      timestamp: FieldValue.serverTimestamp(),
    };
    await db.collection('whatsapp_errores_meta').add(stripUndefinedDeep(payload));
  } catch (err) {
    const m = err instanceof Error ? err.message.substring(0, 200) : 'unknown';
    console.warn(`${LOG_PREFIX} [META_ERROR_PERSIST_FAIL] ${m}`);
  }

  // 3) Notificar admins activos cuando severidad es crítica/alta.
  //    Dedupe por (codigo, día RD) para evitar spam: si Meta tira 131048
  //    en todas las llamadas durante un incidente de 48h, sin dedupe se
  //    generarían miles de notificaciones a cada admin (security audit
  //    SPRINT-WA-BILLING-VERIFY hallazgo ALTA #1). El doc dedupe es
  //    transaccional: solo el primer error de un código/día notifica;
  //    los siguientes incrementan un counter para forensia pero no
  //    spamean. Los docs en whatsapp_errores_meta SI se persisten todos
  //    (audit trail completo).
  let notificacionEnviada = false;
  if (severidad === 'critica' || severidad === 'alta') {
    const fechaHoy = new Date().toISOString().slice(0, 10);
    const codigoStrDedupe = errorMeta.code !== undefined ? String(errorMeta.code) : 'unknown';
    const dedupeRef = db
      .collection('whatsapp_errores_meta_dedupe')
      .doc(`${fechaHoy}_${codigoStrDedupe}`);
    let yaNotificadoHoy = false;
    try {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(dedupeRef);
        if (snap.exists) {
          yaNotificadoHoy = true;
          tx.update(dedupeRef, {
            count: FieldValue.increment(1),
            ultimaOcurrencia: FieldValue.serverTimestamp(),
          });
        } else {
          tx.set(dedupeRef, {
            codigo: errorMeta.code ?? null,
            severidad,
            esBilling,
            fecha: fechaHoy,
            count: 1,
            primeraOcurrencia: FieldValue.serverTimestamp(),
            ultimaOcurrencia: FieldValue.serverTimestamp(),
          });
        }
      });
    } catch (err) {
      const m = err instanceof Error ? err.message.substring(0, 200) : 'unknown';
      console.warn(`${LOG_PREFIX} [META_ERROR_DEDUPE_FAIL] ${m} — notificando igual por seguridad`);
    }

    if (yaNotificadoHoy) {
      // Audit trail interna: ya hay log + persist, solo evitamos spam de notif.
      console.warn(
        `${LOG_PREFIX} [META_ERROR_DEDUPE_HIT] codigo=${codigoStrDedupe} fecha=${fechaHoy} — notificación skipeada`,
      );
      return { esBilling, severidad, notificacionEnviada: false };
    }

    try {
      const adminsSnap = await db
        .collection('usuarios')
        .where('rol', '==', 'administrador')
        .limit(10)
        .get();

      const adminUids = adminsSnap.docs
        .filter((d) => d.data()?.activo !== false)
        .map((d) => d.id);

      if (adminUids.length > 0) {
        const codigoTexto = errorMeta.code !== undefined ? String(errorMeta.code) : 'desconocido';
        const titulo = esBilling
          ? `WhatsApp: error billing Meta (cod ${codigoTexto})`
          : `WhatsApp: error Meta (cod ${codigoTexto})`;
        const mensajeNotif = (errorMeta.mensaje ?? 'sin detalle').substring(
          0,
          200,
        );

        // Emitir cada tipo como literal explícito en el `add` payload — el
        // cazador P-010 detecta `tipo: '<v>'` literal pero NO `tipo: tipoVar`.
        // Refactor más verboso a propósito para mantener trazabilidad del
        // emisor desde el catálogo TipoNotificacion (src/types/index.ts).
        const resultados = await Promise.allSettled(
          adminUids.map((uid) =>
            esBilling
              ? db.collection('notificaciones').add(
                  stripUndefinedDeep({
                    userId: uid,
                    tipo: 'whatsapp_billing_error',
                    titulo,
                    mensaje: mensajeNotif,
                    severidad,
                    codigoMeta: errorMeta.code ?? null,
                    leida: false,
                    createdAt: FieldValue.serverTimestamp(),
                  }),
                )
              : db.collection('notificaciones').add(
                  stripUndefinedDeep({
                    userId: uid,
                    tipo: 'whatsapp_meta_error',
                    titulo,
                    mensaje: mensajeNotif,
                    severidad,
                    codigoMeta: errorMeta.code ?? null,
                    leida: false,
                    createdAt: FieldValue.serverTimestamp(),
                  }),
                ),
          ),
        );

        const okCount = resultados.filter((r) => r.status === 'fulfilled').length;
        notificacionEnviada = okCount > 0;

        if (okCount < adminUids.length) {
          console.warn(
            `${LOG_PREFIX} [META_ERROR_NOTIF_PARCIAL] ` +
              `intentos=${adminUids.length} ok=${okCount}`,
          );
        }
      }
    } catch (err) {
      const m = err instanceof Error ? err.message.substring(0, 200) : 'unknown';
      console.warn(`${LOG_PREFIX} [META_ERROR_NOTIF_FAIL] ${m}`);
    }
  }

  return { esBilling, severidad, notificacionEnviada };
}
