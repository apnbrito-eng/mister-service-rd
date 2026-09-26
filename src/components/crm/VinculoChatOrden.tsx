import { useCallback, useEffect, useState } from 'react';
import { equipoApi } from '../../services/equipoApi';

type Ruta = { version: number; activa: boolean; ordenActiva: string | null };
export default function VinculoChatOrden({ ordenId, fuente }: { ordenId: string; fuente?: { wamid: string; tipo?: string; texto: string } | null }) {
  const [ruta, setRuta] = useState<Ruta | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const cargar = useCallback(async () => {
    setRuta(await equipoApi<Ruta>(`/api/crm/chat-orden?ordenId=${encodeURIComponent(ordenId)}`));
  }, [ordenId]);
  useEffect(() => { let vivo = true; equipoApi<Ruta>(`/api/crm/chat-orden?ordenId=${encodeURIComponent(ordenId)}`).then(r => { if (vivo) setRuta(r); }).catch(e => { if (vivo) setMensaje(e.message); }); return () => { vivo = false; }; }, [ordenId]);
  async function actuar(accion: string) {
    if (!ruta || ocupado) return;
    setOcupado(true); setMensaje('');
    try {
      await equipoApi('/api/crm/chat-orden', { ordenId, version: ruta.version, accion, ...(['compartir', 'ocultar'].includes(accion) ? { wamid: fuente?.wamid } : {}) });
      setMensaje(accion === 'compartir' ? 'Texto compartido con el técnico asignado.' : accion === 'ocultar' ? 'Texto retirado de la vista del técnico.' : 'Vínculo actualizado.');
    } catch (e) { setMensaje(e instanceof Error ? e.message : 'No se pudo guardar.'); }
    finally { try { await cargar(); } catch { setMensaje('No se pudo actualizar el vínculo. Vuelve a abrir la orden.'); setRuta(null); } setOcupado(false); }
  }
  return <section className="rounded-xl border border-slate-200 bg-slate-50 p-3 my-3 space-y-2" aria-label="Vínculo del chat con la orden">
    <p className="text-sm font-semibold">Chat de esta orden {ruta?.activa ? '· Activo' : '· Sin vínculo activo'}</p>
    <p className="text-xs text-slate-600">Los nuevos mensajes se guardan en la orden activa. El técnico solo ve los textos que oficina comparte y los que él envía.</p>
    {ruta?.ordenActiva && !ruta.activa && <p className="text-xs text-amber-800">El chat está vinculado a otra orden o a una orden cerrada. Activar aquí sustituye ese vínculo.</p>}
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={!ruta || ocupado} onClick={() => actuar(ruta?.activa ? 'pausar' : 'activar')} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50">{ruta?.activa ? 'Pausar vínculo' : 'Vincular nuevos mensajes aquí'}</button>
      {fuente?.tipo === 'text' && <button type="button" disabled={!ruta || ocupado} onClick={() => actuar('compartir')} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50">Compartir texto seleccionado con técnico</button>}
      {fuente?.tipo === 'text' && <button type="button" disabled={!ruta || ocupado} onClick={() => actuar('ocultar')} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50">Ocultar texto al técnico</button>}
    </div>
    {mensaje && <p role="status" className="text-xs">{mensaje}</p>}
  </section>;
}
