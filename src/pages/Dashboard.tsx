import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  ClipboardList, DollarSign, AlertTriangle,
  ChevronRight, Calendar, User,
  FileText, Receipt, BarChart3, Users, Timer
} from 'lucide-react';
import { differenceInDays, startOfDay, startOfWeek, startOfMonth, startOfYear, format as formatDate } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  OrdenServicio, StandbyPieza, Factura, Cotizacion, Personal, Gasto, FaseOrden, PiezaInventario
} from '../types';
import { puede } from '../utils/permisos';
import { Link } from 'react-router-dom';
import { Boxes, Wallet } from 'lucide-react';
import { calcularQuincenaActual } from '../utils/comisiones';
import {
  faseLabel, faseBgColor, formatMoneda, formatHora,
  getAlertasFromOrdenes, getStandbyAlertas,
  parseOrden, getTecnicoColor,
  FASES_ORDENADAS, parsePiezaInventario
} from '../utils';
// SPRINT-REPORTING-1 (2026-05-25): helpers compartidos de KPI.
import { ingresosFacturasPagadas, conducesEmitidosMonto, conducesEmitidosCount } from '../utils/kpis';
import { SkeletonBox, SkeletonText, SkeletonKpiCard, SkeletonSectionBlock } from '../components/Skeleton';
import Badge from '../components/Badge';
import EliminarOrdenButton from '../components/ordenes/EliminarOrdenButton';
import { useApp } from '../context/AppContext';
import { Eye } from 'lucide-react';
import toast from 'react-hot-toast';
import RecordatorioBanner from '../components/recordatorios/RecordatorioBanner';
import {
  obtenerRecordatoriosDelDia, marcarNotificadoAAdmin,
} from '../services/recordatorios.service';
import { crearNotificacion } from '../services/notificaciones.service';
// SPRINT-INBOX-6 (2026-05-20): cards de comunicación.
import {
  suscribirMetricasInbox,
  type MetricasInbox,
} from '../services/whatsappInbox.service';
import { MessageSquare, Clock as ClockIcon } from 'lucide-react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FASES_EMBUDO: FaseOrden[] = [...FASES_ORDENADAS, 'cancelado'];

type PeriodoVentas = 'hoy' | 'semana' | 'mes' | 'año';

// SPRINT-INBOX-6 helpers (2026-05-20).
function formatearLagRespuesta(segundos: number): string {
  if (segundos < 60) return `${Math.round(segundos)}s`;
  const min = Math.round(segundos / 60);
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h < 24) return m > 0 ? `${h}h ${m}min` : `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

function hace(t: unknown): string {
  if (!t) return '—';
  const date =
    t instanceof Date
      ? t
      : new Date((t as { toMillis?: () => number })?.toMillis?.() ?? 0);
  if (date.getTime() === 0) return '—';
  const segundos = (Date.now() - date.getTime()) / 1000;
  if (segundos < 0) return 'hace 0s';
  return `hace ${formatearLagRespuesta(segundos)}`;
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export default function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  // SPRINT-149: `currentUser` necesario para filtros operaria que comparan
  // contra `o.operariaId` (post-SPRINT-105 persiste auth.uid). `userProfile.id`
  // puede ser docId en cascada `personal/` (path B de AppContext).
  const { userProfile, currentUser } = useApp();

  // Toast cuando el usuario es redirigido aquí por falta de permisos
  useEffect(() => {
    const state = location.state as { permisoDenegado?: string } | null;
    if (state?.permisoDenegado) {
      toast.error(`No tienes permiso para acceder a "${state.permisoDenegado}"`);
      window.history.replaceState({}, '');
    }
  }, [location.state]);

  // Tick cada 60s para que los banners de recordatorio re-evalúen la ventana
  const [recordatoriosTick, setRecordatoriosTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setRecordatoriosTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // ---- state ----
  const [loading, setLoading] = useState(true);
  const [ordenesRaw, setOrdenesRaw] = useState<OrdenServicio[]>([]);
  const [verTodasOperarias, setVerTodasOperarias] = useState(false);
  const [standbyItems, setStandbyItems] = useState<StandbyPieza[]>([]);
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [personal, setPersonal] = useState<Personal[]>([]);
  const [piezasInventario, setPiezasInventario] = useState<PiezaInventario[]>([]);
  // Comisiones pendientes para widget de nómina próxima (Fase 6)
  const [comisionesPendientes, setComisionesPendientes] = useState<{ tecnicoId: string; comisionMonto: number; quincenaAsignada?: string }[]>([]);
  const [periodoVentas, setPeriodoVentas] = useState<PeriodoVentas>('mes');

  // ---- real-time listeners ----
  useEffect(() => {
    let loadedCount = 0;
    const total = 6;
    const checkLoaded = () => { loadedCount++; if (loadedCount >= total) setLoading(false); };

    const unsubOrdenes = onSnapshot(collection(db, 'ordenes_servicio'), (snap) => {
      const data = snap.docs.map(d => parseOrden(d.id, d.data()) as OrdenServicio);
      setOrdenesRaw(data);
      checkLoaded();
    });

    const unsubStandby = onSnapshot(collection(db, 'standby_piezas'), (snap) => {
      const data = snap.docs.map(d => ({
        id: d.id,
        ...d.data(),
        fechaInicio: d.data().fechaInicio?.toDate?.() || new Date(),
        createdAt: d.data().createdAt?.toDate?.() || new Date(),
      } as StandbyPieza));
      setStandbyItems(data);
      checkLoaded();
    });

    const unsubFacturas = onSnapshot(collection(db, 'facturas'), (snap) => {
      const data = snap.docs.map(d => {
        const raw = d.data();
        return {
          id: d.id,
          ...raw,
          fechaEmision: raw.fechaEmision?.toDate?.() || new Date(),
          fechaPago: raw.fechaPago?.toDate?.() || null,
          fechaVencimiento: raw.fechaVencimiento?.toDate?.() || null,
          createdAt: raw.createdAt?.toDate?.() || new Date(),
        } as Factura;
      });
      setFacturas(data);
      checkLoaded();
    });

    const unsubCotizaciones = onSnapshot(collection(db, 'cotizaciones'), (snap) => {
      const data = snap.docs.map(d => {
        const raw = d.data();
        return {
          id: d.id,
          ...raw,
          createdAt: raw.createdAt?.toDate?.() || new Date(),
          updatedAt: raw.updatedAt?.toDate?.() || new Date(),
        } as Cotizacion;
      });
      setCotizaciones(data);
      checkLoaded();
    });

    const unsubGastos = onSnapshot(collection(db, 'gastos'), (snap) => {
      const data = snap.docs.map(d => {
        const raw = d.data();
        return {
          id: d.id,
          ...raw,
          fecha: raw.fecha?.toDate?.() || new Date(),
          createdAt: raw.createdAt?.toDate?.() || new Date(),
        } as Gasto;
      });
      setGastos(data);
      checkLoaded();
    });

    const unsubPersonal = onSnapshot(collection(db, 'personal'), (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Personal));
      setPersonal(data);
      checkLoaded();
    });

    // Comisiones pendientes (Fase 6) — para widget nómina próxima
    // @safe-listener-sin-where: Dashboard es página admin/coord (gateado por
    // sidebar). Rule `comisiones` short-circuit `esAdminOCoord()`. Cazador
    // P-012 no infiere gating UI estáticamente.
    const unsubComisiones = onSnapshot(collection(db, 'comisiones'), (snap) => {
      setComisionesPendientes(snap.docs.map(d => {
        const raw = d.data();
        return {
          tecnicoId: raw.tecnicoId || '',
          comisionMonto: raw.comisionMonto || 0,
          quincenaAsignada: raw.quincenaAsignada,
          estadoLiquidacion: raw.estadoLiquidacion,
        };
      }).filter(c => (c as { estadoLiquidacion?: string }).estadoLiquidacion === 'pendiente'));
    });

    // Inventario (no contamos para checkLoaded para no bloquear el dashboard)
    const unsubPiezas = onSnapshot(collection(db, 'piezas_inventario'), (snap) => {
      setPiezasInventario(snap.docs.map(d => parsePiezaInventario(d.id, d.data())));
    });

    return () => {
      unsubOrdenes(); unsubStandby(); unsubFacturas();
      unsubCotizaciones(); unsubGastos(); unsubPersonal(); unsubPiezas(); unsubComisiones();
    };
  }, []);

  // Auto-notificar a admin/coord cuando una operaria no completa su recordatorio
  // después de que la ventana cerró. Corre en múltiplos de 5 del tick (~5 min).
  useEffect(() => {
    const rol = userProfile?.rol;
    if (rol !== 'administrador' && rol !== 'coordinadora') return;
    if (recordatoriosTick === 0 || recordatoriosTick % 5 !== 0) return;

    const ahora = new Date();
    if (ahora.getDay() === 0) return;
    const hora = ahora.getHours();
    const min = ahora.getMinutes();
    const pasoVentanaRuta = hora > 10 || (hora === 10 && min > 0);
    const pasoVentanaAvisos = hora > 12 || (hora === 12 && min > 0);
    if (!pasoVentanaRuta && !pasoVentanaAvisos) return;

    const hoyStr = formatDate(ahora, 'yyyy-MM-dd');
    (async () => {
      try {
        const recs = await obtenerRecordatoriosDelDia(hoyStr);
        const operariasActivas = personal.filter(p => p.rol === 'operaria' && p.activo);
        // Filtramos por p.uid para excluir admins/coords pre-SPRINT-105 sin doc
        // espejo en `usuarios/{uid}`. La rule de Firestore filtra notificaciones
        // por `userId == request.auth.uid`, así que `admin.uid` (no `admin.id`)
        // es el valor correcto. Cazador P-007 enforce este patrón.
        const adminsYCoord = personal.filter(
          p =>
            (p.rol === 'administrador' || p.rol === 'coordinadora') &&
            p.activo &&
            !!p.uid,
        );
        if (adminsYCoord.length === 0) return;
        for (const op of operariasActivas) {
          for (const tipo of ['ruta_manana', 'horarios_clientes'] as const) {
            if (tipo === 'ruta_manana' && !pasoVentanaRuta) continue;
            if (tipo === 'horarios_clientes' && !pasoVentanaAvisos) continue;
            // SPRINT-149 (P-006 variante operariaId): `r.operariaId` proviene del
            // recordatorios.service que en SPRINT-105+ persiste auth.uid; fallback
            // a `op.id` legacy.
            const rec = recs.find(r => r.operariaId === (op.uid || op.id) && r.tipo === tipo);
            if (!rec) continue;
            if (rec.completado) continue;
            if (rec.notificadoAAdmin) continue;
            const tipoLabel = tipo === 'ruta_manana' ? 'organización de ruta' : 'avisos a clientes';
            for (const admin of adminsYCoord) {
              await crearNotificacion({
                userId: admin.uid!,
                destinatarioNombre: admin.nombre,
                tipo: 'recordatorio',
                titulo: 'Recordatorio vencido',
                mensaje: `La operaria ${op.nombre} no completó el recordatorio de ${tipoLabel} del día.`,
              }).catch(console.error);
            }
            await marcarNotificadoAAdmin(rec.id).catch(console.error);
          }
        }
      } catch (err) {
        console.error('Error revisando recordatorios vencidos:', err);
      }
    })();
  }, [recordatoriosTick, userProfile?.rol, personal]);

  // ---- operaria filter ----
  const esOperaria = userProfile?.rol === 'operaria';
  const esCoordinadora = userProfile?.rol === 'coordinadora';

  // SPRINT-INBOX-6 (2026-05-20): métricas de comunicación WhatsApp.
  // Gateado por rol oficina (admin/coord/secretaria); operaria/técnico
  // no necesitan estas cards en su Dashboard (su rol está en operativa).
  const [metricasInbox, setMetricasInbox] = useState<MetricasInbox>({
    sinResponder: 0,
    medianaRespuestaSegundos: null,
    masAntiguaSinResponder: null,
  });
  const verCardsInbox =
    userProfile?.rol === 'administrador' ||
    userProfile?.rol === 'coordinadora' ||
    userProfile?.rol === 'secretaria';
  useEffect(() => {
    if (!verCardsInbox) return;
    const unsub = suscribirMetricasInbox(setMetricasInbox);
    return () => unsub();
  }, [verCardsInbox]);
  const filtroOperariaActivo = esOperaria && !verTodasOperarias;
  // Coordinadora puede filtrar por una operaria específica (default: ver todas)
  const [filtroOperariaCoord, setFiltroOperariaCoord] = useState<string>('');

  const ordenes = useMemo(() => {
    // Excluir órdenes eliminadas (soft delete) en todas las métricas del dashboard
    let lista = ordenesRaw.filter(o => !o.eliminada);
    if (filtroOperariaActivo) {
      // SPRINT-149 (P-006 variante operariaId): comparar contra `currentUser?.uid` con
      // fallback a `userProfile?.id` para operarias pre-SPRINT-105 cargadas vía cascada
      // `personal/` (path B de AppContext, donde userProfile.id es docId, no uid).
      lista = lista.filter(o => o.operariaId === (currentUser?.uid || userProfile?.id));
    }
    // Filtro por operaria seleccionada (coordinadora)
    if (esCoordinadora && filtroOperariaCoord) {
      if (filtroOperariaCoord === '__sin_asignar__') {
        lista = lista.filter(o => !o.operariaId);
      } else {
        // SPRINT-149: el dropdown ahora emite `(op.uid || op.id)` (ver renderer abajo).
        lista = lista.filter(o => o.operariaId === filtroOperariaCoord);
      }
    }
    return lista;
  }, [ordenesRaw, filtroOperariaActivo, userProfile?.id, currentUser?.uid, esCoordinadora, filtroOperariaCoord]);

  // ---- derived data ----
  const now = new Date();
  const today = startOfDay(now);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const inicioMes = startOfMonth(now);

  // KPI 1 - Cotizaciones pendientes
  const cotizacionesPendientes = useMemo(
    () => cotizaciones.filter(c => c.estado === 'borrador' || c.estado === 'enviada'),
    [cotizaciones]
  );
  const totalCotizacionesPendientes = useMemo(
    () => cotizacionesPendientes.reduce((s, c) => s + (c.total || 0), 0),
    [cotizacionesPendientes]
  );

  // KPI 2 - Ordenes activas hoy
  const ordenesActivasHoy = useMemo(
    () => ordenes.filter(o => o.estado === 'activo' && !['cerrado', 'cancelado'].includes(o.fase)),
    [ordenes]
  );

  // KPI 3 - Conduces emitidos en el mes (independiente del estado de pago)
  // SPRINT-162: tras flujo SPRINT-151 los conduces pasan directo a 'pagada' al
  // verificar pago en el modal Emitir; filtrar por estado='emitida' daba 0.
  // Ahora cuenta TODAS las facturas creadas en el mes en curso (emitidas + pagadas).
  // El KPI "Ingresos del Mes" (abajo) sigue contando solo pagadas — semántica distinta.
  //
  // SPRINT-REPORTING-1 (2026-05-25): ambos KPIs ahora consumen helpers
  // compartidos de `utils/kpis.ts` que excluyen explícitamente facturas
  // `anulada` (defense in depth). Antes Dashboard.tsx sumaba `f.total`
  // sin chequear el estado de anulación más allá del filtro de pagadas.
  const facturasEmitidasMes = useMemo(
    () => facturas.filter(f => f.fechaEmision && f.fechaEmision >= inicioMes && f.estado !== 'anulada'),
    [facturas, inicioMes]
  );
  const totalFacturasEmitidasMes = useMemo(
    () => conducesEmitidosMonto(facturas, inicioMes),
    [facturas, inicioMes]
  );
  // Útil para tarjetas que muestran conteo (no monto).
  const cantFacturasEmitidasMes = useMemo(
    () => conducesEmitidosCount(facturas, inicioMes),
    [facturas, inicioMes]
  );
  void cantFacturasEmitidasMes; // disponible para refactor futuro UI

  // KPI 4 - Ingresos mes — excluye anuladas vía helper compartido.
  const facturasPagadasMes = useMemo(
    () => facturas.filter(f => f.estado === 'pagada' && f.fechaPago && f.fechaPago >= inicioMes),
    [facturas, inicioMes]
  );
  const ingresosMes = useMemo(
    () => ingresosFacturasPagadas(facturas, inicioMes),
    [facturas, inicioMes]
  );

  // Órdenes atrasadas (> 1 día sin avance) — KPI hero del Dashboard.
  // SPRINT-DISENO-C (2026-05-31): el cálculo no cambió, solo la
  // presentación visual (KPI hero arriba en lugar de tabla aislada).
  const ordenesAtrasadas = useMemo(() => {
    return ordenes
      .filter(o => {
        if (o.estado !== 'activo') return false;
        if (['cerrado', 'cancelado', 'trabajo_realizado'].includes(o.fase)) return false;
        const dias = differenceInDays(now, o.createdAt);
        return dias >= 1;
      })
      .map(o => ({ ...o, diasAtraso: differenceInDays(now, o.createdAt) }))
      .sort((a, b) => b.diasAtraso - a.diasAtraso);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordenes]);

  // Embudo conteo
  const faseConteo = useMemo(() => {
    const conteo: Record<string, number> = {};
    FASES_EMBUDO.forEach(f => { conteo[f] = ordenes.filter(o => o.fase === f).length; });
    return conteo;
  }, [ordenes]);

  // Alertas
  const alertasOrdenes = useMemo(() => getAlertasFromOrdenes(ordenes), [ordenes]);
  const alertasStandby = useMemo(() => getStandbyAlertas(standbyItems), [standbyItems]);
  const todasAlertas = useMemo(() => [...alertasOrdenes, ...alertasStandby], [alertasOrdenes, alertasStandby]);

  // Alertas de inventario bajo (Fase 4B)
  const alertasInventario = useMemo(() => {
    return piezasInventario
      .filter(p => p.activo && (p.stockActual === 0 || (p.stockMinimo !== undefined && p.stockMinimo > 0 && p.stockActual <= p.stockMinimo)))
      .sort((a, b) => a.stockActual - b.stockActual)
      .slice(0, 5);
  }, [piezasInventario]);
  const puedeVerInventario = puede(userProfile, 'configuracionVer') ||
    userProfile?.rol === 'administrador' ||
    userProfile?.rol === 'coordinadora';

  // SPRINT-DISENO-I-DATA-SLOP (2026-06-03, pasada 58): los memos
  // `anuladasSemana` (widget "Órdenes anuladas esta semana") y
  // `proyeccionNomina` (widget "Nómina proyectada del mes") se movieron
  // a `src/pages/ReporteAvanzado.tsx` por decisión de Jorge — son
  // analíticos, no operativos del día. Permiso `puedeVerAnuladas` también
  // movido. El CTA "Ver reporte avanzado →" al final del bloque "Equipo
  // y trabajos" lleva al usuario al reporte completo.

  // Nómina próxima (Fase 6) — SE QUEDA: es operativo del día (cuántos
  // días faltan para el próximo pago + comisiones acumuladas de la
  // quincena corriente). El que se movió fue "Nómina proyectada del MES".
  const puedeVerNomina = userProfile?.rol === 'administrador' || userProfile?.rol === 'coordinadora';
  const nominaProxima = useMemo(() => {
    const quincenaActual = calcularQuincenaActual(new Date());
    const totalComisiones = comisionesPendientes
      .filter(c => c.quincenaAsignada === quincenaActual)
      .reduce((s, c) => s + c.comisionMonto, 0);
    const totalSueldos = personal
      .filter(p => p.activo && p.rol !== 'ayudante' && typeof p.sueldoBase === 'number')
      .reduce((s, p) => s + (p.sueldoBase || 0), 0);
    // Día de pago próximo
    const hoy = new Date();
    const diaActual = hoy.getDate();
    let diaPago: Date;
    if (diaActual <= 14) {
      diaPago = new Date(hoy.getFullYear(), hoy.getMonth(), 15);
    } else if (diaActual <= 29) {
      diaPago = new Date(hoy.getFullYear(), hoy.getMonth(), 30);
    } else {
      // 30 o 31 → próximo pago el 15 del mes siguiente
      diaPago = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 15);
    }
    const msPorDia = 1000 * 60 * 60 * 24;
    const diasFaltantes = Math.max(0, Math.ceil((diaPago.getTime() - hoy.getTime()) / msPorDia));
    return {
      quincenaActual,
      totalComisiones,
      totalSueldos,
      totalEstimado: totalComisiones + totalSueldos,
      diasFaltantes,
      diaPagoLabel: diaPago.getDate().toString(),
    };
  }, [comisionesPendientes, personal]);

  // SPRINT-DISENO-I-DATA-SLOP (2026-06-03): `proyeccionNomina` movido a
  // `src/pages/ReporteAvanzado.tsx`. Era widget analítico (proyección
  // mensual), no operativo del día.

  const alertasRojas = todasAlertas.filter(a => a.tipo === 'roja');
  const alertasNaranjas = todasAlertas.filter(a => a.tipo === 'naranja');

  // Ventas vs Gastos por periodo
  const periodoRange = useMemo(() => {
    switch (periodoVentas) {
      case 'hoy': return { start: today, end: tomorrow };
      case 'semana': return { start: startOfWeek(now, { locale: es }), end: tomorrow };
      case 'mes': return { start: inicioMes, end: tomorrow };
      case 'año': return { start: startOfYear(now), end: tomorrow };
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodoVentas, now]);

  const ingresosPeriodo = useMemo(() => {
    return facturas
      .filter(f => f.estado === 'pagada' && f.fechaPago && f.fechaPago >= periodoRange.start && f.fechaPago < periodoRange.end)
      .reduce((s, f) => s + (f.total || 0), 0);
  }, [facturas, periodoRange]);

  const gastosPeriodo = useMemo(() => {
    return gastos
      .filter(g => g.fecha >= periodoRange.start && g.fecha < periodoRange.end)
      .reduce((s, g) => s + (g.monto || 0), 0);
  }, [gastos, periodoRange]);

  const maxVentasGastos = Math.max(ingresosPeriodo, gastosPeriodo, 1);

  // Balance pendiente
  const facturasPendientes = useMemo(() => facturas.filter(f => f.estado === 'emitida' || f.estado === 'vencida'), [facturas]);
  const pendientesMenos30 = useMemo(() => {
    return facturasPendientes.filter(f => differenceInDays(now, f.fechaEmision) < 30);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facturasPendientes]);
  const pendientesMas30 = useMemo(() => {
    return facturasPendientes.filter(f => differenceInDays(now, f.fechaEmision) >= 30);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facturasPendientes]);

  // Tecnicos activos (filtrados por grupo de operaria si aplica)
  const tecnicos = useMemo(() => {
    const base = personal.filter(p => p.rol === 'tecnico' && p.activo);
    if (!filtroOperariaActivo) return base;
    // SPRINT-149: `t.operariaId` post-SPRINT-105 persiste auth.uid (alineado con
    // `ordenes_servicio.operariaId`). Patrón canónico: `currentUser?.uid` primero,
    // fallback a `userProfile?.id` solo para operarias legacy sin doc espejo en
    // usuarios/{uid}. No es write a Firestore — filtro client-side puro.
    // @safe-userprofile-id: filtro client-side con fallback intencional post-SPRINT-149.
    return base.filter(t => t.operariaId === (currentUser?.uid || userProfile?.id));
    // @safe-userprofile-id: deps array de useMemo, no escribe a Firestore.
  }, [personal, filtroOperariaActivo, userProfile?.id, currentUser?.uid]);

  // Estado de casos por tecnico
  const casosPorTecnico = useMemo(() => {
    return tecnicos.map(t => {
      // SPRINT-149 (P-006 variante reversa): `o.tecnicoId` post-c4be345 persiste auth.uid;
      // fallback `t.id` legacy + tecnicoNombre como red de seguridad UI.
      // @safe-tecnicoid-id: OR explícito ya soporta pre/post c4be345 (tIdAuth || t.id).
      const tIdAuth = t.uid || t.id;
      const ordenesT = ordenes.filter(o => o.tecnicoId === tIdAuth || o.tecnicoId === t.id || o.tecnicoNombre === t.nombre);
      const pendientes = ordenesT.filter(o => ['nuevo_lead', 'en_gestion', 'aprobado', 'agendado'].includes(o.fase) && o.estado === 'activo').length;
      const enProceso = ordenesT.filter(o => ['en_diagnostico', 'en_cotizacion'].includes(o.fase) && o.estado === 'activo').length;
      const completados = ordenesT.filter(o => ['trabajo_realizado', 'cerrado'].includes(o.fase)).length;
      return { tecnico: t, pendientes, enProceso, completados, total: pendientes + enProceso + completados };
    });
  }, [tecnicos, ordenes]);

  // SPRINT-DISENO-I-DATA-SLOP (2026-06-03): `rendimientoTecnicos` y
  // `reparacionesPorTipo` movidos a `src/pages/ReporteAvanzado.tsx`. Son
  // análisis comparativos/históricos, no operativos del día.

  // Agenda del dia
  const agendaHoy = useMemo(() => {
    return ordenes
      .filter(o => {
        const fc = o.fechaCita instanceof Date ? o.fechaCita : null;
        return fc && fc >= today && fc < tomorrow && o.estado === 'activo';
      })
      .sort((a, b) => (a.fechaCita?.getTime() || 0) - (b.fechaCita?.getTime() || 0));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordenes]);

  // ---- loading ----
  // SPRINT-DISENO-C (2026-05-31): skeleton en lugar de spinner full-page.
  // Estructura imita los 3 bloques del Dashboard (Hoy/Pipeline/Plata) para
  // que el usuario perciba la pantalla "armándose", no "esperando".
  if (loading) {
    return (
      <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="space-y-2">
          <SkeletonText className="w-40 h-7" />
          <SkeletonText className="w-64 h-3" />
        </div>
        {/* KPI Hero "Órdenes atrasadas" */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <SkeletonText className="w-32 h-4" />
          <SkeletonBox className="h-16 w-32 rounded mt-3" />
        </div>
        {/* 4 KPI cards Hoy */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <SkeletonKpiCard />
          <SkeletonKpiCard />
          <SkeletonKpiCard />
          <SkeletonKpiCard />
        </div>
        {/* Bloque Pipeline */}
        <SkeletonSectionBlock rows={3} />
        {/* Bloque Plata */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SkeletonSectionBlock rows={2} />
          <SkeletonSectionBlock rows={2} />
        </div>
      </div>
    );
  }

  // ---- render ----
  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Watermark sutil con el logo del brand */}
      <div
        aria-hidden="true"
        className="fixed bottom-8 right-8 opacity-5 pointer-events-none z-0"
        style={{
          backgroundImage: 'url(/logo-compacto.png)',
          backgroundSize: 'contain',
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'bottom right',
          width: '400px',
          height: '400px',
        }}
      />

      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-primary">Dashboard</h1>
          <p className="text-gray-500 text-sm">
            {now.toLocaleDateString('es-DO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
          {esOperaria && (
            <p className="text-xs text-primary-medium mt-1">
              {filtroOperariaActivo
                ? `Viendo solo tu grupo · ${tecnicos.length} técnico${tecnicos.length !== 1 ? 's' : ''}`
                : 'Viendo todas las operarias (modo apoyo)'}
            </p>
          )}
        </div>
        {esOperaria && (
          <button
            type="button"
            onClick={() => setVerTodasOperarias(v => !v)}
            className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium text-primary-medium bg-white border border-primary-medium/30 rounded-lg hover:bg-primary-medium/5 transition-colors"
          >
            <Eye size={14} />
            {filtroOperariaActivo ? 'Ver todas las operarias' : 'Ver solo mi grupo'}
          </button>
        )}
        {esCoordinadora && (
          <select
            value={filtroOperariaCoord}
            onChange={e => setFiltroOperariaCoord(e.target.value)}
            className="px-3 py-2 text-xs font-medium border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-medium"
          >
            <option value="">Ver todas las operarias</option>
            <option value="__sin_asignar__">Sin operaria asignada</option>
            {personal
              .filter(p => p.activo && (p.rol === 'operaria' || p.rol === 'coordinadora'))
              .map(p => (
                // SPRINT-149 (P-006 variante operariaId): emitir `p.uid || p.id` para
                // que el filtro upstream compare contra `o.operariaId` que persiste
                // auth.uid post-SPRINT-105 (fallback docId legacy).
                <option key={p.id} value={p.uid || p.id}>
                  {p.nombre}{(p.uid || p.id) === (currentUser?.uid || userProfile?.id) ? ' (mi grupo)' : ''}
                </option>
              ))}
          </select>
        )}
      </div>

      {/* ======== RECORDATORIOS DIARIOS ======== */}
      <div className="space-y-3">
        <RecordatorioBanner tipo="ruta_manana" tickSeed={recordatoriosTick} />
        <RecordatorioBanner tipo="horarios_clientes" tickSeed={recordatoriosTick} />
      </div>

      {/* ════════════════════════════════════════════════════════════
          SPRINT-DISENO-C (2026-05-31): el Dashboard se reorganizó en
          3 bloques visualmente separados:
            HOY     — KPI hero "Órdenes atrasadas" + 4 KPI cards + inbox + agenda
            PIPELINE — embudo + alertas + estado/rendimiento técnicos + reparaciones
            PLATA   — ingresos vs gastos + balance pendiente + nómina
          La regla: lo más "actionable" arriba. "Órdenes atrasadas"
          como KPI hero dominante (0 = bajo control, crece = incendio).
          ════════════════════════════════════════════════════════════ */}

      {/* ════════════ BLOQUE: HOY ════════════ */}
      <BloqueHeader titulo="Hoy" descripcion="Lo que tiene que pasar ahora" />

      {/* === KPI HERO: ÓRDENES ATRASADAS === */}
      {/* Domina la pantalla. Si está en 0 = todo controlado. Si crece = hay incendio. */}
      <KpiHeroAtrasadas
        cantidad={ordenesAtrasadas.length}
        ordenes={ordenesAtrasadas}
        onNavegarOrden={(id) => navigate(`/admin/ordenes/${id}`)}
      />

      {/* ======== 1. KPI CARDS ======== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* SPRINT-DISENO-A.5 (2026-05-31): 4 KPIs neutros unificados a
            color brand. Solo "Ingresos del Mes" preserva verde por
            semántica positiva (dinero entrando = bien). */}
        <KpiCard
          title="Cotizaciones Pendientes"
          value={formatMoneda(totalCotizacionesPendientes)}
          subtitle={`${cotizacionesPendientes.length} pendiente${cotizacionesPendientes.length !== 1 ? 's' : ''}`}
          icon={<FileText size={22} />}
          color="bg-brand-500"
          onClick={() => navigate('/admin/cotizaciones')}
        />
        <KpiCard
          title="Órdenes Activas"
          value={ordenesActivasHoy.length}
          subtitle="activas hoy"
          icon={<ClipboardList size={22} />}
          color="bg-brand-500"
          onClick={() => navigate('/admin/ordenes')}
        />
        <KpiCard
          title="Conduces Emitidos"
          value={formatMoneda(totalFacturasEmitidasMes)}
          subtitle={`${facturasEmitidasMes.length} conduce${facturasEmitidasMes.length !== 1 ? 's' : ''}`}
          icon={<Receipt size={22} />}
          color="bg-brand-500"
          onClick={() => navigate('/admin/facturas')}
        />
        <KpiCard
          title="Ingresos del Mes"
          value={formatMoneda(ingresosMes)}
          subtitle={`${facturasPagadasMes.length} conduce${facturasPagadasMes.length !== 1 ? 's' : ''} pagado${facturasPagadasMes.length !== 1 ? 's' : ''}`}
          icon={<DollarSign size={22} />}
          color="bg-green-500"
          onClick={() => navigate('/admin/facturas')}
        />
      </div>

      {/* ======== 1.5 CARDS COMUNICACIÓN (SPRINT-INBOX-6, 2026-05-20) ========
          Gate por rol oficina (admin/coord/secretaria). Operaria/técnico no
          ven estas cards en su Dashboard. Datos derivan de
          suscribirMetricasInbox (single listener sobre whatsapp_conversaciones
          con denormalización lista, sin leer _inbox masivo). */}
      {verCardsInbox && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <KpiCard
            title="Conversaciones sin responder"
            value={metricasInbox.sinResponder}
            subtitle={
              metricasInbox.sinResponder === 0
                ? 'Bandeja al día'
                : 'mensajes esperando respuesta'
            }
            icon={<MessageSquare size={22} />}
            color={metricasInbox.sinResponder > 0 ? 'bg-amber-500' : 'bg-gray-400'}
            onClick={() => navigate('/admin/inbox')}
          />
          <KpiCard
            title="Tiempo de respuesta (mediana)"
            value={
              metricasInbox.medianaRespuestaSegundos === null
                ? '—'
                : formatearLagRespuesta(metricasInbox.medianaRespuestaSegundos)
            }
            subtitle={
              metricasInbox.medianaRespuestaSegundos === null
                ? 'sin datos todavía'
                : 'desde último entrante a respuesta'
            }
            icon={<ClockIcon size={22} />}
            color="bg-blue-500"
            onClick={() => navigate('/admin/inbox')}
          />
          <KpiCard
            title="Más antigua sin responder"
            value={
              metricasInbox.masAntiguaSinResponder
                ? hace(metricasInbox.masAntiguaSinResponder.ultimoMensajeEntrante?.timestamp)
                : '—'
            }
            subtitle={
              metricasInbox.masAntiguaSinResponder
                ? `Tel ${metricasInbox.masAntiguaSinResponder.wa_id.slice(-4)} — atender`
                : 'nada urgente'
            }
            icon={<MessageSquare size={22} />}
            color={metricasInbox.masAntiguaSinResponder ? 'bg-red-500' : 'bg-gray-400'}
            onClick={() =>
              metricasInbox.masAntiguaSinResponder
                ? navigate(`/admin/inbox/${metricasInbox.masAntiguaSinResponder.wa_id}`)
                : navigate('/admin/inbox')
            }
          />
        </div>
      )}

      {/* (la sección "Órdenes Atrasadas" antigua fue promovida arriba
          como KPI hero del bloque HOY — SPRINT-DISENO-C 2026-05-31) */}

      {/* ════════════ BLOQUE: PIPELINE ════════════ */}
      <BloqueHeader titulo="Pipeline" descripcion="Cómo se mueve el trabajo" />

      {/* ======== 3. EMBUDO VISUAL HORIZONTAL ======== */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Embudo de Servicio</h2>
        <div className="overflow-x-auto pb-2">
          <div className="flex gap-1 min-w-max items-center">
            {FASES_EMBUDO.map((fase, index) => (
              <div key={fase} className="flex items-center">
                <button
                  onClick={() => navigate(`/admin/ordenes?fase=${fase}`)}
                  className="relative px-4 py-3 rounded-xl text-white text-center cursor-pointer hover:opacity-90 hover:scale-105 transition-all min-w-[110px]"
                  style={{ backgroundColor: faseBgColor(fase) }}
                >
                  <div className="text-2xl font-bold">{faseConteo[fase]}</div>
                  <div className="text-xs mt-0.5 opacity-90 leading-tight">{faseLabel(fase)}</div>
                </button>
                {index < FASES_EMBUDO.length - 1 && (
                  <ChevronRight size={18} className="text-gray-300 mx-0.5 flex-shrink-0" />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ======== 4. ALERTAS EN TIEMPO REAL (Pipeline) ======== */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle size={20} className="text-red-500" />
          <h2 className="text-lg font-semibold text-gray-900">Alertas en Tiempo Real</h2>
          {todasAlertas.length > 0 && (
            <span className="bg-red-100 text-red-700 text-xs font-medium px-2 py-0.5 rounded-full">
              {todasAlertas.length}
            </span>
          )}
        </div>

        {todasAlertas.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <AlertTriangle size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">Sin alertas activas</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {/* Red alerts first */}
            {alertasRojas.length > 0 && (
              <div className="mb-1">
                <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-1.5">Urgentes</p>
                {alertasRojas.map(alerta => (
                  <div
                    key={alerta.id}
                    onClick={() => alerta.ordenId && navigate(`/admin/ordenes/${alerta.ordenId}`)}
                    className="flex items-start gap-3 p-3 rounded-xl cursor-pointer hover:opacity-90 transition-opacity bg-red-50 border border-red-100 mb-1.5"
                  >
                    <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0 bg-red-500 animate-pulse" />
                    <p className="text-sm text-red-700">{alerta.mensaje}</p>
                  </div>
                ))}
              </div>
            )}
            {/* Orange alerts */}
            {alertasNaranjas.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-orange-600 uppercase tracking-wide mb-1.5">Atención</p>
                {alertasNaranjas.map(alerta => (
                  <div
                    key={alerta.id}
                    onClick={() => alerta.ordenId && navigate(`/admin/ordenes/${alerta.ordenId}`)}
                    className="flex items-start gap-3 p-3 rounded-xl cursor-pointer hover:opacity-90 transition-opacity bg-orange-50 border border-orange-100 mb-1.5"
                  >
                    <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0 bg-orange-500" />
                    <p className="text-sm text-orange-700">{alerta.mensaje}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ════════════ BLOQUE: PLATA ════════════ */}
      <BloqueHeader titulo="Plata" descripcion="Ingresos, gastos y nómina" />

      {/* ======== 5. VENTAS vs GASTOS + 6. BALANCE PENDIENTE ======== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 5. Ventas / Compras */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BarChart3 size={20} className="text-primary-medium" />
              <h2 className="text-lg font-semibold text-gray-900">Ingresos vs Gastos</h2>
            </div>
            <div className="flex gap-1">
              {(['hoy', 'semana', 'mes', 'año'] as PeriodoVentas[]).map(p => (
                <button
                  key={p}
                  onClick={() => setPeriodoVentas(p)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                    periodoVentas === p
                      ? 'bg-primary text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4 mt-6">
            {/* Ingresos bar */}
            <div>
              <div className="flex justify-between text-sm mb-1.5">
                <span className="text-gray-600 font-medium">Ingresos</span>
                <span className="font-bold text-green-600">{formatMoneda(ingresosPeriodo)}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-8 overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full transition-all duration-500 flex items-center justify-end pr-2"
                  style={{ width: `${Math.max((ingresosPeriodo / maxVentasGastos) * 100, 2)}%` }}
                >
                  {ingresosPeriodo > 0 && (
                    <span className="text-xs font-bold text-white drop-shadow">
                      {formatMoneda(ingresosPeriodo)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Gastos bar */}
            <div>
              <div className="flex justify-between text-sm mb-1.5">
                <span className="text-gray-600 font-medium">Gastos</span>
                <span className="font-bold text-red-600">{formatMoneda(gastosPeriodo)}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-8 overflow-hidden">
                <div
                  className="h-full bg-red-500 rounded-full transition-all duration-500 flex items-center justify-end pr-2"
                  style={{ width: `${Math.max((gastosPeriodo / maxVentasGastos) * 100, 2)}%` }}
                >
                  {gastosPeriodo > 0 && (
                    <span className="text-xs font-bold text-white drop-shadow">
                      {formatMoneda(gastosPeriodo)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Balance */}
            <div className="pt-3 border-t border-gray-100 flex justify-between items-center">
              <span className="text-sm text-gray-500 font-medium">Balance</span>
              <span className={`text-lg font-bold ${ingresosPeriodo - gastosPeriodo >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {ingresosPeriodo - gastosPeriodo >= 0 ? '+' : ''}{formatMoneda(ingresosPeriodo - gastosPeriodo)}
              </span>
            </div>
          </div>
        </div>

        {/* 6. Balance pendiente — pareja del 5 (Plata, ingresos vs pendientes) */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-2 mb-4">
            <DollarSign size={20} className="text-primary-medium" />
            <h2 className="text-lg font-semibold text-gray-900">Balance Pendiente</h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-yellow-50 border border-yellow-100 rounded-xl p-4">
              <p className="text-xs text-yellow-700 font-medium mb-1">&lt; 30 días</p>
              <p className="text-2xl font-bold text-yellow-800">{pendientesMenos30.length}</p>
              <p className="text-sm font-semibold text-yellow-700 mt-1">
                {formatMoneda(pendientesMenos30.reduce((s, f) => s + (f.total || 0), 0))}
              </p>
            </div>
            <div className="bg-red-50 border border-red-100 rounded-xl p-4">
              <p className="text-xs text-red-700 font-medium mb-1">&gt; 30 días</p>
              <p className="text-2xl font-bold text-red-800">{pendientesMas30.length}</p>
              <p className="text-sm font-semibold text-red-700 mt-1">
                {formatMoneda(pendientesMas30.reduce((s, f) => s + (f.total || 0), 0))}
              </p>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-gray-100 flex justify-between items-center">
            <span className="text-sm text-gray-500">Total pendiente</span>
            <span className="text-lg font-bold text-primary">
              {formatMoneda(facturasPendientes.reduce((s, f) => s + (f.total || 0), 0))}
            </span>
          </div>
        </div>
      </div>

      {/* Fin Plata principal — siguen anuladas, nómina y proyección al final */}

      {/* ════════════ Vuelve a Pipeline para los detalles operativos ════════════ */}
      <BloqueHeader titulo="Equipo y trabajos" descripcion="Cómo viene cada técnico y qué se está reparando" />

      {/* ======== 7. ESTADO CASOS POR TECNICO ======== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 7. Estado de casos por tecnico */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Users size={20} className="text-primary-medium" />
            <h2 className="text-lg font-semibold text-gray-900">Estado de Casos por Técnico</h2>
          </div>
          {casosPorTecnico.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <Users size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Sin técnicos registrados</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-72 overflow-y-auto">
              {casosPorTecnico.map(({ tecnico, pendientes, enProceso, completados }) => (
                <div key={tecnico.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:bg-gray-50 transition-colors">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                    style={{ backgroundColor: tecnico.color || getTecnicoColor(tecnico.nombre) }}
                  >
                    {tecnico.nombre.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{tecnico.nombre}</p>
                    <div className="flex gap-3 mt-1">
                      <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                        {pendientes} pendiente{pendientes !== 1 ? 's' : ''}
                      </span>
                      <span className="text-xs text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">
                        {enProceso} en proceso
                      </span>
                      <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                        {completados} completado{completados !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ======== 8. ALERTAS DE INVENTARIO + PROXIMA NOMINA ========
          SPRINT-DISENO-I-DATA-SLOP (2026-06-03, pasada 58 — decisión Jorge):
          "Rendimiento por Técnico", "Reparaciones por Tipo de Equipo",
          "Órdenes anuladas esta semana" y "Nómina proyectada del mes" se
          movieron a `/admin/reporte-avanzado` (sin borrar — analíticos, no
          operativos del día). Aquí quedan los widgets operativos directos:
          Alertas de Inventario (acción inmediata: reponer) y Próxima nómina
          (cuántos días faltan para el pago + comisiones acumuladas del
          ciclo corriente). Al final un CTA discreto lleva al reporte. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Alertas de Inventario (Fase 4B) */}
        {puedeVerInventario && alertasInventario.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-amber-200 p-6">
            <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Boxes size={20} className="text-amber-600" />
                <h2 className="text-lg font-semibold text-gray-900">Alertas de Inventario</h2>
              </div>
              <Link to="/admin/inventario" className="text-xs text-primary-medium hover:underline font-medium">
                Ver inventario completo →
              </Link>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Top piezas con stock bajo o agotado. Considera reponer.
            </p>
            <div className="space-y-1.5">
              {alertasInventario.map(p => {
                const sinStock = p.stockActual === 0;
                return (
                  <div key={p.id} className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm ${sinStock ? 'bg-red-50' : 'bg-amber-50'}`}>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{p.nombre}</p>
                      {p.codigo && <p className="text-[11px] text-gray-500">{p.codigo}</p>}
                    </div>
                    <span className={`font-bold ${sinStock ? 'text-red-700' : 'text-amber-700'}`}>
                      {p.stockActual}{p.stockMinimo ? ` / ${p.stockMinimo}` : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Próxima nómina (Fase 6) — SE QUEDA: operativo del día (días al pago). */}
        {puedeVerNomina && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Wallet size={20} className="text-primary-medium" />
                <h2 className="text-lg font-semibold text-gray-900">Próxima nómina</h2>
              </div>
              <Link to="/admin/nomina" className="text-xs text-primary-medium hover:underline font-medium">
                Ver nómina completa →
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-blue-50 rounded-lg p-3">
                <p className="text-[10px] uppercase font-medium text-blue-700">Quincena</p>
                <p className="text-sm font-bold text-blue-900">{nominaProxima.quincenaActual}</p>
                <p className="text-[11px] text-blue-700 mt-1">
                  Pago día {nominaProxima.diaPagoLabel} ({nominaProxima.diasFaltantes} día{nominaProxima.diasFaltantes !== 1 ? 's' : ''})
                </p>
              </div>
              <div className="bg-emerald-50 rounded-lg p-3">
                <p className="text-[10px] uppercase font-medium text-emerald-700">Comisiones acumuladas</p>
                <p className="text-base font-bold text-emerald-900">{formatMoneda(nominaProxima.totalComisiones)}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-[10px] uppercase font-medium text-gray-700">Total estimado</p>
                <p className="text-base font-bold text-gray-900">{formatMoneda(nominaProxima.totalEstimado)}</p>
                <p className="text-[10px] text-gray-500 mt-0.5">+ sueldos base + bonos</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* CTA discreto al reporte avanzado — solo si el rol tiene acceso.
          SPRINT-DISENO-I-DATA-SLOP: linkea a la página nueva con los 4
          widgets movidos (Rendimiento, Reparaciones, Anuladas, Nómina
          proyectada del mes). Gate `esAdminOCoord` espejo del sidebar +
          de la ruta en App.tsx. */}
      {(userProfile?.rol === 'administrador' || userProfile?.rol === 'coordinadora') && (
        <div className="flex justify-center">
          <Link
            to="/admin/reporte-avanzado"
            className="inline-flex items-center gap-1.5 text-sm text-primary-medium hover:underline font-medium"
          >
            Ver reporte avanzado (rendimiento por técnico, anulaciones, nómina del mes, reparaciones por tipo) →
          </Link>
        </div>
      )}

      {/* ======== 10. AGENDA DEL DIA ======== */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <button
          type="button"
          onClick={() => navigate('/admin/agenda-dia')}
          className="w-full flex items-center gap-2 mb-4 group cursor-pointer"
          title="Ver agenda completa por técnico"
        >
          <Calendar size={20} className="text-primary-medium" />
          <h2 className="text-lg font-semibold text-gray-900 group-hover:text-primary-medium transition-colors">
            Agenda del Día
          </h2>
          <span className="bg-blue-100 text-blue-700 text-xs font-medium px-2 py-0.5 rounded-full">
            {agendaHoy.length}
          </span>
          <ChevronRight size={16} className="ml-auto text-gray-400 group-hover:text-primary-medium transition-colors" />
        </button>

        {agendaHoy.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <Calendar size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">Sin citas programadas para hoy</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {agendaHoy.map(orden => (
              <div
                key={orden.id}
                onClick={() => navigate(`/admin/ordenes/${orden.id}`)}
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 cursor-pointer border border-gray-100 transition-colors"
              >
                <div className="text-center bg-primary/10 rounded-lg px-2.5 py-1.5 min-w-[56px]">
                  <span className="text-sm font-bold text-primary">
                    {formatHora(orden.fechaCita)}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{orden.clienteNombre}</p>
                  <p className="text-xs text-gray-500 truncate">{orden.equipoTipo} {orden.equipoMarca ? `· ${orden.equipoMarca}` : ''}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge fase={orden.fase} />
                  {orden.tecnicoNombre && (
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <User size={10} />
                      <span className="truncate max-w-[70px]">{orden.tecnicoNombre.split(' ')[0]}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bloque header (SPRINT-DISENO-C, 2026-05-31)
// ---------------------------------------------------------------------------

/**
 * Header visual que separa los 3 grandes bloques del Dashboard:
 * Hoy / Pipeline / Plata. Un divisor con título grande + subtítulo
 * dominicano corto. Usa color brand para uniformidad.
 */
function BloqueHeader({ titulo, descripcion }: { titulo: string; descripcion: string }) {
  return (
    <div className="pt-4 pb-1 border-t-2 border-primary/10 first:border-t-0 first:pt-0">
      <h2 className="text-xl font-bold text-primary">{titulo}</h2>
      <p className="text-sm text-gray-500 mt-0.5">{descripcion}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// KPI Hero — "Órdenes atrasadas" (SPRINT-DISENO-C, 2026-05-31)
// ---------------------------------------------------------------------------

/**
 * KPI dominante del Dashboard. Decisión Jorge 2026-05-31 (opción C):
 * "Órdenes atrasadas" es el indicador más actionable.
 *   - 0 = bajo control (estado neutro brand).
 *   - >0 = hay incendio que atacar (rojo).
 *
 * Si hay órdenes atrasadas, abajo del número grande renderiza el
 * detalle (tabla con las 10 primeras + acceso al detalle de cada una).
 * Si está en 0, oculta la tabla y muestra mensaje positivo corto.
 */
function KpiHeroAtrasadas({
  cantidad,
  ordenes,
  onNavegarOrden,
}: {
  cantidad: number;
  ordenes: (OrdenServicio & { diasAtraso: number })[];
  onNavegarOrden: (id: string) => void;
}) {
  const todoBajoControl = cantidad === 0;
  return (
    <div
      className={`bg-white rounded-2xl shadow-sm border p-6 ${
        todoBajoControl ? 'border-gray-100' : 'border-red-200'
      }`}
    >
      <div className="flex items-start gap-4 flex-wrap">
        <div
          className={`rounded-2xl p-4 ${
            todoBajoControl ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'
          }`}
        >
          <Timer size={32} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">
            Órdenes atrasadas
          </p>
          <p
            className={`text-6xl md:text-7xl font-extrabold leading-none mt-1 ${
              todoBajoControl ? 'text-green-600' : 'text-red-600'
            }`}
          >
            {cantidad}
          </p>
          <p className="text-sm text-gray-600 mt-2">
            {todoBajoControl
              ? 'Todo bajo control. Ninguna orden atrasada más de 1 día.'
              : `Atrasadas más de 1 día. Atender lo antes posible.`}
          </p>
        </div>
      </div>

      {!todoBajoControl && (
        <div className="overflow-x-auto mt-5 border-t border-gray-100 pt-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-100">
                <th className="pb-2 pr-4 font-medium">Número</th>
                <th className="pb-2 pr-4 font-medium">Cliente</th>
                <th className="pb-2 pr-4 font-medium">Fase</th>
                <th className="pb-2 pr-4 font-medium">Técnico</th>
                <th className="pb-2 font-medium text-right">Días atraso</th>
                <th className="pb-2 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {ordenes.slice(0, 10).map((orden) => (
                <tr
                  key={orden.id}
                  onClick={() => onNavegarOrden(orden.id)}
                  className="border-b border-gray-50 hover:bg-red-50 cursor-pointer transition-colors"
                >
                  <td className="py-2.5 pr-4 font-mono font-medium text-primary">
                    #{orden.numero}
                  </td>
                  <td className="py-2.5 pr-4 text-gray-900">{orden.clienteNombre}</td>
                  <td className="py-2.5 pr-4">
                    <Badge fase={orden.fase} />
                  </td>
                  <td className="py-2.5 pr-4 text-gray-600">
                    {orden.tecnicoNombre || 'Sin asignar'}
                  </td>
                  <td className="py-2.5 text-right">
                    <span
                      className={`font-bold ${
                        orden.diasAtraso >= 3 ? 'text-red-600' : 'text-orange-600'
                      }`}
                    >
                      {orden.diasAtraso} día{orden.diasAtraso !== 1 ? 's' : ''}
                    </span>
                  </td>
                  <td className="py-2.5 text-right">
                    <EliminarOrdenButton orden={orden} variant="icon" size="sm" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// KPI Card component
// ---------------------------------------------------------------------------

function KpiCard({
  title, value, subtitle, icon, color, onClick,
}: {
  title: string;
  value: number | string;
  subtitle?: string;
  icon: React.ReactNode;
  color: string;
  onClick?: () => void;
}) {
  const isText = typeof value === 'string';
  return (
    <button
      onClick={onClick}
      className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 text-left hover:shadow-md transition-shadow flex flex-col gap-3 w-full"
    >
      <div className={`${color} text-white rounded-xl p-2.5 w-fit`}>
        {icon}
      </div>
      <div>
        <p className="text-xs text-gray-500 font-medium">{title}</p>
        <p className={`font-bold text-gray-900 ${isText ? 'text-lg' : 'text-3xl'} mt-0.5`}>
          {value}
        </p>
        {subtitle && (
          <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
        )}
      </div>
    </button>
  );
}
