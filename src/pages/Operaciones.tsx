/**
 * Operaciones.tsx — Centro de Operaciones.
 *
 * Reutiliza useMapaDatos para leer órdenes, personal y piezas con los permisos del usuario.
 *
 * Correcciones post revisión Codex:
 *  - Permisos resueltos a primitivos antes de pasarlos al hook (evita identidad
 *    distinta por render que reinicia los `useEffect` internos).
 *  - `tecnicoIdsVisibles` canónico: UN solo id por técnico (uid preferente)
 *    para que `resumirDia` / `agregarAvisos` no cuenten dos veces.
 *  - Estados visibles: `cargando/error` ocultan datos no confiables en vez de
 *    mostrar «cero / sin casos».
 *  - Sin frases «hoy» cuando la fecha seleccionada no es hoy en RD.
 *  - Mobile: `LineaTecnico` ya trae su variante vertical; el header se envuelve.
 *  - Enlaces a Mapa / Agenda del día usando rutas reales verificadas en App.tsx.
 *  - Sin referencia al Dashboard financiero como «omisión por regla Jorge» —
 *    es decisión de implementación para no duplicar métricas financieras.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Map as MapIcon, CalendarCheck, Tv } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { puede, esAdminOCoord } from '../utils/permisos';
import { useMapaDatos } from '../hooks/useMapaDatos';
import { rangoAtajoRD, rangoRD, componentesRD, diaEsHoyRD, fechaEnRD } from '../utils/mapaFechas';
import { equipoDeOperaria, type EquipoOperacion } from '../utils/equiposOperacion';
import type { EstadoAbiertosTecnico } from '../hooks/useMapaDatos';
import type { OrdenServicio, Personal, WhatsAppConversacion } from '../types';
import {
  agregarAvisos,
  estadoActualTecnico,
  idOperativoTecnico,
  jornadaTecnico,
  progresoDelDia,
  resumirDia,
  tecnicosVisibles,
} from '../utils/operacionesPrioridad';
import ResumenDia from '../components/operaciones/ResumenDia';
import BarraEstadoHoy from '../components/operaciones/BarraEstadoHoy';
import ListaAtencion from '../components/operaciones/ListaAtencion';
import LineaTecnico from '../components/operaciones/LineaTecnico';
import FichaTecnicoSheet from '../components/operaciones/FichaTecnicoSheet';
import LoteHorariosManana from '../components/rutas/LoteHorariosManana';
import RecordatorioBanner from '../components/recordatorios/RecordatorioBanner';
import PrioridadDelDia, { type ModoVista } from '../components/operaciones/PrioridadDelDia';
// Suscripción al mismo canal que usa el inbox general — reutilizamos la rule
// `whatsapp_conversaciones` esStaffOficina sin crear otro módulo paralelo.
import { suscribirConversaciones } from '../services/whatsappInbox.service';

type EquipoFiltro = 'todos' | 'A' | 'B';
type OrdenTecnicos = 'atencion' | 'avance' | 'nombre';

function fechaDesdeInput(valor: string): Date | null {
  if (!valor) return null;
  const [y, m, d] = valor.split('-').map(Number);
  if (!y || !m || !d) return null;
  const dt = fechaEnRD(y, m - 1, d, 12);
  return Number.isFinite(dt.getTime()) ? dt : null;
}

function fechaAInput(d: Date): string {
  const c = componentesRD(d);
  return `${c.anio}-${String(c.mes + 1).padStart(2, '0')}-${String(c.dia).padStart(2, '0')}`;
}

function combinarPendientes(persona: Personal, estados: Record<string, EstadoAbiertosTecnico>): EstadoAbiertosTecnico {
  const consultas = [...new Set([persona.id, persona.uid].filter(Boolean) as string[])].map(id => estados[id]);
  const ordenes = new Map<string, OrdenServicio>();
  for (const consulta of consultas) for (const orden of consulta?.ordenes ?? []) ordenes.set(orden.id, orden);
  return { ordenes: [...ordenes.values()], cargando: consultas.some(c => !c || c.cargando),
    error: consultas.map(c => c?.error).filter(Boolean).join(' · ') || null };
}

export default function Operaciones() {
  const { userProfile } = useApp();

  // Modo televisor: `?modo=tv` activa el layout grande sin controles para
  // proyección en pantalla del taller. Reusamos la MISMA ruta `/admin/operaciones`
  // — Jorge pidió no crear otra pantalla independiente.
  const [searchParams] = useSearchParams();
  const modoVista: ModoVista = searchParams.get('modo') === 'tv' ? 'tv' : 'normal';
  const esTv = modoVista === 'tv';

  // Permisos → primitivos; derivamos el objeto para el hook con `useMemo` para que
  // su identidad solo cambie cuando cambian los permisos reales (fix revisión Codex #10).
  const ordenesVer = puede(userProfile, 'ordenesVer');
  const clientesVer = puede(userProfile, 'clientesVer');
  const personalVer = puede(userProfile, 'personalVer');
  // Gate del canal de conversaciones (rule `whatsapp_conversaciones`
  // esStaffOficina). Secretaria/operaria/admin/coord lo tienen; técnico y
  // ayudante no suscriben para no gastar listener ni disparar permission-
  // denied silencioso.
  const puedeInbox =
    userProfile?.rol === 'secretaria' ||
    userProfile?.rol === 'operaria' ||
    esAdminOCoord(userProfile);
  // El Centro no muestra GPS; el hook usa `gpsVer` como gate independiente. Lo
  // igualamos a `personalVer` (comportamiento del Mapa) solo para que el hook
  // acepte el shape; nunca activamos `activarGps()`.
  const permisos = useMemo(
    () => ({
      ordenesVer,
      clientesVer,
      personalVer,
      gpsVer: personalVer,
    }),
    [ordenesVer, clientesVer, personalVer],
  );

  const [ahora, setAhora] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setAhora(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  // Conversaciones del inbox general — mismas rules que el inbox,
  // reutilizamos `suscribirConversaciones`. No duplica conversación por
  // cliente: la lista viene por `wa_id` único.
  const [conversaciones, setConversaciones] = useState<WhatsAppConversacion[]>([]);
  const [errorConversaciones, setErrorConversaciones] = useState<string | null>(null);
  useEffect(() => {
    if (!puedeInbox) {
      setConversaciones([]);
      setErrorConversaciones(null);
      return;
    }
    // Sin truncar: un cliente del día puede quedar fuera de los 100 recientes.
    // Conserva el fallback de actividad para conversaciones históricas.
    const unsub = suscribirConversaciones(
      (convs) => {
        setConversaciones(convs);
        setErrorConversaciones(null);
      },
      (err) => setErrorConversaciones(err.message),
    );
    return () => unsub();
  }, [puedeInbox]);

  const contextoKey = `operaciones-contexto:${userProfile?.id || 'sin-perfil'}`;
  const [contextoGuardado] = useState(() => {
    if (searchParams.get('restaurar') !== '1') return null;
    try { return JSON.parse(sessionStorage.getItem(contextoKey) || 'null') as {
      fecha?: string; equipo?: EquipoFiltro; orden?: OrdenTecnicos; scroll?: number;
    } | null; } catch { return null; }
  });
  const scrollRestaurado = useRef(false);
  const [diaSeleccionado, setDiaSeleccionado] = useState<Date>(() => {
    const guardada = contextoGuardado?.fecha ? fechaDesdeInput(contextoGuardado.fecha) : null;
    return guardada || rangoAtajoRD('hoy', new Date()).desde;
  });
  // Modo TV: forzamos "hoy" cada minuto para que no quede fijo en un día pasado.
  useEffect(() => {
    if (!esTv) return;
    const r = rangoAtajoRD('hoy', ahora);
    if (!diaEsHoyRD(diaSeleccionado, ahora)) setDiaSeleccionado(r.desde);
  }, [esTv, ahora, diaSeleccionado]);
  const [equipo, setEquipo] = useState<EquipoFiltro>(contextoGuardado?.equipo && ['todos', 'A', 'B'].includes(contextoGuardado.equipo) ? contextoGuardado.equipo : 'todos');
  const [ordenTecnicos, setOrdenTecnicos] = useState<OrdenTecnicos>(contextoGuardado?.orden && ['atencion', 'avance', 'nombre'].includes(contextoGuardado.orden) ? contextoGuardado.orden : 'atencion');
  const [tecnicoAbiertoId, setTecnicoAbiertoId] = useState<string | null>(null);

  const rango = useMemo(() => rangoRD(diaSeleccionado, diaSeleccionado), [diaSeleccionado]);
  const rangoInvalido = rango === null;
  const esDiaDeHoyRD = diaEsHoyRD(diaSeleccionado, ahora);

  // Memoizamos el `rango` que entra al hook con la misma identidad entre renders
  // cuando los extremos no cambian (fix Codex #10b). Extraemos los timestamps a
  // variables primitivas para que el array de dependencias sea literal (ESLint).
  const inicioMs = rango?.inicio?.getTime() ?? null;
  const finMs = rango?.fin?.getTime() ?? null;
  const rangoHook = useMemo(
    () => ({
      inicio: inicioMs !== null ? new Date(inicioMs) : null,
      fin: finMs !== null ? new Date(finMs) : null,
    }),
    [inicioMs, finMs],
  );

  const datos = useMapaDatos(rangoHook, permisos, null);
  useEffect(() => {
    const main = document.querySelector<HTMLElement>('.service-main');
    if (!main) return;
    const guardar = () => {
      // La carga inicial no debe borrar el scroll que aún se va a restaurar.
      if (contextoGuardado && !scrollRestaurado.current) return;
      try { sessionStorage.setItem(contextoKey, JSON.stringify({
        fecha: fechaAInput(diaSeleccionado), equipo, orden: ordenTecnicos, scroll: main.scrollTop,
      })); } catch { /* almacenamiento deshabilitado: navegación sigue disponible */ }
    };
    guardar();
    main.addEventListener('scroll', guardar, { passive: true });
    return () => main.removeEventListener('scroll', guardar);
  }, [contextoKey, contextoGuardado, diaSeleccionado, equipo, ordenTecnicos]);
  useEffect(() => {
    if (!contextoGuardado || scrollRestaurado.current || datos.cargandoOrdenes) return;
    const frame = requestAnimationFrame(() => {
      const main = document.querySelector<HTMLElement>('.service-main');
      if (main) main.scrollTop = contextoGuardado.scroll || 0;
      scrollRestaurado.current = true;
    });
    return () => cancelAnimationFrame(frame);
  }, [contextoGuardado, datos.cargandoOrdenes]);
  const piezasAbiertas = useMemo(() => datos.standby.filter(p => p.estado !== 'llego'), [datos.standby]);
  const idsConPiezas = useMemo(() => new Set(piezasAbiertas.map(p => p.ordenId)), [piezasAbiertas]);
  const conEspera = useCallback((o: OrdenServicio) => idsConPiezas.has(o.id) ? { ...o, enStandby: true } : o, [idsConPiezas]);
  const ordenesDelDia = useMemo(() => datos.ordenes.map(conEspera), [datos.ordenes, conEspera]);
  const cerrarFicha = useCallback(() => setTecnicoAbiertoId(null), []);

  const equipoFiltro: EquipoOperacion | null = equipo === 'todos' ? null : equipo;

  const tecnicosFiltrados = useMemo(
    () => tecnicosVisibles(datos.personal, equipoFiltro),
    [datos.personal, equipoFiltro],
  );

  const cargarAnteriores = datos.cargarAbiertosAnterioresPara;
  // Carga de pendientes anteriores por técnico — lazy.
  useEffect(() => {
    if (rangoInvalido || !ordenesVer || !personalVer) return;
    if (!tecnicosFiltrados.length) return;
    const ids = tecnicosFiltrados.flatMap((p) => [p.uid, p.id].filter(Boolean) as string[]);
    cargarAnteriores(ids);
  }, [tecnicosFiltrados, rangoInvalido, ordenesVer, personalVer, rangoHook.inicio, cargarAnteriores]);

  const ordenesConfiables = ordenesVer && !datos.cargandoOrdenes && !datos.errorOrdenes;
  const datosConfiables = ordenesVer && personalVer && !datos.cargandoOrdenes && !datos.cargandoPersonal && !datos.errorOrdenes && !datos.errorPersonal;
  const estadosAnteriores = tecnicosFiltrados.map(t => combinarPendientes(t, datos.abiertosAnterioresPorTecnico));
  const anterioresCargando = estadosAnteriores.some(e => e.cargando);
  const anterioresError = estadosAnteriores.some(e => e.error);
  const atencionParcial = anterioresCargando || anterioresError || datos.cargandoStandby || !!datos.errorStandby || !personalVer;


  const resumen = useMemo(
    () =>
      resumirDia({
        ordenes: ordenesDelDia,
        personal: datos.personal,
        ahora,
        equipo: equipoFiltro,
      }),
    [ordenesDelDia, datos.personal, ahora, equipoFiltro],
  );

  const progresoHoy = useMemo(
    () =>
      progresoDelDia(
        ordenesDelDia.filter((o) =>
          equipoFiltro ? equipoFiltro === equipoDeOperaria(o.operariaNombre) : true,
        ),
        ahora,
      ),
    [ordenesDelDia, ahora, equipoFiltro],
  );

  // Backlog aplanado (pendientes anteriores) — ya filtramos duplicados.
  const pendientesAnterioresPlano = useMemo(() => {
    const todos: OrdenServicio[] = [];
    for (const est of Object.values(datos.abiertosAnterioresPorTecnico)) {
      for (const o of est.ordenes) todos.push(conEspera(o));
    }
    const idsVistos = new Set<string>();
    return todos.filter((o) => {
      if (idsVistos.has(o.id)) return false;
      idsVistos.add(o.id);
      if (equipoFiltro) {
        const eq = equipoDeOperaria(o.operariaNombre);
        if (!eq || eq !== equipoFiltro) return false;
      }
      return true;
    });
  }, [datos.abiertosAnterioresPorTecnico, equipoFiltro, conEspera]);

  const agrupacion = useMemo(
    () =>
      agregarAvisos({
        ordenes: ordenesDelDia,
        pendientesAnteriores: pendientesAnterioresPlano,
        ahora,
        equipo: equipoFiltro,
        personal: datos.personal,
        limiteCategoria: 4,
      }),
    [ordenesDelDia, pendientesAnterioresPlano, ahora, equipoFiltro, datos.personal],
  );

  const tecnicosOrdenados = useMemo(() => {
    const copia = [...tecnicosFiltrados];
    if (ordenTecnicos === 'nombre') {
      copia.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
      return copia;
    }
    const score = new Map<string, { avance: number; atencion: number }>();
    for (const t of copia) {
      const j = jornadaTecnico(t, ordenesDelDia, ahora);
      const total = j.length;
      const cerradas = j.filter((x) => x.progreso.completa).length;
      const atraso = Math.max(0, ...j.map((x) => x.progreso.atrasoMin));
      const standby = j.filter((x) => x.progreso.standby).length;
      const garantiaAbierta = j.filter((x) => x.progreso.garantia && !x.progreso.completa).length;
      const atencion = atraso * 100 + garantiaAbierta * 50 + standby * 20;
      score.set(idOperativoTecnico(t), { avance: total ? cerradas / total : 0, atencion });
    }
    copia.sort((a, b) => {
      const sa = score.get(idOperativoTecnico(a))!;
      const sb = score.get(idOperativoTecnico(b))!;
      if (ordenTecnicos === 'atencion') {
        if (sa.atencion !== sb.atencion) return sb.atencion - sa.atencion;
        return sa.avance - sb.avance;
      }
      return sb.avance - sa.avance;
    });
    return copia;
  }, [tecnicosFiltrados, ordenTecnicos, ordenesDelDia, ahora]);

  const tecnicoAbierto: Personal | null = useMemo(() => {
    if (!tecnicoAbiertoId) return null;
    // Buscar por canónico OR docId: aceptamos legacy que use doc id.
    return (
      tecnicosFiltrados.find(
        (p) => idOperativoTecnico(p) === tecnicoAbiertoId || p.id === tecnicoAbiertoId,
      ) ?? null
    );
  }, [tecnicoAbiertoId, tecnicosFiltrados]);

  const abrirTecnicoDesdeAviso = useCallback(
    (tecnicoId: string) => {
      // El aviso trae `tecnicoId` crudo (uid o docId). Buscamos la persona.
      const p = tecnicosFiltrados.find((x) => x.uid === tecnicoId || x.id === tecnicoId);
      if (p) setTecnicoAbiertoId(idOperativoTecnico(p));
    },
    [tecnicosFiltrados],
  );

  const diaHumano = useMemo(() => {
    try {
      return new Intl.DateTimeFormat('es-DO', {
        timeZone: 'America/Santo_Domingo',
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }).format(diaSeleccionado);
    } catch {
      return diaSeleccionado.toDateString();
    }
  }, [diaSeleccionado]);

  const reloj = useMemo(() => {
    try {
      return new Intl.DateTimeFormat('es-DO', {
        timeZone: 'America/Santo_Domingo',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(ahora);
    } catch {
      return `${ahora.getHours()}:${String(ahora.getMinutes()).padStart(2, '0')}`;
    }
  }, [ahora]);

  if (!ordenesVer) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold text-slate-900">Centro de operaciones</h1>
        <p className="mt-2 text-sm text-slate-600">
          No tienes permiso para ver órdenes. Contacta al administrador si crees que es un error.
        </p>
      </div>
    );
  }

  const sheetTecnicoJornada = tecnicoAbierto ? jornadaTecnico(tecnicoAbierto, ordenesDelDia, ahora) : [];
  const sheetBacklogEstado = tecnicoAbierto ? combinarPendientes(tecnicoAbierto, datos.abiertosAnterioresPorTecnico) : undefined;
  const sheetBacklog = (sheetBacklogEstado?.ordenes ?? []).map(conEspera);
  const sheetStandby = tecnicoAbierto
    ? piezasAbiertas.filter((s) => {
        if (!s.ordenId) return false;
        const encaja =
          sheetBacklog.some((o) => o.id === s.ordenId) || sheetTecnicoJornada.some((j) => j.orden.id === s.ordenId);
        return encaja;
      })
    : [];

  return (
    <div className={`min-h-screen pb-10 ${esTv ? 'bg-slate-900' : 'bg-slate-100'}`}>
      {/* Header local — se envuelve en mobile; en TV queda minimal. */}
      <header className={`border-b ${esTv ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-white'}`}>
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
          <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
            <h1 className={`font-semibold ${esTv ? 'text-2xl text-white' : 'text-lg text-slate-900'}`}>
              Centro de operaciones{esTv ? ' · TV' : ''}
            </h1>
            <p className={`text-xs ${esTv ? 'text-slate-300' : 'text-slate-500'}`}>
              {diaHumano}
              {personalVer && datosConfiables ? ` · ${resumen.tecnicosActivos} técnico${resumen.tecnicosActivos === 1 ? '' : 's'} activos` : ''}
              {equipoFiltro ? ` · Equipo ${equipoFiltro}` : ''}
            </p>
          </div>
          <span
            className={`tabular-nums font-medium ${esTv ? 'text-2xl text-white' : 'text-base text-slate-700'}`}
            aria-label="Hora actual"
          >
            {reloj}
          </span>
          {!esTv && (
            <>
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <span>Día</span>
                <input
                  type="date"
                  value={fechaAInput(diaSeleccionado)}
                  onChange={(e) => {
                    const nueva = fechaDesdeInput(e.target.value);
                    if (nueva) setDiaSeleccionado(nueva);
                  }}
                  className="min-h-[44px] rounded border border-slate-300 bg-white px-2 py-1 text-sm"
                  aria-label="Elegir día"
                />
              </label>
              <div
                role="group"
                aria-label="Filtrar por equipo"
                className="flex gap-1 rounded-md bg-slate-100 p-1 text-xs"
              >
                {(['todos', 'A', 'B'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setEquipo(v)}
                    aria-pressed={equipo === v}
                    className={`min-h-[44px] rounded px-3 font-medium ${
                      equipo === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {v === 'todos' ? 'Todos' : v === 'A' ? 'Equipo A · Wila' : 'Equipo B · Yohana'}
                  </button>
                ))}
              </div>
              <nav aria-label="Vistas relacionadas" className="flex gap-2 text-xs">
                <Link
                  to="/admin/mapa"
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-700 hover:bg-slate-50"
                >
                  <MapIcon size={14} aria-hidden /> Mapa
                </Link>
                <Link
                  to="/admin/agenda-dia"
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-700 hover:bg-slate-50"
                >
                  <CalendarCheck size={14} aria-hidden /> Agenda del día
                </Link>
                <Link
                  to="/admin/operaciones?modo=tv"
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-700 hover:bg-slate-50"
                  title="Modo televisor del Centro"
                >
                  <Tv size={14} aria-hidden /> Modo TV
                </Link>
              </nav>
            </>
          )}
          {esTv && (
            <Link
              to="/admin/operaciones"
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-slate-600 bg-slate-700 px-3 py-2 text-slate-100 hover:bg-slate-600"
            >
              Salir de TV
            </Link>
          )}
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-4 px-4 pt-4">
        {!esTv && puedeInbox && <details className="rounded-xl border border-slate-200 bg-white">
          <summary className="cursor-pointer px-4 py-3 font-semibold text-slate-900">Planificación del siguiente día laboral</summary>
          <div className="grid gap-3 p-4 pt-0">
            <RecordatorioBanner tipo="ruta_manana" mantenerPendiente tickSeed={Math.floor(ahora.getTime() / 60000)} />
            <RecordatorioBanner tipo="horarios_clientes" mantenerPendiente tickSeed={Math.floor(ahora.getTime() / 60000)} />
            <LoteHorariosManana />
          </div>
        </details>}

        {rangoInvalido && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            Día inválido. Elige una fecha válida en el calendario.
          </div>
        )}

        {datos.errorOrdenes && (
          <div data-testid="error-ordenes" className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">
            No pudimos leer las órdenes: {datos.errorOrdenes}
          </div>
        )}
        {datos.errorPersonal && (
          <div data-testid="error-personal" className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">
            No pudimos leer el personal: {datos.errorPersonal}
          </div>
        )}

        {!personalVer && (
          <div data-testid="aviso-sin-personal" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            No tienes permiso para ver personal. El resumen de técnicos no se mostrará.
          </div>
        )}

        {(datos.cargandoOrdenes || datos.cargandoPersonal) && (
          <div data-testid="cargando-datos" className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-500">
            Cargando datos del día…
          </div>
        )}

        {/* Lote C — Prioridad del día dentro del Centro de operaciones.
            Clientes de hoy / Atrasados activos / Esperando respuesta.
            Enlaces a /admin/inbox/:waId?volverA=operaciones conservando
            contexto. Dedup entre categorías: un mismo cliente aparece una
            sola vez. En modo TV se agranda y oculta descripciones. */}
        {ordenesConfiables && (
          <PrioridadDelDia
            modo={modoVista}
            avisos={agrupacion.avisos}
            ordenesDelDia={ordenesDelDia}
            conversaciones={conversaciones}
            ahora={ahora}
            cargando={datos.cargandoOrdenes || datos.cargandoPersonal}
            errorConversaciones={errorConversaciones}
          />
        )}

        {datosConfiables && !datos.cargandoStandby && !datos.errorStandby ? (
          <ResumenDia resumen={resumen} />
        ) : (
          <div
            data-testid="resumen-sin-datos"
            className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500"
          >
            {datos.errorOrdenes || datos.errorPersonal
              ? 'Resumen no disponible — hubo un error leyendo datos.'
              : 'Resumen en espera de datos…'}
          </div>
        )}

        {(anterioresCargando || anterioresError || datos.cargandoStandby || datos.errorStandby) && (
          <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p>Datos parciales: {anterioresError ? 'no se pudieron leer algunos pendientes anteriores.' : anterioresCargando ? 'cargando pendientes anteriores…' : ''} {datos.errorStandby ? 'No se pudieron leer las piezas pendientes.' : datos.cargandoStandby ? 'Cargando piezas pendientes…' : ''}</p>
            {anterioresError && <button type="button" className="mt-2 min-h-11 rounded border border-amber-300 px-3" onClick={() => [...new Set(tecnicosFiltrados.flatMap(t => [t.uid, t.id].filter(Boolean) as string[]))].forEach(id => datos.refrescarAbiertosAnterioresPara(id))}>Reintentar pendientes</button>}
          </div>
        )}
        <div className="grid items-start gap-4 lg:grid-cols-[1.1fr_1fr]">
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <header className="mb-3 flex items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-800">Requiere atención</h2>
            </header>
            {ordenesConfiables ? (
              <ListaAtencion
                datosIncompletos={atencionParcial}
                avisos={agrupacion.avisos}
                conteosCategoria={agrupacion.conteosCategoria}
                totalesCategoria={agrupacion.totalesCategoria}
                avisosPorCategoria={agrupacion.avisosPorCategoria}
                onAbrirTecnico={personalVer && !datos.errorPersonal && !datos.cargandoPersonal ? abrirTecnicoDesdeAviso : undefined}
                puedeAbrirOrden={ordenesVer}
              />
            ) : (
              <p data-testid="atencion-sin-datos" className="text-xs text-slate-500">
                {datos.errorOrdenes ? 'No pudimos cargar los avisos.' : 'Esperando datos del día…'}
              </p>
            )}
          </section>
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <header className="mb-3 flex items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-800">Órdenes del día</h2>
              {datosConfiables && (
                <span className="text-xs text-slate-500">
                  {resumen.cerradas}/{resumen.totalDelDia} cerradas
                </span>
              )}
            </header>
            {datos.cargandoOrdenes ? (
              <p className="text-xs text-slate-500">Cargando órdenes…</p>
            ) : datos.errorOrdenes ? (
              <p className="text-xs text-rose-600">No pudimos cargar la distribución del día.</p>
            ) : (
              <>
                <BarraEstadoHoy progreso={progresoHoy} />
                <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50 p-3" data-testid="respuestas-pendientes">
                  <h3 className="text-sm font-semibold text-sky-950">Clientes que necesitan respuesta</h3>
                  <p className="mt-1 text-sm text-sky-900">
                    {agrupacion.totalesCategoria.chequeo_por_revisar} chequeos por revisar · {agrupacion.totalesCategoria.precio_por_revisar} diagnósticos y precios por revisar · {agrupacion.totalesCategoria.cliente_por_confirmar} clientes por contactar
                  </p>
                  <p className="mt-1 text-xs text-slate-600">Incluye pendientes anteriores. Abre el cliente en «Requiere atención» para responder desde su orden. La aprobación de oficina se registra en la orden.</p>
                  {atencionParcial && <p className="mt-1 text-xs text-amber-800">Conteo parcial: quedan datos por verificar.</p>}
                </div>
                </>
            )}
          </section>
        </div>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <header className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-4">
            <h2 className="mr-auto text-sm font-semibold text-slate-800">
              Técnicos{' '}
              {personalVer && !datos.cargandoPersonal && !datos.errorPersonal && (
                <span className="text-xs font-normal text-slate-500">
                  ({tecnicosFiltrados.length})
                </span>
              )}
            </h2>
            <div
              role="group"
              aria-label="Ordenar técnicos"
              className="flex gap-1 rounded-md bg-slate-100 p-1 text-xs"
            >
              {([
                { k: 'atencion' as const, l: 'Atención primero' },
                { k: 'avance' as const, l: 'Por avance' },
                { k: 'nombre' as const, l: 'Por nombre' },
              ]).map((o) => (
                <button
                  key={o.k}
                  type="button"
                  onClick={() => setOrdenTecnicos(o.k)}
                  aria-pressed={ordenTecnicos === o.k}
                  className={`min-h-[44px] rounded px-3 font-medium ${
                    ordenTecnicos === o.k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {o.l}
                </button>
              ))}
            </div>
          </header>
          <div className="px-2">
            {!personalVer ? (
              <p data-testid="tecnicos-sin-permiso" className="p-4 text-xs text-slate-500">
                Sin permiso de personal. No se puede listar técnicos.
              </p>
            ) : datos.cargandoPersonal ? (
              <p data-testid="tecnicos-cargando" className="p-4 text-xs text-slate-500">
                Cargando técnicos…
              </p>
            ) : datos.errorPersonal ? (
              <p className="p-4 text-xs text-rose-600">No pudimos cargar el personal.</p>
            ) : !ordenesConfiables ? (
              <p className="p-4 text-sm text-slate-600">{datos.errorOrdenes ? 'Jornadas no disponibles por un error al leer las órdenes.' : 'Cargando las jornadas de los técnicos…'}</p>
            ) : tecnicosOrdenados.length === 0 ? (
              <p className="p-4 text-xs text-slate-500">
                No hay técnicos{equipoFiltro ? ` en el equipo ${equipoFiltro}` : ''} disponibles.
              </p>
            ) : (
              tecnicosOrdenados.map((t) => {
                const jornada = jornadaTecnico(t, ordenesDelDia, ahora);
                const estado = estadoActualTecnico(t, jornada, ahora, { esDiaDeHoyRD });
                const anterioresEstado = combinarPendientes(t, datos.abiertosAnterioresPorTecnico);
                const anterioresCount = anterioresEstado?.ordenes.length ?? 0;
                return (
                  <LineaTecnico
                    key={idOperativoTecnico(t)}
                    tecnico={t}
                    jornada={jornada}
                    estado={estado}
                    pendientesAnteriores={anterioresCount}
                    estadoPendientes={anterioresEstado.error ? 'Pendientes anteriores no disponibles' : anterioresEstado.cargando ? 'Cargando pendientes anteriores…' : undefined}
                    puedeAbrirOrden={ordenesVer}
                    onAbrirFicha={() => setTecnicoAbiertoId(idOperativoTecnico(t))}
                  />
                );
              })
            )}
          </div>
        </section>
      </main>

      {tecnicoAbierto && datosConfiables && (
        <FichaTecnicoSheet
          tecnico={tecnicoAbierto}
          jornada={sheetTecnicoJornada}
          pendientesAnteriores={sheetBacklog}
          standbyItems={sheetStandby}
          cargandoPendientesAnteriores={sheetBacklogEstado?.cargando}
          errorPendientesAnteriores={sheetBacklogEstado?.error ?? null}
          cargandoStandby={datos.cargandoStandby}
          errorStandby={datos.errorStandby}
          esDiaDeHoyRD={esDiaDeHoyRD}
          ahora={ahora}
          puedeAbrirOrden={ordenesVer}
          puedeAbrirCliente={clientesVer}
          onCerrar={cerrarFicha}
        />
      )}
    </div>
  );
}
