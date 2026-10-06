import { registrarActividadOrden } from '../services/actividadOrden.service';
import { useEffect, useRef, useState } from 'react';
import { equipoApi } from '../services/equipoApi';
import { enviarTexto } from '../services/whatsapp.service';
type Datos = { telefono: string; mensajes: { id: string; texto: string; entrada: boolean; autor: string; estado: string }[] };
export default function ChatOrdenTecnico({ ordenId, puedeEnviar = false }: { ordenId: string; puedeEnviar?: boolean }) {
  const [abierto, setAbierto] = useState(false), [datos, setDatos] = useState<Datos | null>(null), [texto, setTexto] = useState(''), [error, setError] = useState(''), [enviando, setEnviando] = useState(false);
  const intento = useRef<{ texto: string; id: string }>();
  useEffect(() => {
    if (!abierto) return;
    let cancelado = false;
    const cargar = async () => { try { const result = await equipoApi<Datos>(`/api/movil/chat?ordenId=${encodeURIComponent(ordenId)}`); if (!cancelado) { setDatos(result); setError(''); } } catch (e) { if (!cancelado) { setDatos(null); setError(e instanceof Error ? e.message : 'No se pudo cargar.'); } } };
    void cargar(); const timer = setInterval(() => { void cargar(); }, 15000);
    return () => { cancelado = true; clearInterval(timer); };
  }, [abierto, ordenId]);
  return <div className="w-full">
    <button type="button" className="min-h-11 rounded-xl border border-blue-200 bg-white px-3 text-blue-700" onClick={() => { if(!abierto) void registrarActividadOrden(ordenId,'whatsapp').catch(()=>setError('No se pudo registrar la apertura del chat.')); setAbierto(!abierto); }}>{abierto ? 'Cerrar conversación' : 'WhatsApp de esta orden'}</button>
    {abierto && <section className="mt-2 rounded-xl border bg-white p-3" aria-label="Chat oficial de la orden">
      <p className="text-xs text-slate-500">Mensajes vinculados a esta orden. El cliente recibe desde el número oficial.</p>
      <div className="my-3 max-h-64 space-y-2 overflow-auto">{datos?.mensajes.map(m => <div key={m.id} className={`rounded-lg p-2 text-sm ${m.entrada ? 'bg-slate-100' : 'bg-blue-50'}`}><p className="text-xs font-medium">{m.autor} · {m.estado}</p><p className="whitespace-pre-wrap break-words">{m.texto}</p></div>)}</div>
      {error && <p role="alert" className="my-2 text-sm text-red-700">{error}</p>}
      {!puedeEnviar && <p className="my-2 text-sm text-slate-600">Solo lectura: la oficina debe habilitar tu permiso para contactar al cliente.</p>}
      <textarea aria-label="Mensaje al cliente" value={texto} onChange={e => setTexto(e.target.value)} maxLength={2000} disabled={enviando || !datos || !puedeEnviar} className="w-full rounded-lg border p-2 text-base" />
      <button type="button" disabled={!datos || !texto.trim() || enviando || !puedeEnviar} className="mt-2 min-h-11 rounded-xl bg-blue-600 px-4 text-white disabled:opacity-50" onClick={async () => {
        if (!datos || enviando || !puedeEnviar) return; setEnviando(true); setError('');
        const mensaje = texto.trim(); if (intento.current?.texto !== mensaje) intento.current = { texto: mensaje, id: crypto.randomUUID().replace(/-/g, '') };
        try { const result = await enviarTexto(datos.telefono, mensaje, { ordenId, tempId: intento.current.id });
          if (!result.ok || result.estado === 'failed') { setError(!result.ok && result.error === 'window-cerrada' ? 'Pide a oficina retomar la conversación con una plantilla aprobada.' : 'No se pudo confirmar el envío. Revisa el estado antes de reintentar.'); return; }
          setTexto(''); intento.current = undefined;
          setDatos(await equipoApi<Datos>(`/api/movil/chat?ordenId=${encodeURIComponent(ordenId)}`));
        } catch { setError('Sin conexión. Reintenta el mismo mensaje para comprobar su estado.'); }
        finally { setEnviando(false); }
      }}>{enviando ? 'Enviando…' : 'Enviar por WhatsApp oficial'}</button>
    </section>}
  </div>;
}
