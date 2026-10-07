/**
 * mapa-fixture.ts — datos SIMULADOS para ejercitar el módulo Mapa de operaciones
 * sin tocar Firestore ni Google Maps. Todos los nombres llevan el prefijo
 * «QA ·» para que sea evidente que no son clientes reales.
 *
 * Uso: ver `mapa-preview.tsx`. El fixture ya devuelve órdenes filtradas al día
 * de hoy y mañana, y expone un helper `fixtureParaRango(desde,hasta)` para que
 * el preview emule el comportamiento del hook — fundamental para QA Mañana.
 */
import type { Calendario, Cliente, OrdenServicio, Personal, StandbyPieza, UbicacionVehiculo } from '../../src/types';
import type { MapaFixture } from '../../src/hooks/useMapaDatos';

const QA = 'QA · ';
const base = new Date();
base.setHours(10, 0, 0, 0);

const minutos = (b: Date, m: number) => { const d = new Date(b); d.setMinutes(d.getMinutes() + m); return d; };
const horas = (b: Date, h: number) => { const d = new Date(b); d.setHours(d.getHours() + h); return d; };
const dias = (b: Date, n: number) => { const r = new Date(b); r.setDate(r.getDate() + n); return r; };

const personal: Personal[] = [
  {
    id: 'p-qa-reyes', uid: 'uid-qa-reyes', nombre: `${QA}Reyes Simulado`,
    rol: 'tecnico', activo: true, disponibilidad: true, color: '#2563eb',
    operariaId: 'uid-qa-wila', operariaNombre: 'Wila Simulada',
    especialidad: 'nevera',
  },
  {
    id: 'p-qa-diorky', uid: 'uid-qa-diorky', nombre: `${QA}Diorky Simulado`,
    rol: 'tecnico', activo: true, disponibilidad: true, color: '#059669',
    operariaId: 'uid-qa-wila', operariaNombre: 'Wila Simulada',
    especialidad: 'lavadora',
  },
  {
    id: 'p-qa-yoniel', uid: 'uid-qa-yoniel', nombre: `${QA}Yoniel Simulado`,
    rol: 'tecnico', activo: true, disponibilidad: true, color: '#b45309',
    operariaId: 'uid-qa-yohana', operariaNombre: 'Yohana Simulada',
    especialidad: 'aire',
  },
  // Técnico inactivo (debe filtrarse en la UI)
  {
    id: 'p-qa-inactivo', uid: 'uid-qa-inactivo', nombre: `${QA}Inactivo Simulado`,
    rol: 'tecnico', activo: false, disponibilidad: false, color: '#9ca3af',
    operariaId: 'uid-qa-wila', operariaNombre: 'Wila Simulada',
    especialidad: 'nevera',
  },
];

const clientes: Cliente[] = [
  {
    id: 'c-qa-genesis', nombre: `${QA}Génesis Simulada`,
    telefono: '8095550000', direccion: 'Av. Simulación 1, Santo Domingo',
    sector: 'Naco', zona: 'Santo Domingo', createdAt: new Date(),
    lat: 18.4700, lng: -69.9400,
    direcciones: [
      { id: 'da1', etiqueta: 'Oficina', direccion: 'Calle Simulación 2', lat: 18.4780, lng: -69.9450 },
    ],
  },
  {
    id: 'c-qa-carla', nombre: `${QA}Carla Simulada`,
    telefono: '8095550001', direccion: 'Calle Simulación 3, Piantini',
    sector: 'Piantini', zona: 'Santo Domingo', createdAt: new Date(),
    lat: 18.4710, lng: -69.9450,
  },
  {
    id: 'c-qa-luis', nombre: `${QA}Luis Simulado`,
    telefono: '8095550002', direccion: 'Dirección sin coordenadas',
    sector: 'Villa Mella', zona: 'Santo Domingo', createdAt: new Date(),
  },
];

const baseOrden = (over: Partial<OrdenServicio>): OrdenServicio => ({
  id: 'auto',
  numero: 'QA-ENSAYO-X',
  clienteId: 'c-qa-genesis',
  clienteNombre: `${QA}Génesis Simulada`,
  clienteTelefono: '8095550000',
  clienteDireccion: 'Av. Simulación 1, Santo Domingo',
  clienteLat: 18.4700,
  clienteLng: -69.9400,
  equipoTipo: 'Nevera',
  equipoMarca: 'LG',
  equipoModelo: 'French door',
  descripcionFalla: 'QA · falla simulada',
  tecnicoId: 'uid-qa-reyes',
  tecnicoNombre: `${QA}Reyes Simulado`,
  fase: 'agendado',
  estadoSimple: 'pendiente',
  estado: 'activo',
  fechaCita: base,
  duracionMin: 60,
  historialFases: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

/** Todas las órdenes simuladas, incluyendo las de HOY, MAÑANA y backlog. */
const todas: OrdenServicio[] = [
  // Hoy
  baseOrden({ id: 'o-qa-hoy-1', numero: 'QA-OS-H1', fechaCita: base }),
  baseOrden({ id: 'o-qa-hoy-2', numero: 'QA-OS-H2',
    clienteId: 'c-qa-carla', clienteNombre: `${QA}Carla Simulada`,
    clienteLat: 18.4710, clienteLng: -69.9450,
    fechaCita: minutos(base, 90), fase: 'en_diagnostico',
    tecnicoId: 'uid-qa-reyes', tecnicoNombre: `${QA}Reyes Simulado`,
  }),
  baseOrden({ id: 'o-qa-hoy-3', numero: 'QA-OS-H3',
    clienteLat: 18.4800, clienteLng: -69.9500,
    fechaCita: minutos(base, 180),
    tecnicoId: 'uid-qa-yoniel', tecnicoNombre: `${QA}Yoniel Simulado`,
  }),
  baseOrden({ id: 'o-qa-hoy-4', numero: 'QA-OS-H4',
    clienteId: 'c-qa-luis', clienteNombre: `${QA}Luis Simulado`,
    clienteLat: undefined, clienteLng: undefined,
    fechaCita: minutos(base, 240),
    tecnicoId: 'uid-qa-diorky', tecnicoNombre: `${QA}Diorky Simulado`,
  }),
  baseOrden({ id: 'o-qa-hoy-5', numero: 'QA-OS-H5',
    clienteLat: 18.4650, clienteLng: -69.9550,
    fechaCita: horas(base, -2), fase: 'garantia_reclamada',
    tecnicoId: 'uid-qa-diorky', tecnicoNombre: `${QA}Diorky Simulado`,
  }),
  // Mañana
  baseOrden({ id: 'o-qa-mn-1', numero: 'QA-OS-M1',
    fechaCita: dias(base, 1), tecnicoId: 'uid-qa-reyes',
  }),
  baseOrden({ id: 'o-qa-mn-2', numero: 'QA-OS-M2',
    clienteLat: 18.4700, clienteLng: -69.9420,
    fechaCita: minutos(dias(base, 1), 120),
    tecnicoId: 'uid-qa-yoniel',
  }),
  // Backlog (pendiente anterior)
  baseOrden({
    id: 'o-qa-prev-reyes', numero: 'QA-OS-PREV-1',
    clienteNombre: `${QA}Pendiente Previo`,
    fechaCita: dias(base, -5),
    fase: 'en_cotizacion', motivoChequeo: 'Esperando aprobación cliente',
    tecnicoId: 'uid-qa-reyes',
  }),
];

const gps: UbicacionVehiculo[] = [
  {
    vehiculoId: 'v-qa-reyes', tecnicoId: 'uid-qa-reyes', tecnicoNombre: `${QA}Reyes Simulado`,
    lat: 18.4720, lng: -69.9410, velocidad: 32, rumbo: 90,
    timestamp: minutos(new Date(), -2), enMovimiento: true,
  },
  {
    vehiculoId: 'v-qa-yoniel', tecnicoId: 'uid-qa-yoniel', tecnicoNombre: `${QA}Yoniel Simulado`,
    lat: 18.4600, lng: -69.9600, velocidad: 0, rumbo: 0,
    timestamp: minutos(new Date(), -22), enMovimiento: false,
  },
];

const standby: StandbyPieza[] = [
  {
    id: 'sb-qa-1', ordenId: 'o-qa-prev-reyes',
    clienteNombre: `${QA}Pendiente Previo`,
    equipoTipo: 'Nevera', equipoMarca: 'LG',
    piezaFaltante: 'Compresor',
    fechaInicio: dias(new Date(), -8),
    estado: 'buscando',
    createdAt: dias(new Date(), -8),
  },
];

function enRango(o: OrdenServicio, desde: Date, hasta: Date): boolean {
  if (!o.fechaCita) return false;
  return o.fechaCita.getTime() >= desde.getTime() && o.fechaCita.getTime() < hasta.getTime();
}

/**
 * Devuelve el fixture tal como lo devolvería el hook real para el rango dado.
 * Reproduce la condición: `ordenes_servicio where fechaCita in [desde, fin)`.
 */
export function fixtureParaRango(desde: Date | null, fin: Date | null): MapaFixture {
  const abiertosAnteriores: Record<string, OrdenServicio[]> = {};
  const backlogReyes = todas.filter((o) => o.tecnicoId === 'uid-qa-reyes' && (!o.fechaCita || !fin || o.fechaCita.getTime() < (desde?.getTime() ?? 0)) && o.fase !== 'cerrado' && o.fase !== 'cancelado');
  if (backlogReyes.length) abiertosAnteriores['uid-qa-reyes'] = backlogReyes;
  // El canonicalizador en el hook también mapea docId → uid, así que alias:
  abiertosAnteriores['p-qa-reyes'] = backlogReyes;
  const ordenes = desde && fin ? todas.filter((o) => enRango(o, desde, fin)) : [];
  return {
    ordenes,
    personal,
    gps,
    clientes,
    standby,
    abiertosAnteriores,
  };
}

/**
 * Fixture COMPLETO: pasa todas las órdenes (hoy, mañana, backlog) al hook y
 * deja que el hook filtre por rango igual que la query real. Es el que usa
 * el preview — así los atajos Mañana/Semana/Mes dentro de `BarraFiltros`
 * ejercitan al hook de verdad y no un snapshot aparte.
 */
export const fixtureCompleto: MapaFixture = {
  ordenes: todas,
  personal,
  gps,
  clientes,
  standby,
  abiertosAnteriores: {
    ...Object.fromEntries(personal.flatMap(p => [p.id, p.uid].filter(Boolean).map(id => [id, []]))),
    'uid-qa-reyes': todas.filter((o) => o.id === 'o-qa-prev-reyes'),
    'p-qa-reyes': todas.filter((o) => o.id === 'o-qa-prev-reyes'),
  },
};
Object.freeze(fixtureCompleto);

/** Fixture congelado al día de hoy (comportamiento legacy). */
export const mapaFixture: MapaFixture = {
  ordenes: todas.filter((o) => {
    if (!o.fechaCita) return false;
    const d = new Date(base);
    d.setHours(0, 0, 0, 0);
    const dFin = new Date(d);
    dFin.setDate(dFin.getDate() + 1);
    return o.fechaCita >= d && o.fechaCita < dFin;
  }),
  personal,
  gps,
  clientes,
  standby,
  abiertosAnteriores: {
    ...Object.fromEntries(personal.flatMap(p => [p.id, p.uid].filter(Boolean).map(id => [id, []]))),
    'uid-qa-reyes': todas.filter((o) => o.id === 'o-qa-prev-reyes'),
  },
};

Object.freeze(mapaFixture);

/**
 * Calendarios SIMULADOS para el preview de VistaSemana. Los nombres incluyen
 * «QA · ILUSTRATIVO» para que sea evidente que no son producción. En producción
 * los calendarios vienen de la colección `calendarios` real; este fixture solo
 * los expone al preview QA.
 */
export const calendariosFixture: Calendario[] = [
  {
    id: 'cal-qa-reyes',
    nombre: 'QA · ILUSTRATIVO · Reyes',
    asignadoId: 'uid-qa-reyes',
    asignadoNombre: 'QA · Reyes Simulado',
    color: '#2563eb',
    activo: true,
    dias: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'],
    horas: ['9:00 AM', '10:00 AM', '11:00 AM', '2:00 PM', '3:00 PM'],
    createdAt: new Date(),
  },
  {
    id: 'cal-qa-diorky',
    nombre: 'QA · ILUSTRATIVO · Diorky',
    asignadoId: 'uid-qa-diorky',
    asignadoNombre: 'QA · Diorky Simulado',
    color: '#059669',
    activo: true,
    dias: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'],
    horas: ['9:00 AM', '10:00 AM', '11:00 AM', '2:00 PM'],
    createdAt: new Date(),
  },
  {
    id: 'cal-qa-yoniel',
    nombre: 'QA · ILUSTRATIVO · Yoniel',
    asignadoId: 'uid-qa-yoniel',
    asignadoNombre: 'QA · Yoniel Simulado',
    color: '#b45309',
    activo: true,
    dias: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'],
    horas: ['9:00 AM', '10:00 AM', '11:00 AM'],
    createdAt: new Date(),
  },
];

