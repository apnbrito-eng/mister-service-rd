/**
 * Backfill one-shot: reconstruye 3 conversaciones de WhatsApp corruptas por
 * el bug de `stripUndefinedDeep` (commit `142d4da` 2026-05-19, fix `0baf8b7`
 * 2026-05-22). Sin el fix, `FieldValue.serverTimestamp()` y `FieldValue.increment()`
 * se guardaban como `{}` y `{operand:N}` respectivamente, corrompiendo
 * `ultimaActividad`/`updatedAt`/`primeraInteraccion`/`ventana24h.cierraEn`/
 * `noLeidos`/`totalMensajesEntrantes`/`totalMensajesSalientes`.
 *
 * Estrategia: para cada wa_id afectado, recalcular cada campo a partir de
 * los docs `whatsapp_mensajes_inbox` (entrantes) y `whatsapp_mensajes_outbox`
 * (salientes) — esos sí tienen `timestampMeta` / `createTime` plain.
 *
 * Campos reconstruidos en `whatsapp_conversaciones/{wa_id}`:
 *   - `wa_id` (id del doc — ya correcto)
 *   - `totalMensajesEntrantes` ← count de mensajes_inbox where conversacionId == wa_id
 *   - `totalMensajesSalientes` ← count de mensajes_outbox where conversacionId == wa_id
 *   - `noLeidos` ← count de mensajes_inbox que NO han sido leídos (sin lectura por staff)
 *     — fallback conservador: = totalMensajesEntrantes (Jorge puede marcar como leído manual).
 *   - `ultimaActividad` ← Timestamp del mensaje más reciente (max(inbox.timestampMeta, outbox.timestampMeta))
 *   - `updatedAt` ← misma `ultimaActividad`.
 *   - `primeraInteraccion` ← Timestamp del primer mensaje (min(inbox.timestampMeta, outbox.timestampMeta))
 *   - `ultimoMensajeEntrante` ← { wamid, timestamp, preview, tipo } del último entrante.
 *   - `ultimoMensajeSaliente` ← { wamid, timestamp, preview, tipo } del último saliente (si hay).
 *   - `ventana24h.cierraEn` ← último entrante.timestamp + 24h. `abierta` recalculado vs Date.now().
 *
 * Campos NO tocados (que ya estaban OK o no se reconstruyen):
 *   - `ultimoPhoneNumberId` (sticky — última actualización del webhook lo grabó bien aunque otros campos fueron rotos? verificar; si está corrupto, leer del último mensaje_inbox)
 *   - `asignadaA`, `etiquetas`, `bot`, `requiereHumano` — UI/state que el bug NO tocaba.
 *
 * Idempotente: re-correr genera los mismos valores. Si los docs ya están sanos
 * (post primer auto-saneo del nuevo webhook), simplemente re-escribe los mismos
 * valores derivados — sin daño.
 *
 * Uso:
 *   npx tsx scripts/backfill-convs-corruptas-stripundefined.ts            # ejecuta
 *   npx tsx scripts/backfill-convs-corruptas-stripundefined.ts --dry-run  # solo muestra
 *
 * Auth (patrón estándar del repo):
 *   1) GOOGLE_APPLICATION_CREDENTIALS apunta a JSON existente.
 *   2) ./service-account.json en cwd.
 *   3) Env vars FIREBASE_PROJECT_ID|CLIENT_EMAIL|PRIVATE_KEY.
 *
 * NOTA: el bug `0baf8b7` ya está deployado en producción → el webhook se
 * auto-sana en cada nuevo mensaje. Este script es un cierre cosmético/forensia
 * para las 3 convs que estuvieron rotas más tiempo sin tráfico.
 */
import { initializeApp, getApps, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const WA_IDS_CORRUPTAS = ['5618096402', '8292733505', '8494580318'];
const VENTANA_24H_MS = 24 * 60 * 60 * 1000;

interface MensajeBase {
  wamid?: string;
  conversacionId?: string;
  tipo?: string;
  contenido?: Record<string, unknown>;
  timestampMeta?: Timestamp;
  timestampRecibido?: Timestamp;
}

function previewFromContenido(tipo: string | undefined, contenido: Record<string, unknown> | undefined): string {
  if (!contenido) return '';
  if (tipo === 'text' && typeof contenido.body === 'string') {
    return String(contenido.body).slice(0, 200);
  }
  // Otros tipos: usar el tipo como preview defensivo.
  return `[${tipo ?? 'unknown'}]`;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(`[INFO] Modo: ${dryRun ? 'DRY-RUN' : 'APLICAR'}`);
  console.log(`[INFO] Conversaciones a reconstruir: ${WA_IDS_CORRUPTAS.join(', ')}`);

  if (getApps().length === 0) {
    const gacPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const localPath = resolve(process.cwd(), 'service-account.json');

    if (gacPath && existsSync(gacPath)) {
      console.log(`[INFO] Usando GOOGLE_APPLICATION_CREDENTIALS: ${gacPath}`);
      initializeApp({ credential: applicationDefault() });
    } else if (existsSync(localPath)) {
      console.log(`[INFO] Usando service-account.json local`);
      const json = JSON.parse(readFileSync(localPath, 'utf8'));
      initializeApp({
        credential: cert({
          projectId: json.project_id,
          clientEmail: json.client_email,
          privateKey: json.private_key,
        }),
        projectId: json.project_id,
      });
    } else {
      const projectId = process.env.FIREBASE_PROJECT_ID;
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;

      if (!projectId || !clientEmail || !privateKeyRaw) {
        console.error(
          '[ERROR] Faltan credenciales del Admin SDK. Probá una de estas opciones:\n' +
          '  1) Descargar service-account.json desde Firebase Console y ponerlo en la raíz del repo.\n' +
          '  2) Exportar GOOGLE_APPLICATION_CREDENTIALS=/ruta/al/service-account.json\n' +
          '  3) Exportar FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.',
        );
        process.exit(1);
      }
      initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey: privateKeyRaw.replace(/\\n/g, '\n'),
        }),
        projectId,
      });
    }
  }

  const db = getFirestore();

  let convsReconstruidas = 0;
  let convsSinTrafico = 0;
  let convsNoExisten = 0;

  for (const waId of WA_IDS_CORRUPTAS) {
    console.log(`\n[INFO] Procesando wa_id=${waId}...`);

    // Leer la conversación actual (para reportar el estado pre-backfill).
    const convRef = db.collection('whatsapp_conversaciones').doc(waId);
    const convSnap = await convRef.get();
    if (!convSnap.exists) {
      console.log(`  [WARN] Conversación NO existe en Firestore. Skip.`);
      convsNoExisten++;
      continue;
    }
    const convPre = convSnap.data() ?? {};

    // Leer todos los mensajes_inbox de esta conversación.
    const inboxSnap = await db
      .collection('whatsapp_mensajes_inbox')
      .where('conversacionId', '==', waId)
      .get();

    // Leer todos los mensajes_outbox de esta conversación.
    const outboxSnap = await db
      .collection('whatsapp_mensajes_outbox')
      .where('conversacionId', '==', waId)
      .get();

    const inboxDocs: MensajeBase[] = inboxSnap.docs.map((d) => d.data() as MensajeBase);
    const outboxDocs: MensajeBase[] = outboxSnap.docs.map((d) => d.data() as MensajeBase);

    console.log(
      `  [INFO] entrantes=${inboxDocs.length} salientes=${outboxDocs.length}`,
    );

    if (inboxDocs.length === 0 && outboxDocs.length === 0) {
      console.log(`  [WARN] Sin tráfico real. No hay datos para reconstruir. Skip.`);
      convsSinTrafico++;
      continue;
    }

    // Encontrar timestamps mín/máx considerando inbox + outbox.
    // timestampMeta es el Timestamp canónico (no timestampRecibido, que es serverTimestamp y puede estar mangleado).
    const tsConRol = [
      ...inboxDocs
        .filter((m) => m.timestampMeta instanceof Timestamp)
        .map((m) => ({ ts: m.timestampMeta as Timestamp, rol: 'entrante' as const, msg: m })),
      ...outboxDocs
        .filter((m) => m.timestampMeta instanceof Timestamp)
        .map((m) => ({ ts: m.timestampMeta as Timestamp, rol: 'saliente' as const, msg: m })),
    ];

    if (tsConRol.length === 0) {
      console.log(`  [WARN] Mensajes encontrados pero ninguno tiene timestampMeta:Timestamp válido. Skip.`);
      convsSinTrafico++;
      continue;
    }

    tsConRol.sort((a, b) => a.ts.toMillis() - b.ts.toMillis());
    const primero = tsConRol[0];
    const ultimo = tsConRol[tsConRol.length - 1];

    // Último entrante / último saliente.
    const ultimoEntrante = [...tsConRol]
      .reverse()
      .find((e) => e.rol === 'entrante');
    const ultimoSaliente = [...tsConRol]
      .reverse()
      .find((e) => e.rol === 'saliente');

    // ventana24h: si hay último entrante, cierraEn = entrante.ts + 24h.
    // abierta = (cierraEn > now). Si NO hay entrante (solo salientes), conservar
    // ventana cerrada (no aplica regla customer service window de Meta).
    const now = Date.now();
    let ventana24h: { abierta: boolean; cierraEn: Timestamp | null } = {
      abierta: false,
      cierraEn: null,
    };
    if (ultimoEntrante) {
      const cierraMs = ultimoEntrante.ts.toMillis() + VENTANA_24H_MS;
      ventana24h = {
        abierta: cierraMs > now,
        cierraEn: Timestamp.fromMillis(cierraMs),
      };
    }

    // noLeidos: heurística conservadora. Si el campo existente está como
    // mapa basura (`{operand: N}` o `{}`), no podemos confiar en él. Tomar
    // el count total de entrantes — Jorge marca como leído manualmente si
    // ya los vio. Si el campo está sano (number plain), preservar.
    let noLeidosFinal: number;
    const noLeidosPre = convPre.noLeidos;
    if (typeof noLeidosPre === 'number' && Number.isFinite(noLeidosPre) && noLeidosPre >= 0) {
      noLeidosFinal = noLeidosPre;
      console.log(`  [INFO] noLeidos preservado: ${noLeidosPre}`);
    } else {
      noLeidosFinal = inboxDocs.length;
      console.log(`  [INFO] noLeidos reseteado a count entrantes (era basura): ${noLeidosFinal}`);
    }

    // Construir update payload. Usar Timestamps planos (NO FieldValue) porque
    // este es un backfill, NO el flujo en vivo del webhook. Plain Timestamps
    // son seguros para el guard nuevo de `stripUndefinedDeep` (pero acá no
    // usamos `stripUndefinedDeep` — escribimos directo con Admin SDK).
    const payload: Record<string, unknown> = {
      wa_id: waId,
      totalMensajesEntrantes: inboxDocs.length,
      totalMensajesSalientes: outboxDocs.length,
      noLeidos: noLeidosFinal,
      ultimaActividad: ultimo.ts,
      updatedAt: ultimo.ts,
      primeraInteraccion: primero.ts,
      ventana24h,
    };

    if (ultimoEntrante) {
      payload.ultimoMensajeEntrante = {
        wamid: ultimoEntrante.msg.wamid ?? null,
        timestamp: ultimoEntrante.ts,
        preview: previewFromContenido(ultimoEntrante.msg.tipo, ultimoEntrante.msg.contenido),
        tipo: ultimoEntrante.msg.tipo ?? 'unknown',
      };
    }

    if (ultimoSaliente) {
      payload.ultimoMensajeSaliente = {
        wamid: ultimoSaliente.msg.wamid ?? null,
        timestamp: ultimoSaliente.ts,
        preview: previewFromContenido(ultimoSaliente.msg.tipo, ultimoSaliente.msg.contenido),
        tipo: ultimoSaliente.msg.tipo ?? 'unknown',
      };
    }

    // Reportar diff con el estado pre.
    console.log(`  [INFO] Pre-backfill resumen (algunos campos que se reescriben):`);
    console.log(
      `    totalMensajesEntrantes: ${JSON.stringify(convPre.totalMensajesEntrantes)} → ${payload.totalMensajesEntrantes}`,
    );
    console.log(
      `    totalMensajesSalientes: ${JSON.stringify(convPre.totalMensajesSalientes)} → ${payload.totalMensajesSalientes}`,
    );
    console.log(
      `    ultimaActividad: ${JSON.stringify(convPre.ultimaActividad)} → ${(payload.ultimaActividad as Timestamp).toDate().toISOString()}`,
    );
    console.log(
      `    ventana24h: ${JSON.stringify(convPre.ventana24h)} → abierta=${ventana24h.abierta} cierraEn=${ventana24h.cierraEn?.toDate().toISOString() ?? 'null'}`,
    );

    if (dryRun) {
      console.log(`  [DRY-RUN] No se aplican cambios.`);
    } else {
      await convRef.set(payload, { merge: true });
      console.log(`  [OK] Conversación reescrita.`);
      convsReconstruidas++;
    }
  }

  console.log(`\n[INFO] Resumen final:`);
  console.log(`  reconstruidas: ${convsReconstruidas}`);
  console.log(`  sin tráfico:   ${convsSinTrafico}`);
  console.log(`  no existen:    ${convsNoExisten}`);
  if (dryRun) {
    console.log(`\n[INFO] Re-correr SIN --dry-run para aplicar.`);
  }
}

main().catch((err) => {
  console.error('[ERROR] Falla inesperada:', err);
  process.exit(1);
});
