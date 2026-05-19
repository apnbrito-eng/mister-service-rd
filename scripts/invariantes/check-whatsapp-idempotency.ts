/**
 * P-017 — Webhook/send WhatsApp sin idempotency (runTransaction + tx.get)
 *
 * Bug original (anticipado, no histórico): SPRINT-WA-1 (2026-05-19).
 *
 * Síntoma prevenido:
 *   (A) Webhook entrante: Meta reintenta agresivamente cualquier POST que
 *       no responda 200 en <10s. Sin idempotency, un reintento causa:
 *         - Doc duplicado en `whatsapp_mensajes_inbox` (key auto-id) o
 *           overwrite silencioso (key = wamid) — depende de cómo se hizo.
 *         - Counter `totalMensajesEntrantes` en
 *           `whatsapp_conversaciones/{wa_id}` doblado o triplicado.
 *         - Bot disparado dos veces para el mismo mensaje del cliente —
 *           respuestas duplicadas, costos Anthropic doblados.
 *   (B) Send saliente: si POSTeamos a Meta y la respuesta timeoutea (pero
 *       Meta SÍ envió), un retry naive desde nuestro lado dispara DOBLE
 *       envío al cliente — spam + costos doblados + posible ban Meta por
 *       abuso. Defensa: crear el doc outbox con `tempId` ANTES de llamar
 *       a Meta, así un retry reconcilía por nuestro id en lugar de crear
 *       un doc nuevo.
 *
 * Causa raíz prevenida: la única forma robusta de idempotency en Firestore
 * es leer + escribir en el MISMO `runTransaction` callback. Patrones que
 * NO son idempotentes:
 *   - `addDoc(...)` con auto-id (genera id nuevo cada llamada).
 *   - `setDoc(...)` sin `tx.get` previo dentro de tx (race: dos callbacks
 *     paralelos ambos ven "no existe" y ambos crean).
 *   - `if (snap.exists) return; await setDoc(...)` fuera de tx (TOCTOU —
 *     entre el `if` y el `setDoc` otra invocación gana).
 *
 * Regla por archivo:
 *
 * `api/whatsapp/webhook.ts` (entrante):
 *   - DEBE contener `runTransaction` (de admin SDK).
 *   - DEBE contener `tx.get(` o `transaction.get(` cerca de operaciones
 *     que tocan `whatsapp_mensajes_inbox` o `whatsapp_conversaciones`.
 *
 * `api/whatsapp/send.ts` (saliente, todavía no implementado):
 *   - DEBE contener uno de:
 *     - `crypto.randomUUID(` (id local determinístico antes de llamar Meta).
 *     - Asignación literal de id con string >=8 chars (tempId hex/nanoid-like).
 *   - DEBE persistir doc en `whatsapp_mensajes_outbox` ANTES de la llamada
 *     a Meta (detectada por: alguna escritura a outbox precede a un
 *     `fetch(... graph.facebook.com` o `messages` endpoint).
 *
 * Si el archivo NO existe → PASS silent para ese archivo (no bloqueamos
 * sprints futuros que aún no lo crearon).
 *
 * Allowlist: vacía. La excepción legítima es "el archivo no existe" que
 * ya está cubierta por el flow.
 *
 * Limitación conocida:
 *   - Detección heurística por regex. Si la lógica se refactoriza
 *     fuertemente (ej. transaction se mueve a un helper en `_lib/`),
 *     extender `ARCHIVOS_WEBHOOK` / `ARCHIVOS_SEND` para cubrirlo.
 *   - El cazador no verifica que el orden de `tx.get` → `tx.set` sea el
 *     correcto, solo que ambos estén presentes en el archivo. La
 *     correctitud del orden la valida `reviewer` semánticamente.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { InvariantResult, InvariantHit } from './types.js';

const PATTERN_ID = 'P-017';
const PATTERN_NAME =
  'Webhook/send WhatsApp sin idempotency (runTransaction + tx.get o tempId pre-Meta)';
const ROOT_DIR = path.resolve(process.cwd());

/** Archivos que implementan el webhook entrante (lectura + escritura). */
const ARCHIVOS_WEBHOOK: readonly string[] = [
  'api/whatsapp/webhook.ts',
  'api/_lib/whatsappWebhook.ts',
];

/** Archivos que implementan el envío saliente (POST a Meta). */
const ARCHIVOS_SEND: readonly string[] = [
  'api/whatsapp/send.ts',
];

interface ArchivoCargado {
  path: string;
  contenido: string;
}

async function cargarArchivos(rels: readonly string[]): Promise<ArchivoCargado[]> {
  const out: ArchivoCargado[] = [];
  for (const rel of rels) {
    const full = path.join(ROOT_DIR, rel);
    try {
      const stat = await fs.stat(full);
      if (!stat.isFile()) continue;
    } catch {
      continue;
    }
    try {
      const raw = await fs.readFile(full, 'utf8');
      out.push({ path: rel, contenido: raw });
    } catch {
      continue;
    }
  }
  return out;
}

/**
 * Verifica que en el concat de archivos webhook esté presente:
 *  - `runTransaction(`  (admin SDK) o `.runTransaction(`
 *  - `tx.get(` o `transaction.get(`
 *  - Referencia a alguna de las colecciones críticas: inbox o conversaciones.
 */
function verificarWebhook(archivos: ArchivoCargado[]): InvariantHit[] {
  const hits: InvariantHit[] = [];
  if (archivos.length === 0) {
    // Endpoint todavía no implementado — PASS silent.
    return hits;
  }

  const concat = archivos.map((a) => a.contenido).join('\n');
  const archivoReporte = archivos[0].path;

  const tieneRunTx = /\brunTransaction\s*\(/.test(concat);
  const tieneTxGet = /(?:\btx|\btransaction)\.get\s*\(/.test(concat);
  const referenciaColecciones =
    /whatsapp_mensajes_inbox|whatsapp_conversaciones/.test(concat);

  if (!tieneRunTx) {
    hits.push({
      file: archivoReporte,
      line: 1,
      snippet: '(falta `runTransaction(` en el webhook)',
      explanation:
        'El webhook de WhatsApp DEBE usar `runTransaction` para escribir ' +
        '`whatsapp_mensajes_inbox/{wamid}` + `whatsapp_conversaciones/{wa_id}` ' +
        'atómicamente. Sin transacción, un reintento de Meta (que ocurre cada vez ' +
        'que no respondemos 200 en <10s) duplica counters de mensajes y dispara ' +
        'lógica de bot dos veces. Patrón correcto: `await db.runTransaction(async (tx) => { ' +
        'const snap = await tx.get(inboxRef); if (snap.exists) return; tx.set(inboxRef, ...); ' +
        'tx.set(conversacionRef, ..., { merge: true }); })`.',
    });
  }

  if (!tieneTxGet) {
    hits.push({
      file: archivoReporte,
      line: 1,
      snippet: '(falta `tx.get(` o `transaction.get(` en el webhook)',
      explanation:
        'El callback de `runTransaction` debe LEER (`tx.get(inboxRef)`) ' +
        'ANTES de escribir, para detectar reintentos Meta sobre el mismo `wamid`. ' +
        'Sin el `tx.get`, el callback siempre escribe — Firestore deja pasar el ' +
        'doble write porque no hay otra invocación paralela. El bug es subtle: ' +
        'aparece SOLO cuando Meta reintenta (no en happy path). Cazador anticipa.',
    });
  }

  if (!referenciaColecciones) {
    hits.push({
      file: archivoReporte,
      line: 1,
      snippet: '(no se referencia ni inbox ni conversaciones)',
      explanation:
        'El webhook entrante debe escribir a `whatsapp_mensajes_inbox` y/o ' +
        '`whatsapp_conversaciones`. Si la lógica se movió a un helper, agregar ' +
        'el path a `ARCHIVOS_WEBHOOK` en ' +
        '`scripts/invariantes/check-whatsapp-idempotency.ts`.',
    });
  }

  return hits;
}

/**
 * Verifica que el archivo de send saliente (cuando existe) crea un tempId
 * + persiste outbox ANTES de llamar a Meta.
 *
 * Heurística:
 *   - Detectar `crypto.randomUUID(` o asignación literal `id: '<≥8 chars>'`.
 *   - Detectar `addDoc(...outbox...)` o `setDoc(...outbox...)`.
 *   - Detectar referencia a `graph.facebook.com` o `messages` endpoint.
 *   - El primer offset de escritura a outbox DEBE ser menor que el primer
 *     offset de la llamada a Meta.
 */
function verificarSend(archivos: ArchivoCargado[]): InvariantHit[] {
  const hits: InvariantHit[] = [];
  if (archivos.length === 0) {
    // Endpoint todavía no implementado — PASS silent.
    return hits;
  }

  const archivoReporte = archivos[0].path;
  const contenido = archivos[0].contenido;

  // tempId pattern: `crypto.randomUUID(` o `randomUUID(`.
  const tieneRandomUuid = /\brandomUUID\s*\(/.test(contenido);

  // Detectar escritura a outbox.
  const reOutboxWrite =
    /(?:addDoc|setDoc)\s*\(\s*[^)]*whatsapp_mensajes_outbox/;
  const matchOutbox = contenido.match(reOutboxWrite);

  // Detectar llamada a Meta.
  const reMeta = /graph\.facebook\.com|\/messages['"`]\s*[,)]/;
  const matchMeta = contenido.match(reMeta);

  if (!tieneRandomUuid) {
    hits.push({
      file: archivoReporte,
      line: 1,
      snippet: '(falta `crypto.randomUUID(` para generar tempId)',
      explanation:
        'El endpoint de send saliente debe generar un `tempId` local con ' +
        '`crypto.randomUUID()` ANTES de llamar a Meta. Sin tempId determinístico, ' +
        'un retry post-timeout crea un doc nuevo en `whatsapp_mensajes_outbox` ' +
        'cada vez — duplicación + pérdida de tracking del `wamid` que Meta devuelve. ' +
        'NO usar `nanoid` (no está instalado en este repo): usar `crypto.randomUUID` ' +
        'de Node built-in.',
    });
  }

  if (!matchOutbox) {
    hits.push({
      file: archivoReporte,
      line: 1,
      snippet: '(falta `addDoc/setDoc` sobre `whatsapp_mensajes_outbox`)',
      explanation:
        'El endpoint debe persistir el doc en `whatsapp_mensajes_outbox` ' +
        'ANTES de la llamada a Meta (estado inicial = `queued`). Si Meta confirma, ' +
        'update con `wamid` + estado `sent`. Si Meta timeoutea, el doc queda en ' +
        '`queued` y un cron de reconciliación puede reintentar con el mismo tempId.',
    });
  }

  if (matchOutbox && matchMeta) {
    const idxOutbox = matchOutbox.index ?? -1;
    const idxMeta = matchMeta.index ?? -1;
    if (idxOutbox >= 0 && idxMeta >= 0 && idxOutbox > idxMeta) {
      hits.push({
        file: archivoReporte,
        line: 1,
        snippet:
          '(escritura a `whatsapp_mensajes_outbox` aparece DESPUÉS de la llamada a Meta)',
        explanation:
          'La persistencia del doc outbox debe ocurrir ANTES del POST a Meta — ' +
          'no después. Si Meta envía pero nuestra red corta antes de la respuesta, ' +
          'el doc outbox queda sin crearse y NO podemos reconciliar via `wamid` ' +
          'cuando llega el callback de status. Patrón seguro: `tempId = ' +
          'crypto.randomUUID(); setDoc(outbox/{tempId}, { estado: \'queued\', wamid: null, ... }); ' +
          'try { resp = await fetch(metaUrl, ...); updateDoc(outbox/{tempId}, { wamid: resp.id, estado: \'sent\' }); } ' +
          'catch { /* doc queda en queued, cron reintenta */ }`.',
      });
    }
  }

  return hits;
}

export async function check(): Promise<InvariantResult> {
  const hits: InvariantHit[] = [];
  const notes: string[] = [];

  const archivosWebhook = await cargarArchivos(ARCHIVOS_WEBHOOK);
  const archivosSend = await cargarArchivos(ARCHIVOS_SEND);

  hits.push(...verificarWebhook(archivosWebhook));
  hits.push(...verificarSend(archivosSend));

  notes.push(
    `Webhook entrante: ${archivosWebhook.length} archivo(s) escaneado(s) ` +
      `(${archivosWebhook.map((a) => a.path).join(', ') || 'ninguno encontrado'}).`,
  );
  notes.push(
    `Send saliente: ${archivosSend.length} archivo(s) escaneado(s) ` +
      `(${archivosSend.map((a) => a.path).join(', ') || 'ninguno encontrado — sprint WA-2 todavía no entrega'}).`,
  );

  return {
    patternId: PATTERN_ID,
    patternName: PATTERN_NAME,
    status: hits.length > 0 ? 'fail' : 'pass',
    hits,
    notes,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  check().then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.status === 'fail' ? 1 : 0);
  });
}
