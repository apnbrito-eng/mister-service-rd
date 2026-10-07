import type { DiaTecnico } from './mapaOperaciones';
import { tieneCoord } from './geo';
import { distanciaTotalRuta, optimizarRuta } from './rutas';

/** Consulta local: no modifica citas, asignaciones ni tiempos calculados con Routes. */
export function recorridoPorCercania(paradas: DiaTecnico['paradas']) {
  const puntos = paradas
    .filter(p => !p.enStandby && !p.cita.progreso.standby && !p.cita.progreso.completa && p.estado !== 'hecha' && tieneCoord(p.cita))
    .map(p => ({ id: p.cita.id, lat: p.cita.lat as number, lng: p.cita.lng as number, nombre: p.cita.clienteNombre, inicio: p.cita.inicio }));
  const sugerido = optimizarRuta(puntos);
  return { puntos: sugerido, km: distanciaTotalRuta(sugerido) };
}

