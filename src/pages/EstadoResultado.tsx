import { cargarDataMes, cargarDataRango, periodoAnteriorEquivalente, type DataMes } from '../services/estadoResultado.service';
import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Personal } from '../types';
import { formatMoneda } from '../utils';
import { useApp } from '../context/AppContext';
import { fechaFinanciera } from '../utils/fechaFinanciera';
import { diaCobroRD } from '../utils/movimientosCobros';
import { periodoValido, rangoMesRD } from '../utils/metricasNegocio';
import LoadingSpinner from '../components/LoadingSpinner';
import { TrendingUp, TrendingDown, Minus, Download } from 'lucide-react';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function Delta({ actual, previo }: { actual: number; previo: number }) {
  if (previo === 0) {
    return <span className="text-gray-400 text-[11px]">sin comparativa</span>;
  }
  const diff = actual - previo;
  const pct = (diff / Math.abs(previo)) * 100;
  const positivo = diff >= 0;
  const Icon = diff === 0 ? Minus : (positivo ? TrendingUp : TrendingDown);
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] ${diff === 0 ? 'text-gray-500' : positivo ? 'text-green-600' : 'text-red-600'}`}>
      <Icon size={10} />
      {positivo && diff !== 0 ? '+' : ''}{pct.toFixed(1)}%
    </span>
  );
}

function coberturaCompleta(data: DataMes) {
  return !data.nominaIncompleta && !data.bonosIncompletos && !data.incidencias.length && !data.comisionesSinFecha.length;
}

export default function EstadoResultado() {
  const { userProfile } = useApp();
  const puedeVer =
    userProfile?.rol === 'administrador' ||
    userProfile?.rol === 'coordinadora';

  const ahora = new Date();
  const [year, setYear] = useState(ahora.getFullYear());
  const [month, setMonth] = useState(ahora.getMonth() + 1);
  const [modo, setModo] = useState<'mes' | 'rango'>('mes');
  const [desde, setDesde] = useState(diaCobroRD(ahora).slice(0, 7) + '-01');
  const [hasta, setHasta] = useState(diaCobroRD(ahora));
  const [error, setError] = useState('');
  const rango = useMemo(() => modo === 'mes' ? rangoMesRD(`${year}-${String(month).padStart(2, '0')}`) : { inicio: fechaFinanciera(desde) || new Date(NaN), fin: new Date((fechaFinanciera(hasta)?.getTime() ?? NaN) + 86400000 - 1) }, [modo, year, month, desde, hasta]);
  const valido = periodoValido(rango.inicio, rango.fin);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DataMes | null>(null);
  const [dataPrevio, setDataPrevio] = useState<DataMes | null>(null);

  const years = Array.from({ length: 5 }, (_, i) => ahora.getFullYear() - 2 + i);

  useEffect(() => {
    if (!puedeVer || !valido) { setLoading(false); setError(''); setData(null); setDataPrevio(null); return; }
    let cancelado = false;
    (async () => {
      setLoading(true); setError(''); setData(null); setDataPrevio(null);
      try {
        // Cargar personal
        const persSnap = await getDocs(collection(db, 'personal'));
        const personal: Personal[] = persSnap.docs.map(d => ({ id: d.id, ...d.data() } as Personal));

        // Mes actual y mes anterior
        const [actual, previo] = await Promise.all([
          modo === 'mes' ? cargarDataMes(year, month, personal) : cargarDataRango(rango.inicio, rango.fin, personal),
          (() => {
            if (modo === 'rango') { const previo = periodoAnteriorEquivalente(rango.inicio, rango.fin); return cargarDataRango(previo.inicio, previo.fin, personal); }
            let pm = month - 1;
            let py = year;
            if (pm < 1) { pm = 12; py -= 1; }
            return cargarDataMes(py, pm, personal);
          })(),
        ]);
        if (cancelado) return;
        setData(actual);
        setDataPrevio(previo);
      } catch (err) {
        if (!cancelado) setError(err instanceof Error ? err.message : 'No se pudieron cargar las fuentes del informe.');
      } finally {
        if (!cancelado) setLoading(false);
      }
    })();
    return () => { cancelado = true; };
  }, [year, month, modo, rango.inicio, rango.fin, puedeVer, valido]);

  const etiquetaPeriodo = useMemo(() => modo === 'mes' ? `${MESES[month - 1]} ${year}` : `${desde} a ${hasta}`, [year, month, modo, desde, hasta]);

  const descargarCSV = () => {
    if (!data) return;
    const filas: Array<[string, string | number]> = [
      ['Desde (RD)', data.inicio],
      ['Hasta (RD)', data.fin],
      ['Criterio', 'Conduces por emisión; gastos por fecha; cobros confirmados por pago; nóminas cerradas cuyo período termina en el rango, sin prorrateo'],
      ['Cobertura del resultado', coberturaCompleta(data) ? 'Completa según fuentes registradas' : 'Incompleta: resultado parcial'],
      ['Nómina incompleta (1 = sí)', Number(data.nominaIncompleta)],
      ['Comisiones devengadas informativas (no sumadas nuevamente)', data.totalComisiones],
      ['Cobros confirmados por fecha del pago', data.cobrosConfirmados],
      ['Incidencias pendientes', data.incidencias.length],
      ['Comisiones sin fecha: resultado incompleto si mayor a cero', data.comisionesSinFecha.length],
      ['Total documentado en conduces', data.ventasBrutas],
      ['Subtotal documentado en conduces', data.ventasNetas],
      ['Referencia ITBIS interna', data.itbisCobrado],
      ['Costo de piezas', -data.costoPiezas],
      ['Utilidad bruta', data.utilidadBruta],
      ['Gastos repuestos', -data.gastos.repuestos],
      ['Gastos transporte', -data.gastos.transporte],
      ['Gastos herramientas', -data.gastos.herramientas],
      ['Gastos servicios', -data.gastos.servicios],
      ['Gastos otros', -data.gastos.otros],
      ['Total gastos', -data.totalGastos],
      ['Sueldos de nóminas cerradas', -data.sueldoBase],
      ['Comisiones incluidas en nóminas cerradas', -data.comisionesNominaCerrada],
      ['Bonos', -data.totalBonos],
      ['Asistencia aprobada en nóminas cerradas', data.totalAsistencia],
      ['Total nómina', -data.totalNomina],
      ['RESULTADO PARCIAL SEGUN FUENTES REGISTRADAS', data.utilidadOperativa],
    ];
    const csv = [['Concepto', 'Monto RD$'], ...filas]
      .map(row => row.map(celda => `"${String(celda).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `estado_resultado_${data.inicio}_${data.fin}.csv`;
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
            <TrendingUp size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-primary">Estado de Resultado</h1>
            <p className="text-gray-500 text-sm">Informe operativo — conduces, costos, gastos y nóminas cerradas</p>
          </div>
        </div>
        <div className="flex items-end gap-2 flex-wrap">
          <label>Período <select aria-label="Tipo de período" value={modo} onChange={e => setModo(e.target.value as 'mes' | 'rango')}><option value="mes">Mes</option><option value="rango">Desde / hasta</option></select></label>
          {modo === 'rango' && <><label>Desde <input aria-label="Desde" type="date" value={desde} onChange={e => setDesde(e.target.value)} /></label><label>Hasta <input aria-label="Hasta" type="date" value={hasta} onChange={e => setHasta(e.target.value)} /></label></>}

          {modo === 'mes' && <><div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Año</label>
            <select aria-label="Año" value={year} onChange={e => setYear(Number(e.target.value))}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-medium">
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Mes</label>
            <select aria-label="Mes" value={month} onChange={e => setMonth(Number(e.target.value))}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-medium">
              {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
          </div></>}
          <button
            type="button"
            onClick={descargarCSV}
            disabled={!data || loading || !valido}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            <Download size={14} /> CSV
          </button>
        </div>
      </div>

      {!valido && <p role="alert">Selecciona un rango de fechas válido.</p>}
      {error && <p role="alert" className="p-4 bg-red-50 text-red-800">No se pudo calcular el informe: {error}</p>}
      {loading && <LoadingSpinner fullPage={false} text="Calculando..." />}

      {!loading && !error && valido && data && (
        <>
          {/*
            SPRINT-FIX-COMISIONES-SILENCIOSAS (2026-09-09) — auditoría hallazgo E-2.
            Si no se pudieron leer las liquidaciones de nómina, los bonos quedan
            en 0: la nómina sale corta y la utilidad operativa sale inflada. El
            número se sigue mostrando, pero marcado como incompleto — antes el
            error se tragaba en silencio y el P&L parecía correcto.
          */}
          {data.comisionesSinFecha.length > 0 && (
            <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">
              <p>Resultado incompleto: {data.comisionesSinFecha.length} comisiones sin fecha de devengo válida requieren conciliación. No se asignaron a ningún mes.</p>
              <a className="underline" href="/admin/comisiones">Revisar comisiones</a>
              <ul>{data.comisionesSinFecha.map(c => <li key={c.id}>{c.ordenNumero || c.id} · {c.tecnicoNombre || 'Sin técnico'}</li>)}</ul>
            </div>
          )}
          {data.bonosIncompletos && (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
              <div className="text-sm font-semibold text-amber-900">
                Cifras incompletas — no se pudieron leer las liquidaciones de nómina
              </div>
              <div className="text-xs text-amber-800 mt-1">
                No se pudieron incluir bonos ni descuentos de asistencia; revisa las cifras antes de usar este resultado
                y el resultado permanece incompleto. Recarga la página;
                si sigue igual, avisá antes de usar estos números.
              </div>
            </div>
          )}

          <section className="rounded-xl border p-4 space-y-2">
            <h2 className="font-semibold">Criterio del informe · {etiquetaPeriodo}</h2>
            <p className="text-sm">Documentos por fecha de emisión; cobros por fecha del pago. Nómina: empleados cerrados cuyo período termina en el rango. No se prorratean quincenas cortadas por los límites ni se reconstruye devengo contable exacto. Las comisiones atrasadas están incluidas una sola vez en su nómina cerrada.</p>
            <p className="text-sm">Salarios mensuales actuales de referencia: {formatMoneda(data.sueldoActualReferencia)}. Esta estimación no se suma al resultado.</p>
            <p>Cobros confirmados: <strong>{formatMoneda(data.cobrosConfirmados)}</strong> · Pendientes de confirmación: {formatMoneda(data.cobrosPendientes)}</p>
            <p>Comisiones devengadas del período: {formatMoneda(data.totalComisiones)} (informativo; no se suma nuevamente).</p>
            <a href="/admin/gastos" className="underline">Ver cobros y gastos</a>
            {data.nominaIncompleta && <p role="alert" className="text-amber-900">Resultado incompleto: faltan nóminas cerradas o hay empleados pendientes/inconsistentes. No interpretes el costo registrado como costo total.</p>}
            <details><summary>Fuentes de nómina incluidas ({data.nominasIncluidas.length})</summary>{data.nominasIncluidas.map(n => <p key={n.id}><a href="/admin/nomina" className="underline">{n.quincena}</a> · fin {n.periodoFin} · {n.empleados} empleados · {n.id}</p>)}</details>
            {data.incidencias.length > 0 && <details open><summary>Incidencias ({data.incidencias.length})</summary><ul>{data.incidencias.map((i, index) => <li key={index}>{i}</li>)}</ul></details>}
          </section>
          {dataPrevio && <GraficoComparativo actual={data} previo={dataPrevio} />}
          {/* Resumen destacado */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-blue-50 rounded-2xl border border-blue-100 p-4">
              <div className="text-[11px] text-blue-700 uppercase tracking-wide">Importe neto documentado</div>
              <div className="text-2xl font-bold text-blue-900 mt-1">{formatMoneda(data.ventasNetas)}</div>
              <div className="mt-1">
                {dataPrevio && <Delta actual={data.ventasNetas} previo={dataPrevio.ventasNetas} />}
              </div>
              <div className="text-[10px] text-blue-700 mt-0.5">
                {data.totalFacturas} conduce(s) · referencia interna {formatMoneda(data.itbisCobrado)}
              </div>
            </div>
            <div className="bg-orange-50 rounded-2xl border border-orange-100 p-4">
              <div className="text-[11px] text-orange-700 uppercase tracking-wide">Costos registrados (ver cobertura)</div>
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
                Resultado operativo registrado
              </div>
              <div className={`text-2xl font-bold mt-1 ${data.utilidadOperativa >= 0 ? 'text-green-900' : 'text-red-900'}`}>
                {!coberturaCompleta(data) ? 'Incompleto — ver desglose' : formatMoneda(data.utilidadOperativa)}
              </div>
              <div className="mt-1">
                {coberturaCompleta(data) && dataPrevio && coberturaCompleta(dataPrevio) && <Delta actual={data.utilidadOperativa} previo={dataPrevio.utilidadOperativa} />}
              </div>
            </div>
          </div>

          {/* P&L tabla */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-primary">Desglose · {etiquetaPeriodo}</h2>
            </div>
            <table className="w-full text-sm">
              <tbody>
                <Row label="Total documentado en conduces" value={data.ventasBrutas} previo={dataPrevio?.ventasBrutas} />
                <Row label="  (−) Referencia ITBIS interna" value={-data.itbisCobrado} previo={dataPrevio ? -dataPrevio.itbisCobrado : undefined} />
                <Row label="Subtotal documentado" value={data.ventasNetas} previo={dataPrevio?.ventasNetas} bold />
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
                <Row label="  Comisiones" value={-data.comisionesNominaCerrada} previo={dataPrevio ? -dataPrevio.comisionesNominaCerrada : undefined} />
                <Row label="  Bonos" value={-data.totalBonos} previo={dataPrevio ? -dataPrevio.totalBonos : undefined} />
                <Row label="  Descuentos de asistencia (nóminas cerradas)" value={data.totalAsistencia} previo={dataPrevio?.totalAsistencia} />
                <Row label="  Total nómina" value={-data.totalNomina} previo={dataPrevio ? -dataPrevio.totalNomina : undefined} bold />

                <Row label="RESULTADO PARCIAL SEGÚN FUENTES REGISTRADAS" value={data.utilidadOperativa} previo={coberturaCompleta(data) && dataPrevio && coberturaCompleta(dataPrevio) ? dataPrevio.utilidadOperativa : undefined} bold highlighted />
              </tbody>
            </table>
          </div>

          {/* Nota */}
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-xs text-blue-900">
            <p className="font-semibold mb-1">Cómo se calcula:</p>
            <ul className="list-disc ml-4 space-y-0.5">
              <li><strong>Ventas netas</strong> = subtotal de conduces emitidos en el rango.</li>
              <li><strong>Costo de piezas</strong> = suma del costo de compra de los items tipo 'pieza' en cada conduce.</li>
              <li><strong>Utilidad bruta</strong> = Ventas netas − Costo de piezas.</li>
              <li><strong>Gastos</strong> = colección de gastos registrados en el rango, por categoría.</li>
              <li><strong>Nómina registrada</strong> = sueldo + comisión + bono − asistencia de snapshots cerrados por fin de período. Avances y préstamos son recuperaciones, no reducen aquí el costo salarial. Consulta la cobertura indicada arriba.</li>
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
      <td className={`px-5 py-2 text-sm ${bold ? 'font-bold text-primary' : 'text-gray-700'}`}>
        {label}
      </td>
      <td className={`px-5 py-2 text-sm text-right tabular-nums ${bold ? 'font-bold' : ''} ${positivo ? (bold ? 'text-primary' : 'text-gray-900') : 'text-red-600'}`}>
        {positivo ? '' : '−'}{formatMoneda(Math.abs(value))}
      </td>
      <td className="px-5 py-2 text-right text-xs">
        {previo !== undefined && <Delta actual={value} previo={previo} />}
      </td>
    </tr>
  );
}

function GraficoComparativo({ actual, previo }: { actual: DataMes; previo: DataMes }) {
  const completo = coberturaCompleta(actual) && coberturaCompleta(previo);
  const filas = [
    { nombre: 'Importe neto documentado', actual: actual.ventasNetas, previo: previo.ventasNetas },
    { nombre: 'Costo de piezas', actual: actual.costoPiezas, previo: previo.costoPiezas },
    { nombre: 'Gastos registrados', actual: actual.totalGastos, previo: previo.totalGastos },
    { nombre: 'Cobros confirmados (caja)', actual: actual.cobrosConfirmados, previo: previo.cobrosConfirmados },
    ...(completo ? [{ nombre: 'Resultado operativo registrado', actual: actual.utilidadOperativa, previo: previo.utilidadOperativa }] : []),
  ];
  const maximo = Math.max(1, ...filas.flatMap(f => [Math.abs(f.actual), Math.abs(f.previo)]));
  return <section className="bg-white border rounded-xl p-4 space-y-4" aria-label="Comparativa de períodos">
    <h2 className="font-semibold">Comparativa de períodos</h2><p className="text-sm">Actual: {actual.inicio} a {actual.fin}. Anterior: {previo.inicio} a {previo.fin}. Las barras representan magnitud; el importe conserva el signo.</p>
    {!completo && <p className="text-amber-900">Comparativa parcial: resultado operativo omitido por cobertura incompleta.</p>}
    {filas.map(f => <div key={f.nombre}><h3 className="text-sm font-medium">{f.nombre}</h3>{([{ nombre: 'Actual', valor: f.actual, color: 'bg-blue-600' }, { nombre: 'Anterior', valor: f.previo, color: 'bg-gray-500' }]).map(v => <div key={v.nombre} className="my-1"><p className="text-xs">{v.nombre}: {formatMoneda(v.valor)}</p><div aria-hidden="true" className={`h-3 rounded ${v.color}`} style={{ width: `${Math.abs(v.valor) / maximo * 100}%` }} /></div>)}</div>)}
  </section>;
}
