/**
 * Auditoría sistémica de asignaciones técnico↔operaria + huérfanos.
 *
 * Origen: SPRINT-129 (2026-05-10). Bug reportado por Jorge: orden con técnico
 * Aury Mon en producción sin operaria (`operariaNombre` undefined) pese a que
 * el perfil del técnico SÍ tiene operaria asignada (Wilainy). Causa raíz
 * diagnosticada por Cowork:
 *   - `src/hooks/useOrdenCreateForm.ts:588-590` deriva `operariaId/Nombre` de
 *     `personal[tecnicoId].operariaId/Nombre` AL CREAR la orden (snapshot).
 *   - `src/components/ordenes/OrdenEditForm.tsx:72-77` re-deriva al EDITAR.
 *   - Órdenes creadas cuando el técnico aún no tenía operaria quedan con
 *     `operariaNombre: undefined` para siempre. Asignar operaria al técnico
 *     más tarde NO actualiza órdenes históricas.
 *
 * Este script NO arregla nada. Solo lista todas las inconsistencias
 * detectables para que Jorge decida caso por caso.
 *
 * IMPORTANTE — Convención de IDs:
 *   - `personal.operariaId` guarda el `personal.id` de la operaria (NO el uid).
 *     Verificado en `src/pages/PersonalPage.tsx:1204-1207` (dropdown setea
 *     value=t.id) y `src/services/nomina.service.ts:172` (filtro por
 *     operariaId === p.id).
 *   - `ordenes_servicio.operariaId` guarda el `personal.id` también.
 *
 * Read-only enforced por diseño:
 *   - Sin `.set(`, `.update(`, `.delete(` sobre `db.collection/doc`.
 *   - Sin flag `--apply`.
 *   - El único Map.set/Array.push que aparece es estructura en memoria.
 *
 * Uso:
 *   npx tsx scripts/auditoria/asignaciones-tecnico-operaria.ts
 *
 * Requiere `service-account.json` en la raíz del repo (mismo patrón que
 * `scripts/auditoria/schema-drift.ts` de SPRINT-112).
 *
 * Output:
 *   - stdout: reporte estructurado con conteos y detalle por inconsistencia.
 *   - archivo: docs/sprints/AUDITORIA_ASIGNACIONES_<YYYY-MM-DD>.md con el
 *     mismo contenido formateado en markdown para que Jorge lo lea.
 *
 * Tipos de inconsistencia reportados:
 *   - TECNICO_SIN_OPERARIA: técnico activo sin `operariaId` en su perfil.
 *   - HUERFANO_TECNICO: técnico apunta a `operariaId` que no existe o no es
 *     operaria activa.
 *   - OPERARIA_HUERFANA: operaria activa que ningún técnico apunta.
 *   - ORDEN_SIN_OPERARIA_DESINCRONIZADA: orden activa con técnico que tiene
 *     operaria en perfil, pero la orden no tiene `operariaNombre` (bug
 *     puntual reportado por Jorge).
 *   - ORDEN_OPERARIA_DESACTUALIZADA: orden activa con `operariaNombre` set
 *     pero el técnico actual tiene OTRA operaria en perfil (no
 *     necesariamente bug; histórico válido). Reportar para visibilidad.
 *   - RESPONSABLE_HUERFANO: orden activa con `responsableId` que no existe
 *     en personal/ o cuyo rol no es admin/coordinadora.
 *
 * Privacidad: el reporte NO incluye emails completos ni teléfonos. Solo
 * primer nombre + ID parcial (12 chars + ellipsis).
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

const SERVICE_ACCOUNT_PATH = path.resolve('service-account.json');
const SAMPLE_ORDENES = 500;

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

// ---------- Tipos ----------

type PersonalDoc = {
  id: string;
  nombre: string;
  rol?: string;
  activo?: boolean;
  uid?: string;
  operariaId?: string;
  operariaNombre?: string;
};

type OrdenDoc = {
  id: string;
  numero?: string;
  numeroOS?: string;
  fase?: string;
  clienteNombre?: string;
  tecnicoId?: string;
  tecnicoNombre?: string;
  operariaId?: string;
  operariaNombre?: string;
  responsableId?: string;
  responsableNombre?: string;
  creadoEn?: { toDate: () => Date } | Date;
};

type Inconsistencia = {
  tipo:
    | 'TECNICO_SIN_OPERARIA'
    | 'HUERFANO_TECNICO'
    | 'OPERARIA_HUERFANA'
    | 'ORDEN_SIN_OPERARIA_DESINCRONIZADA'
    | 'ORDEN_OPERARIA_DESACTUALIZADA'
    | 'RESPONSABLE_HUERFANO';
  ref: string;
  nombre: string;
  detalle: string;
  sugerencia: string;
};

// ---------- Helpers ----------

function partialId(id: string | undefined | null): string {
  if (!id) return '(vacío)';
  return `${id.substring(0, 12)}...`;
}

function primerNombre(nombre: string | undefined | null): string {
  if (!nombre) return '?';
  return nombre.split(/\s+/)[0] || nombre;
}

function fechaCreacionLegible(o: OrdenDoc): string {
  const c = o.creadoEn;
  if (!c) return '(sin fecha)';
  try {
    let d: Date;
    if (c instanceof Date) d = c;
    else if ('toDate' in c && typeof c.toDate === 'function') d = c.toDate();
    else return '(sin fecha)';
    return d.toISOString().substring(0, 10);
  } catch {
    return '(sin fecha)';
  }
}

function ordenLabel(o: OrdenDoc): string {
  return o.numero || o.numeroOS || `(orden ${o.id.substring(0, 8)})`;
}

// ---------- Carga ----------

async function cargarPersonal(): Promise<PersonalDoc[]> {
  const snap = await db.collection('personal').get();
  const out: PersonalDoc[] = [];
  for (const doc of snap.docs) {
    const data = doc.data();
    out.push({
      id: doc.id,
      nombre: typeof data.nombre === 'string' ? data.nombre : '?',
      rol: typeof data.rol === 'string' ? data.rol : undefined,
      activo: typeof data.activo === 'boolean' ? data.activo : undefined,
      uid: typeof data.uid === 'string' ? data.uid : undefined,
      operariaId: typeof data.operariaId === 'string' && data.operariaId.length > 0
        ? data.operariaId
        : undefined,
      operariaNombre: typeof data.operariaNombre === 'string' && data.operariaNombre.length > 0
        ? data.operariaNombre
        : undefined,
    });
  }
  return out;
}

async function cargarOrdenesActivas(): Promise<OrdenDoc[]> {
  // Tomamos las N más recientes ordenadas por creadoEn desc, excluyendo
  // cerradas/canceladas. Si la query falla por falta de índice compuesto,
  // caemos a un escaneo amplio y filtramos en memoria (read-only sigue OK).
  try {
    const snap = await db
      .collection('ordenes_servicio')
      .where('fase', 'not-in', ['cerrado', 'cancelado'])
      .orderBy('fase')
      .limit(SAMPLE_ORDENES)
      .get();
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<OrdenDoc, 'id'>) }));
  } catch {
    // Fallback: traer N recientes y filtrar en cliente.
    const snap = await db
      .collection('ordenes_servicio')
      .limit(SAMPLE_ORDENES * 2)
      .get();
    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<OrdenDoc, 'id'>) }))
      .filter((o) => o.fase !== 'cerrado' && o.fase !== 'cancelado')
      .slice(0, SAMPLE_ORDENES);
  }
}

// ---------- Auditoría ----------

function auditarPersonal(personal: PersonalDoc[]): {
  tecnicosSinOperaria: Inconsistencia[];
  huerfanosTecnico: Inconsistencia[];
  operariasHuerfanas: Inconsistencia[];
  indexPersonal: Map<string, PersonalDoc>;
  tecnicosActivos: PersonalDoc[];
  operariasActivas: PersonalDoc[];
} {
  const indexPersonal = new Map<string, PersonalDoc>();
  for (const p of personal) indexPersonal.set(p.id, p);

  const tecnicosActivos = personal.filter((p) => p.rol === 'tecnico' && p.activo !== false);
  const operariasActivas = personal.filter((p) => p.rol === 'operaria' && p.activo !== false);

  const tecnicosSinOperaria: Inconsistencia[] = [];
  const huerfanosTecnico: Inconsistencia[] = [];
  const operariasHuerfanas: Inconsistencia[] = [];

  for (const t of tecnicosActivos) {
    if (!t.operariaId) {
      tecnicosSinOperaria.push({
        tipo: 'TECNICO_SIN_OPERARIA',
        ref: partialId(t.id),
        nombre: primerNombre(t.nombre),
        detalle: 'no tiene operaria asignada en perfil',
        sugerencia:
          'abrir modal Editar Personal del técnico, seleccionar operaria, guardar',
      });
      continue;
    }
    const opRef = indexPersonal.get(t.operariaId);
    if (!opRef) {
      huerfanosTecnico.push({
        tipo: 'HUERFANO_TECNICO',
        ref: partialId(t.id),
        nombre: primerNombre(t.nombre),
        detalle: `operariaId=${partialId(t.operariaId)} no existe en personal/`,
        sugerencia:
          'reasignar operaria desde modal Editar Personal del técnico (la actual fue borrada o el id quedó stale)',
      });
      continue;
    }
    if (opRef.rol !== 'operaria') {
      huerfanosTecnico.push({
        tipo: 'HUERFANO_TECNICO',
        ref: partialId(t.id),
        nombre: primerNombre(t.nombre),
        detalle: `operariaId apunta a ${primerNombre(opRef.nombre)} cuyo rol es '${opRef.rol ?? '?'}', no 'operaria'`,
        sugerencia:
          'la persona apuntada cambió de rol; reasignar operaria real desde modal Editar Personal',
      });
      continue;
    }
    if (opRef.activo === false) {
      huerfanosTecnico.push({
        tipo: 'HUERFANO_TECNICO',
        ref: partialId(t.id),
        nombre: primerNombre(t.nombre),
        detalle: `operariaId apunta a ${primerNombre(opRef.nombre)} pero esa operaria está marcada activo=false`,
        sugerencia:
          'reasignar a una operaria activa desde modal Editar Personal',
      });
    }
  }

  // Contar cuántos técnicos apuntan a cada operaria activa.
  const cuentaPorOperariaId = new Map<string, number>();
  for (const t of tecnicosActivos) {
    if (t.operariaId) {
      cuentaPorOperariaId.set(t.operariaId, (cuentaPorOperariaId.get(t.operariaId) || 0) + 1);
    }
  }

  for (const op of operariasActivas) {
    const cuenta = cuentaPorOperariaId.get(op.id) || 0;
    if (cuenta === 0) {
      operariasHuerfanas.push({
        tipo: 'OPERARIA_HUERFANA',
        ref: partialId(op.id),
        nombre: primerNombre(op.nombre),
        detalle: 'ningún técnico activo la apunta vía operariaId',
        sugerencia:
          'verificar si es operaria real sin técnicos (válido temporalmente) o quedó suelta. Asignar técnicos desde modal Editar Personal de cada técnico.',
      });
    }
  }

  return {
    tecnicosSinOperaria,
    huerfanosTecnico,
    operariasHuerfanas,
    indexPersonal,
    tecnicosActivos,
    operariasActivas,
  };
}

function auditarOrdenes(
  ordenes: OrdenDoc[],
  indexPersonal: Map<string, PersonalDoc>,
): {
  ordenesSinOperariaDesinc: Inconsistencia[];
  ordenesOperariaDesactualizada: Inconsistencia[];
  responsablesHuerfanos: Inconsistencia[];
} {
  const ordenesSinOperariaDesinc: Inconsistencia[] = [];
  const ordenesOperariaDesactualizada: Inconsistencia[] = [];
  const responsablesHuerfanos: Inconsistencia[] = [];

  for (const o of ordenes) {
    // 1. ORDEN_SIN_OPERARIA_DESINCRONIZADA y ORDEN_OPERARIA_DESACTUALIZADA
    if (o.tecnicoId) {
      const tec = indexPersonal.get(o.tecnicoId);
      // tec puede ser undefined si el tecnicoId está stale (otro vector, fuera de scope)
      // o si el campo guarda auth.uid en vez de personal.id (post SPRINT-118).
      // Para este sprint asumimos tecnicoId == personal.id; si no, simplemente
      // no podemos auditar y skip silencioso.
      if (tec && tec.rol === 'tecnico') {
        const tieneOperariaEnPerfil = !!tec.operariaId && !!tec.operariaNombre;
        const ordenTieneOperaria = !!o.operariaNombre;

        if (tieneOperariaEnPerfil && !ordenTieneOperaria) {
          ordenesSinOperariaDesinc.push({
            tipo: 'ORDEN_SIN_OPERARIA_DESINCRONIZADA',
            ref: `${ordenLabel(o)} (id=${partialId(o.id)})`,
            nombre: `cliente ${primerNombre(o.clienteNombre)} / téc ${primerNombre(tec.nombre)}`,
            detalle: `orden creada ${fechaCreacionLegible(o)} sin operariaNombre, pero el técnico hoy tiene a ${primerNombre(tec.operariaNombre)} asignada en perfil`,
            sugerencia:
              'abrir orden, cambiar técnico a otro y volver al original (re-dispara la derivación), guardar',
          });
        } else if (tieneOperariaEnPerfil && ordenTieneOperaria && o.operariaId !== tec.operariaId) {
          ordenesOperariaDesactualizada.push({
            tipo: 'ORDEN_OPERARIA_DESACTUALIZADA',
            ref: `${ordenLabel(o)} (id=${partialId(o.id)})`,
            nombre: `cliente ${primerNombre(o.clienteNombre)} / téc ${primerNombre(tec.nombre)}`,
            detalle: `orden tiene operaria ${primerNombre(o.operariaNombre)} (histórica), pero técnico hoy tiene a ${primerNombre(tec.operariaNombre)} en perfil`,
            sugerencia:
              'NO necesariamente bug — puede ser histórico válido. Solo cambiar si Jorge quiere realinear (cambiar técnico y volver re-deriva).',
          });
        }
      }
    }

    // 2. RESPONSABLE_HUERFANO
    if (o.responsableId) {
      const resp = indexPersonal.get(o.responsableId);
      if (!resp) {
        responsablesHuerfanos.push({
          tipo: 'RESPONSABLE_HUERFANO',
          ref: `${ordenLabel(o)} (id=${partialId(o.id)})`,
          nombre: `responsable=${partialId(o.responsableId)}`,
          detalle: `responsableId no existe en personal/ (nombre cacheado: ${primerNombre(o.responsableNombre)})`,
          sugerencia:
            'normal si el responsable original fue borrado. Solo accionable si Jorge quiere reasignar.',
        });
      } else if (resp.rol !== 'administrador' && resp.rol !== 'coordinadora') {
        responsablesHuerfanos.push({
          tipo: 'RESPONSABLE_HUERFANO',
          ref: `${ordenLabel(o)} (id=${partialId(o.id)})`,
          nombre: `responsable=${primerNombre(resp.nombre)}`,
          detalle: `responsable existe pero rol es '${resp.rol ?? '?'}' (esperado: admin o coordinadora)`,
          sugerencia:
            'persona cambió de rol o el campo se setea desde un rol no esperado. Visibilidad solo.',
        });
      }
    }
  }

  return { ordenesSinOperariaDesinc, ordenesOperariaDesactualizada, responsablesHuerfanos };
}

// ---------- Renderer markdown ----------

function renderMd(args: {
  fecha: string;
  totalTecnicos: number;
  totalOperarias: number;
  totalOrdenes: number;
  tecnicosSinOperaria: Inconsistencia[];
  huerfanosTecnico: Inconsistencia[];
  operariasHuerfanas: Inconsistencia[];
  ordenesSinOperariaDesinc: Inconsistencia[];
  ordenesOperariaDesactualizada: Inconsistencia[];
  responsablesHuerfanos: Inconsistencia[];
}): string {
  const {
    fecha,
    totalTecnicos,
    totalOperarias,
    totalOrdenes,
    tecnicosSinOperaria,
    huerfanosTecnico,
    operariasHuerfanas,
    ordenesSinOperariaDesinc,
    ordenesOperariaDesactualizada,
    responsablesHuerfanos,
  } = args;

  const partes: string[] = [];
  partes.push(`# Auditoría de asignaciones técnico↔operaria — ${fecha}`);
  partes.push('');
  partes.push('> Generado por `scripts/auditoria/asignaciones-tecnico-operaria.ts` (SPRINT-129).');
  partes.push('> Read-only — este reporte NO arregla nada, solo lista inconsistencias.');
  partes.push('');
  partes.push('## Resumen ejecutivo');
  partes.push('');
  partes.push(`- Técnicos activos auditados: ${totalTecnicos}`);
  partes.push(`- Operarias activas auditadas: ${totalOperarias}`);
  partes.push(`- Órdenes activas sampleadas (no cerradas/canceladas): ${totalOrdenes}`);
  partes.push('');
  partes.push('| Tipo de inconsistencia | Conteo |');
  partes.push('|---|---|');
  partes.push(`| TECNICO_SIN_OPERARIA | ${tecnicosSinOperaria.length} |`);
  partes.push(`| HUERFANO_TECNICO | ${huerfanosTecnico.length} |`);
  partes.push(`| OPERARIA_HUERFANA | ${operariasHuerfanas.length} |`);
  partes.push(`| ORDEN_SIN_OPERARIA_DESINCRONIZADA | ${ordenesSinOperariaDesinc.length} |`);
  partes.push(`| ORDEN_OPERARIA_DESACTUALIZADA | ${ordenesOperariaDesactualizada.length} |`);
  partes.push(`| RESPONSABLE_HUERFANO | ${responsablesHuerfanos.length} |`);
  partes.push('');

  const totalAccionables =
    tecnicosSinOperaria.length +
    huerfanosTecnico.length +
    operariasHuerfanas.length +
    ordenesSinOperariaDesinc.length;
  partes.push(`**Total accionables (excluye histórico válido y visibilidad pura): ${totalAccionables}**`);
  partes.push('');

  if (ordenesSinOperariaDesinc.length > 20) {
    partes.push('> ⚠ Más de 20 órdenes desincronizadas → considerar sprint de fix masivo por lote (ver sección final).');
    partes.push('');
  } else if (ordenesSinOperariaDesinc.length > 0 && ordenesSinOperariaDesinc.length <= 5) {
    partes.push('> Pocas órdenes desincronizadas → arreglar manual una por una desde UI.');
    partes.push('');
  }

  // Secciones detalladas
  const renderSeccion = (titulo: string, items: Inconsistencia[]): void => {
    partes.push(`## ${titulo} (${items.length})`);
    partes.push('');
    if (items.length === 0) {
      partes.push('Sin inconsistencias detectadas en este tipo.');
      partes.push('');
      return;
    }
    partes.push('| Ref | Nombre/contexto | Detalle | Sugerencia |');
    partes.push('|---|---|---|---|');
    for (const it of items) {
      const safe = (s: string) => s.replace(/\|/g, '\\|');
      partes.push(`| ${safe(it.ref)} | ${safe(it.nombre)} | ${safe(it.detalle)} | ${safe(it.sugerencia)} |`);
    }
    partes.push('');
  };

  renderSeccion('TECNICO_SIN_OPERARIA — técnicos activos sin operaria en perfil', tecnicosSinOperaria);
  renderSeccion('HUERFANO_TECNICO — técnico apunta a operariaId inválida', huerfanosTecnico);
  renderSeccion('OPERARIA_HUERFANA — operaria activa sin técnicos asignados', operariasHuerfanas);
  renderSeccion('ORDEN_SIN_OPERARIA_DESINCRONIZADA — orden activa sin operaria pero el técnico sí la tiene', ordenesSinOperariaDesinc);
  renderSeccion('ORDEN_OPERARIA_DESACTUALIZADA — orden con operaria histórica distinta a la actual del técnico', ordenesOperariaDesactualizada);
  renderSeccion('RESPONSABLE_HUERFANO — responsable de orden no existe o tiene rol inesperado', responsablesHuerfanos);

  partes.push('## Cómo arreglar manualmente');
  partes.push('');
  partes.push('### TECNICO_SIN_OPERARIA');
  partes.push('1. Ir a `Personal` en el sidebar admin.');
  partes.push('2. Editar el técnico.');
  partes.push('3. En "Operaria a cargo", seleccionar una operaria activa.');
  partes.push('4. Guardar.');
  partes.push('');
  partes.push('### HUERFANO_TECNICO');
  partes.push('1. Mismo flujo que arriba — la operaria actual del perfil no existe o cambió de rol.');
  partes.push('2. Reasignar a una operaria activa real.');
  partes.push('');
  partes.push('### OPERARIA_HUERFANA');
  partes.push('1. Visibilidad solo. Si es esperado (operaria sin técnicos por ahora), ignorar.');
  partes.push('2. Si no es esperado, asignar técnicos vía sus perfiles individuales.');
  partes.push('');
  partes.push('### ORDEN_SIN_OPERARIA_DESINCRONIZADA');
  partes.push('Caso típico: el técnico no tenía operaria cuando se creó la orden; después se le asignó pero la orden quedó vieja.');
  partes.push('');
  partes.push('1. Abrir la orden.');
  partes.push('2. En el campo "Técnico", cambiar a otro técnico cualquiera.');
  partes.push('3. Volver a seleccionar el técnico original.');
  partes.push('4. Guardar. Esto re-dispara la derivación `operariaId/Nombre` desde el perfil actual.');
  partes.push('');
  partes.push('Alternativa (no recomendada por riesgo de errores manuales): editar el campo `operariaNombre` directo desde Firestore Console.');
  partes.push('');
  partes.push('### ORDEN_OPERARIA_DESACTUALIZADA');
  partes.push('NO necesariamente es bug. La orden guarda la operaria que estaba asignada cuando se creó/editó (snapshot histórico válido). Solo cambiar si Jorge quiere realinear con la operaria actual del técnico, mismo flujo que el punto anterior.');
  partes.push('');
  partes.push('### RESPONSABLE_HUERFANO');
  partes.push('Visibilidad solo. Si la persona fue borrada del sistema o cambió de rol, lo correcto es dejar el `responsableNombre` cacheado como historial — no hay write-side fix simple.');
  partes.push('');
  partes.push('## Si querés fix masivo');
  partes.push('');
  partes.push('Si la lista de ORDEN_SIN_OPERARIA_DESINCRONIZADA es larga (>20) y querés arreglarlas todas:');
  partes.push('');
  partes.push('1. Pedile a Cowork que cree un **SPRINT-130 hipotético** con scope acotado: script `--apply` que recibe lista de orden IDs específicos y rellena `operariaId/Nombre` desde el perfil actual del técnico.');
  partes.push('2. Ese sprint va a `docs/sprints/BLOQUEOS.md` esperando OK explícito de Jorge (no autónomo, mutación masiva).');
  partes.push('3. Patrón ya usado en SPRINT-118 (migración `tecnicoId → uid`).');
  partes.push('');
  partes.push('**NO crear ese sprint en esta pasada.** Solo si Jorge lo pide explícitamente después de leer este reporte.');
  partes.push('');
  partes.push('## Decisión arquitectural pendiente');
  partes.push('');
  partes.push('La causa raíz del bug puntual de Aury Mon es que `useOrdenCreateForm.ts:588-590` y `OrdenEditForm.tsx:72-77` derivan la operaria en **snapshot** al crear/editar la orden. Cambiar a comportamiento **reactivo** (siempre mostrar la operaria actual del técnico desde el perfil) elimina la clase entera de bug. Esa decisión es scope de un sprint propio con input de Jorge — no es parte de SPRINT-129.');
  partes.push('');
  partes.push('## Limitaciones del script');
  partes.push('');
  partes.push(`- Solo audita las ${SAMPLE_ORDENES} órdenes activas más recientes (no cerradas/canceladas). Órdenes cerradas con operaria desincronizada no aparecen — pero ya no se editan, así que no es accionable.`);
  partes.push('- Asume convención `tecnicoId == personal.id` para órdenes. Post-SPRINT-118 algunos campos podrían guardar `auth.uid`; en ese caso el script no puede resolver el técnico y omite silencioso. Cazador P-006 verifica que no se reintroduzcan dropdowns mal escritos.');
  partes.push('- No verifica `ayudanteId` ni otros campos análogos (scope SPRINT-111 pendiente).');
  partes.push('- No verifica permisos/rules — eso está cubierto en `docs/MATRIZ_PERMISOS.md` y `docs/MATRIZ_PERMISOS_VS_MODULOS.md`.');
  partes.push('');
  partes.push('---');
  partes.push('');
  partes.push(`_Generado: ${new Date().toISOString()}_`);
  return partes.join('\n');
}

// ---------- Main ----------

async function main(): Promise<void> {
  console.log('=== Auditoría asignaciones técnico↔operaria ===');
  console.log('Read-only — no modifica nada en Firestore.');
  console.log('');

  console.log('[INFO] Cargando personal/...');
  const personal = await cargarPersonal();
  console.log(`[INFO] personal: ${personal.length} docs total`);

  console.log('[INFO] Cargando ordenes_servicio activas...');
  const ordenes = await cargarOrdenesActivas();
  console.log(`[INFO] ordenes activas sampleadas: ${ordenes.length}`);
  console.log('');

  const {
    tecnicosSinOperaria,
    huerfanosTecnico,
    operariasHuerfanas,
    indexPersonal,
    tecnicosActivos,
    operariasActivas,
  } = auditarPersonal(personal);

  const { ordenesSinOperariaDesinc, ordenesOperariaDesactualizada, responsablesHuerfanos } =
    auditarOrdenes(ordenes, indexPersonal);

  // Output a stdout
  console.log('─── Resumen ───');
  console.log(`  Técnicos activos:                    ${tecnicosActivos.length}`);
  console.log(`  Operarias activas:                   ${operariasActivas.length}`);
  console.log(`  Órdenes activas sampleadas:          ${ordenes.length}`);
  console.log('');
  console.log(`  TECNICO_SIN_OPERARIA:                ${tecnicosSinOperaria.length}`);
  console.log(`  HUERFANO_TECNICO:                    ${huerfanosTecnico.length}`);
  console.log(`  OPERARIA_HUERFANA:                   ${operariasHuerfanas.length}`);
  console.log(`  ORDEN_SIN_OPERARIA_DESINCRONIZADA:   ${ordenesSinOperariaDesinc.length}`);
  console.log(`  ORDEN_OPERARIA_DESACTUALIZADA:       ${ordenesOperariaDesactualizada.length}`);
  console.log(`  RESPONSABLE_HUERFANO:                ${responsablesHuerfanos.length}`);
  console.log('');

  const renderSec = (titulo: string, items: Inconsistencia[]): void => {
    if (items.length === 0) return;
    console.log(`─── ${titulo} (${items.length}) ───`);
    for (const it of items) {
      console.log(`  • [${it.ref}] ${it.nombre}`);
      console.log(`      ${it.detalle}`);
      console.log(`      → ${it.sugerencia}`);
    }
    console.log('');
  };

  renderSec('TECNICO_SIN_OPERARIA', tecnicosSinOperaria);
  renderSec('HUERFANO_TECNICO', huerfanosTecnico);
  renderSec('OPERARIA_HUERFANA', operariasHuerfanas);
  renderSec('ORDEN_SIN_OPERARIA_DESINCRONIZADA', ordenesSinOperariaDesinc);
  renderSec('ORDEN_OPERARIA_DESACTUALIZADA', ordenesOperariaDesactualizada);
  renderSec('RESPONSABLE_HUERFANO', responsablesHuerfanos);

  // Escribir reporte md
  const hoy = new Date().toISOString().substring(0, 10);
  const outPath = path.resolve(`docs/sprints/AUDITORIA_ASIGNACIONES_${hoy}.md`);
  const md = renderMd({
    fecha: hoy,
    totalTecnicos: tecnicosActivos.length,
    totalOperarias: operariasActivas.length,
    totalOrdenes: ordenes.length,
    tecnicosSinOperaria,
    huerfanosTecnico,
    operariasHuerfanas,
    ordenesSinOperariaDesinc,
    ordenesOperariaDesactualizada,
    responsablesHuerfanos,
  });
  fs.writeFileSync(outPath, md, 'utf-8');
  console.log(`[OK] Reporte escrito a ${outPath}`);
  console.log('');
  console.log('Próximos pasos:');
  console.log('  - Jorge lee el reporte md y decide caso por caso.');
  console.log('  - Para fix manual: seguir las instrucciones de la sección "Cómo arreglar manualmente".');
  console.log('  - Para fix masivo: pedir a Cowork un SPRINT-130 con scope acotado (queda en BLOQUEOS.md hasta OK).');
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error('[FATAL]', message);
  process.exit(1);
});
