import { Capacitor, registerPlugin } from '@capacitor/core';
import { useEffect, useRef, useState } from 'react';
import { Mic, Square, Send, Trash2, Loader2 } from 'lucide-react';
import { equipoApi } from '../../services/equipoApi';
import { enviarMedia } from '../../services/whatsapp.service';
import toast from 'react-hot-toast';
const nativeVoice = registerPlugin<{ start(): Promise<void>; level(): Promise<{ active: boolean; amplitude: number }>; stop(): Promise<{ audio: string }>; cancel(): Promise<void> }>('VoiceNote');
const android = Capacitor.getPlatform() === 'android';
/** Nothing leaves the phone before the explicit Send action. */
export default function NotaVoz({ waId, disabled }: { waId: string; disabled: boolean }) {
  const [grabando, setGrabando] = useState(false), [ocupado, setOcupado] = useState(false);
  const [segundos, setSegundos] = useState(0), [niveles, setNiveles] = useState<number[]>([]);
  const descartar = useRef(false);
  const [blob, setBlob] = useState<Blob | null>(null), [url, setUrl] = useState('');
  const recorder = useRef<MediaRecorder | null>(null), stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const vivo = useRef(true), envioId = useRef(''), subida = useRef('');
  useEffect(() => { vivo.current = true; return () => { vivo.current = false; if (android) void nativeVoice.cancel(); clearTimeout(timer.current); if (recorder.current?.state === 'recording') recorder.current.stop(); stream.current?.getTracks().forEach(t => t.stop()); }; }, []);
  useEffect(() => { if (!blob) { setUrl(''); return; } const u = URL.createObjectURL(blob); setUrl(u); return () => URL.revokeObjectURL(u); }, [blob]);
  useEffect(() => {
    if (!grabando) return;
    let cerrado = false, pendiente = false;
    const inicio = performance.now();
    let context: AudioContext | undefined, analyser: AnalyserNode | undefined;
    if (!android && stream.current) {
      try { context = new AudioContext(); analyser = context.createAnalyser(); analyser.fftSize = 256; context.createMediaStreamSource(stream.current).connect(analyser); void context.resume(); } catch { /* Timer remains visible if metering is unavailable. */ }
    }
    const datos = new Uint8Array(256);
    const interval = setInterval(async () => {
      setSegundos(Math.min(120, Math.floor((performance.now() - inicio) / 1000)));
      if (pendiente) return;
      pendiente = true;
      try {
        let nivel = 0;
        if (android) {
          const r = await nativeVoice.level();
          if (!r.active && !cerrado) { setGrabando(false); toast.error('La grabación se interrumpió. Graba de nuevo.'); return; }
          nivel = Math.min(1, Math.sqrt(r.amplitude / 32767));
        } else if (analyser) {
          analyser.getByteTimeDomainData(datos);
          nivel = Math.min(1, Math.sqrt(datos.reduce((sum, x) => sum + ((x - 128) / 128) ** 2, 0) / datos.length) * 4);
        }
        if (!cerrado) setNiveles(prev => [...prev.slice(-31), nivel]);
      } catch { /* No artificial voice levels: retain the timer if the meter fails. */ }
      finally { pendiente = false; }
    }, 100);
    return () => { cerrado = true; clearInterval(interval); if (context) void context.close(); };
  }, [grabando]);
  async function cancelar() {
    descartar.current = true; clearTimeout(timer.current); setGrabando(false); setOcupado(true);
    try { if (android) await nativeVoice.cancel(); else { if (recorder.current?.state === 'recording') recorder.current.stop(); stream.current?.getTracks().forEach(t => t.stop()); } }
    finally { if (vivo.current) { setBlob(null); setOcupado(false); } }
  }
  function parar() { clearTimeout(timer.current); if (android) { setOcupado(true); void nativeVoice.stop().then(r => { if (!vivo.current) return; const bytes = Uint8Array.from(atob(r.audio), c => c.charCodeAt(0)); setBlob(new Blob([bytes], { type: 'audio/mp4' })); envioId.current = crypto.randomUUID().replace(/-/g, ''); subida.current = ''; }).catch(e => { if (vivo.current) toast.error(e.message); }).finally(() => { if (vivo.current) setOcupado(false); }); setGrabando(false); return; } if (recorder.current?.state === 'recording') recorder.current.stop(); stream.current?.getTracks().forEach(t => t.stop()); setGrabando(false); }
  async function iniciar() {
    setOcupado(true); descartar.current = false; setSegundos(0); setNiveles([]);
    try {
      if (android) { await nativeVoice.start(); if (!vivo.current) { await nativeVoice.cancel(); return; } setGrabando(true); timer.current = setTimeout(parar, 120000); return; }
      const mime = ['audio/mp4', 'audio/ogg;codecs=opus'].find(m => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m));
      if (!mime) throw new Error('Este teléfono todavía no permite grabar en un formato compatible.');
      const s = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 }, video: false });
      if (!vivo.current) { s.getTracks().forEach(t => t.stop()); return; }
      stream.current = s; const r = new MediaRecorder(s, { mimeType: mime, audioBitsPerSecond: 64000 }); recorder.current = r;
      const chunks: Blob[] = [];
      r.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      r.onstop = () => { s.getTracks().forEach(t => t.stop()); if (vivo.current && !descartar.current) { setGrabando(false); setBlob(new Blob(chunks, { type: mime.split(';')[0] })); envioId.current = crypto.randomUUID().replace(/-/g, ''); subida.current = ''; } };
      r.onerror = () => { parar(); toast.error('La grabación se interrumpió. Revísala antes de enviarla.'); };
      r.start(); setGrabando(true); timer.current = setTimeout(parar, 120000);
    } catch (e) { stream.current?.getTracks().forEach(t => t.stop()); toast.error((e as Error).name === 'NotAllowedError' ? 'Permite el micrófono en los ajustes del teléfono.' : (e as Error).message); }
    finally { if (vivo.current) setOcupado(false); }
  }
  async function enviar() {
    if (!blob || disabled || ocupado) return; setOcupado(true);
    try {
      if (!subida.current) {
        const audio = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(blob); });
        const result = await equipoApi<{ url: string }>('/api/whatsapp/audio', { waId, audio, mimeType: blob.type }); subida.current = result.url;
      }
      const result = await enviarMedia(waId, subida.current, blob.type, undefined, { tempId: envioId.current });
      if (!result.ok) throw new Error(result.error);
      setBlob(null); toast.success('Audio enviado');
    } catch (e) { toast.error((e as Error).message); }
    finally { if (vivo.current) setOcupado(false); }
  }
  if (grabando) return <div role="group" aria-label="Grabación de nota de voz" className="absolute inset-0 z-10 overflow-hidden flex items-center gap-2 rounded-2xl border border-red-100 bg-white px-2">
    <div role="progressbar" aria-label="Duración de grabación, máximo dos minutos" aria-valuemin={0} aria-valuemax={120} aria-valuenow={segundos} className="absolute bottom-0 left-0 right-0 h-1 bg-red-50"><div className="h-full bg-red-500 motion-safe:transition-[width] motion-safe:duration-100" style={{ width: `${segundos / 120 * 100}%` }} /></div>
    <button type="button" onClick={cancelar} aria-label="Cancelar grabación" className="min-h-11 min-w-11 flex items-center justify-center text-gray-500"><Trash2 size={20} /></button>
    <span className="h-2 w-2 rounded-full bg-red-600 shrink-0" aria-hidden="true" />
    <span className="flex flex-col shrink-0"><span role="status" className="text-xs font-semibold text-red-700">Grabando audio</span><span className="text-sm tabular-nums text-red-700" role="timer" aria-label="Tiempo grabado">{Math.floor(segundos / 60)}:{String(segundos % 60).padStart(2, '0')}</span></span>
    <div className="flex-1 min-w-0 h-9 flex items-center justify-end gap-[2px] overflow-hidden" aria-hidden="true">{niveles.map((n, i) => <span key={i} className="w-[3px] shrink-0 rounded-full bg-red-500" style={{ height: `${3 + n * 29}px` }} />)}</div>
    <span className="sr-only">Grabando. Máximo dos minutos.</span>
    <button type="button" onClick={parar} aria-label="Detener y escuchar grabación" className="min-h-11 min-w-11 flex items-center justify-center rounded-full bg-red-600 text-white"><Square size={18} /></button>
  </div>;
  if (blob) return <div className="absolute bottom-full left-0 right-0 mb-2 rounded-2xl border bg-white p-3 shadow-lg"><p className="text-xs mb-2">Escucha tu audio antes de enviarlo</p><audio controls src={url} className="w-full h-10" /><div className="flex justify-end gap-2 mt-2"><button disabled={ocupado} onClick={() => setBlob(null)} aria-label="Descartar audio" className="min-h-11 min-w-11 flex items-center justify-center"><Trash2 size={20} /></button><button disabled={disabled || ocupado} onClick={enviar} className="min-h-11 px-3 rounded-xl bg-primary text-white flex items-center gap-2">{ocupado ? <Loader2 size={18} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Send size={18} />}{ocupado ? 'Enviando…' : 'Enviar audio'}</button></div></div>;
  return <button type="button" aria-label={grabando ? 'Detener grabación' : 'Grabar nota de voz'} disabled={!grabando && (disabled || ocupado)} onClick={grabando ? parar : iniciar} className={`min-h-11 min-w-11 flex items-center justify-center rounded-full ${grabando ? 'bg-red-600 text-white' : 'bg-transparent text-slate-800 shrink-0'} disabled:opacity-40`}>{grabando ? <Square size={20} /> : ocupado ? <Loader2 size={20} className="animate-spin motion-reduce:animate-none" /> : <span className="h-9 w-9 rounded-full bg-slate-100 flex items-center justify-center"><Mic size={22} strokeWidth={2} className="shrink-0" aria-hidden="true" /></span>}</button>;
}
