/**
 * Envío saliente de WhatsApp Cloud API (Meta).
 *
 * SPRINT-WA-2. Arquitectura: docs/MODULO_WHATSAPP.md sección 3.
 *
 * Decisiones firmes aplicadas:
 *  - D1=D sticky por conversación: el body POST puede traer
 *    `phoneNumberIdOverride`; si no, se usa
 *    `whatsapp_conversaciones/{wa_id}.ultimoPhoneNumberId` como default;
 *    si no hay conversación, se usa `process.env.META_PHONE_NUMBER_ID`.
 *  - D6=C roles autorizados: `['administrador', 'coordinadora',
 *    'secretaria', 'operaria']`. Técnico/ayudante → 403.
 *  - D8=A opt-out automático: rechazar envío si `wa_id` está en
 *    `whatsapp_config/sistema.optOuts[]` O si `clientes` tiene un doc con
 *    ese `telefonoNormalizado` y `optOutMarketing == true`.
 *
 * Convenciones críticas (NO violar — disparan cazadores P-016, P-017, P-018):
 *  - body se parsea defensivamente (string|object|null); `@vercel/node`
 *    auto-parsea `application/json` pero el endpoint tolera ambas formas.
 *    NO usar `export const config = { api: {...} }` — esa sintaxis es del
 *    Next.js Pages Router y NO aplica en `@vercel/node`. Ver gotcha CLAUDE.md.
 *  - Idempotency: tempId pre-Meta + `runTransaction` + `tx.get` antes del
 *    `tx.set` en `whatsapp_mensajes_outbox` (defensa contra retries del
 *    cliente o re-envíos por timeout de Meta).
 *  - Ventana 24h: si `tipo === 'texto_libre'`, validar que la conversación
 *    tenga `ultimoMensajeEntrante.timestamp` con <24h de antigüedad.
 *
 * Restricciones:
 *  - NO validar plantillas contra cache `whatsapp_plantillas` (WA-5 lo hará).
 *  - NO emitir UI (WA-3).
 *
 * Idempotency cliente:
 *  - Si POST B llega con mismo `tempId` mientras POST A está en vuelo a
 *    Meta, B recibe { ok: true, idempotent: true, outboxId, estado: 'queued',
 *    wamid: null }. La UI debe distinguir `estado: 'queued'` de `estado:
 *    'sent'` y, si queued, hacer polling corto al outbox o esperar al
 *    callback de status para resolver. NUNCA asumir que `idempotent: true`
 *    significa éxito definitivo.
 *
 * PII en logs:
 *  - NUNCA loggear body completo, `texto`, ni `wa_id` completo.
 *  - OK loggear: `wamid`, `wa_id` truncado, `tipo`, `phoneNumberId`,
 *    contadores, branches del flow.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore } from '../_lib/firebaseAdmin.js';
import { manejarErrorMeta } from '../_lib/manejarErrorMeta.js';
import {
  normalizarWaIdRd,
  obtenerPhoneNumberIdsAllowlist,
  stripUndefinedDeep,
  truncarWaIdParaLog,
} from '../_lib/whatsappWebhook.js';

const LOG_PREFIX = '[whatsapp/send]';

/**
 * URL del logo público usado como fallback del componente `header IMAGE`
 * cuando una plantilla HSM lo requiere y el caller NO pasa `headerImageUrl`
 * explícito. Las plantillas activas en WABA están configuradas con header
 * IMAGE para mantener aspecto empresarial (decisión Jorge 2026-05-19).
 *
 * Si en el futuro el dominio cambia, actualizar esta constante. Domino
 * confiable público (no expira, sin token).
 */
const DEFAULT_HEADER_IMAGE_URL = 'https://www.misterservicerd.com/logo-full.png';

/** Roles autorizados a enviar mensajes salientes (D6=C). */
const ROLES_AUTORIZADOS = new Set<string>([
  'administrador',
  'coordinadora',
  'secretaria',
  'operaria',
]);

/** Regex de validación del tempId de idempotency (P-017). */
const TEMP_ID_REGEX = /^[A-Za-z0-9_-]{16,32}$/;

/**
 * Máximo de reintentos al hacer fetch a Meta cuando responde 429.
 *
 * Vercel Hobby plan tiene timeout default de 10s. Worst-case 5 intentos con
 * backoff exponencial (1+2+4+8+16=~31s) excede ese límite — el handler muere
 * con outbox en `queued` aunque Meta podría haber procesado el último intento.
 * Con MAX=3 (~1+2+4=7s + procesamiento ≈ 9s), queda dentro del budget Hobby.
 * Si migramos a Pro (60s timeout), elevar a 5.
 */
const MAX_INTENTOS_META = 3;

/**
 * Caps diarios de envío por rol (defaults). Override por doc
 * `config/rate_limits.whatsapp_send.{rol}`. Patrón replicado de
 * `api/ai/chat.ts` (security audit WA-2 ALTA #1).
 */
const RATE_LIMITS_WA_DEFAULTS: Record<string, number> = {
  administrador: 500,
  coordinadora: 500,
  secretaria: 300,
  operaria: 300,
  default: 100,
};

/**
 * Helper centralizado para escribir audit log. Best-effort: si falla, loggea
 * warn sin PII pero NO bloquea la respuesta del endpoint.
 *
 * Llamado desde TODOS los paths de rechazo (rol no autorizado, empleado
 * deshabilitado, opt-out, window-cerrada, allowlist, fallo Meta) Y desde el
 * path exitoso (envío OK). Sin esto, abuso interno no es detectable hasta
 * que un cliente externo se queja (security audit WA-2 MEDIA #2).
 */
async function escribirAuditoriaSend(
  db: ReturnType<typeof getAdminFirestore>,
  params: {
    accion: string;
    resultado: 'ok' | 'rechazado' | 'fallo_meta';
    solicitanteUid: string;
    solicitanteEmail: string | null;
    wa_id?: string;
    tipo?: string;
    plantillaNombre?: string;
    phoneNumberId?: string;
    outboxId?: string;
    wamid?: string;
    ordenId?: string;
    motivo?: string;
    detalle?: unknown;
  },
): Promise<void> {
  try {
    const payload: Record<string, unknown> = {
      accion: params.accion,
      resultado: params.resultado,
      solicitanteUid: params.solicitanteUid,
      solicitanteEmail: params.solicitanteEmail,
      objetivoTipo: 'cliente_whatsapp',
      objetivoWaId: params.wa_id ? truncarWaIdParaLog(params.wa_id) : null,
      tipo: params.tipo ?? null,
      plantillaNombre: params.plantillaNombre ?? null,
      phoneNumberId: params.phoneNumberId ?? null,
      outboxId: params.outboxId ?? null,
      wamid: params.wamid ?? null,
      ordenId: params.ordenId ?? null,
      motivo: params.motivo ?? null,
      detalle: params.detalle ?? null,
      timestamp: FieldValue.serverTimestamp(),
    };
    await db.collection('auditoria_admin').add(stripUndefinedDeep(payload));
  } catch (err) {
    const m = err instanceof Error ? err.message.substring(0, 200) : 'unknown';
    console.warn(`${LOG_PREFIX} audit log falló (no bloquea): ${m}`);
  }
}

/** Tipos soportados por este endpoint. */
type TipoEnvio = 'texto_libre' | 'plantilla' | 'media';

interface PlantillaInput {
  nombre: string;
  idioma: string;
  variables: string[];
  /**
   * URL de la imagen del header (opcional). Si la plantilla en WABA tiene
   * configurado header IMAGE pero el caller NO la pasa, se usa
   * DEFAULT_HEADER_IMAGE_URL como fallback empresarial. Debe ser HTTPS.
   * Si se pasa string no válido (no `https://`) se ignora silenciosamente.
   */
  headerImageUrl?: string;
}

interface MediaInput {
  storageUrl: string;
  mimeType: string;
  caption?: string;
}

interface SendBody {
  wa_id: string;
  tipo: TipoEnvio;
  texto?: string;
  plantilla?: PlantillaInput;
  media?: MediaInput;
  phoneNumberIdOverride?: string;
  ordenId?: string;
  tempId: string;
}

interface PayloadMeta {
  messaging_product: 'whatsapp';
  recipient_type: 'individual';
  to: string;
  type: string;
  text?: { body: string };
  template?: {
    name: string;
    language: { code: string };
    components?: Array<
      | {
          type: 'header';
          parameters: Array<{ type: 'image'; image: { link: string } }>;
        }
      | {
          type: 'body';
          parameters: Array<{ type: 'text'; text: string }>;
        }
    >;
  };
  image?: { link: string; caption?: string };
  audio?: { link: string };
  video?: { link: string; caption?: string };
  document?: { link: string; caption?: string };
}

interface ResultadoMeta {
  wamid?: string;
  error?: Record<string, unknown>;
}

/**
 * Construye el payload exacto que Meta Graph API espera.
 *
 * Defensa: el caller debe haber validado `tipo` y los sub-objetos
 * (plantilla/media) antes de invocar — si algún campo requerido falta,
 * lanza `Error` (caller debe atrapar y responder 400 al cliente original).
 *
 * Plantillas con header IMAGE (SPRINT-WA-2-HEADER-IMAGE 2026-05-19):
 *  - Toda plantilla `type='plantilla'` emite un componente `header` con
 *    `parameters: [{ type: 'image', image: { link } }]` antes del body.
 *  - Si el caller pasa `plantilla.headerImageUrl` (HTTPS) → usa esa URL.
 *  - Si NO pasa o no es HTTPS → fallback a `DEFAULT_HEADER_IMAGE_URL`
 *    (logo Mister Service público).
 *  - Si una plantilla específica NO tiene header configurado en WABA,
 *    Meta ignora el componente extra (sin error). Si tiene header IMAGE
 *    pero el endpoint no lo emite, Meta devuelve `132012 — header
 *    Format mismatch, expected IMAGE, received UNKNOWN` (antiprecedente
 *    SPRINT-WA-2-HEADER-IMAGE).
 */
function construirPayloadMeta(input: {
  wa_id: string;
  tipo: TipoEnvio;
  texto?: string;
  plantilla?: PlantillaInput;
  media?: MediaInput;
}): PayloadMeta {
  // RD prefix +1 (los wa_id internos son 10 dígitos sin código país).
  const to = `1${input.wa_id}`;

  const base = {
    messaging_product: 'whatsapp' as const,
    recipient_type: 'individual' as const,
    to,
  };

  if (input.tipo === 'texto_libre') {
    if (typeof input.texto !== 'string' || input.texto.length === 0) {
      throw new Error('texto-requerido-en-construir-payload');
    }
    return { ...base, type: 'text', text: { body: input.texto } };
  }

  if (input.tipo === 'plantilla') {
    if (!input.plantilla) {
      throw new Error('plantilla-requerida-en-construir-payload');
    }
    // Header IMAGE: las plantillas WABA con apariencia empresarial vienen
    // configuradas con header tipo IMAGE (Jorge 2026-05-19). Si el caller
    // no pasa URL explícita, fallback al logo público. Sin este header
    // Meta tira 132012 "header: Format mismatch, expected IMAGE,
    // received UNKNOWN" en toda plantilla con header IMAGE configurado.
    const headerUrl =
      input.plantilla.headerImageUrl &&
      input.plantilla.headerImageUrl.startsWith('https://')
        ? input.plantilla.headerImageUrl
        : DEFAULT_HEADER_IMAGE_URL;
    const componentes: NonNullable<PayloadMeta['template']>['components'] = [];
    componentes.push({
      type: 'header',
      parameters: [{ type: 'image', image: { link: headerUrl } }],
    });
    if (input.plantilla.variables.length > 0) {
      componentes.push({
        type: 'body',
        parameters: input.plantilla.variables.map((v) => ({
          type: 'text' as const,
          text: v,
        })),
      });
    }
    const tpl: PayloadMeta['template'] = {
      name: input.plantilla.nombre,
      language: { code: input.plantilla.idioma },
      components: componentes,
    };
    return { ...base, type: 'template', template: tpl };
  }

  if (input.tipo === 'media') {
    if (!input.media) {
      throw new Error('media-requerida-en-construir-payload');
    }
    const mime = input.media.mimeType;
    const tipoMedia: 'image' | 'audio' | 'video' | 'document' = mime.startsWith(
      'image/',
    )
      ? 'image'
      : mime.startsWith('audio/')
      ? 'audio'
      : mime.startsWith('video/')
      ? 'video'
      : 'document';

    const payload: PayloadMeta = { ...base, type: tipoMedia };
    if (tipoMedia === 'image') {
      const obj: { link: string; caption?: string } = {
        link: input.media.storageUrl,
      };
      if (input.media.caption !== undefined) obj.caption = input.media.caption;
      payload.image = obj;
    } else if (tipoMedia === 'audio') {
      payload.audio = { link: input.media.storageUrl };
    } else if (tipoMedia === 'video') {
      const obj: { link: string; caption?: string } = {
        link: input.media.storageUrl,
      };
      if (input.media.caption !== undefined) obj.caption = input.media.caption;
      payload.video = obj;
    } else {
      const obj: { link: string; caption?: string } = {
        link: input.media.storageUrl,
      };
      if (input.media.caption !== undefined) obj.caption = input.media.caption;
      payload.document = obj;
    }
    return payload;
  }

  throw new Error(`tipo-no-soportado: ${String((input as { tipo?: unknown }).tipo)}`);
}

/**
 * Hace POST a Meta con backoff exponencial + jitter para status 429
 * (rate-limit). Retorna `{ wamid }` en éxito o `{ error }` en fallo
 * persistente (incluye 4xx no-429, 5xx, errores de red).
 *
 * Cap de reintentos: `MAX_INTENTOS_META`. El backoff usa base
 * `2^(intento-1) * 1000ms` + jitter aleatorio de hasta 50% extra, capeado
 * a 16s por intento.
 */
async function enviarAMetaConBackoff(
  metaUrl: string,
  metaToken: string,
  payload: PayloadMeta,
): Promise<{ resultado: ResultadoMeta; intentos: number }> {
  let intentos = 0;
  const resultado: ResultadoMeta = {};

  while (intentos < MAX_INTENTOS_META) {
    intentos++;
    try {
      const r = await fetch(metaUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${metaToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (r.status === 429) {
        if (intentos >= MAX_INTENTOS_META) {
          resultado.error = { mensaje: 'meta-429-cap-de-reintentos', status: 429 };
          break;
        }
        const baseMs = Math.pow(2, intentos - 1) * 1000;
        const jitterMs = Math.random() * baseMs * 0.5;
        const waitMs = Math.min(baseMs + jitterMs, 16_000);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }

      const respBody = (await r.json().catch(() => ({}))) as Record<string, unknown>;
      if (r.ok) {
        const messages = respBody.messages as Array<{ id?: string }> | undefined;
        const wamid = messages?.[0]?.id;
        if (typeof wamid === 'string' && wamid.length > 0) {
          resultado.wamid = wamid;
        } else {
          resultado.error = { mensaje: 'meta-respuesta-sin-wamid', status: r.status };
        }
        break;
      }

      // Error no-429 desde Meta: extraer info y cortar (no reintentamos).
      const metaError = respBody.error as Record<string, unknown> | undefined;
      resultado.error = metaError ?? { mensaje: `meta-${r.status}`, status: r.status };
      break;
    } catch (err) {
      const mensaje =
        err instanceof Error ? err.message.substring(0, 200) : 'fetch-failed';
      resultado.error = { mensaje };
      break;
    }
  }

  return { resultado, intentos };
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  // 1) CORS preflight: este endpoint es same-origin (frontend Vercel) pero
  //    respondemos OPTIONS por defensa.
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  // 2) Method check.
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method-not-allowed' });
    return;
  }

  // 3) Auth — Firebase ID token verify (patrón api/admin/crear-usuario.ts).
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'no-token' });
    return;
  }
  const idToken = authHeader.substring(7).trim();
  if (!idToken) {
    res.status(401).json({ error: 'no-token' });
    return;
  }

  let auth: ReturnType<typeof getAdminAuth>;
  let db: ReturnType<typeof getAdminFirestore>;
  try {
    auth = getAdminAuth();
    db = getAdminFirestore();
  } catch (err) {
    const m = err instanceof Error ? err.message.substring(0, 200) : 'unknown';
    console.error(`${LOG_PREFIX} Admin SDK init falló: ${m}`);
    res.status(500).json({ error: 'admin-sdk-init-failed' });
    return;
  }

  let decodedToken: Awaited<ReturnType<typeof auth.verifyIdToken>>;
  // @safe-meta-catch: validación de token Firebase Auth del cliente, no error Meta.
  try {
    decodedToken = await auth.verifyIdToken(idToken);
  } catch {
    res.status(401).json({ error: 'invalid-token' });
    return;
  }

  const callerUid = decodedToken.uid;
  const callerEmail: string | null = decodedToken.email ?? null;

  // 4) Role check — cascada usuarios/{uid} → personal where uid==.
  //    Solo roles autorizados (D6=C). Empleado deshabilitado (activo:false)
  //    rechazado aunque su Firebase Auth siga vivo (security audit WA-2 BLOCK 3).
  let rol: string | null = null;
  let perfilNombre = '';
  let activo = true;

  try {
    const usuarioSnap = await db.collection('usuarios').doc(callerUid).get();
    if (usuarioSnap.exists) {
      const u = usuarioSnap.data() as Record<string, unknown> | undefined;
      if (u) {
        rol = typeof u.rol === 'string' ? u.rol : null;
        perfilNombre = typeof u.nombre === 'string' ? u.nombre : '';
        if (u.activo === false) activo = false;
      }
    } else {
      const personalSnap = await db
        .collection('personal')
        .where('uid', '==', callerUid)
        .limit(1)
        .get();
      if (!personalSnap.empty) {
        const p = personalSnap.docs[0].data() as Record<string, unknown>;
        rol = typeof p.rol === 'string' ? p.rol : null;
        perfilNombre = typeof p.nombre === 'string' ? p.nombre : '';
        if (p.activo === false) activo = false;
      }
    }
  } catch (err) {
    const m = err instanceof Error ? err.message.substring(0, 200) : 'unknown';
    console.error(`${LOG_PREFIX} role lookup falló: ${m}`);
    res.status(500).json({ error: 'role-lookup-failed' });
    return;
  }

  if (!activo) {
    await escribirAuditoriaSend(db, {
      accion: 'enviar_whatsapp',
      resultado: 'rechazado',
      solicitanteUid: callerUid,
      solicitanteEmail: callerEmail,
      motivo: 'empleado-deshabilitado',
    });
    res.status(403).json({ error: 'empleado-deshabilitado' });
    return;
  }

  if (!rol || !ROLES_AUTORIZADOS.has(rol)) {
    await escribirAuditoriaSend(db, {
      accion: 'enviar_whatsapp',
      resultado: 'rechazado',
      solicitanteUid: callerUid,
      solicitanteEmail: callerEmail,
      motivo: 'rol-no-autorizado',
      detalle: { rol },
    });
    res.status(403).json({ error: 'rol-no-autorizado', rol });
    return;
  }

  // 4.5) Rate limit por uid (D6 control de cost amplification).
  // Counter atómico vía runTransaction sobre rate_limits/{uid}_whatsapp_send_{YYYY-MM-DD}.
  // Cap por rol leído de config/rate_limits.whatsapp_send.{rol} con fallback a defaults.
  // Si el caller hace 1000 POSTs/seg, esto los frena en cap por día (defense contra
  // cost amplification de Meta + Firestore + Vercel). Patrón replicado de api/ai/chat.ts:262.
  let capDia = RATE_LIMITS_WA_DEFAULTS[rol] ?? RATE_LIMITS_WA_DEFAULTS.default;
  try {
    const configRateSnap = await db.collection('config').doc('rate_limits').get();
    if (configRateSnap.exists) {
      const waCaps = configRateSnap.data()?.whatsapp_send;
      if (waCaps && typeof waCaps === 'object') {
        const capRol = (waCaps as Record<string, unknown>)[rol];
        if (typeof capRol === 'number' && capRol > 0) {
          capDia = capRol;
        } else {
          const capDefault = (waCaps as Record<string, unknown>).default;
          if (typeof capDefault === 'number' && capDefault > 0) {
            capDia = capDefault;
          }
        }
      }
    }
  } catch (err) {
    const m = err instanceof Error ? err.message.substring(0, 200) : 'unknown';
    console.warn(`${LOG_PREFIX} config/rate_limits lookup falló: ${m}`);
  }

  const fechaHoy = new Date().toISOString().slice(0, 10);
  const rateLimitRef = db.collection('rate_limits').doc(`${callerUid}_whatsapp_send_${fechaHoy}`);
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(rateLimitRef);
      const current = snap.exists ? Number(snap.data()?.count) || 0 : 0;
      if (current >= capDia) {
        throw new Error('rate-limit');
      }
      tx.set(
        rateLimitRef,
        {
          uid: callerUid,
          fecha: fechaHoy,
          count: current + 1,
          cap: capDia,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'rate-limit') {
      await escribirAuditoriaSend(db, {
        accion: 'enviar_whatsapp',
        resultado: 'rechazado',
        solicitanteUid: callerUid,
        solicitanteEmail: callerEmail,
        motivo: 'rate-limit-diario',
        detalle: { cap: capDia },
      });
      res.status(429).json({
        error: 'rate-limit-diario',
        detalle: `Alcanzaste el límite de ${capDia} envíos WhatsApp hoy. Reintentá mañana o pedile al admin que aumente tu cap.`,
      });
      return;
    }
    const m = err instanceof Error ? err.message.substring(0, 200) : 'unknown';
    console.error(`${LOG_PREFIX} rate limit tx falló: ${m}`);
    res.status(500).json({ error: 'rate-limit-tx-failed' });
    return;
  }

  // 5) Validar body. `@vercel/node` auto-parsea `application/json` a objeto,
  //    pero algunos clientes mandan string o sin Content-Type — parseamos
  //    defensivamente. Patrón ya usado en `api/admin/crear-usuario.ts:140`.
  //    SPRINT-WA-2-FIX-BODYPARSER: la sintaxis `export const config = { api:
  //    { bodyParser: true } }` (Next.js Pages Router) NO aplica acá; el
  //    intento previo dejó el endpoint rechazando todo POST con HTTP 400.
  let body: Record<string, unknown>;
  try {
    const raw = req.body;
    if (raw == null) {
      body = {};
    } else if (typeof raw === 'string') {
      body = raw.trim().length > 0 ? (JSON.parse(raw) as Record<string, unknown>) : {};
    } else if (typeof raw === 'object') {
      body = raw as Record<string, unknown>;
    } else {
      res.status(400).json({ error: 'body-invalido', detalle: `tipo=${typeof raw}` });
      return;
    }
    // @safe-meta-catch: parseo JSON local del request body antes de cualquier
    // llamada Meta — no es error estructurado de Graph API.
  } catch (err) {
    const m = err instanceof Error ? err.message.substring(0, 200) : 'unknown';
    res.status(400).json({ error: 'body-invalido', detalle: `json-parse-failed: ${m}` });
    return;
  }

  const wa_id = normalizarWaIdRd(String(body.wa_id ?? ''));
  if (!wa_id) {
    res.status(400).json({ error: 'wa_id-invalido' });
    return;
  }

  const tipoRaw = body.tipo;
  if (
    tipoRaw !== 'texto_libre' &&
    tipoRaw !== 'plantilla' &&
    tipoRaw !== 'media'
  ) {
    res.status(400).json({ error: 'tipo-invalido' });
    return;
  }
  const tipo: TipoEnvio = tipoRaw;

  const tempId = String(body.tempId ?? '');
  if (!TEMP_ID_REGEX.test(tempId)) {
    res.status(400).json({
      error: 'tempId-invalido',
      detalle: 'regex ^[A-Za-z0-9_-]{16,32}$',
    });
    return;
  }

  // Narrowing de campos opcionales del body.
  const ordenId =
    typeof body.ordenId === 'string' && body.ordenId.length > 0
      ? body.ordenId
      : undefined;
  const phoneNumberIdOverride =
    typeof body.phoneNumberIdOverride === 'string' &&
    body.phoneNumberIdOverride.length > 0
      ? body.phoneNumberIdOverride
      : undefined;
  const texto = typeof body.texto === 'string' ? body.texto : undefined;

  let plantilla: PlantillaInput | undefined;
  if (body.plantilla && typeof body.plantilla === 'object') {
    const p = body.plantilla as Record<string, unknown>;
    if (
      typeof p.nombre === 'string' &&
      typeof p.idioma === 'string' &&
      Array.isArray(p.variables)
    ) {
      const variables = p.variables.filter(
        (v): v is string => typeof v === 'string',
      );
      // headerImageUrl es opcional. Validamos forma básica (HTTPS) —
      // si NO cumple, ignoramos silenciosamente (el fallback al logo
      // público de DEFAULT_HEADER_IMAGE_URL aplica en construirPayloadMeta).
      const headerImageUrl =
        typeof p.headerImageUrl === 'string' &&
        p.headerImageUrl.startsWith('https://')
          ? p.headerImageUrl
          : undefined;
      plantilla = { nombre: p.nombre, idioma: p.idioma, variables, headerImageUrl };
    }
  }

  let media: MediaInput | undefined;
  if (body.media && typeof body.media === 'object') {
    const m = body.media as Record<string, unknown>;
    if (typeof m.storageUrl === 'string' && typeof m.mimeType === 'string') {
      media = { storageUrl: m.storageUrl, mimeType: m.mimeType };
      if (typeof m.caption === 'string') media.caption = m.caption;
    }
  }

  // 6) Determinar phoneNumberId destino (D1=D sticky).
  //    Override > conversación.ultimoPhoneNumberId > env default.
  const allowlistPhones = obtenerPhoneNumberIdsAllowlist();
  let phoneNumberId = '';
  if (phoneNumberIdOverride) {
    phoneNumberId = phoneNumberIdOverride;
  } else {
    try {
      const convSnap = await db
        .collection('whatsapp_conversaciones')
        .doc(wa_id)
        .get();
      if (convSnap.exists) {
        const conv = convSnap.data() as Record<string, unknown> | undefined;
        const sticky =
          conv && typeof conv.ultimoPhoneNumberId === 'string'
            ? conv.ultimoPhoneNumberId
            : '';
        if (sticky) phoneNumberId = sticky;
      }
    } catch (err) {
      const m = err instanceof Error ? err.message.substring(0, 200) : 'unknown';
      console.warn(
        `${LOG_PREFIX} lookup conversación sticky falló (sigo con env default): ${m}`,
      );
    }
  }
  if (!phoneNumberId) {
    phoneNumberId = process.env.META_PHONE_NUMBER_ID ?? '';
  }
  if (!phoneNumberId) {
    res.status(500).json({ error: 'phone-number-id-no-configurado' });
    return;
  }

  // Defense-in-depth: si hay allowlist configurada, el phoneNumberId resuelto
  // debe estar en ella. Bloquea casos de override malicioso o conversación
  // legacy con phoneNumberId de cuenta WABA distinta.
  if (allowlistPhones && !allowlistPhones.has(phoneNumberId)) {
    await escribirAuditoriaSend(db, {
      accion: 'enviar_whatsapp',
      resultado: 'rechazado',
      solicitanteUid: callerUid,
      solicitanteEmail: callerEmail,
      wa_id,
      tipo,
      phoneNumberId,
      ordenId,
      motivo: 'phone-number-id-no-permitido',
    });
    res
      .status(403)
      .json({ error: 'phone-number-id-no-permitido', phoneNumberId });
    return;
  }

  // 7) Opt-out check (D8=A doble fuente).
  //    BAJA #4 (security audit WA-2): fail-closed — si el lookup explota,
  //    rechazar el envío. La política previa (warn + continuar) permitía
  //    bypass silencioso de opt-out cuando Firestore tenía un blip transient.
  try {
    const configSnap = await db
      .collection('whatsapp_config')
      .doc('sistema')
      .get();
    if (configSnap.exists) {
      const cfg = configSnap.data() as Record<string, unknown> | undefined;
      const optOuts = Array.isArray(cfg?.optOuts) ? (cfg!.optOuts as unknown[]) : [];
      if (optOuts.some((v) => typeof v === 'string' && v === wa_id)) {
        await escribirAuditoriaSend(db, {
          accion: 'enviar_whatsapp',
          resultado: 'rechazado',
          solicitanteUid: callerUid,
          solicitanteEmail: callerEmail,
          wa_id,
          tipo,
          ordenId,
          motivo: 'cliente-opt-out',
          detalle: { fuente: 'whatsapp_config' },
        });
        res
          .status(422)
          .json({ error: 'cliente-opt-out', fuente: 'whatsapp_config' });
        return;
      }
    }
  } catch (err) {
    const m = err instanceof Error ? err.message.substring(0, 200) : 'unknown';
    console.error(`${LOG_PREFIX} lookup whatsapp_config opt-out falló: ${m}`);
    await escribirAuditoriaSend(db, {
      accion: 'enviar_whatsapp',
      resultado: 'rechazado',
      solicitanteUid: callerUid,
      solicitanteEmail: callerEmail,
      wa_id,
      motivo: 'opt-out-check-failed',
      detalle: { fuente: 'whatsapp_config', mensaje: m },
    });
    res.status(500).json({ error: 'opt-out-check-failed' });
    return;
  }

  // BLOCK 2 fix (security audit WA-2): la query con 2 wheres
  // (telefonoNormalizado + optOutMarketing) requiere índice compuesto NO
  // declarado en firestore.indexes.json — si falla en producción, el catch
  // loggea warn pero el envío sigue → bypass silencioso de D8=A.
  // Solución: query simple por telefonoNormalizado (índice single-field
  // auto-creado por Firestore) y filtrar optOutMarketing en memoria.
  // BAJA #4 (security audit WA-2): fail-closed también acá.
  try {
    const clientesSnap = await db
      .collection('clientes')
      .where('telefonoNormalizado', '==', wa_id)
      .limit(5)
      .get();
    if (
      !clientesSnap.empty &&
      clientesSnap.docs.some((d) => d.data().optOutMarketing === true)
    ) {
      await escribirAuditoriaSend(db, {
        accion: 'enviar_whatsapp',
        resultado: 'rechazado',
        solicitanteUid: callerUid,
        solicitanteEmail: callerEmail,
        wa_id,
        tipo,
        ordenId,
        motivo: 'cliente-opt-out',
        detalle: { fuente: 'clientes' },
      });
      res.status(422).json({ error: 'cliente-opt-out', fuente: 'clientes' });
      return;
    }
  } catch (err) {
    const m = err instanceof Error ? err.message.substring(0, 200) : 'unknown';
    console.error(`${LOG_PREFIX} lookup clientes opt-out falló: ${m}`);
    await escribirAuditoriaSend(db, {
      accion: 'enviar_whatsapp',
      resultado: 'rechazado',
      solicitanteUid: callerUid,
      solicitanteEmail: callerEmail,
      wa_id,
      motivo: 'opt-out-check-failed',
      detalle: { fuente: 'clientes', mensaje: m },
    });
    res.status(500).json({ error: 'opt-out-check-failed' });
    return;
  }

  // 8) Ventana 24h check (sólo `tipo === 'texto_libre'`).
  //    P-018: si Meta cerró la ventana, sólo se aceptan plantillas HSM.
  if (tipo === 'texto_libre') {
    if (typeof texto !== 'string' || texto.length === 0) {
      res.status(400).json({ error: 'texto-requerido' });
      return;
    }
    try {
      const convSnap = await db
        .collection('whatsapp_conversaciones')
        .doc(wa_id)
        .get();
      if (!convSnap.exists) {
        await escribirAuditoriaSend(db, {
          accion: 'enviar_whatsapp',
          resultado: 'rechazado',
          solicitanteUid: callerUid,
          solicitanteEmail: callerEmail,
          wa_id,
          tipo,
          ordenId,
          motivo: 'window-cerrada',
          detalle: { razon: 'no-hay-conversacion-previa' },
        });
        res.status(422).json({
          error: 'window-cerrada',
          detalle: 'no hay conversacion previa; usar plantilla HSM',
        });
        return;
      }
      const conv = convSnap.data() as Record<string, unknown> | undefined;
      const ultimoEntrante = conv?.ultimoMensajeEntrante as
        | Record<string, unknown>
        | undefined;
      const tsRaw = ultimoEntrante?.timestamp;
      if (!ultimoEntrante || tsRaw === undefined || tsRaw === null) {
        await escribirAuditoriaSend(db, {
          accion: 'enviar_whatsapp',
          resultado: 'rechazado',
          solicitanteUid: callerUid,
          solicitanteEmail: callerEmail,
          wa_id,
          tipo,
          ordenId,
          motivo: 'window-cerrada',
          detalle: { razon: 'sin-mensaje-entrante-previo' },
        });
        res.status(422).json({
          error: 'window-cerrada',
          detalle: 'sin mensaje entrante previo; usar plantilla HSM',
        });
        return;
      }
      let tsMs: number | null = null;
      const tsObj = tsRaw as { toMillis?: () => number };
      if (typeof tsObj.toMillis === 'function') {
        tsMs = tsObj.toMillis();
      } else if (tsRaw instanceof Date) {
        tsMs = tsRaw.getTime();
      } else if (typeof tsRaw === 'string' || typeof tsRaw === 'number') {
        const d = new Date(tsRaw);
        tsMs = Number.isFinite(d.getTime()) ? d.getTime() : null;
      }
      if (tsMs === null) {
        await escribirAuditoriaSend(db, {
          accion: 'enviar_whatsapp',
          resultado: 'rechazado',
          solicitanteUid: callerUid,
          solicitanteEmail: callerEmail,
          wa_id,
          tipo,
          ordenId,
          motivo: 'window-cerrada',
          detalle: { razon: 'timestamp-no-parseable' },
        });
        res.status(422).json({
          error: 'window-cerrada',
          detalle: 'timestamp ultimo entrante no parseable; usar plantilla HSM',
        });
        return;
      }
      const VENTANA_MS = 24 * 60 * 60 * 1000;
      if (Date.now() - tsMs > VENTANA_MS) {
        await escribirAuditoriaSend(db, {
          accion: 'enviar_whatsapp',
          resultado: 'rechazado',
          solicitanteUid: callerUid,
          solicitanteEmail: callerEmail,
          wa_id,
          tipo,
          ordenId,
          motivo: 'window-cerrada',
          detalle: {
            razon: 'mas-de-24h',
            ultimoEntranteAt: new Date(tsMs).toISOString(),
          },
        });
        res.status(422).json({
          error: 'window-cerrada',
          detalle: 'ultimo mensaje entrante hace mas de 24h; usar plantilla HSM',
          ultimoEntranteAt: new Date(tsMs).toISOString(),
        });
        return;
      }
    } catch (err) {
      const m = err instanceof Error ? err.message.substring(0, 200) : 'unknown';
      console.error(`${LOG_PREFIX} ventana 24h lookup falló: ${m}`);
      res.status(500).json({ error: 'ventana-lookup-failed' });
      return;
    }
  }

  // 9) Validar plantilla si aplica.
  if (tipo === 'plantilla') {
    if (!plantilla || !plantilla.nombre || !plantilla.idioma) {
      res.status(400).json({ error: 'plantilla-shape-invalido' });
      return;
    }
    // Nota: NO validamos contra cache `whatsapp_plantillas`. WA-5 implementará
    // el cache + validación de estado APPROVED + cantidad de variables matchea.
  }

  // 10) Validar media si aplica.
  if (tipo === 'media') {
    if (!media || !media.storageUrl) {
      res.status(400).json({ error: 'media-storageUrl-requerido' });
      return;
    }
    if (!media.mimeType) {
      res.status(400).json({ error: 'media-mimeType-requerido' });
      return;
    }
  }

  // 11) Idempotency (P-017): tempId ya usado?
  //
  //     BLOCK 1 fix (security audit WA-2): usar tempId COMO doc id en lugar
  //     de auto-id + query. El patrón previo `tx.get(query)` + `tx.set(doc())`
  //     NO previene duplicados porque dos POSTs paralelos crean docs DISTINTOS
  //     (auto-ids únicos) — Firestore optimistic locking opera a nivel de
  //     documento, no de query. Usando `doc(tempId)`, ambos POSTs leen el
  //     MISMO ref y la transacción garantiza atomicidad.
  const outboxColl = db.collection('whatsapp_mensajes_outbox');
  const outboxRef = outboxColl.doc(tempId);
  let yaExistente = false;
  let estadoExistente: string | undefined;
  let wamidExistente: string | null = null;

  try {
    await db.runTransaction(async (tx) => {
      const existingSnap = await tx.get(outboxRef);
      if (existingSnap.exists) {
        const data = existingSnap.data() as Record<string, unknown>;
        estadoExistente =
          typeof data.estado === 'string' ? data.estado : undefined;
        wamidExistente =
          typeof data.wamid === 'string' && data.wamid.length > 0
            ? data.wamid
            : null;
        yaExistente = true;
        return;
      }
      const payload: Record<string, unknown> = {
        id: outboxRef.id,
        tempId,
        wamid: null,
        phoneNumberId,
        wa_id,
        tipo,
        plantilla: plantilla ?? null,
        texto: texto ?? null,
        media: media ?? null,
        estado: 'queued',
        intentosEnvio: 0,
        creadoPor: callerUid,
        creadoPorNombre: perfilNombre,
        ordenId: ordenId ?? null,
        conversacionId: wa_id,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };
      tx.set(outboxRef, stripUndefinedDeep(payload));
    });
  } catch (err) {
    const m = err instanceof Error ? err.message.substring(0, 200) : 'unknown';
    console.error(`${LOG_PREFIX} outbox idempotency tx falló: ${m}`);
    res.status(500).json({ error: 'outbox-tx-failed' });
    return;
  }

  if (yaExistente) {
    // Idempotency hit: el cliente está reenviando el mismo tempId.
    // Devolvemos el estado actual sin llamar a Meta de nuevo.
    console.log(
      `${LOG_PREFIX} idempotent hit | wa=${truncarWaIdParaLog(wa_id)} ` +
        `tipo=${tipo} estado=${estadoExistente ?? 'desconocido'}`,
    );
    res.status(200).json({
      ok: true,
      idempotent: true,
      outboxId: outboxRef.id,
      estado: estadoExistente ?? 'queued',
      wamid: wamidExistente,
    });
    return;
  }

  // 12) Llamar Meta Graph API con backoff 429.
  const apiVersion = process.env.META_API_VERSION ?? 'v21.0';
  const metaUrl = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
  const metaToken = process.env.META_ACCESS_TOKEN;
  if (!metaToken) {
    await outboxRef
      .update(
        stripUndefinedDeep({
          estado: 'failed',
          errorMeta: { mensaje: 'META_ACCESS_TOKEN no configurado' },
          updatedAt: FieldValue.serverTimestamp(),
        }),
      )
      .catch(() => {});
    res.status(500).json({ error: 'meta-token-no-configurado' });
    return;
  }

  let metaPayload: PayloadMeta;
  // @safe-meta-catch: validación local de input (shape de plantilla/media), no error Meta. Outbox queda failed con motivo local.
  try {
    metaPayload = construirPayloadMeta({ wa_id, tipo, texto, plantilla, media });
  } catch (err) {
    const m = err instanceof Error ? err.message.substring(0, 200) : 'unknown';
    await outboxRef
      .update(
        stripUndefinedDeep({
          estado: 'failed',
          errorMeta: { mensaje: `construir-payload: ${m}` },
          updatedAt: FieldValue.serverTimestamp(),
        }),
      )
      .catch(() => {});
    res.status(400).json({ error: 'construir-payload-failed', detalle: m });
    return;
  }

  const { resultado: metaResp, intentos } = await enviarAMetaConBackoff(
    metaUrl,
    metaToken,
    metaPayload,
  );

  // 13) Update outbox con resultado.
  if (metaResp.wamid) {
    // MEDIA #4 (security audit WA-2): si Meta respondió OK pero el update
    // local falla (network blip a Firestore), el outbox queda 'queued' con
    // wamid huérfano. Intentamos 3 veces con backoff lineal antes de devolver.
    // Si finalmente falla, respondemos 502 con un código específico que la UI
    // puede interpretar para mostrar warning "enviado, refrescar estado".
    let updateOk = false;
    let updateErrorMsg = '';
    for (let intentoUpdate = 1; intentoUpdate <= 3; intentoUpdate++) {
      try {
        await outboxRef.update(
          stripUndefinedDeep({
            wamid: metaResp.wamid,
            estado: 'sent',
            intentosEnvio: intentos,
            enviadoEn: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          }),
        );
        updateOk = true;
        break;
      } catch (err) {
        updateErrorMsg = err instanceof Error ? err.message.substring(0, 200) : 'unknown';
        if (intentoUpdate < 3) {
          await new Promise((r) => setTimeout(r, 200 * intentoUpdate));
        }
      }
    }

    if (!updateOk) {
      console.error(`${LOG_PREFIX} outbox update post-Meta falló 3x: ${updateErrorMsg}`);
      await escribirAuditoriaSend(db, {
        accion: 'enviar_whatsapp',
        resultado: 'ok',
        solicitanteUid: callerUid,
        solicitanteEmail: callerEmail,
        wa_id,
        tipo,
        plantillaNombre: plantilla?.nombre,
        phoneNumberId,
        outboxId: outboxRef.id,
        wamid: metaResp.wamid,
        ordenId,
        motivo: 'meta-ok-outbox-update-failed',
        detalle: updateErrorMsg,
      });
      res.status(502).json({
        error: 'meta-ok-outbox-update-failed',
        detalle: 'Mensaje enviado a Meta correctamente pero estado local no actualizado. Refrescar UI.',
        outboxId: outboxRef.id,
        wamid: metaResp.wamid,
      });
      return;
    }

    // 14) Actualizar `whatsapp_conversaciones/{wa_id}.ultimoMensajeSaliente`.
    //     Best-effort: si falla, NO bloquea respuesta al caller.
    try {
      const convRef = db.collection('whatsapp_conversaciones').doc(wa_id);
      const preview = (texto ?? plantilla?.nombre ?? '<media>').substring(0, 80);
      await convRef.set(
        stripUndefinedDeep({
          wa_id,
          ultimoMensajeSaliente: {
            wamid: metaResp.wamid,
            timestamp: new Date(),
            preview,
            tipo,
          },
          ultimoPhoneNumberId: phoneNumberId,
          totalMensajesSalientes: FieldValue.increment(1),
          ultimaActividad: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        }),
        { merge: true },
      );
    } catch (err) {
      const m = err instanceof Error ? err.message.substring(0, 200) : 'unknown';
      console.warn(`${LOG_PREFIX} update conversacion falló (no bloquea): ${m}`);
    }

    // 15) Audit log best-effort vía helper centralizado.
    await escribirAuditoriaSend(db, {
      accion: 'enviar_whatsapp',
      resultado: 'ok',
      solicitanteUid: callerUid,
      solicitanteEmail: callerEmail,
      wa_id,
      tipo,
      plantillaNombre: plantilla?.nombre,
      phoneNumberId,
      outboxId: outboxRef.id,
      wamid: metaResp.wamid,
      ordenId,
    });

    console.log(
      `${LOG_PREFIX} envío OK | wa=${truncarWaIdParaLog(wa_id)} tipo=${tipo} ` +
        `wamid=${metaResp.wamid} intentos=${intentos}`,
    );
    res.status(200).json({
      ok: true,
      outboxId: outboxRef.id,
      wamid: metaResp.wamid,
      estado: 'sent',
      intentos,
    });
    return;
  }

  // Fallo persistente: marcar outbox como failed.
  try {
    await outboxRef.update(
      stripUndefinedDeep({
        estado: 'failed',
        errorMeta: metaResp.error ?? { mensaje: 'unknown' },
        intentosEnvio: intentos,
        falladoEn: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }),
    );
  } catch (err) {
    const m = err instanceof Error ? err.message.substring(0, 200) : 'unknown';
    console.error(`${LOG_PREFIX} update outbox post-fallo falló: ${m}`);
  }

  // SPRINT-WA-BILLING-VERIFY: extraer código Meta + delegar a helper
  // especializado que clasifica severidad, persiste a whatsapp_errores_meta
  // y notifica admins si severidad es crítica/alta (códigos billing 131056,
  // 131057, spam rate 131048, etc.). Best-effort — no bloquea respuesta.
  const codigoMetaRaw = (metaResp.error as Record<string, unknown> | undefined)?.code;
  const codigoMeta = typeof codigoMetaRaw === 'number' ? codigoMetaRaw : undefined;
  const errorMetaInput: {
    code?: number;
    mensaje?: string;
    title?: string;
    detalles?: unknown;
  } = {};
  if (codigoMeta !== undefined) errorMetaInput.code = codigoMeta;
  const mensajeRaw = (metaResp.error as Record<string, unknown> | undefined)?.mensaje
    ?? (metaResp.error as Record<string, unknown> | undefined)?.message;
  if (typeof mensajeRaw === 'string') errorMetaInput.mensaje = mensajeRaw;
  const tituloRaw = (metaResp.error as Record<string, unknown> | undefined)?.title;
  if (typeof tituloRaw === 'string') errorMetaInput.title = tituloRaw;
  if (metaResp.error !== undefined) errorMetaInput.detalles = metaResp.error;

  const resultadoManejo = await manejarErrorMeta({
    db,
    errorMeta: errorMetaInput,
    contexto: {
      fuente: 'send',
      wa_id,
      phoneNumberId,
      outboxId: outboxRef.id,
      callerUid,
    },
  });

  // Audit log de fallo Meta (security audit WA-2 MEDIA #2 — cobertura completa).
  // Si es billing error, distinguir motivo para que la consola admin filtre.
  await escribirAuditoriaSend(db, {
    accion: 'enviar_whatsapp',
    resultado: 'fallo_meta',
    solicitanteUid: callerUid,
    solicitanteEmail: callerEmail,
    wa_id,
    tipo,
    plantillaNombre: plantilla?.nombre,
    phoneNumberId,
    outboxId: outboxRef.id,
    ordenId,
    motivo: resultadoManejo.esBilling ? 'meta-billing-error' : 'meta-envio-fallo',
    detalle: {
      error: metaResp.error ?? null,
      intentos,
      severidad: resultadoManejo.severidad,
      codigoMeta: codigoMeta ?? null,
    },
  });

  console.warn(
    `${LOG_PREFIX} envío FAIL | wa=${truncarWaIdParaLog(wa_id)} tipo=${tipo} ` +
      `intentos=${intentos} severidad=${resultadoManejo.severidad} ` +
      `esBilling=${resultadoManejo.esBilling}`,
  );
  res.status(502).json({
    error: resultadoManejo.esBilling ? 'meta-billing-error' : 'meta-envio-fallo',
    severidad: resultadoManejo.severidad,
    codigoMeta: codigoMeta ?? null,
    detalle: metaResp.error ?? null,
    outboxId: outboxRef.id,
    intentos,
  });
}
