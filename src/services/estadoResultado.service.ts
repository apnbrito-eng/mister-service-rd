import { fechaFinanciera } from '../utils/fechaFinanciera';
import { collection, getDocs, query, where, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Gasto, Personal } from '../types';
import { parseFactura } from '../utils';

export interface DataMes {
  totalFacturas: number;
  ventasBrutas: number;       // suma total (con ITBIS)
  ventasNetas: number;        // subtotal (sin ITBIS)
  itbisCobrado: number;
  costoPiezas: number;
  utilidadBruta: number;      // ventasNetas - costoPiezas
  gastos: Record<string, number>; // por categoría
  totalGastos: number;
  sueldoBase: number;
  totalComisiones: number;
  totalBonos: number;
  totalAsistencia: number;
  totalNomina: number;
  utilidadOperativa: number;  // utilidadBruta - gastos - nómina
  /**
   * SPRINT-FIX-COMISIONES-SILENCIOSAS (2026-09-09) — auditoría hallazgo E-2.
   * `true` si la lectura de `liquidaciones_nomina` falló: los bonos quedaron
   * en 0, así que `totalNomina` está SUBESTIMADO y `utilidadOperativa`
   * SOBREESTIMADA. Antes esto se tragaba con `catch { /* silent *\/ }` y el
   * P&L mostraba más ganancia de la real sin ninguna señal en pantalla.
   */
  bonosIncompletos: boolean;
  comisionesSinFecha: { id: string; ordenNumero: string; tecnicoNombre: string }[];
}

export async function cargarDataMes(year: number, month: number, personal: Personal[]): Promise<DataMes> {
  const inicio = new Date(year, month - 1, 1, 0, 0, 0);
  const fin = new Date(year, month, 0, 23, 59, 59, 999);

  // Facturas del mes
  const facturasSnap = await getDocs(query(
    collection(db, 'facturas'),
    where('fechaEmision', '>=', Timestamp.fromDate(inicio)),
    where('fechaEmision', '<=', Timestamp.fromDate(fin)),
  ));

  let ventasBrutas = 0;
  let ventasNetas = 0;
  let itbisCobrado = 0;
  let costoPiezas = 0;
  let totalFacturas = 0;
  facturasSnap.docs.forEach(d => {
    const f = parseFactura(d.id, d.data() as Record<string, unknown>);
    if (f.estado === 'anulada') return;
    totalFacturas++;
    ventasBrutas += Number(f.total) || 0;
    ventasNetas += typeof d.data().subtotal === 'number' && Number.isFinite(d.data().subtotal) ? Number(d.data().subtotal) : (Number(f.total) || 0); // fallback: si no tiene desglose, usar total
    itbisCobrado += Number(f.itbisMonto) || 0;
    costoPiezas += Number(f.costoPiezas) || 0;
  });
  const utilidadBruta = ventasNetas - costoPiezas;

  // Gastos del mes
  const gastosSnap = await getDocs(query(
    collection(db, 'gastos'),
    where('fecha', '>=', Timestamp.fromDate(inicio)),
    where('fecha', '<=', Timestamp.fromDate(fin)),
  ));
  const gastosPorCategoria: Record<string, number> = {
    repuestos: 0, transporte: 0, herramientas: 0, servicios: 0, otros: 0,
  };
  let totalGastos = 0;
  gastosSnap.docs.forEach(d => {
    const g = d.data() as Gasto;
    const cat = g.categoria || 'otros';
    const monto = Number(g.monto) || 0;
    gastosPorCategoria[cat] = (gastosPorCategoria[cat] || 0) + monto;
    totalGastos += monto;
  });

  // Nómina: comisiones del mes + sueldo base (mensual, todos los con acceso)
  const comisionesSnap = await getDocs(collection(db, 'comisiones'));
  let totalComisiones = 0;
  const comisionesSinFecha: DataMes['comisionesSinFecha'] = [];
  comisionesSnap.docs.forEach(d => {
    const c = d.data();
    if (c.estaAnulada) return;
    const fecha = fechaFinanciera(c.fechaCobro);
    if (!fecha) {
      comisionesSinFecha.push({ id: d.id, ordenNumero: String(c.ordenNumero || ''), tecnicoNombre: String(c.tecnicoNombre || '') });
      return;
    }
    if (fecha >= inicio && fecha <= fin) {
      totalComisiones += (Number(c.comisionMonto) || 0) + (Number(c.descuentoPorGarantia?.monto) || 0);
    }
  });

  // Sueldo base mensual del personal activo (incluye ayudantes)
  const sueldoBase = personal
    .filter(p => p.activo)
    .reduce((s, p) => s + (Number(p.sueldoBase) || 0), 0);

  // Bonos: operarias/secretaria — simplificado: leemos de liquidaciones del mes
  let totalBonos = 0;
  let totalAsistencia = 0;
  let bonosIncompletos = false;
  try {
    const liqSnap = await getDocs(collection(db, 'liquidaciones_nomina'));
    liqSnap.docs.forEach(d => {
      const raw = d.data();
      // Tomar solo liquidaciones cuyo periodo cae en este mes
      const pFin = (raw.periodoFin as { toDate?: () => Date } | undefined)?.toDate?.();
      if (pFin && pFin >= inicio && pFin <= fin) {
        const emps = (raw.empleados as Array<{ bono?: number; totalAsistencia?: number; estadoCierre?: string }>) || [];
        emps.forEach(e => {
          if (typeof e.bono === 'number') totalBonos += e.bono;
          if ((raw.estado === 'cerrada' || e.estadoCierre === 'cerrado') && typeof e.totalAsistencia === 'number') totalAsistencia += e.totalAsistencia;
        });
      }
    });
  } catch (err) {
    // SPRINT-FIX-COMISIONES-SILENCIOSAS (2026-09-09): NO tragarse esto.
    // Sin bonos, la nómina sale corta y la utilidad operativa sale inflada.
    console.error('[estado-resultado] no se pudieron leer las liquidaciones de nómina:', err);
    bonosIncompletos = true;
  }

  const totalNomina = sueldoBase + totalComisiones + totalBonos - totalAsistencia;
  const utilidadOperativa = utilidadBruta - totalGastos - totalNomina;

  return {
    totalFacturas,
    ventasBrutas,
    ventasNetas,
    itbisCobrado,
    costoPiezas,
    utilidadBruta,
    gastos: gastosPorCategoria,
    totalGastos,
    sueldoBase,
    totalComisiones,
    totalBonos,
    totalAsistencia,
    totalNomina,
    utilidadOperativa,
    bonosIncompletos,
    comisionesSinFecha,
  };
}

