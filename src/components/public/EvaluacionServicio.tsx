import { useMemo, useRef, useState } from 'react';
import { obtenerAppCheckToken } from '../../lib/appCheck';

// Portal del Cliente — formulario de evaluación final (v2).
//
// Decisión 2026-10-09 (Jorge): el cliente evalúa POR SEPARADO atención al
// cliente (secretaria/operaria) y servicio técnico. Cualquiera de las dos
// secciones es opcional de forma independiente, pero al menos UNA debe
// completarse para habilitar el envío. El cliente NO suministra identidad del
// técnico/secretaria — la atribución la deriva el servidor desde el doc de la
// orden (`tecnicoId`, `metadatosCita.responsableAtencionId`) y la graba en
// `evaluacionServicio.participantes`.

const categoriasAtencion = [
  ['puntualidad', 'Nos respondieron a tiempo'],
  ['trato', 'Nos trataron con amabilidad'],
  ['claridad', 'Nos explicaron con claridad'],
] as const;

const categoriasTecnico = [
  ['puntualidad', 'Llegó a tiempo a la visita'],
  ['trato', 'Fue respetuoso y cortés'],
  ['claridad', 'Explicó qué hizo y por qué'],
  ['calidad', 'El trabajo quedó bien hecho'],
] as const;

type Scores = Record<string, number>;

export default function EvaluacionServicio({ token, onEnviado }: { token: string; onEnviado: () => void }) {
  const [atencion, setAtencion] = useState<Scores>({});
  const [tecnico, setTecnico] = useState<Scores>({});
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const ocupado = useRef(false);

  const atencionCompleta = useMemo(
    () => categoriasAtencion.every(([k]) => typeof atencion[k] === 'number'),
    [atencion],
  );
  const atencionIniciada = useMemo(
    () => Object.keys(atencion).length > 0,
    [atencion],
  );
  const tecnicoCompleto = useMemo(
    () => categoriasTecnico.every(([k]) => typeof tecnico[k] === 'number'),
    [tecnico],
  );
  const tecnicoIniciado = useMemo(() => Object.keys(tecnico).length > 0, [tecnico]);

  const atencionIncompleta = atencionIniciada && !atencionCompleta;
  const tecnicoIncompleto = tecnicoIniciado && !tecnicoCompleto;
  const hayAlgoCompleto = atencionCompleta || tecnicoCompleto;
  const puedeEnviar = hayAlgoCompleto && !atencionIncompleta && !tecnicoIncompleto;

  async function enviar() {
    if (ocupado.current || !puedeEnviar) return;
    ocupado.current = true;
    setEnviando(true);
    setError('');
    try {
      const appCheck = await obtenerAppCheckToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (appCheck) headers['X-Firebase-AppCheck'] = appCheck;
      const evaluacion: { atencion?: Scores; tecnico?: Scores } = {};
      if (atencionCompleta) evaluacion.atencion = atencion;
      if (tecnicoCompleto) evaluacion.tecnico = tecnico;
      const response = await fetch(`/api/feedback/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ evaluacion, comentario: comentario.trim() }),
      });
      if (response.ok || response.status === 409) onEnviado();
      else setError('No pudimos guardar tu evaluación. Intenta de nuevo.');
    } catch {
      setError('Revisa tu conexión e intenta de nuevo.');
    } finally {
      ocupado.current = false;
      setEnviando(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-label="Evaluación del servicio">
      <h2 className="text-lg font-semibold text-slate-900">¿Cómo fue tu experiencia?</h2>
      <p className="mt-1 text-sm text-slate-600">
        Calificación de 1 (muy mala) a 5 (excelente). Puedes evaluar sólo la sección que quieras — atención al cliente, servicio técnico, o las dos.
      </p>
      <GrupoCategorias
        titulo="Atención al cliente"
        subtitulo="Secretaria u operaria que te atendió antes y después de la visita."
        categorias={categoriasAtencion}
        scores={atencion}
        onChange={setAtencion}
        disabled={enviando}
        incompleta={atencionIncompleta}
      />
      <GrupoCategorias
        titulo="Servicio técnico"
        subtitulo="Trabajo del técnico que fue a tu casa."
        categorias={categoriasTecnico}
        scores={tecnico}
        onChange={setTecnico}
        disabled={enviando}
        incompleta={tecnicoIncompleto}
      />
      <label className="mt-5 block text-sm font-medium text-slate-800">
        Comentario (opcional)
        <textarea
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          maxLength={500}
          disabled={enviando}
          className="mt-2 w-full rounded-xl border border-slate-300 p-3 text-base font-normal"
          rows={3}
        />
      </label>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {!hayAlgoCompleto && !atencionIncompleta && !tecnicoIncompleto && (
        <p className="mt-2 text-sm text-slate-500">Califica al menos una sección para enviar.</p>
      )}
      <button
        type="button"
        onClick={enviar}
        disabled={enviando || !puedeEnviar}
        className="mt-4 min-h-11 w-full rounded-xl bg-blue-600 px-4 py-3 font-medium text-white disabled:opacity-50"
      >
        {enviando ? 'Guardando…' : 'Enviar evaluación'}
      </button>
    </section>
  );
}

function GrupoCategorias({
  titulo,
  subtitulo,
  categorias,
  scores,
  onChange,
  disabled,
  incompleta,
}: {
  titulo: string;
  subtitulo: string;
  categorias: ReadonlyArray<readonly [string, string]>;
  scores: Scores;
  onChange: (next: Scores) => void;
  disabled: boolean;
  incompleta: boolean;
}) {
  const iniciada = Object.keys(scores).length > 0;
  return (
    <div className="mt-5 border-t border-slate-100 pt-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">{titulo}</h3>
          <p className="text-xs text-slate-500">{subtitulo}</p>
        </div>
        {iniciada && (
          <button
            type="button"
            onClick={() => onChange({})}
            disabled={disabled}
            className="shrink-0 text-xs text-slate-500 underline hover:text-slate-800"
          >
            Prefiero no evaluar
          </button>
        )}
      </div>
      <div className="mt-3 space-y-4">
        {categorias.map(([key, label]) => (
          <fieldset key={key} disabled={disabled}>
            <legend className="mb-2 text-sm font-medium text-slate-800">{label}</legend>
            <div className="grid grid-cols-5 gap-2">
              {[1, 2, 3, 4, 5].map((value) => (
                <label
                  key={value}
                  className={`flex min-h-11 cursor-pointer items-center justify-center rounded-xl border ${
                    scores[key] === value
                      ? 'border-blue-600 bg-blue-50 text-blue-800'
                      : 'border-slate-200 text-slate-700'
                  } focus-within:ring-2 focus-within:ring-blue-500`}
                >
                  <input
                    className="sr-only"
                    type="radio"
                    name={`${titulo}-${key}`}
                    value={value}
                    checked={scores[key] === value}
                    onChange={() => onChange({ ...scores, [key]: value })}
                    aria-label={`${titulo} — ${label}: ${value} de 5`}
                  />
                  {value}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
      {incompleta && (
        <p role="alert" className="mt-2 text-xs text-amber-700">
          Si vas a evaluar esta sección, elige puntaje en todas las categorías o usa “Prefiero no evaluar” para omitirla.
        </p>
      )}
    </div>
  );
}
