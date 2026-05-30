import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, doc, updateDoc, Timestamp, arrayUnion } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useNavigate } from 'react-router-dom';
import { OrdenServicio, Personal, MetodoPago, FaseOrden, Usuario } from '../types';
import {
  faseLabel, faseBgColor, formatMoneda, formatHora, parseOrden,
  getTecnicoColor, estadoSimpleLabel, crearRegistroAuditoria,
  formatearEquipoLabel, calcularExpiracionTokenPortal,
} from '../utils';
import FotoEquipoDisplay from '../components/shared/FotoEquipoDisplay';
import BotonComoLlegar from '../components/shared/BotonComoLlegar';
import { coordsFromLatLng } from '../utils/maps';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';
import { useApp } from '../context/AppContext';
import { puede } from '../utils/permisos';
import { suscribirConfigEmpresa, CONFIG_EMPRESA_DEFAULT, ConfigEmpresa, PRECIO_CHEQUEO_DEFAULT_FALLBACK } from '../services/configEmpresa.service';
import { crearNotificacion } from '../services/notificaciones.service';
import { buscarChequeoVigentePorCliente } from '../services/ordenes.service';
import {
  calcularDescuentoChequeo,
  construirCamposDescuentoChequeo,
  describirDescuentoChequeo,
} from '../utils/descuentoChequeo';
import { format, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import toast from 'react-hot-toast';
import {
  ClipboardList, Calendar, CheckCircle, Clock, DollarSign,
  ChevronDown, ChevronUp, User, Wrench, UserCheck,
  ClipboardCheck, DollarSign as DollarIcon, RotateCcw, Pause,
} from 'lucide-react';

export default function AgendaDia() {
  const navigate = useNavigate();
  const { userProfile, currentUser } = useApp();
  const rol = userProfile?.rol;
  const esOperaria = rol === 'operaria';
  const esTecnico = rol === 'tecnico';
  const esAdminOCoord = rol === 'administrador' || rol === 'coordinadora';

  const [loading, setLoading] = useState(true);
  const [ordenes, setOrdenes] = useState<OrdenServicio[]>([]);
  const [personal, setPersonal] = useState<Personal[]>([]);
  // SPRINT-AGENDA-2 (2026-05-25): citas por confirmar + mantenimientos
  // del día (capa tentativa, solo lectura). Antes invisibles en la
  // agenda — vivían en `/admin/citas` y `/admin/mantenimiento`.
  const [citasTentativas, setCitasTentativas] = useState<Array<{
    id: string; clienteNombre: string; equipoTipo?: string; servicio?: string;
    telefono?: string; fechaSolicitada?: Date | null; horaSolicitada?: string;
  }>>([]);
  const [mantenimientosDelDia, setMantenimientosDelDia] = useState<Array<{
    id: string; clienteNombre: string; equipoTipo?: string; tecnicoNombre?: string;
    proximaFecha: Date | null; activo: boolean;
  }>>([]);
  const [fechaStr, setFechaStr] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [filtroTecnico, setFiltroTecnico] = useState('');
  const [filtroOperaria, setFiltroOperaria] = useState('');
  const [soloMiGrupo, setSoloMiGrupo] = useState(true);
  const [mostrarSinCitas, setMostrarSinCitas] = useState(false);

  const [empresaConfig, setEmpresaConfig] = useState<ConfigEmpresa>({ ...CONFIG_EMPRESA_DEFAULT });
  const precioChequeoSugerido =
    empresaConfig.precioChequeoDefault ?? PRECIO_CHEQUEO_DEFAULT_FALLBACK;

  const puedeAprobar = puede(userProfile, 'cotizacionesAprobarPrecio');

  // Modal solo chequeo (oficina)
  const [showChequeoModal, setShowChequeoModal] = useState(false);
  const [ordenChequeo, setOrdenChequeo] = useState<OrdenServicio | null>(null);
  const [chequeoForm, setChequeoForm] = useState<{ precio: string; metodoPago: MetodoPago | ''; motivo: string }>({
    precio: '',
    metodoPago: '',
    motivo: '',
  });
  const [savingChequeo, setSavingChequeo] = useState(false);

  // Aprobar precio inline (oficina)
  const [aprobandoId, setAprobandoId] = useState<string | null>(null);

  const fechaSeleccionada = useMemo(() => {
    const d = new Date(fechaStr + 'T00:00:00');
    return isNaN(d.getTime()) ? new Date() : d;
  }, [fechaStr]);

  useEffect(() => {
    let loadedCount = 0;
    const total = 2;
    const checkLoaded = () => { loadedCount++; if (loadedCount >= total) setLoading(false); };

    const unsubOrd = onSnapshot(collection(db, 'ordenes_servicio'), (snap) => {
      setOrdenes(snap.docs.map(d => parseOrden(d.id, d.data()) as OrdenServicio));
      checkLoaded();
    });
    const unsubPers = onSnapshot(collection(db, 'personal'), (snap) => {
      setPersonal(snap.docs.map(d => ({ id: d.id, ...d.data() } as Personal)));
      checkLoaded();
    });
    // SPRINT-AGENDA-2: capa tentativa. Sort/filter client-side (P-015).
    const unsubCitas = onSnapshot(collection(db, 'citas_por_confirmar'), (snap) => {
      setCitasTentativas(snap.docs.map(d => {
        const raw = d.data();
        return {
          id: d.id,
          clienteNombre: raw.clienteNombre || 'Sin nombre',
          equipoTipo: raw.equipoTipo,
          servicio: raw.servicio,
          telefono: raw.telefono,
          fechaSolicitada: raw.fechaSolicitada?.toDate?.() || null,
          horaSolicitada: raw.horaSolicitada || '',
        };
      }));
    });
    const unsubMant = onSnapshot(collection(db, 'mantenimiento'), (snap) => {
      setMantenimientosDelDia(snap.docs.map(d => {
        const raw = d.data();
        return {
          id: d.id,
          clienteNombre: raw.clienteNombre || 'Sin nombre',
          equipoTipo: raw.equipoTipo,
          tecnicoNombre: raw.tecnicoNombre,
          proximaFecha: raw.proximaFecha?.toDate?.() || null,
          activo: raw.activo !== false,
        };
      }));
    });
    const unsubEmpresa = suscribirConfigEmpresa(cfg => setEmpresaConfig(cfg));
    return () => { unsubOrd(); unsubPers(); unsubCitas(); unsubMant(); unsubEmpresa(); };
  }, []);

  const abrirChequeo = (orden: OrdenServicio) => {
    setOrdenChequeo(orden);
    setChequeoForm({ precio: String(precioChequeoSugerido), metodoPago: '', motivo: '' });
    setShowChequeoModal(true);
  };

  const cerrarChequeoModal = () => {
    setShowChequeoModal(false);
    setOrdenChequeo(null);
    setChequeoForm({ precio: String(precioChequeoSugerido), metodoPago: '', motivo: '' });
  };

  const handleConfirmarChequeo = async () => {
    if (!ordenChequeo) return;
    const precio = Number(chequeoForm.precio);
    if (isNaN(precio) || precio <= 0) {
      toast.error('Ingresa un precio de chequeo válido');
      return;
    }
    if (!chequeoForm.motivo.trim()) {
      toast.error('Escribe el motivo');
      return;
    }
    setSavingChequeo(true);
    try {
      const ahora = Timestamp.now();
      const usuario = userProfile?.nombre || 'Sistema';
      const nuevoHistorial = [
        ...ordenChequeo.historialFases.map(h => ({
          fase: h.fase,
          timestamp: Timestamp.fromDate(h.timestamp instanceof Date ? h.timestamp : new Date()),
          usuario: h.usuario || '',
          ...(h.nota ? { nota: h.nota } : {}),
        })),
        {
          fase: 'cerrado' as FaseOrden,
          timestamp: ahora,
          usuario,
          nota: `Solo chequeo — ${chequeoForm.motivo.trim()}`,
        },
      ];
      const registroAuditoria = crearRegistroAuditoria(
        usuario,
        'marcar_chequeo',
        `Marcó orden como solo chequeo (RD$ ${precio.toLocaleString('es-DO')}) — ${chequeoForm.motivo.trim()}`,
        'soloChequeo',
        'false',
        'true'
      );
      // Registrar el pago del chequeo (si hay método de pago) y enviar a
      // facturación para que admin/coord pueda emitir el conduce CG-#####.
      const pagoExistente = Array.isArray(ordenChequeo.pagos) ? ordenChequeo.pagos : [];
      const nuevoPago = chequeoForm.metodoPago ? {
        id: `pago_chequeo_${Date.now()}`,
        metodo: chequeoForm.metodoPago,
        monto: precio,
        fecha: ahora,
        // SPRINT-150 (2026-05-12): auth.uid en vez de userProfile.id (P-001).
        // Patrón establecido por SPRINT-114 (`EnviarFacturacionButton.tsx:45`).
        // Gotcha CLAUDE.md "userProfile.id NO siempre es auth.uid".
        registradoPorId: currentUser?.uid || '',
        registradoPorNombre: usuario,
      } : null;
      const pagosTotal = [
        ...pagoExistente.map(p => ({
          id: p.id,
          metodo: p.metodo,
          monto: p.monto,
          fecha: p.fecha instanceof Date ? Timestamp.fromDate(p.fecha) : p.fecha,
          ...(p.recibidoPorId ? { recibidoPorId: p.recibidoPorId } : {}),
          ...(p.recibidoPorNombre ? { recibidoPorNombre: p.recibidoPorNombre } : {}),
          ...(p.bancoId ? { bancoId: p.bancoId } : {}),
          ...(p.bancoNombre ? { bancoNombre: p.bancoNombre } : {}),
          ...(p.referencia ? { referencia: p.referencia } : {}),
          ...(p.notas ? { notas: p.notas } : {}),
          registradoPorId: p.registradoPorId,
          registradoPorNombre: p.registradoPorNombre,
        })),
        ...(nuevoPago ? [nuevoPago] : []),
      ];
      const montoPagadoTotal = pagosTotal.reduce((sum, p) => sum + Number(p.monto || 0), 0);

      const updateData: Record<string, unknown> = {
        soloChequeo: true,
        tipoCierre: 'solo_chequeo',
        precioChequeo: precio,
        precioFinal: precio,
        motivoChequeo: chequeoForm.motivo.trim(),
        fase: 'cerrado',
        estadoSimple: 'completado',
        estado: 'cerrado',
        historialFases: nuevoHistorial,
        auditoria: arrayUnion(registroAuditoria),
        // SPRINT-187 Bug B (forward fix): persistir `fechaCierre` a nivel raíz
        // del doc para que `buscarChequeoVigentePorCliente` pueda resolverla
        // (antes este path NO escribía fecha de cierre en absoluto — sólo
        // `updatedAt` — y el helper la confundía con la fecha de cierre).
        fechaCierre: ahora,
        updatedAt: ahora,
        // SPRINT-139 (2026-05-11): expirar token portal 30 días post-cierre.
        tokenPortalClienteExpiraEn: Timestamp.fromDate(
          calcularExpiracionTokenPortal(ahora.toDate())
        ),
      };
      if (chequeoForm.metodoPago) updateData.metodoPagoCierre = chequeoForm.metodoPago;
      if (nuevoPago) {
        updateData.pagos = pagosTotal;
        updateData.montoPagado = montoPagadoTotal;
        updateData.estadoPago = montoPagadoTotal >= precio ? 'completo' : 'parcial';
        // Marcar como enviada a facturación para que admin/coord emita CG-#####
        updateData.enviadaAFacturacion = true;
        updateData.enviadaAFacturacionAt = ahora;
        // SPRINT-150 (2026-05-12): auth.uid en vez de userProfile.id (P-001).
        // Patrón establecido por SPRINT-114 (`EnviarFacturacionButton.tsx:45,60`).
        if (currentUser?.uid) updateData.enviadaAFacturacionPorId = currentUser.uid;
        updateData.enviadaAFacturacionPorNombre = usuario;
      }
      await updateDoc(doc(db, 'ordenes_servicio', ordenChequeo.id), updateData);

      // El chequeo NO genera comisión para el técnico (regla de negocio).
      // Si el cliente regresa para reparar, se reactiva la orden vía
      // `reactivarOrdenPostChequeo` y la comisión se paga sobre el monto de
      // la reparación, no incluye los RD$2,000 del chequeo previo.

      toast.success('Orden cerrada como solo chequeo');
      cerrarChequeoModal();
    } catch (err: unknown) {
      console.error(err);
      // Defensa para sesiones de técnico desactualizadas (sprint R4
      // endurecida): este path siempre setea soloChequeo+precioFinal, así
      // que un permission-denied indica una sesión vieja chocando con la
      // rule nueva.
      const codeRaw = (err as { code?: unknown })?.code;
      const code = typeof codeRaw === 'string' ? codeRaw : '';
      if (code === 'permission-denied') {
        toast.error(
          'Tu app está desactualizada. Recargá con Cmd+Shift+R o cierra y abre el navegador.',
          { duration: 8000 },
        );
      } else {
        toast.error('Error al cerrar como solo chequeo');
      }
    } finally {
      setSavingChequeo(false);
    }
  };

  const handleAprobarPrecioInline = async (orden: OrdenServicio) => {
    if (orden.precioSugerido === undefined) return;
    const precioBase = Number(orden.precioSugerido);
    if (isNaN(precioBase) || precioBase <= 0) {
      toast.error('Precio sugerido inválido');
      return;
    }

    // SPRINT-178: aprobación rápida = auto-descuento silencioso si hay chequeo
    // vigente. NO permite override aquí (la UI es 1 clic, sin input para
    // motivo). Si el admin/coord quiere override, debe abrir la orden en
    // /admin/ordenes o /admin/orden/:id. Si la orden ya tiene descuento
    // aplicado (re-aprobación), guard idempotente.
    let precio = precioBase;
    let camposDescuento: Record<string, unknown> = {};
    let detalleDescuento = '';
    if (!orden.descuentoChequeoPrevioId && orden.clienteId && orden.equipoTipo) {
      try {
        const info = await buscarChequeoVigentePorCliente(orden.clienteId, orden.equipoTipo);
        if (info && info.vigente && info.ordenId !== orden.id) {
          const { precioConDescuento, descuentoAplicado } = calcularDescuentoChequeo(precioBase, info.montoChequeo);
          precio = precioConDescuento;
          camposDescuento = construirCamposDescuentoChequeo({
            chequeo: { ordenId: info.ordenId, fechaCierre: info.fechaCierre },
            montoFinalDescuento: descuentoAplicado,
            override: false,
          });
          detalleDescuento = describirDescuentoChequeo({
            ordenNumero: info.ordenNumero,
            montoDescuento: descuentoAplicado,
            fechaChequeo: info.fechaCierre,
            override: false,
          });
        }
      } catch (err) {
        console.warn('[SPRINT-178/AgendaDia] error buscando chequeo previo:', err);
      }
    }

    setAprobandoId(orden.id);
    try {
      const usuario = userProfile?.nombre || 'Admin';
      const notaAuditoria = detalleDescuento
        ? `Aprobó precio: RD$ ${precio.toLocaleString('es-DO')} — ${detalleDescuento}`
        : `Aprobó precio: RD$ ${precio.toLocaleString('es-DO')}`;
      const registroAuditoria = crearRegistroAuditoria(
        usuario,
        'precio_sugerido',
        notaAuditoria,
        'precioFinal',
        '',
        `RD$ ${precio.toLocaleString('es-DO')}`
      );
      // SPRINT-173: tras aprobar precio sugerido, avanzar fase a 'aprobado' y mantener
      // sincronía con `estadoSimple`/`estado`/`historialFases` (sub-regla CLAUDE.md
      // "registros sincronizados"). Antes el handler dejaba la orden en fase previa
      // con precioAprobado/estadoAprobacion seteados — inconsistencia visible en
      // pipeline visual de /admin/ordenes y en filtros por fase.
      // Patrón tomado de SPRINT-161 (4015fe1) en ProcesarFacturacionModal:
      // shape `{ fase, timestamp, usuario, nota }`, array reemplazado completo
      // (no `arrayUnion`), single `ahora` para evitar drift de timestamps.
      const ahora = Timestamp.now();
      const nuevoHistorialFases = [
        ...(orden.historialFases || []).map((h) => ({
          fase: h.fase,
          timestamp: h.timestamp instanceof Date ? Timestamp.fromDate(h.timestamp) : h.timestamp,
          usuario: h.usuario || '',
          ...(h.nota ? { nota: h.nota } : {}),
        })),
        {
          fase: 'aprobado' as FaseOrden,
          timestamp: ahora,
          usuario,
          nota: `Precio aprobado: RD$ ${precio.toLocaleString('es-DO')}`,
        },
      ];
      await updateDoc(doc(db, 'ordenes_servicio', orden.id), {
        precioAprobado: precio,
        precioFinal: precio,
        estadoAprobacion: 'aprobado',
        aprobadoPor: usuario,
        fechaAprobacion: ahora,
        // SPRINT-173: avanzar fase + estados duplicados + append a historial.
        fase: 'aprobado',
        estadoSimple: 'pendiente',
        estado: 'activo',
        historialFases: nuevoHistorialFases,
        auditoria: arrayUnion(registroAuditoria),
        // SPRINT-178: descuento por chequeo previo (silencioso, sólo si vigente).
        ...camposDescuento,
        updatedAt: ahora,
      });
      // SPRINT-178: toast informativo si se aplicó descuento silencioso
      if (detalleDescuento) {
        toast.success(`Descuento aplicado: ${detalleDescuento}`, { duration: 6000 });
      }
      // SPRINT-174: notif `precio_aprobado` al técnico + admins/coords
      // (autoexclusión del aprobador). Patrón canónico SPRINT-169
      // (`5823955`): try/catch independiente por destinatario, `p.uid`
      // siempre (P-007), filtrar `p.uid &&` para excluir empleados sin
      // Auth. No bloquea el flujo si falla.
      if (orden.tecnicoId && orden.tecnicoId !== currentUser?.uid) {
        try {
          await crearNotificacion({
            userId: orden.tecnicoId,
            destinatarioNombre: orden.tecnicoNombre,
            tipo: 'precio_aprobado',
            titulo: `Precio aprobado · ${orden.numero || 'orden'}`,
            mensaje: `Precio aprobado: RD$${precio.toLocaleString('es-DO')}. Cliente: ${orden.clienteNombre}. Puedes marcar el trabajo como realizado.`,
            ordenId: orden.id,
            ordenNumero: orden.numero,
          });
        } catch (notifErr) {
          console.error('[SPRINT-174] precio_aprobado a técnico falló:', notifErr);
        }
      }
      try {
        const destinatariosStaff = personal.filter(
          p =>
            !!p.uid &&
            p.activo &&
            (p.rol === 'administrador' || p.rol === 'coordinadora') &&
            p.uid !== currentUser?.uid &&
            p.uid !== orden.tecnicoId,
        );
        for (const destino of destinatariosStaff) {
          try {
            await crearNotificacion({
              userId: destino.uid!,
              destinatarioNombre: destino.nombre,
              tipo: 'precio_aprobado',
              titulo: `Precio aprobado · ${orden.numero || 'orden'}`,
              mensaje: `Precio RD$${precio.toLocaleString('es-DO')} aprobado en orden ${orden.numero || ''}. Cliente: ${orden.clienteNombre}. Técnico: ${orden.tecnicoNombre || 'sin asignar'}.`,
              ordenId: orden.id,
              ordenNumero: orden.numero,
            });
          } catch (err) {
            console.error('[SPRINT-174] precio_aprobado a staff falló para', destino.uid, err);
          }
        }
      } catch (errStaff) {
        console.error('[SPRINT-174] precio_aprobado fallo enumerando staff:', errStaff);
      }
      toast.success('Precio aprobado');
    } catch (err) {
      console.error(err);
      toast.error('Error al aprobar el precio');
    } finally {
      setAprobandoId(null);
    }
  };

  const tecnicos = useMemo(
    () => personal.filter(p => p.rol === 'tecnico' && p.activo),
    [personal],
  );
  const operarias = useMemo(
    () => personal.filter(p => p.rol === 'operaria' && p.activo),
    [personal],
  );

  // Técnicos visibles según rol + filtros
  const tecnicosVisibles = useMemo(() => {
    let lista = tecnicos;
    if (esTecnico && currentUser) {
      // SPRINT-145 / P-006 variante: el técnico logueado se filtra por su
      // `auth.uid` (currentUser.uid), NO `userProfile.id` (que en cascada
      // fallback `personal/` es el doc id, no el uid). El campo `t.uid`
      // espeja `auth.uid` post-SPRINT-105. Fallback a `t.id` para personal
      // pre-onboarding sin Auth.
      lista = lista.filter(t => (t.uid || t.id) === currentUser.uid);
    } else if (esOperaria && soloMiGrupo && userProfile) {
      // SPRINT-149 (P-006 variante operariaId): `t.operariaId` post-SPRINT-105
      // persiste auth.uid (no docId). Comparar contra `currentUser?.uid` con
      // fallback a `userProfile.id` para operarias legacy.
      lista = lista.filter(t => t.operariaId === (currentUser?.uid || userProfile.id));
    } else if (esAdminOCoord && filtroOperaria) {
      // SPRINT-149: `filtroOperaria` viene del dropdown que emite `op.uid || op.id`
      // (alineado con `t.operariaId` post-SPRINT-105).
      lista = lista.filter(t => t.operariaId === filtroOperaria);
    }
    if (filtroTecnico) {
      // SPRINT-145 / P-006 variante: `filtroTecnico` viene del dropdown
      // que emite `value={t.uid}` (líneas 380-383, ya correcto post-SPRINT-132).
      // El filtro debe comparar contra `t.uid`, no `t.id`.
      lista = lista.filter(t => (t.uid || t.id) === filtroTecnico);
    }
    return lista;
  }, [tecnicos, esTecnico, esOperaria, esAdminOCoord, soloMiGrupo, userProfile, currentUser, filtroTecnico, filtroOperaria]);

  // Órdenes del día (sin eliminar)
  const ordenesDelDia = useMemo(() => {
    return ordenes.filter(o =>
      !o.eliminada &&
      o.fechaCita && isSameDay(o.fechaCita, fechaSeleccionada),
    );
  }, [ordenes, fechaSeleccionada]);

  const tecnicosConOrdenes = useMemo(() => {
    // SPRINT-145 / P-006 variante useMemo+Set: el Set se construye con
    // `o.tecnicoId` que post-c4be345 es `auth.uid`. Para que el lookup
    // tenga sentido, comparar contra `t.uid || t.id` (no `t.id` que es
    // el doc id de personal).
    const idsConOrden = new Set(ordenesDelDia.map(o => o.tecnicoId).filter(Boolean) as string[]);
    return tecnicosVisibles.filter(t => idsConOrden.has(t.uid || t.id));
  }, [tecnicosVisibles, ordenesDelDia]);

  const tecnicosSinOrdenes = useMemo(() => {
    // SPRINT-145 / P-006 variante useMemo+Set: ambos lados del compare
    // usan `t.uid || t.id` para mantener consistencia con el resto del
    // archivo (dominio auth.uid post-c4be345).
    const idsConOrden = new Set(tecnicosConOrdenes.map(t => t.uid || t.id));
    return tecnicosVisibles.filter(t => !idsConOrden.has(t.uid || t.id));
  }, [tecnicosVisibles, tecnicosConOrdenes]);

  const ordenesPorTecnico = useMemo(() => {
    const map: Record<string, OrdenServicio[]> = {};
    for (const o of ordenesDelDia) {
      const key = o.tecnicoId || '__sin_asignar__';
      if (!map[key]) map[key] = [];
      map[key].push(o);
    }
    Object.values(map).forEach(lista => lista.sort((a, b) => {
      const at = a.fechaCita?.getTime() || 0;
      const bt = b.fechaCita?.getTime() || 0;
      return at - bt;
    }));
    return map;
  }, [ordenesDelDia]);

  // Órdenes visibles (aplicando los mismos filtros que tecnicosVisibles)
  const ordenesVisibles = useMemo(() => {
    // SPRINT-145 / P-006 variante useMemo+Set: `o.tecnicoId` es auth.uid
    // post-c4be345. `idsVisibles` debe contener uids para que el lookup
    // funcione. Usar `t.uid || t.id` para alinear dominios.
    const idsVisibles = new Set(tecnicosVisibles.map(t => t.uid || t.id));
    return ordenesDelDia.filter(o => !o.tecnicoId || idsVisibles.has(o.tecnicoId));
  }, [ordenesDelDia, tecnicosVisibles]);

  const kpis = useMemo(() => {
    const total = ordenesVisibles.length;
    const completadas = ordenesVisibles.filter(o => ['trabajo_realizado', 'cerrado'].includes(o.fase)).length;
    const enProgreso = ordenesVisibles.filter(o =>
      ['en_gestion', 'en_diagnostico', 'en_cotizacion', 'aprobado', 'agendado'].includes(o.fase),
    ).length;
    const ingresos = ordenesVisibles
      .filter(o => o.fase === 'cerrado')
      .reduce((sum, o) => sum + (o.precioFinal || o.precioAprobado || 0), 0);
    return { total, completadas, enProgreso, ingresos };
  }, [ordenesVisibles]);

  const diaLabel = useMemo(
    () => format(fechaSeleccionada, "EEEE dd 'de' MMMM yyyy", { locale: es }),
    [fechaSeleccionada],
  );

  // SPRINT-AGENDA-2: tentativos del día (citas + mantenimientos). Sort
  // client-side por hora; los sin hora van al final.
  const citasTentativasDelDia = useMemo(() => {
    return citasTentativas
      .filter(c => c.fechaSolicitada && isSameDay(c.fechaSolicitada, fechaSeleccionada))
      .sort((a, b) => (a.horaSolicitada || 'zz').localeCompare(b.horaSolicitada || 'zz'));
  }, [citasTentativas, fechaSeleccionada]);
  const mantenimientosDelDiaFiltered = useMemo(() => {
    return mantenimientosDelDia
      .filter(m => m.activo && m.proximaFecha && isSameDay(m.proximaFecha, fechaSeleccionada))
      .filter(m => !filtroTecnico || m.tecnicoNombre === filtroTecnico);
  }, [mantenimientosDelDia, fechaSeleccionada, filtroTecnico]);

  if (loading) return <LoadingSpinner fullPage text="Cargando agenda..." />;

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-primary">Agenda del Día</h1>
          <p className="text-gray-500 text-sm capitalize">{diaLabel}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="date"
            value={fechaStr}
            onChange={e => setFechaStr(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-medium"
          />
          {!esTecnico && (
            <select
              value={filtroTecnico}
              onChange={e => setFiltroTecnico(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-medium"
            >
              <option value="">Todos los técnicos</option>
              {/* P-006: filtra por uid (auth.uid) para alinear con ordenes_servicio.tecnicoId */}
              {tecnicos.filter(t => t.uid).map(t => (
                <option key={t.id} value={t.uid}>{t.nombre}</option>
              ))}
            </select>
          )}
          {esAdminOCoord && (
            <select
              value={filtroOperaria}
              onChange={e => setFiltroOperaria(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-medium"
            >
              <option value="">Todas las operarias</option>
              {operarias.map(o => (
                // SPRINT-149 (P-006 variante operariaId): emitir `o.uid || o.id`
                // para alinear con `t.operariaId` que persiste auth.uid post-SPRINT-105.
                <option key={o.id} value={o.uid || o.id}>{o.nombre}</option>
              ))}
            </select>
          )}
          {esOperaria && (
            <button
              type="button"
              onClick={() => setSoloMiGrupo(v => !v)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                soloMiGrupo
                  ? 'bg-primary text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <UserCheck size={13} /> {soloMiGrupo ? 'Solo mi grupo' : 'Todas las operarias'}
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Total del día" value={String(kpis.total)} icon={<ClipboardList size={18} />} color="bg-blue-50 text-blue-700" />
        <KpiCard label="Completadas" value={String(kpis.completadas)} icon={<CheckCircle size={18} />} color="bg-green-50 text-green-700" />
        <KpiCard label="En progreso" value={String(kpis.enProgreso)} icon={<Clock size={18} />} color="bg-orange-50 text-orange-700" />
        <KpiCard label="Ingresos del día" value={formatMoneda(kpis.ingresos)} icon={<DollarSign size={18} />} color="bg-emerald-50 text-emerald-700" />
      </div>

      {/* Grid de técnicos */}
      {ordenesVisibles.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center text-gray-400">
          <Calendar size={32} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">Sin citas programadas para este día.</p>
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-3">
          {tecnicosConOrdenes.map(t => (
            // SPRINT-145 / P-006 variante map-indexing: `ordenesPorTecnico`
            // se construye con key `o.tecnicoId` (auth.uid). Indexar por
            // `t.uid || t.id` para que coincida el dominio; con `t.id`
            // (doc id de personal) el lookup retornaba undefined y
            // renderizaba [] aunque el técnico tuviera órdenes.
            <TecnicoColumn
              key={t.id}
              tecnico={t}
              ordenes={ordenesPorTecnico[t.uid || t.id] || []}
              onSelectOrden={(o) => navigate(`/admin/ordenes/${o.id}`)}
              userProfile={userProfile}
              puedeAprobar={puedeAprobar}
              aprobandoId={aprobandoId}
              onAbrirChequeo={abrirChequeo}
              onAprobarPrecio={handleAprobarPrecioInline}
            />
          ))}
          {ordenesPorTecnico['__sin_asignar__'] && ordenesPorTecnico['__sin_asignar__'].length > 0 && !esTecnico && (
            <TecnicoColumn
              tecnico={null}
              ordenes={ordenesPorTecnico['__sin_asignar__']}
              onSelectOrden={(o) => navigate(`/admin/ordenes/${o.id}`)}
              userProfile={userProfile}
              puedeAprobar={puedeAprobar}
              aprobandoId={aprobandoId}
              onAbrirChequeo={abrirChequeo}
              onAprobarPrecio={handleAprobarPrecioInline}
            />
          )}
        </div>
      )}

      {/* Modal solo chequeo (oficina) */}
      <Modal
        isOpen={showChequeoModal}
        onClose={cerrarChequeoModal}
        title="Cerrar como solo chequeo"
      >
        <div className="space-y-4">
          {ordenChequeo && (
            <div className="bg-gray-50 rounded-lg p-3 text-xs">
              <p className="font-semibold">{ordenChequeo.clienteNombre}</p>
              <p>{ordenChequeo.equipoTipo}{ordenChequeo.equipoMarca ? ` · ${ordenChequeo.equipoMarca}` : ''}</p>
              <p className="text-gray-500 mt-0.5">{ordenChequeo.numero || ''}</p>
            </div>
          )}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900">
            ¿El cliente decidió NO proceder con la reparación? Se cerrará la orden como solo chequeo.
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Precio del chequeo (RD$) *
            </label>
            <input
              type="number"
              min={0}
              step={50}
              value={chequeoForm.precio}
              onChange={e => setChequeoForm(f => ({ ...f, precio: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-medium"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Sugerido: RD${precioChequeoSugerido.toLocaleString('es-DO')}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Método de pago</label>
            <select
              value={chequeoForm.metodoPago}
              onChange={e => setChequeoForm(f => ({ ...f, metodoPago: e.target.value as MetodoPago | '' }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-medium"
            >
              <option value="">Sin especificar</option>
              <option value="efectivo">Efectivo</option>
              <option value="transferencia">Transferencia</option>
              <option value="tarjeta">Tarjeta</option>
              <option value="link">Link</option>
              <option value="otro">Otro</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Motivo *</label>
            <textarea
              rows={3}
              value={chequeoForm.motivo}
              onChange={e => setChequeoForm(f => ({ ...f, motivo: e.target.value }))}
              placeholder="Ej: El cliente consideró muy costosa la reparación..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-medium"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={cerrarChequeoModal}
              disabled={savingChequeo}
              className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirmarChequeo}
              disabled={savingChequeo}
              className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium disabled:opacity-60"
            >
              {savingChequeo ? 'Guardando...' : 'Confirmar chequeo'}
            </button>
          </div>
        </div>
      </Modal>

      {/* SPRINT-AGENDA-2 (2026-05-25): panel "Tentativos del día" — citas
          por confirmar + mantenimientos programados que caen en la fecha.
          Antes invisibles desde la agenda. Solo lectura — los CTAs llevan
          a las páginas correspondientes (`/admin/citas` y
          `/admin/mantenimiento`) para la acción. Oculto en vista técnico. */}
      {!esTecnico && (citasTentativasDelDia.length > 0 || mantenimientosDelDiaFiltered.length > 0) && (
        <div className="bg-white rounded-2xl shadow-sm border border-amber-200 border-dashed">
          <div className="px-4 py-3 border-b border-amber-100 bg-amber-50/50 rounded-t-2xl flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-sm font-semibold text-amber-900 inline-flex items-center gap-2">
              <Clock size={14} /> Tentativos del día — por confirmar
            </h3>
            <span className="text-[11px] text-amber-700">No están confirmados en la agenda todavía</span>
          </div>
          <div className="divide-y divide-gray-100">
            {citasTentativasDelDia.length > 0 && (
              <div className="p-3">
                <p className="text-[11px] uppercase font-medium text-gray-500 mb-2">Citas por confirmar ({citasTentativasDelDia.length})</p>
                <div className="space-y-1.5">
                  {citasTentativasDelDia.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => navigate('/admin/citas')}
                      className="w-full flex items-center gap-3 text-left bg-amber-50/30 hover:bg-amber-100/50 border border-amber-100 rounded-lg px-3 py-2 transition-colors"
                    >
                      <span className="inline-flex items-center justify-center min-w-[44px] h-8 rounded bg-amber-500 text-white text-xs font-semibold">
                        {c.horaSolicitada || '—'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{c.clienteNombre}</p>
                        <p className="text-xs text-gray-500 truncate">
                          {c.equipoTipo || c.servicio || 'Sin detalle'}{c.telefono ? ` · ${c.telefono}` : ''}
                        </p>
                      </div>
                      <span className="text-[10px] text-amber-700 font-medium">Tap para confirmar →</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {mantenimientosDelDiaFiltered.length > 0 && (
              <div className="p-3">
                <p className="text-[11px] uppercase font-medium text-gray-500 mb-2">Mantenimientos programados ({mantenimientosDelDiaFiltered.length})</p>
                <div className="space-y-1.5">
                  {mantenimientosDelDiaFiltered.map(m => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => navigate('/admin/mantenimiento')}
                      className="w-full flex items-center gap-3 text-left bg-purple-50/30 hover:bg-purple-100/50 border border-purple-100 rounded-lg px-3 py-2 transition-colors"
                    >
                      <span className="inline-flex items-center justify-center min-w-[44px] h-8 rounded bg-purple-500 text-white text-xs font-semibold">
                        Mant.
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{m.clienteNombre}</p>
                        <p className="text-xs text-gray-500 truncate">
                          {m.equipoTipo || '—'}{m.tecnicoNombre ? ` · ${m.tecnicoNombre}` : ''}
                        </p>
                      </div>
                      <span className="text-[10px] text-purple-700 font-medium">Tap para generar orden →</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sección colapsable: técnicos sin citas */}
      {tecnicosSinOrdenes.length > 0 && !esTecnico && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
          <button
            type="button"
            onClick={() => setMostrarSinCitas(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <span className="inline-flex items-center gap-2">
              <User size={14} /> Sin citas hoy ({tecnicosSinOrdenes.length})
            </span>
            {mostrarSinCitas ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          {mostrarSinCitas && (
            <div className="px-4 pb-3 pt-1 flex flex-wrap gap-2">
              {tecnicosSinOrdenes.map(t => (
                <div
                  key={t.id}
                  className="inline-flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-700"
                >
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: t.color || getTecnicoColor(t.nombre) }}
                  />
                  <span>{t.nombre}</span>
                  {t.zona && <span className="text-gray-400">· {t.zona}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value, icon, color }: {
  label: string; value: string; icon: React.ReactNode; color: string;
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={`p-2 rounded-lg ${color}`}>{icon}</div>
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide truncate">{label}</span>
      </div>
      <p className="text-xl font-bold text-primary truncate">{value}</p>
    </div>
  );
}

function TecnicoColumn({
  tecnico,
  ordenes,
  onSelectOrden,
  userProfile,
  puedeAprobar,
  aprobandoId,
  onAbrirChequeo,
  onAprobarPrecio,
}: {
  tecnico: Personal | null;
  ordenes: OrdenServicio[];
  onSelectOrden: (o: OrdenServicio) => void;
  userProfile: Usuario | null;
  puedeAprobar: boolean;
  aprobandoId: string | null;
  onAbrirChequeo: (o: OrdenServicio) => void;
  onAprobarPrecio: (o: OrdenServicio) => void;
}) {
  // userProfile prop reservado para futura expansión (ej: gating finer-grained)
  void userProfile;
  const color = tecnico?.color || getTecnicoColor(tecnico?.nombre || 'Sin asignar');
  const inicial = (tecnico?.nombre || 'Sin asignar').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  const conteos = useMemo(() => {
    let pendiente = 0, enProceso = 0, completado = 0, cancelado = 0, cerradas = 0;
    let totalFacturado = 0;
    for (const o of ordenes) {
      if (o.estadoSimple === 'pendiente') pendiente++;
      else if (o.estadoSimple === 'en_proceso') enProceso++;
      else if (o.estadoSimple === 'completado') completado++;
      else if (o.estadoSimple === 'cancelado') cancelado++;
      if (o.fase === 'cerrado') {
        cerradas++;
        totalFacturado += (o.precioFinal || o.precioAprobado || 0);
      }
    }
    return { pendiente, enProceso, completado, cancelado, cerradas, totalFacturado };
  }, [ordenes]);

  const total = ordenes.length;
  const progreso = total > 0 ? Math.round((conteos.completado / total) * 100) : 0;

  return (
    <div className="flex-shrink-0 w-80 bg-gray-50 rounded-xl border border-gray-200 flex flex-col max-h-[70vh]">
      {/* Header */}
      <div className="p-3 border-b border-gray-200 bg-white rounded-t-xl">
        <div className="flex items-center gap-2 mb-2">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
            style={{ backgroundColor: color }}
          >
            {inicial}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">
              {tecnico?.nombre || 'Sin asignar'}
            </p>
            {tecnico?.zona && (
              <p className="text-[11px] text-gray-500 truncate">{tecnico.zona}</p>
            )}
          </div>
        </div>
        {/* Barra progreso */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] text-gray-600">
            <span>{conteos.completado} de {total} completadas</span>
            <span className="font-semibold">{progreso}%</span>
          </div>
          <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 transition-all"
              style={{ width: `${progreso}%` }}
            />
          </div>
        </div>
        {/* Chips */}
        <div className="flex flex-wrap gap-1 mt-2">
          {conteos.pendiente > 0 && (
            <Chip label={estadoSimpleLabel('pendiente')} count={conteos.pendiente} className="bg-blue-100 text-blue-700" />
          )}
          {conteos.enProceso > 0 && (
            <Chip label={estadoSimpleLabel('en_proceso')} count={conteos.enProceso} className="bg-orange-100 text-orange-700" />
          )}
          {conteos.completado > 0 && (
            <Chip label={estadoSimpleLabel('completado')} count={conteos.completado} className="bg-green-100 text-green-700" />
          )}
          {conteos.cancelado > 0 && (
            <Chip label={estadoSimpleLabel('cancelado')} count={conteos.cancelado} className="bg-gray-200 text-gray-600" />
          )}
        </div>
      </div>

      {/* Lista de órdenes */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {ordenes.length === 0 ? (
          <p className="text-center text-[11px] text-gray-400 py-6">Sin órdenes</p>
        ) : ordenes.map(o => {
          const borderColor = faseBgColor(o.fase);
          const puedeAccionarChequeo = puedeAprobar &&
            !o.soloChequeo &&
            !o.enStandby &&
            ['en_diagnostico', 'en_cotizacion', 'aprobado'].includes(o.fase);
          const necesitaAprobacionPrecio = puedeAprobar &&
            o.precioSugerido !== undefined &&
            o.estadoAprobacion !== 'aprobado' &&
            !['cerrado', 'cancelado'].includes(o.fase);
          return (
            <div
              key={o.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelectOrden(o)}
              onKeyDown={(e) => { if (e.key === 'Enter') onSelectOrden(o); }}
              className="w-full text-left bg-white rounded-lg border border-gray-200 border-l-4 shadow-sm hover:shadow-md transition-shadow p-2.5 cursor-pointer"
              style={{ borderLeftColor: borderColor }}
            >
              <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-mono text-[11px] font-bold text-primary">{o.numero || '#--'}</span>
                  {o.enStandby && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 text-[10px] font-medium">
                      <Pause size={9} /> Stand-by
                    </span>
                  )}
                  {o.soloChequeo && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-medium">
                      🔍 Chequeo
                    </span>
                  )}
                  {o.reactivadaPostChequeo && (
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[10px] font-medium"
                      title={o.cierreChequeoHistorico?.monto
                        ? `Chequeo previo de RD$${o.cierreChequeoHistorico.monto.toLocaleString('es-DO')} ya cobrado`
                        : 'Chequeo previo ya cobrado'}
                    >
                      <RotateCcw size={10} /> Reparación post-chequeo
                    </span>
                  )}
                  {o.cierreServicio?.piezasUsadas &&
                    o.cierreServicio.piezasUsadas.length > 0 &&
                    !o.cierreServicio.piezasValidadasPorAdmin && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-medium">
                      ⚠️ Piezas por validar
                    </span>
                  )}
                </div>
                <span
                  className="text-[10px] font-medium px-1.5 py-0.5 rounded-full text-white"
                  style={{ backgroundColor: borderColor }}
                >
                  {faseLabel(o.fase)}
                </span>
              </div>
              <div className="flex items-start gap-2">
                {o.fotoEquipoUrl && (
                  <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                    <FotoEquipoDisplay url={o.fotoEquipoUrl} size="sm" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-gray-900 truncate">{o.clienteNombre}</p>
                  <div className="flex items-center gap-2 mt-1 text-[11px] text-gray-500 flex-wrap">
                    {o.fechaCita && (
                      <span className="inline-flex items-center gap-0.5">
                        <Clock size={10} /> {formatHora(o.fechaCita)}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-0.5 truncate">
                      <Wrench size={10} /> {formatearEquipoLabel(o)}
                    </span>
                  </div>
                </div>
              </div>
              {o.fase === 'cerrado' && (o.precioFinal || o.precioAprobado) && (
                <p className="text-[11px] text-emerald-700 font-semibold mt-1">
                  {formatMoneda(o.precioFinal || o.precioAprobado || 0)}
                </p>
              )}
              <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                <BotonComoLlegar ubicacion={coordsFromLatLng(o.clienteLat, o.clienteLng)} size="sm" />
              </div>
              {(necesitaAprobacionPrecio || puedeAccionarChequeo) && (
                <div
                  className="mt-2 flex flex-wrap gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  {necesitaAprobacionPrecio && (
                    <button
                      type="button"
                      onClick={() => onAprobarPrecio(o)}
                      disabled={aprobandoId === o.id}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500 hover:bg-green-600 text-white text-[10px] font-semibold disabled:opacity-60"
                      title={`Aprobar RD$${Number(o.precioSugerido || 0).toLocaleString('es-DO')}`}
                    >
                      <DollarIcon size={10} />
                      {aprobandoId === o.id ? 'Aprobando...' : `Aprobar RD$${Number(o.precioSugerido || 0).toLocaleString('es-DO')}`}
                    </button>
                  )}
                  {puedeAccionarChequeo && (
                    <button
                      type="button"
                      onClick={() => onAbrirChequeo(o)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-semibold"
                      title="Cerrar como solo chequeo"
                    >
                      <ClipboardCheck size={10} /> 🔍 Chequeo
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      {conteos.cerradas > 0 && (
        <div className="border-t border-gray-200 bg-white px-3 py-2 rounded-b-xl">
          <p className="text-[11px] text-gray-600">
            Facturado hoy: <span className="font-semibold text-emerald-700">{formatMoneda(conteos.totalFacturado)}</span>
          </p>
        </div>
      )}
    </div>
  );
}

function Chip({ label, count, className }: { label: string; count: number; className: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${className}`}>
      {label} · {count}
    </span>
  );
}
