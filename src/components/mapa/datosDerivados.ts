/**
 * datosDerivados.ts — convierte datos reales a los tipos de `mapaOperaciones`
 * y agrupa por técnico+día usando RD (jamás mezcla días).
 *
 * Normalización crítica: `tecnicoId` persistido en la orden puede ser auth.uid
 * (post-SPRINT-105) o docId legacy de personal/. Para que todo caso coincida
 * contra `TecnicoMapa.id` (= `p.uid || p.id`), expone un helper
 * `canonicalizarTecnicoId(id)` basado en la tabla real de personal — nunca
 * usa startsWith/split, ni confía en coincidencias por nombre.
 */
import type { Cliente, OrdenServicio, Personal, StandbyPieza, UbicacionVehiculo } from '../../types';
import { citaDesdeOrden, posicionDesdeGPS, tecnicoDesdePersonal } from '../../utils/mapaAdaptadores';
import { tieneCoord } from '../../utils/geo';
import { componentesRD, inicioDiaRD } from '../../utils/mapaFechas';
import type { CitaMapa, PosicionGPS, TecnicoMapa } from '../../utils/mapaOperaciones';

export interface RutaTecnicoDia {
  /** Clave estable `${tecnicoId}|${YYYY-MM-DD}` */
  clave: string;
  tecnicoId: string;
  dia: string;
  diaInicio: Date;
  citas: CitaMapa[];
}

const diaClave = (d: Date) => {
  const c = componentesRD(d);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${c.anio}-${pad(c.mes + 1)}-${pad(c.dia)}`;
};

/**
 * Construye un `Map` que convierte CUALQUIER identificador que haya
 * terminado en `orden.tecnicoId` (docId legacy o uid) al identificador
 * canónico `uid || id` del personal.
 */
export function canonicalizadorTecnico(personal: Personal[]): (id: string | null | undefined) => string | null {
  const porAny = new Map<string, string>();
  for (const p of personal) {
    const canon = p.uid || p.id;
    if (!canon) continue;
    porAny.set(canon, canon);
    porAny.set(p.id, canon);
    if (p.uid) porAny.set(p.uid, canon);
  }
  return (id) => (id ? porAny.get(id) ?? id : null);
}

export function citasFromOrdenes(
  ordenes: OrdenServicio[],
  clientesPorId: Map<string, Cliente>,
  standbyAbiertosPorOrden: Map<string, StandbyPieza[]>,
  ahora: Date,
  canonicalizar: (id: string | null | undefined) => string | null,
): CitaMapa[] {
  const out: CitaMapa[] = [];
  for (const o of ordenes) {
    if (!o.fechaCita) continue;
    const coordsCliente = clientesPorId.get(o.clienteId);
    const standby = standbyAbiertosPorOrden.get(o.id);
    // Si no leímos aún `standby_piezas` (map vacío para esta orden), pasamos
    // `undefined` para que el adaptador use el campo real `enStandby` del
    // doc. Nunca pasamos `false` cuando desconocemos — eso borraría standby
    // existentes (hallazgo revisión BASE 2026-10-02).
    const standbyAbierto = standby && standby.length > 0 ? true : undefined;
    const cita = citaDesdeOrden(o, ahora, {
      coordsCliente: coordsCliente ? { lat: coordsCliente.lat, lng: coordsCliente.lng } : null,
      standbyAbierto,
    });
    if (!cita) continue;
    cita.tecnicoId = canonicalizar(cita.tecnicoId) ?? null;
    out.push(cita);
  }
  return out;
}

export function tecnicosFromPersonal(personal: Personal[]): TecnicoMapa[] {
  return personal
    .filter((p) => p.rol === 'tecnico' && p.activo !== false)
    .map(tecnicoDesdePersonal);
}

export function gpsPorTecnico(
  ubicaciones: UbicacionVehiculo[],
  canonicalizar: (id: string | null | undefined) => string | null,
): Map<string, PosicionGPS> {
  const m = new Map<string, PosicionGPS>();
  for (const u of ubicaciones) {
    const canon = canonicalizar(u.tecnicoId);
    if (!canon) continue;
    const pos = { ...posicionDesdeGPS(u), tecnicoId: canon };
    const prev = m.get(canon);
    const fecha = pos.timestamp.getTime();
    const anterior = prev?.timestamp.getTime();
    if (!prev || (Number.isFinite(fecha) && (!Number.isFinite(anterior) || fecha > anterior!))) m.set(canon, pos);
  }
  return m;
}

export function agruparRutasPorTecnicoYDia(citas: CitaMapa[]): RutaTecnicoDia[] {
  const grupos = new Map<string, RutaTecnicoDia>();
  for (const c of citas) {
    const tecnicoId = c.tecnicoId ?? '';
    const dia = diaClave(c.inicio);
    const clave = `${tecnicoId}|${dia}`;
    const g = grupos.get(clave);
    if (g) {
      g.citas.push(c);
    } else {
      grupos.set(clave, {
        clave, tecnicoId, dia, diaInicio: inicioDiaRD(c.inicio), citas: [c],
      });
    }
  }
  grupos.forEach((g) => g.citas.sort((a, b) => a.inicio.getTime() - b.inicio.getTime()));
  return [...grupos.values()];
}

export interface PuntoCliente {
  id: string;
  clienteId: string;
  lat: number;
  lng: number;
  etiqueta: string;
  nombre: string;
}

export function puntosCliente(clientes: Cliente[]): PuntoCliente[] {
  const out: PuntoCliente[] = [];
  for (const c of clientes) {
    if (tieneCoord(c)) {
      out.push({
        id: `c:${c.id}:main`,
        clienteId: c.id,
        lat: c.lat as number,
        lng: c.lng as number,
        etiqueta: 'Principal',
        nombre: c.nombre,
      });
    }
    (c.direcciones ?? []).forEach((d) => {
      if (tieneCoord(d)) {
        out.push({
          id: `c:${c.id}:${d.id}`,
          clienteId: c.id,
          lat: d.lat as number,
          lng: d.lng as number,
          etiqueta: d.etiqueta || 'Alterna',
          nombre: c.nombre,
        });
      }
    });
  }
  return out;
}

export function ordenesSinUbicacion(
  ordenes: OrdenServicio[],
  clientesPorId: Map<string, Cliente>,
): OrdenServicio[] {
  return ordenes.filter((o) => {
    const propia = { lat: o.clienteLat, lng: o.clienteLng };
    if (tieneCoord(propia)) return false;
    const c = clientesPorId.get(o.clienteId);
    return !tieneCoord(c ?? null);
  });
}

export function standbyPorOrden(piezas: StandbyPieza[]): Map<string, StandbyPieza[]> {
  const m = new Map<string, StandbyPieza[]>();
  for (const p of piezas) {
    if (!p.ordenId || p.estado === 'llego') continue;
    const l = m.get(p.ordenId);
    if (l) l.push(p);
    else m.set(p.ordenId, [p]);
  }
  return m;
}
