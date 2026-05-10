/**
 * Auditoría de schema drift: compara campos en docs reales de Firestore contra
 * los keys declarados en las interfaces TypeScript de `src/types/index.ts`.
 *
 * Reporta:
 *   - solo_en_firestore: campos en docs reales que NO están en TS (drift+).
 *   - solo_en_typescript: campos declarados en TS que NO aparecen en NINGÚN
 *     doc sampleado (drift- o muestreo insuficiente).
 *   - compartidos: campos en ambos (no es drift).
 *
 * Read-only por diseño. No modifica nada en Firestore. Sin --apply.
 *
 * Uso:
 *   npx tsx scripts/auditoria/schema-drift.ts
 *   npm run audit:schema-drift
 *
 * Requiere `service-account.json` en la raíz del repo (mismo patrón que
 * `scripts/auditoria-emails-personal-vs-usuarios.ts`).
 *
 * Limitaciones:
 *   - Muestreo aleatorio sin orden, N=20 por colección. Variantes raras
 *     pueden no aparecer (ej: orden cancelada vs en_gestion).
 *   - No detecta type drift (string vs number) — solo presence drift.
 *   - No baja la jerarquía de objetos anidados (ej: `auditoria` se trata
 *     como un solo key, no se entra a `auditoria.creadaPor`).
 *
 * Whitelist de campos esperados — fuente de verdad: `src/types/index.ts`
 * (commit HEAD del repo). Si la interfaz TS evoluciona, actualizar este
 * archivo. Si aparecen campos legítimos nuevos en Firestore, agregarlos a
 * la interfaz TS (sprint propio).
 *
 * Origen: SPRINT-112 fase documental (2026-05-10).
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

const SERVICE_ACCOUNT_PATH = path.resolve('service-account.json');
const SAMPLE_SIZE = 20;

if (!getApps().length) {
  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    console.error('[ERROR] No existe service-account.json en la raíz del repo.');
    console.error('Esperado: archivo de service account de Firebase Admin SDK.');
    console.error('Sin esto, el script no puede leer Firestore.');
    process.exit(1);
  }
  const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf-8'));
  initializeApp({ credential: cert(serviceAccount) });
}

const db = getFirestore();

/**
 * Whitelist por colección. Cada entrada: keys que la interfaz TS declara
 * como existentes (required + opcionales). Snapshot al 2026-05-10 — debe
 * actualizarse cuando `src/types/index.ts` cambie.
 *
 * NOTA: agregamos campos comunes que viven fuera del strict-shape pero son
 * legítimos en Firestore (ej: `_seedAt` para imports, `id` para denormalizar).
 * NO agregar campos drift acá sólo para silenciar el reporte — el reporte
 * debe gritar para que se decida en sprint propio.
 */
const SCHEMA_WHITELIST: Record<string, Set<string>> = {
  ordenes_servicio: new Set([
    'id', 'numero', 'numeroOS', 'clienteId', 'clienteNombre', 'clienteTelefono',
    'clienteDireccion', 'clienteEmail', 'clienteCedula', 'equipoTipo', 'equipoMarca',
    'equipoModelo', 'equipoSerie', 'descripcion', 'fase', 'estado', 'estadoSimple',
    'tecnicoId', 'tecnicoNombre', 'ayudanteId', 'ayudanteNombre', 'operariaId',
    'operariaNombre', 'responsableId', 'responsableNombre', 'creadoPor', 'creadoEn',
    'creadoPorNombre', 'updatedAt', 'updatedBy', 'fechaCita', 'horaCita',
    'fechaAgendada', 'fechaCierre', 'historialFases', 'auditoria', 'cierre',
    'cotizaciones', 'cotizacionId', 'cotizacionAprobada', 'precioFinal',
    'estadoAprobacion', 'aprobadoPor', 'aprobadoPorNombre', 'fechaAprobacion',
    'soloChequeo', 'sugerenciasSoloChequeo', 'pagos', 'totalPagado', 'facturada',
    'facturaId', 'comisionTecnicoMonto', 'comisionTecnicoNombre',
    'comisionAyudanteMonto', 'comisionAyudanteNombre', 'eliminada', 'eliminadaPor',
    'eliminadaPorId', 'eliminadaEn', 'eliminadaMotivo', 'cancelada', 'canceladaPor',
    'canceladaEn', 'canceladaMotivo', 'cerradaPor', 'cerradaEn', 'cerradaPorId',
    'trackingGPS', 'tokenTracking', 'origen', 'campania', 'modalidad', 'garantia',
    'fotosCierre', 'piezas', 'standbyPiezas', 'notas', 'notasInternas',
    'visitaPrevia', 'reagendada', 'reagendadaMotivo', 'sugeridaPor', 'sugeridaEn',
  ]),
  clientes: new Set([
    'id', 'nombre', 'telefono', 'telefonoNormalizado', 'email', 'cedula',
    'rnc', 'direccion', 'sector', 'ciudad', 'provincia', 'zona', 'lat', 'lng',
    'tokenTracking', 'creadoEn', 'creadoPor', 'updatedAt', 'updatedBy',
    'origen', 'tags', 'notas', 'ultimaCita', 'totalServicios', 'esEmpresa',
    'empresaAliadaId', 'empresaAliadaNombre',
  ]),
  personal: new Set([
    'id', 'nombre', 'rol', 'telefono', 'email', 'uid', 'especialidad', 'zona',
    'horario', 'color', 'disponibilidad', 'sueldoMensual', 'comisionPorcentaje',
    'fechaIngreso', 'fechaAlta', 'fechaBaja', 'activo', 'avatar', 'permisos',
    'permisosSistema', 'permisosPersonalizados', 'iaHabilitada',
    'tokenWhatsapp', 'creadoEn', 'creadoPor', 'updatedAt', 'updatedBy',
  ]),
  usuarios: new Set([
    'id', 'uid', 'nombre', 'email', 'rol', 'permisos', 'permisosSistema',
    'permisosPersonalizados', 'iaHabilitada', 'activo', 'creadoEn', 'updatedAt',
  ]),
  cotizaciones: new Set([
    'id', 'numero', 'numeroQT', 'ordenId', 'clienteId', 'clienteNombre',
    'items', 'subtotal', 'itbis', 'total', 'estado', 'fechaCreacion',
    'fechaAprobacion', 'aprobadaPor', 'creadoPor', 'creadoEn', 'updatedAt',
    'notas', 'modalidad',
  ]),
  facturas: new Set([
    'id', 'numero', 'numeroFAC', 'numeroCG', 'ordenId', 'clienteId',
    'clienteNombre', 'items', 'subtotal', 'itbis', 'total', 'estado',
    'fechaEmision', 'fechaCierre', 'cerradaPor', 'creadoPor', 'creadoEn',
    'updatedAt', 'modalidad', 'tipoComprobante', 'comisionTecnicoMonto',
    'comisionTecnicoNombre', 'comisionAyudanteMonto', 'comisionAyudanteNombre',
    'pagos', 'totalPagado', 'pagada', 'metodoPago',
  ]),
  productos: new Set([
    'id', 'nombre', 'descripcion', 'precio', 'precioCompra', 'unidad',
    'categoria', 'stock', 'activo', 'creadoEn', 'updatedAt',
  ]),
  gastos: new Set([
    'id', 'concepto', 'categoria', 'monto', 'fecha', 'metodoPago',
    'comprobante', 'notas', 'creadoPor', 'creadoEn', 'updatedAt',
  ]),
  citas_por_confirmar: new Set([
    'id', 'clienteNombre', 'clienteTelefono', 'clienteEmail', 'clienteDireccion',
    'equipoTipo', 'descripcion', 'fechaPropuesta', 'horaPropuesta', 'estado',
    'origen', 'calendarioId', 'creadoEn', 'updatedAt', 'confirmadaPor',
    'rechazadaPor', 'motivoRechazo',
  ]),
  notificaciones: new Set([
    'id', 'userId', 'destinatarioId', 'tipo', 'titulo', 'mensaje', 'leida',
    'fechaCreacion', 'fechaLectura', 'enlace', 'metadata', 'origen',
  ]),
  campanas_marketing: new Set([
    'id', 'nombre', 'plantillaId', 'plantillaNombre', 'fecha', 'fechaCreacion',
    'estado', 'creadaPor', 'creadaPorNombre', 'creadaEn', 'totalClientes',
    'totalEnviados', 'totalReactivados', 'overrideCooldown', 'overrideCooldownPor',
    'overrideCooldownPorNombre', 'overrideCooldownEn', 'overrideCooldownMotivo',
    'cooldownDias', 'criterios', 'mensaje',
  ]),
};

type ColeccionDriftReport = {
  coleccion: string;
  docsSampleados: number;
  docsTotalEstimado: number;
  campos_solo_firestore: string[];
  campos_solo_typescript: string[];
  campos_compartidos: number;
};

async function muestrearColeccion(nombre: string): Promise<{
  campos: Set<string>;
  total: number;
  sampleados: number;
}> {
  const snap = await db.collection(nombre).limit(SAMPLE_SIZE).get();
  const campos = new Set<string>();
  for (const doc of snap.docs) {
    const data = doc.data();
    for (const key of Object.keys(data)) {
      campos.add(key);
    }
  }
  // Estimación rápida del total (no es exacta: requeriría count(), que en
  // Firestore Admin SDK existe pero consume reads; preferimos estimación).
  return { campos, total: snap.size === SAMPLE_SIZE ? -1 : snap.size, sampleados: snap.size };
}

function compararSets(real: Set<string>, declarado: Set<string>): {
  solo_firestore: string[];
  solo_typescript: string[];
  compartidos: number;
} {
  const solo_firestore: string[] = [];
  const solo_typescript: string[] = [];
  let compartidos = 0;

  for (const k of real) {
    if (declarado.has(k)) compartidos++;
    else solo_firestore.push(k);
  }
  for (const k of declarado) {
    if (!real.has(k)) solo_typescript.push(k);
  }
  solo_firestore.sort();
  solo_typescript.sort();
  return { solo_firestore, solo_typescript, compartidos };
}

async function main() {
  console.log('=== Schema drift audit ===');
  console.log(`Sample size por colección: ${SAMPLE_SIZE}`);
  console.log(`Colecciones auditadas: ${Object.keys(SCHEMA_WHITELIST).length}`);
  console.log('');

  const reports: ColeccionDriftReport[] = [];

  for (const coleccion of Object.keys(SCHEMA_WHITELIST)) {
    process.stdout.write(`[${coleccion}] muestreando... `);
    try {
      const { campos: real, sampleados, total } = await muestrearColeccion(coleccion);
      const declarado = SCHEMA_WHITELIST[coleccion];
      const cmp = compararSets(real, declarado);
      reports.push({
        coleccion,
        docsSampleados: sampleados,
        docsTotalEstimado: total === -1 ? SAMPLE_SIZE : total,
        campos_solo_firestore: cmp.solo_firestore,
        campos_solo_typescript: cmp.solo_typescript,
        campos_compartidos: cmp.compartidos,
      });
      console.log(`OK (${sampleados} docs, ${cmp.solo_firestore.length} drift+, ${cmp.solo_typescript.length} drift-)`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`ERROR: ${message}`);
    }
  }

  console.log('');
  console.log('=== Reporte por colección ===');
  console.log('');

  for (const r of reports) {
    console.log(`### ${r.coleccion}`);
    console.log(`Docs sampleados: ${r.docsSampleados}${r.docsTotalEstimado === SAMPLE_SIZE ? '+' : ''}`);
    console.log(`Compartidos (TS ∩ Firestore): ${r.campos_compartidos} keys`);

    if (r.campos_solo_firestore.length > 0) {
      console.log(`Drift+ (solo en Firestore, NO declarado en TS): ${r.campos_solo_firestore.length}`);
      for (const k of r.campos_solo_firestore) {
        console.log(`  - ${k}`);
      }
    } else {
      console.log('Drift+: 0');
    }

    if (r.campos_solo_typescript.length > 0) {
      console.log(`Drift- (solo en TS, no aparece en muestreo): ${r.campos_solo_typescript.length}`);
      for (const k of r.campos_solo_typescript) {
        console.log(`  - ${k}`);
      }
    } else {
      console.log('Drift-: 0');
    }
    console.log('');
  }

  // Resumen final
  console.log('=== Resumen ===');
  const totalDriftPlus = reports.reduce((acc, r) => acc + r.campos_solo_firestore.length, 0);
  const totalDriftMinus = reports.reduce((acc, r) => acc + r.campos_solo_typescript.length, 0);
  const totalCompartidos = reports.reduce((acc, r) => acc + r.campos_compartidos, 0);
  console.log(`Total compartidos:      ${totalCompartidos}`);
  console.log(`Total drift+ (en Firestore, no en TS): ${totalDriftPlus}`);
  console.log(`Total drift- (en TS, no en muestreo):  ${totalDriftMinus}`);
  console.log('');
  console.log('Acción recomendada:');
  console.log('- Drift+ alto → la interfaz TS no refleja la realidad. Sprint propio para alinear.');
  console.log('- Drift- alto con muestreo bajo → puede ser falso positivo (aumentar SAMPLE_SIZE).');
  console.log('- Drift- alto con muestreo alto → feature TS sin uso real. Considerar remover.');
  console.log('');
  console.log('Output read-only. Para baseline, redirigir a docs/sprints/SCHEMA_DRIFT_<fecha>.md.');

  process.exit(0);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error('[FATAL]', message);
  process.exit(1);
});
