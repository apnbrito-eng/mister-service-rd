/**
 * useMapaDatos.ts — datos reales para el módulo Mapa de operaciones.
 *
 * - Rango RD en zona Santo Domingo. Si el rango es inválido (NaN/Infinity, fin
 *   ≤ inicio) el hook NO consulta y limpia resultados stale.
 * - Órdenes del rango por `onSnapshot`. Clientes, GPS y standby se activan
 *   bajo demanda. Al revocar permisos (o apagar la capa) se vacían todos los
 *   datos derivados — nunca queda información del perfil anterior visible.
 * - Abiertos anteriores por técnico: query por `tecnicoId in [canonico, docId]`.
 *   Cada carga lleva un `epoch`; si el rango o los permisos cambian, respuestas
 *   tardías se descartan.
 * - Standby real: Firestore Timestamp → Date (conversión en el adaptador local
 *   `hidratarStandby`) para que las fichas consuman `Date` sin romper.
 * - Refrescar backlog: entra por un `useRef` que ve el estado actual en cada
 *   invocación — nunca por una closure capturada.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  collection, onSnapshot, query, where, getDocs, documentId, Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import type { Cliente, OrdenServicio, Personal, StandbyPieza, UbicacionVehiculo } from '../types';
import { parseCliente, parseOrden } from '../utils';
import { suscribirTodasUbicaciones } from '../services/gps.service';
import { tieneCoord } from '../utils/geo';

export interface RangoFechas {
  /** 00:00 RD del día `desde`. Si falta o inválido, no se consulta. */
  inicio: Date | null;
  /** 00:00 RD del día SIGUIENTE a `hasta` (exclusivo). */
  fin: Date | null;
}

export interface PermisosMapa {
  ordenesVer: boolean;
  clientesVer: boolean;
  personalVer: boolean;
  gpsVer: boolean;
}

export interface MapaFixture {
  /** Órdenes totales en el fixture — el hook filtra por el `rango` activo igual que la query real. */
  ordenes: OrdenServicio[];
  personal: Personal[];
  gps: UbicacionVehiculo[];
  clientes: Cliente[];
  standby?: StandbyPieza[];
  abiertosAnteriores?: Record<string, OrdenServicio[]>;
}

export interface EstadoAbiertosTecnico {
  cargando: boolean;
  error: string | null;
  ordenes: OrdenServicio[];
}

export interface MapaDatos {
  ordenes: OrdenServicio[];
  personal: Personal[];
  gps: UbicacionVehiculo[];
  clientes: Cliente[];
  standby: StandbyPieza[];
  cargandoOrdenes: boolean;
  cargandoPersonal: boolean;
  cargandoClientes: boolean;
  cargandoGps: boolean;
  cargandoStandby: boolean;
  errorOrdenes: string | null;
  errorPersonal: string | null;
  errorClientes: string | null;
  errorGps: string | null;
  errorStandby: string | null;
  cargarClientes: () => void;
  descartarClientes: () => void;
  activarGps: () => void;
  desactivarGps: () => void;
  abiertosAnterioresPorTecnico: Record<string, EstadoAbiertosTecnico>;
  cargarAbiertosAnterioresPara: (tecnicoIds: string[]) => void;
  refrescarAbiertosAnterioresPara: (tecnicoId: string) => void;
  clientesReferenciados: Map<string, Cliente>;
  usandoFixture: boolean;
}

const PERMISOS_DEFAULT: PermisosMapa = {
  ordenesVer: true, clientesVer: true, personalVer: true, gpsVer: true,
};

const asArrayUnico = <T>(xs: T[]): T[] => {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const x of xs) if (!seen.has(x)) { seen.add(x); out.push(x); }
  return out;
};

function chunks<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

export function filtrarFixturePorRango(fixture: MapaFixture, inicioMs: number | null, finMs: number | null): OrdenServicio[] {
  if (inicioMs === null || finMs === null || !Number.isFinite(inicioMs) || !Number.isFinite(finMs) || finMs <= inicioMs) return [];
  return fixture.ordenes.filter((o) => {
    if (o.eliminada) return false;
    const t = o.fechaCita?.getTime();
    if (typeof t !== 'number' || !Number.isFinite(t)) return false;
    return t >= inicioMs && t < finMs;
  });
}

/** Convierte un doc raw de `standby_piezas` a `StandbyPieza` con `Date` reales. */
function hidratarStandby(id: string, raw: Record<string, unknown>): StandbyPieza {
  const asDate = (v: unknown): Date | null => {
    if (!v) return null;
    if (v instanceof Date) return v;
    const maybe = v as { toDate?: () => Date };
    if (typeof maybe?.toDate === 'function') return maybe.toDate();
    if (typeof v === 'string' || typeof v === 'number') {
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    return null;
  };
  const fechaInicio = asDate(raw.fechaInicio) ?? new Date();
  const createdAt = asDate(raw.createdAt) ?? fechaInicio;
  return {
    id,
    ordenId: typeof raw.ordenId === 'string' ? raw.ordenId : undefined,
    clienteNombre: typeof raw.clienteNombre === 'string' ? raw.clienteNombre : '',
    equipoTipo: typeof raw.equipoTipo === 'string' ? raw.equipoTipo : '',
    equipoMarca: typeof raw.equipoMarca === 'string' ? raw.equipoMarca : '',
    piezaFaltante: typeof raw.piezaFaltante === 'string' ? raw.piezaFaltante : '',
    tecnicoNombre: typeof raw.tecnicoNombre === 'string' ? raw.tecnicoNombre : undefined,
    fechaInicio,
    estado: (raw.estado as StandbyPieza['estado']) ?? 'buscando',
    notas: typeof raw.notas === 'string' ? raw.notas : undefined,
    createdAt,
  };
}

export function useMapaDatos(
  rango: RangoFechas,
  permisos: PermisosMapa = PERMISOS_DEFAULT,
  fixture?: MapaFixture | null,
): MapaDatos {
  const inicioMs = rango.inicio?.getTime() ?? null;
  const finMs = rango.fin?.getTime() ?? null;
  const rangoValido =
    inicioMs !== null && finMs !== null &&
    Number.isFinite(inicioMs) && Number.isFinite(finMs) &&
    finMs > inicioMs;

  const [ordenes, setOrdenes] = useState<OrdenServicio[]>(() =>
    fixture ? filtrarFixturePorRango(fixture, inicioMs, finMs) : [],
  );
  const [personal, setPersonal] = useState<Personal[]>(fixture?.personal ?? []);
  const [gps, setGps] = useState<UbicacionVehiculo[]>(fixture?.gps ?? []);
  const [clientes, setClientes] = useState<Cliente[]>(fixture?.clientes ?? []);
  const [standby, setStandby] = useState<StandbyPieza[]>(fixture?.standby ?? []);
  const [clientesReferenciados, setClientesReferenciados] = useState<Map<string, Cliente>>(() => {
    const m = new Map<string, Cliente>();
    (fixture?.clientes ?? []).forEach((c) => m.set(c.id, c));
    return m;
  });
  const [cargandoOrdenes, setCargandoOrdenes] = useState<boolean>(!fixture && permisos.ordenesVer);
  const [cargandoPersonal, setCargandoPersonal] = useState<boolean>(!fixture && permisos.personalVer);
  const [cargandoClientes, setCargandoClientes] = useState(false);
  const [cargandoGps, setCargandoGps] = useState(false);
  const [cargandoStandby, setCargandoStandby] = useState(false);
  const [errorOrdenes, setErrorOrdenes] = useState<string | null>(null);
  const [errorPersonal, setErrorPersonal] = useState<string | null>(null);
  const [errorClientes, setErrorClientes] = useState<string | null>(null);
  const [errorGps, setErrorGps] = useState<string | null>(null);
  const [errorStandby, setErrorStandby] = useState<string | null>(null);
  const [abiertosPorTec, setAbiertosPorTec] = useState<Record<string, EstadoAbiertosTecnico>>(
    () => {
      const base: Record<string, EstadoAbiertosTecnico> = {};
      Object.entries(fixture?.abiertosAnteriores ?? {}).forEach(([k, v]) => {
        base[k] = { cargando: false, error: null, ordenes: v };
      });
      return base;
    },
  );
  const [clientesActivos, setClientesActivos] = useState(false);
  const [gpsActivo, setGpsActivo] = useState(false);

  // Épocas monotónicas para descartar respuestas tardías tras cambios.
  const epocaBacklog = useRef(0);
  const epocaStandby = useRef(0);
  const epocaFallbackClientes = useRef(0);
  const abiertosEnVuelo = useRef<Set<string>>(new Set());
  const abiertosConsultados = useRef(new Set<string>());
  const versionSolicitud = useRef(new Map<string, number>());

  // Si cambian rango, permisos.ordenesVer o fixture, suben las épocas: cualquier
  // respuesta tardía se detecta por mismatch y se descarta.
  useEffect(() => {
    epocaBacklog.current += 1;
    epocaStandby.current += 1;
    abiertosConsultados.current.clear();
    abiertosEnVuelo.current.clear();
    return () => { epocaBacklog.current += 1; epocaStandby.current += 1; };
  }, [inicioMs, finMs, fixture, permisos.ordenesVer]);
  useEffect(() => { epocaFallbackClientes.current += 1; }, [inicioMs, finMs, permisos.clientesVer, fixture]);

  // Fixture ↔ rango
  useEffect(() => {
    if (!fixture) return;
    setOrdenes(filtrarFixturePorRango(fixture, inicioMs, finMs));
  }, [fixture, inicioMs, finMs]);

  // Suscripción al rango de órdenes
  useEffect(() => {
    if (fixture) return;
    if (!permisos.ordenesVer) {
      setOrdenes([]);
      setCargandoOrdenes(false);
      setErrorOrdenes(null);
      return;
    }
    if (!rangoValido || inicioMs === null || finMs === null) {
      setOrdenes([]);
      setCargandoOrdenes(false);
      setErrorOrdenes(null);
      return;
    }
    setCargandoOrdenes(true);
    setErrorOrdenes(null);
    setOrdenes([]);
    const q = query(
      collection(db, 'ordenes_servicio'),
      where('fechaCita', '>=', Timestamp.fromMillis(inicioMs)),
      where('fechaCita', '<', Timestamp.fromMillis(finMs)),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const lista = snap.docs
          .map((d) => parseOrden(d.id, d.data() as Record<string, unknown>))
          .filter((o) => !o.eliminada);
        setOrdenes(lista);
        setCargandoOrdenes(false);
      },
      (err) => {
        console.error('[useMapaDatos] ordenes_servicio error', err);
        setErrorOrdenes(err.message || 'Error al cargar órdenes');
        setOrdenes([]);
        setCargandoOrdenes(false);
      },
    );
    return () => unsub();
  }, [inicioMs, finMs, rangoValido, permisos.ordenesVer, fixture]);

  // Al revocar permisos → vaciar TODO lo que dependía de ellos (datos y errores).
  useEffect(() => {
    if (!permisos.ordenesVer) {
      setAbiertosPorTec({});
      setStandby([]);
      setErrorStandby(null);
      setCargandoStandby(false);
      abiertosEnVuelo.current.clear();
    }
  }, [permisos.ordenesVer]);

  useEffect(() => {
    if (!permisos.clientesVer) {
      setClientes([]);
      setErrorClientes(null);
      setCargandoClientes(false);
      setClientesReferenciados(new Map());
    }
  }, [permisos.clientesVer]);

  useEffect(() => {
    if (!permisos.gpsVer) {
      setGps([]);
      setErrorGps(null);
      setCargandoGps(false);
    }
  }, [permisos.gpsVer]);

  // Personal
  useEffect(() => {
    if (fixture) return;
    if (!permisos.personalVer) {
      setPersonal([]);
      setCargandoPersonal(false);
      setErrorPersonal(null);
      return;
    }
    setCargandoPersonal(true);
    setErrorPersonal(null);
    const unsub = onSnapshot(collection(db, 'personal'), (snap) => {
      setPersonal(snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) } as Personal)));
      setCargandoPersonal(false);
    }, (err) => {
      console.error('[useMapaDatos] personal error', err);
      setErrorPersonal(err.message || 'Error al cargar personal');
      setPersonal([]);
      setCargandoPersonal(false);
    });
    return () => unsub();
  }, [permisos.personalVer, fixture]);

  // GPS lazy
  useEffect(() => {
    if (fixture) return;
    if (!permisos.gpsVer || !gpsActivo) {
      if (!gpsActivo) {
        setGps([]);
        setCargandoGps(false);
        setErrorGps(null);
      }
      return;
    }
    setCargandoGps(true);
    setErrorGps(null);
    const unsub = suscribirTodasUbicaciones((u) => {
      setGps(u);
      setCargandoGps(false);
    }, (err) => {
      console.error('[useMapaDatos] gps error', err);
      setErrorGps(err?.message || 'No se pudo cargar ubicaciones.');
      setGps([]);
      setCargandoGps(false);
    });
    return () => unsub();
  }, [gpsActivo, permisos.gpsVer, fixture]);

  // Clientes capa completa (lazy)
  useEffect(() => {
    if (fixture) return;
    if (!permisos.clientesVer || !clientesActivos) {
      if (!clientesActivos) {
        setClientes([]);
        setCargandoClientes(false);
        setErrorClientes(null);
      }
      return;
    }
    setCargandoClientes(true);
    setErrorClientes(null);
    const unsub = onSnapshot(collection(db, 'clientes'), (snap) => {
      const lista = snap.docs
        .filter((d) => (d.data() as { eliminado?: boolean }).eliminado !== true)
        .map((d) => parseCliente(d.id, d.data() as Record<string, unknown>));
      setClientes(lista);
      setCargandoClientes(false);
    }, (err) => {
      console.error('[useMapaDatos] clientes error', err);
      setErrorClientes(err.message || 'Error al cargar clientes');
      setClientes([]);
      setCargandoClientes(false);
    });
    return () => unsub();
  }, [clientesActivos, permisos.clientesVer, fixture]);

  // Fallback dirigido: clientes referenciados por órdenes del rango SIN coords propias.
  const necesitanClienteIds = useMemo(() => {
    if (fixture) return [] as string[];
    if (!permisos.clientesVer) return [];
    const faltan = new Set<string>();
    for (const o of ordenes) {
      const propia = { lat: o.clienteLat, lng: o.clienteLng };
      if (!tieneCoord(propia) && o.clienteId) faltan.add(o.clienteId);
    }
    if (clientesActivos) {
      const yaCargados = new Set(clientes.map((c) => c.id));
      for (const id of yaCargados) faltan.delete(id);
    }
    for (const id of clientesReferenciados.keys()) faltan.delete(id);
    return [...faltan];
  }, [ordenes, clientes, clientesActivos, permisos.clientesVer, clientesReferenciados, fixture]);

  useEffect(() => {
    if (fixture) return;
    if (!permisos.clientesVer) return;
    if (!necesitanClienteIds.length) return;
    const miEpoca = epocaFallbackClientes.current;
    let cancelado = false;
    (async () => {
      try {
        const resultados: Cliente[] = [];
        for (const grupo of chunks(necesitanClienteIds, 10)) {
          const q = query(collection(db, 'clientes'), where(documentId(), 'in', grupo));
          const snap = await getDocs(q);
          snap.docs.forEach((d) => {
            if ((d.data() as { eliminado?: boolean }).eliminado === true) return;
            resultados.push(parseCliente(d.id, d.data() as Record<string, unknown>));
          });
        }
        if (cancelado || miEpoca !== epocaFallbackClientes.current) return;
        setClientesReferenciados((prev) => {
          const next = new Map(prev);
          for (const c of resultados) next.set(c.id, c);
          return next;
        });
      } catch (err) {
        console.error('[useMapaDatos] fallback clientes error', err);
      }
    })();
    return () => { cancelado = true; };
  }, [necesitanClienteIds, permisos.clientesVer, fixture]);

  // Standby real con `fechaInicio`/`createdAt` como Date.
  const ordenIdsVigentes = useMemo(() => {
    const ids = new Set<string>();
    for (const o of ordenes) ids.add(o.id);
    Object.values(abiertosPorTec).forEach((est) => est.ordenes.forEach((o) => ids.add(o.id)));
    return [...ids];
  }, [ordenes, abiertosPorTec]);

  useEffect(() => {
    if (fixture) return;
    if (!permisos.ordenesVer) return;
    if (!ordenIdsVigentes.length) {
      setStandby([]);
      setCargandoStandby(false);
      setErrorStandby(null);
      return;
    }
    const miEpoca = epocaStandby.current;
    let cancelado = false;
    setCargandoStandby(true);
    setErrorStandby(null);
    (async () => {
      try {
        const out: StandbyPieza[] = [];
        for (const grupo of chunks(ordenIdsVigentes, 10)) {
          const q = query(collection(db, 'standby_piezas'), where('ordenId', 'in', grupo));
          const snap = await getDocs(q);
          snap.docs.forEach((d) => out.push(hidratarStandby(d.id, d.data() as Record<string, unknown>)));
        }
        if (cancelado || miEpoca !== epocaStandby.current) return;
        setStandby(out);
        setCargandoStandby(false);
      } catch (err) {
        console.error('[useMapaDatos] standby_piezas error', err);
        if (cancelado || miEpoca !== epocaStandby.current) return;
        setErrorStandby((err as Error)?.message || 'No se pudo leer piezas pendientes');
        setStandby([]);
        setCargandoStandby(false);
      }
    })();
    return () => { cancelado = true; };
  }, [ordenIdsVigentes, permisos.ordenesVer, fixture]);

  // Si el rango cambia, invalidamos los cachés de abiertos anteriores.
  useEffect(() => {
    if (fixture?.abiertosAnteriores) {
      const base: Record<string, EstadoAbiertosTecnico> = {};
      Object.entries(fixture.abiertosAnteriores).forEach(([k, v]) => {
        base[k] = { cargando: false, error: null, ordenes: v };
      });
      setAbiertosPorTec(base);
    } else {
      setAbiertosPorTec({});
    }
    abiertosEnVuelo.current.clear();
  }, [inicioMs, finMs, fixture]);

  const consultarAbiertosParaIds = async (tecnicoIds: string[]): Promise<OrdenServicio[]> => {
    const unicos = asArrayUnico(tecnicoIds.filter(Boolean));
    const out: OrdenServicio[] = [];
    const visto = new Set<string>();
    for (const grupo of chunks(unicos, 10)) {
      const q = query(collection(db, 'ordenes_servicio'), where('tecnicoId', 'in', grupo));
      const snap = await getDocs(q);
      snap.docs.forEach((d) => {
        if (visto.has(d.id)) return;
        visto.add(d.id);
        const o = parseOrden(d.id, d.data() as Record<string, unknown>);
        if (o.eliminada) return;
        if (o.fase === 'cerrado' || o.fase === 'cancelado') return;
        if (o.fechaCita && inicioMs !== null && finMs !== null) {
          const t = o.fechaCita.getTime();
          // Pendientes anteriores al intervalo; las futuras no se rotulan como atrasadas.
          if (t >= inicioMs) return;
        }
        out.push(o);
      });
    }
    out.sort((a, b) => {
      const fa = a.fechaCita?.getTime() ?? -Infinity;
      const fb = b.fechaCita?.getTime() ?? -Infinity;
      return fa - fb;
    });
    return out;
  };

  const cargarAbiertosAnterioresPara = useCallback((tecnicoIds: string[], forzar = false) => {
    if (fixture || !permisos.ordenesVer) return;
    // Las decisiones y las solicitudes ocurren fuera del updater de React.
    const nuevos = asArrayUnico(tecnicoIds.filter(Boolean)).filter(id =>
      forzar || (!abiertosConsultados.current.has(id) && !abiertosEnVuelo.current.has(id)),
    );
    if (!nuevos.length) return;
    const versiones = new Map<string, number>();
    for (const id of nuevos) {
      const version = (versionSolicitud.current.get(id) ?? 0) + 1;
      versionSolicitud.current.set(id, version);
      versiones.set(id, version);
      abiertosConsultados.current.add(id);
      abiertosEnVuelo.current.add(id);
    }
    const miEpoca = epocaBacklog.current;
    const vigente = (id: string) => miEpoca === epocaBacklog.current && versionSolicitud.current.get(id) === versiones.get(id);
    setAbiertosPorTec(prev => {
      const next = { ...prev };
      for (const id of nuevos) next[id] = { cargando: true, error: null, ordenes: prev[id]?.ordenes ?? [] };
      return next;
    });
    void (async () => {
      try {
        const todos = await consultarAbiertosParaIds(nuevos);
        if (miEpoca !== epocaBacklog.current) return;
        setAbiertosPorTec(prev => {
          const next = { ...prev };
          for (const id of nuevos) if (vigente(id)) {
            next[id] = { cargando: false, error: null, ordenes: todos.filter(o => o.tecnicoId === id) };
          }
          return next;
        });
      } catch (err) {
        if (miEpoca !== epocaBacklog.current) return;
        nuevos.forEach(id => { if (vigente(id)) abiertosConsultados.current.delete(id); });
        setAbiertosPorTec(prev => {
          const next = { ...prev };
          for (const id of nuevos) if (vigente(id)) {
            next[id] = { cargando: false, error: (err as Error)?.message || 'Error al cargar pendientes', ordenes: [] };
          }
          return next;
        });
      } finally {
        nuevos.forEach(id => { if (vigente(id)) abiertosEnVuelo.current.delete(id); });
      }
    })();
    // consultarAbiertosParaIds solo depende del rango y usa adaptadores estables.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permisos.ordenesVer, fixture, inicioMs, finMs]);

  const refrescarAbiertosAnterioresPara = useCallback((tecnicoId: string) => {
    if (tecnicoId) cargarAbiertosAnterioresPara([tecnicoId], true);
  }, [cargarAbiertosAnterioresPara]);

  return useMemo<MapaDatos>(() => ({
    ordenes,
    personal,
    gps,
    clientes,
    standby,
    cargandoOrdenes,
    cargandoPersonal,
    cargandoClientes,
    cargandoGps,
    cargandoStandby,
    errorOrdenes,
    errorPersonal,
    errorClientes,
    errorGps,
    errorStandby,
    cargarClientes: () => setClientesActivos(true),
    descartarClientes: () => setClientesActivos(false),
    activarGps: () => setGpsActivo(true),
    desactivarGps: () => setGpsActivo(false),
    abiertosAnterioresPorTecnico: abiertosPorTec,
    cargarAbiertosAnterioresPara,
    refrescarAbiertosAnterioresPara,
    clientesReferenciados,
    usandoFixture: !!fixture,
  }), [
    ordenes, personal, gps, clientes, standby,
    cargandoOrdenes, cargandoPersonal, cargandoClientes, cargandoGps, cargandoStandby,
    errorOrdenes, errorPersonal, errorClientes, errorGps, errorStandby,
    abiertosPorTec, clientesReferenciados, fixture,
    cargarAbiertosAnterioresPara, refrescarAbiertosAnterioresPara,
  ]);
}
