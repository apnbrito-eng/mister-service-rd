import { useEffect, useRef, useState } from 'react';
import { ImagePlus } from 'lucide-react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../../firebase/config';
import { enviarMedia } from '../../services/whatsapp.service';
import { validarImagenInbox } from '../../utils/imagenInbox';

/** Sólo el botón Enviar inicia la subida. El borrador nunca cruza destinatarios. */
export default function AdjuntarImagen({ waId, habilitado, motivo }: { waId: string; habilitado: boolean; motivo: string }) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [vista, setVista] = useState('');
  const [texto, setTexto] = useState('');
  const [error, setError] = useState('');
  const [estado, setEstado] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [intentado, setIntentado] = useState(false);
  const generacion = useRef(0), bloqueo = useRef(false);
  const vigente = useRef({ waId, habilitado }); vigente.current = { waId, habilitado };
  const envio = useRef({ id: '', url: '', texto: '' });
  useEffect(() => {
    generacion.current++; bloqueo.current = false;
    setArchivo(null); setTexto(''); setError(''); setEstado(''); setOcupado(false); setIntentado(false);
    envio.current = { id: '', url: '', texto: '' };
    const invalidar = () => { generacion.current++; };
    return invalidar;
  }, [waId]);
  useEffect(() => {
    if (!archivo) { setVista(''); return; }
    const url = URL.createObjectURL(archivo); setVista(url);
    return () => URL.revokeObjectURL(url);
  }, [archivo]);
  async function seleccionar(f: File | undefined) {
    if (!f || bloqueo.current || !habilitado) return;
    const g = ++generacion.current;
    setError(''); setEstado(''); setArchivo(null); setIntentado(false);
    try {
      await validarImagenInbox(f);
      if (g !== generacion.current) return;
      envio.current = { id: crypto.randomUUID().replace(/-/g, ''), url: '', texto: '' };
      setArchivo(f); setTexto('');
    } catch (e) { if (g === generacion.current) setError((e as Error).message); }
  }
  async function enviar() {
    if (!archivo || bloqueo.current || !vigente.current.habilitado || !/^\d{7,16}$/.test(waId)) return;
    bloqueo.current = true; setOcupado(true); setError(''); setEstado('');
    const g = generacion.current, destino = waId, intento = envio.current;
    if (!intentado) intento.texto = texto.trim();
    setIntentado(true);
    try {
      if (!intento.url) {
        await validarImagenInbox(archivo);
        if (g !== generacion.current || !vigente.current.habilitado || vigente.current.waId !== destino) return;
        const referencia = ref(storage, `whatsapp-media/${destino}/imagen-${intento.id}.${archivo.type === 'image/png' ? 'png' : 'jpg'}`);
        await uploadBytes(referencia, archivo, { contentType: archivo.type });
        intento.url = await getDownloadURL(referencia);
      }
      if (g !== generacion.current || !vigente.current.habilitado || vigente.current.waId !== destino) return;
      const resultado = await enviarMedia(destino, intento.url, archivo.type, intento.texto, { tempId: intento.id });
      if (g !== generacion.current) return;
      if (!resultado.ok) throw new Error(resultado.error || 'No se confirmó el envío.');
      setArchivo(null); setTexto(''); setEstado('Imagen enviada.'); setIntentado(false);
    } catch (e) { if (g === generacion.current) setError(`${(e as Error).message} Reintenta este mismo envío para conservar su identificador.`); }
    finally { if (g === generacion.current) { bloqueo.current = false; setOcupado(false); } }
  }
  return <div className="relative">
    <label className={`min-h-11 min-w-11 flex items-center justify-center ${!habilitado || ocupado ? 'opacity-40' : 'cursor-pointer'}`} title={habilitado ? 'Adjuntar imagen' : motivo}>
      <ImagePlus size={22} aria-hidden="true" /><span className="sr-only">Adjuntar imagen</span>
      <input aria-label="Adjuntar imagen" type="file" accept="image/jpeg,image/png" className="sr-only" disabled={!habilitado || ocupado || intentado} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; void seleccionar(f); }} />
    </label>
    {archivo && <section aria-label="Revisar imagen antes de enviar" className="fixed z-50 bottom-24 left-3 right-3 max-w-lg mx-auto rounded-xl border bg-white p-3 shadow-lg">
      <p className="text-sm">Destinatario: {waId}. Revisa que la foto y el texto no incluyan datos privados ajenos a esta consulta.</p>
      <img src={vista} alt="Imagen seleccionada para enviar" className="max-h-48 w-full object-contain my-2" />
      <textarea aria-label="Texto de la imagen" maxLength={1024} value={texto} disabled={ocupado || intentado} onChange={e => setTexto(e.target.value)} className="border rounded w-full p-2" />
      {!habilitado && <p role="status">{motivo}</p>}
      {intentado && <p className="text-xs">El reintento conserva la misma imagen, texto e identificador para evitar duplicados.</p>}
      <div className="flex justify-end gap-2"><button type="button" disabled={ocupado} onClick={() => { generacion.current++; setArchivo(null); setIntentado(false); setError(''); }} className="min-h-11 px-3">Descartar</button><button type="button" disabled={!habilitado || ocupado} onClick={() => void enviar()} className="min-h-11 px-3 rounded bg-primary text-white">{ocupado ? 'Enviando…' : intentado ? 'Reintentar envío' : 'Enviar imagen'}</button></div>
    </section>}
    {error && <p role="alert" className="text-red-700 text-xs">{error}</p>}
    {estado && <p role="status" className="text-xs">{estado}</p>}
  </div>;
}
