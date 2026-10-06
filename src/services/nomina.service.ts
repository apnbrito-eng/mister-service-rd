import { validarPreparacionNomina, corteGuardadoNomina, type PreparacionNomina } from '../utils/corteNomina';
import { comisionConCobroCompleto, fechaElegibleComision, leerOrdenesDeComisiones, POLITICA_COBRO_COMISION } from '../utils/comisionCobro';
import { comisionesDuplicadasNomina } from '../utils/comisionesDuplicadasNomina';
import { fechaFinanciera } from '../utils/fechaFinanciera';
import {
  collection, doc, getDocs, query, where, Timestamp, runTransaction,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import {
  Personal, Usuario, LiquidacionNomina, LiquidacionEmpleado, ComisionRegistro, OrdenServicio,
  ROLES_CON_ACCESO, DescuentoAdHoc, CuotaPrestamoAplicada,
} from '../types';
import { rangoQuincena, calcularQuincenaActual } from '../utils/comisiones';
import { parseOrden } from '../utils';
import { obtenerAvancesPendientesDeQuincena } from './avances.service';
import { obtenerPrestamosActivosTodos } from './prestamos.service';

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
 * - Toma todo el personal activo con rol en ROLES_CON_ACCESO, incluidos ayudantes sin comisión.
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
  preparacion: PreparacionNomina = {},
): Promise<{ id: string; liquidacion: LiquidacionNomina }> {
  if (!/^\d{4}-(0[1-9]|1[0-2])-Q[12]$/.test(quincena)) throw new Error('Quincena inválida');
  // Lectura de compatibilidad: no reserva inserciones de clientes antiguos.
  const existeQ = await getDocs(query(
    collection(db, 'liquidaciones_nomina'),
    where('quincena', '==', quincena),
  ));
  if (existeQ.docs.length > 1) throw new Error('Hay liquidaciones duplicadas para esta quincena; conciliar antes de continuar');
  if (!existeQ.empty) {
    const refExistente = doc(db, 'liquidaciones_nomina', existeQ.docs[0].id);
    return runTransaction(db, async tx => {
      const existente = await tx.get(refExistente);
      if (!existente.exists()) throw new Error('La liquidación existente cambió; reintenta');
      const raw = existente.data();
      if (raw.estado === 'cerrada') throw new Error(`La liquidación de ${quincena} ya está cerrada`);
      return { id: existeQ.docs[0].id, liquidacion: parseLiquidacion(existeQ.docs[0].id, raw) };
    });
  }

  const { inicio, fin } = rangoQuincena(quincena);
  const calendario = validarPreparacionNomina(quincena, inicio, fin, preparacion);

  // Personal activo con rol con acceso, incluidos ayudantes.
  const personalSnap = await getDocs(collection(db, 'personal'));
  const personal = personalSnap.docs
    .map(d => ({ id: d.id, ...d.data() } as Personal))
    .filter(p => p.activo && ROLES_CON_ACCESO.includes(p.rol));

  const resolverPersonal = (tecnicoId: string): string | undefined => {
    const candidatos = personal.filter(p => p.id === tecnicoId || p.uid === tecnicoId);
    return candidatos.length === 1 ? candidatos[0].id : undefined;
  };

  const ordenesSnap = await getDocs(collection(db, 'ordenes_servicio'));
  const ordenesDatos = new Map(ordenesSnap.docs.map(d => [d.id, d.data()]));
  // Comisiones pendientes en el rango (filtrar client-side para evitar índice compuesto)
  const comisionesSnap = await getDocs(collection(db, 'comisiones'));
  const duplicadas = comisionesDuplicadasNomina(comisionesSnap.docs.map(d => ({ id: d.id, datos: d.data() })), personal);
  const pendientesFecha: { id: string; tecnicoId: string }[] = [];
  const comisionesEnRango = comisionesSnap.docs
    .map(d => {
      const raw = d.data();
      const cobroElegible = comisionConCobroCompleto(raw, ordenesDatos, POLITICA_COBRO_COMISION);
      const fecha = fechaElegibleComision(raw, ordenesDatos, POLITICA_COBRO_COMISION);
      // Preservar conciliación de huérfanas/sin fecha aun cuando no sean cobrables.
      const faltaEvidencia = !fechaFinanciera(raw.fechaCobro) || !raw.ordenId ||
        (!String(raw.ordenId).startsWith('factura-manual-') && (!ordenesDatos.has(String(raw.ordenId)) || typeof raw.precioFinal !== 'number'));
      if (!raw.estaAnulada && (!raw.estadoLiquidacion || raw.estadoLiquidacion === 'pendiente') && (faltaEvidencia || (cobroElegible && !fecha))) {
        pendientesFecha.push({ id: d.id, tecnicoId: String(raw.tecnicoId || '') });
      }
      if (raw.estaAnulada || !cobroElegible || !fecha) return null;
      const desc = raw.descuentoPorGarantia as Record<string, unknown> | undefined;
      const comision: ComisionRegistro = {
        id: d.id,
        tecnicoId: (raw.tecnicoId as string) || '',
        tecnicoNombre: (raw.tecnicoNombre as string) || '',
        ordenId: (raw.ordenId as string) || '',
        ordenNumero: (raw.ordenNumero as string) || '',
        clienteNombre: (raw.clienteNombre as string) || '',
        fechaCobro: fecha,
        precioFinal: (raw.precioFinal as number) || 0,
        costoPiezas: (raw.costoPiezas as number) || 0,
        basePendienteComision: (raw.basePendienteComision as number) || 0,
        comisionPorcentaje: (raw.comisionPorcentaje as number) || 0,
        comisionMonto: (raw.comisionMonto as number) || 0,
        estadoLiquidacion: (raw.estadoLiquidacion as ComisionRegistro['estadoLiquidacion']) || 'pendiente',
        cobroLiberadoEn: fechaFinanciera(raw.cobroLiberadoEn) || undefined,
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
    .filter((c): c is ComisionRegistro => c !== null)
    .filter(c =>
      c.estadoLiquidacion === 'pendiente' &&
      c.fechaCobro <= calendario.corteComisiones
    );

  // Órdenes ya leídas para desempeño operaria y secretaria
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
    let comisionesAtrasadas: NonNullable<LiquidacionEmpleado['comisionesAtrasadas']> = [];
    let bono = 0;
    let pct: number | undefined;
    let completadas: number | undefined;
    let chequeos: number | undefined;
    let atendidas: number | undefined;
    let citasAgendadasMes: number | undefined;
    let citasCompletadasMes: number | undefined;

    if (p.rol === 'tecnico') {
      // SPRINT-149 (P-006 variante reversa): `c.tecnicoId` post-c4be345 persiste auth.uid;
      // fallback `p.id` para comisiones registradas pre-migración. Sin esto, técnicos
      // nuevos no acumulan comisiones en su nómina aunque la comisión SÍ exista.
      const comisionesT = comisionesEnRango.filter(c => resolverPersonal(c.tecnicoId) === p.id && !duplicadas.get(p.id)?.includes(c.id));
      comisionesIds = comisionesT.map(c => c.id);
      comisionesAtrasadas = comisionesT.filter(c => c.fechaCobro < inicio).map(c => ({ id: c.id, fechaDevengo: c.fechaCobro.toISOString(), quincenaDevengo: calcularQuincenaActual(c.fechaCobro), quincenaLiquidacion: quincena, incorporadaPorId: generadaPor.id }));
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
        // SPRINT-149 (P-006 variante operariaId): post-SPRINT-105 las operarias
        // nuevas tienen `personal.uid` poblado; el campo `ordenes_servicio.operariaId`
        // ahora persiste auth.uid (no doc id). Fallback a `p.id` para órdenes
        // pre-migración. Ver docs/PATRONES_REGRESION.md P-006.
        const ordsMes = ordenes.filter(o =>
          o.operariaId === (p.uid || p.id) &&
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
    const totalNeto = totalDevengado - totalDescuentos;

    const pendientesEmpleado = pendientesFecha.filter(c => resolverPersonal(c.tecnicoId) === p.id).map(c => c.id);
    // @safe-tecnicoid-id: duplicadas se indexa por documento Personal resuelto, no auth.uid.
    const emp: LiquidacionEmpleado = {
      estadoCierre: pendientesEmpleado.length || duplicadas.has(p.id) ? 'bloqueado' : 'listo',
      comisionesDuplicadas: duplicadas.get(p.id) || [],
      personalUid: p.uid || p.id,
      comisionesPendientesFecha: pendientesEmpleado,
      comisionesAtrasadas,
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

  const comisionesSinEmpleado = [...pendientesFecha, ...comisionesEnRango].filter(c => !resolverPersonal(c.tecnicoId)).map(c => c.id);
  const data: Record<string, unknown> = {
    comisionesSinEmpleado,
    quincena,
    periodoInicio: Timestamp.fromDate(inicio),
    periodoFin: Timestamp.fromDate(fin),
    corteComisiones: calendario.corteComisiones.toISOString(),
    fechaPagoProgramada: calendario.fechaPagoProgramada,
    generadaPor: generadaPor.nombre,
    generadaPorId: generadaPor.id,
    fechaGeneracion: Timestamp.now(),
    estado: 'abierta',
    totalNomina,
    empleados: serializarEmpleados(empleados),
  };
  // Nómina REAL con ID determinista: dos generadores nuevos compiten por el mismo documento.
  const idCanonico = `nomina-${quincena}`;
  const ref = doc(db, 'liquidaciones_nomina', idCanonico);
  return runTransaction(db, async tx => {
    const existente = await tx.get(ref);
    if (existente.exists()) {
      const raw = existente.data();
      if (raw.estado === 'cerrada') throw new Error(`La liquidación de ${quincena} ya está cerrada`);
      return { id: idCanonico, liquidacion: parseLiquidacion(idCanonico, raw) };
    }
    tx.set(ref, data);
    return { id: idCanonico, liquidacion: parseLiquidacion(idCanonico, data) };
  });
}

/**
 * Cierre atómico: todas las lecturas preceden a todas las escrituras.
 * Si falla una comisión, avance o cuota, no se cierra ni se descuenta nada.
 * Firestore reintenta ante cambios concurrentes; un cierre ya confirmado es no-op.
 * Los cierres parciales heredados requieren conciliación si no prueban su origen.
 */
export async function cerrarLiquidacion(
  liquidacionId: string,
  cerradaPor: Usuario,
): Promise<void> {
  const descubiertas = await getDocs(collection(db, 'comisiones'));
  const base = db;
  const ref = doc(base, 'liquidaciones_nomina', liquidacionId);
  await runTransaction(base, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Liquidación no encontrada');
    const raw = snap.data();
    if (raw.estado === 'cerrada') return;
    if (raw.estado !== 'abierta' || !raw.quincena || !Array.isArray(raw.empleados)) {
      throw new Error('Liquidación incompleta; revisar antes de cerrar');
    }
    const todosEmpleados = raw.empleados as Record<string, unknown>[];
    let empleados = todosEmpleados.filter(e => !e.estadoCierre || e.estadoCierre === 'listo');
    if (!empleados.length) throw new Error('No hay empleados listos para cerrar. Conciliar los bloqueados y recalcular.');
    const operaciones: { coleccion: string; id: string; empleado: Record<string, unknown>; cuota?: Record<string, unknown> }[] = [];
    const vistos = new Set<string>();
    const agregar = (coleccion: string, id: string, empleado: Record<string, unknown>, cuota?: Record<string, unknown>) => {
      const clave = `${coleccion}/${id}`;
      if (!id || vistos.has(clave)) throw new Error(`Referencia vacía o duplicada: ${clave}`);
      vistos.add(clave);
      operaciones.push({ coleccion, id, empleado, cuota });
    };
    for (const e of empleados) {
      for (const id of (e.comisionesIds as string[] || [])) agregar('comisiones', id, e);
      for (const id of (e.avancesIds as string[] || [])) agregar('avances', id, e);
      for (const cuota of (e.cuotasPrestamos as Record<string, unknown>[] || [])) {
        if (!(Number(e.totalDevengado) > 0)) throw new Error('Cuota sin devengado: revisar liquidación');
        agregar('prestamos_empleados', String(cuota.prestamoId || ''), e, cuota);
      }
    }
    if (operaciones.length > 400) throw new Error('La liquidación supera 400 movimientos; requiere revisión administrativa');
    const refs = operaciones.map(o => doc(base, o.coleccion, o.id));
    const documentos = await Promise.all(refs.map(r => tx.get(r)));
    const ordenesCobro = await leerOrdenesDeComisiones(documentos.flatMap((d, i) => operaciones[i].coleccion === 'comisiones' && d.exists() ? [d.data()] : []), async id => (await tx.get(doc(base, 'ordenes_servicio', id))).data());
    const identidades = todosEmpleados.map(e => ({ id: String(e.personalId), uid: typeof e.personalUid === 'string' ? e.personalUid : undefined }));
    const sospechosas = comisionesDuplicadasNomina(descubiertas.docs.map(d => ({ id: d.id, datos: d.data() })), identidades);
    const idsRevisar = [...new Set([...sospechosas.values()].flat())];
    if (operaciones.length + idsRevisar.length > 400) throw new Error('Demasiadas referencias de comisiones; requiere conciliación');
    const revisadas = await Promise.all(idsRevisar.map(id => tx.get(doc(base, 'comisiones', id))));
    const duplicadas = comisionesDuplicadasNomina(revisadas.flatMap((d, i) => d.exists() ? [{ id: idsRevisar[i], datos: d.data()! }] : []), identidades);
    for (const e of empleados) if (duplicadas.has(String(e.personalId))) { e.estadoCierre = 'bloqueado'; e.comisionesDuplicadas = duplicadas.get(String(e.personalId)); }
    empleados = empleados.filter(e => e.estadoCierre !== 'bloqueado');
    const periodo = rangoQuincena(String(raw.quincena));
    const corteComisiones = corteGuardadoNomina(raw, periodo.inicio, periodo.fin);
    // También los borradores legacy pueden contener una fecha inventada por el lector antiguo.
    documentos.forEach((documento, indice) => {
      const o = operaciones[indice];
      if (o.coleccion !== 'comisiones' || !documento.exists()) return;
      const datos = documento.data();
      if (datos.estadoLiquidacion !== 'liquidada' && !datos.estaAnulada && !comisionConCobroCompleto(datos, ordenesCobro, POLITICA_COBRO_COMISION)) throw new Error(`Comisión ${o.id}: falta trabajo terminado o cobro completo confirmado. Recalcula la nómina antes de cerrar`);
      const fecha = datos.estadoLiquidacion === 'liquidada' ? fechaFinanciera(datos.fechaCobro) : fechaElegibleComision(datos, ordenesCobro, POLITICA_COBRO_COMISION);
      const atraso = (o.empleado.comisionesAtrasadas as LiquidacionEmpleado['comisionesAtrasadas'] || []).find(c => c.id === o.id);
      const atrasoValido = atraso && fecha && atraso.fechaDevengo === fecha.toISOString() && atraso.quincenaLiquidacion === raw.quincena;
      if (!datos.estaAnulada && (!fecha || (fecha < periodo.inicio && !atrasoValido) || fecha > corteComisiones)) {
        o.empleado.estadoCierre = 'bloqueado';
        const campo = fecha ? 'comisionesFueraPeriodo' : 'comisionesPendientesFecha';
        const anterior = fecha ? 'comisionesPendientesFecha' : 'comisionesFueraPeriodo';
        o.empleado[anterior] = (o.empleado[anterior] as string[] || []).filter(id => id !== o.id);
        o.empleado[campo] = [...new Set([...(o.empleado[campo] as string[] || []), o.id])];
      }
    });
    empleados.forEach(e => { if (e.cuotasPendientesRevision) e.estadoCierre = 'bloqueado'; });
    empleados = empleados.filter(e => e.estadoCierre !== 'bloqueado');
    const ahora = Timestamp.now();
    const cambios: { indice: number; datos: Record<string, unknown> }[] = [];
    const comisiones = new Map<Record<string, unknown>, number>();
    const avances = new Map<Record<string, unknown>, number>();
    const cuotas = new Map<Record<string, unknown>, number>();
    const centavos = (valor: number) => Math.round(valor * 100);
    documentos.forEach((documento, indice) => {
      const o = operaciones[indice];
      if (!empleados.includes(o.empleado)) return;
      if (!documento.exists()) throw new Error(`${o.coleccion}/${o.id} no encontrado; cierre cancelado`);
      const d = documento.data();
      if (o.coleccion === 'comisiones') {
        if (typeof d.tecnicoId !== 'string' || !d.tecnicoId || (d.tecnicoId !== o.empleado.personalId && d.tecnicoId !== o.empleado.personalUid)) throw new Error(`Comisión ${o.id} pertenece a otro empleado; revisar`);
        const monto = Number(d.comisionMonto) + Number(d.descuentoPorGarantia?.monto ?? 0);
        if (!Number.isFinite(monto) || d.estaAnulada) throw new Error(`Comisión ${o.id} inválida`);
        comisiones.set(o.empleado, (comisiones.get(o.empleado) || 0) + monto);
        if (d.estadoLiquidacion === 'liquidada') {
          if (d.liquidacionId !== liquidacionId) throw new Error(`Comisión ${o.id} ya liquidada: requiere conciliación`);
          return;
        }
        if (!comisionConCobroCompleto(d, ordenesCobro, POLITICA_COBRO_COMISION)) throw new Error(`Comisión ${o.id}: falta trabajo terminado o cobro completo confirmado. Recalcula la nómina antes de cerrar`);
        if (d.estadoLiquidacion && d.estadoLiquidacion !== 'pendiente') throw new Error(`Estado de comisión ${o.id} inválido`);
        if (d.liquidacionId) throw new Error(`Comisión ${o.id} pendiente con referencia de liquidación incoherente; revisar`);
        cambios.push({ indice, datos: { estadoLiquidacion: 'liquidada', liquidacionId,
          quincenaAsignada: raw.quincena, liquidadaEn: ahora, liquidadaPor: cerradaPor.nombre } });
      } else if (o.coleccion === 'avances') {
        if (d.personalId !== o.empleado.personalId || !Number.isFinite(d.monto) || d.monto <= 0) throw new Error(`Avance ${o.id} inconsistente`);
        avances.set(o.empleado, (avances.get(o.empleado) || 0) + d.monto);
        if (d.descontado === true) {
          if (d.liquidacionId !== liquidacionId) throw new Error(`Avance ${o.id} descontado en otra liquidación o sin origen`);
          return;
        }
        cambios.push({ indice, datos: { descontado: true, liquidacionId, liquidacionFechaDescuento: ahora, updatedAt: ahora } });
      } else {
        const monto = Number(o.cuota!.monto);
        const numero = Number(o.cuota!.numeroCuota);
        if (d.personalId !== o.empleado.personalId || !Number.isFinite(monto) || monto <= 0 || !Number.isInteger(numero) || numero < 1) throw new Error(`Cuota ${o.id} inválida`);
        cuotas.set(o.empleado, (cuotas.get(o.empleado) || 0) + monto);
        const sinPagosHistoricos = d.cuotasHistorial === undefined && Number(d.cuotasPagadas ?? 0) === 0 && Number.isFinite(Number(d.montoTotal)) && centavos(Number(d.saldoPendiente)) === centavos(Number(d.montoTotal));
        if (!Array.isArray(d.cuotasHistorial) && !sinPagosHistoricos) throw new Error(`Historial de préstamo ${o.id} inválido`);
        const historial = (d.cuotasHistorial ?? []) as Record<string, unknown>[];
        if (historial.length !== Number(d.cuotasPagadas ?? 0) || historial.some(h => !Number.isFinite(Number(h.monto)) || Number(h.monto) <= 0) || new Set(historial.map(h => h.liquidacionId)).size !== historial.length) throw new Error(`Historial de préstamo ${o.id} inconsistente`);
        const aplicado = historial.reduce((s, h) => s + Number(h.monto), 0);
        const saldo = Number(d.montoTotal) - aplicado;
        if (!Number.isFinite(saldo) || saldo < 0 || centavos(saldo) !== centavos(Number(d.saldoPendiente))) throw new Error(`Saldo del préstamo ${o.id} inconsistente`);
        const existentes = historial.filter(h => h.liquidacionId === liquidacionId);
        if (existentes.length) {
          if (existentes.length !== 1 || centavos(Number(existentes[0].monto)) !== centavos(monto) || existentes[0].numero !== numero || existentes[0].quincena !== raw.quincena) throw new Error(`Cuota ${o.id} aplicada con otros datos: revisar`);
          return;
        }
        if (d.estado !== 'activo' || !Number.isFinite(saldo) || centavos(saldo) !== centavos(Number(d.saldoPendiente)) || numero !== Number(d.cuotasPagadas ?? 0) + 1 || numero > Number(d.cuotasTotales) || centavos(monto) > centavos(saldo)) throw new Error(`Préstamo ${o.id} cambió; revisar cuota antes de cerrar`);
        const saldoRestante = (centavos(saldo) - centavos(monto)) / 100;
        cambios.push({ indice, datos: {
          cuotasHistorial: [...historial, { numero, monto, liquidacionId, quincena: raw.quincena, fechaAplicacion: ahora, saldoRestante }],
          cuotasPagadas: numero, saldoPendiente: saldoRestante,
          estado: numero >= Number(d.cuotasTotales) || saldoRestante === 0 ? 'pagado' : 'activo', updatedAt: ahora,
        } });
      }
    });
    for (const e of empleados) {
      for (const [sumas, campo] of [[comisiones, 'totalComisiones'], [avances, 'totalAvances'], [cuotas, 'totalCuotasPrestamos']] as const) {
        if (centavos(sumas.get(e) || 0) !== centavos(Number(e[campo] ?? 0))) throw new Error(`El total ${campo} cambió; revisar liquidación`);
      }
      // La nómina leída en esta transacción es la fuente de ajustes manuales/asistencia.
      // No convertir descuentos que exceden devengado en un pago neto cero.
      let ajustes = 0;
      for (const [lista, campo] of [['descuentosAdHoc', 'totalDescuentosAdHoc'], ['descuentosAsistencia', 'totalAsistencia']] as const) {
        const detalle = e[lista] ?? [];
        if (!Array.isArray(detalle)) throw new Error(`Detalle ${lista} inválido; revisar liquidación`);
        let suma = 0;
        for (const descuento of detalle) {
          const monto = Number(descuento?.monto);
          if (!Number.isFinite(monto) || monto < 0) throw new Error(`Monto ${lista} inválido; revisar liquidación`);
          suma += monto;
        }
        if (centavos(suma) !== centavos(Number(e[campo] ?? 0))) throw new Error(`El total ${campo} no coincide con su detalle; revisar liquidación`);
        ajustes += suma;
      }
      const descuentos = (avances.get(e) || 0) + (cuotas.get(e) || 0) + ajustes;
      const devengado = Number(e.totalDevengado);
      if (!Number.isFinite(devengado) || devengado < 0) throw new Error('Devengado inválido; revisar liquidación');
      if (centavos(descuentos) > centavos(devengado)) throw new Error(`Los descuentos de ${e.personalNombre || e.personalId} exceden el devengado. Revisar antes de cerrar; no se aplicó ningún descuento.`);
      if (e.totalDescuentos !== undefined && centavos(Number(e.totalDescuentos)) !== centavos(descuentos)) throw new Error('Total de descuentos inconsistente; revisar liquidación');
      if (e.totalNeto !== undefined && centavos(Number(e.totalNeto)) !== centavos(devengado) - centavos(descuentos)) throw new Error('Neto inconsistente; revisar liquidación');
    }
    for (const cambio of cambios) tx.update(refs[cambio.indice], cambio.datos);
    const actualizados = todosEmpleados.map(e => empleados.includes(e) ? { ...e, estadoCierre: 'cerrado', fechaCierreEmpleado: ahora, cerradoPorId: cerradaPor.id } : e);
    const completa = actualizados.every(e => e.estadoCierre === 'cerrado' && !(e.comisionesFueraPeriodo as string[] || []).length) && !(raw.comisionesSinEmpleado as string[] || []).length;
    const cierre: Record<string, unknown> = { empleados: actualizados, estado: completa ? 'cerrada' : 'abierta', asistenciaBloqueada: completa };
    if (completa) Object.assign(cierre, { cerradaPor: cerradaPor.nombre, cerradaPorId: cerradaPor.id, fechaCierre: ahora });
    tx.update(ref, cierre);
  });
}

/** Vista previa explícita: no aplica ninguna cuota. Incluye préstamos legacy del empleado. */
export async function prepararCuotasPendientes(personalId: string): Promise<CuotaPrestamoAplicada[]> {
  const candidatos = await getDocs(query(collection(db, 'prestamos_empleados'), where('personalId', '==', personalId)));
  return candidatos.docs.flatMap(c => {
    const d = c.data();
    if (d.personalId !== personalId || d.estado !== 'activo' || !(d.saldoPendiente > 0) || !(d.cuotasPagadas < d.cuotasTotales)) return [];
    const monto = Math.min(Number(d.montoCuota), Number(d.saldoPendiente));
    if (!Number.isFinite(monto) || monto <= 0) throw new Error(`Préstamo ${c.id} tiene cuota inválida`);
    return [{ prestamoId: c.id, numeroCuota: Number(d.cuotasPagadas) + 1, monto, motivo: String(d.motivo || '') }];
  });
}

/** Confirma exactamente la vista previa; aplicar al préstamo sigue reservado al cierre atómico. */
export async function confirmarCuotasPendientes(liquidacionId: string, personalId: string, propuestas: CuotaPrestamoAplicada[]): Promise<void> {
  const actuales = await prepararCuotasPendientes(personalId);
  if (actuales.length !== propuestas.length || actuales.some(a => !propuestas.some(p => p.prestamoId === a.prestamoId && p.numeroCuota === a.numeroCuota && p.monto === a.monto && (p.motivo || '') === (a.motivo || '')))) throw new Error('Los préstamos cambiaron; volver a revisar la vista previa');
  if (propuestas.length > 400 || new Set(propuestas.map(c => c.prestamoId)).size !== propuestas.length) throw new Error('Cuotas duplicadas o demasiadas referencias');
  await runTransaction(db, async tx => {
    const ref = doc(db, 'liquidaciones_nomina', liquidacionId);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Liquidación no encontrada');
    const raw = snap.data();
    const empleados = raw.empleados as Record<string, unknown>[];
    const e = empleados.find(e => e.personalId === personalId);
    if (raw.estado !== 'abierta' || !e || e.pagado || e.estadoCierre === 'cerrado' || !e.cuotasPendientesRevision) throw new Error('Empleado no tiene cuotas pendientes de revisión');
    if (!(Number(e.totalDevengado) > 0) || (e.cuotasPrestamos as unknown[] || []).length) throw new Error('El devengado o las cuotas cambiaron; revisar');
    const prestamos = await Promise.all(propuestas.map(c => tx.get(doc(db, 'prestamos_empleados', c.prestamoId))));
    prestamos.forEach((p, i) => {
      const d = p.data(), c = propuestas[i];
      if (!d || d.personalId !== personalId || d.estado !== 'activo' || d.cuotasPagadas >= d.cuotasTotales || c.numeroCuota !== Number(d.cuotasPagadas) + 1 || c.monto !== Math.min(Number(d.montoCuota), Number(d.saldoPendiente)) || !(c.monto > 0) || (c.motivo || '') !== String(d.motivo || '')) throw new Error('Préstamo cambió desde la vista previa; volver a revisar');
    });
    const total = propuestas.reduce((s, c) => s + c.monto, 0);
    const descuentos = Number(e.totalAvances || 0) + Number(e.totalDescuentosAdHoc || 0) + Number(e.totalAsistencia || 0) + total;
    Object.assign(e, { cuotasPrestamos: propuestas.map((c, i) => ({ prestamoId: c.prestamoId, numeroCuota: c.numeroCuota, monto: c.monto, motivo: String(prestamos[i].data()?.motivo || '') })), totalCuotasPrestamos: total, totalDescuentos: descuentos, totalNeto: Number(e.totalDevengado) - descuentos, cuotasPendientesRevision: false, estadoCierre: (e.comisionesPendientesFecha as string[] || []).length ? 'bloqueado' : 'listo' });
    tx.update(ref, { empleados });
  });
}

/** Refresca conciliaciones ya resueltas, sin pagar ni reasignar registros a empleados cerrados. */
export async function actualizarConciliacionLiquidacion(liquidacionId: string, actor: Usuario): Promise<void> {
  // Incluye legacy sin estado; esta consulta descubre, no reserva inserciones concurrentes.
  const descubiertas = await getDocs(collection(db, 'comisiones'));
  await runTransaction(db, async tx => {
    const ref = doc(db, 'liquidaciones_nomina', liquidacionId);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Liquidación no encontrada');
    const raw = snap.data();
    if (raw.estado !== 'abierta') return;
    const empleados = raw.empleados as Record<string, unknown>[];
    const nuevasHuerfanas = descubiertas.docs.filter(c => { const d = c.data();
      const propietarios = empleados.filter(e => typeof d.tecnicoId === 'string' && d.tecnicoId.trim() && (d.tecnicoId === e.personalId || (!!e.personalUid && d.tecnicoId === e.personalUid)));
      return !d.estaAnulada && (!d.estadoLiquidacion || d.estadoLiquidacion === 'pendiente') && propietarios.length !== 1;
    }).map(c => c.id);
    const huerfanas = [...new Set([...(raw.comisionesSinEmpleado as string[] || []), ...nuevasHuerfanas])];
    const ids = [...new Set([...huerfanas, ...empleados.flatMap(e => e.comisionesFueraPeriodo as string[] || [])])];
    if (ids.length > 400) throw new Error('Demasiadas conciliaciones; requiere revisión');
    const snaps = await Promise.all(ids.map(id => tx.get(doc(db, 'comisiones', id))));
    const datos = new Map(ids.map((id, i) => [id, snaps[i].exists() ? snaps[i].data() : undefined]));
    const resuelta = (id: string) => { const c = datos.get(id); return c?.estaAnulada === true || (c?.estadoLiquidacion === 'liquidada' && !!c.liquidacionId); };
    const pendientes: string[] = [];
    for (const id of huerfanas) {
      if (resuelta(id)) continue;
      const c = datos.get(id);
      const candidatos = empleados.filter(e => c && typeof c.tecnicoId === 'string' && c.tecnicoId.trim() && (c.tecnicoId === e.personalId || (!!e.personalUid && c.tecnicoId === e.personalUid)));
      if (candidatos.length === 1 && !candidatos[0].pagado && candidatos[0].estadoCierre !== 'cerrado') {
        const e = candidatos[0];
        e.comisionesPendientesFecha = [...new Set([...(e.comisionesPendientesFecha as string[] || []), id])];
        e.estadoCierre = 'bloqueado';
      } else pendientes.push(id);
    }
    const actualizados: Record<string, unknown>[] = empleados.map(e => ({ ...e, comisionesFueraPeriodo: (e.comisionesFueraPeriodo as string[] || []).filter(id => !resuelta(id)) }));
    const completa = !pendientes.length && actualizados.every(e => e.estadoCierre === 'cerrado' && !(e.comisionesFueraPeriodo as string[]).length);
    const cambios: Record<string, unknown> = { empleados: actualizados, comisionesSinEmpleado: pendientes, estado: completa ? 'cerrada' : 'abierta', asistenciaBloqueada: completa };
    if (completa) Object.assign(cambios, { cerradaPor: actor.nombre, cerradaPorId: actor.id, fechaCierre: Timestamp.now() });
    tx.update(ref, cambios);
  });
}

/** Recalcula solo comisiones del empleado bloqueado; conserva sueldo, bonos y descuentos del borrador. */
export async function recalcularEmpleadoLiquidacion(liquidacionId: string, personalId: string, actor: Usuario): Promise<void> {
  // Consulta de descubrimiento: una inserción posterior se recupera en otra actualización o nómina futura.
  const candidatos = await getDocs(collection(db, 'comisiones'));
  await runTransaction(db, async tx => {
    const ref = doc(db, 'liquidaciones_nomina', liquidacionId);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Liquidación no encontrada');
    const raw = snap.data();
    if (raw.estado !== 'abierta') throw new Error('La liquidación ya está cerrada');
    const empleados = raw.empleados as Record<string, unknown>[];
    const indice = empleados.findIndex(e => e.personalId === personalId);
    if (indice < 0) throw new Error('Empleado no encontrado');
    const e = empleados[indice];
    if (e.pagado || e.estadoCierre === 'cerrado') throw new Error('Solo se actualiza un empleado abierto sin pagar');
    const sospechosas = comisionesDuplicadasNomina(candidatos.docs.map(c => ({ id: c.id, datos: c.data() })), empleados.map(emp => ({ id: String(emp.personalId), uid: typeof emp.personalUid === 'string' ? emp.personalUid : undefined }))).get(personalId) || [];
    const nuevos = candidatos.docs.filter(c => { const d = c.data();
      const duenos = empleados.filter(emp => typeof d.tecnicoId === 'string' && d.tecnicoId && (d.tecnicoId === emp.personalId || (!!emp.personalUid && d.tecnicoId === emp.personalUid)));
      return duenos.length === 1 && duenos[0] === e && !d.estaAnulada && (!d.estadoLiquidacion || d.estadoLiquidacion === 'pendiente' || sospechosas.includes(c.id));
    }).map(c => c.id);
    const ids = [...new Set([...(e.comisionesIds as string[] || []), ...(e.comisionesPendientesFecha as string[] || []), ...(e.comisionesFueraPeriodo as string[] || []), ...nuevos])];
    if (ids.length > 400) throw new Error('Demasiadas comisiones; requiere revisión administrativa');
    const snaps = await Promise.all(ids.map(id => tx.get(doc(db, 'comisiones', id))));
    const ordenesCobro = await leerOrdenesDeComisiones(snaps.flatMap(s => s.exists() ? [s.data()] : []), async id => (await tx.get(doc(db, 'ordenes_servicio', id))).data());
    const origenes = [...new Set(snaps.flatMap(c => { const d = c.data(); return d?.estadoLiquidacion === 'liquidada' && typeof d.liquidacionId === 'string' ? [d.liquidacionId] : []; }))];
    if (ids.length + origenes.length > 400) throw new Error('Demasiadas referencias para actualizar; requiere revisión');
    const origenSnaps = await Promise.all(origenes.map(id => tx.get(doc(db, 'liquidaciones_nomina', id))));
    const origenDatos = new Map(origenes.map((id, i) => [id, origenSnaps[i].exists() ? origenSnaps[i].data() : undefined]));
    const { inicio, fin } = rangoQuincena(String(raw.quincena));
    const corteComisiones = corteGuardadoNomina(raw, inicio, fin);
    const duplicadas = comisionesDuplicadasNomina(snaps.flatMap((c, i) => c.exists() ? [{ id: ids[i], datos: c.data()! }] : []), empleados.map(emp => ({ id: String(emp.personalId), uid: typeof emp.personalUid === 'string' ? emp.personalUid : undefined }))).get(personalId) || [];
    const atrasadas: NonNullable<LiquidacionEmpleado['comisionesAtrasadas']> = [];
    const yaLiquidadas = [...(e.comisionesYaLiquidadas as NonNullable<LiquidacionEmpleado['comisionesYaLiquidadas']> || [])];
    const incluidos: string[] = [], pendientes: string[] = [];
    const fueraPeriodo: string[] = [];
    let totalComisiones = 0;
    snaps.forEach((c, i) => {
      if (!c.exists()) throw new Error(`Comisión ${ids[i]} no encontrada; revisar conciliación`);
      const dato = c.data();
      if (typeof dato.tecnicoId !== 'string' || !dato.tecnicoId.trim() || (dato.tecnicoId !== personalId && (!e.personalUid || dato.tecnicoId !== e.personalUid))) throw new Error(`Comisión ${ids[i]} cambió de responsable; revisar`);
      if (dato.estaAnulada || dato.estadoLiquidacion === 'anulada' || duplicadas.includes(ids[i])) return;
      if ((!dato.estadoLiquidacion || dato.estadoLiquidacion === 'pendiente') && dato.liquidacionId) throw new Error(`Comisión ${ids[i]} pendiente con referencia de liquidación incoherente; revisar`);
      if (dato.estadoLiquidacion === 'retenida_por_cobro') return;
      if (dato.estadoLiquidacion && dato.estadoLiquidacion !== 'pendiente') {
        const origen = origenDatos.get(String(dato.liquidacionId));
        const confirmado = dato.estadoLiquidacion === 'liquidada' && dato.liquidacionId !== liquidacionId && origen && Array.isArray(origen.empleados) && origen.empleados.some((emp: Record<string, unknown>) => emp.personalId === personalId && (emp.estadoCierre === 'cerrado' || (origen.estado === 'cerrada' && !emp.estadoCierre)) && (emp.comisionesIds as string[] || []).includes(ids[i]));
        if (!confirmado) throw new Error(`Comisión ${ids[i]} ya liquidada sin evidencia coherente; revisar`);
        if (!yaLiquidadas.some(c => c.id === ids[i])) yaLiquidadas.push({ id: ids[i], liquidacionId: String(dato.liquidacionId) });
        return;
      }
      if (!comisionConCobroCompleto(dato, ordenesCobro, POLITICA_COBRO_COMISION)) return;
      const fecha = fechaElegibleComision(dato, ordenesCobro, POLITICA_COBRO_COMISION);
      if (!fecha) { pendientes.push(ids[i]); return; }
      if (fecha > corteComisiones) { fueraPeriodo.push(ids[i]); return; }
      if (fecha < inicio) atrasadas.push({ id: ids[i], fechaDevengo: fecha.toISOString(), quincenaDevengo: calcularQuincenaActual(fecha), quincenaLiquidacion: String(raw.quincena), incorporadaPorId: actor.id });
      const monto = Number(dato.comisionMonto) + Number(dato.descuentoPorGarantia?.monto ?? 0);
      if (!Number.isFinite(monto)) throw new Error(`Comisión ${ids[i]} con importe inválido`);
      incluidos.push(ids[i]); totalComisiones += monto;
    });
    const totalDevengado = Number(e.sueldoBase) + Number(e.bono || 0) + totalComisiones;
    const sinCuotasCapturadas = !(e.cuotasPrestamos as unknown[] || []).length;
    const cuotasPendientesRevision = sinCuotasCapturadas && totalDevengado <= 0 ? false
      : e.cuotasPendientesRevision === true || (Number(e.totalDevengado) <= 0 && totalDevengado > 0 && sinCuotasCapturadas);
    const totalDescuentos = Number(e.totalAvances || 0) + Number(e.totalCuotasPrestamos || 0) + Number(e.totalDescuentosAdHoc || 0) + Number(e.totalAsistencia || 0);
    empleados[indice] = { ...e, comisionesIds: incluidos, totalComisiones, cantidadOrdenesConComision: incluidos.length,
      comisionesDuplicadas: duplicadas, comisionesYaLiquidadas: yaLiquidadas, comisionesAtrasadas: atrasadas, comisionesFueraPeriodo: fueraPeriodo, comisionesPendientesFecha: pendientes, cuotasPendientesRevision, estadoCierre: pendientes.length || duplicadas.length || cuotasPendientesRevision ? 'bloqueado' : 'listo',
      totalDevengado, totalDescuentos, totalNeto: totalDevengado - totalDescuentos };
    tx.update(ref, { empleados, totalNomina: empleados.reduce((s, emp) => s + Number(emp.totalDevengado), 0) });
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
    if (raw.estado === 'cerrada' || raw.asistenciaBloqueada === true) {
      throw new Error('La liquidación está cerrada o en revisión de cierre — no se pueden agregar descuentos');
    }
    const empleadosRaw = (raw.empleados as Record<string, unknown>[]) || [];
    const idx = empleadosRaw.findIndex(e => e.personalId === personalId);
    if (idx === -1) throw new Error('Empleado no encontrado en la liquidación');
    if (empleadosRaw[idx].pagado || (empleadosRaw[idx].estadoCierre && empleadosRaw[idx].estadoCierre !== 'listo')) throw new Error('El empleado está bloqueado, cerrado o pagado; no se pueden cambiar descuentos');

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
    const totalDescuentos = totalAvances + totalDescuentosAdHoc + totalCuotasPrestamos + (Number(eRaw.totalAsistencia) || 0);
    const totalNeto = totalDevengado - totalDescuentos;

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
    if (raw.estado === 'cerrada' || raw.asistenciaBloqueada === true) {
      throw new Error('La liquidación está cerrada o en revisión de cierre — no se pueden quitar descuentos');
    }
    const empleadosRaw = (raw.empleados as Record<string, unknown>[]) || [];
    const idx = empleadosRaw.findIndex(e => e.personalId === personalId);
    if (idx === -1) throw new Error('Empleado no encontrado en la liquidación');
    if (empleadosRaw[idx].pagado || (empleadosRaw[idx].estadoCierre && empleadosRaw[idx].estadoCierre !== 'listo')) throw new Error('El empleado está bloqueado, cerrado o pagado; no se pueden cambiar descuentos');

    const eRaw = empleadosRaw[idx];
    const descuentosAdHocPrev = (eRaw.descuentosAdHoc as Record<string, unknown>[]) || [];
    const descuentosAdHocNuevos = descuentosAdHocPrev.filter(d => d.id !== descuentoId);
    const totalDescuentosAdHoc = descuentosAdHocNuevos.reduce((s, d) => s + (Number(d.monto) || 0), 0);
    const totalAvances = Number(eRaw.totalAvances) || 0;
    const totalCuotasPrestamos = Number(eRaw.totalCuotasPrestamos) || 0;
    const totalDevengado = Number(eRaw.totalDevengado) || 0;
    const totalDescuentos = totalAvances + totalDescuentosAdHoc + totalCuotasPrestamos + (Number(eRaw.totalAsistencia) || 0);
    const totalNeto = totalDevengado - totalDescuentos;

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
  await runTransaction(db, async tx => {
  const snap = await tx.get(ref);
  if (!snap.exists()) throw new Error('Liquidación no encontrada');
  const raw = snap.data();
  if (!((raw.empleados as Record<string, unknown>[]) || []).some(e => e.personalId === personalId)) throw new Error('Empleado no encontrado en la liquidación');
  const empleados = ((raw.empleados as Record<string, unknown>[]) || []).map(e => {
    if (e.personalId !== personalId) return e;
    if (e.estadoCierre !== 'cerrado' && !(raw.estado === 'cerrada' && !e.estadoCierre)) throw new Error('Cerrar el empleado antes de registrar el pago');
    if (e.pagado) return e;
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
  tx.update(ref, { empleados });
  });
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
    if (e.comisionesDuplicadas) out.comisionesDuplicadas = e.comisionesDuplicadas;
    if (e.estadoCierre) out.estadoCierre = e.estadoCierre;
    if (e.comisionesAtrasadas) out.comisionesAtrasadas = e.comisionesAtrasadas;
    if (e.cuotasPendientesRevision !== undefined) out.cuotasPendientesRevision = e.cuotasPendientesRevision;
    if (e.comisionesYaLiquidadas) out.comisionesYaLiquidadas = e.comisionesYaLiquidadas;
    if (e.comisionesFueraPeriodo) out.comisionesFueraPeriodo = e.comisionesFueraPeriodo;
    if (e.personalUid) out.personalUid = e.personalUid;
    if (e.comisionesPendientesFecha) out.comisionesPendientesFecha = e.comisionesPendientesFecha;
    if (e.fechaCierreEmpleado) out.fechaCierreEmpleado = Timestamp.fromDate(e.fechaCierreEmpleado);
    if (e.cerradoPorId) out.cerradoPorId = e.cerradoPorId;
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
    if (e.totalAsistencia !== undefined) out.totalAsistencia = e.totalAsistencia;
    if (e.descuentosAsistencia) out.descuentosAsistencia = e.descuentosAsistencia;
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
    comisionesSinEmpleado: (raw.comisionesSinEmpleado as string[]) || [],
    quincena: (raw.quincena as string) || '',
    corteComisiones: fechaFinanciera(raw.corteComisiones) || undefined,
    fechaPagoProgramada: typeof raw.fechaPagoProgramada === 'string' ? raw.fechaPagoProgramada : undefined,
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
        estadoCierre: (e.estadoCierre as LiquidacionEmpleado['estadoCierre']) || (raw.estado === 'cerrada' ? 'cerrado' : 'listo'),
        comisionesAtrasadas: (e.comisionesAtrasadas as LiquidacionEmpleado['comisionesAtrasadas']) || [],
        cuotasPendientesRevision: e.cuotasPendientesRevision === true,
        comisionesYaLiquidadas: (e.comisionesYaLiquidadas as LiquidacionEmpleado['comisionesYaLiquidadas']) || [],
        comisionesFueraPeriodo: (e.comisionesFueraPeriodo as string[]) || [],
        personalUid: e.personalUid as string | undefined,
        comisionesDuplicadas: (e.comisionesDuplicadas as string[]) || [],
        comisionesPendientesFecha: (e.comisionesPendientesFecha as string[]) || [],
        fechaCierreEmpleado: fechaFinanciera(e.fechaCierreEmpleado) || undefined,
        cerradoPorId: e.cerradoPorId as string | undefined,
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
        totalAsistencia: e.totalAsistencia as number | undefined,
        descuentosAsistencia: e.descuentosAsistencia as LiquidacionEmpleado["descuentosAsistencia"],
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
