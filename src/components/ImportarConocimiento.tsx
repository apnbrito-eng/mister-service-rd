import { useState } from 'react';
import { extraerDocumento, type DocumentoExtraido } from '../services/documentosConocimiento';
import { equipoApi } from '../services/equipoApi';
export default function ImportarConocimiento({ onGuardado }: { onGuardado: () => void }) {
  const [documento, setDocumento] = useState<DocumentoExtraido | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState('');
  return <section className="rounded-2xl border bg-white p-5 space-y-4">
    <h2 className="font-semibold text-lg">Incorporar un documento</h2>
    <p className="text-sm text-gray-600">Excel .xlsx y PDF con texto, hasta 5 MB. Revisa lo extraído antes de enviarlo. Se guardará el texto con su fuente, pendiente de aprobación; no modifica automáticamente el tarifario. Usa solo información que pueda consultar todo el equipo.</p>
    <label className="block text-sm font-medium">Seleccionar archivo<input type="file" accept=".xlsx,.pdf" disabled={ocupado} className="block mt-2" onChange={async e => {
      const file=e.target.files?.[0]; if(!file) return;
      setOcupado(true); setDocumento(null); setMensaje('Leyendo documento…');
      try { setDocumento(await extraerDocumento(file)); setMensaje('Revisa todos los fragmentos. Las fórmulas de Excel usan el resultado guardado; no se recalculan. Las hojas ocultas no se importan.'); }
      catch(err) { setMensaje((err as Error).message); } finally {setOcupado(false); e.target.value='';}
    }}/></label>
    {mensaje && <p role="status" className="text-sm text-gray-700">{mensaje}</p>}
    {documento && <><p className="font-medium">{documento.nombre} · {documento.fragmentos.length} fragmentos</p><div className="max-h-80 overflow-y-auto space-y-3">{documento.fragmentos.map((f,i)=><details key={i} className="border rounded-lg p-3"><summary>{f.titulo}</summary><pre className="whitespace-pre-wrap font-sans text-sm mt-2">{f.contenido}</pre></details>)}</div><button disabled={ocupado} className="rounded-lg bg-primary text-white px-4 py-3 disabled:opacity-50" onClick={async()=>{
      setOcupado(true);
      try {const r=await equipoApi<{duplicado?:boolean}>('/api/ai/conocimiento',{accion:'importar',...documento});setMensaje(r.duplicado?'Este contenido ya se había incorporado. No se duplicó.':'Documento guardado. Revisa y aprueba cada fragmento antes de que la IA lo use.');setDocumento(null);onGuardado();}
      catch(err){setMensaje((err as Error).message);}finally{setOcupado(false);}
    }}>Enviar documento a revisión</button><button disabled={ocupado} onClick={()=>setDocumento(null)} className="ml-3 underline">Descartar</button></>}
  </section>;
}
