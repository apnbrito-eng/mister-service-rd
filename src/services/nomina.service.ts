import {
  collection, addDoc, doc, getDoc, getDocs, query, where, Timestamp, updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import {
  Personal, Usuario, LiquidacionNomina, LiquidacionEmpleado, ComisionRegistro, OrdenServicio, ROLES_CON_ACCESO,
} from '../types';
import { rangoQuincena } from '../utils/comisiones';
import { parseOrden } from '../utils';

const UMBRAL_BONO = 0.70;
const BONO_MONTO = 5000;

/**
 * Genera una nueva liquidación quincenal:
 * - Toma todo el personal activo con rol en ROLES_CON_ACCESO (excluye ayudantes).
 * - Para técnicos: suma comisiones pendientes que caen en la quincena.
 * - Para operarias/coordinadoras: calcula desempeño + bono.
 * - Para todos: suma sueldoBase del personal.
 *
 * No marca las comisiones como liquidadas (eso se hace al cerrar la liquidación).
 * Idempotente: si ya existe una liquidación abierta para esa quincena, la devuelve;
 * si está cerrada, lanza error.
 */
export async function generarLiquidacion(
  quincena: string,
  generadaPor: Usuario,
): Promise<{ id: string; liquidacion: LiquidacionNomina }> {
  // Idempotencia
  const existeQ = await getDocs(query(
    collection(db, 'liquidaciones_nomina'),
    where('quincena', '==', quincena),
  ));
  if (!existeQ.empty) {
    const docExistente = existeQ.docs[0];
    const raw = docExistente.data();
    if (raw.estado === 'cerrada') {
      throw new Error(`La liquidación de ${quincena} ya está cerrada`);
    }
    // Devolver la existente abierta — el caller puede regenerar si quiere
    return {
      id: docExistente.id,
      liquidacion: parseLiquidacion(docExistente.id, raw),
    };
  }

  const { inicio, fin } = rangoQuincena(quincena);

  // Personal activo con rol con acceso (excluye ayudante)
  const personalSnap = await getDocs(collection(db, 'personal'));
  const personal = personalSnap.docs
    .map(d => ({ id: d.id, ...d.data() } as Personal))
    .filter(p => p.activo && ROLES_CON_ACCESO.includes(p.rol));

  // Comisiones pendientes en el rango (filtrar client-side para evitar índice compuesto)
  const comisionesSnap = await getDocs(collection(db, 'comisiones'));
  const comisionesEnRango = comisionesSnap.docs
    .map(d => {
      const raw = d.data();
      return {
        id: d.id,
        tecnicoId: raw.tecnicoId || '',
        tecnicoNombre: raw.tecnicoNombre || '',
        ordenId: raw.ordenId || '',
        ordenNumero: raw.ordenNumero || '',
        clienteNombre: raw.clienteNombre || '',
        fechaCobro: raw.fechaCobro?.toDate?.() || new Date(),
        precioFinal: raw.precioFinal || 0,
        costoPiezas: raw.costoPiezas || 0,
        basePendienteComision: raw.basePendienteComision || 0,
        comisionPorcentaje: raw.comisionPorcentaje || 0,
        comisionMonto: raw.comisionMonto || 0,
        estadoLiquidacion: raw.estadoLiquidacion || 'pendiente',
        quincenaAsignada: raw.quincenaAsignada,
        createdAt: raw.createdAt?.toDate?.() || new Date(),
      } as ComisionRegistro;
    })
    .filter(c =>
      c.estadoLiquidacion === 'pendiente' &&
      c.fechaCobro >= inicio &&
      c.fechaCobro <= fin
    );

  // Órdenes para desempeño operaria
  const ordenesSnap = await getDocs(collection(db, 'ordenes_servicio'));
  const ordenes = ordenesSnap.docs.map(d => parseOrden(d.id, d.data() as Record<string, unknown>) as OrdenServicio);

  const empleados: LiquidacionEmpleado[] = personal.map(p => {
    const sueldoBase = typeof p.sueldoBase === 'number' ? p.sueldoBase : 0;
    let totalComisiones = 0;
    let cantidadOrdenesConComision = 0;
    let comisionesIds: string[] = [];
    let bono = 0;
    let pct: number | undefined;
    let completadas: number | undefined;
    let chequeos: number | undefined;
    let atendidas: number | undefined;

    if (p.rol === 'tecnico') {
      const comisionesT = comisionesEnRango.filter(c => c.tecnicoId === p.id);
      comisionesIds = comisionesT.map(c => c.id);
      totalComisiones = comisionesT.reduce((s, c) => s + c.comisionMonto, 0);
      cantidadOrdenesConComision = comisionesT.length;
    } else if (p.rol === 'operaria' || p.rol === 'coordinadora') {
      const ordsOperaria = ordenes.filter(o =>
        o.operariaId === p.id &&
        !o.eliminada &&
        ((o.fase === 'cerrado') || o.soloChequeo) &&
        o.updatedAt >= inicio && o.updatedAt <= fin
      );
      chequeos = ordsOperaria.filter(o => o.soloChequeo).length;
      completadas = ordsOperaria.filter(o => o.fase === 'cerrado' && !o.soloChequeo).length;
      atendidas = chequeos + completadas;
      pct = atendidas > 0 ? completadas / atendidas : 0;
      bono = pct >= UMBRAL_BONO ? BONO_MONTO : 0;
    }

    const totalDevengado = sueldoBase + totalComisiones + bono;

    const emp: LiquidacionEmpleado = {
      personalId: p.id,
      personalNombre: p.nombre,
      rol: p.rol,
      sueldoBase,
      comisionesIds,
      totalComisiones,
      cantidadOrdenesConComision,
      totalDevengado,
      pagado: false,
    };
    if (pct !== undefined) emp.desempenoPorcentaje = pct;
    if (completadas !== undefined) emp.ordenesCompletadas = completadas;
    if (atendidas !== undefined) emp.ordenesAtendidas = atendidas;
    if (chequeos !== undefined) emp.ordenesChequeo = chequeos;
    if (bono > 0) emp.bono = bono;
    return emp;
  });

  const totalNomina = empleados.reduce((s, e) => s + e.totalDevengado, 0);

  const data: Record<string, unknown> = {
    quincena,
    periodoInicio: Timestamp.fromDate(inicio),
    periodoFin: Timestamp.fromDate(fin),
    generadaPor: generadaPor.nombre,
    generadaPorId: generadaPor.id,
    fechaGeneracion: Timestamp.now(),
    estado: 'abierta',
    totalNomina,
    empleados: serializarEmpleados(empleados),
  };
  const ref = await addDoc(collection(db, 'liquidaciones_nomina'), data);
  return {
    id: ref.id,
    liquidacion: {
      id: ref.id,
      quincena,
      periodoInicio: inicio,
      periodoFin: fin,
      generadaPor: generadaPor.nombre,
      generadaPorId: generadaPor.id,
      fechaGeneracion: new Date(),
      estado: 'abierta',
      totalNomina,
      empleados,
    },
  };
}

/**
 * Cierra la liquidación: marca todas las comisiones referenciadas como
 * `estadoLiquidacion: 'liquidada'` y la liquidación como `estado: 'cerrada'`.
 * Después del cierre, las comisiones no pueden re-asignarse a otra quincena.
 */
export async function cerrarLiquidacion(
  liquidacionId: string,
  cerradaPor: Usuario,
): Promise<void> {
  const ref = doc(db, 'liquidaciones_nomina', liquidacionId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Liquidación no encontrada');
  const raw = snap.data();
  if (raw.estado === 'cerrada') throw new Error('La liquidación ya está cerrada');
  const empleados = (raw.empleados as Record<string, unknown>[]) || [];
  const ahora = Timestamp.now();

  // Marcar comisiones como liquidadas (en paralelo, errores individuales loggeados)
  const comisionesIds: string[] = [];
  empleados.forEach(e => {
    const ids = (e.comisionesIds as string[]) || [];
    ids.forEach(id => comisionesIds.push(id));
  });
  await Promise.all(comisionesIds.map(id =>
    updateDoc(doc(db, 'comisiones', id), {
      estadoLiquidacion: 'liquidada',
      quincenaAsignada: raw.quincena,
      liquidadaEn: ahora,
      liquidadaPor: cerradaPor.nombre,
    }).catch(err => console.error('Error liquidando comisión', id, err))
  ));

  await updateDoc(ref, {
    estado: 'cerrada',
    cerradaPor: cerradaPor.nombre,
    cerradaPorId: cerradaPor.id,
    fechaCierre: ahora,
  });
}

/**
 * Marca un empleado dentro de una liquidación como pagado (registra método y fecha).
 * Modifica el array `empleados` en el doc de liquidación.
 */
export async function marcarEmpleadoPagado(
  liquidacionId: string,
  personalId: string,
  metodoPago: 'efectivo' | 'transferencia' | 'cheque',
  pagadoPor: Usuario,
  bancoDestino?: string,
): Promise<void> {
  const ref = doc(db, 'liquidaciones_nomina', liquidacionId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Liquidación no encontrada');
  const raw = snap.data();
  const empleados = ((raw.empleados as Record<string, unknown>[]) || []).map(e => {
    if (e.personalId !== personalId) return e;
    const upd: Record<string, unknown> = {
      ...e,
      pagado: true,
      metodoPago,
      fechaPagoEfectivo: Timestamp.now(),
      pagadoPor: pagadoPor.nombre,
    };
    if (metodoPago === 'transferencia' && bancoDestino) {
      upd.bancoDestino = bancoDestino;
    }
    return upd;
  });
  await updateDoc(ref, { empleados });
}

// ─── Helpers internos ────────────────────────────────────────────────────────
function serializarEmpleados(emps: LiquidacionEmpleado[]): Record<string, unknown>[] {
  return emps.map(e => {
    const out: Record<string, unknown> = {
      personalId: e.personalId,
      personalNombre: e.personalNombre,
      rol: e.rol,
      sueldoBase: e.sueldoBase,
      comisionesIds: e.comisionesIds,
      totalComisiones: e.totalComisiones,
      cantidadOrdenesConComision: e.cantidadOrdenesConComision,
      totalDevengado: e.totalDevengado,
      pagado: e.pagado,
    };
    if (e.desempenoPorcentaje !== undefined) out.desempenoPorcentaje = e.desempenoPorcentaje;
    if (e.ordenesCompletadas !== undefined) out.ordenesCompletadas = e.ordenesCompletadas;
    if (e.ordenesAtendidas !== undefined) out.ordenesAtendidas = e.ordenesAtendidas;
    if (e.ordenesChequeo !== undefined) out.ordenesChequeo = e.ordenesChequeo;
    if (e.bono !== undefined) out.bono = e.bono;
    if (e.notas) out.notas = e.notas;
    if (e.metodoPago) out.metodoPago = e.metodoPago;
    if (e.bancoDestino) out.bancoDestino = e.bancoDestino;
    if (e.pagadoPor) out.pagadoPor = e.pagadoPor;
    return out;
  });
}

export function parseLiquidacion(id: string, raw: Record<string, unknown>): LiquidacionNomina {
  const empleadosRaw = (raw.empleados as Record<string, unknown>[]) || [];
  return {
    id,
    quincena: (raw.quincena as string) || '',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    periodoInicio: (raw.periodoInicio as any)?.toDate?.() || new Date(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    periodoFin: (raw.periodoFin as any)?.toDate?.() || new Date(),
    generadaPor: (raw.generadaPor as string) || '',
    generadaPorId: (raw.generadaPorId as string) || '',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fechaGeneracion: (raw.fechaGeneracion as any)?.toDate?.() || new Date(),
    estado: (raw.estado as 'abierta' | 'cerrada') || 'abierta',
    totalNomina: (raw.totalNomina as number) || 0,
    empleados: empleadosRaw.map(e => ({
      personalId: (e.personalId as string) || '',
      personalNombre: (e.personalNombre as string) || '',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rol: (e.rol as any) || 'ayudante',
      sueldoBase: (e.sueldoBase as number) || 0,
      comisionesIds: (e.comisionesIds as string[]) || [],
      totalComisiones: (e.totalComisiones as number) || 0,
      cantidadOrdenesConComision: (e.cantidadOrdenesConComision as number) || 0,
      desempenoPorcentaje: e.desempenoPorcentaje as number | undefined,
      ordenesCompletadas: e.ordenesCompletadas as number | undefined,
      ordenesAtendidas: e.ordenesAtendidas as number | undefined,
      ordenesChequeo: e.ordenesChequeo as number | undefined,
      bono: e.bono as number | undefined,
      totalDevengado: (e.totalDevengado as number) || 0,
      notas: e.notas as string | undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      metodoPago: e.metodoPago as any,
      bancoDestino: e.bancoDestino as string | undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fechaPagoEfectivo: (e.fechaPagoEfectivo as any)?.toDate?.() || undefined,
      pagadoPor: e.pagadoPor as string | undefined,
      pagado: (e.pagado as boolean) || false,
    })),
    notas: raw.notas as string | undefined,
    cerradaPor: raw.cerradaPor as string | undefined,
    cerradaPorId: raw.cerradaPorId as string | undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fechaCierre: (raw.fechaCierre as any)?.toDate?.() || undefined,
  };
}
