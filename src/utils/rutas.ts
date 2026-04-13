/** Punto con coordenadas para optimización de ruta */
export interface PuntoRuta {
  id: string;
  lat: number;
  lng: number;
}

/** Distancia Haversine en km entre dos coordenadas */
export function calcularDistanciaKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Optimiza la ruta usando el algoritmo Nearest Neighbor.
 * Recibe un array de puntos con lat/lng y devuelve el array reordenado
 * para minimizar la distancia total recorrida.
 */
export function optimizarRuta<T extends PuntoRuta>(puntos: T[]): T[] {
  if (puntos.length <= 1) return [...puntos];

  const resultado: T[] = [];
  const pendientes = [...puntos];

  // Empezar con el primer punto
  let actual = pendientes.shift()!;
  resultado.push(actual);

  while (pendientes.length > 0) {
    let menorDistancia = Infinity;
    let indiceMasCercano = 0;

    for (let i = 0; i < pendientes.length; i++) {
      const dist = calcularDistanciaKm(
        actual.lat, actual.lng,
        pendientes[i].lat, pendientes[i].lng
      );
      if (dist < menorDistancia) {
        menorDistancia = dist;
        indiceMasCercano = i;
      }
    }

    actual = pendientes.splice(indiceMasCercano, 1)[0];
    resultado.push(actual);
  }

  return resultado;
}

/** Calcula distancia total de la ruta en km */
export function distanciaTotalRuta<T extends PuntoRuta>(puntos: T[]): number {
  let total = 0;
  for (let i = 1; i < puntos.length; i++) {
    total += calcularDistanciaKm(
      puntos[i - 1].lat, puntos[i - 1].lng,
      puntos[i].lat, puntos[i].lng
    );
  }
  return total;
}
