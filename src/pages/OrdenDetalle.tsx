import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, onSnapshot, updateDoc, Timestamp, arrayUnion } from 'firebase/firestore';
import { db } from '../firebase/config';
import { OrdenServicio, FaseOrden } from '../types';
import { faseLabel, formatFecha, tiempoTranscurrido, faseBgColor, formatTelefono, whatsappLink, googleMapsLink, estadoSimpleLabel, estadoSimpleColor, parseOrden, crearRegistroAuditoria } from '../utils';
import LoadingSpinner from '../components/LoadingSpinner';
import Badge from '../components/Badge';
import { useApp } from '../context/AppContext';
import {
  ArrowLeft, Phone, Wrench, User, Calendar,
  Clock, MessageSquare, Save, MapPin, ExternalLink, MessageCircle,
  Satellite, Copy, Power
} from 'lucide-react';
import toast from 'react-hot-toast';
import { generarTrackingToken } from '../services/gps.service';
import { whatsappUrl } from '../utils/whatsapp';

const FASES: FaseOrden[] = [
  'nuevo_lead', 'en_gestion', 'en_diagnostico', 'en_cotizacion',
  'aprobado', 'agendado', 'trabajo_realizado', 'cerrado', 'cancelado'
];

export default function OrdenDetalle() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { userProfile } = useApp();
  const [orden, setOrden] = useState<OrdenServicio | null>(null);
  const [loading, setLoading] = useState(true);
  const [nuevaFase, setNuevaFase] = useState<FaseOrden | ''>('');
  const [notaFase, setNotaFase] = useState('');
  const [saving, setSaving] = useState(false);
  const [gpsSaving, setGpsSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(doc(db, 'ordenes_servicio', id), (snap) => {
      if (snap.exists()) {
        setOrden(parseOrden(snap.id, snap.data()) as OrdenServicio);
      }
      setLoading(false);
    });
    return () => unsub();
  }, [id]);

  const handleCambiarFase = async () => {
    if (!id || !nuevaFase || !orden) return;
    setSaving(true);
    try {
      const nuevoHistorial = [
        ...orden.historialFases.map(h => ({
          ...h,
          timestamp: Timestamp.fromDate(h.timestamp instanceof Date ? h.timestamp : new Date()),
        })),
        {
          fase: nuevaFase,
          timestamp: Timestamp.now(),
          usuario: userProfile?.nombre || 'Sistema',
          nota: notaFase || undefined,
        },
      ];
      const registroAuditoria = crearRegistroAuditoria(
        userProfile?.nombre || 'Sistema',
        'cambio_fase',
        `Cambió fase a "${faseLabel(nuevaFase)}"${notaFase ? ` (nota: ${notaFase})` : ''}`,
        'fase',
        faseLabel(orden.fase),
        faseLabel(nuevaFase)
      );
      await updateDoc(doc(db, 'ordenes_servicio', id), {
        fase: nuevaFase,
        estadoSimple: ['trabajo_realizado', 'cerrado'].includes(nuevaFase) ? 'completado' : nuevaFase === 'cancelado' ? 'cancelado' : ['en_diagnostico', 'en_cotizacion'].includes(nuevaFase) ? 'en_proceso' : 'pendiente',
        estado: nuevaFase === 'cancelado' ? 'cancelado' : nuevaFase === 'cerrado' ? 'cerrado' : 'activo',
        historialFases: nuevoHistorial,
        auditoria: arrayUnion(registroAuditoria),
        updatedAt: Timestamp.now(),
      });
      toast.success(`Fase cambiada a "${faseLabel(nuevaFase)}"`);
      setNuevaFase('');
      setNotaFase('');
    } catch {
      toast.error('Error al cambiar fase');
    } finally {
      setSaving(false);
    }
  };

  const handleActivarGPS = async () => {
    if (!id || !orden) return;
    setGpsSaving(true);
    try {
      const token = generarTrackingToken();
      const enlace = `${window.location.origin}/tracking/${token}`;
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const tracking = {
        habilitado: true,
        token,
        vehiculoId: orden.tecnicoId || 'vehiculo-default',
        tecnicoId: orden.tecnicoId || '',
        activadoPor: userProfile?.nombre || 'Admin',
        activadoEn: Timestamp.now(),
        enlace,
        expiresAt: Timestamp.fromDate(expiresAt),
      };
      await updateDoc(doc(db, 'ordenes_servicio', id), {
        trackingGPS: tracking,
        updatedAt: Timestamp.now(),
      });
      toast.success('GPS Tracking activado');
    } catch (err) {
      console.error(err);
      toast.error('Error al activar GPS');
    } finally {
      setGpsSaving(false);
    }
  };

  const handleDesactivarGPS = async () => {
    if (!id) return;
    if (!confirm('¿Desactivar el seguimiento GPS para esta orden?')) return;
    setGpsSaving(true);
    try {
      await updateDoc(doc(db, 'ordenes_servicio', id), {
        'trackingGPS.habilitado': false,
        updatedAt: Timestamp.now(),
      });
      toast.success('GPS Tracking desactivado');
    } catch {
      toast.error('Error');
    } finally {
      setGpsSaving(false);
    }
  };

  const handleCopiarEnlace = async () => {
    if (!orden?.trackingGPS?.enlace) return;
    try {
      await navigator.clipboard.writeText(orden.trackingGPS.enlace);
      toast.success('Enlace copiado');
    } catch {
      window.prompt('Copia el enlace:', orden.trackingGPS.enlace);
    }
  };

  if (loading) return <LoadingSpinner fullPage text="Cargando orden..." />;
  if (!orden) return (
    <div className="p-6 text-center">
      <p className="text-gray-500">Orden no encontrada</p>
      <button onClick={() => navigate('/ordenes')} className="text-[#1a5fa8] mt-2 text-sm">Volver a órdenes</button>
    </div>
  );

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/ordenes')} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-[#0f3460]">{orden.numero || 'Orden'}</h1>
            <Badge fase={orden.fase} />
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${estadoSimpleColor(orden.estadoSimple)}`}>
              {estadoSimpleLabel(orden.estadoSimple)}
            </span>
          </div>
          <p className="text-gray-500 text-sm">Creada {tiempoTranscurrido(orden.createdAt)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Cliente */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">Cliente</h3>
            <p className="text-lg font-semibold text-gray-900 mb-2">{orden.clienteNombre}</p>
            <div className="space-y-2">
              {orden.clienteTelefono && (
                <div className="flex items-center gap-3">
                  <Phone size={14} className="text-gray-400" />
                  <span className="text-sm">{formatTelefono(orden.clienteTelefono)}</span>
                  <a href={whatsappLink(orden.clienteTelefono, `Hola ${orden.clienteNombre}, le contactamos de Mister Service RD sobre su ${orden.equipoTipo}.`)}
                    target="_blank" rel="noreferrer"
                    className="flex items-center gap-1 bg-green-500 hover:bg-green-600 text-white px-2 py-1 rounded-lg text-xs transition-colors">
                    <MessageCircle size={12} /> WhatsApp
                  </a>
                </div>
              )}
              {orden.clienteDireccion && (
                <a href={
                  orden.clienteDireccion.startsWith('http')
                    ? orden.clienteDireccion
                    : orden.clienteLat && orden.clienteLng
                      ? `https://maps.google.com/?q=${orden.clienteLat},${orden.clienteLng}`
                      : googleMapsLink(undefined, undefined, orden.clienteDireccion)
                }
                  target="_blank" rel="noreferrer"
                  className="flex items-center gap-2 text-sm text-[#1a5fa8] hover:underline">
                  <MapPin size={14} />
                  {orden.clienteDireccion.startsWith('http') && orden.clienteLat && orden.clienteLng
                    ? `📍 ${orden.clienteLat.toFixed(6)}, ${orden.clienteLng.toFixed(6)}`
                    : orden.clienteDireccion}
                  <ExternalLink size={10} />
                </a>
              )}
            </div>
          </div>

          {/* Equipo */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">Servicio</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-gray-500">Tipo</p>
                <p className="text-sm font-medium flex items-center gap-1"><Wrench size={14} /> {orden.equipoTipo}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Marca</p>
                <p className="text-sm font-medium">{orden.equipoMarca || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Modelo</p>
                <p className="text-sm font-medium">{orden.equipoModelo || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Fecha Cita</p>
                <p className="text-sm font-medium">{orden.fechaCita ? formatFecha(orden.fechaCita) : 'Sin agendar'}</p>
              </div>
            </div>
            <div className="mt-3">
              <p className="text-xs text-gray-500">Falla reportada</p>
              <p className="text-sm text-gray-800 mt-0.5">{orden.descripcionFalla}</p>
            </div>
          </div>

          {/* CIERRE DE SERVICIO (si existe) */}
          {orden.cierreServicio && (
            <div className="bg-white rounded-2xl shadow-sm border-2 border-green-200 overflow-hidden">
              <div className="bg-green-50 px-6 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                    <span className="text-white text-sm">✓</span>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-green-900">SERVICIO CERRADO</h3>
                    <p className="text-xs text-green-700">
                      {orden.cierreServicio.tecnicoNombre} · {formatFecha(orden.cierreServicio.fechaCierre instanceof Date ? orden.cierreServicio.fechaCierre : (orden.cierreServicio.fechaCierre as unknown as { toDate: () => Date }).toDate())}
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-5">
                {/* Foto */}
                {orden.cierreServicio.fotoCierre && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-2">📸 Foto de confirmación</p>
                    <img src={orden.cierreServicio.fotoCierre.url} alt="Foto de cierre"
                      className="w-full max-w-md rounded-xl border border-gray-200" />
                    <div className="mt-2 text-xs text-gray-600 space-y-0.5">
                      {orden.cierreServicio.fotoCierre.gpsVerificado ? (
                        <p>📍 {orden.cierreServicio.fotoCierre.lat.toFixed(4)}°N, {Math.abs(orden.cierreServicio.fotoCierre.lng).toFixed(4)}°W</p>
                      ) : (
                        <p className="text-orange-600">⚠️ GPS no verificado</p>
                      )}
                      {orden.cierreServicio.fotoCierre.distanciaCliente !== undefined && orden.cierreServicio.fotoCierre.distanciaCliente !== null && (
                        <p className={orden.cierreServicio.fotoCierre.distanciaCliente > 500 ? 'text-orange-600' : 'text-green-600'}>
                          📏 A {orden.cierreServicio.fotoCierre.distanciaCliente} metros del domicilio registrado
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Preguntas de cierre simplificado */}
                {(orden.cierreServicio.equipoFunciona !== undefined ||
                  orden.cierreServicio.clienteSatisfecho !== undefined ||
                  orden.cierreServicio.revisoConexiones !== undefined) && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-2">✅ Verificación de cierre</p>
                    <div className="space-y-2">
                      {orden.cierreServicio.equipoFunciona !== undefined && (
                        <div className="flex items-center gap-2 text-xs">
                          <span className={orden.cierreServicio.equipoFunciona ? 'text-green-500' : 'text-red-500'}>
                            {orden.cierreServicio.equipoFunciona ? '✓' : '✗'}
                          </span>
                          <span>¿El equipo quedó funcionando correctamente?</span>
                        </div>
                      )}
                      {orden.cierreServicio.clienteSatisfecho !== undefined && (
                        <div className="flex items-center gap-2 text-xs">
                          <span className={orden.cierreServicio.clienteSatisfecho ? 'text-green-500' : 'text-red-500'}>
                            {orden.cierreServicio.clienteSatisfecho ? '✓' : '✗'}
                          </span>
                          <span>¿El cliente está satisfecho con el servicio?</span>
                        </div>
                      )}
                      {orden.cierreServicio.revisoConexiones !== undefined && (
                        <div className="flex items-center gap-2 text-xs">
                          <span className={orden.cierreServicio.revisoConexiones ? 'text-green-500' : 'text-red-500'}>
                            {orden.cierreServicio.revisoConexiones ? '✓' : '✗'}
                          </span>
                          <span>¿Revisó mangueras de desagüe, entrada de agua y llave abierta?</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Piezas (legacy) */}
                {((orden.cierreServicio.piezasRetiradas?.length || 0) > 0 || (orden.cierreServicio.piezasInstaladas?.length || 0) > 0) && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-2">🔧 Piezas</p>
                    {(orden.cierreServicio.piezasRetiradas?.length || 0) > 0 && (
                      <div className="mb-3">
                        <p className="text-xs font-medium text-red-700">Retiradas:</p>
                        <ul className="text-xs text-gray-700 space-y-0.5 pl-4 list-disc">
                          {orden.cierreServicio.piezasRetiradas?.map((p, i) => (
                            <li key={i}>
                              {p.descripcion} · <span className="text-gray-500">{p.motivo} · destino: {p.destino}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {(orden.cierreServicio.piezasInstaladas?.length || 0) > 0 && (
                      <div>
                        <p className="text-xs font-medium text-green-700">Instaladas:</p>
                        <ul className="text-xs text-gray-700 space-y-0.5 pl-4 list-disc">
                          {orden.cierreServicio.piezasInstaladas?.map((p, i) => (
                            <li key={i}>
                              {p.descripcion}{p.numeroParte && ` (${p.numeroParte})`} · <span className="text-gray-500">{p.procedencia}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {/* Checklist (legacy) */}
                {(orden.cierreServicio.checklist?.length || 0) > 0 && orden.cierreServicio.checklist && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-2">
                      ✅ Checklist ({orden.cierreServicio.checklist.filter(c => c.respuesta === 'si').length}/{orden.cierreServicio.checklist.length} OK)
                    </p>
                    <ul className="space-y-1">
                      {orden.cierreServicio.checklist.map((c, i) => (
                        <li key={i} className="text-xs flex items-start gap-1.5">
                          <span className={c.respuesta === 'si' ? 'text-green-500' : 'text-red-500'}>
                            {c.respuesta === 'si' ? '✓' : '✗'}
                          </span>
                          <div className="flex-1">
                            <p className="text-gray-700">{c.pregunta}</p>
                            {c.respuesta === 'no' && c.explicacion && (
                              <p className="text-orange-600 italic text-[10px] mt-0.5">— {c.explicacion}</p>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Trabajo realizado (legacy) */}
                {orden.cierreServicio.descripcionTrabajo && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-2">📝 Trabajo realizado</p>
                    <p className="text-sm text-gray-800 bg-gray-50 rounded-lg p-3">"{orden.cierreServicio.descripcionTrabajo}"</p>
                    {orden.cierreServicio.trabajoPendiente && (
                      <div className="mt-2 bg-yellow-50 rounded-lg p-3">
                        <p className="text-xs font-medium text-yellow-800">Pendiente / recomendaciones:</p>
                        <p className="text-xs text-yellow-700">{orden.cierreServicio.trabajoPendiente}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Satisfacción (legacy) */}
                {orden.cierreServicio.satisfaccionCliente !== undefined && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Satisfacción del cliente</p>
                    <div className="text-lg">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <span key={i} className={i < (orden.cierreServicio?.satisfaccionCliente || 0) ? 'text-yellow-400' : 'text-gray-300'}>★</span>
                      ))}
                      <span className="text-xs text-gray-500 ml-2">({orden.cierreServicio.satisfaccionCliente}/5)</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Creado por */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center gap-3">
            <User size={16} className="text-gray-400" />
            <div>
              <p className="text-xs text-gray-500">Creado por</p>
              <p className="text-sm font-medium">{orden.creadoPor || '—'} · {formatFecha(orden.createdAt)}</p>
            </div>
          </div>

          {orden.notas && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">Notas</h3>
              <p className="text-sm text-gray-700">{orden.notas}</p>
            </div>
          )}

          {orden.notasTecnico && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">🔧 Notas del Técnico</h3>
              <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                <p className="text-sm text-blue-800 whitespace-pre-line">{orden.notasTecnico}</p>
              </div>
            </div>
          )}

          {orden.precioSugerido !== undefined && orden.precioSugerido !== null && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">💰 Precio Sugerido por el Técnico</h3>
              <p className="text-2xl font-bold text-green-700">
                RD$ {Number(orden.precioSugerido).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
              </p>
            </div>
          )}

          {/* Registro de Auditoría */}
          {orden.auditoria && orden.auditoria.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">📝 Registro de Cambios</h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {orden.auditoria.slice().reverse().map((reg, i) => (
                  <div key={i} className="text-xs bg-gray-50 rounded-lg p-3 border border-gray-100">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-700">{reg.usuario}</span>
                      <span className="text-gray-400">{formatFecha(reg.fecha)}</span>
                    </div>
                    <p className="text-gray-600 mt-0.5">{reg.detalle}</p>
                    {reg.valorAnterior && reg.valorNuevo && (
                      <p className="text-[10px] text-gray-400 mt-0.5">{reg.campo}: "{reg.valorAnterior}" → "{reg.valorNuevo}"</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Historial */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-sm font-semibold text-gray-500 uppercase mb-4">Historial de Fases</h3>
            <div className="space-y-3">
              {orden.historialFases.length === 0 ? (
                <p className="text-sm text-gray-400">Sin historial</p>
              ) : (
                orden.historialFases.map((h, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="flex flex-col items-center">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: faseBgColor(h.fase) }} />
                      {i < orden.historialFases.length - 1 && <div className="w-0.5 h-8 bg-gray-200 mt-1" />}
                    </div>
                    <div className="flex-1 pb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge fase={h.fase} />
                        <span className="text-xs text-gray-500">{formatFecha(h.timestamp)}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5"><User size={10} className="inline mr-1" />{h.usuario}</p>
                      {h.nota && <p className="text-xs text-gray-600 mt-1 italic"><MessageSquare size={10} className="inline mr-1" />{h.nota}</p>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-3">
            <h3 className="text-sm font-semibold text-gray-500 uppercase mb-1">Detalles</h3>
            <div>
              <p className="text-xs text-gray-500">Técnico asignado</p>
              <p className="text-sm font-medium">{orden.tecnicoNombre || 'Sin asignar'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Responsable</p>
              <p className="text-sm font-medium">{orden.responsableNombre || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Duración estimada</p>
              <p className="text-sm font-medium">{orden.duracionMin ? `${orden.duracionMin} min` : '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Última actualización</p>
              <p className="text-sm text-gray-600 flex items-center gap-1"><Clock size={12} />{tiempoTranscurrido(orden.updatedAt)}</p>
            </div>
            {orden.reagendada && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">Reagendada</span>
            )}
          </div>

          {/* Cambiar fase */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">Cambiar Fase</h3>
            <select value={nuevaFase} onChange={e => setNuevaFase(e.target.value as FaseOrden)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white mb-2">
              <option value="">Seleccionar nueva fase...</option>
              {FASES.filter(f => f !== orden.fase).map(f => <option key={f} value={f}>{faseLabel(f)}</option>)}
            </select>
            {nuevaFase && (
              <>
                <textarea value={notaFase} onChange={e => setNotaFase(e.target.value)}
                  placeholder="Nota (opcional)..." rows={2}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm mb-2" />
                <button onClick={handleCambiarFase} disabled={saving}
                  className="w-full flex items-center justify-center gap-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white py-2 rounded-lg text-sm font-medium disabled:opacity-60">
                  <Save size={14} /> {saving ? 'Guardando...' : `Mover a ${faseLabel(nuevaFase)}`}
                </button>
              </>
            )}
          </div>

          {/* GPS Tracking */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center gap-2 mb-3">
              <Satellite size={16} className="text-[#1a5fa8]" />
              <h3 className="text-sm font-semibold text-gray-700">Tracking GPS del técnico</h3>
            </div>
            {orden.trackingGPS?.habilitado ? (
              <div className="space-y-3">
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <p className="text-xs font-semibold text-green-800 flex items-center gap-1">
                    ✅ GPS Tracking activado
                  </p>
                  <p className="text-xs text-green-700 mt-1">Activado por {orden.trackingGPS.activadoPor}</p>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Enlace para el cliente:</label>
                  <div className="bg-gray-50 rounded-lg p-2 text-xs font-mono text-gray-700 break-all">
                    {orden.trackingGPS.enlace}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleCopiarEnlace}
                    className="flex-1 flex items-center justify-center gap-1 bg-blue-50 hover:bg-blue-100 text-blue-700 px-2 py-2 rounded-lg text-xs font-medium">
                    <Copy size={12} /> Copiar
                  </button>
                  {orden.clienteTelefono && (
                    <a href={whatsappUrl(orden.clienteTelefono, `Hola ${orden.clienteNombre} 👋\nSu técnico ${orden.tecnicoNombre || ''} está en camino.\nPuede seguir su ubicación en tiempo real aquí:\n📍 ${orden.trackingGPS.enlace}\n- Mister Service RD`)}
                      target="_blank" rel="noreferrer"
                      className="flex-1 flex items-center justify-center gap-1 bg-green-500 hover:bg-green-600 text-white px-2 py-2 rounded-lg text-xs font-medium">
                      <MessageCircle size={12} /> WhatsApp
                    </a>
                  )}
                </div>
                <button onClick={handleDesactivarGPS} disabled={gpsSaving}
                  className="w-full flex items-center justify-center gap-1 bg-red-50 hover:bg-red-100 text-red-600 py-2 rounded-lg text-xs font-medium disabled:opacity-60">
                  <Power size={12} /> Desactivar acceso
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-gray-600">
                  ¿Permitir al cliente ver la ubicación del técnico en camino?
                </p>
                <p className="text-xs text-gray-400 italic">
                  Al activar, el cliente podrá ver en tiempo real dónde está el técnico SOLO cuando está en camino.
                </p>
                <button onClick={handleActivarGPS} disabled={gpsSaving}
                  className="w-full flex items-center justify-center gap-1 bg-[#0f3460] hover:bg-[#1a5fa8] text-white py-2 rounded-lg text-xs font-medium disabled:opacity-60">
                  <Satellite size={12} /> {gpsSaving ? 'Activando...' : 'Activar GPS Tracking'}
                </button>
              </div>
            )}
          </div>

          {orden.clienteTelefono && (
            <a href={whatsappLink(orden.clienteTelefono, `Hola ${orden.clienteNombre}, le contactamos de Mister Service RD sobre su ${orden.equipoTipo}.`)}
              target="_blank" rel="noreferrer"
              className="block w-full bg-green-500 hover:bg-green-600 text-white py-2.5 rounded-xl text-sm font-medium text-center transition-colors">
              Contactar por WhatsApp
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
