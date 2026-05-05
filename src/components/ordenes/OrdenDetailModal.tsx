import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Phone, MapPin, Edit2, AlertTriangle, XCircle, Package, RotateCcw, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { OrdenServicio, Usuario, StandbyPieza } from '../../types';
import WhatsAppIcon from '../icons/WhatsAppIcon';
import {
  formatFecha, formatMoneda, formatTelefono, whatsappLink,
  estadoSimpleLabel, estadoSimpleColor, tiempoTranscurrido, tieneStandby,
  labelTipoMotor,
} from '../../utils';
import { coordsFromLatLng, googleMapsViewUrl } from '../../utils/maps';
import BotonComoLlegar from '../shared/BotonComoLlegar';
import FotoEquipoDisplay from '../shared/FotoEquipoDisplay';
import { puede } from '../../utils/permisos';
import Badge from '../Badge';
import EliminarOrdenButton from './EliminarOrdenButton';
import FaseStepper from './FaseStepper';
import CancelarOrdenModal from './CancelarOrdenModal';
import ReagendarModal from './ReagendarModal';
import RegistrarPagoModal from './RegistrarPagoModal';
import EnviarFacturacionButton from './EnviarFacturacionButton';
import EnviarPortalButton from './EnviarPortalButton';
import { Banknote, ArrowRightLeft, CreditCard, Plus } from 'lucide-react';
import { reactivarOrdenPostChequeo } from '../../services/ordenes.service';
import { useConfigWeb } from '../../hooks/useConfigWeb';
import toast from 'react-hot-toast';

interface OrdenDetailModalProps {
  orden: OrdenServicio;
  userProfile: Usuario | null;
  onEdit: () => void;
  onEliminar?: () => void;
  onAprobarPrecio: () => void;
  precioAprobacion: string;
  setPrecioAprobacion: (v: string) => void;
  aprobandoPrecio: boolean;
  standbyItems?: StandbyPieza[];
}

export default function OrdenDetailModal({
  orden,
  userProfile,
  onEdit,
  onEliminar,
  onAprobarPrecio,
  precioAprobacion,
  setPrecioAprobacion,
  aprobandoPrecio,
  standbyItems = [],
}: OrdenDetailModalProps) {
  const { config: configWeb } = useConfigWeb();
  const puedeModificar = puede(userProfile, 'ordenesModificar');
  const puedeRegistrarPago = puede(userProfile, 'pagosRegistrar');
  const puedeEnviarAFacturacion = puede(userProfile, 'ordenesEnviarAFacturacion');
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showReagendarModal, setShowReagendarModal] = useState(false);
  const [showPagoModal, setShowPagoModal] = useState(false);
  const [reactivandoChequeo, setReactivandoChequeo] = useState(false);
  const conStandby = tieneStandby(orden, standbyItems);
  const tienePiezaPendiente = standbyItems.some(s => s.ordenId === orden.id && s.estado !== 'llego');
  const mostrarBannerReagendar = orden.fase === 'aprobado' && tienePiezaPendiente && !orden.eliminada;

  // Botón "Reactivar para reparación": solo cuando la orden cerró como solo
  // chequeo, no fue ya reactivada y el usuario tiene rol de oficina con
  // permiso para modificar órdenes.
  const rolOficina = userProfile?.rol === 'administrador' ||
    userProfile?.rol === 'coordinadora' ||
    userProfile?.rol === 'secretaria';
  const puedeReactivarChequeo =
    puedeModificar &&
    rolOficina &&
    orden.soloChequeo === true &&
    orden.fase === 'cerrado' &&
    orden.reactivadaPostChequeo !== true &&
    !orden.eliminada;

  const handleReactivarChequeo = async () => {
    if (!userProfile) return;
    const monto = orden.precioChequeo ?? 2000;
    const formato = monto.toLocaleString('es-DO');
    if (!confirm(
      `¿El cliente regresó para hacer la reparación? Se reabrirá la orden. ` +
      `El chequeo previo de RD$${formato} ya cobrado queda registrado como ` +
      `histórico — no se cobrará de nuevo.`,
    )) return;
    setReactivandoChequeo(true);
    try {
      const result = await reactivarOrdenPostChequeo(orden.id, {
        id: userProfile.id,
        nombre: userProfile.nombre,
      });
      if (result.ok) {
        toast.success('Orden reactivada para reparación');
      } else if (result.razon === 'ya_reactivada') {
        toast.error('Esta orden ya fue reactivada antes');
      } else if (result.razon === 'no_es_solo_chequeo') {
        toast.error('La orden no fue cerrada como solo chequeo');
      } else if (result.razon === 'orden_no_existe') {
        toast.error('La orden ya no existe');
      } else {
        toast.error('No se pudo reactivar la orden');
      }
    } catch (err) {
      console.error(err);
      toast.error('Error al reactivar la orden');
    } finally {
      setReactivandoChequeo(false);
    }
  };
  return (
    <div className="space-y-6">
      {/* Banner si está eliminada */}
      {orden.eliminada && (
        <div className="bg-red-50 border-2 border-red-300 rounded-xl p-3 flex items-start gap-2 text-sm text-red-900">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold">Orden eliminada</p>
            {orden.motivoEliminacion && <p className="text-xs mt-0.5">Motivo: {orden.motivoEliminacion}</p>}
            {orden.eliminadaPor && (
              <p className="text-xs text-red-700 mt-0.5">
                Por {orden.eliminadaPor}{orden.fechaEliminacion ? ` · ${formatFecha(orden.fechaEliminacion)}` : ''}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Banner si está cancelada (independiente del banner de eliminada) */}
      {orden.fase === 'cancelado' && !orden.eliminada && orden.motivoCancelacion && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-3 flex items-start gap-2 text-sm text-amber-900">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold">Orden cancelada</p>
            <p className="text-xs mt-0.5">Motivo: {orden.motivoCancelacion}</p>
            {orden.canceladaPor && (
              <p className="text-xs text-amber-700 mt-0.5">
                Por {orden.canceladaPor}{orden.fechaCancelacion ? ` · ${formatFecha(orden.fechaCancelacion)}` : ''}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Banner de chequeo iniciado por el técnico */}
      {orden.inicioChequeo && !orden.eliminada && (
        <div className="bg-green-50 border border-green-300 rounded-xl p-3 flex items-start gap-3">
          {orden.inicioChequeo.fotoUrl && (
            <a
              href={orden.inicioChequeo.fotoUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Ver foto completa"
              className="shrink-0"
            >
              <img
                src={orden.inicioChequeo.fotoUrl}
                alt="Inicio de chequeo"
                className="w-16 h-16 rounded-lg object-cover border border-green-200"
              />
            </a>
          )}
          <div className="flex-1 text-sm">
            <p className="font-semibold text-green-900">
              {'\u{1F4F8}'} Chequeo iniciado por {orden.inicioChequeo.tecnicoNombre}
            </p>
            <p className="text-xs text-green-800 mt-0.5">
              {formatFecha(orden.inicioChequeo.fechaInicio)}
              {typeof orden.inicioChequeo.distanciaClienteMetros === 'number' && (
                <span className={`ml-2 ${orden.inicioChequeo.gpsVerificado ? 'text-green-700' : 'text-amber-700'}`}>
                  · GPS a {orden.inicioChequeo.distanciaClienteMetros}m {orden.inicioChequeo.gpsVerificado ? 'OK' : '(alejado)'}
                </span>
              )}
            </p>
            {typeof orden.inicioChequeo.lat === 'number' && typeof orden.inicioChequeo.lng === 'number' && (
              <a
                href={`https://maps.google.com/?q=${orden.inicioChequeo.lat},${orden.inicioChequeo.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-green-700 hover:underline inline-flex items-center gap-0.5 mt-0.5"
              >
                Ver ubicación en Maps
              </a>
            )}
          </div>
        </div>
      )}

      {/* Banner stand-by */}
      {orden.enStandby && !orden.eliminada && (
        <div className="bg-yellow-50 border-2 border-yellow-300 rounded-xl p-3 flex items-start gap-3">
          <Package size={18} className="text-yellow-700 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold text-yellow-900 text-sm">⏸ Stand-by</p>
            {orden.standbyMotivo && (
              <p className="text-xs text-yellow-800 mt-0.5">Motivo: {orden.standbyMotivo}</p>
            )}
            {orden.standbyNotas && (
              <p className="text-xs text-yellow-800 mt-0.5 italic">{orden.standbyNotas}</p>
            )}
            {orden.standbyPor && (
              <p className="text-[11px] text-yellow-700 mt-0.5">
                Por {orden.standbyPor}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Banner pieza pendiente — sugiere reagendar */}
      {mostrarBannerReagendar && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 flex items-start gap-3">
          <Package size={18} className="text-amber-600 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold text-amber-900 text-sm">Pieza pendiente de llegada</p>
            <p className="text-xs text-amber-800">
              Esta orden está aprobada pero tiene piezas en stand-by. Puedes reagendar para cuando llegue la pieza.
            </p>
          </div>
          {puedeModificar && (
            <button
              type="button"
              onClick={() => setShowReagendarModal(true)}
              className="bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 rounded-lg font-medium text-xs shrink-0"
            >
              Reagendar
            </button>
          )}
        </div>
      )}

      {/* Banner ROI — orden reactivada por campaña de marketing
          (sprint Mapa Clientes Commit 3). Snapshot inmutable: muestra
          la campaña que generó la atribución. */}
      {orden.reactivadaPor && (() => {
        const reac = orden.reactivadaPor;
        const fechaCampana = reac.campanaFecha instanceof Date
          ? reac.campanaFecha
          : (reac.campanaFecha && typeof (reac.campanaFecha as { toDate?: () => Date }).toDate === 'function'
            ? (reac.campanaFecha as { toDate: () => Date }).toDate()
            : null);
        return (
          <div className="bg-green-50 border-l-4 border-green-500 rounded-r-xl p-3 flex items-start gap-3">
            <TrendingUp size={18} className="text-green-700 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-green-900">
                Reactivada por campaña de marketing
              </p>
              <p className="text-xs text-green-800 mt-0.5">
                {reac.campanaPlantillaNombre || 'Plantilla sin nombre'}
                {fechaCampana ? ` · ${format(fechaCampana, 'd MMM yyyy', { locale: es })}` : ''}
              </p>
            </div>
          </div>
        );
      })()}

      {/* Editar / Eliminar / Reactivar post-chequeo */}
      <div className="flex justify-end gap-2 mb-4 flex-wrap">
        {puedeReactivarChequeo && (
          <button
            type="button"
            onClick={handleReactivarChequeo}
            disabled={reactivandoChequeo}
            className="inline-flex items-center gap-1 bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-60"
            title="El cliente regresó para hacer la reparación"
          >
            <RotateCcw size={14} />
            {reactivandoChequeo ? 'Reactivando...' : 'Reactivar para reparación'}
          </button>
        )}
        {puedeModificar && !orden.eliminada && (
          <button
            onClick={onEdit}
            className="flex items-center gap-2 px-4 py-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Edit2 size={14} />
            Editar
          </button>
        )}
        <EliminarOrdenButton orden={orden} variant="button" onDeleted={onEliminar} />
      </div>

      {/* Badge "Reparación post-chequeo" + histórico del chequeo previo */}
      {orden.reactivadaPostChequeo && (
        <div className="space-y-2">
          <span
            className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full text-xs font-medium"
            title={orden.cierreChequeoHistorico?.monto
              ? `Chequeo previo de RD$${orden.cierreChequeoHistorico.monto.toLocaleString('es-DO')} ya cobrado`
              : 'Chequeo previo ya cobrado'}
          >
            <RotateCcw size={10} /> Reparación post-chequeo
          </span>
          {orden.cierreChequeoHistorico && (
            <details className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <summary className="cursor-pointer text-sm font-medium text-blue-700">
                Histórico del chequeo previo
              </summary>
              <div className="mt-2 text-xs text-gray-700 space-y-1">
                <div>
                  <strong>Fecha:</strong>{' '}
                  {formatFecha(
                    orden.cierreChequeoHistorico.fechaCierre instanceof Date
                      ? orden.cierreChequeoHistorico.fechaCierre
                      : orden.cierreChequeoHistorico.fechaCierre &&
                        typeof (orden.cierreChequeoHistorico.fechaCierre as { toDate?: () => Date }).toDate === 'function'
                          ? (orden.cierreChequeoHistorico.fechaCierre as { toDate: () => Date }).toDate()
                          : undefined,
                  )}
                </div>
                <div>
                  <strong>Monto:</strong> RD${Number(orden.cierreChequeoHistorico.monto).toLocaleString('es-DO')}
                </div>
                {orden.cierreChequeoHistorico.tecnicoNombre && (
                  <div><strong>Técnico:</strong> {orden.cierreChequeoHistorico.tecnicoNombre}</div>
                )}
                {orden.cierreChequeoHistorico.conduceCG && (
                  <div><strong>Conduce:</strong> {orden.cierreChequeoHistorico.conduceCG}</div>
                )}
                {orden.cierreChequeoHistorico.motivoChequeo && (
                  <div><strong>Motivo del chequeo:</strong> {orden.cierreChequeoHistorico.motivoChequeo}</div>
                )}
              </div>
            </details>
          )}
        </div>
      )}

      {/* Stepper de fases */}
      <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 space-y-3">
        <FaseStepper orden={orden} size="md" tienestandby={conStandby} />
        {puedeModificar && !orden.eliminada && orden.fase !== 'cancelado' && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setShowCancelModal(true)}
              className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 hover:border-red-300 transition-colors"
            >
              <XCircle size={13} /> Cancelar
            </button>
          </div>
        )}
      </div>
      <CancelarOrdenModal
        isOpen={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        orden={orden}
        userProfile={userProfile}
      />
      <ReagendarModal
        isOpen={showReagendarModal}
        onClose={() => setShowReagendarModal(false)}
        orden={orden}
      />

      {/* Client Info */}
      <div>
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Informacion del Cliente</h3>
        <div className="space-y-2">
          <p className="text-base font-medium text-gray-900">{orden.clienteNombre}</p>
          {orden.clienteTelefono && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-700 flex items-center gap-1.5">
                <Phone size={14} className="text-gray-400" />
                {formatTelefono(orden.clienteTelefono)}
              </span>
              <a
                href={whatsappLink(orden.clienteTelefono)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-500 hover:bg-green-600 text-white text-xs font-medium rounded-lg transition-colors"
              >
                <WhatsAppIcon filled={false} className="text-white" size={12} />
                WhatsApp
              </a>
            </div>
          )}
          {/* Portal del Cliente: visible sólo cuando la orden tiene token
              (es decir, ya pasó por agendado). El botón maneja su propio
              estado de envío y muestra "Reenviar..." si ya se envió antes. */}
          {!orden.eliminada && orden.fase !== 'cancelado' && (
            <EnviarPortalButton orden={orden} userProfile={userProfile} />
          )}
          {orden.clienteDireccion && !orden.clienteDireccion.startsWith('http') && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Dirección escrita</p>
              <div className="flex items-start gap-1.5 text-sm text-gray-700">
                <MapPin size={14} className="mt-0.5 flex-shrink-0 text-gray-400" />
                <span>{orden.clienteDireccion}</span>
              </div>
            </div>
          )}
          {(() => {
            const coords = coordsFromLatLng(orden.clienteLat, orden.clienteLng);
            if (!coords) {
              return (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Ubicación GPS</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-gray-400 italic">Sin coordenadas GPS</span>
                    <BotonComoLlegar ubicacion={null} size="sm" />
                  </div>
                </div>
              );
            }
            const verUrl = googleMapsViewUrl(coords);
            return (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Ubicación GPS</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded">
                    {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}
                  </span>
                  <BotonComoLlegar ubicacion={coords} size="sm" />
                  {verUrl && (
                    <a
                      href={verUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs text-blue-600 hover:underline"
                    >
                      Ver en mapa
                    </a>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Service Info */}
      <div>
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Informacion del Servicio</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-gray-500 block text-xs">Fecha de Cita</span>
            <span className="text-gray-900">{orden.fechaCita ? formatFecha(orden.fechaCita) : 'Sin agendar'}</span>
          </div>
          <div>
            <span className="text-gray-500 block text-xs">Tecnico</span>
            <span className="text-gray-900">{orden.tecnicoNombre || 'Sin asignar'}</span>
          </div>
          <div>
            <span className="text-gray-500 block text-xs">Tipo de Equipo</span>
            <span className="text-gray-900">{orden.equipoTipo}</span>
          </div>
          <div>
            <span className="text-gray-500 block text-xs">Marca</span>
            <span className="text-gray-900">{orden.equipoMarca || '--'}</span>
          </div>
          <div>
            <span className="text-gray-500 block text-xs">
              {orden.equipoTipoMotor ? 'Configuración' : 'Modelo'}
            </span>
            <span className="text-gray-900">
              {orden.equipoTipoMotor
                ? labelTipoMotor(orden.equipoTipoMotor)
                : orden.equipoModelo || '--'}
            </span>
          </div>
          <div>
            <span className="text-gray-500 block text-xs">Estado</span>
            <Badge label={estadoSimpleLabel(orden.estadoSimple || 'pendiente')} color={estadoSimpleColor(orden.estadoSimple || 'pendiente')} />
          </div>
        </div>
        {orden.fotoEquipoUrl && (
          <div className="mt-3">
            <span className="text-gray-500 block text-xs mb-1">Foto del equipo</span>
            <FotoEquipoDisplay url={orden.fotoEquipoUrl} size="md" />
          </div>
        )}
        <div className="mt-3">
          <span className="text-gray-500 block text-xs mb-1">Descripcion de la Falla</span>
          <p className="text-sm text-gray-900 bg-gray-50 rounded-lg p-3">{orden.descripcionFalla}</p>
        </div>
      </div>

      {/* Origen: formulario público — metadatos de la cita pre-confirmada */}
      {orden.metadatosCita && (
        orden.metadatosCita.comoNosConocio ||
        orden.metadatosCita.whatsappAsignadoNombre ||
        (orden.metadatosCita.camposPersonalizados && Object.keys(orden.metadatosCita.camposPersonalizados).length > 0)
      ) && (
        <details className="border border-blue-200 rounded-lg p-3 bg-blue-50">
          <summary className="cursor-pointer text-sm font-medium text-blue-700">
            Origen: formulario público
          </summary>
          <div className="mt-2 text-xs text-gray-700 space-y-1">
            {orden.metadatosCita.comoNosConocio && (
              <div><strong>¿Cómo nos conoció?</strong> {orden.metadatosCita.comoNosConocio}</div>
            )}
            {orden.metadatosCita.whatsappAsignadoNombre && (
              <div><strong>WhatsApp asignado:</strong> {orden.metadatosCita.whatsappAsignadoNombre}</div>
            )}
            {orden.metadatosCita.camposPersonalizados &&
              Object.entries(orden.metadatosCita.camposPersonalizados).map(([k, v]) => {
                // Las citas nuevas guardan la key como `id` permanente del
                // campo; las históricas la guardan como `label` directo.
                // Buscamos label actual en config — si no aparece (cita
                // antigua), mostramos `k` tal cual.
                const labelActual =
                  configWeb?.formularioAgendar?.camposPersonalizados?.find(
                    c => c.id === k,
                  )?.label || k;
                return (
                  <div key={k}><strong>{labelActual}:</strong> {String(v)}</div>
                );
              })}
          </div>
        </details>
      )}

      {/* Notas internas de operaciones - solo visibles para operaciones, NO para tecnicos */}
      {orden.notas && (
        <div>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">{'\u{1F4CB}'} Notas Internas (Operaciones)</h3>
          <p className="text-sm text-gray-700 bg-yellow-50 rounded-lg p-3 border border-yellow-100 whitespace-pre-line">{orden.notas}</p>
        </div>
      )}

      {/* Notas del tecnico - visibles para todos */}
      {orden.notasTecnico && (
        <div>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">{'\u{1F527}'} Notas del Tecnico</h3>
          <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
            <p className="text-sm text-blue-800 whitespace-pre-line">{orden.notasTecnico}</p>
          </div>
        </div>
      )}

      {/* Precio sugerido por el tecnico */}
      {orden.precioSugerido !== undefined && orden.precioSugerido !== null && (
        <div>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">{'\u{1F4B0}'} Precio Sugerido por el Tecnico</h3>
          <p className="text-lg font-bold text-green-700 bg-green-50 rounded-lg p-3 border border-green-200">
            RD$ {Number(orden.precioSugerido).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
          </p>
        </div>
      )}

      {/* Aprobacion de precio (gated por permiso cotizacionesAprobarPrecio) */}
      {orden.precioSugerido !== undefined &&
       orden.estadoAprobacion !== 'aprobado' &&
       puede(userProfile, 'cotizacionesAprobarPrecio') && (
        <div className="bg-yellow-50 rounded-xl p-4 border-2 border-yellow-200">
          <h3 className="text-sm font-semibold text-yellow-800 uppercase tracking-wide mb-2 flex items-center gap-1">
            {'\u{23F3}'} Aprobar Precio
          </h3>
          <p className="text-xs text-yellow-700 mb-3">
            El tecnico sugirio <strong>RD$ {Number(orden.precioSugerido).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</strong>.
            Puedes modificar el precio antes de aprobar.
          </p>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs font-medium text-yellow-800 mb-1">Precio final (RD$)</label>
              <input
                type="number"
                value={precioAprobacion}
                onChange={e => setPrecioAprobacion(e.target.value)}
                className="w-full px-3 py-2 border border-yellow-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500 bg-white"
              />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={onAprobarPrecio}
                disabled={aprobandoPrecio}
                className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-bold disabled:opacity-60 whitespace-nowrap"
              >
                {aprobandoPrecio ? 'Aprobando...' : '\u{2705} Aprobar Precio'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Precio Aprobado (cuando ya fue aprobado) */}
      {orden.estadoAprobacion === 'aprobado' && orden.precioFinal !== undefined && (
        <div>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">{'\u{2705}'} Precio Aprobado</h3>
          <div className="bg-green-50 rounded-lg p-3 border-2 border-green-300">
            <p className="text-xl font-bold text-green-700">
              RD$ {Number(orden.precioFinal).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
            </p>
            {orden.aprobadoPor && (
              <p className="text-[11px] text-green-700 mt-1">
                Aprobado por <strong>{orden.aprobadoPor}</strong>
                {orden.fechaAprobacion && ` \u{00B7} ${formatFecha(orden.fechaAprobacion)}`}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Pagos y facturación */}
      {(puedeRegistrarPago || puedeEnviarAFacturacion || (orden.pagos && orden.pagos.length > 0)) && (
        <div>
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
              {'\u{1F4B5}'} Pagos y Conduce de Garantía
            </h3>
            <div className="flex items-center gap-2">
              {puedeEnviarAFacturacion && (
                <EnviarFacturacionButton orden={orden} userProfile={userProfile} />
              )}
              {puedeRegistrarPago && !orden.facturada && (
                <button
                  type="button"
                  onClick={() => setShowPagoModal(true)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                >
                  <Plus size={12} /> Registrar pago
                </button>
              )}
            </div>
          </div>

          {/* Resumen */}
          {(() => {
            const total = Number(orden.precioFinal || orden.precioAprobado || orden.precioSugerido || 0);
            const pagado = Number(orden.montoPagado || 0);
            const pendiente = Math.max(0, total - pagado);
            const estado = orden.estadoPago || (pagado === 0 ? 'pendiente' : pagado >= total && total > 0 ? 'completo' : 'parcial');
            const colorEstado =
              estado === 'completo'
                ? 'bg-green-100 text-green-700 border-green-200'
                : estado === 'parcial'
                  ? 'bg-amber-100 text-amber-800 border-amber-200'
                  : 'bg-gray-100 text-gray-600 border-gray-200';
            return (
              <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-3 grid grid-cols-4 gap-3 text-sm mb-2">
                <div>
                  <div className="text-[11px] text-blue-700 uppercase tracking-wide">Total</div>
                  <div className="text-base font-semibold text-[#0f3460]">
                    RD$ {total.toLocaleString('es-DO', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-blue-700 uppercase tracking-wide">Pagado</div>
                  <div className="text-base font-semibold text-green-600">
                    RD$ {pagado.toLocaleString('es-DO', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-blue-700 uppercase tracking-wide">Pendiente</div>
                  <div className="text-base font-semibold text-orange-600">
                    RD$ {pendiente.toLocaleString('es-DO', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-blue-700 uppercase tracking-wide">Estado</div>
                  <span className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border capitalize ${colorEstado}`}>
                    {estado}
                  </span>
                </div>
              </div>
            );
          })()}

          {/* Lista de pagos */}
          {orden.pagos && orden.pagos.length > 0 && (
            <div className="space-y-1.5">
              {orden.pagos.map(p => (
                <div
                  key={p.id}
                  className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-xs"
                >
                  <div className="flex items-center gap-2">
                    {p.metodo === 'efectivo' && <Banknote size={14} className="text-green-600" />}
                    {p.metodo === 'transferencia' && <ArrowRightLeft size={14} className="text-blue-600" />}
                    {p.metodo === 'tarjeta' && <CreditCard size={14} className="text-purple-600" />}
                    <div>
                      <span className="font-medium text-gray-900">
                        RD$ {Number(p.monto).toLocaleString('es-DO', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                      </span>
                      <span className="text-gray-500 ml-2 capitalize">{p.metodo}</span>
                      {p.metodo === 'efectivo' && p.recibidoPorNombre && (
                        <span className="text-gray-500"> · {p.recibidoPorNombre}</span>
                      )}
                      {(p.metodo === 'transferencia' || p.metodo === 'tarjeta') && p.bancoNombre && (
                        <span className="text-gray-500"> → {p.bancoNombre}</span>
                      )}
                      {p.referencia && <span className="text-gray-500"> · Ref {p.referencia}</span>}
                    </div>
                  </div>
                  <span className="text-gray-400 text-[11px]">{formatFecha(p.fecha)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Estado de envío a facturación */}
          {orden.enviadaAFacturacion && !orden.facturada && (
            <div className="mt-2 text-[11px] text-blue-700 bg-blue-50 border border-blue-100 rounded-lg p-2">
              Enviada por <strong>{orden.enviadaAFacturacionPorNombre || '—'}</strong>
              {orden.enviadaAFacturacionAt && ` · ${formatFecha(orden.enviadaAFacturacionAt)}`}
              . Pendiente de emitir conduce de garantía por admin / coordinadora.
            </div>
          )}
          {orden.facturada && (
            <div className="mt-2 text-[11px] text-green-700 bg-green-50 border border-green-100 rounded-lg p-2">
              Conduce de Garantía emitido {orden.facturaNumero ? `(${orden.facturaNumero})` : ''}
              {orden.facturadaPorNombre && ` por ${orden.facturadaPorNombre}`}
              {orden.facturadaAt && ` · ${formatFecha(orden.facturadaAt)}`}
            </div>
          )}
        </div>
      )}

      <RegistrarPagoModal
        isOpen={showPagoModal}
        onClose={() => setShowPagoModal(false)}
        orden={orden}
        userProfile={userProfile}
      />

      {/* Piezas utilizadas — resumen compacto (link al detalle para ver/validar) */}
      {orden.cierreServicio?.piezasUsadas && orden.cierreServicio.piezasUsadas.length > 0 && (() => {
        const piezas = orden.cierreServicio!.piezasUsadas!;
        const costoTotal = Number(orden.costoPiezasTotal) || piezas.reduce((acc, p) => acc + (Number(p.costoTotal) || 0), 0);
        const validada = orden.cierreServicio?.piezasValidadasPorAdmin === true;
        return (
          <div>
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Package size={14} /> Piezas utilizadas
            </h3>
            <div className="flex items-center justify-between flex-wrap gap-2 bg-gray-50 border border-gray-100 rounded-lg p-3 text-sm">
              <div>
                <span className="font-medium text-gray-900">
                  {piezas.length} pieza{piezas.length === 1 ? '' : 's'}
                </span>
                <span className="text-gray-600"> · {formatMoneda(costoTotal)} · </span>
                {validada ? (
                  <span className="text-green-700 font-medium">Validadas</span>
                ) : (
                  <span className="text-orange-600 font-medium">Pendientes</span>
                )}
              </div>
              <Link
                to={`/admin/ordenes/${orden.id}`}
                className="text-xs font-semibold text-[#1a5fa8] hover:underline"
              >
                Ver detalle →
              </Link>
            </div>
          </div>
        );
      })()}

      {/* Feedback NPS del cliente */}
      {orden.feedback && (() => {
        const fb = orden.feedback;
        const fecha = fb.fechaFeedback instanceof Date
          ? fb.fechaFeedback
          : (typeof (fb.fechaFeedback as { toDate?: () => Date }).toDate === 'function'
              ? (fb.fechaFeedback as { toDate: () => Date }).toDate()
              : null);
        const colorTipo =
          fb.ratingTipo === 'promotor' ? 'bg-green-100 text-green-700 border-green-200'
            : fb.ratingTipo === 'pasivo' ? 'bg-amber-100 text-amber-700 border-amber-200'
              : 'bg-red-100 text-red-700 border-red-200';
        const labelTipo = fb.ratingTipo === 'promotor' ? 'Promotor'
          : fb.ratingTipo === 'pasivo' ? 'Pasivo' : 'Detractor';
        return (
          <div>
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Feedback del cliente
            </h3>
            <div className={`rounded-lg border p-3 space-y-1.5 ${colorTipo}`}>
              <div className="flex items-center gap-2 text-sm">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-white text-sm font-bold">
                  {fb.nps}
                </span>
                <span className="font-semibold">{labelTipo}</span>
                <span className="opacity-60 text-xs ml-auto">
                  {fecha ? formatFecha(fecha) : ''}
                </span>
              </div>
              {fb.comentario && (
                <p className="text-xs italic">&quot;{fb.comentario}&quot;</p>
              )}
              <div className="flex flex-wrap gap-2 text-[10px] pt-1">
                {fb.googleReviewClicked && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-white/70 font-medium">
                    Click reseña Google
                  </span>
                )}
                {fb.whatsappContactClicked && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-white/70 font-medium">
                    Contactó por WhatsApp
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Created By */}
      <div>
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Creado por</h3>
        <p className="text-sm text-gray-700">
          {orden.creadoPor || orden.responsableNombre || 'Sistema'}
          {' '}
          <span className="text-gray-400">- {tiempoTranscurrido(orden.createdAt)}</span>
        </p>
      </div>

      {/* Registro de Auditoria */}
      {orden.auditoria && orden.auditoria.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">{'\u{1F4DD}'} Registro de Cambios</h3>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {orden.auditoria.slice().reverse().map((reg, i) => (
              <div key={i} className="text-xs bg-gray-50 rounded-lg p-2 border border-gray-100">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-700">{reg.usuario}</span>
                  <span className="text-gray-400">{formatFecha(reg.fecha)}</span>
                </div>
                <p className="text-gray-600 mt-0.5">{reg.detalle}</p>
                {reg.valorAnterior && reg.valorNuevo && (
                  <p className="text-[10px] text-gray-400 mt-0.5">{reg.campo}: &quot;{reg.valorAnterior}&quot; &rarr; &quot;{reg.valorNuevo}&quot;</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Phase History Timeline */}
      {orden.historialFases.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Historial de Fases</h3>
          <div className="relative pl-6 space-y-4">
            <div className="absolute left-2 top-1 bottom-1 w-0.5 bg-gray-200" />
            {orden.historialFases.map((h, i) => (
              <div key={i} className="relative">
                <div className={`absolute -left-4 top-1 w-3 h-3 rounded-full border-2 border-white ${i === orden.historialFases.length - 1 ? 'bg-[#1a5fa8]' : 'bg-gray-300'}`} />
                <div>
                  <Badge fase={h.fase} />
                  <p className="text-xs text-gray-500 mt-1">
                    {formatFecha(h.timestamp)} - {h.usuario}
                  </p>
                  {h.nota && <p className="text-xs text-gray-600 mt-0.5">{h.nota}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
