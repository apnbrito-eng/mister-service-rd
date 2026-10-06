import { equipoApi } from './equipoApi';
import { tramoEstimado, type Tramo } from '../utils/mapaOperaciones';
import { tieneCoord, type LatLng } from '../utils/geo';

export interface RutaGoogle {
  fuente: 'google';
  calculadoEn: number;
  tramos: { km: number; min: number }[];
  polilinea: string | null;
}
export type RespuestaRuta = RutaGoogle | { fuente: 'estimado'; tramos: null; motivo?: string };
const enVuelo = new Map<string, Promise<RespuestaRuta>>();
/** Solo deduplica solicitudes simultáneas. El resultado vive en la vista actual;
 * no se almacena contenido de Routes en Firestore, localStorage ni cachés persistentes. */
export async function consultarRuta(puntos: LatLng[], trafico = false): Promise<RespuestaRuta> {
  if (puntos.length < 2 || puntos.length > 9 || !puntos.every(tieneCoord)) return { fuente: 'estimado', tramos: null, motivo: 'puntos_invalidos' };
  const id = JSON.stringify({ puntos, trafico });
  const actual = enVuelo.get(id);
  if (actual) return actual;
  const solicitud = (async (): Promise<RespuestaRuta> => {
    try {
      const r = await equipoApi<RespuestaRuta>('/api/mapa/tiempos', { puntos, trafico });
      if (r?.fuente === 'estimado') return {
        fuente: 'estimado', tramos: null,
        ...(typeof r.motivo === 'string' ? { motivo: r.motivo } : {}),
      };
      if (r.fuente !== 'google' || !Array.isArray(r.tramos) || r.tramos.length !== puntos.length - 1 ||
        !r.tramos.every(t => Number.isFinite(t.km) && t.km >= 0 && Number.isFinite(t.min) && t.min >= 0) ||
        !Number.isFinite(r.calculadoEn)) return { fuente: 'estimado', tramos: null };
      return r;
    } catch { return { fuente: 'estimado', tramos: null, motivo: 'no_disponible' }; }
    finally { enVuelo.delete(id); }
  })();
  enVuelo.set(id, solicitud);
  return solicitud;
}
/** Vincula resultados al trayecto exacto consultado, nunca al tráfico de otro día.
 * Al vencer la consulta, conserva la etiqueta estimada del cálculo local. */
export function tramoDeRuta(puntos: LatLng[], resultado: RespuestaRuta, trafico = false): Tramo {
  return (a, b) => {
    const edad = resultado.fuente === 'google' ? Date.now() - resultado.calculadoEn : Infinity;
    const indices = puntos.flatMap((p, i) => p.lat === a.lat && p.lng === a.lng && puntos[i + 1]?.lat === b.lat && puntos[i + 1]?.lng === b.lng ? [i] : []);
    // La interfaz de proyección recibe coordenadas, no índice de parada: una pareja
    // repetida puede tener tiempos distintos. No atribuirle el primer tramo de Google.
    const i = indices.length === 1 ? indices[0] : -1;
    if (resultado.fuente === 'google' && edad >= 0 && edad <= (trafico ? 10 : 30) * 60_000 && i >= 0 && resultado.tramos[i]) {
      return { ...resultado.tramos[i], fuente: 'google' };
    }
    return tramoEstimado(a, b);
  };
}
