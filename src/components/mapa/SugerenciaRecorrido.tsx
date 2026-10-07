import { useMemo, useState } from 'react';
import type { DiaTecnico } from '../../utils/mapaOperaciones';
import { enlacesGoogleMaps, hora12 } from '../../utils/mapaOperaciones';
import type { LatLng } from '../../utils/geo';
import { recorridoPorCercania } from '../../utils/recorridoMapa';

export default function SugerenciaRecorrido({ paradas, origen }: { paradas: DiaTecnico['paradas']; origen: LatLng | null }) {
  const [abierto, setAbierto] = useState(false);
  const recorrido = useMemo(() => recorridoPorCercania(paradas), [paradas]);
  if (recorrido.puntos.length < 2) return null;
  const enlaces = enlacesGoogleMaps(origen, recorrido.puntos);
  return <section className="mt-3 rounded-md border border-gray-200 bg-white p-2">
    <button type="button" aria-expanded={abierto} onClick={() => setAbierto(!abierto)} className="min-h-[44px] text-left text-sm font-medium text-brand-700">Sugerir recorrido por cercanía</button>
    {abierto && <div>
      <p className="mb-2 text-xs text-gray-600">Sugerencia desde la primera cita pendiente, por cercanía entre ubicaciones. No cambia la agenda ni las horas acordadas. Comprueba su viabilidad antes de usarla.</p>
      <p className="mb-2 text-xs text-gray-600">{recorrido.km.toFixed(1)} km aproximados en línea recta entre paradas; las distancias por calles pueden ser distintas.</p>
      <ol aria-label="Recorrido sugerido" className="list-inside list-decimal space-y-2 text-sm">
        {recorrido.puntos.map(p => <li key={p.id}>{p.nombre} · cita {hora12(p.inicio)}</li>)}
      </ol>
      <div className="mt-2 grid gap-2">{enlaces.map((url, i) => <a key={url} href={url} target="_blank" rel="noreferrer" className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-gray-200 text-sm text-brand-700">Abrir recorrido sugerido · tramo {i + 1}</a>)}</div>
    </div>}
  </section>;
}
