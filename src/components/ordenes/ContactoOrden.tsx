import { useRef, useState } from 'react';
import { registrarActividadOrden } from '../../services/actividadOrden.service';
import { whatsappUrl } from '../../utils/whatsapp';
import toast from 'react-hot-toast';

type AccionContacto = 'llamar' | 'whatsapp';

export default function ContactoOrden({ ordenId, telefono, nombre }: { ordenId: string; telefono?: string; nombre: string }) {
  const ocupado = useRef(false);
  const [registrando, setRegistrando] = useState(false);
  const [enlacePendiente, setEnlacePendiente] = useState<{ url: string; accion: AccionContacto } | null>(null);
  if (!telefono) return null;

  const contactar = async (accion: AccionContacto) => {
    if (ocupado.current) return;
    ocupado.current = true;
    setRegistrando(true);
    setEnlacePendiente(null);
    const url = accion === 'whatsapp' ? whatsappUrl(telefono) : `tel:${telefono.replace(/[^+0-9]/g, '')}`;
    // Reservar la pestaña durante el gesto del usuario evita el bloqueo tras el await.
    // Todavía no sale de la app ni abre la conversación: primero debe guardarse la traza.
    let ventana: Window | null = null;
    if (accion === 'whatsapp') {
      try {
        ventana = window.open('about:blank', '_blank');
        if (ventana) ventana.opener = null;
      } catch { ventana = null; }
    }
    try {
      await registrarActividadOrden(ordenId, accion);
    } catch {
      ventana?.close();
      toast.error('No se pudo registrar la acción. Intenta de nuevo para abrir el contacto.');
      ocupado.current = false;
      setRegistrando(false);
      return;
    }

    try {
      if (accion === 'whatsapp') {
        if (ventana && !ventana.closed) ventana.location.replace(url);
        else setEnlacePendiente({ url, accion });
      } else {
        // Algunas plataformas exigen otro toque para abrir una app externa tras esperar la red.
        setEnlacePendiente({ url, accion });
        window.location.assign(url);
      }
    } catch {
      ventana?.close();
      setEnlacePendiente({ url, accion });
    } finally {
      ocupado.current = false;
      setRegistrando(false);
    }
  };

  return <section className="rounded-lg border p-3">
    <h3 className="font-semibold">Contactar a {nombre}</h3>
    <div className="flex gap-3 flex-wrap mt-2">
      <button type="button" className="rounded border p-3 disabled:opacity-50" disabled={registrando} onClick={() => contactar('whatsapp')}>WhatsApp</button>
      <button type="button" className="rounded border p-3 disabled:opacity-50" disabled={registrando} onClick={() => contactar('llamar')}>Llamar · {telefono}</button>
    </div>
    {registrando && <p role="status" className="mt-2 text-sm">Registrando acción de contacto…</p>}
    {enlacePendiente && <p className="mt-2 text-sm">Si no se abrió, <a className="underline" href={enlacePendiente.url} target={enlacePendiente.accion === 'whatsapp' ? '_blank' : undefined} rel="noreferrer">abrir {enlacePendiente.accion === 'whatsapp' ? 'WhatsApp' : 'llamada'}</a>.</p>}
  </section>;
}
