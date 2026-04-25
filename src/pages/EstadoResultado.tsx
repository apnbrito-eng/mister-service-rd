import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Gasto, ComisionRegistro, Personal } from '../types';
import { formatMoneda, parseFactura } from '../utils';
import { useApp } from '../context/AppContext';
import { puede } from '../utils/permisos';
import LoadingSpinner from '../components/LoadingSpinner';
import { TrendingUp, TrendingDown, Minus, Download } from 'lucide-react';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

interface DataMes {
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
  totalNomina: number;
  utilidadOperativa: number;  // utilidadBruta - gastos - nómina
}

async function cargarDataMes(year: number, month: number, personal: Personal[]): Promise<DataMes> {
  const inicio = new Date(year, month - 1, 1, 0, 0, 0);
  const fin = new Date(year, month, 0, 23, 59, 59);

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
    ventasNetas += Number(f.subtotal) || (Number(f.total) || 0); // fallback: si no tiene desglose, usar total
    itbisCobrado += Number(f.itbisMonto) || 0;
    costoPiezas += Number(f.costoPiezas) || 0;
  });
  const utilidadBruta = Math.max(0, ventasNetas - costoPiezas);

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
  comisionesSnap.docs.forEach(d => {
    const c = d.data() as ComisionRegistro;
    const fecha = (c.fechaCobro as unknown as { toDate?: () => Date }).toDate?.() || new Date();
    if (fecha >= inicio && fecha <= fin) {
      totalComisiones += Number(c.comisionMonto) || 0;
    }
  });

  // Sueldo base mensual del personal activo (con acceso real, excluye ayudante)
  const sueldoBase = personal
    .filter(p => p.activo && p.rol !== 'ayudante')
    .reduce((s, p) => s + (Number(p.sueldoBase) || 0), 0);

  // Bonos: operarias/secretaria — simplificado: leemos de liquidaciones del mes
  let totalBonos = 0;
  try {
    const liqSnap = await getDocs(collection(db, 'liquidaciones_nomina'));
    liqSnap.docs.forEach(d => {
      const raw = d.data();
      // Tomar solo liquidaciones cuyo periodo cae en este mes
      const pFin = (raw.periodoFin as { toDate?: () => Date } | undefined)?.toDate?.();
      if (pFin && pFin >= inicio && pFin <= fin) {
        const emps = (raw.empleados as Array<{ bono?: number }>) || [];
        emps.forEach(e => {
          if (typeof e.bono === 'number') totalBonos += e.bono;
        });
      }
    });
  } catch { /* silent */ }

  const totalNomina = sueldoBase + totalComisiones + totalBonos;
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
    totalNomina,
    utilidadOperativa,
  };
}

function Delta({ actual, previo }: { actual: number; previo: number }) {
  if (previo === 0) {
    return <span className="text-gray-400 text-[11px]">sin comparativa</span>;
  }
  const diff = actual - previo;
  const pct = (diff / previo) * 100;
  const positivo = diff >= 0;
  const Icon = diff === 0 ? Minus : (positivo ? TrendingUp : TrendingDown);
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] ${diff === 0 ? 'text-gray-500' : positivo ? 'text-green-600' : 'text-red-600'}`}>
      <Icon size={10} />
      {positivo && diff !== 0 ? '+' : ''}{pct.toFixed(1)}%
    </span>
  );
}

export default function EstadoResultado() {
  const { userProfile } = useApp();
  const puedeVer =
    puede(userProfile, 'rendimientoVer') ||
    userProfile?.rol === 'administrador' ||
    userProfile?.rol === 'coordinadora';

  const ahora = new Date();
  const [year, setYear] = useState(ahora.getFullYear());
  const [month, setMonth] = useState(ahora.getMonth() + 1);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DataMes | null>(null);
  const [dataPrevio, setDataPrevio] = useState<DataMes | null>(null);

  const years = Array.from({ length: 5 }, (_, i) => ahora.getFullYear() - 2 + i);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      setLoading(true);
      try {
        // Cargar personal
        const persSnap = await getDocs(collection(db, 'personal'));
        const personal: Personal[] = persSnap.docs.map(d => ({ id: d.id, ...d.data() } as Personal));

        // Mes actual y mes anterior
        const [actual, previo] = await Promise.all([
          cargarDataMes(year, month, personal),
          (() => {
            let pm = month - 1;
            let py = year;
            if (pm < 1) { pm = 12; py -= 1; }
            return cargarDataMes(py, pm, personal);
          })(),
        ]);
        if (cancelado) return;
        setData(actual);
        setDataPrevio(previo);
      } finally {
        if (!cancelado) setLoading(false);
      }
    })();
    return () => { cancelado = true; };
  }, [year, month]);

  const etiquetaPeriodo = useMemo(() => `${MESES[month - 1]} ${year}`, [year, month]);

  const descargarCSV = () => {
    if (!data) return;
    const filas: Array<[string, number]> = [
      ['Ventas brutas (con ITBIS)', data.ventasBrutas],
      ['Ventas netas (sin ITBIS)', data.ventasNetas],
      ['ITBIS cobrado', data.itbisCobrado],
      ['Costo de piezas', -data.costoPiezas],
      ['Utilidad bruta', data.utilidadBruta],
      ['Gastos repuestos', -data.gastos.repuestos],
      ['Gastos transporte', -data.gastos.transporte],
      ['Gastos herramientas', -data.gastos.herramientas],
      ['Gastos servicios', -data.gastos.servicios],
      ['Gastos otros', -data.gastos.otros],
      ['Total gastos', -data.totalGastos],
      ['Sueldo base', -data.sueldoBase],
      ['Comisiones', -data.totalComisiones],
      ['Bonos', -data.totalBonos],
      ['Total nómina', -data.totalNomina],
      ['UTILIDAD OPERATIVA', data.utilidadOperativa],
    ];
    const csv = [['Concepto', 'Monto RD$'], ...filas]
      .map(row => row.join(','))
      .join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `estado_resultado_${year}_${String(month).padStart(2, '0')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!puedeVer) {
    return (
      <div className="p-6">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
          <p className="text-amber-800 font-medium">No tienes permisos para ver este reporte.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
            <TrendingUp size={20} className="text-[#0f3460]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[#0f3460]">Estado de Resultado</h1>
            <p className="text-gray-500 text-sm">P&L mensual — ingresos, costos, gastos y utilidad</p>
          </div>
        </div>
        <div className="flex items-end gap-2 flex-wrap">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Año</label>
            <select value={year} onChange={e => setYear(Number(e.target.value))}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]">
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Mes</label>
            <select value={month} onChange={e => setMonth(Number(e.target.value))}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]">
              {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <button
            type="button"
            onClick={descargarCSV}
            disabled={!data}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            <Download size={14} /> CSV
          </button>
        </div>
      </div>

      {loading && <LoadingSpinner fullPage={false} text="Calculando..." />}

      {!loading && data && (
        <>
          {/* Resumen destacado */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-blue-50 rounded-2xl border border-blue-100 p-4">
              <div className="text-[11px] text-blue-700 uppercase tracking-wide">Ingresos netos</div>
              <div className="text-2xl font-bold text-blue-900 mt-1">{formatMoneda(data.ventasNetas)}</div>
              <div className="mt-1">
                {dataPrevio && <Delta actual={data.ventasNetas} previo={dataPrevio.ventasNetas} />}
              </div>
              <div className="text-[10px] text-blue-700 mt-0.5">
                {data.totalFacturas} factura(s) · ITBIS {formatMoneda(data.itbisCobrado)}
              </div>
            </div>
            <div className="bg-orange-50 rounded-2xl border border-orange-100 p-4">
              <div className="text-[11px] text-orange-700 uppercase tracking-wide">Total costos + gastos + nómina</div>
              <div className="text-2xl font-bold text-orange-900 mt-1">
                {formatMoneda(data.costoPiezas + data.totalGastos + data.totalNomina)}
              </div>
              <div className="mt-1">
                {dataPrevio && <Delta
                  actual={data.costoPiezas + data.totalGastos + data.totalNomina}
                  previo={dataPrevio.costoPiezas + dataPrevio.totalGastos + dataPrevio.totalNomina}
                />}
              </div>
            </div>
            <div className={`rounded-2xl border p-4 ${data.utilidadOperativa >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              <div className={`text-[11px] uppercase tracking-wide ${data.utilidadOperativa >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                Utilidad operativa
              </div>
              <div className={`text-2xl font-bold mt-1 ${data.utilidadOperativa >= 0 ? 'text-green-900' : 'text-red-900'}`}>
                {formatMoneda(data.utilidadOperativa)}
              </div>
              <div className="mt-1">
                {dataPrevio && <Delta actual={data.utilidadOperativa} previo={dataPrevio.utilidadOperativa} />}
              </div>
            </div>
          </div>

          {/* P&L tabla */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-[#0f3460]">Desglose · {etiquetaPeriodo}</h2>
            </div>
            <table className="w-full text-sm">
              <tbody>
                <Row label="Ventas brutas (con ITBIS)" value={data.ventasBrutas} previo={dataPrevio?.ventasBrutas} />
                <Row label="  (−) ITBIS cobrado" value={-data.itbisCobrado} previo={dataPrevio ? -dataPrevio.itbisCobrado : undefined} />
                <Row label="Ventas netas (base imponible)" value={data.ventasNetas} previo={dataPrevio?.ventasNetas} bold />
                <Row label="  (−) Costo de piezas" value={-data.costoPiezas} previo={dataPrevio ? -dataPrevio.costoPiezas : undefined} />
                <Row label="UTILIDAD BRUTA" value={data.utilidadBruta} previo={dataPrevio?.utilidadBruta} bold highlighted />

                <RowHeader label="Gastos operativos" />
                <Row label="  Repuestos" value={-data.gastos.repuestos} previo={dataPrevio ? -dataPrevio.gastos.repuestos : undefined} />
                <Row label="  Transporte" value={-data.gastos.transporte} previo={dataPrevio ? -dataPrevio.gastos.transporte : undefined} />
                <Row label="  Herramientas" value={-data.gastos.herramientas} previo={dataPrevio ? -dataPrevio.gastos.herramientas : undefined} />
                <Row label="  Servicios" value={-data.gastos.servicios} previo={dataPrevio ? -dataPrevio.gastos.servicios : undefined} />
                <Row label="  Otros" value={-data.gastos.otros} previo={dataPrevio ? -dataPrevio.gastos.otros : undefined} />
                <Row label="  Total gastos" value={-data.totalGastos} previo={dataPrevio ? -dataPrevio.totalGastos : undefined} bold />

                <RowHeader label="Nómina" />
                <Row label="  Sueldos base" value={-data.sueldoBase} previo={dataPrevio ? -dataPrevio.sueldoBase : undefined} />
                <Row label="  Comisiones" value={-data.totalComisiones} previo={dataPrevio ? -dataPrevio.totalComisiones : undefined} />
                <Row label="  Bonos" value={-data.totalBonos} previo={dataPrevio ? -dataPrevio.totalBonos : undefined} />
                <Row label="  Total nómina" value={-data.totalNomina} previo={dataPrevio ? -dataPrevio.totalNomina : undefined} bold />

                <Row label="UTILIDAD OPERATIVA" value={data.utilidadOperativa} previo={dataPrevio?.utilidadOperativa} bold highlighted />
              </tbody>
            </table>
          </div>

          {/* Nota */}
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-xs text-blue-900">
            <p className="font-semibold mb-1">Cómo se calcula:</p>
            <ul className="list-disc ml-4 space-y-0.5">
              <li><strong>Ventas netas</strong> = subtotal de las facturas del mes (sin ITBIS).</li>
              <li><strong>Costo de piezas</strong> = suma del costo de compra de los items tipo 'pieza' en cada factura.</li>
              <li><strong>Utilidad bruta</strong> = Ventas netas − Costo de piezas.</li>
              <li><strong>Gastos</strong> = colección de gastos registrados en el mes, por categoría.</li>
              <li><strong>Nómina</strong> = sueldo base mensual del personal activo + comisiones del mes + bonos de liquidaciones que cierran en este mes.</li>
              <li><strong>Utilidad operativa</strong> = Utilidad bruta − Gastos − Nómina.</li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

function RowHeader({ label }: { label: string }) {
  return (
    <tr className="bg-gray-50">
      <td colSpan={3} className="px-5 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wide">
        {label}
      </td>
    </tr>
  );
}

function Row({
  label, value, previo, bold, highlighted,
}: {
  label: string;
  value: number;
  previo?: number;
  bold?: boolean;
  highlighted?: boolean;
}) {
  const positivo = value >= 0;
  return (
    <tr className={`border-b border-gray-50 ${highlighted ? 'bg-blue-50/40' : ''}`}>
      <td className={`px-5 py-2 text-sm ${bold ? 'font-bold text-[#0f3460]' : 'text-gray-700'}`}>
        {label}
      </td>
      <td className={`px-5 py-2 text-sm text-right tabular-nums ${bold ? 'font-bold' : ''} ${positivo ? (bold ? 'text-[#0f3460]' : 'text-gray-900') : 'text-red-600'}`}>
        {positivo ? '' : '−'}{formatMoneda(Math.abs(value))}
      </td>
      <td className="px-5 py-2 text-right text-xs">
        {previo !== undefined && <Delta actual={value} previo={previo} />}
      </td>
    </tr>
  );
}
