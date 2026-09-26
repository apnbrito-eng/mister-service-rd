import { useRef, useState } from 'react';
import { obtenerAppCheckToken } from '../../lib/appCheck';
const categorias = [
  ['puntualidad', 'Puntualidad'], ['trato', 'Trato y atención'],
  ['claridad', 'Claridad de la explicación'], ['calidad', 'Calidad del trabajo'],
] as const;
export default function EvaluacionServicio({ token, onEnviado }: { token: string; onEnviado: () => void }) {
  const [scores, setScores] = useState<Record<string, number>>({});
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const ocupado = useRef(false);
  async function enviar() {
    if (ocupado.current || categorias.some(([key]) => !scores[key])) return;
    ocupado.current = true; setEnviando(true); setError('');
    try {
      const appCheck = await obtenerAppCheckToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (appCheck) headers['X-Firebase-AppCheck'] = appCheck;
      const response = await fetch(`/api/feedback/${encodeURIComponent(token)}`, {
        method: 'POST', headers, body: JSON.stringify({ evaluacion: scores, comentario: comentario.trim() }),
      });
      if (response.ok || response.status === 409) onEnviado();
      else setError('No pudimos guardar tu evaluación. Intenta de nuevo.');
    } catch { setError('Revisa tu conexión e intenta de nuevo.'); }
    finally { ocupado.current = false; setEnviando(false); }
  }
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-label="Evaluación del servicio">
    <h2 className="text-lg font-semibold text-slate-900">¿Cómo fue tu experiencia?</h2>
    <p className="mt-1 text-sm text-slate-600">Califica de 1 (muy mala) a 5 (excelente). Tu opinión nos ayuda a mejorar.</p>
    <div className="mt-5 space-y-5">
      {categorias.map(([key, label]) => <fieldset key={key} disabled={enviando}>
        <legend className="mb-2 text-sm font-medium text-slate-800">{label}</legend>
        <div className="grid grid-cols-5 gap-2">{[1, 2, 3, 4, 5].map(value =>
          <label key={value} className={`flex min-h-11 cursor-pointer items-center justify-center rounded-xl border ${scores[key] === value ? 'border-blue-600 bg-blue-50 text-blue-800' : 'border-slate-200 text-slate-700'} focus-within:ring-2 focus-within:ring-blue-500`}>
            <input className="sr-only" type="radio" name={key} value={value} checked={scores[key] === value} onChange={() => setScores(prev => ({ ...prev, [key]: value }))} aria-label={`${label}: ${value} de 5`} />{value}
          </label>)}</div>
      </fieldset>)}
    </div>
    <label className="mt-5 block text-sm font-medium text-slate-800">Comentario (opcional)
      <textarea value={comentario} onChange={e => setComentario(e.target.value)} maxLength={500} disabled={enviando} className="mt-2 w-full rounded-xl border border-slate-300 p-3 text-base font-normal" rows={3} />
    </label>
    {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    <button type="button" onClick={enviar} disabled={enviando || categorias.some(([key]) => !scores[key])} className="mt-4 min-h-11 w-full rounded-xl bg-blue-600 px-4 py-3 font-medium text-white disabled:opacity-50">{enviando ? 'Guardando…' : 'Enviar evaluación'}</button>
  </section>;
}
