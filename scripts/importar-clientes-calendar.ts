/**
 * Import one-shot: sube ~9,096 clientes desde el CSV histórico de Google
 * Calendar a la colección `clientes` de Firestore.
 *
 * El CSV vive en la Mac de Jorge (NO en el repo) en:
 *   ~/Downloads/clientes_para_importar.csv
 *
 * Columnas esperadas (header row):
 *   nombre, telefono, coordenadas, direccion_escrita,
 *   rnc, razon_social,
 *   total_servicios, fecha_ultimo_servicio, monto_total_historico,
 *   equipos_atendidos, marcas_habituales, bancos_pago
 *
 * Idempotente: si el cliente ya existe (por teléfono normalizado), enriquece
 * SOLO con `rnc`, `razonSocial`, `legacyMetricas` (y dirección si el cliente
 * actual no la tiene). NO sobrescribe nombre ni `origen` previo.
 *
 * Genera además:
 *   - `config_web/sitio.marcasPopulares` con el top 12 de marcas detectadas
 *     (capitalizadas) para autocomplete en formularios.
 *
 * Uso:
 *   npx tsx scripts/importar-clientes-calendar.ts            # ejecuta el import
 *   npx tsx scripts/importar-clientes-calendar.ts --dry-run  # solo cuenta y reporta
 *
 * Auth (mismo patrón que `consolidar-counter-facturas.ts`):
 *   1) Si GOOGLE_APPLICATION_CREDENTIALS apunta a un JSON existente, se usa.
 *   2) Si existe ./service-account.json en el cwd, se usa.
 *   3) Si las 3 env vars FIREBASE_PROJECT_ID|CLIENT_EMAIL|PRIVATE_KEY están
 *      seteadas, se usa cert() inline.
 *   4) Si nada, error claro.
 */
import { initializeApp, getApps, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { parse } from 'csv-parse/sync';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const CSV_PATH_DEFAULT = `${process.env.HOME}/Downloads/clientes_para_importar.csv`;
const BATCH_SAFE_LIMIT = 400; // Firestore tope = 500; dejamos margen.

function normalizarTelefono(tel: string | undefined | null): string {
  if (!tel) return '';
  let d = String(tel).replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  return d.length === 10 ? d : '';
}

function parseCoords(s: string | undefined): { lat: number; lng: number } | undefined {
  if (!s) return undefined;
  const m = String(s).match(/^\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*$/);
  if (!m) return undefined;
  const lat = parseFloat(m[1]);
  const lng = parseFloat(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  return { lat, lng };
}

function parseEntero(s: string | undefined): number {
  if (!s) return 0;
  const n = parseInt(String(s).replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

function parseDecimal(s: string | undefined): number {
  if (!s) return 0;
  const n = parseFloat(String(s).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function capitalizar(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

// Heurística para nombres de marca de electrodomésticos: 2-3 letras se asume
// acrónimo (LG, GE, JVC) y va en mayúsculas; 4+ letras va Title Case
// (Mabe, Whirlpool, Samsung, Frigidaire). Si en el futuro aparece una marca
// corta que no es acrónimo, se agrega una whitelist puntual.
function capitalizarMarca(m: string): string {
  const trimmed = m.trim();
  if (trimmed.length <= 3) return trimmed.toUpperCase();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

function stripUndefined<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return value.map(v => stripUndefined(v)) as any;
  }
  if (value instanceof Date) return value;
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue;
      out[k] = stripUndefined(v);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return out as any;
  }
  return value;
}

function inicializarAdmin(): void {
  if (getApps().length > 0) return;

  const gacPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const localPath = resolve(process.cwd(), 'service-account.json');

  if (gacPath && existsSync(gacPath)) {
    console.log(`[INFO] Usando GOOGLE_APPLICATION_CREDENTIALS: ${gacPath}`);
    initializeApp({ credential: applicationDefault() });
    return;
  }

  if (existsSync(localPath)) {
    console.log('[INFO] Usando service-account.json local');
    const json = JSON.parse(readFileSync(localPath, 'utf8'));
    initializeApp({
      credential: cert({
        projectId: json.project_id,
        clientEmail: json.client_email,
        privateKey: json.private_key,
      }),
      projectId: json.project_id,
    });
    return;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKeyRaw) {
    console.error(
      '[ERROR] Faltan credenciales del Admin SDK. Probá una de estas opciones:\n' +
      '  1) Descargar service-account.json desde Firebase Console y ponerlo en la raíz del repo.\n' +
      '  2) Setear GOOGLE_APPLICATION_CREDENTIALS apuntando al JSON.\n' +
      '  3) Setear FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY.',
    );
    process.exit(1);
  }

  const privateKey = privateKeyRaw.replace(/\\n/g, '\n');
  initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
    projectId,
  });
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const csvPath = args.find(a => !a.startsWith('--')) || CSV_PATH_DEFAULT;

  if (!existsSync(csvPath)) {
    console.error(`[ERROR] No existe el archivo CSV: ${csvPath}`);
    console.error('         Pasá la ruta como primer argumento si no es la default.');
    process.exit(1);
  }

  console.log(`[INFO] Modo: ${dryRun ? 'DRY-RUN (no escribe nada)' : 'APLICAR cambios'}`);
  console.log(`[INFO] Leyendo CSV: ${csvPath}`);

  const content = readFileSync(csvPath, 'utf8');
  const rows: Row[] = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  console.log(`[INFO] Filas en CSV: ${rows.length}`);

  inicializarAdmin();
  const db = getFirestore();

  // Pre-cargar todos los clientes existentes por teléfono normalizado para
  // hacer el lookup en memoria (evita 9k reads individuales).
  console.log('[INFO] Cargando clientes existentes...');
  const existentesSnap = await db.collection('clientes').get();
  // El flag `creadoEnEsteBatch` permite detectar cuando una segunda fila del CSV
  // con el mismo teléfono cae en la rama de update mientras el set previo todavía
  // no fue comiteado. Firestore prohíbe `set + update` sobre el mismo doc en el
  // mismo batch (tira "Cannot perform set and update on the same document"); en
  // ese caso usamos `set(..., { merge: true })` que sí es legal.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existentes = new Map<string, { ref: FirebaseFirestore.DocumentReference; data: any; creadoEnEsteBatch?: boolean }>();
  for (const docu of existentesSnap.docs) {
    const data = docu.data();
    const tel = normalizarTelefono(data.telefonoNormalizado || data.telefono);
    if (tel) existentes.set(tel, { ref: docu.ref, data });
  }
  console.log(`[INFO] Clientes existentes con teléfono válido: ${existentes.size}`);

  let creados = 0;
  let actualizados = 0;
  let skippedSinTelefono = 0;
  const malformados: { fila: number; nombre: string; telefono: string }[] = [];

  let batch = db.batch();
  let opsEnBatch = 0;

  // Acumulador de marcas (para popularizar autocomplete público).
  const marcasFreq = new Map<string, number>();

  const resetCreadoEnEsteBatch = () => {
    // Después de commit exitoso, ningún entry sigue siendo "del batch actual".
    for (const entry of existentes.values()) {
      if (entry.creadoEnEsteBatch) entry.creadoEnEsteBatch = false;
    }
  };

  const commitIfNeeded = async (force = false) => {
    if (opsEnBatch === 0) return;
    if (!force && opsEnBatch < BATCH_SAFE_LIMIT) return;
    if (dryRun) {
      // En dry-run no comitea; reseteamos el contador para no afectar los números.
      batch = db.batch();
      opsEnBatch = 0;
      resetCreadoEnEsteBatch();
      return;
    }
    await batch.commit();
    console.log(`[OK]  Batch comiteado (${opsEnBatch} ops). Acumulado: ${creados + actualizados}/${rows.length}`);
    batch = db.batch();
    opsEnBatch = 0;
    resetCreadoEnEsteBatch();
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const nombre = String(row.nombre || '').trim();
    const tel = normalizarTelefono(row.telefono);

    if (!tel) {
      skippedSinTelefono++;
      malformados.push({
        fila: i + 2, // +2 = +1 (header) + 1 (1-indexed)
        nombre,
        telefono: String(row.telefono || '').trim(),
      });
      continue;
    }

    const coords = parseCoords(row.coordenadas);
    const direccionEscrita = String(row.direccion_escrita || '').trim();
    const rncRaw = String(row.rnc || '').trim();
    const rncDigitos = rncRaw.replace(/\D/g, '');
    const rnc = rncDigitos.length >= 9 && rncDigitos.length <= 11 ? rncDigitos : undefined;
    // razonSocial es huérfana sin rnc: el UI condiciona su render a la presencia
    // del rnc (Clientes.tsx), por lo que persistirla sin rnc deja datos invisibles.
    const razonSocial = rnc ? (String(row.razon_social || '').trim() || undefined) : undefined;

    const marcasHabitualesCsv = String(row.marcas_habituales || '').trim();
    if (marcasHabitualesCsv) {
      for (const m of marcasHabitualesCsv.split(',').map(s => s.trim()).filter(Boolean)) {
        const key = m.toLowerCase();
        marcasFreq.set(key, (marcasFreq.get(key) || 0) + 1);
      }
    }

    const legacyMetricas = {
      totalServicios: parseEntero(row.total_servicios),
      fechaUltimoServicio: String(row.fecha_ultimo_servicio || '').trim(),
      montoTotalHistorico: parseDecimal(row.monto_total_historico),
      equiposAtendidos: String(row.equipos_atendidos || '').trim(),
      marcasHabituales: marcasHabitualesCsv,
      bancosPago: String(row.bancos_pago || '').trim(),
    };

    const yaExistente = existentes.get(tel);

    if (yaExistente) {
      // Cliente ya existe: enriquecer SOLO con campos que aportan datos nuevos.
      // NO sobrescribir nombre/origen (puede tener `manual` o `cita_publica`
      // y queremos preservarlo). Solo agregamos dirección si no la tiene.
      // Construimos el update SIN timestamps; los agregamos después de
      // `stripUndefined` para evitar que la función recurse sobre el sentinel
      // de `FieldValue.serverTimestamp()` y lo convierta en `{}`.
      const update: Record<string, unknown> = {
        legacyMetricas,
      };
      if (rnc && !yaExistente.data.rnc) update.rnc = rnc;
      if (razonSocial && !yaExistente.data.razonSocial) update.razonSocial = razonSocial;
      if (direccionEscrita && !yaExistente.data.direccion) {
        update.direccion = direccionEscrita;
      }
      if (coords && typeof yaExistente.data.lat !== 'number') {
        update.lat = coords.lat;
        update.lng = coords.lng;
      }
      // Campos de teléfono normalizado (para clientes legacy que no lo tengan).
      if (!yaExistente.data.telefonoNormalizado) update.telefonoNormalizado = tel;

      const limpio = stripUndefined(update) as Record<string, unknown>;
      const updateConTimestamp = {
        ...limpio,
        updatedAt: FieldValue.serverTimestamp(),
      };

      if (yaExistente.creadoEnEsteBatch) {
        // El doc fue creado con `batch.set(...)` en este mismo batch. Firestore
        // rechaza `set + update` sobre el mismo doc en el mismo batch. Usamos
        // `set(..., { merge: true })` que es semánticamente equivalente a un
        // update y sí es legal en este escenario.
        batch.set(yaExistente.ref, updateConTimestamp, { merge: true });
      } else {
        batch.update(yaExistente.ref, updateConTimestamp);
      }
      actualizados++;
      opsEnBatch++;
    } else {
      // Cliente nuevo. Usamos teléfono normalizado como ID (mismo patrón que
      // `buscarOCrearCliente`) para que un re-run del script encuentre el doc.
      const ref = db.collection('clientes').doc(tel);
      // Construimos el data SIN timestamps; los agregamos después del strip
      // para evitar que `stripUndefined` recurse sobre el sentinel de
      // `FieldValue.serverTimestamp()` y lo convierta en `{}` (el sentinel es
      // un objeto sin props enumerables propias, así que el loop de
      // Object.entries() lo "vacía").
      const data: Record<string, unknown> = {
        nombre: nombre || `Cliente ${tel}`,
        telefono: String(row.telefono || '').trim(),
        telefonoNormalizado: tel,
        direccion: direccionEscrita,
        rnc,
        razonSocial,
        origen: 'calendar_legacy',
        legacyMetricas,
      };
      if (coords) {
        data.lat = coords.lat;
        data.lng = coords.lng;
      }

      const limpio = stripUndefined(data) as Record<string, unknown>;
      const dataConTimestamps = {
        ...limpio,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };
      batch.set(ref, dataConTimestamps);
      creados++;
      opsEnBatch++;
      // Registrar localmente con flag `creadoEnEsteBatch: true` para que, si una
      // fila posterior del CSV (mismo teléfono normalizado) cae en la rama de
      // update, usemos `set(merge:true)` en vez de `update` (Firestore prohíbe
      // `set + update` sobre el mismo doc en el mismo batch).
      existentes.set(tel, {
        ref,
        data: { ...data, telefonoNormalizado: tel },
        creadoEnEsteBatch: true,
      });
    }

    await commitIfNeeded(false);
  }

  await commitIfNeeded(true);

  // Pre-poblar marcas populares en config_web/sitio
  const topMarcas = [...marcasFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([m]) => capitalizarMarca(m));

  if (topMarcas.length > 0 && !dryRun) {
    await db.collection('config_web').doc('sitio').set(
      {
        marcasPopulares: topMarcas,
        marcasPopularesActualizadasEn: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }

  console.log('');
  console.log('─── Resumen ───');
  console.log(`Filas procesadas:       ${rows.length}`);
  console.log(`Creados:                ${creados}`);
  console.log(`Actualizados:           ${actualizados}`);
  console.log(`Skipped (sin teléfono): ${skippedSinTelefono}`);
  console.log(`Marcas top (top 12):    ${topMarcas.join(', ') || '(ninguna)'}`);
  if (dryRun) {
    console.log('');
    console.log('[INFO] DRY-RUN: no se escribió nada en Firestore.');
    console.log('       Re-corré sin --dry-run para aplicar los cambios.');
  }

  if (malformados.length > 0) {
    console.log('');
    console.log(`[WARN] ${malformados.length} filas con teléfono malformado (skippeadas):`);
    const muestra = malformados.slice(0, 30);
    for (const m of muestra) {
      console.log(`       fila ${m.fila}: "${m.nombre}" tel="${m.telefono}"`);
    }
    if (malformados.length > muestra.length) {
      console.log(`       ... y ${malformados.length - muestra.length} más.`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[ERROR] Fallo en import:', err);
    process.exit(1);
  });
