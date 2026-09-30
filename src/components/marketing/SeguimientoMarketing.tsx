import { useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { formatMoneda } from '../../utils';
import { useApp } from '../../context/AppContext';
import { cargarDatosSeguimiento } from '../../services/seguimientoMarketing.service';
import { rangoDiasRD, resumirPorOrigen, resumirAnuncios, resumirCampanas } from '../../utils/seguimientoMarketing';

const diaRD = (d: Date) => new Date(d.getTime() - 4 * 3600000).toISOString().slice(0, 10);

interface Resultado {
  origen: ReturnType<typeof resumirPorOrigen> | null;
  anuncios: ReturnType<typeof resumirAnuncios> | null;
  campanas: ReturnType<typeof resumirCampanas> | null;
  errores: string[];
}

const Vacio = ({ texto }: { texto: string }) => <p className="py-4 text-sm text-gray-500">{texto}</p>;
const SinDatos = () => <p className="py-4 text-sm text-amber-800">Sin datos: no se pudo leer esta fuente.</p>;

/**
 * Seguimiento con evidencia registrada. Lectura puntual al pulsar "Calcular";
 * no abre listeners ni modifica nada.
 */
export default function SeguimientoMarketing() {
  const { userProfile } = useApp();
  const hoy = diaRD(new Date());
  const [desde, setDesde] = useState(diaRD(new Date(Date.now() - 29 * 86400000)));
  const [hasta, setHasta] = useState(hoy);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [res, setRes] = useState<Resultado | null>(null);

  async function calcular() {
    if (!['administrador', 'coordinadora'].includes(userProfile?.rol || '')) return;
    const rango = rangoDiasRD(desde, hasta);
    if (!rango) { setError('Revisa las fechas: "Desde" no puede ser posterior a "Hasta".'); return; }
    setCargando(true); setError(''); setRes(null);
    try {
      const d = await cargarDatosSeguimiento(rango);
      setRes({
        origen: d.ordenes ? resumirPorOrigen(d.ordenes, rango) : null,
        anuncios: d.conversaciones && d.ordenes ? resumirAnuncios(d.conversaciones, d.ordenes, rango) : null,
        campanas: d.campanas ? resumirCampanas(d.campanas, rango) : null,
        errores: d.errores,
      });
    } catch {
      setError('No se pudo calcular el seguimiento. Inténtalo de nuevo.');
    } finally {
      setCargando(false);
    }
  }

  if (!['administrador', 'coordinadora'].includes(userProfile?.rol || '')) return null;
  const th = 'p-3 font-medium';
  return (
    <section className="bg-white border rounded-2xl p-5 space-y-5" aria-labelledby="seguimiento-titulo">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="seguimiento-titulo" className="text-lg font-semibold">Seguimiento con evidencia</h2>
          <p className="text-sm text-gray-500">De la consulta a la orden y al cobro verificado. Solo cuenta vínculos registrados por ID; una consulta o un clic no es una venta.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm">Desde<input type="date" value={desde} max={hasta} disabled={cargando} onChange={e => { setDesde(e.target.value); setRes(null); setError(''); }} className="block border rounded-xl px-3 py-2 min-h-[44px]" /></label>
          <label className="text-sm">Hasta<input type="date" value={hasta} max={hoy} disabled={cargando} onChange={e => { setHasta(e.target.value); setRes(null); setError(''); }} className="block border rounded-xl px-3 py-2 min-h-[44px]" /></label>
          <button type="button" disabled={cargando} onClick={calcular} className="bg-primary text-white rounded-xl px-4 min-h-[44px] inline-flex gap-2 items-center disabled:opacity-50">
            <RefreshCw size={16} className={cargando ? 'animate-spin' : ''} aria-hidden="true" />{cargando ? 'Calculando…' : 'Calcular'}
          </button>
        </div>
      </div>
      {error && <p role="alert" className="bg-amber-50 text-amber-900 p-3 rounded-xl text-sm">{error}</p>}
      {!res && !error && <Vacio texto="Elige un período y pulsa Calcular. Se leen las fuentes completas para detectar fechas ausentes y se filtran localmente. El cálculo puede tardar con historiales grandes." />}
      {res && (
        <>
          {res.errores.map(e => <p key={e} role="status" className="bg-amber-50 text-amber-900 p-3 rounded-xl text-sm">{e}</p>)}

          <div>
            <h3 className="font-semibold">Órdenes por origen</h3>
            <p className="text-xs text-gray-500">Origen guardado en la orden al crearla (formulario, calendario, oficina…). Las órdenes antiguas no lo tienen y aparecen como "Sin origen registrado". Cohorte: órdenes creadas en el rango; cobros: pagos confirmados de esas órdenes con fecha de pago dentro del mismo rango, según Caja. No representa todos los cobros del negocio.</p>
            {!res.origen ? <SinDatos /> : res.origen.filas.length === 0 ? <Vacio texto="No hay órdenes creadas en este período." /> : (
              <div className="overflow-x-auto"><table className="w-full text-sm text-left mt-2">
                <thead><tr className="border-b text-gray-500"><th className={th}>Origen</th><th className={th}>Órdenes</th><th className={th}>Cerradas</th><th className={th}>Canceladas</th><th className={th}>Con cobro verificado</th><th className={th}>Cobros verificados</th></tr></thead>
                <tbody>{res.origen.filas.map(f => <tr key={f.origen} className="border-b"><td className="p-3 font-medium">{f.etiqueta}</td><td className="p-3">{f.ordenes}</td><td className="p-3">{f.cerradas}</td><td className="p-3">{f.canceladas}</td><td className="p-3">{f.conCobroVerificado}</td><td className="p-3">{formatMoneda(f.cobrosVerificados)}</td></tr>)}</tbody>
              </table></div>
            )}
            {res.origen && res.origen.sinFecha > 0 && <p className="text-xs text-amber-800">{res.origen.sinFecha} orden(es) sin fecha de creación válida no se incluyen.</p>}
          </div>

          {res.origen && res.origen.incidenciasCobros > 0 && <p role="status" className="text-amber-800">Cobros parciales: {res.origen.incidenciasCobros} pago(s) con incidencias excluidos según Caja.</p>}
          <div>
            <h3 className="font-semibold">Consultas desde anuncios de Meta</h3>
            <p className="text-xs text-gray-500">Conversaciones de WhatsApp que llegaron desde un anuncio. "Órdenes posteriores" son órdenes del mismo cliente (por ID) creadas después de esa consulta: es seguimiento, no prueba que el anuncio causó la orden. Si una orden coincide con varios anuncios, se excluye de todos para no duplicar importes. Los cobros de la cohorte también se filtran por fecha de pago en el rango; estas tablas no se suman entre sí.</p>
            {!res.anuncios ? <SinDatos /> : res.anuncios.filas.length === 0 ? <Vacio texto="No hay consultas desde anuncios registradas en este período." /> : (
              <div className="overflow-x-auto"><table className="w-full text-sm text-left mt-2">
                <thead><tr className="border-b text-gray-500"><th className={th}>Anuncio</th><th className={th}>Consultas</th><th className={th}>Con cliente vinculado</th><th className={th}>Órdenes posteriores</th><th className={th}>Cerradas</th><th className={th}>Cobros verificados</th></tr></thead>
                <tbody>{res.anuncios.filas.map(f => <tr key={f.anuncioId} className="border-b"><td className="p-3 font-mono text-xs">{f.anuncioId}</td><td className="p-3">{f.consultas}</td><td className="p-3">{f.conCliente}</td><td className="p-3">{f.ordenes}</td><td className="p-3">{f.cerradas}</td><td className="p-3">{formatMoneda(f.cobrosVerificados)}</td></tr>)}</tbody>
              </table></div>
            )}
            {res.anuncios && res.anuncios.sinFecha > 0 && <p className="text-xs text-amber-800">{res.anuncios.sinFecha} consulta(s) de anuncio sin fecha válida no se incluyen.</p>}
          </div>

          {res.anuncios && (res.anuncios.ordenesSinFecha + res.anuncios.ordenesAmbiguas + res.anuncios.incidenciasCobros > 0) && <p role="status" className="text-amber-800">Seguimiento parcial: {res.anuncios.ordenesSinFecha} órdenes sin fecha, {res.anuncios.ordenesAmbiguas} órdenes vinculadas a varios anuncios y {res.anuncios.incidenciasCobros} incidencias de cobro excluidas.</p>}
          <div>
            <h3 className="font-semibold">Campañas de reactivación</h3>
            <p className="text-xs text-gray-500">Medición que ya guarda cada campaña: contactos preparados, marcados como enviados y órdenes reactivadas detectadas (ventana de 60 días). Se preparan y envían a mano.</p>
            {!res.campanas ? <SinDatos /> : res.campanas.filas.length === 0 ? <Vacio texto="No hay campañas creadas en este período." /> : (
              <div className="overflow-x-auto"><table className="w-full text-sm text-left mt-2">
                <thead><tr className="border-b text-gray-500"><th className={th}>Fecha</th><th className={th}>Plantilla</th><th className={th}>Contactos</th><th className={th}>Enviados</th><th className={th}>Reactivados</th></tr></thead>
                <tbody>{res.campanas.filas.map(f => <tr key={f.id} className="border-b"><td className="p-3">{f.fecha.toLocaleDateString('es-DO')}</td><td className="p-3 font-medium">{f.nombre}</td><td className="p-3">{f.contactados}</td><td className="p-3">{f.enviados}</td><td className="p-3">{f.reactivados ?? 'Sin medición'}</td></tr>)}</tbody>
              </table></div>
            )}
            {res.campanas && res.campanas.sinFecha > 0 && <p className="text-amber-800">{res.campanas.sinFecha} campañas sin fecha válida excluidas.</p>}
            {res.campanas && res.campanas.clientesRepetidos > 0 && (
              <p className="text-sm text-amber-900 bg-amber-50 rounded-xl p-3 mt-2">{res.campanas.clientesRepetidos} cliente(s) recibieron más de una campaña en este período. Revisa los días de descanso entre contactos{userProfile?.rol === 'administrador' ? <> en <Link to="/admin/configuracion-marketing" className="underline">Plantillas de campaña</Link></> : ' con administración'}.</p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
