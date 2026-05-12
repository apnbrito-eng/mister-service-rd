import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase/config';
import {
  OrdenServicio, Personal, RecordatorioDiario, TipoRecordatorio, ItemAviso,
} from '../../types';
import { parseOrden, formatHora } from '../../utils';
import { whatsappUrl } from '../../utils/whatsapp';
import { useApp } from '../../context/AppContext';
import {
  obtenerOCrearRecordatorio, marcarCompletado, marcarItemAvisado,
  actualizarItems, suscribirRecordatoriosDelDia, ventanaActiva,
  obtenerDiaSiguienteLaboral,
} from '../../services/recordatorios.service';
import {
  Calendar, Check, AlertTriangle, ChevronDown, ChevronUp, MapPin,
} from 'lucide-react';
import WhatsAppIcon from '../icons/WhatsAppIcon';
import { format, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import toast from 'react-hot-toast';
import ModalAccionRecordatorio from './ModalAccionRecordatorio';

interface Props {
  tipo: TipoRecordatorio;
  /** Se incrementa externamente cada 60s para forzar re-evaluación de ventana. */
  tickSeed?: number;
}

function formatFechaLarga(d: Date): string {
  return format(d, "EEEE dd 'de' MMMM", { locale: es });
}

export default function RecordatorioBanner({ tipo, tickSeed = 0 }: Props) {
  // SPRINT-149: `currentUser` necesario para comparar contra `operariaId` que
  // post-SPRINT-105 persiste auth.uid (no docId).
  const { userProfile, currentUser } = useApp();
  const navigate = useNavigate();
  const rol = userProfile?.rol;

  const [ordenes, setOrdenes] = useState<OrdenServicio[]>([]);
  const [personal, setPersonal] = useState<Personal[]>([]);
  const [recordatorios, setRecordatorios] = useState<RecordatorioDiario[]>([]);
  const [miRecordatorio, setMiRecordatorio] = useState<RecordatorioDiario | null>(null);
  const [expandido, setExpandido] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  // SPRINT-104: modal con acciones admin/coord sobre fila de operaria pendiente.
  const [modalOperaria, setModalOperaria] = useState<{ op: Personal; rec: RecordatorioDiario | null } | null>(null);

  const ahora = useMemo(() => new Date(), [tickSeed]); // eslint-disable-line react-hooks/exhaustive-deps
  const esDomingo = ahora.getDay() === 0;
  const diaManana = useMemo(() => obtenerDiaSiguienteLaboral(ahora), [ahora]);
  const rolRelevante = rol === 'operaria' || rol === 'coordinadora' || rol === 'administrador';

  // Subscribe a órdenes y personal para construir items (solo si hace falta)
  useEffect(() => {
    if (!rolRelevante || esDomingo) return;
    const unsubOrd = onSnapshot(collection(db, 'ordenes_servicio'), (snap) => {
      setOrdenes(snap.docs.map(d => parseOrden(d.id, d.data()) as OrdenServicio));
    });
    const unsubPers = onSnapshot(collection(db, 'personal'), (snap) => {
      setPersonal(snap.docs.map(d => ({ id: d.id, ...d.data() } as Personal)));
    });
    return () => { unsubOrd(); unsubPers(); };
  }, [rolRelevante, esDomingo]);

  // Suscribirse a los recordatorios de hoy (vista consolidada admin/coord)
  useEffect(() => {
    if (!rolRelevante || esDomingo) return;
    const hoyStr = format(ahora, 'yyyy-MM-dd');
    const unsub = suscribirRecordatoriosDelDia(hoyStr, (recs) => {
      setRecordatorios(recs.filter(r => r.tipo === tipo));
    });
    return () => unsub();
  }, [rolRelevante, esDomingo, tipo, ahora]);

  // Calcular items de la operaria para tipo horarios_clientes
  const itemsParaMiRecordatorio = useMemo((): ItemAviso[] => {
    if (tipo !== 'horarios_clientes') return [];
    if (rol !== 'operaria' || !userProfile) return [];
    // SPRINT-149 (P-006 variante operariaId): `o.operariaId` post-SPRINT-105
    // persiste auth.uid. Comparar contra `currentUser?.uid` con fallback
    // a `userProfile.id` para operarias legacy pre-onboarding.
    const ordenesManana = ordenes.filter(o =>
      !o.eliminada &&
      !['cerrado', 'cancelado'].includes(o.fase) &&
      o.fechaCita && isSameDay(o.fechaCita, diaManana) &&
      o.operariaId === (currentUser?.uid || userProfile.id),
    );
    return ordenesManana.map(o => ({
      ordenId: o.id,
      ordenNumero: o.numero || '',
      clienteNombre: o.clienteNombre,
      clienteTelefono: o.clienteTelefono,
      horaEstimada: o.fechaCita ? formatHora(o.fechaCita) : undefined,
      avisado: false,
    }));
  }, [tipo, rol, userProfile, currentUser, ordenes, diaManana]);

  // Crear / sincronizar recordatorio para operaria actual
  useEffect(() => {
    if (!rolRelevante || esDomingo) return;
    if (rol !== 'operaria' || !userProfile) {
      setMiRecordatorio(null);
      return;
    }
    let cancelled = false;
    // SPRINT-149 (P-006 variante operariaId): persistir auth.uid (no docId)
    // en `operariaId` del recordatorio para alinear con `o.operariaId` que
    // post-SPRINT-105 persiste auth.uid. Fallback `userProfile.id` legacy.
    const operariaIdAuth = currentUser?.uid || userProfile.id;
    obtenerOCrearRecordatorio(
      operariaIdAuth,
      userProfile.nombre,
      tipo,
      itemsParaMiRecordatorio,
    ).then(rec => {
      if (cancelled) return;
      setMiRecordatorio(rec);
      // Si el doc tiene items desactualizados (nuevas órdenes hoy), sincronizar
      if (tipo === 'horarios_clientes' && !rec.completado) {
        const existingIds = new Set((rec.items || []).map(i => i.ordenId));
        const currentIds = new Set(itemsParaMiRecordatorio.map(i => i.ordenId));
        const cambioIds = existingIds.size !== currentIds.size
          || [...currentIds].some(id => !existingIds.has(id));
        if (cambioIds && itemsParaMiRecordatorio.length > 0) {
          // Preservar avisado=true para items existentes, agregar nuevos
          const merged = itemsParaMiRecordatorio.map(nuevo => {
            const prev = (rec.items || []).find(p => p.ordenId === nuevo.ordenId);
            return prev ? { ...nuevo, avisado: prev.avisado, avisadoEn: prev.avisadoEn } : nuevo;
          });
          actualizarItems(rec.id, merged).catch(console.error);
        }
      }
    }).catch(console.error);
    return () => { cancelled = true; };
  }, [rolRelevante, esDomingo, rol, userProfile, currentUser, tipo, itemsParaMiRecordatorio]);

  // Reflejar updates live del miRecordatorio desde la suscripción consolidada
  useEffect(() => {
    if (rol !== 'operaria' || !userProfile) return;
    // SPRINT-149 (P-006 variante operariaId): `r.operariaId` post-SPRINT-105
    // persiste auth.uid (escrito desde recordatorios.service.ts cuando crea/actualiza).
    // Fallback a `userProfile.id` para operarias legacy.
    const match = recordatorios.find(r => r.operariaId === (currentUser?.uid || userProfile.id));
    if (match) setMiRecordatorio(match);
  }, [recordatorios, rol, userProfile, currentUser]);

  if (!rolRelevante || esDomingo || dismissed) return null;

  const estadoVentana = ventanaActiva(tipo, ahora);

  // Vista operaria ---------------------------------------------------
  if (rol === 'operaria') {
    if (!miRecordatorio) return null;
    const completado = miRecordatorio.completado;
    if (estadoVentana === 'antes' && !completado) return null;
    if (completado) {
      return (
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-3">
          <Check size={18} className="text-green-600 shrink-0" />
          <p className="text-sm text-green-800 flex-1">
            {tipo === 'ruta_manana' ? 'Ruta de mañana organizada' : 'Clientes de mañana avisados'}
            {miRecordatorio.completadoEn && (
              <span className="text-xs text-green-600 ml-2">
                · {formatHora(miRecordatorio.completadoEn)}
              </span>
            )}
          </p>
          <button
            onClick={() => setDismissed(true)}
            className="text-xs text-green-700 hover:text-green-900"
          >
            Ocultar
          </button>
        </div>
      );
    }

    const urgente = estadoVentana === 'urgente';
    const baseClass = urgente
      ? 'bg-red-50 border-red-300 animate-pulse'
      : 'bg-blue-50 border-blue-300';
    const itemsActuales = miRecordatorio.items || [];
    const avisadosCount = itemsActuales.filter(i => i.avisado).length;
    const todosAvisados = itemsActuales.length > 0 && avisadosCount === itemsActuales.length;
    const yaloHicePuedeActivar =
      tipo === 'ruta_manana'
        ? true
        : (itemsActuales.length === 0 || todosAvisados);

    const handleMarcarCompletado = async () => {
      if (!yaloHicePuedeActivar) {
        toast.error('Falta marcar clientes como avisados');
        return;
      }
      setSaving(true);
      try {
        await marcarCompletado(miRecordatorio.id);
        toast.success('Recordatorio completado');
      } catch (err) {
        console.error(err);
        toast.error('Error al marcar');
      } finally {
        setSaving(false);
      }
    };

    const handleToggleItem = async (ordenId: string, avisado: boolean) => {
      try {
        await marcarItemAvisado(miRecordatorio.id, ordenId, avisado);
      } catch (err) {
        console.error(err);
        toast.error('Error al actualizar');
      }
    };

    return (
      <div className={`border-2 rounded-xl p-4 ${baseClass}`}>
        <div className="flex items-start gap-3">
          <div className={`shrink-0 p-2 rounded-lg ${urgente ? 'bg-red-100' : 'bg-blue-100'}`}>
            {tipo === 'ruta_manana'
              ? <MapPin size={18} className={urgente ? 'text-red-600' : 'text-blue-600'} />
              : <WhatsAppIcon filled={false} className={urgente ? 'text-red-600' : 'text-blue-600'} size={18} />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className={`font-semibold text-sm ${urgente ? 'text-red-900' : 'text-blue-900'}`}>
                {tipo === 'ruta_manana'
                  ? `Organiza la ruta de mañana (${formatFechaLarga(diaManana)})`
                  : 'Avisa a los clientes de mañana'}
              </p>
              {urgente && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-red-600 text-white px-2 py-0.5 rounded-full">
                  <AlertTriangle size={10} /> URGENTE
                </span>
              )}
            </div>
            <p className={`text-xs mt-1 ${urgente ? 'text-red-800' : 'text-blue-800'}`}>
              {tipo === 'ruta_manana'
                ? 'Entra al mapa y coordina cómo van a moverse tus técnicos mañana. Cada pin se puede arrastrar para reasignar.'
                : 'Llama o escribe por WhatsApp a cada cliente informando la hora aproximada.'}
            </p>
            {tipo === 'horarios_clientes' && itemsActuales.length > 0 && (
              <p className="text-[11px] text-gray-700 mt-1.5">
                <span className="font-semibold">{avisadosCount}</span> de{' '}
                <span className="font-semibold">{itemsActuales.length}</span> avisados
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 mt-3 flex-wrap">
          {tipo === 'ruta_manana' && (
            <button
              onClick={() => navigate(`/admin/mapa?fecha=${format(diaManana, 'yyyy-MM-dd')}`)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-lg text-xs font-semibold transition-colors"
            >
              <MapPin size={13} /> Ver mapa
            </button>
          )}
          {tipo === 'horarios_clientes' && itemsActuales.length > 0 && (
            <button
              onClick={() => setExpandido(e => !e)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-lg text-xs font-semibold transition-colors"
            >
              {expandido ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              {expandido ? 'Ocultar lista' : 'Ver lista'}
            </button>
          )}
          <button
            onClick={handleMarcarCompletado}
            disabled={saving || !yaloHicePuedeActivar}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title={!yaloHicePuedeActivar ? 'Marca primero todos los clientes como avisados' : ''}
          >
            <Check size={13} /> Ya lo hice
          </button>
        </div>

        {tipo === 'horarios_clientes' && expandido && itemsActuales.length > 0 && (
          <div className="mt-3 space-y-1.5 bg-white rounded-lg border border-gray-200 p-2">
            {itemsActuales.map(it => {
              const fechaTexto = format(diaManana, 'dd/MM/yyyy');
              const mensaje = `Hola ${it.clienteNombre}, le recordamos que su cita está programada para el ${fechaTexto}${it.horaEstimada ? ` aproximadamente a las ${it.horaEstimada}` : ''}. Confirmamos? — Mister Service RD`;
              return (
                <div key={it.ordenId} className="flex items-center gap-2 text-xs py-1">
                  <input
                    type="checkbox"
                    checked={it.avisado}
                    onChange={e => handleToggleItem(it.ordenId, e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                  />
                  <span className={`flex-1 min-w-0 truncate ${it.avisado ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                    <span className="font-semibold">{it.ordenNumero || 'OS'}</span>
                    {' · '}{it.clienteNombre}
                    {it.horaEstimada && <span className="text-gray-500"> · {it.horaEstimada}</span>}
                  </span>
                  {it.clienteTelefono && (
                    <a
                      href={whatsappUrl(it.clienteTelefono, mensaje)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-green-600 hover:text-green-700 inline-flex items-center gap-1"
                      title="Abrir WhatsApp"
                    >
                      <WhatsAppIcon filled={true} size={13} />
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Vista consolidada admin / coord ---------------------------------
  const operariasActivas = personal.filter(p => p.rol === 'operaria' && p.activo);
  if (operariasActivas.length === 0) return null;
  if (estadoVentana === 'antes') return null;

  const porOperaria = operariasActivas.map(op => {
    // SPRINT-149 (P-006 variante operariaId): `r.operariaId` post-SPRINT-105
    // persiste auth.uid. Fallback `op.id` para operarias legacy.
    const rec = recordatorios.find(r => r.operariaId === (op.uid || op.id));
    const itemsCount = rec?.items?.length || 0;
    const avisados = rec?.items?.filter(i => i.avisado).length || 0;
    return { op, rec, itemsCount, avisados };
  });

  const hayPendientes = porOperaria.some(({ rec }) => !rec?.completado);
  const urgente = estadoVentana === 'urgente' && hayPendientes;
  if (!hayPendientes && estadoVentana === 'activa') {
    // Todas listas → resumido
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-3">
        <Check size={18} className="text-green-600 shrink-0" />
        <p className="text-sm text-green-800 flex-1">
          {tipo === 'ruta_manana'
            ? 'Todas las operarias organizaron la ruta de mañana'
            : 'Todas las operarias avisaron a los clientes'}
        </p>
      </div>
    );
  }
  if (!hayPendientes) return null;

  const baseClass = urgente
    ? 'bg-red-50 border-red-300 animate-pulse'
    : 'bg-indigo-50 border-indigo-300';

  // SPRINT-104: filas clickeables sólo para admin/coord cuando recordatorio NO está completado.
  const puedeAbrirModal = rol === 'administrador' || rol === 'coordinadora';

  return (
    <>
    <div className={`border-2 rounded-xl p-4 ${baseClass}`}>
      <div className="flex items-center gap-2 flex-wrap mb-2">
        {tipo === 'ruta_manana'
          ? <Calendar size={16} className={urgente ? 'text-red-600' : 'text-indigo-600'} />
          : <WhatsAppIcon filled={false} className={urgente ? 'text-red-600' : 'text-indigo-600'} size={16} />}
        <p className={`font-semibold text-sm ${urgente ? 'text-red-900' : 'text-indigo-900'}`}>
          {tipo === 'ruta_manana'
            ? `Organización de ruta de mañana (${formatFechaLarga(diaManana)})`
            : 'Avisos a clientes de mañana'}
        </p>
        {urgente && (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-red-600 text-white px-2 py-0.5 rounded-full">
            <AlertTriangle size={10} /> URGENTE
          </span>
        )}
      </div>
      <div className="space-y-1">
        {porOperaria.map(({ op, rec, itemsCount, avisados }) => {
          const completado = rec?.completado === true;
          const filaClickeable = puedeAbrirModal && !completado;
          const tooltipCompletado = completado && rec?.completadoPor
            ? `Completado por ${rec.completadoPor.nombre}: ${rec.completadoPor.motivo}`
            : undefined;
          const filaClass = filaClickeable
            ? 'flex items-center justify-between gap-2 text-xs bg-white/60 rounded-lg px-2 py-1.5 cursor-pointer hover:bg-white transition-colors'
            : 'flex items-center justify-between gap-2 text-xs bg-white/60 rounded-lg px-2 py-1.5';
          const handleClickFila = () => {
            if (!filaClickeable) return;
            setModalOperaria({ op, rec: rec || null });
          };
          return (
            <div
              key={op.id}
              className={filaClass}
              onClick={handleClickFila}
              role={filaClickeable ? 'button' : undefined}
              tabIndex={filaClickeable ? 0 : undefined}
              title={tooltipCompletado}
              onKeyDown={(e) => {
                if (filaClickeable && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  handleClickFila();
                }
              }}
            >
              <span className="font-medium text-gray-800 truncate">{op.nombre}</span>
              <span className={`text-[11px] ${completado ? 'text-green-700' : urgente ? 'text-red-700 font-semibold' : 'text-gray-600'}`}>
                {completado ? (
                  <>
                    <Check size={11} className="inline mr-0.5" />
                    {rec?.completadoPor ? 'Completado (override admin)' : 'Completado'}
                    {tipo === 'horarios_clientes' && itemsCount > 0 && ` · ${avisados}/${itemsCount}`}
                  </>
                ) : (
                  <>
                    {tipo === 'ruta_manana' ? 'Ruta pendiente' : `${avisados}/${itemsCount || '—'} avisados`}
                    {urgente && ' (urgente)'}
                  </>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
    {modalOperaria && (
      <ModalAccionRecordatorio
        isOpen={true}
        onClose={() => setModalOperaria(null)}
        operaria={modalOperaria.op}
        recordatorio={modalOperaria.rec}
        tipo={tipo}
      />
    )}
    </>
  );
}
