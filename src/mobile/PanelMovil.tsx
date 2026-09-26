import { useEffect, useState } from 'react';
import { esAppNativa } from './camara';
import { iniciarJornada, detenerJornada, observarJornada } from './jornada';
import { estadoUbicacion } from './politicas';
import { activarNotificacionesMoviles } from './notificaciones';
export default function PanelMovil({ uid }: { uid?: string }) {
  const [estado, setEstado] = useState<{ activa: boolean; ultima?: { capturadaEn: number; precision: number }; error?: string; pendiente: boolean }>({ activa: false, pendiente: false });
  const [ocupado, setOcupado] = useState(false), [mensaje, setMensaje] = useState('');
  const [ahora, setAhora] = useState(Date.now());
  useEffect(() => { const off = observarJornada(setEstado); const timer = setInterval(() => setAhora(Date.now()), 30000); return () => { off(); clearInterval(timer); }; }, [uid]);
  if (!esAppNativa() || !uid) return null;
  return <section className="mx-auto my-3 max-w-4xl rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <h2 className="font-semibold text-slate-900">Mi jornada</h2>
    <p className="mt-1 text-sm text-slate-600">La ubicación se comparte con la oficina mientras la jornada esté activa. Finalízala al terminar.</p>
    <p className="mt-2 text-sm" role="status">{estado.activa ? `Ubicación ${estadoUbicacion(estado.ultima?.capturadaEn, ahora)}` : 'Jornada detenida'}{estado.ultima ? ` · precisión ${Math.round(estado.ultima.precision)} m` : ''}{estado.pendiente ? ' · sincronización pendiente' : ''}</p>
    <div className="mt-3 flex flex-wrap gap-2">
      <button disabled={ocupado} className="min-h-11 rounded-xl bg-blue-600 px-4 py-2 text-white disabled:opacity-50" onClick={async () => { setOcupado(true); setMensaje(''); try { if (estado.activa) await detenerJornada(); else await iniciarJornada(); } catch (e) { setMensaje(e instanceof Error ? e.message : 'No se pudo iniciar.'); } finally { setOcupado(false); } }}>{ocupado ? 'Procesando…' : estado.activa ? 'Finalizar jornada' : 'Iniciar jornada'}</button>
      <button className="min-h-11 rounded-xl border border-slate-300 px-4 py-2" onClick={async () => { try { await activarNotificacionesMoviles(); setMensaje('Notificaciones registradas en este teléfono.'); } catch { setMensaje('No se pudieron registrar las notificaciones. Revisa permisos y conexión.'); } }}>Activar avisos</button>
    </div>
    {(mensaje || estado.error) && <p role="status" className="mt-2 text-sm text-amber-800">{mensaje || estado.error}</p>}
  </section>;
}
