import { useState } from 'react';
import { esAppNativa } from './camara';
import { activarNotificacionesMoviles } from './notificaciones';
export default function AvisosMoviles() {
  const [mensaje, setMensaje] = useState(''), [ocupado, setOcupado] = useState(false);
  if (!esAppNativa()) return null;
  return <section className="m-3 rounded-xl border bg-white/80 p-3" aria-label="Avisos en este teléfono">
    <button type="button" disabled={ocupado} className="min-h-11 rounded-lg border px-3 text-sm" onClick={async () => {
      setOcupado(true);
      try { await activarNotificacionesMoviles(); setMensaje('Teléfono registrado para recibir avisos. Comprueba la recepción con la app cerrada.'); }
      catch (e) { setMensaje(e instanceof Error ? e.message : 'No se pudo registrar este teléfono.'); }
      finally { setOcupado(false); }
    }}>{ocupado ? 'Registrando…' : 'Activar avisos en este teléfono'}</button>
    {mensaje && <p role="status" className="mt-2 text-sm">{mensaje}</p>}
  </section>;
}
