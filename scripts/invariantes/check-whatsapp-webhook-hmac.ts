/**
 * P-016 — Webhook WhatsApp sin validación HMAC + raw body
 *
 * Bug original (anticipado, no histórico): SPRINT-WA-1 (2026-05-19). Sin
 * cazador, una regresión típica del endpoint `api/whatsapp/webhook.ts`
 * es:
 *   - alguien activa `bodyParser` por error (default Vercel),
 *   - se cambia `crypto.createHmac` por una comparación naive con `==`,
 *   - se quita `timingSafeEqual` "para simplificar".
 * Cada una de esas roturas permite spoofing: un atacante con la URL del
 * webhook (que es semi-pública — Meta la pinea en su dashboard) puede
 * inyectar mensajes falsos al CRM y disparar lógica de bot/notificaciones
 * arbitrariamente. Defense-in-depth crítico.
 *
 * Referencia: https://developers.facebook.com/docs/graph-api/webhooks/getting-started#payload
 *
 * Síntoma de una regresión sin este cazador:
 *   - Tests de E2E pasan (Meta firma correctamente, todo funciona en
 *     condiciones normales).
 *   - Atacante con URL conocida puede POSTear payload sin firma → se
 *     procesa como si fuera de Meta → docs falsos en
 *     `whatsapp_mensajes_inbox/{wamid}` con `wa_id` arbitrario y
 *     conversaciones envenenadas.
 *
 * Causa raíz prevenida: el archivo `api/whatsapp/webhook.ts` debe SIEMPRE
 * tener los 4 invariantes esenciales:
 *   1. `bodyParser: false` (Vercel config) — sin esto el body llega como
 *      JSON parseado y el HMAC se calcula sobre el re-serializado, que
 *      NO coincide byte-a-byte con lo que Meta firmó. Resultado: HMAC
 *      siempre falla en prod (puede pasar en dev por casualidad si el
 *      JSON.stringify es idéntico).
 *   2. Lectura del body como `Buffer` raw (acumulación de chunks).
 *   3. `crypto.createHmac('sha256', SECRET).update(rawBody).digest('hex')`
 *      con el secret del env.
 *   4. Comparación con `crypto.timingSafeEqual` (anti-timing attack —
 *      `==` o `===` filtra info sobre prefijos del digest correcto).
 *
 * Regla: el archivo `api/whatsapp/webhook.ts` (cuando existe) debe
 * contener TODOS los siguientes patterns:
 *   - `crypto.createHmac('sha256'` o `crypto.createHmac("sha256"`
 *   - referencia al header `x-hub-signature-256` (lowercase, formato Meta)
 *   - `timingSafeEqual`
 *   - configuración `bodyParser: false`
 *
 * Estrategia (regex sobre archivo único):
 *   - Si el archivo NO existe → PASS silent (sprint todavía no implementó
 *     el módulo; otros cazadores cubren el resto).
 *   - Si existe pero falta alguno de los 4 patterns → FAIL con explicación
 *     específica por pattern faltante.
 *
 * Allowlist (vacía): no hay forma legítima de tener este endpoint sin los
 * 4 invariantes. Si la lógica se mueve a un helper (ej.
 * `api/_lib/whatsappWebhook.ts` con la función `validarFirmaHmac`), el
 * cazador igual va a encontrar los patterns ahí — escaneamos AMBOS
 * archivos. Si el día de mañana el endpoint cambia de path o se split en
 * varios endpoints, agregar a `ARCHIVOS_A_ESCANEAR`.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { InvariantResult, InvariantHit } from './types.js';

const PATTERN_ID = 'P-016';
const PATTERN_NAME =
  'Webhook WhatsApp sin HMAC SHA-256 + raw body + timingSafeEqual';
const ROOT_DIR = path.resolve(process.cwd());

/**
 * Archivos donde DEBEN aparecer los patterns críticos. El webhook puede
 * delegar al helper o tener la lógica inline — escaneamos los dos y
 * agregamos los matches.
 *
 * Si crece a >5 archivos, refactorear el cazador para enumerar via glob.
 */
const ARCHIVOS_A_ESCANEAR: readonly string[] = [
  'api/whatsapp/webhook.ts',
  'api/_lib/whatsappWebhook.ts',
];

interface PatternCheck {
  nombre: string;
  /** Regex que debe matchear al menos una vez en alguno de los archivos. */
  regex: RegExp;
  /** Mensaje cuando falta — explica POR QUÉ es importante. */
  faltanteExplain: string;
}

const PATTERNS_REQUERIDOS: readonly PatternCheck[] = [
  {
    nombre: 'crypto.createHmac sha256',
    regex: /crypto\.createHmac\s*\(\s*['"`]sha256['"`]/,
    faltanteExplain:
      'el HMAC debe usar SHA-256 (algoritmo que Meta firma). ' +
      'Sin `crypto.createHmac(\'sha256\', secret)`, no podemos validar la firma ' +
      'del header `x-hub-signature-256` y cualquiera puede POSTear payloads falsos ' +
      'al webhook. Agregar la llamada con el secret de `process.env.META_APP_SECRET`.',
  },
  {
    nombre: 'header x-hub-signature-256',
    regex: /x-hub-signature-256/i,
    faltanteExplain:
      'el endpoint debe leer el header `x-hub-signature-256` (Meta lo manda en ' +
      'minúsculas a Vercel). Sin esto no hay material para validar firma. ' +
      'Acceso típico: `req.headers[\'x-hub-signature-256\']`.',
  },
  {
    nombre: 'timingSafeEqual',
    regex: /timingSafeEqual/,
    faltanteExplain:
      'la comparación de digests DEBE usar `crypto.timingSafeEqual` (anti-timing ' +
      'attack). `==` o `===` filtra info byte-a-byte sobre el digest correcto, ' +
      'lo que permite a un atacante recuperar el secret con suficientes intentos. ' +
      'Patrón seguro: `crypto.timingSafeEqual(Buffer.from(esperado, \'hex\'), Buffer.from(recibido, \'hex\'))`.',
  },
  {
    nombre: 'bodyParser: false (Vercel raw body)',
    regex: /bodyParser\s*:\s*false/,
    faltanteExplain:
      'Vercel por default parsea el body como JSON. Eso ROMPE HMAC porque ' +
      'el HMAC se calcula sobre los BYTES exactos que firmó Meta — re-serializar ' +
      'el JSON cambia espacios, orden de keys, etc. Exportar ' +
      '`export const config = { api: { bodyParser: false } }` en el archivo ' +
      'del endpoint Y leer el body manualmente como `Buffer` via stream.',
  },
];

export async function check(): Promise<InvariantResult> {
  const hits: InvariantHit[] = [];
  const notes: string[] = [];

  // Acumular el contenido de los archivos que existen.
  const contenidosPorPath = new Map<string, string>();
  for (const rel of ARCHIVOS_A_ESCANEAR) {
    const full = path.join(ROOT_DIR, rel);
    try {
      const stat = await fs.stat(full);
      if (!stat.isFile()) continue;
    } catch {
      // Archivo no existe — skip silent.
      continue;
    }
    try {
      const raw = await fs.readFile(full, 'utf8');
      contenidosPorPath.set(rel, raw);
    } catch {
      continue;
    }
  }

  if (contenidosPorPath.size === 0) {
    // El módulo aún no fue implementado — PASS silent. Cuando se cree el
    // archivo, este cazador empieza a ser efectivo automáticamente.
    notes.push(
      'No se encontró `api/whatsapp/webhook.ts` ni `api/_lib/whatsappWebhook.ts`. ' +
        'El cazador activa cuando alguno de estos archivos existe. PASS silent.',
    );
    return {
      patternId: PATTERN_ID,
      patternName: PATTERN_NAME,
      status: 'pass',
      hits,
      notes,
    };
  }

  // Concat de todos los archivos para buscar patterns — un pattern puede
  // vivir en el helper o en el endpoint.
  const concatenado = Array.from(contenidosPorPath.values()).join('\n');

  for (const p of PATTERNS_REQUERIDOS) {
    if (!p.regex.test(concatenado)) {
      // Reportamos contra el archivo principal del endpoint (donde
      // típicamente vive). Si no existe el endpoint pero sí el helper,
      // reportamos contra el helper.
      const archivoReporte = contenidosPorPath.has('api/whatsapp/webhook.ts')
        ? 'api/whatsapp/webhook.ts'
        : 'api/_lib/whatsappWebhook.ts';

      hits.push({
        file: archivoReporte,
        line: 1,
        snippet: `(falta pattern: ${p.nombre})`,
        explanation:
          `Pattern requerido faltante: \`${p.nombre}\`. ${p.faltanteExplain} ` +
          `Cazador P-016 escanea ${ARCHIVOS_A_ESCANEAR.map((p) => '`' + p + '`').join(' y ')} por los 4 ` +
          `invariantes críticos del webhook Meta. Si el pattern se movió a otro ` +
          `archivo, agregar el path a \`ARCHIVOS_A_ESCANEAR\` en ` +
          `scripts/invariantes/check-whatsapp-webhook-hmac.ts.`,
      });
    }
  }

  notes.push(
    `Escaneados ${contenidosPorPath.size} archivo(s) del módulo WhatsApp webhook: ` +
      `${Array.from(contenidosPorPath.keys()).join(', ')}.`,
  );
  notes.push(
    `Patterns requeridos: ${PATTERNS_REQUERIDOS.length}. Encontrados: ` +
      `${PATTERNS_REQUERIDOS.length - hits.length}.`,
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
