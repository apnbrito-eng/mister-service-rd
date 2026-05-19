/**
 * P-018 — Send WhatsApp `texto_libre` sin validación de ventana 24h
 *
 * Bug original (anticipado, no histórico): SPRINT-WA-2 (2026-05-19).
 *
 * Síntoma prevenido: el endpoint `api/whatsapp/send.ts` acepta envíos de
 * `tipo === 'texto_libre'` sin verificar que la conversación destino tenga
 * un mensaje entrante reciente (<24h). Resultado en producción:
 *   - Meta rechaza el mensaje con error
 *     `(#131047) Re-engagement message` (la ventana de servicio cerró).
 *   - El doc `whatsapp_mensajes_outbox/{id}` queda en estado `failed` con
 *     `errorMeta` críptico — UX dice "no se pudo enviar" sin explicar que
 *     había que mandar plantilla HSM.
 *   - Cargo de Meta por intento + percepción de feature rota.
 *
 * Por qué el cazador anticipa: la lógica de ventana 24h es subtle (timestamps
 * de Firestore vs. Date, tolerancia de zona horaria, conversaciones nuevas
 * sin `ultimoMensajeEntrante`). Es muy fácil para un refactor futuro:
 *   - Mover la validación a un helper externo y romperla sin darse cuenta.
 *   - Cambiar `> 24 * 60 * 60 * 1000` por `>= 24h` y desencadenar edge cases.
 *   - Removerla "porque parece duplicado" cuando alguien implementa WA-5 y
 *     piensa que la plantilla HSM cubre todo el rango.
 *
 * Causa raíz prevenida: la regla de negocio de Meta (Cloud API "Customer
 * Service Window") está mejor enforced en código que en documentación. Sin
 * cazador, esta regla vive sólo en el README de WA-2 y se pierde.
 *
 * Regla: si `api/whatsapp/send.ts` (cuando existe) menciona el literal
 * `'texto_libre'`, el mismo archivo debe contener los 4 patterns siguientes:
 *  1. Lectura de `whatsapp_conversaciones` (acceso a `db.collection(...)`).
 *  2. Referencia a `ultimoMensajeEntrante` (campo persistido por el webhook
 *     entrante en `whatsapp_conversaciones/{wa_id}`).
 *  3. Comparación temporal `24 * 60 * 60 * 1000`, `86400000` o `24h` en
 *     comentario contiguo (heurística — `24h` cubre el caso donde el dev
 *     extrae una constante `VENTANA_MS_24H`).
 *  4. Respuesta `'window-cerrada'` (string literal — convención del repo
 *     para este error tras alineación con el frontend).
 *
 * Si falta cualquiera de los 4 → FAIL con explicación específica.
 *
 * Allowlist: vacía al inicio. La excepción legítima es "el archivo no existe"
 * que se maneja con PASS silent (sprints futuros que aún no entregan WA-2).
 *
 * Limitación conocida:
 *   - Heurística por regex sobre archivo único. Si la lógica de ventana se
 *     extrae a un helper en `api/_lib/whatsappSend.ts`, agregar el path a
 *     `ARCHIVOS_SCAN`.
 *   - No verifica el orden lógico (ej: que el check de ventana corra ANTES
 *     de la llamada a Meta). El reviewer humano lo valida semánticamente.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { InvariantResult, InvariantHit } from './types.js';

const PATTERN_ID = 'P-018';
const PATTERN_NAME =
  'Send WhatsApp texto_libre sin validación de ventana 24h';
const ROOT_DIR = path.resolve(process.cwd());

/**
 * Archivos donde puede vivir la lógica de send. El primer archivo es el
 * canónico (endpoint principal). Si se extrae helper, agregarlo acá.
 *
 * Si crece a >5 archivos, refactorear el cazador.
 */
const ARCHIVOS_SCAN: readonly string[] = [
  'api/whatsapp/send.ts',
];

/**
 * Allowlist por archivo: vacía. Si en algún momento es legítimo NO validar
 * ventana en un caller específico (ej: endpoint dedicado a plantillas HSM
 * que NUNCA acepta `texto_libre`), agregar acá con razón documentada.
 *
 * Si crece a >5 entradas, refactorear el cazador o re-diseñar el endpoint.
 */
const ALLOWLIST_FILES: ReadonlySet<string> = new Set<string>();

interface PatternCheck {
  nombre: string;
  /** Regex que debe matchear al menos una vez en el archivo. */
  regex: RegExp;
  /** Explicación cuando falta — POR QUÉ es importante + CÓMO arreglarlo. */
  faltanteExplain: string;
}

const PATTERNS_REQUERIDOS: readonly PatternCheck[] = [
  {
    nombre: 'lectura de whatsapp_conversaciones',
    regex: /\.collection\s*\(\s*['"`]whatsapp_conversaciones['"`]/,
    faltanteExplain:
      'la validación de ventana 24h requiere LEER ' +
      '`whatsapp_conversaciones/{wa_id}` para obtener el timestamp del último ' +
      'mensaje entrante. Patrón canónico: ' +
      '`const convSnap = await db.collection(\'whatsapp_conversaciones\').doc(wa_id).get();`. ' +
      'Si la lectura se movió a un helper externo, agregar el path a ' +
      'ARCHIVOS_SCAN en scripts/invariantes/check-whatsapp-window-24h.ts.',
  },
  {
    nombre: 'referencia a ultimoMensajeEntrante',
    regex: /ultimoMensajeEntrante/,
    faltanteExplain:
      'el doc `whatsapp_conversaciones/{wa_id}` tiene el campo ' +
      '`ultimoMensajeEntrante: { wamid, timestamp, preview, tipo }` que el ' +
      'webhook entrante escribe. Para validar la ventana 24h, el endpoint debe ' +
      'leer `ultimoMensajeEntrante.timestamp` y compararlo con `Date.now()`. ' +
      'Si el código usa otro nombre o sub-objeto, alinear al shape canónico ' +
      'que persiste `api/whatsapp/webhook.ts::persistirMensajeEntrante`.',
  },
  {
    nombre: 'comparación temporal 24h (24 * 60 * 60 * 1000 | 86400000 | "24h")',
    regex: /24\s*\*\s*60\s*\*\s*60\s*\*\s*1000|86_?400_?000|24h/i,
    faltanteExplain:
      'la lógica de comparación temporal debe expresar 24 horas explícitamente ' +
      'en el archivo. Patrones aceptados: `24 * 60 * 60 * 1000`, `86400000`, ' +
      '`86_400_000` o comentario contiguo con la cadena `24h` (cuando se usa ' +
      'una constante extraída). Sin esta comparación, no hay forma de saber ' +
      'si el `ultimoMensajeEntrante` está dentro o fuera de la ventana de ' +
      'servicio que Meta enforce.',
  },
  {
    nombre: 'respuesta "window-cerrada"',
    regex: /window-cerrada/,
    faltanteExplain:
      'cuando la ventana 24h está cerrada (o no hay conversación previa), el ' +
      'endpoint debe responder con `error: \'window-cerrada\'` (string literal ' +
      'convencionado) para que el frontend pueda detectar el caso específico y ' +
      'sugerir al user enviar una plantilla HSM en lugar de texto libre. Otros ' +
      'mensajes de error (p.ej. error genérico de Meta) no permiten esta UX.',
  },
];

interface ArchivoCargado {
  path: string;
  contenido: string;
}

async function cargarArchivosExistentes(
  rels: readonly string[],
): Promise<ArchivoCargado[]> {
  const out: ArchivoCargado[] = [];
  for (const rel of rels) {
    if (ALLOWLIST_FILES.has(rel)) continue;
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

export async function check(): Promise<InvariantResult> {
  const hits: InvariantHit[] = [];
  const notes: string[] = [];

  const archivos = await cargarArchivosExistentes(ARCHIVOS_SCAN);

  if (archivos.length === 0) {
    notes.push(
      'No se encontró ningún archivo de send WhatsApp ' +
        `(${ARCHIVOS_SCAN.join(', ')}). PASS silent — sprint WA-2 todavía no entrega.`,
    );
    return {
      patternId: PATTERN_ID,
      patternName: PATTERN_NAME,
      status: 'pass',
      hits,
      notes,
    };
  }

  // Para cada archivo: si menciona `'texto_libre'`, debe contener los 4
  // patterns. Si NO menciona `'texto_libre'` (ej: helper sólo de plantillas
  // futuro), skipear.
  for (const arch of archivos) {
    const mencionaTextoLibre =
      /['"`]texto_libre['"`]/.test(arch.contenido);
    if (!mencionaTextoLibre) {
      notes.push(
        `${arch.path}: no menciona 'texto_libre' — skip (no aplica regla P-018).`,
      );
      continue;
    }

    for (const p of PATTERNS_REQUERIDOS) {
      if (!p.regex.test(arch.contenido)) {
        hits.push({
          file: arch.path,
          line: 1,
          snippet: `(falta pattern: ${p.nombre})`,
          explanation:
            `Pattern requerido faltante: \`${p.nombre}\`. ${p.faltanteExplain} ` +
            `Cazador P-018 escanea ${ARCHIVOS_SCAN.map((p) => '`' + p + '`').join(', ')} ` +
            `por los 4 invariantes críticos de la ventana 24h cuando el archivo ` +
            `acepta envíos \`texto_libre\`. Allowlist por archivo en ` +
            `scripts/invariantes/check-whatsapp-window-24h.ts (vacía al inicio — ` +
            `si crece >5 entradas, refactorear).`,
        });
      }
    }
  }

  notes.push(
    `Escaneados ${archivos.length} archivo(s) de send WhatsApp: ` +
      `${archivos.map((a) => a.path).join(', ')}.`,
  );
  notes.push(
    `Patterns requeridos: ${PATTERNS_REQUERIDOS.length}. ` +
      `Hits: ${hits.length}.`,
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
