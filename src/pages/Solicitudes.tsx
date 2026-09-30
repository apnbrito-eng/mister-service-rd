import { useAtencion } from '../context/AtencionContext';
import { mismoTelefono } from '../navigation/clienteSeleccionado';
import { useState, useMemo, useCallback, useRef } from 'react';
import { useSolicitudes, useEmpresas } from '../hooks/useFormularios';
import {
  actualizarEstadoSolicitud, convertirAOrden, eliminarSolicitud,
  listarClientesActivosPorTelefono, type ClienteConversion,
} from '../services/solicitudes.service';
import { obtenerFormulario } from '../services/formularios.service';
import { normalizarTelefono } from '../services/clientes.service';
import { CampoFormulario, FormularioServicio, SolicitudServicio, EstadoSolicitud } from '../types/formularios';
import { useApp } from '../context/AppContext';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';
import {
  inferirMappingSolicitud, extraerCoordenadasSolicitud,
  resumirSolicitudDatos, valoresTextoSolicitud,
  type CampoOrdenMapeable, type MappingResuelto,
} from '../utils/solicitudMapping';
import { Inbox, Eye, FileText, CheckCircle, ArrowRight, ExternalLink, Download, Trash2, AlertTriangle, MapPin, UserCheck, UserPlus } from 'lucide-react';
import WhatsAppIcon from '../components/icons/WhatsAppIcon';
import toast from 'react-hot-toast';

const ESTADO_BADGE: Record<EstadoSolicitud, string> = {
  pendiente: 'bg-yellow-100 text-yellow-700',
  revisada: 'bg-blue-100 text-blue-700',
  aprobada: 'bg-green-100 text-green-700',
  rechazada: 'bg-red-100 text-red-700',
  convertida: 'bg-purple-100 text-purple-700',
};

const ESTADO_LABEL: Record<EstadoSolicitud, string> = {
  pendiente: 'Pendiente',
  revisada: 'Revisada',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
  convertida: 'Convertida',
};

const TABS: { label: string; value: EstadoSolicitud | 'todas' }[] = [
  { label: 'Todas', value: 'todas' },
  { label: 'Pendientes', value: 'pendiente' },
  { label: 'Revisadas', value: 'revisada' },
  { label: 'Aprobadas', value: 'aprobada' },
  { label: 'Rechazadas', value: 'rechazada' },
  { label: 'Convertidas', value: 'convertida' },
];

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];

function isImageUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => lower.includes(ext));
}

function timeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'hace unos segundos';
  if (diffMin < 60) return `hace ${diffMin} min`;
  if (diffHr < 24) return `hace ${diffHr}h`;
  if (diffDay < 7) return `hace ${diffDay}d`;
  return date.toLocaleDateString('es-DO', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatPhoneForWhatsApp(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('1') && digits.length === 11) return digits;
  if (digits.length === 10) return `1${digits}`;
  return digits;
}

export default function Solicitudes() {
  const { seleccion } = useAtencion();
  const { solicitudes, loading } = useSolicitudes();
  const { empresas, loading: loadingEmpresas } = useEmpresas();
  const { userProfile, currentUser } = useApp();
  const puedeEliminar = userProfile?.rol === 'administrador' || userProfile?.rol === 'coordinadora';

  const [tabActivo, setTabActivo] = useState<EstadoSolicitud | 'todas'>('todas');
  const [filtroEmpresa, setFiltroEmpresa] = useState('');
  const [busqueda, setBusqueda] = useState('');

  const [selectedSolicitud, setSelectedSolicitud] = useState<SolicitudServicio | null>(null);
  const [modalEstado, setModalEstado] = useState<EstadoSolicitud>('pendiente');
  const [modalNotas, setModalNotas] = useState('');
  const [saving, setSaving] = useState(false);
  const [converting, setConverting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // ── Modal de conversión con mapping explícito ──
  // 2026-09-29 sprint calendarios/solicitudes: el flujo anterior asumía
  // que `datos.nombre`/`datos.telefono`/`datos.direccion`/... eran claves
  // fijas; en la práctica el `campo.id` del editor de formularios es
  // auto-generado y variable por formulario. Ahora cargamos el schema
  // real y le pedimos al admin que revise/edite el mapping antes de crear
  // la orden. Sin invención — solo redirigimos lo que ya está en `datos`.
  const [convertirOpen, setConvertirOpen] = useState(false);
  const [convertirSolicitud, setConvertirSolicitud] = useState<SolicitudServicio | null>(null);
  const [convertirFormulario, setConvertirFormulario] = useState<FormularioServicio | null>(null);
  const [convertirCamposOrden, setConvertirCamposOrden] = useState<Record<CampoOrdenMapeable, MappingResuelto>>({
    clienteNombre: { valor: '', confianza: 'ninguna' },
    clienteTelefono: { valor: '', confianza: 'ninguna' },
    clienteEmail: { valor: '', confianza: 'ninguna' },
    clienteDireccion: { valor: '', confianza: 'ninguna' },
    clienteReferencia: { valor: '', confianza: 'ninguna' },
    equipoTipo: { valor: '', confianza: 'ninguna' },
    equipoMarca: { valor: '', confianza: 'ninguna' },
    equipoModelo: { valor: '', confianza: 'ninguna' },
    descripcionFalla: { valor: '', confianza: 'ninguna' },
  });
  const [convertirCoords, setConvertirCoords] = useState<{ lat: number; lng: number } | null>(null);
  // Lista de todos los candidatos activos con el mismo telNorm. `[]` = no
  // hay match (se creará uno nuevo), `[1]` = match único (usar_existente
  // pre-seleccionado), `[>1]` = ambigüedad — el admin DEBE elegir.
  const [convertirClientesCandidatos, setConvertirClientesCandidatos] = useState<Array<{ id: string; nombre: string; telefono: string; direccion: string }>>([]);
  const [convertirClienteSeleccionadoId, setConvertirClienteSeleccionadoId] = useState<string | null>(null);
  const [convertirBuscandoCliente, setConvertirBuscandoCliente] = useState(false);
  const [convertirDecisionCliente, setConvertirDecisionCliente] = useState<'usar_existente' | 'crear_nuevo' | 'pendiente'>('pendiente');
  const [convertirErrorBusquedaCliente, setConvertirErrorBusquedaCliente] = useState<string | null>(null);
  // Epoch / basis: si el admin edita el teléfono mientras hay una búsqueda
  // en vuelo, la respuesta tardía NO puede pisar el estado nuevo. Guardamos
  // el epoch actual en un ref: la respuesta que no coincide con el epoch al
  // resolverse se descarta. `basisTelNormRef` guarda el telNorm sobre el que
  // se ejecutó la última búsqueda exitosa — usado por handleConfirmarConversion
  // para rechazar la confirmación si el teléfono cambió después de resolver.
  const busquedaClienteEpochRef = useRef(0);
  const busquedaClienteBasisTelNormRef = useRef<string>('');

  // Client-side filtering.
  // Búsqueda 2026-09-29: formularios dinámicos NO garantizan `datos.nombre` /
  // `datos.telefono` — los ids del editor son auto-generados. Sin este cambio,
  // la búsqueda quedaba muda para cualquier formulario que no siguiera la
  // convención heredada. Ahora matcheamos:
  //   1. `empresaNombre` + `formularioNombre`.
  //   2. Todos los valores string/número planos de `datos` (via
  //      `valoresTextoSolicitud` — excluye objetos/arrays/[archivo]/URLs).
  // El filtro por selección telefónica sigue usando `mismoTelefono` para
  // compat con conversaciones (donde el teléfono viene de la sesión de
  // atención, no de un campo dinámico). Si esa key también fuera dinámica,
  // se puede migrar más adelante — hoy la selección viene del contexto y no
  // filtra por datos.telefono estricto.
  const solicitudesFiltradas = useMemo(() => {
    let result = seleccion
      ? solicitudes.filter(s => {
          if (mismoTelefono(s.datos.telefono, seleccion.telefono)) return true;
          // Fallback dinámico: si el formulario no usa la key literal
          // `telefono`, matchear también por el teléfono inferido del payload.
          const { telefono: telInferido } = resumirSolicitudDatos(s.datos);
          return mismoTelefono(telInferido, seleccion.telefono);
        })
      : solicitudes;

    if (tabActivo !== 'todas') {
      result = result.filter((s) => s.estado === tabActivo);
    }

    if (filtroEmpresa) {
      result = result.filter((s) => s.empresaId === filtroEmpresa);
    }

    if (busqueda.trim()) {
      const q = busqueda.toLowerCase().trim();
      result = result.filter((s) => {
        if (s.empresaNombre && s.empresaNombre.toLowerCase().includes(q)) return true;
        if (s.formularioNombre && s.formularioNombre.toLowerCase().includes(q)) return true;
        const valores = valoresTextoSolicitud(s.datos);
        return valores.some(v => v.toLowerCase().includes(q));
      });
    }

    return result;
  }, [solicitudes, tabActivo, filtroEmpresa, busqueda, seleccion]);

  const pendientesCount = solicitudes.filter((s) => s.estado === 'pendiente').length;

  const openDetail = (sol: SolicitudServicio) => {
    setSelectedSolicitud(sol);
    setModalEstado(sol.estado);
    setModalNotas(sol.notas || '');
  };

  const closeDetail = () => {
    setSelectedSolicitud(null);
    setModalEstado('pendiente');
    setModalNotas('');
  };

  const handleGuardarCambios = async () => {
    if (!selectedSolicitud) return;
    setSaving(true);
    try {
      await actualizarEstadoSolicitud(selectedSolicitud.id, modalEstado, modalNotas);
      toast.success('Solicitud actualizada');
      // Update local reference
      setSelectedSolicitud({ ...selectedSolicitud, estado: modalEstado, notas: modalNotas });
    } catch (err) {
      console.error('Error actualizando solicitud:', err);
      toast.error('Error al actualizar la solicitud');
    } finally {
      setSaving(false);
    }
  };

  const cerrarConvertir = () => {
    setConvertirOpen(false);
    setConvertirSolicitud(null);
    setConvertirFormulario(null);
    setConvertirClientesCandidatos([]);
    setConvertirClienteSeleccionadoId(null);
    setConvertirDecisionCliente('pendiente');
    setConvertirCoords(null);
    setConvertirErrorBusquedaCliente(null);
    setConvertirBuscandoCliente(false);
    // Invalidar cualquier búsqueda en vuelo: la próxima resolución no
    // matcheará el epoch y se descartará.
    busquedaClienteEpochRef.current++;
    busquedaClienteBasisTelNormRef.current = '';
  };

  /**
   * Invalida el estado de búsqueda de cliente. Se llama al editar el
   * teléfono (para que la UI no muestre candidatos obsoletos del número
   * anterior) y al abrir el modal / cambiar la solicitud. Bump del epoch
   * asegura que si había una búsqueda en vuelo, su respuesta se descarta al
   * resolver.
   */
  const invalidarBusquedaCliente = useCallback(() => {
    busquedaClienteEpochRef.current++;
    busquedaClienteBasisTelNormRef.current = '';
    setConvertirClientesCandidatos([]);
    setConvertirClienteSeleccionadoId(null);
    setConvertirDecisionCliente('pendiente');
    setConvertirErrorBusquedaCliente(null);
    setConvertirBuscandoCliente(false);
  }, []);

  const buscarClienteDesdeTelefono = useCallback(async (telefono: string) => {
    const telNorm = normalizarTelefono(telefono);
    // Bump epoch al iniciar — cualquier respuesta previa en vuelo queda huérfana.
    const myEpoch = ++busquedaClienteEpochRef.current;
    if (!telNorm || telNorm.length !== 10) {
      setConvertirClientesCandidatos([]);
      setConvertirClienteSeleccionadoId(null);
      setConvertirDecisionCliente('pendiente');
      setConvertirBuscandoCliente(false);
      setConvertirErrorBusquedaCliente(null);
      busquedaClienteBasisTelNormRef.current = '';
      return;
    }
    setConvertirBuscandoCliente(true);
    setConvertirErrorBusquedaCliente(null);
    try {
      const candidatos = await listarClientesActivosPorTelefono(telefono);
      // Descartar respuesta stale: si el usuario editó el teléfono (o
      // cerró el modal) mientras esta búsqueda estaba en vuelo, otro
      // `myEpoch` ya reservó el turno — abandonamos.
      if (myEpoch !== busquedaClienteEpochRef.current) return;
      busquedaClienteBasisTelNormRef.current = telNorm;
      setConvertirClientesCandidatos(candidatos);
      if (candidatos.length === 0) {
        setConvertirClienteSeleccionadoId(null);
        setConvertirDecisionCliente('crear_nuevo');
      } else if (candidatos.length === 1) {
        setConvertirClienteSeleccionadoId(candidatos[0].id);
        setConvertirDecisionCliente('usar_existente');
      } else {
        // Ambigüedad: >1 doc activo con el mismo telNorm (legacy pre-dedup).
        // NO adivinamos — el admin DEBE elegir explícitamente en el modal.
        setConvertirClienteSeleccionadoId(null);
        setConvertirDecisionCliente('pendiente');
      }
    } catch (err) {
      if (myEpoch !== busquedaClienteEpochRef.current) return;
      console.warn('Búsqueda cliente por teléfono falló:', err);
      setConvertirClientesCandidatos([]);
      setConvertirClienteSeleccionadoId(null);
      setConvertirDecisionCliente('pendiente');
      setConvertirErrorBusquedaCliente(
        err instanceof Error ? err.message : 'No pudimos buscar el cliente.',
      );
      busquedaClienteBasisTelNormRef.current = '';
    } finally {
      if (myEpoch === busquedaClienteEpochRef.current) setConvertirBuscandoCliente(false);
    }
  }, []);

  const handleAbrirConvertir = async () => {
    if (!selectedSolicitud) return;
    setConverting(true);
    try {
      // Cargamos el schema real del formulario para poder mapear por
      // etiqueta/tipo y mostrarle al admin el par (campo original → campo
      // orden). El fetch se hace on-demand — no todos los admin convierten
      // solicitudes, no vale la pena mantenerlo en state global.
      const formulario = selectedSolicitud.formularioId
        ? await obtenerFormulario(selectedSolicitud.formularioId)
        : null;
      if (!formulario) {
        toast.error('No se pudo cargar el formulario original. Revisa que exista.');
        return;
      }
      const campos: CampoFormulario[] = [
        ...formulario.camposEstandar,
        ...formulario.camposPersonalizados,
      ].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
      const mapping = inferirMappingSolicitud(campos, selectedSolicitud.datos);
      const coords = extraerCoordenadasSolicitud(selectedSolicitud, campos);
      setConvertirSolicitud(selectedSolicitud);
      setConvertirFormulario(formulario);
      setConvertirCamposOrden(mapping);
      setConvertirCoords(coords);
      setConvertirClientesCandidatos([]);
      setConvertirClienteSeleccionadoId(null);
      setConvertirDecisionCliente('pendiente');
      setConvertirOpen(true);
      // Auto-buscar cliente con el teléfono mapeado (si vino).
      if (mapping.clienteTelefono.valor) {
        void buscarClienteDesdeTelefono(mapping.clienteTelefono.valor);
      }
    } catch (err) {
      console.error('Error preparando conversión:', err);
      toast.error('No se pudo preparar la conversión.');
    } finally {
      setConverting(false);
    }
  };

  const handleConfirmarConversion = async () => {
    if (!convertirSolicitud || !convertirFormulario) return;
    // Validaciones mínimas antes de crear la orden. No inventamos: si el
    // admin quiere convertir sin equipoTipo o falla explícita, se lo
    // pedimos manualmente.
    const nombre = convertirCamposOrden.clienteNombre.valor.trim();
    const telefono = convertirCamposOrden.clienteTelefono.valor.trim();
    if (!nombre) {
      toast.error('Falta el nombre del cliente. Completa antes de crear la orden.');
      return;
    }
    const telNorm = normalizarTelefono(telefono);
    if (!telNorm || telNorm.length !== 10) {
      toast.error('Teléfono inválido. Debe ser un número RD de 10 dígitos.');
      return;
    }
    if (!convertirCamposOrden.equipoTipo.valor.trim()) {
      toast.error('Falta el tipo de equipo. Editá el campo antes de convertir.');
      return;
    }
    if (!convertirCamposOrden.descripcionFalla.valor.trim()) {
      toast.error('Falta la descripción de la falla. Editá el campo antes de convertir.');
      return;
    }
    // Ambigüedad telefónica: si hay >1 candidato NO adivinamos — el admin
    // DEBE seleccionar el radio del cliente correcto o marcar "crear nuevo".
    if (convertirClientesCandidatos.length > 1 && convertirDecisionCliente === 'pendiente') {
      toast.error('Hay varios clientes con este teléfono. Elegí cuál usar o creá uno nuevo.');
      return;
    }
    if (convertirDecisionCliente === 'usar_existente' && !convertirClienteSeleccionadoId) {
      toast.error('Elegí cuál cliente existente vincular.');
      return;
    }
    if (convertirDecisionCliente === 'pendiente' && convertirClientesCandidatos.length > 0) {
      toast.error('Elegí usar un cliente existente o crear uno nuevo.');
      return;
    }
    // Bloqueo por búsqueda pendiente / en error: NO permitir confirmar
    // mientras la resolución de cliente no está finalizada. Sin este check,
    // el admin puede clickear "Crear orden" antes de que el fetch termine y
    // la orden se crea con un `clienteId` que quizás luego no coincide con
    // el candidato correcto (o peor: se crea un cliente duplicado porque la
    // búsqueda todavía no había reportado el existente).
    if (convertirBuscandoCliente) {
      toast.error('Esperá a que termine la búsqueda de cliente por teléfono.');
      return;
    }
    if (convertirErrorBusquedaCliente) {
      toast.error('La búsqueda de cliente falló. Reintentá antes de crear la orden.');
      return;
    }
    // Verificación identidad: el teléfono al que confirmamos debe ser
    // exactamente el mismo (normalizado) que gatilló la última búsqueda
    // exitosa. Si el admin cambió el teléfono después de resolver, hay que
    // volver a buscar antes de confirmar — de lo contrario el
    // `clienteConversion` podría apuntar a un candidato del teléfono viejo.
    if (busquedaClienteBasisTelNormRef.current !== telNorm) {
      toast.error(
        'El teléfono cambió después de buscar. Salí del campo teléfono (blur) para actualizar y volvé a confirmar.',
      );
      return;
    }
    setConverting(true);
    try {
      // Resolución de cliente — la creación/mergeo del doc `clientes/{id}`
      // ocurre DENTRO de la misma transacción que la orden. NUNCA queda un
      // clienteId apuntando a un doc inexistente.
      const clienteConversion: ClienteConversion = convertirDecisionCliente === 'usar_existente' && convertirClienteSeleccionadoId
        ? { tipo: 'existente', clienteId: convertirClienteSeleccionadoId }
        : {
            tipo: 'crear',
            telefonoNormalizado: telNorm,
            telefonoOriginal: telefono,
            nombre,
            ...(convertirCamposOrden.clienteEmail.valor.trim() ? { email: convertirCamposOrden.clienteEmail.valor.trim() } : {}),
            ...(convertirCamposOrden.clienteDireccion.valor.trim() ? { direccion: convertirCamposOrden.clienteDireccion.valor.trim() } : {}),
            ...(convertirCamposOrden.clienteReferencia.valor.trim() ? { referenciaDireccion: convertirCamposOrden.clienteReferencia.valor.trim() } : {}),
            ...(convertirCoords ? { lat: convertirCoords.lat, lng: convertirCoords.lng } : {}),
          };
      const ordenPayload: Record<string, unknown> = {
        clienteNombre: nombre,
        clienteTelefono: telefono,
        clienteTelefonoNormalizado: telNorm,
        equipoTipo: convertirCamposOrden.equipoTipo.valor.trim(),
        descripcionFalla: convertirCamposOrden.descripcionFalla.valor.trim(),
      };
      // `clienteId` NO se setea aquí — el servicio lo resuelve dentro de la
      // transacción a partir de `clienteConversion` (garantizando que el
      // doc exista antes de escribir la orden).
      if (convertirCamposOrden.clienteEmail.valor.trim()) ordenPayload.clienteEmail = convertirCamposOrden.clienteEmail.valor.trim();
      if (convertirCamposOrden.clienteDireccion.valor.trim()) ordenPayload.clienteDireccion = convertirCamposOrden.clienteDireccion.valor.trim();
      if (convertirCamposOrden.clienteReferencia.valor.trim()) ordenPayload.clienteReferencia = convertirCamposOrden.clienteReferencia.valor.trim();
      if (convertirCamposOrden.equipoMarca.valor.trim()) ordenPayload.equipoMarca = convertirCamposOrden.equipoMarca.valor.trim();
      if (convertirCamposOrden.equipoModelo.valor.trim()) ordenPayload.equipoModelo = convertirCamposOrden.equipoModelo.valor.trim();
      if (convertirCoords) {
        ordenPayload.clienteLat = convertirCoords.lat;
        ordenPayload.clienteLng = convertirCoords.lng;
      }
      // Origen y trazabilidad — sin inventar equipo/responsable si no vino.
      const metadatos: NonNullable<import('../types').OrdenServicio['metadatosCita']> = {
        origen: 'solicitud_formulario',
        solicitudId: convertirSolicitud.id,
        formularioId: convertirFormulario.id,
        formularioNombre: convertirFormulario.nombre,
        empresaId: convertirFormulario.empresaId,
        empresaNombre: convertirFormulario.empresaNombre,
      };
      // Anexamos los campos originales del formulario que no se mapearon
      // (fuera de los canónicos) como referencia denormalizada. Guardamos
      // etiquetas amigables — el admin podrá revisarlas en la orden.
      const mapeadosIds = new Set(
        Object.values(convertirCamposOrden)
          .map(m => m.fuenteCampoId)
          .filter((v): v is string => !!v),
      );
      const campos = [
        ...convertirFormulario.camposEstandar,
        ...convertirFormulario.camposPersonalizados,
      ];
      const camposExtra: Record<string, string> = {};
      for (const campo of campos) {
        if (mapeadosIds.has(campo.id)) continue;
        // Excluir tipos no textuales (foto/firma/archivo/ubicacion) — ya
        // van a `archivos[]` y `ubicacion` (arriba).
        if (['foto', 'firma', 'archivo', 'ubicacion'].includes(campo.tipo)) continue;
        const valor = convertirSolicitud.datos[campo.id];
        if (valor === undefined || valor === null || valor === '') continue;
        camposExtra[campo.etiqueta || campo.id] = String(valor);
      }
      if (Object.keys(camposExtra).length > 0) metadatos.camposPersonalizados = camposExtra;
      ordenPayload.metadatosCita = metadatos;
      ordenPayload.creadoPor = userProfile?.nombre || 'Sistema';
      if (currentUser?.uid) ordenPayload.creadoPorId = currentUser.uid;
      // La orden nace en 'nuevo_lead' (fase inicial) para que el admin
      // decida técnico/fecha en /admin/ordenes. NO auto-asignamos
      // equipo/responsable — Jorge lo pidió explícito.
      // El servicio resuelve/crea el cliente dentro de la misma transacción
      // (ver `convertirAOrden` — `clienteConversion` obligatorio para
      // consistencia entre orden y cliente).
      const ordenId = await convertirAOrden(convertirSolicitud.id, ordenPayload, clienteConversion);
      toast.success('Orden creada. Completala desde /admin/ordenes.');
      cerrarConvertir();
      closeDetail();
      // Log para debugging manual — el admin verá el id en consola si necesita
      // seguir el flujo antes de que el listener refresque el estado.
      console.info(`[Solicitudes] convertida ${convertirSolicitud.id} → orden ${ordenId}`);
    } catch (err) {
      console.error('Error convirtiendo solicitud:', err);
      const mensaje = err instanceof Error ? err.message : 'Error al convertir en orden';
      toast.error(mensaje);
    } finally {
      setConverting(false);
    }
  };

  const handleEliminar = async (sol: SolicitudServicio) => {
    if (!puedeEliminar) return;
    // Resumen dinámico: los ids del formulario son auto-generados; `datos.nombre`
    // no está garantizado. Usamos el helper que aplica heurística sobre el
    // payload sin necesidad del schema.
    const { nombre: nombreInferido } = resumirSolicitudDatos(sol.datos);
    const nombre = nombreInferido || sol.formularioNombre || 'sin identificar';
    const confirmado = window.confirm(
      `¿Eliminar la solicitud de "${nombre}"?\n\nEsta acción no se puede deshacer.`
    );
    if (!confirmado) return;

    setDeleting(true);
    try {
      await eliminarSolicitud(sol.id);
      toast.success('Solicitud eliminada');
      if (selectedSolicitud?.id === sol.id) closeDetail();
    } catch (err) {
      console.error('Error eliminando solicitud:', err);
      toast.error('Error al eliminar la solicitud');
    } finally {
      setDeleting(false);
    }
  };

  const handleWhatsApp = () => {
    if (!selectedSolicitud) return;
    const { telefono: telInferido } = resumirSolicitudDatos(selectedSolicitud.datos);
    const phone = formatPhoneForWhatsApp(String(selectedSolicitud.datos.telefono || telInferido || ''));
    window.open(`https://wa.me/${phone}`, '_blank');
  };

  const getArchivoForCampo = (campoId: string) => {
    return selectedSolicitud?.archivos.find((a) => a.campoId === campoId);
  };

  if (loading || loadingEmpresas) return <LoadingSpinner />;

  return (
    <div className="min-h-full bg-[#f0f4f8] p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#0f3460] rounded-xl">
            <Inbox size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Solicitudes</h1>
            <p className="text-sm text-gray-500">
              {seleccion ? solicitudesFiltradas.length : solicitudes.length} total &middot; {pendientesCount} pendiente{pendientesCount !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-6 bg-white border rounded-2xl p-4">
        <label className="text-sm font-medium text-gray-600">Buscar solicitud<input aria-label="Buscar solicitud" placeholder="Nombre o teléfono" value={busqueda} onChange={e => setBusqueda(e.target.value)} className="block w-full min-h-11 mt-2 border rounded-xl px-3" /></label>
        <label className="text-sm font-medium text-gray-600">Estado<select value={tabActivo} onChange={e => setTabActivo(e.target.value as EstadoSolicitud | 'todas')} className="block w-full min-h-11 mt-2 border rounded-xl px-3 bg-white">{TABS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></label>
        <label className="text-sm font-medium text-gray-600">Empresa<select value={filtroEmpresa} onChange={e => setFiltroEmpresa(e.target.value)} className="block w-full min-h-11 mt-2 border rounded-xl px-3 bg-white"><option value="">Todas las empresas</option>{empresas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}</select></label>
      </div>

      {/* List */}
      {solicitudesFiltradas.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center justify-center py-20 text-gray-400">
          <Inbox size={48} strokeWidth={1.5} />
          <p className="mt-4 text-lg font-medium">No hay solicitudes</p>
          <p className="text-sm mt-1">Las solicitudes de los formularios aparecerán aquí</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {solicitudesFiltradas.map((sol) => {
            const fecha = sol.createdAt?.toDate ? sol.createdAt.toDate() : new Date();
            // Resumen sin schema — soporta formularios con ids auto-generados.
            const resumen = resumirSolicitudDatos(sol.datos);
            return (
              <div
                key={sol.id}
                onClick={() => openDetail(sol)}
                className="bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-md transition-shadow cursor-pointer group"
              >
                <div className="flex items-center justify-between">
                  {/* Left */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-semibold text-gray-900 truncate">
                        {resumen.nombre || 'Sin nombre'}
                      </h3>
                      <span className="text-sm text-gray-400">{resumen.telefono || ''}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                        {sol.empresaNombre}
                      </span>
                      <span className="text-xs text-gray-400">{sol.formularioNombre}</span>
                    </div>
                  </div>

                  {/* Right */}
                  <div className="flex items-center gap-3 ml-4">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${ESTADO_BADGE[sol.estado]}`}
                    >
                      {ESTADO_LABEL[sol.estado]}
                    </span>
                    <span className="text-xs text-gray-400 whitespace-nowrap">{timeAgo(fecha)}</span>
                    {puedeEliminar && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleEliminar(sol); }}
                        disabled={deleting}
                        title="Eliminar solicitud"
                        className="inline-flex items-center justify-center p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                    <Eye size={16} className="text-gray-300 group-hover:text-gray-500 transition-colors" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail Modal */}
      <Modal
        isOpen={!!selectedSolicitud}
        onClose={closeDetail}
        title="Detalle de Solicitud"
        size="xl"
      >
        {selectedSolicitud && (
          <div className="space-y-6">
            {/* Header info */}
            <div className="bg-gray-50 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">
                  {resumirSolicitudDatos(selectedSolicitud.datos).nombre || 'Sin nombre'}
                </h3>
                <span
                  className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${ESTADO_BADGE[selectedSolicitud.estado]}`}
                >
                  {ESTADO_LABEL[selectedSolicitud.estado]}
                </span>
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-600">
                <span>Tel: {resumirSolicitudDatos(selectedSolicitud.datos).telefono || 'N/A'}</span>
                <span>Empresa: {selectedSolicitud.empresaNombre}</span>
                <span>Formulario: {selectedSolicitud.formularioNombre}</span>
              </div>
              <p className="text-xs text-gray-400">
                Enviada:{' '}
                {selectedSolicitud.createdAt?.toDate
                  ? selectedSolicitud.createdAt.toDate().toLocaleString('es-DO', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : 'Sin fecha'}
              </p>
              {selectedSolicitud.ordenId && (
                <p className="text-xs text-purple-600 font-medium">
                  Orden asociada: {selectedSolicitud.ordenId}
                </p>
              )}
            </div>

            {/* Data section */}
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <FileText size={16} />
                Datos del formulario
              </h4>
              <div className="grid gap-3">
                {Object.entries(selectedSolicitud.datos).map(([key, value]) => {
                  const archivo = getArchivoForCampo(key);
                  const label = key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

                  // If there's an archivo for this field
                  if (archivo) {
                    if (isImageUrl(archivo.url)) {
                      return (
                        <div key={key} className="bg-gray-50 rounded-lg p-3">
                          <p className="text-xs font-medium text-gray-500 mb-2">{label}</p>
                          <a href={archivo.url} target="_blank" rel="noopener noreferrer">
                            <img
                              src={archivo.url}
                              alt={archivo.nombre || key}
                              className="max-w-xs rounded-lg border border-gray-200 hover:opacity-90 transition-opacity"
                            />
                          </a>
                        </div>
                      );
                    }
                    return (
                      <div key={key} className="bg-gray-50 rounded-lg p-3">
                        <p className="text-xs font-medium text-gray-500 mb-2">{label}</p>
                        <a
                          href={archivo.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 text-sm text-[#0f3460] hover:underline"
                        >
                          <Download size={14} />
                          {archivo.nombre || 'Descargar archivo'}
                        </a>
                      </div>
                    );
                  }

                  // If value looks like an archivo reference
                  if (typeof value === 'string' && value.startsWith('[archivo')) {
                    return (
                      <div key={key} className="bg-gray-50 rounded-lg p-3">
                        <p className="text-xs font-medium text-gray-500 mb-1">{label}</p>
                        <p className="text-sm text-gray-400 italic">Archivo pendiente</p>
                      </div>
                    );
                  }

                  // Regular field
                  return (
                    <div key={key} className="bg-gray-50 rounded-lg p-3">
                      <p className="text-xs font-medium text-gray-500 mb-1">{label}</p>
                      <p className="text-sm text-gray-900">{String(value || '—')}</p>
                    </div>
                  );
                })}

                {/* Firma */}
                {selectedSolicitud.archivos
                  .filter((a) => a.campoId === 'firma')
                  .map((firma) => (
                    <div key="firma" className="bg-gray-50 rounded-lg p-3">
                      <p className="text-xs font-medium text-gray-500 mb-2">Firma</p>
                      <img
                        src={firma.url}
                        alt="Firma"
                        className="max-w-xs rounded-lg border border-gray-200"
                      />
                    </div>
                  ))}

                {/* Archivos not linked to a datos key */}
                {selectedSolicitud.archivos
                  .filter(
                    (a) =>
                      a.campoId !== 'firma' &&
                      !Object.keys(selectedSolicitud.datos).includes(a.campoId)
                  )
                  .map((archivo) => {
                    const label = archivo.campoId.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
                    if (isImageUrl(archivo.url)) {
                      return (
                        <div key={archivo.campoId} className="bg-gray-50 rounded-lg p-3">
                          <p className="text-xs font-medium text-gray-500 mb-2">{label}</p>
                          <a href={archivo.url} target="_blank" rel="noopener noreferrer">
                            <img
                              src={archivo.url}
                              alt={archivo.nombre || archivo.campoId}
                              className="max-w-xs rounded-lg border border-gray-200 hover:opacity-90 transition-opacity"
                            />
                          </a>
                        </div>
                      );
                    }
                    return (
                      <div key={archivo.campoId} className="bg-gray-50 rounded-lg p-3">
                        <p className="text-xs font-medium text-gray-500 mb-2">{label}</p>
                        <a
                          href={archivo.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 text-sm text-[#0f3460] hover:underline"
                        >
                          <Download size={14} />
                          {archivo.nombre || 'Descargar archivo'}
                        </a>
                      </div>
                    );
                  })}

                {/* Ubicacion */}
                {selectedSolicitud.ubicacion && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs font-medium text-gray-500 mb-1">Ubicacion</p>
                    <a
                      href={`https://www.google.com/maps?q=${selectedSolicitud.ubicacion.lat},${selectedSolicitud.ubicacion.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm text-[#0f3460] hover:underline"
                    >
                      <ExternalLink size={14} />
                      {'\uD83D\uDCCD'} {selectedSolicitud.ubicacion.lat.toFixed(6)},{' '}
                      {selectedSolicitud.ubicacion.lng.toFixed(6)}
                    </a>
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="border-t border-gray-100 pt-6 space-y-4">
              <h4 className="text-sm font-semibold text-gray-700">Acciones</h4>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Estado</label>
                  <select
                    value={modalEstado}
                    onChange={(e) => setModalEstado(e.target.value as EstadoSolicitud)}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-[#0f3460]/20 focus:border-[#0f3460] outline-none transition-all text-sm text-gray-700"
                  >
                    <option value="pendiente">Pendiente</option>
                    <option value="revisada">Revisada</option>
                    <option value="aprobada">Aprobada</option>
                    <option value="rechazada">Rechazada</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Notas del admin</label>
                  <textarea
                    value={modalNotas}
                    onChange={(e) => setModalNotas(e.target.value)}
                    rows={2}
                    placeholder="Agregar notas internas..."
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-[#0f3460]/20 focus:border-[#0f3460] outline-none transition-all text-sm text-gray-700 resize-none"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={handleGuardarCambios}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2.5 bg-[#0f3460] text-white rounded-xl hover:bg-[#0d2d56] transition-colors font-medium text-sm disabled:opacity-50"
                >
                  <CheckCircle size={16} />
                  {saving ? 'Guardando...' : 'Guardar cambios'}
                </button>

                {(modalEstado === 'aprobada' || selectedSolicitud.estado === 'aprobada') &&
                  selectedSolicitud.estado !== 'convertida' && (
                    <button
                      onClick={handleAbrirConvertir}
                      disabled={converting}
                      className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition-colors font-medium text-sm disabled:opacity-50"
                    >
                      <ArrowRight size={16} />
                      {converting ? 'Preparando…' : 'Convertir en Orden'}
                    </button>
                  )}

                <button
                  onClick={handleWhatsApp}
                  className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors font-medium text-sm"
                >
                  <WhatsAppIcon filled={false} className="text-white" size={16} />
                  WhatsApp
                </button>

                {puedeEliminar && (
                  <button
                    onClick={() => handleEliminar(selectedSolicitud)}
                    disabled={deleting}
                    className="flex items-center gap-2 px-4 py-2.5 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors font-medium text-sm disabled:opacity-50 ml-auto"
                  >
                    <Trash2 size={16} />
                    {deleting ? 'Eliminando...' : 'Eliminar'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal de conversión con mapping explícito */}
      <Modal
        isOpen={convertirOpen}
        onClose={cerrarConvertir}
        title="Convertir solicitud en orden"
        size="xl"
      >
        {convertirSolicitud && convertirFormulario && (
          <div className="space-y-6">
            {/* Aviso: no inventamos */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle size={18} className="text-amber-600 mt-0.5 shrink-0" />
              <div className="text-xs text-amber-900">
                <p className="font-semibold mb-1">Revisá los datos antes de convertir</p>
                <p>
                  El sistema mapeó los campos del formulario a la orden según su tipo/etiqueta.
                  <strong> Confianza baja</strong> significa que solo se encontró un id parecido,
                  no una etiqueta clara — revisa el valor. La orden nace en fase{' '}
                  <code className="bg-white px-1 rounded">nuevo_lead</code> y debés completarla
                  desde <code className="bg-white px-1 rounded">/admin/ordenes</code> (técnico,
                  fecha, precio). No se asigna equipo/responsable automáticamente.
                </p>
              </div>
            </div>

            {/* Cliente resuelto */}
            <div className="bg-gray-50 rounded-xl p-4 space-y-3">
              <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <UserCheck size={16} /> Cliente
              </h4>
              {convertirBuscandoCliente && (
                <p className="text-xs text-gray-500">Buscando cliente por teléfono…</p>
              )}
              {convertirErrorBusquedaCliente && !convertirBuscandoCliente && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-2 flex items-start gap-2">
                  <AlertTriangle size={14} className="text-red-600 mt-0.5 shrink-0" />
                  <div className="text-xs text-red-900 flex-1">
                    <p className="font-semibold">La búsqueda de cliente falló.</p>
                    <p className="text-red-800">{convertirErrorBusquedaCliente}</p>
                    <button
                      type="button"
                      onClick={() => void buscarClienteDesdeTelefono(convertirCamposOrden.clienteTelefono.valor)}
                      className="mt-1 text-xs underline text-red-800 hover:text-red-900"
                    >
                      Reintentar búsqueda
                    </button>
                  </div>
                </div>
              )}
              {!convertirBuscandoCliente && convertirClientesCandidatos.length === 1 && (
                <div className="space-y-2">
                  <p className="text-xs text-gray-600">
                    Encontramos un cliente con este teléfono:
                  </p>
                  <div className="bg-white rounded-lg border border-gray-200 p-3 text-sm">
                    <p className="font-semibold">{convertirClientesCandidatos[0].nombre || 'Sin nombre'}</p>
                    <p className="text-xs text-gray-500">{convertirClientesCandidatos[0].telefono}</p>
                    {convertirClientesCandidatos[0].direccion && (
                      <p className="text-xs text-gray-400 mt-1">{convertirClientesCandidatos[0].direccion}</p>
                    )}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="radio"
                        name="convertir-cliente-decision"
                        checked={convertirDecisionCliente === 'usar_existente'}
                        onChange={() => {
                          setConvertirDecisionCliente('usar_existente');
                          setConvertirClienteSeleccionadoId(convertirClientesCandidatos[0].id);
                        }}
                      />
                      Usar cliente existente
                    </label>
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="radio"
                        name="convertir-cliente-decision"
                        checked={convertirDecisionCliente === 'crear_nuevo'}
                        onChange={() => {
                          setConvertirDecisionCliente('crear_nuevo');
                          setConvertirClienteSeleccionadoId(null);
                        }}
                      />
                      Ignorar y crear uno nuevo (podés completar más datos luego)
                    </label>
                  </div>
                </div>
              )}
              {!convertirBuscandoCliente && convertirClientesCandidatos.length > 1 && (
                <div className="space-y-2">
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 flex items-start gap-2">
                    <AlertTriangle size={14} className="text-amber-600 mt-0.5 shrink-0" />
                    <p className="text-xs text-amber-900">
                      Encontramos <strong>{convertirClientesCandidatos.length} clientes</strong> con este teléfono
                      (legacy pre-dedup). Elegí explícitamente cuál vincular o marcá "crear uno nuevo".
                    </p>
                  </div>
                  <div className="space-y-2 max-h-56 overflow-auto">
                    {convertirClientesCandidatos.map(c => (
                      <label key={c.id} className="flex items-start gap-2 cursor-pointer bg-white rounded-lg border border-gray-200 p-3">
                        <input
                          type="radio"
                          name="convertir-cliente-candidato"
                          className="mt-0.5"
                          checked={convertirDecisionCliente === 'usar_existente' && convertirClienteSeleccionadoId === c.id}
                          onChange={() => {
                            setConvertirDecisionCliente('usar_existente');
                            setConvertirClienteSeleccionadoId(c.id);
                          }}
                        />
                        <div className="text-xs">
                          <p className="font-semibold text-gray-800">{c.nombre || 'Sin nombre'}</p>
                          <p className="text-gray-500">{c.telefono}</p>
                          {c.direccion && <p className="text-gray-400">{c.direccion}</p>}
                          <p className="text-[10px] text-gray-400 font-mono mt-0.5">id: {c.id}</p>
                        </div>
                      </label>
                    ))}
                    <label className="flex items-center gap-2 cursor-pointer bg-white rounded-lg border border-gray-200 p-3 text-xs">
                      <input
                        type="radio"
                        name="convertir-cliente-candidato"
                        checked={convertirDecisionCliente === 'crear_nuevo'}
                        onChange={() => {
                          setConvertirDecisionCliente('crear_nuevo');
                          setConvertirClienteSeleccionadoId(null);
                        }}
                      />
                      <UserPlus size={14} /> Crear uno nuevo (no vincular a ninguno de los anteriores)
                    </label>
                  </div>
                </div>
              )}
              {!convertirBuscandoCliente && convertirClientesCandidatos.length === 0 && (
                <p className="text-xs text-gray-600 flex items-center gap-2">
                  <UserPlus size={14} /> No hay cliente registrado con este teléfono. Se creará uno nuevo al confirmar (atómico con la orden).
                </p>
              )}
            </div>

            {/* Mapping editable */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <FileText size={16} /> Datos que irán a la orden
              </h4>
              {(
                [
                  { key: 'clienteNombre', label: 'Nombre del cliente', requerido: true },
                  { key: 'clienteTelefono', label: 'Teléfono', requerido: true, onBlur: true },
                  { key: 'clienteEmail', label: 'Email' },
                  { key: 'clienteDireccion', label: 'Dirección' },
                  { key: 'clienteReferencia', label: 'Referencia de dirección' },
                  { key: 'equipoTipo', label: 'Tipo de equipo', requerido: true },
                  { key: 'equipoMarca', label: 'Marca' },
                  { key: 'equipoModelo', label: 'Modelo / configuración' },
                  { key: 'descripcionFalla', label: 'Descripción de la falla', requerido: true, textarea: true },
                ] as { key: CampoOrdenMapeable; label: string; requerido?: boolean; textarea?: boolean; onBlur?: boolean }[]
              ).map(({ key, label, requerido, textarea, onBlur }) => {
                const m = convertirCamposOrden[key];
                const confianzaLabel = m.confianza === 'alta'
                  ? { txt: 'Alta', cls: 'bg-green-100 text-green-700' }
                  : m.confianza === 'media'
                    ? { txt: 'Media', cls: 'bg-blue-100 text-blue-700' }
                    : m.confianza === 'baja'
                      ? { txt: 'Baja', cls: 'bg-amber-100 text-amber-700' }
                      : { txt: 'No mapeado', cls: 'bg-gray-100 text-gray-500' };
                return (
                  <div key={key} className="bg-white border border-gray-100 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-medium text-gray-700">
                        {label}{requerido && <span className="text-red-500"> *</span>}
                      </label>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${confianzaLabel.cls}`}>
                        {confianzaLabel.txt}
                      </span>
                    </div>
                    {textarea ? (
                      <textarea
                        rows={3}
                        value={m.valor}
                        onChange={(e) =>
                          setConvertirCamposOrden(prev => ({
                            ...prev,
                            [key]: { ...prev[key], valor: e.target.value },
                          }))
                        }
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0f3460]/20 resize-none"
                      />
                    ) : (
                      <input
                        type="text"
                        value={m.valor}
                        onChange={(e) => {
                          const nuevoValor = e.target.value;
                          setConvertirCamposOrden(prev => ({
                            ...prev,
                            [key]: { ...prev[key], valor: nuevoValor },
                          }));
                          // Invalidar búsqueda de cliente si cambia el
                          // teléfono. El campo con `onBlur: true` en el
                          // config es únicamente `clienteTelefono` — la
                          // única entrada que dispara búsqueda.
                          if (onBlur) invalidarBusquedaCliente();
                        }}
                        onBlur={onBlur ? () => void buscarClienteDesdeTelefono(m.valor) : undefined}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0f3460]/20"
                      />
                    )}
                    {m.fuenteEtiqueta && (
                      <p className="text-[10px] text-gray-400 mt-1">
                        Origen: <span className="font-mono">{m.fuenteEtiqueta}</span>
                        {m.fuenteCampoId && m.fuenteCampoId !== m.fuenteEtiqueta && (
                          <span> ({m.fuenteCampoId})</span>
                        )}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* GPS preservado */}
            {convertirCoords ? (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-start gap-2 text-xs text-green-800">
                <MapPin size={14} className="mt-0.5" />
                <span>
                  Coordenadas del formulario preservadas:{' '}
                  <code className="bg-white px-1 rounded">
                    {convertirCoords.lat.toFixed(6)}, {convertirCoords.lng.toFixed(6)}
                  </code>
                </span>
              </div>
            ) : (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 flex items-start gap-2 text-xs text-gray-600">
                <MapPin size={14} className="mt-0.5" />
                <span>
                  Esta solicitud no trajo coordenadas GPS válidas. La orden nace sin ubicación
                  en el mapa (se puede agregar después).
                </span>
              </div>
            )}

            {/* Acciones */}
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
              <button
                type="button"
                onClick={cerrarConvertir}
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmarConversion}
                disabled={converting || convertirBuscandoCliente || !!convertirErrorBusquedaCliente}
                title={convertirBuscandoCliente
                  ? 'Esperá a que termine la búsqueda de cliente'
                  : convertirErrorBusquedaCliente
                    ? 'Reintentá la búsqueda antes de confirmar'
                    : undefined}
                className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {converting ? 'Convirtiendo…' : 'Crear orden'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
