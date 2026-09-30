import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Personal } from '../types';
import { fechaFinanciera } from '../utils/fechaFinanciera';
import { diaCobroRD, proyectarCobrosCaja } from '../utils/movimientosCobros';
import { comisionAjustada, enPeriodo, periodoValido, rangoMesRD } from '../utils/metricasNegocio';

export interface DataMes {
  totalFacturas: number;
  ventasBrutas: number;
  ventasNetas: number;
  itbisCobrado: number; // referencia interna del conduce, NO dinero cobrado ni impuesto fiscal
  costoPiezas: number;
  utilidadBruta: number;
  gastos: Record<string, number>;
  totalGastos: number;
  sueldoBase: number;
  totalComisiones: number; // devengadas en rango, informativas; no se suman de nuevo al costo de nómina
  comisionesNominaCerrada: number;
  totalBonos: number;
  totalAsistencia: number;
  totalNomina: number;
  utilidadOperativa: number;
  bonosIncompletos: boolean;
  nominaIncompleta: boolean;
  sueldoActualReferencia: number;
  cobrosConfirmados: number;
  cobrosPendientes: number;
  incidencias: string[];
  comisionesSinFecha: { id: string; ordenNumero: string; tecnicoNombre: string }[];
  nominasIncluidas: { id: string; quincena: string; periodoFin: string; empleados: number }[];
  inicio: string;
  fin: string;
}
const numero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Comparación inmediatamente anterior de igual número de días RD. */
export function periodoAnteriorEquivalente(inicio: Date, fin: Date) {
  if (!periodoValido(inicio, fin)) throw new Error('Selecciona un rango de fechas válido.');
  const duracion = fin.getTime() - inicio.getTime() + 1;
  return { inicio: new Date(inicio.getTime() - duracion), fin: new Date(inicio.getTime() - 1) };
}

export async function cargarDataMes(year: number, month: number, personal: Personal[]): Promise<DataMes> {
  const { inicio, fin } = rangoMesRD(`${year}-${String(month).padStart(2, '0')}`);
  return cargarDataRango(inicio, fin, personal);
}

/** Informe operativo: documentos por emisión, caja por pago y nómina por periodoFin. */
export async function cargarDataRango(inicio: Date, fin: Date, personal: Personal[]): Promise<DataMes> {
  if (!periodoValido(inicio, fin)) throw new Error('Selecciona un rango de fechas válido.');
  // Leer fechas crudas admite Timestamp e ISO legacy y deja visibles registros sin fecha.
  const [facturasSnap, gastosSnap, comisionesSnap, ordenesSnap] = await Promise.all([
    getDocs(collection(db, 'facturas')), getDocs(collection(db, 'gastos')),
    getDocs(collection(db, 'comisiones')), getDocs(collection(db, 'ordenes_servicio')),
  ]);
  const incidencias: string[] = [];
  let ventasBrutas = 0, ventasNetas = 0, itbisCobrado = 0, costoPiezas = 0, totalFacturas = 0;
  facturasSnap.docs.forEach(d => {
    const f = d.data();
    if (f.estado === 'anulada') return;
    const fecha = fechaFinanciera(f.fechaEmision);
    if (!fecha) { incidencias.push(`Conduce ${f.numero || d.id}: fecha de emisión desconocida.`); return; }
    if (!enPeriodo(fecha, inicio, fin)) return;
    if (!numero(f.total) || !numero(f.subtotal) || !numero(f.costoPiezas) || !numero(f.itbisMonto)) {
      incidencias.push(`Conduce ${f.numero || d.id}: importes incompletos o inválidos.`); return;
    }
    // Un costo superior al subtotal es una pérdida válida. Importes ausentes no son cero.
    if (f.total < 0 || f.subtotal < 0 || f.costoPiezas < 0 || f.itbisMonto < 0 ||
        f.subtotal > f.total || Math.abs(f.subtotal + f.itbisMonto - f.total) > 0.011) {
      incidencias.push(`Conduce ${f.numero || d.id}: importes incoherentes; revisar total, subtotal, referencia interna y costos.`); return;
    }
    totalFacturas++; ventasBrutas += f.total; ventasNetas += f.subtotal;
    costoPiezas += f.costoPiezas; itbisCobrado += f.itbisMonto;
  });
  const utilidadBruta = ventasNetas - costoPiezas;
  const gastos: Record<string, number> = { repuestos: 0, transporte: 0, herramientas: 0, servicios: 0, otros: 0 };
  let totalGastos = 0;
  gastosSnap.docs.forEach(d => {
    const g = d.data(); const fecha = fechaFinanciera(g.fecha);
    if (!fecha) { incidencias.push(`Gasto ${d.id}: fecha desconocida.`); return; }
    if (!enPeriodo(fecha, inicio, fin)) return;
    if (!numero(g.monto) || g.monto <= 0) { incidencias.push(`Gasto ${d.id}: importe inválido.`); return; }
    const categoria = typeof g.categoria === 'string' && g.categoria ? g.categoria : 'otros';
    gastos[categoria] = (gastos[categoria] || 0) + g.monto; totalGastos += g.monto;
  });
  // Sin vínculo compra→conduce, costoPiezas y gastos.repuestos del mismo período pueden
  // referirse a las mismas compras. No inventamos exclusión ni tocamos dinero histórico:
  // declaramos incidencia — el contrato existente de UI oculta la utilidad como provisional.
  if (costoPiezas > 0 && gastos.repuestos > 0) {
    incidencias.push('Posible solapamiento: costo de piezas de conduces y gastos categoría repuestos del período pueden referirse a las mismas compras. Utilidad provisional; requiere conciliación manual antes de firmar el resultado.');
  }
  let totalComisiones = 0;
  const comisionesSinFecha: DataMes['comisionesSinFecha'] = [];
  comisionesSnap.docs.forEach(d => {
    const c = d.data(); if (c.estaAnulada || c.estadoLiquidacion === 'anulada') return;
    const fecha = fechaFinanciera(c.fechaCobro);
    if (!fecha) { comisionesSinFecha.push({ id: d.id, ordenNumero: String(c.ordenNumero || ''), tecnicoNombre: String(c.tecnicoNombre || '') }); return; }
    if (!enPeriodo(fecha, inicio, fin)) return;
    if (!numero(c.comisionMonto) || !numero(c.descuentoPorGarantia?.monto ?? 0)) { incidencias.push(`Comisión ${d.id}: importe inválido.`); return; }
    totalComisiones += comisionAjustada(c);
  });
  let sueldoBase = 0, comisionesNominaCerrada = 0, totalBonos = 0, totalAsistencia = 0;
  let bonosIncompletos = false, nominaIncompleta = false;
  const nominasIncluidas: DataMes['nominasIncluidas'] = [];
  try {
    const snap = await getDocs(collection(db, 'liquidaciones_nomina'));
    const candidatas = snap.docs.flatMap(d => {
      const n = d.data(); const fecha = fechaFinanciera(n.periodoFin);
      if (!fecha) { incidencias.push(`Nómina ${d.id}: período desconocido.`); nominaIncompleta = true; return []; }
      return enPeriodo(fecha, inicio, fin) ? [{ id: d.id, n, fecha }] : [];
    });
    const claves = new Map<string, number>();
    const clave = (n: typeof candidatas[number], e: Record<string, unknown>) => `${diaCobroRD(n.fecha)}:${String(e.personalId || '')}`;
    for (const n of candidatas) for (const e of Array.isArray(n.n.empleados) ? n.n.empleados : []) {
      if (e.estadoCierre === 'cerrado' || (n.n.estado === 'cerrada' && !e.estadoCierre)) claves.set(clave(n, e), (claves.get(clave(n, e)) || 0) + 1);
    }
    for (const n of candidatas) {
      let empleados = 0;
      if (!Array.isArray(n.n.empleados) || !n.n.empleados.length) { nominaIncompleta = true; incidencias.push(`Nómina ${n.id}: sin desglose de empleados.`); continue; }
      for (const e of n.n.empleados) {
        if (e.estadoCierre !== 'cerrado' && !(n.n.estado === 'cerrada' && !e.estadoCierre)) { nominaIncompleta = true; continue; }
        if (!e.personalId || (claves.get(clave(n, e)) || 0) !== 1 || ![e.sueldoBase, e.totalComisiones, e.bono ?? 0, e.totalAsistencia ?? 0].every(numero)) {
          nominaIncompleta = true; incidencias.push(`Nómina ${n.id}: empleado duplicado o desglose inválido.`); continue;
        }
        if (e.sueldoBase < 0 || (e.bono ?? 0) < 0 || (e.totalAsistencia ?? 0) < 0 || e.sueldoBase + e.totalComisiones + (e.bono ?? 0) - (e.totalAsistencia ?? 0) < 0) {
          nominaIncompleta = true; incidencias.push(`Nómina ${n.id}: importes de costo inconsistentes.`); continue;
        }
        sueldoBase += e.sueldoBase; comisionesNominaCerrada += e.totalComisiones;
        totalBonos += e.bono ?? 0; totalAsistencia += e.totalAsistencia ?? 0; empleados++;
      }
      if (empleados) nominasIncluidas.push({ id: n.id, quincena: String(n.n.quincena || 'Sin quincena'), periodoFin: diaCobroRD(n.fecha), empleados });
    }
    const [anioInicio, mesInicio] = diaCobroRD(inicio).split('-').map(Number);
    const [anioFin, mesFin] = diaCobroRD(fin).split('-').map(Number);
    for (let cursor = anioInicio * 12 + mesInicio - 1; cursor <= anioFin * 12 + mesFin - 1; cursor++) {
      const anio = Math.floor(cursor / 12), mes = cursor % 12 + 1;
      const ultimoDia = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
      for (const dia of [14, Math.min(29, ultimoDia)]) {
        const texto = `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
        const cierreEsperado = new Date(fechaFinanciera(texto)!.getTime() + 86400000 - 1);
        if (enPeriodo(cierreEsperado, inicio, fin) && !nominasIncluidas.some(n => n.periodoFin === texto)) {
          nominaIncompleta = true; incidencias.push(`Sin nómina cerrada para el período que termina el ${texto}.`);
        }
      }
    }
    if (!nominasIncluidas.length) { nominaIncompleta = true; incidencias.push('Sin nóminas cerradas con período terminado en el rango; no se asume costo salarial cero.'); }
  } catch {
    bonosIncompletos = true; nominaIncompleta = true;
    incidencias.push('No se pudieron leer las nóminas cerradas.');
  }
  const totalNomina = sueldoBase + comisionesNominaCerrada + totalBonos - totalAsistencia;
  const utilidadOperativa = utilidadBruta - totalGastos - totalNomina;
  const caja = proyectarCobrosCaja(ordenesSnap.docs.map(d => ({ id: d.id, datos: d.data() })), undefined, diaCobroRD(inicio), diaCobroRD(fin));
  incidencias.push(...caja.incidencias.map(i => `${i.ordenNumero}: ${i.motivo}`));
  return { totalFacturas, ventasBrutas, ventasNetas, itbisCobrado, costoPiezas, utilidadBruta, gastos, totalGastos,
    sueldoBase, totalComisiones, comisionesNominaCerrada, totalBonos, totalAsistencia, totalNomina, utilidadOperativa,
    bonosIncompletos, nominaIncompleta, comisionesSinFecha, incidencias, nominasIncluidas,
    sueldoActualReferencia: personal.filter(p => p.activo).reduce((s, p) => s + (numero(p.sueldoBase) ? p.sueldoBase : 0), 0),
    cobrosConfirmados: caja.totalConfirmado, cobrosPendientes: caja.totalPendiente, inicio: diaCobroRD(inicio), fin: diaCobroRD(fin) };
}
