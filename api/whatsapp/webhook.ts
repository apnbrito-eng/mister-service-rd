/**
 * Webhook entrante de WhatsApp Cloud API (Meta).
 *
 * Dos modos en un solo endpoint:
 *  1. GET  → handshake de verificación inicial Meta (challenge/verify_token).
 *  2. POST → recepción de eventos (mensajes entrantes + status callbacks).
 *
 * SPRINT-WA-1. Arquitectura: docs/MODULO_WHATSAPP.md sección 2.
 *
 * Convenciones críticas (NO violar — disparan cazadores P-016 y P-017):
 *  - Body raw como Buffer (NO usar el JSON parsed de Vercel).
 *  - `export const config = { api: { bodyParser: false } }`.
 *  - HMAC SHA-256 con `crypto.timingSafeEqual` (anti-timing).
 *  - Idempotency via `runTransaction` con `tx.get` ANTES de `tx.set` sobre
 *    `whatsapp_mensajes_inbox/{wamid}` Y `whatsapp_conversaciones/{wa_id}`
 *    en el mismo callback (atomicidad cross-collection).
 *
 * Restricciones:
 *  - NO procesar lógica de bot (eso es SPRINT-WA-6).
 *  - NO llamar Anthropic ni terceros — sólo escribir Firestore + responder 200.
 *  - Completar en <5s (Meta timeout 10s, reintenta si tardamos).
 *  - Si algo falla DESPUÉS de validar HMAC: igual responder 200 OK (NO
 *    queremos que Meta reintente cuando el problema es de nuestro lado).
 *
 * PII en logs:
 *  - NUNCA loggear el body completo o el `texto` del mensaje (contenido
 *    privado del cliente).
 *  - OK loggear: `wamid`, `wa_id` truncado a últimos 4 dígitos, `tipo`,
 *    `phoneNumberId`, contadores y branches del flow.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminFirestore } from '../_lib/firebaseAdmin.js';
import {
  caparRawPayload,
  debeActualizarEstado,
  parsearPayloadMeta,
  stripUndefinedDeep,
  truncarWaIdParaLog,
  type MensajeEntranteNormalizado,
  type StatusCallbackNormalizado,
} from '../_lib/whatsappWebhook.js';

/**
 * Vercel config: DESACTIVAR el bodyParser para poder leer el body como
 * Buffer raw y calcular HMAC sobre los bytes exactos que Meta firmó.
 *
 * Si esto está mal, el HMAC va a fallar siempre y nada va a entrar al CRM.
 * Cazador P-016 enforce que esta línea esté presente.
 */
export const config = {
  api: {
    bodyParser: false,
  },
};

const LOG_PREFIX = '[whatsapp/webhook]';

/**
 * Lee el body del request como Buffer raw. Acumula chunks desde el stream
 * de Node — Vercel respeta `bodyParser: false` y nos pasa el request stream
 * sin procesar. Si tarda >5s reject (Meta timeout es 10s).
 */
async function leerRawBody(req: VercelRequest): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let tamañoTotal = 0;
    // Cap defensivo a 5MB para evitar memory abuse desde un caller que
    // pretende ser Meta. El payload de Meta real es <50KB típicamente.
    const MAX_BYTES = 5 * 1024 * 1024;

    const timeout = setTimeout(() => {
      reject(new Error('body-timeout'));
    }, 5000);

    req.on('data', (chunk: Buffer) => {
      tamañoTotal += chunk.length;
      if (tamañoTotal > MAX_BYTES) {
        clearTimeout(timeout);
        reject(new Error('body-too-large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      clearTimeout(timeout);
      resolve(Buffer.concat(chunks));
    });
    req.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

/**
 * Valida la firma HMAC SHA-256 del header `x-hub-signature-256` contra
 * el body raw usando `META_APP_SECRET`. Comparación con
 * `crypto.timingSafeEqual` para evitar timing attacks.
 *
 * Header esperado: `sha256=<hex>` (formato Meta).
 *
 * Devuelve `true` solo si:
 *  - El header existe y tiene el prefijo correcto.
 *  - El secret de env está definido.
 *  - El hex es válido (longitud 64).
 *  - El digest computado coincide byte-a-byte.
 */
function validarFirmaHmac(rawBody: Buffer, headerRaw: unknown, secret: string): boolean {
  const header = Array.isArray(headerRaw) ? headerRaw[0] : headerRaw;
  if (typeof header !== 'string' || !header.startsWith('sha256=')) return false;

  const firmaHex = header.substring('sha256='.length).trim();
  if (firmaHex.length !== 64 || !/^[0-9a-fA-F]+$/.test(firmaHex)) return false;

  const esperado = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  if (esperado.length !== firmaHex.length) return false;

  try {
    return crypto.timingSafeEqual(
      Buffer.from(firmaHex, 'hex'),
      Buffer.from(esperado, 'hex'),
    );
  } catch {
    return false;
  }
}

/**
 * GET handler — handshake de verificación Meta.
 *
 * Meta envía:
 *   GET /api/whatsapp/webhook?hub.mode=subscribe
 *                            &hub.verify_token=<X>
 *                            &hub.challenge=<Y>
 *
 * Si X coincide con `META_VERIFY_TOKEN` → respondemos `Y` como text/plain
 * (Meta espera el challenge crudo, NO JSON).
 * Si no coincide → 403 con mensaje genérico (sin info útil al atacante).
 */
function handleVerify(req: VercelRequest, res: VercelResponse): void {
  const verifyTokenEnv = process.env.META_VERIFY_TOKEN;
  if (!verifyTokenEnv) {
    console.error(`${LOG_PREFIX} META_VERIFY_TOKEN no configurado en env.`);
    res.status(500).send('config-missing');
    return;
  }

  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const modeStr = Array.isArray(mode) ? mode[0] : mode;
  const tokenStr = Array.isArray(token) ? token[0] : token;
  const challengeStr = Array.isArray(challenge) ? challenge[0] : challenge;

  if (modeStr === 'subscribe' && typeof tokenStr === 'string' && tokenStr === verifyTokenEnv) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.status(200).send(challengeStr ?? '');
    console.log(`${LOG_PREFIX} verificación GET OK`);
    return;
  }

  console.warn(`${LOG_PREFIX} verificación GET rechazada (token mismatch o modo invalido)`);
  res.status(403).send('forbidden');
}

/**
 * Persiste un mensaje entrante a Firestore de forma atómica:
 *  - `whatsapp_mensajes_inbox/{wamid}` (idempotency key).
 *  - `whatsapp_conversaciones/{wa_id}` (merge con incremento + ventana 24h).
 *
 * Si `whatsapp_mensajes_inbox/{wamid}` ya existe → no-op (Meta reintentó).
 * Si NO existe → crea inbox + merge conversación en el MISMO runTransaction.
 *
 * Defense-in-depth idempotency: el `tx.get(inboxRef)` adentro del callback
 * garantiza que el `set` solo corra si el doc no existía al inicio de la
 * transacción. Firestore aborta + reintenta el callback si otra invocación
 * paralela escribió entre nuestro `get` y el `set`.
 */
async function persistirMensajeEntrante(
  db: ReturnType<typeof getAdminFirestore>,
  msg: MensajeEntranteNormalizado,
): Promise<{ creado: boolean }> {
  const inboxRef = db.collection('whatsapp_mensajes_inbox').doc(msg.wamid);
  const conversacionRef = db.collection('whatsapp_conversaciones').doc(msg.wa_id);

  let creado = false;

  await db.runTransaction(async (tx) => {
    const inboxSnap = await tx.get(inboxRef);
    if (inboxSnap.exists) {
      // Reintento Meta — ya tenemos este wamid. NO-op.
      creado = false;
      return;
    }

    const conversacionSnap = await tx.get(conversacionRef);
    const conversacionExiste = conversacionSnap.exists;

    // Preview del mensaje para la conversación (no PII completa).
    const preview =
      msg.contenido.texto?.slice(0, 80) ??
      msg.contenido.mediaCaption?.slice(0, 80) ??
      `<${msg.tipo}>`;

    // Ventana 24h: cierra 24h después del último mensaje ENTRANTE. Cada
    // mensaje entrante reabre la ventana.
    const cierraEn = new Date(msg.timestampMeta.getTime() + 24 * 60 * 60 * 1000);

    // Inbox doc.
    const rawCapeado = caparRawPayload(msg.rawMessage);
    const inboxPayload: Record<string, unknown> = {
      wamid: msg.wamid,
      phoneNumberId: msg.phoneNumberId,
      wa_id: msg.wa_id,
      from: msg.from,
      tipo: msg.tipo,
      contenido: msg.contenido,
      timestampMeta: msg.timestampMeta,
      timestampRecibido: FieldValue.serverTimestamp(),
      procesadoBot: false,
      conversacionId: msg.wa_id,
      raw: rawCapeado,
    };

    tx.set(inboxRef, stripUndefinedDeep(inboxPayload));

    // Conversación: merge con campos críticos siempre escritos por el SDK
    // (las rules permiten que estos campos sean tocados por admin SDK pero
    // NO desde cliente — defense-in-depth).
    const conversacionUpdate: Record<string, unknown> = {
      wa_id: msg.wa_id,
      ultimoPhoneNumberId: msg.phoneNumberId,
      ultimoMensajeEntrante: {
        wamid: msg.wamid,
        timestamp: msg.timestampMeta,
        preview,
        tipo: msg.tipo,
      },
      totalMensajesEntrantes: FieldValue.increment(1),
      ventana24h: {
        abierta: true,
        cierraEn,
      },
      ultimaActividad: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (!conversacionExiste) {
      // Primera vez: bootstrap del shape completo de la conversación. El
      // bot queda DESHABILITADO por default — SPRINT-WA-6 lo activa cuando
      // implemente la lógica IA.
      conversacionUpdate.primeraInteraccion = FieldValue.serverTimestamp();
      conversacionUpdate.noLeidos = 1;
      conversacionUpdate.totalMensajesSalientes = 0;
      conversacionUpdate.requiereHumano = false;
      conversacionUpdate.bot = {
        habilitado: false,
        turnosCount: 0,
        contexto: {},
      };
    } else {
      // Update incremental: incrementamos noLeidos pero NO tocamos los
      // demás campos UI (asignadaA, etiquetas, bot.*) — solo admin SDK
      // los modifica desde flujos específicos.
      conversacionUpdate.noLeidos = FieldValue.increment(1);
    }

    tx.set(conversacionRef, stripUndefinedDeep(conversacionUpdate), { merge: true });
    creado = true;
  });

  return { creado };
}

/**
 * Procesa un status callback de Meta sobre un mensaje saliente.
 *
 * Busca `whatsapp_mensajes_outbox where wamid == status.wamid` y actualiza
 * el estado + timestamp correspondiente. Idempotente: si el callback ya
 * fue procesado (mismo estado o más avanzado), no-op.
 *
 * Atomicidad: `runTransaction` con `tx.get` del doc outbox + decisión
 * `debeActualizarEstado` adentro del callback (evita race conditions
 * cuando Meta manda callbacks fuera de orden).
 *
 * Si no encontramos el wamid en outbox: NO es error — puede ser un wamid
 * que mandamos desde otra integración (legacy), o un test desde Meta
 * Console. Loggeamos warn y seguimos.
 */
async function persistirStatusCallback(
  db: ReturnType<typeof getAdminFirestore>,
  cb: StatusCallbackNormalizado,
): Promise<{ actualizado: boolean; encontrado: boolean }> {
  // Query por wamid (índice `wamid ASC` definido en docs/MODULO_WHATSAPP.md).
  const q = await db
    .collection('whatsapp_mensajes_outbox')
    .where('wamid', '==', cb.wamid)
    .limit(1)
    .get();

  if (q.empty) {
    return { actualizado: false, encontrado: false };
  }

  const outboxRef = q.docs[0].ref;
  let actualizado = false;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(outboxRef);
    if (!snap.exists) return;
    const data = snap.data() as Record<string, unknown>;
    const estadoActual = typeof data.estado === 'string' ? data.estado : undefined;

    // Defense-in-depth (security audit SPRINT-WA-1):
    //
    // 1) phoneNumberId match: si el callback dice venir del número X pero
    //    el outbox doc se mandó desde el número Y, hay spoofing potencial.
    //    Skipear.
    const phoneOutbox = typeof data.phoneNumberId === 'string' ? data.phoneNumberId : '';
    if (phoneOutbox && cb.phoneNumberId && phoneOutbox !== cb.phoneNumberId) {
      return;
    }

    // 2) Cronología: callback no puede ser anterior al envío. Si llega
    //    timestampStatus < enviadoEn (con 60s tolerancia para clock skew),
    //    es sospechoso. Skipear.
    const enviadoEnRaw = data.enviadoEn;
    if (enviadoEnRaw && typeof (enviadoEnRaw as { toMillis?: () => number }).toMillis === 'function') {
      const enviadoMs = (enviadoEnRaw as { toMillis: () => number }).toMillis();
      const cbMs = cb.timestampStatus.getTime();
      if (cbMs + 60_000 < enviadoMs) {
        return;
      }
    }

    if (!debeActualizarEstado(estadoActual, cb.estado)) {
      // El estado actual ya es más avanzado (o el mismo) — no-op.
      // También bloquea regresión delivered/read → failed (defense-in-depth).
      return;
    }

    const update: Record<string, unknown> = {
      estado: cb.estado,
      updatedAt: FieldValue.serverTimestamp(),
    };

    // Cada estado tiene su propio timestamp field. Sólo seteamos el que
    // corresponde al nuevo estado para no pisar timestamps anteriores.
    if (cb.estado === 'sent') update.enviadoEn = cb.timestampStatus;
    else if (cb.estado === 'delivered') update.entregadoEn = cb.timestampStatus;
    else if (cb.estado === 'read') update.leidoEn = cb.timestampStatus;
    else if (cb.estado === 'failed') {
      update.falladoEn = cb.timestampStatus;
      if (cb.errorMeta) update.errorMeta = cb.errorMeta;
    }

    tx.update(outboxRef, stripUndefinedDeep(update));
    actualizado = true;
  });

  return { actualizado, encontrado: true };
}

/**
 * POST handler — procesa eventos Meta.
 *
 * Pipeline:
 *  1. Leer body raw.
 *  2. Validar HMAC.
 *  3. Parsear JSON.
 *  4. Para cada mensaje entrante → persistir (idempotente).
 *  5. Para cada status callback → actualizar outbox.
 *  6. Responder 200.
 *
 * Si CUALQUIER paso después de HMAC falla, igual respondemos 200 (Meta
 * NO debe reintentar si nuestro código falla — el mensaje ya está en
 * sus logs, pueden retomarlo manual desde Meta Business Manager).
 */
async function handleEvento(req: VercelRequest, res: VercelResponse): Promise<void> {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) {
    console.error(`${LOG_PREFIX} META_APP_SECRET no configurado en env.`);
    // Sin secret no podemos validar — 500 para alertar al operador, pero
    // sin info útil al atacante.
    res.status(500).json({ error: 'config-missing' });
    return;
  }

  // 1) Leer body raw.
  let rawBody: Buffer;
  try {
    rawBody = await leerRawBody(req);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.warn(`${LOG_PREFIX} body read failed: ${msg}`);
    res.status(400).json({ error: 'invalid body' });
    return;
  }

  // 2) HMAC.
  const firmaOK = validarFirmaHmac(
    rawBody,
    req.headers['x-hub-signature-256'],
    appSecret,
  );
  if (!firmaOK) {
    console.warn(`${LOG_PREFIX} firma HMAC inválida (rechazado)`);
    res.status(401).json({ error: 'invalid signature' });
    return;
  }

  // 3) Parse JSON.
  let payloadJson: unknown;
  try {
    payloadJson = JSON.parse(rawBody.toString('utf8'));
  } catch {
    console.warn(`${LOG_PREFIX} JSON inválido después de HMAC OK`);
    // Respondemos 200 igual — no queremos que Meta reintente con el mismo
    // payload corrupto.
    res.status(200).json({ ok: true, parsed: false });
    return;
  }

  const { messages, statuses } = parsearPayloadMeta(payloadJson);

  let db: ReturnType<typeof getAdminFirestore>;
  try {
    db = getAdminFirestore();
  } catch (err) {
    // No loggeamos `err` raw — Admin SDK puede incluir parte del private
    // key o client email en mensajes de error de cert mal formado.
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error(`${LOG_PREFIX} Admin SDK init falló: ${msg.substring(0, 200)}`);
    res.status(200).json({ ok: true, processed: false });
    return;
  }

  let mensajesNuevos = 0;
  let mensajesDuplicados = 0;
  let statusesActualizados = 0;
  let statusesNoEncontrados = 0;

  // 4) Persistir mensajes entrantes — uno por uno (cada uno su propia
  // transacción). Errores individuales NO bloquean el resto.
  for (const msg of messages) {
    try {
      const { creado } = await persistirMensajeEntrante(db, msg);
      if (creado) mensajesNuevos++;
      else mensajesDuplicados++;
    } catch (err) {
      const m = err instanceof Error ? err.message : 'unknown';
      console.error(
        `${LOG_PREFIX} fallo persistencia mensaje wamid=${msg.wamid} ` +
          `wa=${truncarWaIdParaLog(msg.wa_id)} tipo=${msg.tipo}: ${m}`,
      );
    }
  }

  // 5) Status callbacks.
  for (const cb of statuses) {
    try {
      const { actualizado, encontrado } = await persistirStatusCallback(db, cb);
      if (actualizado) statusesActualizados++;
      if (!encontrado) statusesNoEncontrados++;
    } catch (err) {
      const m = err instanceof Error ? err.message : 'unknown';
      console.error(
        `${LOG_PREFIX} fallo status callback wamid=${cb.wamid} ` +
          `estado=${cb.estado}: ${m}`,
      );
    }
  }

  console.log(
    `${LOG_PREFIX} evento OK | mensajes=${messages.length} ` +
      `(nuevos=${mensajesNuevos}, dup=${mensajesDuplicados}) ` +
      `statuses=${statuses.length} (upd=${statusesActualizados}, sinOutbox=${statusesNoEncontrados})`,
  );

  res.status(200).json({ ok: true });
}

/**
 * Entry point Vercel — dispatch por método HTTP.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  // No-cache: este endpoint nunca debe servir respuestas cacheadas.
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  try {
    if (req.method === 'GET') {
      handleVerify(req, res);
      return;
    }
    if (req.method === 'POST') {
      await handleEvento(req, res);
      return;
    }
    res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    // Última red de seguridad — cualquier excepción no atrapada arriba
    // debe responder 200 al POST para evitar reintentos Meta. Para GET
    // un 500 es OK porque Meta marca "verification failed" y avisa al
    // operador.
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error(`${LOG_PREFIX} excepción no manejada:`, msg);
    if (req.method === 'POST') {
      res.status(200).json({ ok: true, recovered: true });
    } else {
      res.status(500).send('internal');
    }
  }
}
