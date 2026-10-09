import { useRef, useState } from 'react';
import { registrarActividadOrden } from '../../services/actividadOrden.service';
import { useChatClienteEmpresa } from '../../hooks/useChatClienteEmpresa';
import toast from 'react-hot-toast';

export default function ContactoOrden({ ordenId, telefono, nombre }: { ordenId: string; telefono?: string; nombre: string }) {
  const {abrirChat,puedeAbrir}=useChatClienteEmpresa();
  const ocupado = useRef(false);
  const [registrando, setRegistrando] = useState(false);
  const [enlacePendiente, setEnlacePendiente] = useState<string | null>(null);
  if (!telefono) return null;
  const whatsapp = async () => {
    if(ocupado.current)return;
    ocupado.current=true;setRegistrando(true);
    try{await abrirChat({telefono,nombre},undefined,async()=>{await registrarActividadOrden(ordenId,'whatsapp');});}
    finally{ocupado.current=false;setRegistrando(false);}
  };
  const llamar = async () => {
    if (ocupado.current) return;
    ocupado.current = true;
    setRegistrando(true);
    setEnlacePendiente(null);
    const url = `tel:${telefono.replace(/[^+0-9]/g, '')}`;
    try {
      await registrarActividadOrden(ordenId, 'llamar');
    } catch {
      toast.error('No se pudo registrar la acción. Intenta de nuevo para abrir el contacto.');
      ocupado.current = false;
      setRegistrando(false);
      return;
    }
    try {
      // La llamada mantiene su enlace telefónico y su traza previa.
      setEnlacePendiente(url);
      window.location.assign(url);
    } catch { setEnlacePendiente(url); }
    finally { ocupado.current = false; setRegistrando(false); }
  };
  return <section className="rounded-lg border p-3">
    <h3 className="font-semibold">Contactar a {nombre}</h3>
    <div className="flex gap-3 flex-wrap mt-2">
      <button type="button" disabled={registrando || !puedeAbrir} title={puedeAbrir?'Abrir conversación empresarial':'Tu rol no tiene acceso al inbox empresarial'} onClick={whatsapp} className="rounded border p-3 disabled:opacity-50">WhatsApp empresarial</button>
      <button type="button" className="rounded border p-3 disabled:opacity-50" disabled={registrando} onClick={llamar}>Llamar · {telefono}</button>
    </div>
    {registrando && <p role="status" className="mt-2 text-sm">Registrando acción de contacto…</p>}
    {enlacePendiente && <p className="mt-2 text-sm">Si no se abrió, <a className="underline" href={enlacePendiente}>abrir llamada</a>.</p>}
  </section>;
}
