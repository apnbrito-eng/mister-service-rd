import { useEffect, useRef, useState } from 'react';
import { equipoApi } from '../../services/equipoApi';
import type { ConfigBotServicio, TarifaBotServicio } from '../../../api/_lib/politicaBotServicio';
interface Periodo { periodo: string; comprometido: number; limite: number }
interface RuntimeVisible { repartoHabilitado?: boolean; version: number; habilitado: boolean; phoneNumberId: string; permitirHorarioLaboral: boolean; equipos: { id: string; operariaUid: string; secretariaUid: string }[] }
interface Respuesta { servidorPreparado?: boolean; runtime?: RuntimeVisible; presupuestoReal?: { dia: Periodo; mes: Periodo }; config: ConfigBotServicio; envioDisponible: boolean; presupuesto: { dia: Periodo; mes: Periodo }; personas: { uid: string; nombre: string; rol: string }[] }
const ruta = '/api/whatsapp/bot-config';
const campo = 'w-full min-h-[44px] rounded-lg border border-gray-300 px-3 py-2 bg-white text-gray-900';
const boton = 'min-h-[44px] rounded-lg border border-gray-300 px-4 py-2 disabled:opacity-50';
const dinero = (micro: number) => (micro / 1_000_000).toLocaleString('es-DO', { style: 'currency', currency: 'USD', maximumFractionDigits: 6 });
const razones: Record<string, string> = { baja: 'Pausar: el cliente pidió la baja.', humano: 'Entregar a una secretaria: el cliente pidió una persona.', datos_completos: 'Entregar a una secretaria: los datos están completos.', ventana_cerrada: 'Pausar: la ventana de respuesta está cerrada.', horario: 'Atención humana: estamos en horario laboral.', sin_tarifa: 'Pausar: falta configurar una tarifa para el ensayo.', recopilar: 'Continuar recopilando los datos que faltan, solo en simulación.' };
export default function BotServicioConfiguracion() {
  const [datos, setDatos] = useState<Respuesta | null>(null), [config, setConfig] = useState<ConfigBotServicio | null>(null);
  const [error, setError] = useState(''), [aviso, setAviso] = useState(''), [ocupado, setOcupado] = useState(false);
  const [motivo, setMotivo] = useState(''), [periodo, setPeriodo] = useState<'dia' | 'mes'>('dia'), [importe, setImporte] = useState('');
  const [confirmarActivacion, setConfirmarActivacion] = useState(false);
  const [destinoPresupuesto, setDestinoPresupuesto] = useState<'simulacion' | 'produccion'>('simulacion');
  const [mensualPermanente, setMensualPermanente] = useState(true);
  const ejecutando = useRef(false);
  const [equipo, setEquipo] = useState(''), [servicio, setServicio] = useState(''), [falla, setFalla] = useState('');
  const [foto, setFoto] = useState(false), [ubicacion, setUbicacion] = useState(false), [humano, setHumano] = useState(false), [baja, setBaja] = useState(false), [ventana, setVentana] = useState(true);
  const [resultado, setResultado] = useState('');
  const solicitud = useRef({ contenido: '', id: '' });
  const vivo = useRef(true);
  useEffect(() => {
    vivo.current = true;
    void equipoApi<Respuesta>(ruta).then(r => { if (vivo.current) { setDatos(r); setConfig(r.config); } }).catch(e => { if (vivo.current) setError(e instanceof Error ? e.message : 'No se pudo cargar.'); });
    return () => { vivo.current = false; };
  }, []);
  async function ejecutar(body: Record<string, unknown>, recargar = true) {
    if (ejecutando.current) return;
    ejecutando.current = true;
    setOcupado(true); setError(''); setAviso('');
    try {
      const contenido = JSON.stringify(body);
      if (solicitud.current.contenido !== contenido) solicitud.current = { contenido, id: crypto.randomUUID() };
      const r = await equipoApi<{ resultado?: { motivo: string } }>(ruta, { ...body, requestId: solicitud.current.id });
      if (!vivo.current) return;
      if (r.resultado) setResultado(razones[r.resultado.motivo] || 'Revisa el resultado con administración.');
      if (recargar) {
        const actual = await equipoApi<Respuesta>(ruta);
        if (vivo.current) { setDatos(actual); setConfig(actual.config); setAviso('Cambio guardado. Consulta el estado del servicio.'); setMotivo(''); }
      }
    } catch (e) { if (vivo.current) setError(e instanceof Error ? e.message : 'No se pudo completar.'); }
    finally { ejecutando.current = false; if (vivo.current) setOcupado(false); }
  }
  function cambiarMiembro(indice: number, clave: 'operariaUid' | 'secretariaUid', uid: string) {
    if (!config) return;
    const equipos = [0, 1].map(i => config.equipos[i] ?? { id: `equipo-${i + 1}`, operariaUid: '', secretariaUid: '' });
    equipos[indice] = { ...equipos[indice], [clave]: uid }; setConfig({ ...config, equipos });
  }
  function cambiarTarifa(clave: keyof TarifaBotServicio, valor: string) {
    if (!config) return;
    const tarifa = config.tarifa ?? { modelo: '', version: '', entradaMicroUsdPorMillon: 0, salidaMicroUsdPorMillon: 0, maxTokensEntrada: 0, maxTokensSalida: 0 };
    setConfig({ ...config, tarifa: { ...tarifa, [clave]: clave === 'modelo' || clave === 'version' ? valor : Number(valor) } });
  }
  const presupuestoVisible = destinoPresupuesto === 'produccion' ? datos?.presupuestoReal : datos?.presupuesto;
  return <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-6 space-y-4" aria-labelledby="bot-servicio-titulo">
    <h2 id="bot-servicio-titulo" className="text-lg font-semibold">Asistente de servicio · WhatsApp</h2>
    <p className="text-sm font-medium">Configuración del servicio y ensayo de atención.</p>
    {datos?.runtime && <p role="status" className="text-sm font-medium">Servicio real: {datos.runtime.habilitado ? datos.servidorPreparado ? 'atención automática habilitada' : 'preparado; el servidor mantiene los envíos deshabilitados' : 'desactivado'}.</p>}
    <p className="text-sm text-gray-600">Recopila datos para entregar la conversación a una secretaria. No confirma citas ni precios.</p>
    {error && <p role="alert" className="text-red-700 break-words">{error}</p>}{aviso && <p role="status">{aviso}</p>}
    {!datos || !config ? <p>{error ? 'Recarga esta página para volver a intentarlo.' : 'Cargando configuración…'}</p> : <>
      {datos.presupuestoReal && <label className="block text-sm">Presupuesto a consultar<select className={campo} value={destinoPresupuesto} onChange={e => setDestinoPresupuesto(e.target.value as 'simulacion' | 'produccion')}><option value="simulacion">Ensayo, sin gasto real</option><option value="produccion">Servicio real, preparación desactivada</option></select></label>}
      <div className="grid gap-3 sm:grid-cols-2">
        {(['dia', 'mes'] as const).map(tipo => <div key={tipo} className="border rounded-lg p-3 min-w-0">
          <h3 className="font-medium">{tipo === 'dia' ? 'Presupuesto de hoy' : 'Presupuesto del mes'}</h3>
          <p className="text-sm">{presupuestoVisible![tipo].periodo} · {destinoPresupuesto === 'simulacion' ? 'Simulado' : 'Servicio real'}</p>
          <p className="break-words">{dinero(presupuestoVisible![tipo].comprometido)} comprometidos de {dinero(presupuestoVisible![tipo].limite)}</p>
          {presupuestoVisible![tipo].comprometido >= presupuestoVisible![tipo].limite * .8 && <p className="text-sm text-amber-800">Se alcanzó el 80% del límite.</p>}
        </div>)}
      </div>
      <fieldset disabled={ocupado} className="space-y-4 min-w-0">
        <legend className="font-semibold mb-2">Configuración del ensayo</legend>
        <p className="text-sm">Simulación: no envía mensajes ni consume servicios de IA. Preparar o activar el servicio real requiere los botones específicos de abajo.</p>
        <p className="text-sm">Línea prevista: {config.numeroCentral}. Lunes a viernes 8–18; sábados 8–16. Máximo {config.limiteRespuestas24h} respuestas por cliente en 24 horas.</p>
        <label className="flex items-center gap-2 min-h-[44px]"><input type="checkbox" checked={config.permitirHorarioLaboral} onChange={e => setConfig({ ...config, permitirHorarioLaboral: e.target.checked })} />Simular también durante el horario laboral</label>
        <div className="grid gap-4 sm:grid-cols-2">{[0, 1].map(i => <div key={i} className="border rounded-lg p-3 space-y-3 min-w-0">
          <h3 className="font-medium">Equipo {i + 1}</h3>
          {(['operariaUid', 'secretariaUid'] as const).map(clave => <label key={clave} className="block text-sm">{clave === 'operariaUid' ? 'Operaria líder' : 'Secretaria de atención'}
            <select className={campo} value={config.equipos[i]?.[clave] ?? ''} onChange={e => cambiarMiembro(i, clave, e.target.value)}>
              <option value="">Seleccionar persona</option>{datos.personas.filter(p => p.rol === (clave === 'operariaUid' ? 'operaria' : 'secretaria')).map(p => <option key={p.uid} value={p.uid}>{p.nombre}</option>)}
            </select></label>)}
        </div>)}</div>
        <details className="border rounded-lg p-3"><summary className="min-h-[44px] cursor-pointer">Avanzado: tarifa del ensayo</summary>
          <p className="text-sm mb-3">Estos valores son simulados. Para uso real hará falta una tarifa verificada en el servidor.</p>
          <div className="grid gap-3 sm:grid-cols-2">{([
            ['modelo', 'Modelo exacto'], ['version', 'Versión de tarifa'], ['entradaMicroUsdPorMillon', 'Entrada: microdólares por millón de tokens'], ['salidaMicroUsdPorMillon', 'Salida: microdólares por millón de tokens'], ['maxTokensEntrada', 'Máximo de tokens de entrada'], ['maxTokensSalida', 'Máximo de tokens de salida'],
          ] as const).map(([clave, titulo]) => <label key={clave} className="text-sm">{titulo}<input className={campo} type={clave === 'modelo' || clave === 'version' ? 'text' : 'number'} min={1} step={1} value={config.tarifa?.[clave] ?? ''} onChange={e => cambiarTarifa(clave, e.target.value)} /></label>)}</div>
        </details>
        <label className="block text-sm">Motivo del cambio o ampliación<textarea className={campo} maxLength={1000} value={motivo} onChange={e => setMotivo(e.target.value)} /></label>
        <button className={boton} disabled={!motivo.trim()} onClick={() => void ejecutar({ accion: 'guardar', config, motivo })}>Guardar configuración del ensayo</button>
        {datos.runtime && <div className="border rounded-lg p-3 space-y-3">
          <h3 className="font-medium">Preparación del servicio real</h3>
          <p className="text-sm">Reparto por equipos: {datos.runtime.repartoHabilitado ? 'habilitado' : 'desactivado'}. Puede funcionar con la atención automática apagada.</p>
          <button className={boton} disabled={!motivo.trim() || (!datos.runtime.repartoHabilitado && (config.equipos.length !== 2 || config.equipos.some(e => !e.operariaUid || !e.secretariaUid)))} onClick={() => void ejecutar({ accion: 'reparto', habilitado: !datos.runtime!.repartoHabilitado, version: datos.runtime!.version, equipos: datos.runtime!.repartoHabilitado ? datos.runtime!.equipos : config.equipos, motivo })}>{datos.runtime.repartoHabilitado ? 'Desactivar reparto por equipos' : 'Activar reparto por equipos'}</button>
          <p className="text-sm">Estado: {datos.runtime.habilitado ? datos.servidorPreparado ? 'Atención automática habilitada' : 'Preparado; envío deshabilitado en el servidor' : 'Desactivado'}. {datos.runtime.phoneNumberId ? 'Línea central identificada en el catálogo.' : 'Línea pendiente de verificar al preparar.'}</p>
          <p className="text-sm">Equipos guardados: {datos.runtime.equipos.length}. Horario diurno preparado: {datos.runtime.permitirHorarioLaboral ? 'sí' : 'no'}.</p>
          <p className="text-sm">Se usarán los equipos y el horario del formulario. La tarifa real se define en el servidor; los valores avanzados del ensayo no la cambian.</p>
          <button className={boton} disabled={!motivo.trim() || config.equipos.length !== 2 || config.equipos.some(e => !e.operariaUid || !e.secretariaUid)} onClick={() => void ejecutar({ accion: 'preparar', habilitado: false, version: datos.runtime!.version, equipos: config.equipos, permitirHorarioLaboral: config.permitirHorarioLaboral, motivo })}>Preparar servicio sin activarlo</button>
          {!datos.servidorPreparado && <p className="text-sm text-amber-800">El servidor mantiene bloqueadas las llamadas de IA y los envíos. Activar aquí deja la autorización preparada hasta completar esa configuración.</p>}
          {!datos.runtime.habilitado && <label className="flex items-center gap-2 min-h-[44px]"><input type="checkbox" checked={confirmarActivacion} onChange={e => setConfirmarActivacion(e.target.checked)} />Confirmo habilitar la atención automática con los equipos y límites guardados</label>}
          <button className={boton} disabled={!motivo.trim() || (!datos.runtime.habilitado && !confirmarActivacion)} onClick={() => void ejecutar({ accion: 'estado', habilitado: !datos.runtime!.habilitado, version: datos.runtime!.version, permitirHorarioLaboral: config.permitirHorarioLaboral, confirmacion: confirmarActivacion ? 'ACTIVAR' : '', motivo })}>{datos.runtime.habilitado ? 'Desactivar atención automática' : 'Activar atención automática'}</button>
        </div>}
        <div className="border-t pt-4 space-y-3">
          <h3 className="font-medium">Ampliar presupuesto {destinoPresupuesto === 'simulacion' ? 'simulado' : 'del servicio real'}</h3>
          <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Vigencia<select className={campo} value={periodo} onChange={e => setPeriodo(e.target.value as 'dia' | 'mes')}><option value="dia">Solo hoy, hasta medianoche RD</option><option value="mes">Límite mensual</option></select></label>
            <label className="text-sm">Nuevo límite total en USD<input className={campo} type="number" min="0.000001" step="0.000001" value={importe} onChange={e => setImporte(e.target.value)} /></label></div>
          {periodo === 'mes' && <label className="flex items-center gap-2 min-h-[44px]"><input type="checkbox" checked={mensualPermanente} onChange={e => setMensualPermanente(e.target.checked)} />Conservar el nuevo límite para los meses siguientes</label>}
          <button className={boton} disabled={!motivo.trim() || !Number.isFinite(Number(importe)) || !Number.isSafeInteger(Math.round(Number(importe) * 1_000_000)) || Number(importe) * 1_000_000 <= presupuestoVisible![periodo].limite} onClick={() => void ejecutar({ accion: 'ampliar', destino: destinoPresupuesto, periodo, alcance: periodo === 'mes' && mensualPermanente ? 'permanente' : 'periodo_actual', periodoEsperado: presupuestoVisible![periodo].periodo, limiteAnterior: presupuestoVisible![periodo].limite, limiteMicroUsd: Math.round(Number(importe) * 1_000_000), motivo })}>Ampliar con registro de auditoría</button>
        </div>
      </fieldset>
      <fieldset disabled={ocupado} className="border-t pt-4 space-y-3 min-w-0"><legend className="font-semibold">Probar decisión de atención</legend>
        <p className="text-sm">Usa la configuración guardada. Las casillas de foto y ubicación solo representan datos recibidos; no suben archivos ni capturan tu ubicación.</p>
        <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Equipo<input className={campo} value={equipo} onChange={e => setEquipo(e.target.value)} /></label>
          <label className="text-sm">Servicio<select className={campo} value={servicio} onChange={e => setServicio(e.target.value)}><option value="">Sin definir</option><option value="reparacion">Reparación</option><option value="mantenimiento">Mantenimiento</option></select></label>
          <label className="text-sm sm:col-span-2">Falla o necesidad<textarea className={campo} value={falla} onChange={e => setFalla(e.target.value)} /></label></div>
        {([{ texto: 'Foto recibida', valor: foto, cambiar: setFoto }, { texto: 'Ubicación recibida', valor: ubicacion, cambiar: setUbicacion }, { texto: 'Pide hablar con una persona', valor: humano, cambiar: setHumano }, { texto: 'Pide la baja', valor: baja, cambiar: setBaja }, { texto: 'Ventana de respuesta abierta', valor: ventana, cambiar: setVentana }]).map(c => <label key={c.texto} className="flex items-center gap-2 min-h-[44px]"><input type="checkbox" checked={c.valor} onChange={e => c.cambiar(e.target.checked)} />{c.texto}</label>)}
        <button className={boton} onClick={() => void ejecutar({ accion: 'simular', pideHumano: humano, baja, ventanaAbierta: ventana, datos: { equipo, ...(servicio ? { servicio } : {}), falla, ...(foto ? { fotoId: 'simulacion-sin-archivo' } : {}), ...(ubicacion ? { ubicacion: { lat: 0, lng: 0 } } : {}) } }, false)}>Simular sin enviar</button>
        {resultado && <p role="status" className="border rounded-lg p-3">{resultado}</p>}
      </fieldset>
    </>}
  </section>;
}
