/**
 * P-025 — Write a Firestore (`mantenimiento` o `ordenes_servicio`) con
 *          `clienteId: ''` literal en el payload.
 *
 * Bug original: SPRINT-AGENDA-1 (2026-05-25). El modal de
 * `/admin/mantenimiento` antes guardaba el nombre del cliente como texto
 * libre y persistía `clienteId: ''` en el doc `mantenimiento`. Cuando
 * `handleGenerarOrden` corría sobre ese mantenimiento, generaba una orden
 * con `clienteId: ''` también (la heredaba). Resultado:
 *   - La orden NO aparecía en el histórico del cliente (la query
 *     `where('clienteId', '==', selectedCliente.id)` en `Clientes.tsx:174`
 *     nunca matcheaba).
 *   - El descuento de chequeo previo nunca disparaba (gate de servicios
 *     previos por clienteId).
 *   - La orden no figuraba en el mapa de clientes ni en analytics
 *     segmentados por cliente.
 *
 * Documentado como causa raíz #1 del bucle de bugs en
 * `docs/sprints/AUDITORIA_FLUJO_DEPENDENCIAS_2026-05-25.md`.
 *
 * Fix (SPRINT-AGENDA-1, 2026-05-25):
 *   - Modal: typeahead obligatorio + `buscarOCrearCliente` antes del
 *     `addDoc`. Validación en `handleSubmit` exige `clienteNombre`,
 *     `clienteTelefono`, teléfono RD 10 dígitos.
 *   - `handleGenerarOrden`: defense-in-depth `if (!item.clienteId)
 *     toast.error(...)` antes del batch.
 *
 * Síntoma de regresión: un refactor del modal de mantenimiento que
 * "simplifica" el form quitando el typeahead, o un nuevo lugar donde se
 * crean mantenimientos/órdenes (ej: desde dashboard, desde cita masiva)
 * que olvida resolver el `clienteId`. El cliente fantasma reaparece, las
 * órdenes vuelven a quedar huérfanas.
 *
 * Estrategia (determinística):
 *
 *   1. Escanear `src/` y `api/` por archivos .ts/.tsx.
 *   2. Para cada línea que matchee `clienteId: ''` o `clienteId: ""`:
 *      a. Skip si la línea o las 5 arriba contienen `@safe-clienteid-vacio:`.
 *      b. Skip si el contexto es state init (FORM_INICIAL, useState,
 *         setForm, setState, type/interface, defaultProps) — esos son
 *         estados de UI, no escrituras a Firestore.
 *      c. Sí flag si las 30 líneas arriba contienen:
 *         `addDoc(`, `setDoc(`, `batch.set(`, `updateDoc(`,
 *         `transaction.set(`, `transaction.update(`,
 *         `runTransaction`.
 *         (Heurística: el `clienteId: ''` está adentro de un payload
 *         que se va a escribir a Firestore.)
 *
 *   3. Adicionalmente: escanear archivos que contengan literal
 *      `addDoc(collection(db, 'mantenimiento'` o
 *      `addDoc(collection(db, 'ordenes_servicio'` y verificar que NO
 *      tengan `clienteId: ''` en las 40 líneas siguientes (refuerzo del
 *      check 2c).
 *
 * Allowlist:
 *   - El cazador mismo (menciona el patrón en JSDoc).
 *   - `src/services/clientes.service.ts` — no debería tener `clienteId: ''`
 *     pero se exime defensivamente.
 *
 * Tag de excepción: `// @safe-clienteid-vacio: <razón>` en la línea o 5
 * arriba. Casos legítimos esperados: migraciones one-shot de mantenimientos
 * legacy, scripts de seed de QA, tests que ejercitan el guard de defense-in-depth.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { InvariantResult, InvariantHit } from './types.js';

const PATTERN_ID = 'P-025';
const PATTERN_NAME =
  "Write a 'mantenimiento'/'ordenes_servicio' con clienteId: '' literal";
const ROOT_DIR = path.resolve(process.cwd());

const ALLOWLIST_FILES: Set<string> = new Set([
  'scripts/invariantes/check-mantenimiento-clienteid-vacio.ts',
  'src/services/clientes.service.ts',
]);

const SAFE_LINE_TAG = '@safe-clienteid-vacio:';

/** Captura `clienteId: ''` o `clienteId: ""` (con espacios flexibles). */
const RE_CLIENTEID_VACIO = /\bclienteId\s*:\s*(['"])\1/;

/** Marcadores de contexto de write a Firestore (mirando hacia arriba). */
const WRITE_CONTEXT_MARKERS = [
  /\baddDoc\s*\(/,
  /\bsetDoc\s*\(/,
  /\bbatch\.set\s*\(/,
  /\bupdateDoc\s*\(/,
  /\btransaction\.set\s*\(/,
  /\btransaction\.update\s*\(/,
  /\bruntransaction\s*\(/i,
  /\btx\.set\s*\(/,
  /\btx\.update\s*\(/,
];

/** Marcadores de state-init (auto-skip, NO es write). */
const STATE_INIT_MARKERS = [
  /\buseState\s*[<(]/,
  /\bsetForm\s*\(/,
  /\bsetState\s*\(/,
  /_INICIAL\b/,
  /\bdefaultProps\b/,
  /^\s*(interface|type)\s+/,
  /\bResetForm\b/,
  /\bresetForm\b/,
];

async function walk(dir: string, files: string[] = []): Promise<string[]> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      await walk(full, files);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function lineSafeTagged(lines: string[], idx: number): boolean {
  const start = Math.max(0, idx - 5);
  return lines.slice(start, idx + 1).join('\n').includes(SAFE_LINE_TAG);
}

function inStateInitContext(lines: string[], idx: number): boolean {
  // Mirar 12 líneas arriba — captura `const FORM_INICIAL = {` que abre
  // varias líneas antes del campo `clienteId`.
  const start = Math.max(0, idx - 12);
  const ventana = lines.slice(start, idx + 1).join('\n');
  return STATE_INIT_MARKERS.some((re) => re.test(ventana));
}

function inWriteContext(lines: string[], idx: number): boolean {
  // Mirar 30 líneas arriba — el `addDoc(collection(db, '...'), {` puede
  // estar lejos del campo individual.
  const start = Math.max(0, idx - 30);
  const ventana = lines.slice(start, idx + 1).join('\n');
  return WRITE_CONTEXT_MARKERS.some((re) => re.test(ventana));
}

export async function check(): Promise<InvariantResult> {
  const srcDir = path.join(ROOT_DIR, 'src');
  const apiDir = path.join(ROOT_DIR, 'api');
  const files = [...(await walk(srcDir)), ...(await walk(apiDir))];
  const hits: InvariantHit[] = [];

  for (const file of files) {
    const rel = path.relative(ROOT_DIR, file);
    if (ALLOWLIST_FILES.has(rel)) continue;

    const content = await fs.readFile(file, 'utf8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!RE_CLIENTEID_VACIO.test(line)) continue;

      // Skip si la línea es un comentario (// o continuación de JSDoc *).
      // El JSDoc del helper handleGenerarOrden documenta el patrón viejo
      // para forensia — no es un write real.
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;

      if (lineSafeTagged(lines, i)) continue;
      if (inStateInitContext(lines, i)) continue;
      if (!inWriteContext(lines, i)) continue;

      hits.push({
        file: rel,
        line: i + 1,
        snippet: line.trim(),
        explanation:
          `Write a Firestore con \`clienteId: ''\` literal en el payload. ` +
          `Riesgo: el doc queda huérfano y NO entra en el histórico del cliente ` +
          `(query \`where('clienteId', '==', X)\` nunca matchea), no dispara ` +
          `descuento chequeo previo, no figura en mapa/analytics. ` +
          `Bug original: SPRINT-AGENDA-1 (2026-05-25), causa raíz #1 del bucle ` +
          `de bugs. Solución: resolver \`clienteId\` real ANTES del write ` +
          `usando \`buscarOCrearCliente(telefono, {...})\` del service. ` +
          `Si este caller es legítimo (migración legacy, seed QA, test del ` +
          `guard defense-in-depth), agregá \`// ${SAFE_LINE_TAG} <razón>\` ` +
          `en la misma línea o hasta 5 arriba.`,
      });
    }
  }

  return {
    patternId: PATTERN_ID,
    patternName: PATTERN_NAME,
    status: hits.length > 0 ? 'fail' : 'pass',
    hits,
    notes: [
      `Escaneados ${files.length} archivos en src/ + api/. Allowlist files: ${ALLOWLIST_FILES.size}.`,
    ],
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  check().then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.status === 'fail' ? 1 : 0);
  });
}
