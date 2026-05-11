import { useState, useMemo } from 'react';
import { doc, updateDoc, Timestamp, arrayUnion } from 'firebase/firestore';
import { db } from '../../firebase/config';
import {
  OrdenServicio, FaseOrden, EstadoOrdenSimple, Personal, StandbyPieza,
} from '../../types';
import {
  faseLabel, faseBgColor, formatMoneda, formatHora, formatFecha,
  crearRegistroAuditoria, FASES_ORDENADAS, tieneStandby,
  generarTokenPortalCliente, calcularExpiracionTokenPortal,
} from '../../utils';
import { useApp } from '../../context/AppContext';
import { registrarComisionPorOrden } from '../../utils/comisiones';
import { crearNotificacion } from '../../services/notificaciones.service';
import Modal from '../Modal';
import {
  Calendar, Clock, Wrench, User, Package, GripVertical,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface Props {
  ordenes: OrdenServicio[];
  personal: Personal[];
  standbyItems: StandbyPieza[];
  onSelect: (orden: OrdenServicio) => void;
}

function mapearEstadoSimple(fase: FaseOrden): EstadoOrdenSimple {
  if (['trabajo_realizado', 'cerrado'].includes(fase)) return 'completado';
  if (['en_diagnostico', 'en_cotizacion'].includes(fase)) return 'en_proceso';
  if (fase === 'cancelado') return 'cancelado';
  return 'pendiente';
}

export default function OrdenesTablero({ ordenes, standbyItems, onSelect }: Props) {
  const { userProfile } = useApp();
  const rol = userProfile?.rol;

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hoverCol, setHoverCol] = useState<FaseOrden | null>(null);

  // Modal retroceso (motivo)
  const [retroPending, setRetroPending] = useState<{
    orden: OrdenServicio;
    faseDestino: FaseOrden;
  } | null>(null);
  const [motivoRetro, setMotivoRetro] = useState('');
  const [saving, setSaving] = useState(false);

  // Agrupar órdenes por fase (excluye canceladas/eliminadas)
  const ordenesPorFase = useMemo(() => {
    const map: Record<FaseOrden, OrdenServicio[]> = {
      nuevo_lead: [], en_gestion: [], agendado: [], en_diagnostico: [],
      en_cotizacion: [], aprobado: [], trabajo_realizado: [], cerrado: [],
      cancelado: [],
    };
    for (const o of ordenes) {
      if (o.eliminada) continue;
      if (o.fase === 'cancelado') continue;
      if (map[o.fase]) map[o.fase].push(o);
    }
    for (const fase of FASES_ORDENADAS) {
      map[fase].sort((a, b) => {
        const af = a.fechaCita?.getTime() || Infinity;
        const bf = b.fechaCita?.getTime() || Infinity;
        if (af !== bf) return af - bf;
        const ac = a.createdAt?.getTime() || 0;
        const bc = b.createdAt?.getTime() || 0;
        return bc - ac;
      });
    }
    return map;
  }, [ordenes]);

  const totalPorFase = (fase: FaseOrden): number => {
    return ordenesPorFase[fase].reduce((sum, o) => {
      return sum + (o.precioFinal || o.precioAprobado || 0);
    }, 0);
  };

  const ejecutarUpdate = async (
    orden: OrdenServicio,
    faseDestino: FaseOrden,
    nota?: string,
  ) => {
    const usuario = userProfile?.nombre || 'Sistema';
    const ahora = Timestamp.now();
    const nuevoHistorial = [
      ...orden.historialFases.map(h => ({
        fase: h.fase,
        timestamp: Timestamp.fromDate(h.timestamp instanceof Date ? h.timestamp : new Date()),
        usuario: h.usuario || '',
        ...(h.nota ? { nota: h.nota } : {}),
      })),
      {
        fase: faseDestino,
        timestamp: ahora,
        usuario,
        ...(nota ? { nota } : {}),
      },
    ];
    const registro = crearRegistroAuditoria(
      usuario, 'cambio_fase',
      nota
        ? `Cambió fase a "${faseLabel(faseDestino)}" (tablero) — ${nota}`
        : `Cambió fase a "${faseLabel(faseDestino)}" (tablero)`,
      'fase', faseLabel(orden.fase), faseLabel(faseDestino),
    );
    const updatePayload: Record<string, unknown> = {
      fase: faseDestino,
      estadoSimple: mapearEstadoSimple(faseDestino),
      estado: faseDestino === 'cerrado' ? 'cerrado' : 'activo',
      historialFases: nuevoHistorial,
      auditoria: arrayUnion(registro),
      updatedAt: ahora,
    };
    // Si la orden NO está marcada como solo_chequeo y se está cerrando, marcar
    // explícitamente como reparacion_completa para que `obtenerCostoPiezasDeOrden`
    // pueda distinguir la factura del chequeo previo (en órdenes reactivadas).
    if (faseDestino === 'cerrado' && !orden.soloChequeo) {
      updatePayload.tipoCierre = 'reparacion_completa';
    }
    // Portal del Cliente: al pasar a `agendado`, si la orden no tiene token,
    // generarlo. Idempotente: nunca pisamos uno existente.
    if (faseDestino === 'agendado' && !orden.tokenPortalCliente) {
      updatePayload.tokenPortalCliente = generarTokenPortalCliente();
    }
    // SPRINT-139 (2026-05-11): al cerrar, setear expiración del token portal.
    if (faseDestino === 'cerrado') {
      updatePayload.tokenPortalClienteExpiraEn = Timestamp.fromDate(
        calcularExpiracionTokenPortal(ahora.toDate())
      );
    }
    await updateDoc(doc(db, 'ordenes_servicio', orden.id), updatePayload);

    if (faseDestino === 'aprobado' && orden.tecnicoId) {
      try {
        const total = orden.precioFinal || orden.precioAprobado || 0;
        await crearNotificacion({
          userId: orden.tecnicoId,
          destinatarioNombre: orden.tecnicoNombre,
          tipo: 'precio_aprobado',
          titulo: 'Precio aprobado · Puedes comenzar',
          mensaje: `Orden ${orden.numero} aprobada. Cliente: ${orden.clienteNombre}. Total: RD$${total.toLocaleString('es-DO')}.`,
          ordenId: orden.id,
          ordenNumero: orden.numero,
        });
      } catch (err) {
        console.error('Error creando notificación:', err);
      }
    }

    if (faseDestino === 'cerrado') {
      try {
        const ordenAct = { ...orden, fase: 'cerrado' as FaseOrden };
        const res = await registrarComisionPorOrden(ordenAct, userProfile);
        if (res.creada) {
          toast.success(`Comisión registrada: RD$ ${(res.comisionMonto || 0).toLocaleString('es-DO')}`);
        }
      } catch (err) {
        console.error('Error registrando comisión:', err);
      }
    }
  };

  const validarPermisoMovimiento = (
    orden: OrdenServicio,
    faseDestino: FaseOrden,
  ): { ok: boolean; error?: string } => {
    if (rol === 'tecnico') {
      return { ok: false, error: 'No tienes permiso para ese cambio de fase' };
    }
    if (rol === 'secretaria') {
      const permitido =
        faseDestino === 'agendado' &&
        (orden.fase === 'nuevo_lead' || orden.fase === 'en_gestion');
      if (!permitido) {
        return { ok: false, error: 'No tienes permiso para ese cambio de fase' };
      }
    }
    return { ok: true };
  };

  const handleMover = async (ordenId: string, faseDestino: FaseOrden) => {
    const orden = ordenes.find(o => o.id === ordenId);
    if (!orden) return;
    if (orden.fase === faseDestino) return;

    const perm = validarPermisoMovimiento(orden, faseDestino);
    if (!perm.ok) {
      toast.error(perm.error || 'Sin permiso');
      return;
    }

    // Grupo operaria
    if (
      rol === 'operaria' &&
      orden.operariaId &&
      orden.operariaId !== userProfile?.id
    ) {
      const nombreDueño = orden.operariaNombre || 'otra operaria';
      const ok = window.confirm(
        `Esta orden pertenece al grupo de ${nombreDueño}. ¿Confirmar movimiento?`,
      );
      if (!ok) return;
    }

    // Retroceso
    const destinoIdx = FASES_ORDENADAS.indexOf(faseDestino);
    const actualIdx = FASES_ORDENADAS.indexOf(orden.fase);
    const esRetroceso = actualIdx !== -1 && destinoIdx < actualIdx;
    if (esRetroceso) {
      setRetroPending({ orden, faseDestino });
      setMotivoRetro('');
      return;
    }

    setSaving(true);
    try {
      await ejecutarUpdate(orden, faseDestino);
      toast.success(`Movida a "${faseLabel(faseDestino)}"`);
    } catch (err) {
      console.error(err);
      toast.error('Error al mover la orden');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmarRetroceso = async () => {
    if (!retroPending) return;
    if (motivoRetro.trim().length < 10) {
      toast.error('El motivo debe tener al menos 10 caracteres');
      return;
    }
    setSaving(true);
    try {
      await ejecutarUpdate(retroPending.orden, retroPending.faseDestino, motivoRetro.trim());
      toast.success(`Regresada a "${faseLabel(retroPending.faseDestino)}"`);
      setRetroPending(null);
      setMotivoRetro('');
    } catch (err) {
      console.error(err);
      toast.error('Error al retroceder fase');
    } finally {
      setSaving(false);
    }
  };

  const onDragStart = (e: React.DragEvent, ordenId: string) => {
    e.dataTransfer.setData('text/plain', ordenId);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingId(ordenId);
  };

  const onDragEnd = () => {
    setDraggingId(null);
    setHoverCol(null);
  };

  const onDragOverCol = (e: React.DragEvent, fase: FaseOrden) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (hoverCol !== fase) setHoverCol(fase);
  };

  const onDropCol = (e: React.DragEvent, fase: FaseOrden) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    setHoverCol(null);
    setDraggingId(null);
    if (id) handleMover(id, fase);
  };

  return (
    <>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {FASES_ORDENADAS.map(fase => {
          const items = ordenesPorFase[fase];
          const color = faseBgColor(fase);
          const isHover = hoverCol === fase;
          return (
            <div
              key={fase}
              onDragOver={(e) => onDragOverCol(e, fase)}
              onDragLeave={() => { if (hoverCol === fase) setHoverCol(null); }}
              onDrop={(e) => onDropCol(e, fase)}
              className={`flex-shrink-0 w-72 bg-gray-50 rounded-xl border transition-all ${
                isHover
                  ? 'border-blue-400 ring-2 ring-blue-400 ring-offset-2 bg-blue-50/50'
                  : 'border-gray-200'
              }`}
            >
              <div
                className="sticky top-0 z-10 rounded-t-xl px-3 py-2 text-white shadow-sm"
                style={{ backgroundColor: color }}
              >
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-xs font-bold uppercase tracking-wide truncate">
                    {faseLabel(fase)}
                  </h4>
                  <span className="text-[11px] font-semibold bg-white/25 rounded-full px-2 py-0.5">
                    {items.length}
                  </span>
                </div>
                {items.length > 0 && totalPorFase(fase) > 0 && (
                  <p className="text-[10px] text-white/80 mt-0.5">
                    {formatMoneda(totalPorFase(fase))}
                  </p>
                )}
              </div>

              <div className="p-2 space-y-2 min-h-[120px] max-h-[calc(100vh-260px)] overflow-y-auto">
                {items.length === 0 ? (
                  <div className="text-center text-[11px] text-gray-400 py-6">
                    Sin órdenes
                  </div>
                ) : (
                  items.map(o => {
                    const isDragging = draggingId === o.id;
                    const conStandby = tieneStandby(o, standbyItems);
                    return (
                      <div
                        key={o.id}
                        draggable
                        onDragStart={(e) => onDragStart(e, o.id)}
                        onDragEnd={onDragEnd}
                        onClick={() => onSelect(o)}
                        className={`group bg-white rounded-lg border border-gray-200 border-l-4 shadow-sm p-2.5 cursor-grab active:cursor-grabbing transition-all hover:shadow-md ${
                          isDragging ? 'opacity-40' : ''
                        }`}
                        style={{ borderLeftColor: color }}
                      >
                        <div className="flex items-start justify-between gap-1 mb-1">
                          <span className="font-mono text-[11px] font-bold text-[#0f3460]">
                            {o.numero || '#--'}
                          </span>
                          <GripVertical
                            size={12}
                            className="text-gray-300 group-hover:text-gray-500 shrink-0"
                          />
                        </div>
                        <p className="text-xs font-semibold text-gray-900 truncate">
                          {o.clienteNombre}
                        </p>
                        <p className="text-[11px] text-gray-600 truncate">
                          {o.equipoTipo}{o.equipoMarca ? ` · ${o.equipoMarca}` : ''}
                        </p>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {o.soloChequeo && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-yellow-100 text-yellow-800">
                              Chequeo
                            </span>
                          )}
                          {o.enStandby && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-yellow-100 text-yellow-800">
                              ⏸ Pendiente de piezas
                            </span>
                          )}
                          {conStandby && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-yellow-100 text-yellow-800">
                              <Package size={9} /> Piezas
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1.5 text-[10px] text-gray-500">
                          {o.fechaCita && (
                            <span className="inline-flex items-center gap-1">
                              <Calendar size={9} />
                              {formatFecha(o.fechaCita).split(',')[0]}
                            </span>
                          )}
                          {o.fechaCita && (
                            <span className="inline-flex items-center gap-1">
                              <Clock size={9} />
                              {formatHora(o.fechaCita)}
                            </span>
                          )}
                          {o.tecnicoNombre && (
                            <span className="inline-flex items-center gap-1 truncate">
                              <Wrench size={9} />
                              {o.tecnicoNombre.split(' ')[0]}
                            </span>
                          )}
                          {o.operariaNombre && (
                            <span className="inline-flex items-center gap-1 truncate text-purple-600">
                              <User size={9} />
                              {o.operariaNombre.split(' ')[0]}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Modal
        isOpen={!!retroPending}
        onClose={() => { setRetroPending(null); setMotivoRetro(''); }}
        title={retroPending ? `Regresar a "${faseLabel(retroPending.faseDestino)}"` : 'Regresar fase'}
      >
        {retroPending && (
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-900">
              Vas a retroceder la orden <span className="font-semibold">{retroPending.orden.numero}</span> de{' '}
              <span className="font-semibold">{faseLabel(retroPending.orden.fase)}</span> a{' '}
              <span className="font-semibold">{faseLabel(retroPending.faseDestino)}</span>. Escribe el motivo para auditoría.
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Motivo del regreso *</label>
              <textarea
                rows={4}
                value={motivoRetro}
                onChange={e => setMotivoRetro(e.target.value)}
                placeholder="Mínimo 10 caracteres"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
              <p className={`text-[11px] mt-1 ${motivoRetro.trim().length >= 10 ? 'text-gray-500' : 'text-red-500'}`}>
                {motivoRetro.trim().length}/10 caracteres mínimos
              </p>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => { setRetroPending(null); setMotivoRetro(''); }}
                disabled={saving}
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmarRetroceso}
                disabled={saving || motivoRetro.trim().length < 10}
                className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium disabled:opacity-60"
              >
                {saving ? 'Guardando...' : 'Confirmar regreso'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
