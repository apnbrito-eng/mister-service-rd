import {
  collection, addDoc, doc, getDoc, getDocs, query, where, Timestamp, updateDoc, runTransaction,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import {
  Personal, Usuario, LiquidacionNomina, LiquidacionEmpleado, ComisionRegistro, OrdenServicio,
  ROLES_CON_ACCESO, DescuentoAdHoc, CuotaPrestamoAplicada,
} from '../types';
import { rangoQuincena } from '../utils/comisiones';
import { parseOrden } from '../utils';
import { obtenerAvancesPendientesDeQuincena, marcarAvanceDescontado } from './avances.service';
import { obtenerPrestamosActivosTodos, aplicarCuota } from './prestamos.service';

const UMBRAL_BONO = 0.70;
const BONO_MONTO = 5000;

/** Tiers del bono mensual para secretaria, ordenados desc por umbral. */
export const TIERS_BONO_SECRETARIA = [
  { min: 400, bono: 5000 },
  { min: 300, bono: 3500 },
  { min: 200, bono: 2000 },
  { min: 0, bono: 0 },
] as const;

export function calcularBonoSecretaria(citasCompletadas: number): number {
  for (const tier of TIERS_BONO_SECRETARIA) {
    if (citasCompletadas >= tier.min) return tier.bono;
  }
  return 0;
}

/** Devuelve el rango del mes calendario de una quincena 'YYYY-MM-QX'. */
export function rangoMesCalendario(quincena: string): { inicio: Date; fin: Date } {
  const [y, m] = quincena.split('-').slice(0, 2).map(Number);
  const inicio = new Date(y, m - 1, 1, 0, 0, 0, 0);
  const fin = new Date(y, m, 0, 23, 59, 59, 999);
  return { inicio, fin };
}

/**
 * Genera una nueva liquidación quincenal:
 * - Toma todo el personal activo con rol en ROLES_CON_ACCESO y distinto de ayudante.
 *   (ayudante tiene acceso al sistema sólo para el módulo de ponche — no entra a nómina).
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
    .filter(p => p.activo && p.rol !== 'ayudante' && ROLES_CON_ACCESO.includes(p.rol));

  // Comisiones pendientes en el rango (filtrar client-side para evitar índice compuesto)
  const comisionesSnap = await getDocs(collection(db, 'comisiones'));
  const comisionesEnRango = comisionesSnap.docs
    .map(d => {
      const raw = d.data();
      const desc = raw.descuentoPorGarantia as Record<string, unknown> | undefined;
      const comision: ComisionRegistro = {
        id: d.id,
        tecnicoId: (raw.tecnicoId as string) || '',
        tecnicoNombre: (raw.tecnicoNombre as string) || '',
        ordenId: (raw.ordenId as string) || '',
        ordenNumero: (raw.ordenNumero as string) || '',
        clienteNombre: (raw.clienteNombre as string) || '',
        fechaCobro: raw.fechaCobro?.toDate?.() || new Date(),
        precioFinal: (raw.precioFinal as number) || 0,
        costoPiezas: (raw.costoPiezas as number) || 0,
        basePendienteComision: (raw.basePendienteComision as number) || 0,
        comisionPorcentaje: (raw.comisionPorcentaje as number) || 0,
        comisionMonto: (raw.comisionMonto as number) || 0,
        estadoLiquidacion: (raw.estadoLiquidacion as 'pendiente' | 'liquidada') || 'pendiente',
        quincenaAsignada: raw.quincenaAsignada as string | undefined,
        createdAt: raw.createdAt?.toDate?.() || new Date(),
      };
      if (desc && typeof desc === 'object') {
        comision.descuentoPorGarantia = {
          monto: (desc.monto as number) || 0,
          facturaIdReasignada: (desc.facturaIdReasignada as string) || '',
          conduceNumero: (desc.conduceNumero as string) || '',
          ordenIdReasignada: (desc.ordenIdReasignada as string) || '',
          motivo: (desc.motivo as string) || '',
          notas: (desc.notas as string) || undefined,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          aplicadoEn: (desc.aplicadoEn as any)?.toDate?.() || new Date(),
          aplicadoPor: (desc.aplicadoPor as string) || '',
          aplicadoPorNombre: (desc.aplicadoPorNombre as string) || '',
        };
      }
      return comision;
    })
    .filter(c =>
      c.estadoLiquidacion === 'pendiente' &&
      c.fechaCobro >= inicio &&
      c.fechaCobro <= fin
    );

  // Órdenes para desempeño operaria y secretaria
  const ordenesSnap = await getDocs(collection(db, 'ordenes_servicio'));
  const ordenes = ordenesSnap.docs.map(d => parseOrden(d.id, d.data() as Record<string, unknown>) as OrdenServicio);

  // Avances pendientes asignados a esta quincena
  const avancesQuincena = await obtenerAvancesPendientesDeQuincena(quincena);

  // Préstamos activos del sistema — preview de cuotas para esta quincena.
  // No persistimos nada en `prestamos_empleados` acá; eso ocurre al cerrar
  // la liquidación (vía `aplicarCuota`, que es idempotente).
  const prestamosActivos = await obtenerPrestamosActivosTodos();

  const esQ2 = quincena.endsWith('-Q2');
  const rangoMes = rangoMesCalendario(quincena);

  const empleados: LiquidacionEmpleado[] = personal.map(p => {
    // Sueldo base del personal se carga como MENSUAL; se divide entre 2 para cada quincena.
    const sueldoMensual = typeof p.sueldoBase === 'number' ? p.sueldoBase : 0;
    const sueldoBase = sueldoMensual / 2;
    let totalComisiones = 0;
    let cantidadOrdenesConComision = 0;
    let comisionesIds: string[] = [];
    let bono = 0;
    let pct: number | undefined;
    let completadas: number | undefined;
    let chequeos: number | undefined;
    let atendidas: number | undefined;
    let citasAgendadasMes: number | undefined;
    let citasCompletadasMes: number | undefined;

    if (p.rol === 'tecnico') {
      const comisionesT = comisionesEnRango.filter(c => c.tecnicoId === p.id);
      comisionesIds = comisionesT.map(c => c.id);
      // Sumar comisión + descuentoPorGarantia.monto (que ya es negativo). Si la nómina del técnico
      // original ya cerró cuando se aplica el descuento, queda flotante y se recoge en la próxima
      // quincena (el filtro pendiente sigue cumpliéndose hasta que se cierre la liquidación).
      totalComisiones = comisionesT.reduce(
        (s, c) => s + c.comisionMonto + (c.descuentoPorGarantia?.monto ?? 0),
        0,
      );
      cantidadOrdenesConComision = comisionesT.length;
    } else if (p.rol === 'operaria' || p.rol === 'coordinadora') {
      // Bono operaria es MENSUAL: solo se paga en Q2, medido sobre todo el mes calendario.
      if (esQ2) {
        const ordsMes = ordenes.filter(o =>
          o.operariaId === p.id &&
          !o.eliminada &&
          ((o.fase === 'cerrado') || o.soloChequeo) &&
          o.updatedAt >= rangoMes.inicio && o.updatedAt <= rangoMes.fin
        );
        chequeos = ordsMes.filter(o => o.soloChequeo).length;
        completadas = ordsMes.filter(o => o.fase === 'cerrado' && !o.soloChequeo).length;
        atendidas = chequeos + completadas;
        pct = atendidas > 0 ? completadas / atendidas : 0;
        bono = pct >= UMBRAL_BONO ? BONO_MONTO : 0;
      }
    } else if (p.rol === 'secretaria') {
      // Bono secretaria es MENSUAL: citas creadas por ella que se completaron.
      if (esQ2) {
        const agendadas = ordenes.filter(o =>
          !o.eliminada &&
          o.creadoPor === p.nombre &&
          o.createdAt >= rangoMes.inicio && o.createdAt <= rangoMes.fin
        );
        citasAgendadasMes = agendadas.length;
        citasCompletadasMes = agendadas.filter(o => o.fase !== 'cancelado').length;
        bono = calcularBonoSecretaria(citasCompletadasMes);
      }
    }

    const totalDevengado = sueldoBase + totalComisiones + bono;

    // Avances pendientes a descontar de esta quincena para este empleado
    const avancesEmp = avancesQuincena.filter(a => a.personalId === p.id);
    const avancesIds = avancesEmp.map(a => a.id);
    const totalAvances = avancesEmp.reduce((s, a) => s + a.monto, 0);

    // Cuotas de préstamos activos. Edge case del spec final: si el
    // empleado no tiene devengado este periodo (ej: técnico inactivo),
    // saltearse las cuotas — no descontar, no aplicar al cerrar.
    let cuotasPrestamos: CuotaPrestamoAplicada[] = [];
    let totalCuotasPrestamos = 0;
    if (totalDevengado > 0) {
      cuotasPrestamos = prestamosActivos
        .filter(pr => pr.personalId === p.id && pr.cuotasPagadas < pr.cuotasTotales && pr.saldoPendiente > 0)
        .map(pr => ({
          prestamoId: pr.id,
          numeroCuota: pr.cuotasPagadas + 1,
          // Última cuota puede ser menor si hay saldo residual menor que la cuota.
          monto: Math.min(pr.montoCuota, pr.saldoPendiente),
          motivo: pr.motivo,
        }));
      totalCuotasPrestamos = cuotasPrestamos.reduce((s, c) => s + c.monto, 0);
    }

    const totalDescuentos = totalAvances + totalCuotasPrestamos;
    const totalNeto = Math.max(0, totalDevengado - totalDescuentos);

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
    if (citasAgendadasMes !== undefined) emp.citasAgendadasMes = citasAgendadasMes;
    if (citasCompletadasMes !== undefined) emp.citasCompletadasMes = citasCompletadasMes;
    if (bono > 0) emp.bono = bono;
    if (avancesIds.length > 0) {
      emp.avancesIds = avancesIds;
      emp.totalAvances = totalAvances;
    }
    if (cuotasPrestamos.length > 0) {
      emp.cuotasPrestamos = cuotasPrestamos;
      emp.totalCuotasPrestamos = totalCuotasPrestamos;
    }
    if (totalDescuentos > 0) {
      emp.totalDescuentos = totalDescuentos;
      emp.totalNeto = totalNeto;
    }
    return emp;
  });

  // Total nómina = suma de totalDevengado (antes de avances)
  // Total a pagar = suma de (totalDevengado - totalAvances)
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
 * `estadoLiquidacion: 'liquidada'`, los avances como `descontado: true`,
 * aplica las cuotas de préstamos al historial (idempotente), y la
 * liquidación como `estado: 'cerrada'`. Después del cierre, las
 * comisiones no pueden re-asignarse a otra quincena.
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
  const quincena = (raw.quincena as string) || '';
  const ahora = Timestamp.now();

  // Marcar comisiones como liquidadas (en paralelo, errores individuales loggeados)
  const comisionesIds: string[] = [];
  const avancesIds: string[] = [];
  // Cuotas a aplicar: solo para empleados con totalDevengado > 0 (edge case
  // del spec: si el empleado no devengó nada, NO se descuenta cuota).
  const cuotasAAplicar: { prestamoId: string; monto: number }[] = [];
  empleados.forEach(e => {
    const cids = (e.comisionesIds as string[]) || [];
    cids.forEach(id => comisionesIds.push(id));
    const aids = (e.avancesIds as string[]) || [];
    aids.forEach(id => avancesIds.push(id));
    const totalDev = Number(e.totalDevengado) || 0;
    if (totalDev > 0) {
      const cuotas = (e.cuotasPrestamos as Record<string, unknown>[]) || [];
      cuotas.forEach(c => {
        const prestamoId = (c.prestamoId as string) || '';
        const monto = Number(c.monto) || 0;
        if (prestamoId && monto > 0) {
          cuotasAAplicar.push({ prestamoId, monto });
        }
      });
    }
  });
  await Promise.all(comisionesIds.map(id =>
    updateDoc(doc(db, 'comisiones', id), {
      estadoLiquidacion: 'liquidada',
      quincenaAsignada: raw.quincena,
      liquidadaEn: ahora,
      liquidadaPor: cerradaPor.nombre,
    }).catch(err => console.error('Error liquidando comisión', id, err))
  ));
  // Marcar avances como descontados
  await Promise.all(avancesIds.map(id =>
    marcarAvanceDescontado(id, liquidacionId)
      .catch(err => console.error('Error descontando avance', id, err))
  ));
  // Aplicar cuotas de préstamos. `aplicarCuota` es idempotente por
  // (prestamoId + liquidacionId) — si se re-llama tras reintento, no
  // doble-descuenta.
  await Promise.all(cuotasAAplicar.map(c =>
    aplicarCuota(c.prestamoId, liquidacionId, quincena, c.monto)
      .catch(err => console.error('Error aplicando cuota préstamo', c.prestamoId, err))
  ));

  await updateDoc(ref, {
    estado: 'cerrada',
    cerradaPor: cerradaPor.nombre,
    cerradaPorId: cerradaPor.id,
    fechaCierre: ahora,
  });
}

/**
 * Agrega un descuento ad-hoc a un empleado de la liquidación abierta.
 * Transaccional para evitar race conditions con otros admins editando.
 * Si la liquidación está cerrada, throw error claro.
 */
export async function agregarDescuentoAdHoc(
  liquidacionId: string,
  personalId: string,
  descuento: { monto: number; motivo: string },
  agregadoPor: Usuario,
): Promise<void> {
  if (!descuento.motivo.trim()) throw new Error('El motivo es obligatorio');
  if (!(descuento.monto > 0)) throw new Error('El monto debe ser mayor a 0');

  await runTransaction(db, async (tx) => {
    const ref = doc(db, 'liquidaciones_nomina', liquidacionId);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Liquidación no encontrada');
    const raw = snap.data() as Record<string, unknown>;
    if (raw.estado === 'cerrada') {
      throw new Error('La liquidación ya está cerrada — no se pueden agregar descuentos');
    }
    const empleadosRaw = (raw.empleados as Record<string, unknown>[]) || [];
    const idx = empleadosRaw.findIndex(e => e.personalId === personalId);
    if (idx === -1) throw new Error('Empleado no encontrado en la liquidación');

    // Reconstruimos el empleado a partir del raw (subset suficiente para recalcular).
    const eRaw = empleadosRaw[idx];
    const descuentosAdHocPrev = (eRaw.descuentosAdHoc as Record<string, unknown>[]) || [];

    // Generamos id local para el nuevo descuento. crypto.randomUUID está
    // disponible en navegadores modernos; el fallback evita romper en SSR
    // (no aplica acá, pero defensivo).
    const nuevoId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const nuevoDescuento = {
      id: nuevoId,
      monto: Number(descuento.monto),
      motivo: descuento.motivo.trim(),
      agregadoPorId: agregadoPor.id,
      agregadoPorNombre: agregadoPor.nombre,
      agregadoEn: Timestamp.now(),
    };

    const descuentosAdHocNuevos = [...descuentosAdHocPrev, nuevoDescuento];
    const totalDescuentosAdHoc = descuentosAdHocNuevos.reduce((s, d) => s + (Number(d.monto) || 0), 0);
    const totalAvances = Number(eRaw.totalAvances) || 0;
    const totalCuotasPrestamos = Number(eRaw.totalCuotasPrestamos) || 0;
    const totalDevengado = Number(eRaw.totalDevengado) || 0;
    const totalDescuentos = totalAvances + totalDescuentosAdHoc + totalCuotasPrestamos;
    const totalNeto = Math.max(0, totalDevengado - totalDescuentos);

    const empleadosNuevos = [...empleadosRaw];
    empleadosNuevos[idx] = {
      ...eRaw,
      descuentosAdHoc: descuentosAdHocNuevos,
      totalDescuentosAdHoc,
      totalDescuentos,
      totalNeto,
    };
    tx.update(ref, { empleados: empleadosNuevos });
  });
}

/**
 * Quita un descuento ad-hoc por id. Solo si la liquidación está abierta.
 * Recalcula `totalDescuentos` y `totalNeto` después de filtrar.
 */
export async function removerDescuentoAdHoc(
  liquidacionId: string,
  personalId: string,
  descuentoId: string,
): Promise<void> {
  await runTransaction(db, async (tx) => {
    const ref = doc(db, 'liquidaciones_nomina', liquidacionId);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Liquidación no encontrada');
    const raw = snap.data() as Record<string, unknown>;
    if (raw.estado === 'cerrada') {
      throw new Error('La liquidación ya está cerrada — no se pueden quitar descuentos');
    }
    const empleadosRaw = (raw.empleados as Record<string, unknown>[]) || [];
    const idx = empleadosRaw.findIndex(e => e.personalId === personalId);
    if (idx === -1) throw new Error('Empleado no encontrado en la liquidación');

    const eRaw = empleadosRaw[idx];
    const descuentosAdHocPrev = (eRaw.descuentosAdHoc as Record<string, unknown>[]) || [];
    const descuentosAdHocNuevos = descuentosAdHocPrev.filter(d => d.id !== descuentoId);
    const totalDescuentosAdHoc = descuentosAdHocNuevos.reduce((s, d) => s + (Number(d.monto) || 0), 0);
    const totalAvances = Number(eRaw.totalAvances) || 0;
    const totalCuotasPrestamos = Number(eRaw.totalCuotasPrestamos) || 0;
    const totalDevengado = Number(eRaw.totalDevengado) || 0;
    const totalDescuentos = totalAvances + totalDescuentosAdHoc + totalCuotasPrestamos;
    const totalNeto = Math.max(0, totalDevengado - totalDescuentos);

    const empleadosNuevos = [...empleadosRaw];
    const empNuevo: Record<string, unknown> = {
      ...eRaw,
    };
    if (descuentosAdHocNuevos.length > 0) {
      empNuevo.descuentosAdHoc = descuentosAdHocNuevos;
      empNuevo.totalDescuentosAdHoc = totalDescuentosAdHoc;
    } else {
      delete empNuevo.descuentosAdHoc;
      delete empNuevo.totalDescuentosAdHoc;
    }
    if (totalDescuentos > 0) {
      empNuevo.totalDescuentos = totalDescuentos;
      empNuevo.totalNeto = totalNeto;
    } else {
      delete empNuevo.totalDescuentos;
      delete empNuevo.totalNeto;
    }
    empleadosNuevos[idx] = empNuevo;
    tx.update(ref, { empleados: empleadosNuevos });
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
    if (e.citasAgendadasMes !== undefined) out.citasAgendadasMes = e.citasAgendadasMes;
    if (e.citasCompletadasMes !== undefined) out.citasCompletadasMes = e.citasCompletadasMes;
    if (e.bono !== undefined) out.bono = e.bono;
    if (e.avancesIds && e.avancesIds.length > 0) out.avancesIds = e.avancesIds;
    if (e.totalAvances !== undefined) out.totalAvances = e.totalAvances;
    if (e.descuentosAdHoc && e.descuentosAdHoc.length > 0) {
      out.descuentosAdHoc = e.descuentosAdHoc.map(d => ({
        id: d.id,
        monto: d.monto,
        motivo: d.motivo,
        agregadoPorId: d.agregadoPorId,
        agregadoPorNombre: d.agregadoPorNombre,
        agregadoEn: d.agregadoEn instanceof Date ? Timestamp.fromDate(d.agregadoEn) : d.agregadoEn,
      }));
    }
    if (e.totalDescuentosAdHoc !== undefined) out.totalDescuentosAdHoc = e.totalDescuentosAdHoc;
    if (e.cuotasPrestamos && e.cuotasPrestamos.length > 0) {
      out.cuotasPrestamos = e.cuotasPrestamos.map(c => ({
        prestamoId: c.prestamoId,
        numeroCuota: c.numeroCuota,
        monto: c.monto,
        motivo: c.motivo,
      }));
    }
    if (e.totalCuotasPrestamos !== undefined) out.totalCuotasPrestamos = e.totalCuotasPrestamos;
    if (e.totalDescuentos !== undefined) out.totalDescuentos = e.totalDescuentos;
    if (e.totalNeto !== undefined) out.totalNeto = e.totalNeto;
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
    empleados: empleadosRaw.map(e => {
      // Rehidratamos defensivamente arrays nuevos: liquidaciones viejas
      // no los tienen, y deben renderizar igual que antes (`?? 0`, `?? []`).
      const descuentosAdHocRaw = (e.descuentosAdHoc as Record<string, unknown>[]) || [];
      const descuentosAdHoc: DescuentoAdHoc[] = descuentosAdHocRaw.map(d => ({
        id: (d.id as string) || '',
        monto: Number(d.monto) || 0,
        motivo: (d.motivo as string) || '',
        agregadoPorId: (d.agregadoPorId as string) || '',
        agregadoPorNombre: (d.agregadoPorNombre as string) || '',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        agregadoEn: (d.agregadoEn as any)?.toDate?.() || new Date(),
      }));
      const cuotasRaw = (e.cuotasPrestamos as Record<string, unknown>[]) || [];
      const cuotasPrestamos: CuotaPrestamoAplicada[] = cuotasRaw.map(c => ({
        prestamoId: (c.prestamoId as string) || '',
        numeroCuota: Number(c.numeroCuota) || 0,
        monto: Number(c.monto) || 0,
        motivo: (c.motivo as string) || '',
      }));
      return {
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
        citasAgendadasMes: e.citasAgendadasMes as number | undefined,
        citasCompletadasMes: e.citasCompletadasMes as number | undefined,
        bono: e.bono as number | undefined,
        totalDevengado: (e.totalDevengado as number) || 0,
        avancesIds: (e.avancesIds as string[]) || undefined,
        totalAvances: e.totalAvances as number | undefined,
        descuentosAdHoc: descuentosAdHoc.length > 0 ? descuentosAdHoc : undefined,
        totalDescuentosAdHoc: e.totalDescuentosAdHoc as number | undefined,
        cuotasPrestamos: cuotasPrestamos.length > 0 ? cuotasPrestamos : undefined,
        totalCuotasPrestamos: e.totalCuotasPrestamos as number | undefined,
        totalDescuentos: e.totalDescuentos as number | undefined,
        totalNeto: e.totalNeto as number | undefined,
        notas: e.notas as string | undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        metodoPago: e.metodoPago as any,
        bancoDestino: e.bancoDestino as string | undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fechaPagoEfectivo: (e.fechaPagoEfectivo as any)?.toDate?.() || undefined,
        pagadoPor: e.pagadoPor as string | undefined,
        pagado: (e.pagado as boolean) || false,
      };
    }),
    notas: raw.notas as string | undefined,
    cerradaPor: raw.cerradaPor as string | undefined,
    cerradaPorId: raw.cerradaPorId as string | undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fechaCierre: (raw.fechaCierre as any)?.toDate?.() || undefined,
  };
}
