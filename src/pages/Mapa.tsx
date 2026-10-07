/**
 * Mapa.tsx — módulo Mapa de operaciones. Orquesta datos (`useMapaDatos`),
 * vistas (mapa/lista/semana/mes), fichas y acciones. Punto único de
 * integración con los servicios reales.
 *
 * Nota: todas las fechas humanas pasan por `componentesRD` para no depender de
 * la zona del dispositivo. Routes se consulta SOLO por acción explícita y
 * nunca en modo demo (fixture) — así los QA aislados no disparan la API real.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, onSnapshot } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { useApp } from '../context/AppContext';
import { puede } from '../utils/permisos';
import { useMapaDatos, type MapaFixture } from '../hooks/useMapaDatos';
import type { Calendario, Cliente, OrdenServicio, Personal } from '../types';
import { db } from '../firebase/config';
import {
  agruparPorTecnico,
  candidatosReasignacion,
  citasDelDia,
  mismoDia,
  proyectarDia,
  repartirCitas,
  senalGPS,
  sugerenciasPorAtraso,
  tramoEstimado,
  hora12,
  type DiaTecnico,
  type SugerenciaMover,
  type Senal,
  type Tramo,
} from '../utils/mapaOperaciones';
import { zonaDeOrden } from '../utils/zonas';
import { equipoDeOperaria } from '../utils/equiposOperacion';
import { tieneCoord, type LatLng } from '../utils/geo';
import {
  componentesRD,
  fechaEnRD,
  diaEsHoyRD,
  inicioDiaRD,
  mismoDiaRD,
  rangoAtajoRD,
  rangoRD,
} from '../utils/mapaFechas';
import {
  agruparRutasPorTecnicoYDia,
  canonicalizadorTecnico,
  citasFromOrdenes,
  gpsPorTecnico,
  ordenesSinUbicacion,
  standbyPorOrden,
  tecnicosFromPersonal,
  puntosCliente as puntosClienteDesde,
  type PuntoCliente,
} from '../components/mapa/datosDerivados';
import BarraFiltros, { type EstadoFiltros } from '../components/mapa/BarraFiltros';
import VistaLista from '../components/mapa/VistaLista';
import VistaMes from '../components/mapa/VistaMes';
import VistaSemana from '../components/mapa/VistaSemana';
import PanelInicio from '../components/mapa/PanelInicio';
import FichaCita from '../components/mapa/FichaCita';
import FichaTecnico from '../components/mapa/FichaTecnico';
import FichaRuta from '../components/mapa/FichaRuta';
import FichaCliente from '../components/mapa/FichaCliente';
import PanelReasignar from '../components/mapa/PanelReasignar';
import PanelRepartir, { type ResultadoRepartir } from '../components/mapa/PanelRepartir';
import MapaGoogle, { type LineaMapa, type MarcadorMapa } from '../components/mapa/MapaGoogle';
import HojaInferiorMovil, { type AlturaSheet } from '../components/mapa/HojaInferiorMovil';
import FiltrosClientesMapa from '../components/mapa/FiltrosClientesMapa';
import { type FiltrosCapaCliente, FILTROS_CAPA_DEFAULT, aplicaFiltrosCapa } from '../components/mapa/filtrosClienteModelo';
import { pinCita, marcadorVan, marcadorOficina, puntoCliente, grupoClientes, COLOR } from '../components/mapa/marcadores';
import {
  resolverCita,
  unionBacklog,
  huellaRuta,
  rutaPintable,
} from '../components/mapa/selectoresPanel';
import { consultarRuta, tramoDeRuta, type RespuestaRuta } from '../services/tiemposRuta.service';
import { ArrowLeft, X as XIcon } from 'lucide-react';
import { agruparEnPantalla, type Limites } from '../utils/clusterPantalla';
import type { ConfirmarReasignacionResultado } from '../services/reasignacion.service';
import {
  previewReasignacion, confirmarReasignacion, ErrorReasignacion,
  type OrigenReasignacion, type PreviewReasignacionPeticion,
} from '../services/reasignacion.service';
import { normalizarTelefono } from '../services/clientes.service';
import { antiguedadDe, ANTIGUEDAD, type Antiguedad } from '../utils/mapaClientes';
import { mesesDesdeUltimoServicio } from '../utils/clientesFiltros';

/** Oficina de salida: `null` mientras no se confirme (sin afirmaciones). */
const OFICINA_FALLBACK: LatLng | null = null;

type VistaPanel =
  | { modo: 'inicio' }
  | { modo: 'grupoCitas'; ids: string[] }
  | { modo: 'grupoClientes'; ids: string[] }
  | { modo: 'tecnico'; tecnicoId: string; dia?: string }
  | { modo: 'cita'; ordenId: string }
  | { modo: 'ruta'; claveRuta: string }
  | { modo: 'cliente'; clienteId: string }
  | { modo: 'reasignar'; ordenId: string; origen: OrigenReasignacion }
  | { modo: 'repartir'; tecnicoId: string; dia?: string };

interface Props {
  fixture?: MapaFixture | null;
  /** Calendarios demo para el preview de VistaSemana (sólo cuando `modoDemo`). */
  calendariosDemo?: Calendario[];
  modoDemo?: boolean;
}

interface DeshacerPendiente {
  deshacer: PreviewReasignacionPeticion;
  caducaEn: number;
  ordenClienteNombre: string;
}

interface ResultadoRutaCacheado {
  huella: string;
  resultado: RespuestaRuta;
  puntos: LatLng[];
  polilinea: LatLng[] | null;
  trafico: boolean;
  calculadoEn: number;
  /** Replica `resultado.fuente` para que `rutaPintable` lo tome sin re-descriminar. */
  fuente: 'google' | 'estimado';
}

const UNDO_MS = 10_000;

const diaClaveRD = (d: Date) => {
  const c = componentesRD(d);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${c.anio}-${pad(c.mes + 1)}-${pad(c.dia)}`;
};

const DIAS_SEMANA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const etiquetaDiaRD = (d: Date, ahora: Date) => {
  if (diaEsHoyRD(d, ahora)) return 'hoy';
  const c = componentesRD(d);
  return `${DIAS_SEMANA[c.diaSemana]} ${c.dia} ${MESES[c.mes]}`;
};

/** Mezcla por antigüedad: cada grupo cuenta cuántos clientes cae en cada bucket. */
function mezclaAntiguedad(puntos: readonly PuntoCliente[], clientesPorId: Map<string, Cliente>) {
  const buckets: Record<Antiguedad, number> = { activo: 0, reciente: 0, enfriando: 0, frio: 0, sin_registro: 0 };
  const vistos = new Set<string>();
  for (const p of puntos) {
    if (vistos.has(p.clienteId)) continue;
    vistos.add(p.clienteId);
    const c = clientesPorId.get(p.clienteId);
    const a = antiguedadDe(c ? mesesDesdeUltimoServicio(c) : null);
    buckets[a] += 1;
  }
  return [
    { color: ANTIGUEDAD.activo.color, n: buckets.activo },
    { color: ANTIGUEDAD.reciente.color, n: buckets.reciente },
    { color: ANTIGUEDAD.enfriando.color, n: buckets.enfriando },
    { color: ANTIGUEDAD.frio.color, n: buckets.frio },
    { color: ANTIGUEDAD.sin_registro.color, n: buckets.sin_registro },
  ];
}

export default function Mapa({ fixture, modoDemo, calendariosDemo }: Props) {
  const { userProfile } = useApp();
  const navigate = useNavigate();

  const permisos = useMemo(() => ({
    ordenesVer: puede(userProfile, 'ordenesVer'),
    clientesVer: puede(userProfile, 'clientesVer'),
    personalVer: puede(userProfile, 'personalVer'),
    // GPS expone datos de técnicos; reutiliza el permiso de personal existente.
    gpsVer: puede(userProfile, 'personalVer'),
  }), [userProfile]);
  const puedeReasignar = puede(userProfile, 'ordenesModificar');
  const puedeEditar = puedeReasignar;

  const [ahora, setAhora] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setAhora(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const [estado, setEstadoRaw] = useState<EstadoFiltros>(() => {
    const r = rangoAtajoRD('hoy', new Date());
    return {
      desde: r.desde,
      hasta: r.hasta,
      equipo: 'todos',
      tecnicoId: '',
      modo: 'mapa',
      capaClientes: false,
      capaGps: true,
      tipoMapa: 'mapa',
      trafico: false,
    };
  });
  const setEstado = useCallback((parche: Partial<EstadoFiltros>) => {
    setEstadoRaw(prev => ({ ...prev, ...parche }));
    if ('modo' in parche) setAlturaMovil('cerrada');
    if ('desde' in parche || 'hasta' in parche || 'equipo' in parche || 'tecnicoId' in parche || 'zona' in parche) setVista({ modo: 'inicio' });
  }, []);
  const rangoActivo = useMemo(() => rangoRD(estado.desde, estado.hasta), [estado.desde, estado.hasta]);
  const rangoInvalido = rangoActivo === null;

  const datos = useMapaDatos(
    { inicio: rangoActivo?.inicio ?? null, fin: rangoActivo?.fin ?? null },
    permisos,
    modoDemo ? fixture ?? null : null,
  );

  const [calendarios, setCalendarios] = useState<Calendario[]>(calendariosDemo ?? []);
  useEffect(() => {
    if (modoDemo) {
      setCalendarios(calendariosDemo ?? []);
      return;
    }
    if (estado.modo !== 'semana') return;
    if (!permisos.personalVer) return;
    const unsub = onSnapshot(collection(db, 'calendarios'), (snap) => {
      setCalendarios(snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) } as Calendario)));
    });
    return () => unsub();
  }, [estado.modo, permisos.personalVer, modoDemo, calendariosDemo]);

  useEffect(() => {
    if (!permisos.gpsVer) return;
    if (estado.capaGps) datos.activarGps();
    else datos.desactivarGps();
  }, [estado.capaGps, permisos.gpsVer]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!permisos.clientesVer) return;
    if (estado.capaClientes) datos.cargarClientes();
    else datos.descartarClientes();
  }, [estado.capaClientes, permisos.clientesVer]); // eslint-disable-line react-hooks/exhaustive-deps

  const [vista, setVista] = useState<VistaPanel>({ modo: 'inicio' });
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const [alturaMovil, setAlturaMovil] = useState<AlturaSheet>('media');
  const [resultadoRuta, setResultadoRuta] = useState<ResultadoRutaCacheado | null>(null);
  const [cargandoRuta, setCargandoRuta] = useState(false);
  const [undoPendiente, setUndoPendiente] = useState<DeshacerPendiente | null>(null);
  const [filtrosCliente, setFiltrosCliente] = useState<FiltrosCapaCliente>(FILTROS_CAPA_DEFAULT);

  useEffect(() => { if (vista.modo !== 'inicio') setAlturaMovil('media'); }, [vista]);

  // Escape cierra el panel
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && vista.modo !== 'inicio') setVista({ modo: 'inicio' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [vista.modo]);

  // Al abrir ficha técnico, cargar backlog con doc + uid (ambos alias)
  const canonicalizar = useMemo(() => canonicalizadorTecnico(datos.personal), [datos.personal]);
  const vistaTecIds = useMemo(() => {
    if (vista.modo !== 'tecnico') return [] as string[];
    const tec = datos.personal.find((p) => (p.uid || p.id) === vista.tecnicoId);
    if (!tec) return [vista.tecnicoId];
    return Array.from(new Set([tec.uid, tec.id].filter((x): x is string => !!x)));
  }, [vista, datos.personal]);
  const cargarAbiertosTecnico = datos.cargarAbiertosAnterioresPara;
  useEffect(() => {
    if (!vistaTecIds.length) return;
    cargarAbiertosTecnico(vistaTecIds);
  }, [vistaTecIds, cargarAbiertosTecnico]);

  // Índices derivados
  const clientesIndex = useMemo(() => {
    const m = new Map<string, Cliente>();
    for (const c of datos.clientes) m.set(c.id, c);
    for (const [id, c] of datos.clientesReferenciados) m.set(id, c);
    return m;
  }, [datos.clientes, datos.clientesReferenciados]);

  const standbyIndex = useMemo(() => standbyPorOrden(datos.standby), [datos.standby]);

  const tecnicos = useMemo(() => tecnicosFromPersonal(datos.personal), [datos.personal]);
  const tecnicosActivos = useMemo(() => datos.personal.filter((p) => p.rol === 'tecnico' && p.activo !== false), [datos.personal]);
  const tecnicosEquipoA = useMemo(() => tecnicosActivos.filter((p) => equipoDeOperaria(p.operariaNombre) === 'A'), [tecnicosActivos]);
  const tecnicosEquipoB = useMemo(() => tecnicosActivos.filter((p) => equipoDeOperaria(p.operariaNombre) === 'B'), [tecnicosActivos]);
  const personalPorIdCanon = useMemo(() => {
    const m = new Map<string, Personal>();
    for (const p of datos.personal) {
      const canon = p.uid || p.id;
      m.set(canon, p);
      if (p.id !== canon) m.set(p.id, p);
    }
    return m;
  }, [datos.personal]);

  const gpsMap = useMemo(() => gpsPorTecnico(datos.gps, canonicalizar), [datos.gps, canonicalizar]);

  const citas = useMemo(
    () => citasFromOrdenes(
      datos.ordenes.filter(o => !estado.zona || zonaDeOrden(o, clientesIndex.get(o.clienteId)) === estado.zona),
      clientesIndex, standbyIndex, ahora, canonicalizar,
    ),
    [datos.ordenes, clientesIndex, standbyIndex, ahora, canonicalizar, estado.zona],
  );

  const citasFiltradas = useMemo(() => {
    return citas.filter((c) => {
      if (estado.tecnicoId && c.tecnicoId !== estado.tecnicoId) return false;
      if (estado.equipo === 'todos') return true;
      const tec = tecnicos.find((t) => t.id === c.tecnicoId);
      return tec?.equipo === estado.equipo;
    });
  }, [citas, estado.tecnicoId, estado.equipo, tecnicos]);

  const rutas = useMemo(() => agruparRutasPorTecnicoYDia(citasFiltradas), [citasFiltradas]);

  const diaActivo = useMemo(() => {
    const fechaSeleccionada = vista.modo === 'ruta' ? vista.claveRuta.split('|')[1] : (vista.modo === 'tecnico' || vista.modo === 'repartir') ? vista.dia : undefined;
    if (fechaSeleccionada) {
      const [anio, mes, dia] = fechaSeleccionada.split('-').map(Number);
      if (anio && mes && dia) return fechaEnRD(anio, mes - 1, dia);
    }
    const hoy = inicioDiaRD(ahora);
    if (rangoActivo) {
      if (hoy >= rangoActivo.inicio && hoy < rangoActivo.fin) return hoy;
      return rangoActivo.inicio;
    }
    return inicioDiaRD(estado.desde);
  }, [rangoActivo, estado.desde, ahora, vista]);

  // Huella para el resultadoRuta de la vista actual. `trafico` solo cuenta cuando el día es hoy.
  const huellaRutaActual = useMemo(() => {
    const [tecnicoId, dia] = vista.modo === 'ruta' ? vista.claveRuta.split('|') : ['', diaClaveRD(diaActivo)];
    const diaRef = vista.modo === 'ruta' && dia ? dia : diaClaveRD(diaActivo);
    const [anio, mes, diaNum] = diaRef.split('-').map((n) => Number(n));
    const diaDate = anio && mes && diaNum ? inicioDiaRD(new Date(Date.UTC(anio, mes - 1, diaNum, 12))) : diaActivo;
    const traficoEfectivo = estado.trafico && diaEsHoyRD(diaDate, ahora);
    const coords = citas
      .filter((c) => c.tecnicoId === tecnicoId && !c.progreso.standby && mismoDiaRD(c.inicio, diaDate) && tieneCoord(c))
      .sort((a, b) => a.inicio.getTime() - b.inicio.getTime())
      .map((c) => ({ lat: c.lat as number, lng: c.lng as number }));
    return huellaRuta(tecnicoId, diaRef, coords, traficoEfectivo);
  }, [vista, diaActivo, citas, estado.trafico, ahora]);

  const vistaActual = useRef(vista);
  vistaActual.current = vista;
  const huellaActualRef = useRef(huellaRutaActual);
  huellaActualRef.current = huellaRutaActual;

  // Si la huella del resultado ya no coincide, descartamos.
  useEffect(() => {
    if (!resultadoRuta) return;
    if (resultadoRuta.huella !== huellaRutaActual) setResultadoRuta(null);
  }, [huellaRutaActual, resultadoRuta]);

  // Tramo de ruta — SOLO si el resultado sigue pintable para la huella actual.
  const tramoActivo: Tramo = useMemo(() => {
    if (!rutaPintable(resultadoRuta, huellaRutaActual, ahora.getTime())) return tramoEstimado;
    return tramoDeRuta(resultadoRuta!.puntos, resultadoRuta!.resultado, resultadoRuta!.trafico);
  }, [resultadoRuta, huellaRutaActual, ahora]);

  // Proyección por técnico para el día activo
  const diasPorTecnico = useMemo(() => {
    const m = new Map<string, DiaTecnico>();
    for (const t of tecnicos) {
      // @safe-tecnicoid-id: `t.id` ya es `uid||id` canónico (ver `canonicalizadorTecnico`).
      const suyas = citasDelDia(
        citas.filter((c) => c.tecnicoId === t.id),
        diaActivo,
      );
      const esHoy = diaEsHoyRD(diaActivo, ahora);
      const dia = proyectarDia(suyas, {
        ahora,
        origen: OFICINA_FALLBACK,
        gps: esHoy ? gpsMap.get(t.id) ?? null : null,
        tramo: vista.modo === 'ruta' && vista.claveRuta === `${t.id}|${diaClaveRD(diaActivo)}` ? tramoActivo : tramoEstimado,
      });
      m.set(t.id, dia);
    }
    return m;
  }, [tecnicos, citas, diaActivo, ahora, gpsMap, tramoActivo, vista]);

  const sugerencias = useMemo<SugerenciaMover[]>(() => {
    if (!diaEsHoyRD(diaActivo, ahora)) return [];
    return sugerenciasPorAtraso(tecnicos, citas.filter((c) => mismoDia(c.inicio, diaActivo)), {
      ahora,
      origen: OFICINA_FALLBACK,
      tramo: tramoActivo,
      gpsPorTecnico: gpsMap,
    });
  }, [tecnicos, citas, diaActivo, ahora, gpsMap, tramoActivo]);

  const resumenesTec = useMemo(() => {
    const resultado: Array<{ tecnico: Personal; dia: DiaTecnico; senal: Senal; minSinSenal: number | null }> = [];
    for (const t of tecnicos) {
      const persReal = personalPorIdCanon.get(t.id);
      if (!persReal) continue;
      const dia = diasPorTecnico.get(t.id)!;
      const esHoy = diaEsHoyRD(diaActivo, ahora);
      const s = esHoy ? senalGPS(gpsMap.get(t.id), ahora) : { senal: 'sin_gps' as const, minutos: null };
      resultado.push({ tecnico: persReal, dia, senal: s.senal, minSinSenal: s.minutos });
    }
    return resultado.sort((a, b) => a.tecnico.nombre.localeCompare(b.tecnico.nombre));
  }, [tecnicos, diasPorTecnico, personalPorIdCanon, gpsMap, diaActivo, ahora]);

  const sinUbicacion = useMemo(() => {
    const ids = new Set(citasFiltradas.map(c => c.id));
    return ordenesSinUbicacion(datos.ordenes.filter(o => ids.has(o.id)), clientesIndex);
  }, [datos.ordenes, clientesIndex, citasFiltradas]);

  // Capa clientes: aplicar filtros + puntos + cluster
  const clientesFiltrados = useMemo(() => {
    if (!estado.capaClientes) return [] as Cliente[];
    return datos.clientes.filter((c) => aplicaFiltrosCapa(c, filtrosCliente));
  }, [datos.clientes, filtrosCliente, estado.capaClientes]);

  const [vistaMapa, setVistaMapa] = useState<{ limites: Limites; zoom: number } | null>(null);
  const puntosClientes = useMemo(() => puntosClienteDesde(clientesFiltrados), [clientesFiltrados]);
  const gruposClientes = useMemo(() => {
    if (!estado.capaClientes || !vistaMapa) return [];
    return agruparEnPantalla(puntosClientes, vistaMapa.limites, vistaMapa.zoom);
  }, [estado.capaClientes, vistaMapa, puntosClientes]);
  const clientesPorIdLocal = useMemo(() => {
    const m = new Map<string, Cliente>();
    for (const c of clientesFiltrados) m.set(c.id, c);
    return m;
  }, [clientesFiltrados]);

  // La concentración usa todo el rango filtrado. Solo una ruta seleccionada dibuja trayectos.
  const puntosCitas = useMemo(() => citasFiltradas.filter(tieneCoord).map(c => ({ ...c, lat: c.lat as number, lng: c.lng as number })), [citasFiltradas]);
  const gruposCitas = useMemo(() => vistaMapa
    ? agruparEnPantalla(puntosCitas, vistaMapa.limites, vistaMapa.zoom)
    : [], [puntosCitas, vistaMapa]);
  const encuadreMapa = useMemo(() => {
    const puntos = vista.modo === 'ruta'
      ? puntosCitas.filter(c => !c.progreso.standby && `${c.tecnicoId}|${diaClaveRD(c.inicio)}` === vista.claveRuta)
      : puntosCitas;
    return { clave: `${estado.desde.getTime()}|${estado.hasta.getTime()}|${estado.equipo}|${estado.tecnicoId}|${vista.modo === 'ruta' ? vista.claveRuta : 'rango'}`, puntos };
  }, [puntosCitas, estado.desde, estado.hasta, estado.equipo, estado.tecnicoId, vista]);

  // Marcadores y líneas para MapaGoogle
  const { marcadoresMapa, lineasMapa } = useMemo(() => {
    const marcas: MarcadorMapa[] = [];
    const lineas: LineaMapa[] = [];
    if (OFICINA_FALLBACK && tieneCoord(OFICINA_FALLBACK)) {
      marcas.push({
        id: 'oficina',
        pos: OFICINA_FALLBACK,
        capa: 'oficina',
        clave: 'oficina',
        contenido: () => marcadorOficina(),
        titulo: 'Oficina Mister Service',
        z: 10,
      });
    }
    const citasRuta = vista.modo === 'ruta'
      ? citasFiltradas.filter(c => !c.progreso.standby && `${c.tecnicoId}|${diaClaveRD(c.inicio)}` === vista.claveRuta)
      : [];
    const porTec = agruparPorTecnico(citasRuta);
    if (vista.modo !== 'ruta') {
      for (const g of gruposCitas) {
        if (g.items.length === 1) {
          const c = g.items[0];
          // @safe-tecnicoid-id: TecnicoMapa.id y CitaMapa.tecnicoId ya están normalizados a UID por datosDerivados; solo elige un color.
          const color = tecnicos.find(t => t.id === c.tecnicoId)?.color || COLOR.accion;
          marcas.push({ id: `cita:${c.id}`, pos: g.centro, capa: 'cita',
            clave: `${c.progreso.indice}|${c.progreso.completa}|${color}`,
            titulo: `${c.clienteNombre} · ${etiquetaDiaRD(c.inicio, ahora)} · ${hora12(c.inicio)}`,
            contenido: () => pinCita({ numero: 1, color, hecha: c.progreso.completa, garantia: !!c.progreso.garantia, atrasada: false, seleccionada: vista.modo === 'cita' && vista.ordenId === c.id, titulo: c.clienteNombre }), z: 5 });
        } else {
          marcas.push({ id: `citas:${g.id}`, pos: g.centro, capa: 'grupo_citas',
            clave: g.items.map(c => c.id).join('|'), titulo: `${g.items.length} citas del rango`,
            contenido: () => grupoClientes(g.items.length, [{ color: COLOR.accion, n: g.items.length }], `${g.items.length} citas. Abrir clientes y fechas.`), z: 6 });
        }
      }
    }
    const puedeGoogleRuta = rutaPintable(resultadoRuta, huellaRutaActual, ahora.getTime());
    porTec.forEach((suyas, tecId) => {
      const t = tecnicos.find((x) => x.id === tecId);
      const color = t?.color || COLOR.accion;
      let idx = 0;
      for (const c of suyas) {
        idx += 1;
        if (!tieneCoord(c)) continue;
        marcas.push({
          id: `cita:${c.id}`,
          pos: { lat: c.lat as number, lng: c.lng as number },
          capa: 'cita',
          clave: `${idx}|${c.progreso.indice}|${c.progreso.garantia ? 'g' : ''}|${c.progreso.completa ? 'h' : ''}|${vista.modo === 'cita' && vista.ordenId === c.id ? 's' : 'u'}`,
          titulo: `${c.clienteNombre} · ${hora12(c.inicio)}`,
          contenido: () =>
            pinCita({
              numero: idx,
              color,
              garantia: !!c.progreso.garantia,
              hecha: c.progreso.completa,
              atrasada: false,
              seleccionada: vista.modo === 'cita' && vista.ordenId === c.id,
              titulo: c.clienteNombre,
              sinUbicacion: false,
            }),
          z: 5,
          arrastrable: false,
        });
      }
      const puntos = suyas
        .filter((c) => tieneCoord(c))
        .map((c) => ({ lat: c.lat as number, lng: c.lng as number }));
      if (puntos.length >= 2) {
        // La polilínea del resultado solo pinta si: hay resultado pintable Y la
        // huella del tramo del técnico iterado coincide EXACTO con la del
        // resultado (técnico, día, coords, tráfico). Cualquier cambio invalida.
        const diaRefIter = diaClaveRD(diaActivo);
        const traficoIter = estado.trafico && diaEsHoyRD(diaActivo, ahora);
        const huellaIter = huellaRuta(tecId, diaRefIter, puntos, traficoIter);
        const perteneceAEstaRuta = puedeGoogleRuta && resultadoRuta?.huella === huellaIter;
        const usarPolilinea = perteneceAEstaRuta && resultadoRuta?.polilinea && resultadoRuta.polilinea.length >= 2;
        lineas.push({
          id: `ruta:${tecId}`,
          puntos: usarPolilinea ? (resultadoRuta!.polilinea as LatLng[]) : puntos,
          color,
          grosor: 4,
          opacidad: 0.85,
          punteada: !usarPolilinea,
        });
      }
    });

    // Vans GPS (solo hoy)
    if (estado.capaGps && diaEsHoyRD(diaActivo, ahora)) {
      gpsMap.forEach((pos, tecId) => {
        const t = tecnicos.find((x) => x.id === tecId);
        if (!t || (estado.tecnicoId && estado.tecnicoId !== t.id) || (estado.equipo !== 'todos' && estado.equipo !== t.equipo)) return;
        const dia = diasPorTecnico.get(tecId);
        const sen = senalGPS(pos, ahora);
        marcas.push({
          id: `van:${tecId}`,
          pos: { lat: pos.lat, lng: pos.lng },
          capa: 'van',
          clave: `${dia?.hechas ?? 0}|${dia?.total ?? 0}|${sen.senal}|${t.color}`,
          titulo: `${t.nombre} · ${dia?.hechas ?? 0}/${dia?.total ?? 0}`,
          contenido: () =>
            marcadorVan({
              inicial: t.nombre,
              color: t.color || COLOR.accion,
              hechas: dia?.hechas ?? 0,
              total: dia?.total ?? 0,
              atrasado: dia?.atrasado ?? false,
              senal: sen.senal,
              etiqueta: `${t.nombre} · ${dia?.hechas ?? 0}/${dia?.total ?? 0}`,
              titulo: `${t.nombre} · señal ${sen.senal}`,
            }),
          z: 20,
        });
      });
    }

    // Capa de clientes (si activa) — grupos con mezcla real por antigüedad
    if (estado.capaClientes) {
      for (const g of gruposClientes) {
        if (g.items.length === 1) {
          const p = g.items[0];
          const c = clientesPorIdLocal.get(p.clienteId);
          const a = antiguedadDe(c ? mesesDesdeUltimoServicio(c) : null);
          marcas.push({
            id: `cli:${p.id}`,
            pos: { lat: p.lat, lng: p.lng },
            capa: 'cliente',
            clave: `uno|${p.id}|${a}`,
            titulo: `${p.nombre} · ${p.etiqueta}`,
            contenido: () => puntoCliente(ANTIGUEDAD[a].color, `${p.nombre} · ${ANTIGUEDAD[a].etiqueta}`),
            z: 2,
          });
        } else {
          const mezcla = mezclaAntiguedad(g.items, clientesPorIdLocal);
          const unicos = new Set(g.items.map(p => p.clienteId)).size;
          marcas.push({
            id: `grupo:${g.id}`,
            pos: g.centro,
            capa: 'grupo',
            clave: `g|${g.items.length}|${mezcla.map((m) => m.n).join(',')}`,
            titulo: `${unicos} clientes · ${g.items.length} ubicaciones`,
            contenido: () => grupoClientes(unicos, mezcla, `${unicos} clientes en ${g.items.length} ubicaciones. Abrir listado.`),
            z: 3,
          });
        }
      }
    }

    return { marcadoresMapa: marcas, lineasMapa: lineas };
  }, [citasFiltradas, gruposCitas, diaActivo, tecnicos, vista, gpsMap, diasPorTecnico, ahora, resultadoRuta, estado.capaClientes, estado.capaGps, estado.tecnicoId, estado.equipo, estado.trafico, gruposClientes, clientesPorIdLocal, huellaRutaActual]);

  const abrirCita = useCallback((ordenId: string) => setVista({ modo: 'cita', ordenId }), []);
  const abrirTecnico = useCallback((tecnicoId: string, dia?: string) => setVista({ modo: 'tecnico', tecnicoId, dia }), []);
  const abrirRuta = useCallback((claveRuta: string) => {
    const [anio, mes, dia] = (claveRuta.split('|')[1] ?? '').split('-').map(Number);
    if (anio && mes && dia) {
      const fecha = fechaEnRD(anio, mes - 1, dia);
      if (!rangoActivo || fecha < rangoActivo.inicio || fecha >= rangoActivo.fin) setEstado({ desde: fecha, hasta: fecha });
    }
    setVista({ modo: 'ruta', claveRuta });
  }, [rangoActivo, setEstado]);
  const abrirReasignar = useCallback((ordenId: string, origen: OrigenReasignacion = 'mapa') => setVista({ modo: 'reasignar', ordenId, origen }), []);

  // Al cambiar rango/filtros se descarta cualquier resultado Routes anterior.
  const inicioMsRango = rangoActivo?.inicio.getTime() ?? null;
  const finMsRango = rangoActivo?.fin.getTime() ?? null;
  useEffect(() => {
    setResultadoRuta(null);
  }, [inicioMsRango, finMsRango, estado.tecnicoId, estado.equipo, estado.trafico]);

  /** Centro mapa centralizado para fijar la zona del día activo cuando cambia. */
  const centerMapaRef = useRef<Date>(diaActivo);
  useEffect(() => { centerMapaRef.current = diaActivo; }, [diaActivo]);

  // ACCIÓN explícita «Calcular ruta» del técnico+día. Bloqueada en modoDemo.
  const calcularRutaDe = useCallback(async (tecnicoId: string, dia: Date) => {
    if (modoDemo) {
      toast('Modo demo: la llamada a Routes está bloqueada por diseño.', { icon: 'ℹ️' });
      return;
    }
    const suyas = citas
      .filter((c) => c.tecnicoId === tecnicoId && !c.progreso.standby && mismoDiaRD(c.inicio, dia) && tieneCoord(c))
      .sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
    const puntos: LatLng[] = suyas.map((c) => ({ lat: c.lat as number, lng: c.lng as number }));
    if (puntos.length < 2) {
      toast('Esta ruta no tiene dos paradas con coordenadas.', { icon: 'ℹ️' });
      return;
    }
    if (puntos.length > 9) {
      toast('Nuestro endpoint acepta hasta 9 paradas por llamada. Usa los enlaces de 3 paradas de abajo.', { icon: 'ℹ️' });
      return;
    }
    const diaRef = diaClaveRD(dia);
    // Trafico aware SOLO cuando el día calculado es hoy en RD. Routes no acepta
    // fecha de salida — pedirlo para días futuros/pasados contamina con el
    // tráfico de ahora. Para otros días lo etiquetamos como «referencia sin tráfico».
    const traficoEfectivo = estado.trafico && diaEsHoyRD(dia, ahora);
    const huella = huellaRuta(tecnicoId, diaRef, puntos, traficoEfectivo);
    setCargandoRuta(true);
    try {
      const r = await consultarRuta(puntos, traficoEfectivo);
      let polilinea: LatLng[] | null = null;
      if (r.fuente === 'google' && r.polilinea && window.google?.maps?.geometry?.encoding) {
        try {
          const pts = window.google.maps.geometry.encoding.decodePath(r.polilinea);
          polilinea = pts.map((p: google.maps.LatLng) => ({ lat: p.lat(), lng: p.lng() }));
        } catch (e) {
          console.warn('[Mapa] decodePath falló', e);
          polilinea = null;
        }
      }
      // Solo guardamos si todavía estamos mirando la misma ruta.
      const sigueVisible = vistaActual.current.modo === 'ruta' && vistaActual.current.claveRuta === `${tecnicoId}|${diaRef}` && huellaActualRef.current === huella;
      if (!sigueVisible) {
        // El usuario navegó; el fetch ya salió, pero no pintamos.
        return;
      }
      setResultadoRuta({
        huella,
        resultado: r,
        puntos,
        polilinea,
        trafico: traficoEfectivo,
        calculadoEn: 'calculadoEn' in r ? r.calculadoEn : Date.now(),
        fuente: r.fuente,
      });
      if (estado.trafico && !traficoEfectivo) {
        toast('Día no es hoy: usamos la ruta sin tráfico (referencia).', { icon: 'ℹ️' });
      }
      if (r.fuente === 'estimado') {
        toast(`Ruta en modo estimado${r.motivo ? ` (${r.motivo})` : ''}.`, { icon: 'ℹ️' });
      }
    } finally {
      setCargandoRuta(false);
    }
  }, [modoDemo, citas, estado.trafico, ahora]);

  // Un solo compositor con texto preparado. La persona decide si envía.
  const abrirCompositor = useCallback((telefono: string | undefined, texto: string) => {
    if (modoDemo) { toast('Demostración: el borrador no abre conversaciones externas.'); return; }
    const digitos = normalizarTelefono(telefono ?? '');
    if (!digitos) { toast.error('Agrega un teléfono para abrir el borrador de WhatsApp.'); return; }
    const numero = digitos.length === 10 ? `1${digitos}` : digitos;
    window.open(`https://wa.me/${numero}?text=${encodeURIComponent(texto)}`, '_blank', 'noopener,noreferrer');
  }, [modoDemo]);

  const abrirAvisoWhatsApp = useCallback((orden: OrdenServicio) => {
    const partes = [
      `Hola ${orden.clienteNombre || ''}, le escribimos desde Mister Service RD por su orden ${orden.numero || orden.id}.`,
    ];
    const pieza = standbyIndex.get(orden.id)?.map(s => s.piezaFaltante).filter(Boolean).join(', ');
    if (pieza) partes.push(`Repuesto en gestión: ${pieza}.`);
    abrirCompositor(orden.clienteTelefono, partes.join(' '));
  }, [standbyIndex, abrirCompositor]);

  const enviarRutaTecnico = useCallback((tecnicoId: string, dia: Date) => {
    const tecnico = personalPorIdCanon.get(tecnicoId);
    const paradas = citasDelDia(citas, dia).filter(c => c.tecnicoId === tecnicoId && !c.progreso.standby);
    if (!tecnico || !paradas.length) { toast('No hay paradas para enviar en ese día.'); return; }
    const lineas = [
      `Hola ${tecnico.nombre}, tu ruta de ${etiquetaDiaRD(dia, ahora)}:`,
      ...paradas.map((c, i) => {
        const direccion = datos.ordenes.find(o => o.id === c.id)?.clienteDireccion;
        return `${i + 1}. ${c.clienteNombre} — ${hora12(c.inicio)}${direccion ? ` · ${direccion}` : ''}`;
      }),
    ];
    abrirCompositor(tecnico.telefono, lineas.join('\n'));
  }, [personalPorIdCanon, citas, datos.ordenes, ahora, abrirCompositor]);

  // Deshacer reasignación (válido durante UNDO_MS)
  useEffect(() => {
    if (!undoPendiente) return;
    const ms = Math.max(0, undoPendiente.caducaEn - Date.now());
    if (ms === 0) { setUndoPendiente(null); return; }
    const id = window.setTimeout(() => setUndoPendiente(null), ms);
    return () => window.clearTimeout(id);
  }, [undoPendiente]);

  const ejecutarUndo = useCallback(async () => {
    if (modoDemo || !undoPendiente) return;
    try {
      const preview = await previewReasignacion(undoPendiente.deshacer);
      await confirmarReasignacion(preview.previewId, { motivo: 'Deshecho desde el mapa.' });
      toast.success('Reasignación deshecha.');
    } catch (err) {
      if (err instanceof ErrorReasignacion) {
        toast.error(`No se pudo deshacer: ${err.message}`);
      } else {
        toast.error('No se pudo deshacer.');
      }
    } finally {
      setUndoPendiente(null);
    }
  }, [undoPendiente, modoDemo]);

  // Panel contenido según vista (resuelto por selectores puros — sin side-effects en render)
  const accesoCita = vista.modo === 'cita'
    ? resolverCita(vista.ordenId, datos.ordenes, datos.abiertosAnterioresPorTecnico)
    : null;

  let contenidoPanel: React.ReactNode = null;
  if (vista.modo === 'grupoCitas' || vista.modo === 'grupoClientes') {
    const esCitas = vista.modo === 'grupoCitas';
    const seleccion = new Set(vista.ids);
    contenidoPanel = <div className="flex h-full flex-col overflow-y-auto p-3">
      <button className="min-h-[44px] text-left text-brand-700" onClick={() => setVista({ modo: 'inicio' })}>← Volver</button>
      <h2 className="mb-3 font-semibold">{esCitas ? 'Citas de esta zona' : 'Clientes de esta zona'}</h2>
      {esCitas ? citasFiltradas.filter(c => seleccion.has(c.id)).sort((a,b) => a.inicio.getTime()-b.inicio.getTime()).map(c =>
        <button key={c.id} onClick={() => abrirCita(c.id)} className="mb-2 min-h-[60px] rounded-lg border p-3 text-left">
          <strong className="block">{c.clienteNombre}</strong><span className="block text-xs text-gray-600">{etiquetaDiaRD(c.inicio, ahora)} · {hora12(c.inicio)} · {personalPorIdCanon.get(c.tecnicoId || '')?.nombre || 'Sin técnico'}</span>
          <span className="text-xs text-brand-700">Ver cita y orden →</span>
        </button>) : clientesFiltrados.filter(c => seleccion.has(c.id)).map(c =>
        <button key={c.id} onClick={() => setVista({ modo: 'cliente', clienteId: c.id })} className="mb-2 min-h-[60px] rounded-lg border p-3 text-left"><strong>{c.nombre}</strong><span className="block text-xs">{c.sector || c.zona || 'Sin sector registrado'}</span></button>)}
    </div>;
  } else if (vista.modo === 'inicio') {
    contenidoPanel = (
      <PanelInicio
        ahora={ahora}
        resumenes={resumenesTec.filter(r => (!estado.tecnicoId || (r.tecnico.uid || r.tecnico.id) === estado.tecnicoId) && (estado.equipo === 'todos' || equipoDeOperaria(r.tecnico.operariaNombre) === estado.equipo))}
        sugerencias={sugerencias.filter(s => (!estado.tecnicoId || s.de.id === estado.tecnicoId) && (estado.equipo === 'todos' || s.de.equipo === estado.equipo))}
        diaActivo={diaActivo}
        onSeleccionarTecnico={abrirTecnico}
        onReasignarSugerencia={(s) => abrirReasignar(s.cita.id, 'mapa_sugerencia')}
      />
    );
  } else if (vista.modo === 'tecnico') {
    const persReal = personalPorIdCanon.get(vista.tecnicoId);
    const dia = diasPorTecnico.get(vista.tecnicoId);
    const idsAlias = vistaTecIds.length ? vistaTecIds : [vista.tecnicoId];
    const ordenesBacklog = unionBacklog(idsAlias, datos.abiertosAnterioresPorTecnico);
    const estados = idsAlias.map((id) => datos.abiertosAnterioresPorTecnico[id]).filter(Boolean);
    const cargando = estados.length === 0 || estados.some((e) => e.cargando);
    const error = estados.map((e) => e.error).find((x) => !!x) ?? null;
    if (persReal && dia) {
      contenidoPanel = (
        <FichaTecnico
          tecnico={persReal}
          dia={dia}
          ahora={ahora}
          diaSeleccionado={diaActivo}
          abiertosAnteriores={ordenesBacklog}
          cargandoAbiertos={cargando}
          errorAbiertos={error}
          standbyPorOrden={standbyIndex}
          onRefrescarAbiertos={() => idsAlias.forEach((id) => datos.refrescarAbiertosAnterioresPara(id))}
          onCerrar={() => setVista({ modo: 'inicio' })}
          onAbrirCita={abrirCita}
          onRepartirDia={() => setVista({ modo: 'repartir', tecnicoId: vista.tecnicoId, dia: diaClaveRD(diaActivo) })}
          onVerRuta={() => setVista({ modo: 'ruta', claveRuta: `${vista.tecnicoId}|${diaClaveRD(diaActivo)}` })}
        />
      );
    }
  } else if (vista.modo === 'cita' && accesoCita) {
    const orden = accesoCita.tipo === 'en_rango' || accesoCita.tipo === 'backlog' ? accesoCita.orden : null;
    const citaExistente = citas.find((c) => c.id === vista.ordenId);
    // Construimos la CitaMapa desde backlog solo si la orden tiene fechaCita.
    const citaBacklog = orden && orden.fechaCita
      ? citasFromOrdenes([orden], clientesIndex, standbyIndex, ahora, canonicalizar)[0] ?? null
      : null;
    const cita = citaExistente ?? citaBacklog ?? null;
    const tec = cita?.tecnicoId
      ? personalPorIdCanon.get(cita.tecnicoId) ?? null
      : orden?.tecnicoId
        ? personalPorIdCanon.get(canonicalizar(orden.tecnicoId) ?? orden.tecnicoId) ?? null
        : null;
    const dia = cita?.tecnicoId ? diasPorTecnico.get(cita.tecnicoId) ?? null : null;
    const parada = dia?.paradas.find((p) => p.cita.id === vista.ordenId) ?? null;
    const piezas = standbyIndex.get(vista.ordenId) ?? [];

    if (accesoCita.tipo === 'cargando') {
      contenidoPanel = (
        <div className="flex h-full items-center justify-center p-6 text-sm text-gray-600">
          Buscando esta orden en los pendientes anteriores…
        </div>
      );
    } else if (accesoCita.tipo === 'ausente') {
      // No se encontró y ya cargaron los backlogs. Botón explícito, sin autonav.
      contenidoPanel = (
        <div className="flex h-full flex-col">
          <div className="flex items-center gap-2 border-b border-gray-200 bg-white px-3 py-2">
            <button
              type="button"
              onClick={() => setVista({ modo: 'inicio' })}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-gray-700 hover:bg-gray-100"
              aria-label="Volver"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="text-sm font-semibold text-gray-900">Orden no visible aquí</div>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-4 text-sm text-gray-700">
            Esta orden no está en el rango activo ni en los pendientes anteriores de este
            técnico. Puedes abrirla en Órdenes para ver el detalle completo.
          </div>
          <div className="grid gap-2 border-t border-gray-200 bg-white p-2">
            <button
              type="button"
              onClick={() => navigate(`/admin/ordenes/${vista.ordenId}`)}
              className="inline-flex min-h-[48px] items-center justify-center rounded-md bg-brand-600 text-sm font-semibold text-white hover:bg-brand-700"
            >
              Abrir en Órdenes
            </button>
          </div>
        </div>
      );
    } else if (orden) {
      contenidoPanel = (
        <FichaCita
          cita={cita}
          orden={orden}
          parada={parada}
          tecnico={tec}
          piezasStandby={piezas}
          puedeEditar={puedeEditar}
          puedeReasignar={puedeReasignar}
          avisoFueraRango={accesoCita.tipo === 'backlog' ? 'Esta orden está fuera del rango activo (pendiente anterior).' : null}
          onCerrar={() => setVista({ modo: 'inicio' })}
          onEditar={() => navigate(`/admin/ordenes/${vista.ordenId}`)}
          onReasignar={() => abrirReasignar(vista.ordenId)}
          onAbrirEnOrdenes={() => navigate(`/admin/ordenes/${vista.ordenId}`)}
          onVerRuta={() => {
            const base = cita?.inicio ?? orden.fechaCita ?? null;
            if (!cita?.tecnicoId || !base) {
              toast('Esta orden no tiene fecha de cita todavía.', { icon: 'ℹ️' });
              return;
            }
            abrirRuta(`${cita.tecnicoId}|${diaClaveRD(base)}`);
          }}
          onAvisarWhatsApp={() => abrirAvisoWhatsApp(orden)}
        />
      );
    }
  } else if (vista.modo === 'ruta') {
    const [tecnicoId, diaStr] = vista.claveRuta.split('|');
    const persReal = personalPorIdCanon.get(tecnicoId);
    // Reconstruir Date desde el string YYYY-MM-DD en RD, no en zona del dispositivo.
    const [anio, mes, diaNum] = diaStr.split('-').map((n) => Number(n));
    const diaDate = anio && mes && diaNum ? inicioDiaRD(new Date(Date.UTC(anio, mes - 1, diaNum, 12))) : diaActivo;
    const diaTec = diasPorTecnico.get(tecnicoId);
    const puedeMostrarResultado = rutaPintable(resultadoRuta, huellaRutaActual, ahora.getTime());
    const caducado = !!resultadoRuta && !puedeMostrarResultado;
    if (persReal && diaTec) {
      contenidoPanel = (
        <FichaRuta
          tecnico={persReal}
          dia={diaTec}
          diaSeleccionado={diaDate}
          origenOficina={OFICINA_FALLBACK}
          cargandoRuta={cargandoRuta}
          resultadoRuta={puedeMostrarResultado ? resultadoRuta?.resultado : null}
          rutaCaduca={caducado ? 'El resultado anterior quedó obsoleto (cambiaron las paradas o el tráfico). Pulsa «Calcular ruta» otra vez para pedir uno nuevo.' : null}
          onCalcularRuta={() => calcularRutaDe(tecnicoId, diaDate)}
          onLimpiarRuta={() => setResultadoRuta(null)}
          onCerrar={() => setVista({ modo: 'inicio' })}
          onAbrirCita={abrirCita}
          onEnviarRutaTecnico={() => enviarRutaTecnico(tecnicoId, diaDate)}
        />
      );
    }
  } else if (vista.modo === 'cliente') {
    const cli = datos.clientes.find((c) => c.id === vista.clienteId) || clientesIndex.get(vista.clienteId);
    if (cli) {
      contenidoPanel = (
        <FichaCliente
          cliente={cli}
          puedeCrear={puede(userProfile, 'ordenesCrear')}
          onAbrirWhatsApp={() => abrirCompositor(cli.telefono, `Hola ${cli.nombre}, le escribimos desde Mister Service RD.`)}
          onCerrar={() => setVista({ modo: 'inicio' })}
          onNuevaOrden={() => navigate(`/admin/ordenes?clienteId=${cli.id}`)}
        />
      );
    }
  } else if (vista.modo === 'reasignar') {
    // Para reasignar, la orden puede venir del rango o del backlog ya cargado.
    const acceso = resolverCita(vista.ordenId, datos.ordenes, datos.abiertosAnterioresPorTecnico);
    const orden = acceso.tipo === 'en_rango' || acceso.tipo === 'backlog' ? acceso.orden : null;
    const cita = citas.find((c) => c.id === vista.ordenId) ?? (orden ? citasFromOrdenes([orden], clientesIndex, standbyIndex, ahora, canonicalizar)[0] : null);
    if (cita && orden) {
      const candidatosLista = candidatosReasignacion(cita, tecnicos.filter(t => !!personalPorIdCanon.get(t.id)?.uid), citas, {
        ahora,
        origen: OFICINA_FALLBACK,
        tramo: tramoActivo,
        gpsPorTecnico: gpsMap,
      });
      contenidoPanel = (
        <PanelReasignar
          cita={cita}
          orden={orden}
          candidatos={candidatosLista}
          origen={vista.origen}
          modoDemo={modoDemo}
          onCerrar={() => setVista({ modo: 'inicio' })}
          onCompletado={(resultado: ConfirmarReasignacionResultado) => {
            if (resultado.deshacer) {
              setUndoPendiente({
                deshacer: resultado.deshacer,
                caducaEn: Date.now() + UNDO_MS,
                ordenClienteNombre: cita.clienteNombre,
              });
              toast.success('Reasignación guardada.');
            } else {
              toast.success('Reasignación guardada. Deshacer no disponible porque la orden ya cambió de nuevo.');
            }
          }}
        />
      );
    } else {
      contenidoPanel = <div className="p-4 text-sm"><p>Para reasignar esta visita primero revisa su fecha en la orden.</p><button className="mt-3 min-h-[44px] text-brand-700 underline" onClick={() => navigate(`/admin/ordenes/${vista.ordenId}`)}>Abrir orden</button></div>;
    }
  } else if (vista.modo === 'repartir') {
    const persReal = personalPorIdCanon.get(vista.tecnicoId);
    if (persReal) {
      const movimientos = repartirCitas(vista.tecnicoId, tecnicos.filter(t => !!personalPorIdCanon.get(t.id)?.uid), citasDelDia(citas, diaActivo).filter(c => !c.progreso.standby), {
        ahora,
        origen: OFICINA_FALLBACK,
        tramo: tramoActivo,
        gpsPorTecnico: gpsMap,
      });
      contenidoPanel = (
        <PanelRepartir
          tecnicoOrigen={persReal}
          movimientos={movimientos}
          onCerrar={() => setVista({ modo: 'inicio' })}
          onEjecutar={async (seleccion: Set<string>) => {
            if (modoDemo) return movimientos.filter(m => seleccion.has(m.cita.id)).map(m => ({ cita: m.cita, ok: false, mensaje: 'Demostración: no se guardan cambios.' }));
            const resultados: ResultadoRepartir[] = [];
            for (const m of movimientos) {
              if (!seleccion.has(m.cita.id) || !m.a) continue;
              try {
                const preview = await previewReasignacion({
                  ordenId: m.cita.id,
                  esperado: {
                    tecnicoId: datos.ordenes.find(o => o.id === m.cita.id)?.tecnicoId ?? m.cita.tecnicoId,
                    fase: m.cita.fase,
                    fechaCitaMs: m.cita.inicio.getTime(),
                  },
                  destinoUid: m.a.id,
                  origen: 'mapa_repartir',
                  motivo: 'Repartir citas del día confirmado por oficina.',
                });
                await confirmarReasignacion(preview.previewId, { motivo: 'Repartir día.' });
                resultados.push({ cita: m.cita, ok: true });
              } catch (err) {
                const codigo = err instanceof ErrorReasignacion ? err.codigo : 'red';
                const mensaje = err instanceof Error ? err.message : 'Error';
                resultados.push({ cita: m.cita, ok: false, codigo, mensaje });
              }
            }
            return resultados;
          }}
        />
      );
    }
  }

  return (
    <div className="flex h-[calc(100dvh-60px)] flex-col bg-gray-50">
      <BarraFiltros
        estado={estado}
        setEstado={setEstado}
        tecnicos={tecnicosActivos}
        tecnicosEquipoA={tecnicosEquipoA}
        tecnicosEquipoB={tecnicosEquipoB}
        ahora={ahora}
        rangoInvalido={rangoInvalido}
        onExpandir={setFiltrosAbiertos}
      />
      {estado.capaClientes && (
        <FiltrosClientesMapa
          filtros={filtrosCliente}
          setFiltros={setFiltrosCliente}
          cantidad={clientesFiltrados.length}
          totalSinCoords={clientesFiltrados.filter(c => !tieneCoord(c) && !(c.direcciones ?? []).some(tieneCoord)).length}
        />
      )}

      <div className="border-b bg-white px-3 py-1 text-xs text-gray-600">{citasFiltradas.length} citas del rango · {puntosCitas.length} con ubicación · {sinUbicacion.length} por ubicar. {vista.modo === 'ruta' ? 'Trayecto del técnico y día seleccionados.' : 'Los grupos del mapa muestran concentración; abre uno para ver sus citas.'}</div>
      {[datos.errorOrdenes && `Órdenes: ${datos.errorOrdenes}`, datos.errorPersonal && `Técnicos: ${datos.errorPersonal}`, datos.errorClientes && `Clientes: ${datos.errorClientes}`, datos.errorStandby && `Piezas pendientes: ${datos.errorStandby}`, datos.errorGps && `GPS: ${datos.errorGps}`].filter(Boolean).map((mensaje, i) => <div key={i} role="alert" className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{mensaje}</div>)}
      {!permisos.ordenesVer && (
        <div role="alert" className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          No tenés permiso para ver órdenes. Pedí a tu administrador la habilitación.
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-hidden md:flex-row">
        <aside
          className="hidden md:flex md:w-[408px] md:shrink-0 md:border-r md:border-gray-200 md:bg-white"
          aria-label="Panel del mapa"
        >
          <div className="flex h-full w-full flex-col">
            {datos.cargandoOrdenes && (
              <div className="m-2 rounded-md bg-blue-50 px-2 py-1 text-xs text-blue-800">
                Cargando órdenes del rango…
              </div>
            )}
            {contenidoPanel}
          </div>
        </aside>

        <main className="relative min-h-0 flex-1 overflow-hidden pb-[72px] md:pb-0">
          {estado.modo === 'mapa' && (
            <MapaGoogle
              encuadre={encuadreMapa}
              marcadores={marcadoresMapa}
              lineas={lineasMapa}
              tipo={estado.tipoMapa}
              trafico={estado.trafico}
              onClickMarcador={(m) => {
                if (m.capa === 'cita') abrirCita(m.id.replace(/^cita:/, ''));
                else if (m.capa === 'van') abrirTecnico(m.id.replace(/^van:/, ''));
                else if (m.capa === 'grupo_citas') {
                  const grupo = gruposCitas.find(g => `citas:${g.id}` === m.id);
                  if (grupo) setVista({ modo: 'grupoCitas', ids: grupo.items.map(c => c.id) });
                } else if (m.capa === 'grupo') {
                  const grupo = gruposClientes.find(g => `grupo:${g.id}` === m.id);
                  if (grupo) setVista({ modo: 'grupoClientes', ids: grupo.items.map(c => c.clienteId) });
                } else if (m.capa === 'cliente') {
                  const punto = puntosClientes.find(p => `cli:${p.id}` === m.id);
                  if (punto) setVista({ modo: 'cliente', clienteId: punto.clienteId });
                }
              }}
              onClickMapa={() => {
                if (vista.modo !== 'inicio') setVista({ modo: 'inicio' });
              }}
              onCambioVista={(v) => setVistaMapa(v)}
              relleno={{ top: 48, right: 24, bottom: 24, left: 24 }}
              sinMapa={(
                <ListaFallback
                  rutas={rutas}
                  personalPorId={personalPorIdCanon}
                  onAbrirCita={abrirCita}
                  onAbrirRuta={abrirRuta}
                  onAbrirTecnico={abrirTecnico}
                  sinUbicacion={sinUbicacion}
                  clientes={clientesFiltrados}
                  capaClientes={estado.capaClientes}
                  onAbrirCliente={(id) => setVista({ modo: 'cliente', clienteId: id })}
                  diaEtiqueta={etiquetaDiaRD(diaActivo, ahora)}
                />
              )}
            />
          )}
          {estado.modo === 'lista' && (
            <div className="h-full overflow-y-auto bg-white">
              <VistaLista
                rutas={rutas}
                personalPorId={personalPorIdCanon}
                onAbrirCita={abrirCita}
                onAbrirRuta={abrirRuta}
                onAbrirTecnico={abrirTecnico}
                diaEtiquetaVacio={etiquetaDiaRD(diaActivo, ahora)}
              />
              {sinUbicacion.length > 0 && (
                <section className="border-t border-gray-100 p-3">
                  <div className="mb-1 text-xs uppercase tracking-wide text-gray-500">Sin ubicación ({sinUbicacion.length})</div>
                  <ul className="space-y-1">
                    {sinUbicacion.slice(0, 20).map((o) => (
                      <li key={o.id}>
                        <Link
                          to={`/admin/ordenes/${o.id}`}
                          className="flex min-h-[44px] items-center gap-2 rounded-md border border-gray-100 bg-white px-2 py-1 text-sm text-gray-900 hover:bg-gray-50"
                        >
                          <span className="truncate">{o.clienteNombre}</span>
                          <span className="ml-auto text-xs text-gray-500">Ubicar</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {estado.capaClientes && (
                <section className="border-t border-gray-100 p-3">
                  <div className="mb-1 text-xs uppercase tracking-wide text-gray-500">
                    Clientes ({clientesFiltrados.length})
                  </div>
                  <ul className="space-y-1">
                    {clientesFiltrados.slice(0, 50).map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => setVista({ modo: 'cliente', clienteId: c.id })}
                          className="flex min-h-[44px] w-full items-center gap-2 rounded-md border border-gray-100 bg-white px-2 py-1 text-left hover:bg-gray-50"
                        >
                          <span className="truncate text-sm text-gray-900">{c.nombre}</span>
                          <span className="ml-auto text-xs text-gray-500">{c.sector || c.zona || '—'}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
          {estado.modo === 'semana' && (
            <VistaSemana
              desde={estado.desde}
              hasta={estado.hasta}
              personal={tecnicosActivos.filter(p => (!estado.tecnicoId || (p.uid || p.id) === estado.tecnicoId) && (estado.equipo === 'todos' || equipoDeOperaria(p.operariaNombre) === estado.equipo))}
              citas={citasFiltradas}
              calendarios={calendarios}
              ahora={ahora}
              onSeleccionarCelda={(tecnicoId, dia) => {
                setEstado({ desde: dia, hasta: dia, modo: 'mapa' });
                setVista({ modo: 'tecnico', tecnicoId });
              }}
            />
          )}
          {estado.modo === 'mes' && (
            <div className="h-full overflow-y-auto bg-white">
              <VistaMes
                rango={{ inicio: estado.desde, fin: estado.hasta }}
                citas={citasFiltradas}
                ahora={ahora}
                onSeleccionarDia={(d) => {
                  const dia = inicioDiaRD(d);
                  setEstado({ desde: dia, hasta: dia, modo: 'lista' });
                }}
              />
            </div>
          )}

          {!filtrosAbiertos && <div className="md:hidden">
            <HojaInferiorMovil altura={alturaMovil} onAltura={setAlturaMovil} tituloHandle="Panel del mapa">
              {contenidoPanel}
            </HojaInferiorMovil>
          </div>}
        </main>
      </div>

      {undoPendiente && (
        <div className="pointer-events-auto absolute bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full bg-gray-900 px-4 py-2 text-sm text-white shadow-xl">
          <span>Reasignada {undoPendiente.ordenClienteNombre}.</span>
          <button
            type="button"
            onClick={ejecutarUndo}
            className="min-h-[44px] rounded-md border border-white/40 px-2 text-xs font-semibold hover:bg-white/10"
          >
            Deshacer
          </button>
          <button
            type="button"
            onClick={() => setUndoPendiente(null)}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-white/80 hover:text-white"
            aria-label="Cerrar"
          >
            <XIcon size={14} />
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-gray-200 bg-white px-3 py-1 text-xs text-gray-500">
        {permisos.clientesVer && <Link className="inline-flex min-h-[44px] items-center text-brand-700 underline" to="/admin/clientes">Clientes y reactivación</Link>}
        <span className="ml-auto">Día activo: {etiquetaDiaRD(diaActivo, ahora)}</span>
      </div>
    </div>
  );
}

function ListaFallback(props: {
  rutas: ReturnType<typeof agruparRutasPorTecnicoYDia>;
  personalPorId: Map<string, Personal>;
  onAbrirCita: (ordenId: string) => void;
  onAbrirRuta: (clave: string) => void;
  onAbrirTecnico: (tecnicoId: string, dia?: string) => void;
  sinUbicacion: OrdenServicio[];
  clientes: Cliente[];
  capaClientes: boolean;
  onAbrirCliente: (clienteId: string) => void;
  diaEtiqueta: string;
}) {
  return (
    <div className="pb-24">
      <VistaLista
        rutas={props.rutas}
        personalPorId={props.personalPorId}
        onAbrirCita={props.onAbrirCita}
        onAbrirRuta={props.onAbrirRuta}
        onAbrirTecnico={props.onAbrirTecnico}
        diaEtiquetaVacio={props.diaEtiqueta}
      />
      {props.sinUbicacion.length > 0 && (
        <section className="border-t border-gray-100 p-3">
          <div className="mb-1 text-xs uppercase tracking-wide text-gray-500">Sin ubicación ({props.sinUbicacion.length})</div>
          <ul className="space-y-1">
            {props.sinUbicacion.slice(0, 20).map((o) => (
              <li key={o.id}>
                <Link
                  to={`/admin/ordenes/${o.id}`}
                  className="flex min-h-[44px] items-center gap-2 rounded-md border border-gray-100 bg-white px-2 py-1 text-sm text-gray-900 hover:bg-gray-50"
                >
                  <span className="truncate">{o.clienteNombre}</span>
                  <span className="ml-auto text-xs text-gray-500">Ubicar</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {props.capaClientes && (
        <section className="border-t border-gray-100 p-3">
          <div className="mb-1 text-xs uppercase tracking-wide text-gray-500">
            Clientes ({props.clientes.length})
          </div>
          <ul className="space-y-1">
            {props.clientes.slice(0, 50).map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => props.onAbrirCliente(c.id)}
                  className="flex min-h-[44px] w-full items-center gap-2 rounded-md border border-gray-100 bg-white px-2 py-1 text-left hover:bg-gray-50"
                >
                  <span className="truncate text-sm text-gray-900">{c.nombre}</span>
                  <span className="ml-auto text-xs text-gray-500">{c.sector || c.zona || '—'}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
