import { useState } from 'react';
import { FileText, Download, AlertTriangle, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { useApp } from '../context/AppContext';
import { puede } from '../utils/permisos';
import { formatMoneda } from '../utils';
import {
  generarFormato607,
  lineas607ATexto,
  descargarFormato607,
} from '../services/reportesDGII.service';

const MESES = [
  { v: 1, l: 'Enero' }, { v: 2, l: 'Febrero' }, { v: 3, l: 'Marzo' },
  { v: 4, l: 'Abril' }, { v: 5, l: 'Mayo' }, { v: 6, l: 'Junio' },
  { v: 7, l: 'Julio' }, { v: 8, l: 'Agosto' }, { v: 9, l: 'Septiembre' },
  { v: 10, l: 'Octubre' }, { v: 11, l: 'Noviembre' }, { v: 12, l: 'Diciembre' },
];

export default function ReportesDGII() {
  const { userProfile } = useApp();
  const puedeVer =
    puede(userProfile, 'facturasVer') ||
    userProfile?.rol === 'administrador' ||
    userProfile?.rol === 'coordinadora';

  const ahora = new Date();
  const [year, setYear] = useState(ahora.getFullYear());
  const [month, setMonth] = useState(ahora.getMonth() + 1);
  const [generando, setGenerando] = useState(false);
  const [resultado, setResultado] = useState<Awaited<ReturnType<typeof generarFormato607>> | null>(null);

  const years = Array.from({ length: 5 }, (_, i) => ahora.getFullYear() - 2 + i);

  if (!puedeVer) {
    return (
      <div className="p-6">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
          <p className="text-amber-800 font-medium">No tienes permisos para ver reportes fiscales.</p>
        </div>
      </div>
    );
  }

  const handleGenerar = async () => {
    setGenerando(true);
    setResultado(null);
    try {
      const res = await generarFormato607(year, month);
      setResultado(res);
      if (res.totalFacturas === 0) {
        toast('No hay facturas emitidas en ese período', { icon: 'ℹ️' });
      } else {
        toast.success(`${res.totalFacturas} facturas encontradas`);
      }
    } catch (err) {
      console.error(err);
      toast.error('Error al generar reporte');
    } finally {
      setGenerando(false);
    }
  };

  const handleDescargar = () => {
    if (!resultado) return;
    const texto = lineas607ATexto(resultado.lineas);
    descargarFormato607(year, month, texto);
    toast.success('Archivo 607 descargado');
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
          <FileText size={20} className="text-[#0f3460]" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[#0f3460]">Reportes Fiscales DGII</h1>
          <p className="text-gray-500 text-sm">
            Genera los archivos 607 (ventas) y 606 (compras) para declarar impuestos.
          </p>
        </div>
      </div>

      {/* Formato 607 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 bg-blue-50/50 border-b border-blue-100">
          <h2 className="text-lg font-semibold text-[#0f3460]">Formato 607 · Ventas del mes</h2>
          <p className="text-xs text-gray-600 mt-0.5">
            Todas las facturas emitidas en el mes seleccionado, formato oficial DGII (TXT separado por pipe).
            Se presenta a más tardar el día 15 del mes siguiente.
          </p>
        </div>

        <div className="p-5 space-y-4">
          {/* Selector de periodo */}
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Año</label>
              <select
                value={year}
                onChange={e => { setYear(Number(e.target.value)); setResultado(null); }}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
              >
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Mes</label>
              <select
                value={month}
                onChange={e => { setMonth(Number(e.target.value)); setResultado(null); }}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
              >
                {MESES.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
              </select>
            </div>
            <button
              type="button"
              onClick={handleGenerar}
              disabled={generando}
              className="px-5 py-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-lg text-sm font-medium disabled:opacity-60"
            >
              {generando ? 'Generando...' : 'Generar reporte'}
            </button>
          </div>

          {/* Resultado */}
          {resultado && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-gray-50 rounded-xl p-3">
                  <div className="text-[10px] text-gray-500 uppercase">Facturas</div>
                  <div className="text-lg font-bold text-[#0f3460]">{resultado.totalFacturas}</div>
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <div className="text-[10px] text-gray-500 uppercase">Total ventas</div>
                  <div className="text-lg font-bold text-[#0f3460]">{formatMoneda(resultado.totalMonto)}</div>
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <div className="text-[10px] text-gray-500 uppercase">ITBIS</div>
                  <div className="text-lg font-bold text-orange-600">{formatMoneda(resultado.totalITBIS)}</div>
                </div>
                <div className={`rounded-xl p-3 ${resultado.sinIdentificacion > 0 ? 'bg-amber-50 border border-amber-200' : 'bg-green-50 border border-green-200'}`}>
                  <div className={`text-[10px] uppercase ${resultado.sinIdentificacion > 0 ? 'text-amber-700' : 'text-green-700'}`}>
                    Sin identificación
                  </div>
                  <div className={`text-lg font-bold ${resultado.sinIdentificacion > 0 ? 'text-amber-800' : 'text-green-800'}`}>
                    {resultado.sinIdentificacion}
                  </div>
                </div>
              </div>

              {resultado.sinIdentificacion > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2 text-xs text-amber-900">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">{resultado.sinIdentificacion} factura(s) sin RNC ni cédula del cliente.</p>
                    <p className="mt-0.5">
                      La DGII permite reportarlas, pero es mejor prácticamente completar el RNC o cédula en cada ficha de cliente. Ve a Clientes y edita los que falten.
                    </p>
                  </div>
                </div>
              )}

              {resultado.totalFacturas > 0 && (
                <button
                  type="button"
                  onClick={handleDescargar}
                  className="inline-flex items-center gap-2 px-5 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold"
                >
                  <Download size={14} /> Descargar archivo 607 (TXT)
                </button>
              )}

              {/* Preview de primeras líneas */}
              {resultado.lineas.length > 0 && (
                <div className="bg-gray-900 text-gray-100 rounded-xl p-3 text-[11px] font-mono overflow-x-auto">
                  <div className="text-gray-400 mb-2">Vista previa (primeras 5 líneas):</div>
                  {resultado.lineas.slice(0, 5).map((l, i) => (
                    <div key={i} className="whitespace-nowrap">
                      {[
                        l.rncCedula || '—',
                        l.tipoId || '—',
                        l.ncf,
                        l.tipoIngreso,
                        l.fechaComprobante,
                        l.montoFacturado,
                        l.itbisFacturado,
                        l.formaPago,
                      ].join(' | ')}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Formato 606 - coming soon */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 bg-gray-50/50 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-700">Formato 606 · Compras del mes</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Requiere registro previo de Facturas de Gastos con RNC del suplidor. (Próximamente)
          </p>
        </div>
        <div className="p-5 text-sm text-gray-500">
          Por implementar en una próxima iteración. Por ahora registra tus facturas de compras manualmente en DGII.
        </div>
      </div>

      {/* Guía rápida */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-xs text-blue-900 space-y-2">
        <div className="flex items-start gap-2">
          <Check size={14} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Cómo presentar el 607:</p>
            <ol className="list-decimal ml-4 mt-1 space-y-0.5">
              <li>Genera el archivo del mes que vas a declarar.</li>
              <li>Entra a la Oficina Virtual de DGII: <a href="https://www.dgii.gov.do" target="_blank" rel="noopener noreferrer" className="underline">dgii.gov.do</a>.</li>
              <li>En "Envío de Archivos" sube el TXT descargado.</li>
              <li>Presenta a más tardar el día 15 del mes siguiente al declarado.</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
