import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, CheckCircle2, Send, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
  ConfigFormularioAgendar,
  CONFIG_FORMULARIO_AGENDAR_DEFAULTS,
} from '../../types/configFormularioAgendar';
import {
  enviarSolicitudCita,
  suscribirConfigFormularioAgendar,
} from '../../services/formularioAgendar.service';
import { normalizarTelefono } from '../../services/clientes.service';
import { storage } from '../../firebase/config';
import { comprimirImagen } from '../../utils/imagen';
import WhatsAppIcon from '../icons/WhatsAppIcon';
import { useConfigWeb, getWhatsAppUrl } from '../../hooks/useConfigWeb';
import LoadingSpinner from '../LoadingSpinner';
import CampoDireccionConPlaces from '../shared/CampoDireccionConPlaces';
import { obtenerModelosDeTipo } from '../../utils/modelosEquipo';
import { TIPOS_EQUIPO_FALLBACK } from '../../utils/tiposEquipoFallback';

// Mobile-first: text-base evita el zoom automático de Safari iOS al
// enfocar inputs (Safari hace zoom si la fuente es <16px). min-h-[44px]
// cumple el target táctil mínimo de Apple HIG.
const inputClass =
  'w-full px-4 py-3 border border-gray-200 rounded-lg text-base min-h-[44px] focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1.5';

interface FormState {
  clienteNombre: string;
  telefono: string;
  clienteEmail: string;
  clienteDireccion: string;
  /** Lat/lng capturados por Places, "Mi ubicación" o URL pegada. */
  clienteLat?: number;
  clienteLng?: number;
  clienteSector: string;
  equipoTipo: string;
  equipoMarca: string;
  /**
   * Modelo elegido del catálogo configurable (ej: 'Torre', 'Individual',
   * 'French door', 'Split'). Si el tipo no tiene modelos definidos, se usa
   * como input texto libre.
   */
  equipoModelo: string;
  falla: string;
  fechaSolicitada: string;
  horaSolicitada: string;
  /** Map { campoId: valor } para campos personalizados */
  custom: Record<string, string>;
  /** Honeypot anti-bots */
  hp: string;
}

const FORM_INITIAL: FormState = {
  clienteNombre: '',
  telefono: '',
  clienteEmail: '',
  clienteDireccion: '',
  clienteLat: undefined,
  clienteLng: undefined,
  clienteSector: '',
  equipoTipo: '',
  equipoMarca: '',
  equipoModelo: '',
  falla: '',
  fechaSolicitada: '',
  horaSolicitada: '',
  custom: {},
  hp: '',
};

interface DatosMensajeWhatsApp {
  nombre: string;
  telefono: string;
  email?: string;
  direccion?: string;
  sector?: string;
  equipoTipo: string;
  equipoMarca?: string;
  equipoModelo?: string;
  falla: string;
  fechaSolicitada?: string;
  horaSolicitada?: string;
}

/**
 * Sanitiza un texto del cliente reemplazando los caracteres que WhatsApp
 * interpreta como markdown (`*`, `_`, `~`, `` ` ``) por un espacio. Si el
 * cliente escribe `*urgente*` en su nombre o falla, esos asteriscos
 * romperían el formato del mensaje pre-llenado (WhatsApp lo renderizaría
 * como negrita y partiría las etiquetas que ponemos nosotros). Reemplazar
 * por espacio en vez de escapar mantiene el texto legible y evita ruido
 * visual con caracteres `\`.
 *
 * IMPORTANTE: aplicar SOLO a valores que vienen del cliente (nombre,
 * dirección, falla, etc.). Las etiquetas fijas que escribimos nosotros
 * (`*Teléfono:*`, `*Equipo:*`, ...) se quedan como están porque ahí sí
 * queremos que WhatsApp aplique formato.
 */
function escaparWhatsAppMarkdown(texto: string | undefined): string {
  if (!texto) return '';
  return texto.replace(/([*_~`])/g, ' ');
}

/**
 * Construye el mensaje pre-llenado de WhatsApp con toda la info del form
 * para que el agente que recibe pueda ir directo a confirmar la cita en
 * /admin/citas sin pedirle datos al cliente.
 *
 * Usa formato `*bold*` que WhatsApp renderiza, viñetas Unicode `•`, y
 * sin emojis literales (consistente con la convención del proyecto).
 *
 * Todos los valores que provienen del cliente se pasan por
 * `escaparWhatsAppMarkdown` para que `*`, `_`, `~`, `` ` `` no rompan el
 * render del mensaje.
 */
function construirMensajeWhatsApp(
  datos: DatosMensajeWhatsApp,
  camposPersonalizados: Record<string, string>,
): string {
  // Sanitizamos cada campo del cliente UNA sola vez para no repetir el
  // helper en cada interpolación. Las etiquetas fijas (negrita) NO se
  // sanitizan — esas las controlamos nosotros.
  const sNombre = escaparWhatsAppMarkdown(datos.nombre);
  const sTelefono = escaparWhatsAppMarkdown(datos.telefono);
  const sEmail = escaparWhatsAppMarkdown(datos.email);
  const sDireccion = escaparWhatsAppMarkdown(datos.direccion);
  const sSector = escaparWhatsAppMarkdown(datos.sector);
  const sEquipoTipo = escaparWhatsAppMarkdown(datos.equipoTipo);
  const sEquipoMarca = escaparWhatsAppMarkdown(datos.equipoMarca);
  const sEquipoModelo = escaparWhatsAppMarkdown(datos.equipoModelo);
  const sFalla = escaparWhatsAppMarkdown(datos.falla);
  const sFecha = escaparWhatsAppMarkdown(datos.fechaSolicitada);
  const sHora = escaparWhatsAppMarkdown(datos.horaSolicitada);

  // Sufijo del equipo: si el cliente eligió un modelo del catálogo
  // (ej: 'Torre', 'French door'), lo agregamos entre paréntesis.
  const sufijoEquipo = sEquipoModelo ? ` (${sEquipoModelo})` : '';

  const lineas: (string | null)[] = [
    `Hola, soy *${sNombre}* y acabo de enviar una solicitud de cita por la web.`,
    ``,
    `*Teléfono:* ${sTelefono}`,
    sEmail ? `*Email:* ${sEmail}` : null,
    ``,
    sDireccion ? `*Dirección:* ${sDireccion}` : null,
    sSector ? `*Sector:* ${sSector}` : null,
    ``,
    `*Equipo:* ${sEquipoTipo}${sEquipoMarca ? ' ' + sEquipoMarca : ''}${sufijoEquipo}`,
    `*Falla reportada:* ${sFalla}`,
    ``,
    `*Fecha preferida:* ${sFecha || 'No especificada'}`,
    `*Hora preferida:* ${sHora || 'No especificada'}`,
  ];

  if (
    camposPersonalizados &&
    Object.keys(camposPersonalizados).length > 0
  ) {
    lineas.push('', '*Información adicional:*');
    for (const [key, value] of Object.entries(camposPersonalizados)) {
      // El `key` es el label del campo (lo escribió el admin, no el
      // cliente) — no necesita sanitización. El `value` SÍ viene del
      // cliente.
      lineas.push(`• ${key}: ${escaparWhatsAppMarkdown(value)}`);
    }
  }

  lineas.push('', '_Por favor, confírmame la cita cuando puedas. Gracias._');
  return lineas.filter((l): l is string => l !== null).join('\n');
}

/**
 * Construye URL `wa.me` con prefijo internacional `1` para RD si el
 * número viene en 10 dígitos. Mismo patrón que `getWhatsAppUrl` en
 * `configWeb.service.ts`.
 */
function construirUrlWhatsAppRD(numero: string, mensaje: string): string {
  const dig = numero.replace(/\D/g, '');
  const intl = dig.length === 10 ? `1${dig}` : dig;
  return `https://wa.me/${intl}?text=${encodeURIComponent(mensaje)}`;
}

export default function FormularioAgendarPublico() {
  const { config: configWeb, loading: configWebLoading } = useConfigWeb();

  const [config, setConfig] = useState<ConfigFormularioAgendar>({
    ...CONFIG_FORMULARIO_AGENDAR_DEFAULTS,
  });
  const [configLoaded, setConfigLoaded] = useState(false);
  const [form, setForm] = useState<FormState>(FORM_INITIAL);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [resultadoWhatsApp, setResultadoWhatsApp] = useState<{
    url: string;
    nombre: string;
  } | null>(null);

  // ─── Foto del equipo ───
  // Se genera un UUID al montar para trazar el path en Storage:
  // `fotos-equipos-publico/{citaIdProvisional}/equipo-{ts}.jpg`. El UUID
  // también se persiste en el doc de cita para auditoría.
  const [citaIdProvisional] = useState<string>(() => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    // Fallback (browsers muy antiguos)
    return `cp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  });
  const [fotoEquipoUrl, setFotoEquipoUrl] = useState<string | undefined>(undefined);
  const [fotoSubiendo, setFotoSubiendo] = useState(false);
  const fotoInputRef = useRef<HTMLInputElement | null>(null);

  // Ref al contenedor de la pantalla de éxito. Se usa como fallback al
  // `window.scrollTo` por si algún ancestro tiene `overflow: hidden` o
  // scroll local que impida que el scroll del window mueva el viewport.
  const successContainerRef = useRef<HTMLDivElement | null>(null);

  const handleFotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset el value del input para que volver a seleccionar el mismo archivo
    // dispare el onChange (Chrome/Safari ignoran si el value no cambia).
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Selecciona un archivo de imagen');
      return;
    }

    setFotoSubiendo(true);
    let blob: Blob = file;
    try {
      blob = await comprimirImagen(file, { maxBytes: 1_000_000, maxDim: 1600 });
    } catch (err) {
      console.warn('Compresión client-side falló, se intenta subir el original:', err);
      // Fallback: si la imagen es muy pesada y no la pudimos comprimir,
      // avisamos pero seguimos. No bloqueamos al usuario.
      if (file.size > 3 * 1024 * 1024) {
        // Sin `icon` literal — la convención del proyecto es no usar emojis
        // hardcodeados (se corrompen al pasar por encoding en algunos
        // contextos). El toast por defecto ya tiene su propio styling.
        toast(
          'No se pudo optimizar la foto. Subiendo original (puede tardar más).',
          { duration: 4000 },
        );
      }
    }

    try {
      // Nombre FIJO `equipo.jpg` por sesión: si el cliente toma foto, decide
      // cambiarla y toma otra, el upload sobrescribe la anterior en el mismo
      // path en lugar de acumular huérfanos en Storage. Cada sesión tiene su
      // propio `citaIdProvisional` (UUID), así que no hay colisión entre
      // distintos clientes.
      const filename = 'equipo.jpg';
      const path = `fotos-equipos-publico/${citaIdProvisional}/${filename}`;
      const ref = storageRef(storage, path);
      await uploadBytes(ref, blob, { contentType: 'image/jpeg' });
      const url = await getDownloadURL(ref);
      setFotoEquipoUrl(url);
    } catch (err) {
      console.error('Upload de foto del equipo falló:', err);
      toast.error('No se pudo subir la foto, continúa sin ella');
      setFotoEquipoUrl(undefined);
    } finally {
      setFotoSubiendo(false);
    }
  };

  const handleQuitarFoto = () => {
    setFotoEquipoUrl(undefined);
    // Nota: NO borramos el archivo en Storage — las reglas no permiten
    // delete desde el cliente público y tampoco vale la pena. El blob
    // queda huérfano y se limpia con un cron eventual si hace falta.
  };

  // Reactivo: si el cliente cambia el tipo de equipo después de elegir un
  // modelo, limpiamos `equipoModelo` porque las opciones del catálogo
  // (o el modo texto libre) cambian con el tipo. Usamos una ref para
  // detectar el cambio real y NO limpiar en el mount inicial (donde
  // equipoTipo va de '' a un valor válido — no es una "edición").
  const tipoEquipoPrevRef = useRef<string>('');
  useEffect(() => {
    const prev = tipoEquipoPrevRef.current;
    const actual = form.equipoTipo;
    if (prev && prev !== actual && form.equipoModelo) {
      setForm((p) => ({ ...p, equipoModelo: '' }));
    }
    tipoEquipoPrevRef.current = actual;
    // Solo nos interesa reaccionar al cambio de tipo — no incluimos
    // equipoModelo para evitar bucles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.equipoTipo]);

  // Suscripción a config — los cambios del admin se reflejan en vivo
  useEffect(() => {
    const unsub = suscribirConfigFormularioAgendar(c => {
      setConfig(c);
      setConfigLoaded(true);
    });
    return () => unsub();
  }, []);

  // Al transitar a la pantalla de éxito, scroll al tope del viewport para
  // que el cliente vea el check verde y el CTA de WhatsApp en mobile (de
  // otra forma queda en la posición del footer del form). El timeout de
  // 50ms da tiempo a React a montar el nuevo árbol antes del scrollIntoView.
  useEffect(() => {
    if (!success) return;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const t = window.setTimeout(() => {
      successContainerRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }, 50);
    return () => window.clearTimeout(t);
  }, [success]);

  // Tipos de equipo: leemos desde `config_web/sitio.tiposEquipoPublicos`
  // (lectura pública garantizada). El admin sincroniza esta lista cuando
  // edita los tipos en /admin/configuracion. Si el doc no tiene aún el
  // campo (instalación nueva), usamos fallback hardcoded.
  const tiposEquipo = useMemo<string[]>(() => {
    const lista = configWeb?.tiposEquipoPublicos;
    if (Array.isArray(lista) && lista.length > 0) return lista;
    return TIPOS_EQUIPO_FALLBACK;
  }, [configWeb]);

  // Catálogo de modelos por tipo (configurable). Usa defaults sensatos si
  // el admin nunca tocó la sección — así el form sigue funcionando sin
  // requerir lazy-init en Firestore.
  const catalogoModelos = useMemo<{ [tipo: string]: string[] }>(() => {
    const fromConfig = configWeb?.modelosPorTipoEquipo;
    if (fromConfig && Object.keys(fromConfig).length > 0) return fromConfig;
    return {
      'Lavadora': ['Torre', 'Individual'],
      'Nevera': ['Side-by-side', 'French door', 'Top freezer', 'Mini bar'],
      'Estufa': ['Eléctrica', 'Gas', 'Mixta'],
      'Aire Acondicionado': ['Split', 'Ventana', 'Portátil', 'Cassette'],
      'Secadora': ['Torre', 'Individual'],
    };
  }, [configWeb]);

  const modelosDisponibles = useMemo(
    () => obtenerModelosDeTipo(form.equipoTipo, catalogoModelos),
    [form.equipoTipo, catalogoModelos],
  );

  // Hoy en formato YYYY-MM-DD para `min` del input date
  const hoy = useMemo(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }, []);

  const habilitado = config.habilitado ?? true;
  const mostrarSector = config.mostrarCampoSector ?? true;
  const camposPersonalizados = config.camposPersonalizados ?? [];
  // Defensivo: si alguien edita el doc directo en Firestore Console y deja
  // `bloquesHora` como array vacío, la UI no debe romperse. La validación
  // del editor (admin) impide guardar vacío, pero esto es defense-in-depth.
  // Logueamos un warn para que devops note la inconsistencia.
  const bloquesHora = useMemo<string[]>(() => {
    const desdeConfig = config.bloquesHora;
    if (Array.isArray(desdeConfig) && desdeConfig.length > 0) return desdeConfig;
    if (configLoaded) {
      console.warn(
        '[FormularioAgendarPublico] bloquesHora vino vacío o ausente — usando default.',
      );
    }
    return CONFIG_FORMULARIO_AGENDAR_DEFAULTS.bloquesHora;
  }, [config.bloquesHora, configLoaded]);

  const update = (partial: Partial<FormState>) => {
    setForm(prev => ({ ...prev, ...partial }));
  };

  const updateCustom = (id: string, valor: string) => {
    setForm(prev => ({
      ...prev,
      custom: { ...prev.custom, [id]: valor },
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Cerrar la ventana de race para doble-click: guard explícito + flip
    // del state al inicio absoluto del handler, antes de cualquier validación.
    if (submitting) return;
    setSubmitting(true);

    try {
      // Validaciones client-side (defense in depth — el service también valida)
      const nombre = form.clienteNombre.trim();
      if (!nombre) {
        toast.error('Ingresa tu nombre completo');
        return;
      }
      const telNorm = normalizarTelefono(form.telefono);
      if (telNorm.length !== 10) {
        toast.error('El teléfono debe tener 10 dígitos (ej: 809-555-1234)');
        return;
      }
      if (!form.equipoTipo) {
        toast.error('Selecciona el tipo de equipo');
        return;
      }
      if (form.falla.trim().length < 10) {
        toast.error('Describe el problema con al menos 10 caracteres');
        return;
      }
      if (form.clienteEmail) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(form.clienteEmail.trim())) {
          toast.error('El email no es válido');
          return;
        }
      }
      // Validar fecha solo si está llena
      if (form.fechaSolicitada) {
        const dia = new Date(form.fechaSolicitada + 'T00:00:00').getDay();
        if (dia === 0) {
          toast.error('Los domingos no atendemos. Escoge otro día.');
          return;
        }
      }

      // Validar campos personalizados requeridos
      for (const c of camposPersonalizados) {
        if (c.requerido) {
          const v = form.custom[c.id];
          if (!v || !v.trim()) {
            toast.error(`Completa el campo "${c.label}"`);
            return;
          }
        }
      }

      // Construir map de personalizados con `id` permanente como key. Si el
      // admin renombra el label de un campo (ej: "Marca preferida" →
      // "Marca favorita"), los datos históricos siguen ligados a su campo
      // gracias al id estable. El render en /admin/citas y los modales de
      // orden buscan el `label` actual en config a partir del id (ver
      // `OrdenCreateModal.tsx` y `OrdenDetailModal.tsx`).
      const customPorId: Record<string, string> = {};
      // Versión con label-as-key para el mensaje de WhatsApp, donde el
      // staff que recibe NO tiene acceso a la config y necesita ver la
      // etiqueta humana.
      const customConLabels: Record<string, string> = {};
      for (const c of camposPersonalizados) {
        const v = form.custom[c.id];
        if (typeof v === 'string' && v.trim().length > 0) {
          customPorId[c.id] = v.trim();
          customConLabels[c.label] = v.trim();
        }
      }

      // El "modelo" se guarda directamente desde el catálogo configurable
      // (ej: 'Torre', 'Individual', 'French door'). Si el tipo no tenía
      // modelos definidos, viene como texto libre desde el input.
      const equipoModeloFinal = form.equipoModelo.trim() || undefined;

      const res = await enviarSolicitudCita({
        clienteNombre: nombre,
        telefono: form.telefono.trim(),
        clienteEmail: form.clienteEmail.trim() || undefined,
        clienteDireccion: form.clienteDireccion.trim() || undefined,
        clienteLat: typeof form.clienteLat === 'number' ? form.clienteLat : undefined,
        clienteLng: typeof form.clienteLng === 'number' ? form.clienteLng : undefined,
        clienteSector: mostrarSector
          ? form.clienteSector.trim() || undefined
          : undefined,
        equipoTipo: form.equipoTipo,
        equipoMarca: form.equipoMarca.trim() || undefined,
        equipoModelo: equipoModeloFinal,
        falla: form.falla.trim(),
        fechaSolicitada: form.fechaSolicitada || undefined,
        horaSolicitada: form.horaSolicitada || undefined,
        camposPersonalizados:
          Object.keys(customPorId).length > 0 ? customPorId : undefined,
        honeypot: form.hp,
        fotoEquipoUrl: fotoEquipoUrl || undefined,
        citaIdProvisional,
      });

      if (!res.ok) {
        // Caso especial: anti-duplicado por teléfono en las últimas 24h.
        // No es un error técnico — es esperado si ya enviaron antes.
        if (res.error === 'duplicado_24h') {
          // Sin `icon` literal — convención del proyecto.
          toast(
            res.mensaje ||
              'Ya recibimos tu solicitud reciente. Te contactaremos pronto.',
            { duration: 5000 },
          );
          // Limpiamos el form para que no se quede el botón "Enviando" ni
          // confundan al usuario; pero NO mostramos la pantalla de éxito
          // porque no creamos nada nuevo.
          setForm(FORM_INITIAL);
          setFotoEquipoUrl(undefined);
          return;
        }
        toast.error(res.error || 'No pudimos registrar tu solicitud');
        return;
      }

      // Si el round-robin asignó un número, construimos URL pre-llenada
      // con todos los datos del form para que el agente pueda confirmar
      // sin pedir nada extra al cliente.
      if (res.whatsappAsignado) {
        const mensaje = construirMensajeWhatsApp(
          {
            nombre,
            telefono: form.telefono.trim(),
            email: form.clienteEmail.trim() || undefined,
            direccion: form.clienteDireccion.trim() || undefined,
            sector: mostrarSector
              ? form.clienteSector.trim() || undefined
              : undefined,
            equipoTipo: form.equipoTipo,
            equipoMarca: form.equipoMarca.trim() || undefined,
            equipoModelo: equipoModeloFinal,
            falla: form.falla.trim(),
            fechaSolicitada: form.fechaSolicitada || undefined,
            horaSolicitada: form.horaSolicitada || undefined,
          },
          customConLabels,
        );
        const url = construirUrlWhatsAppRD(res.whatsappAsignado, mensaje);
        setResultadoWhatsApp({
          url,
          nombre: res.whatsappAsignadoNombre || 'nuestro coordinador',
        });
      } else {
        setResultadoWhatsApp(null);
      }

      setSuccess(true);
      setForm(FORM_INITIAL);
      setFotoEquipoUrl(undefined);
    } catch (err) {
      console.error(err);
      toast.error('Ocurrió un error. Inténtalo de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Render ───────────────────────────────────────────

  if (!configLoaded) {
    return (
      <div className="py-12">
        <LoadingSpinner text="Cargando..." />
      </div>
    );
  }

  // Pantalla cuando el form está apagado
  if (!habilitado) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
        <h2 className="text-xl font-bold text-gray-900 mb-3">
          Agendamiento temporalmente cerrado
        </h2>
        <p className="text-gray-500 text-sm mb-6 max-w-md mx-auto">
          {config.mensajeDeshabilitado ??
            CONFIG_FORMULARIO_AGENDAR_DEFAULTS.mensajeDeshabilitado}
        </p>
        <a
          href={getWhatsAppUrl(configWeb, 'Hola, quiero agendar una cita')}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 bg-green-500 text-white px-6 py-3 rounded-xl font-semibold text-sm hover:bg-green-600 transition-colors"
        >
          <WhatsAppIcon filled={false} className="text-white" size={16} />{' '}
          Escribir por WhatsApp
        </a>
      </div>
    );
  }

  // Pantalla de éxito
  if (success) {
    return (
      <div
        ref={successContainerRef}
        className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center"
      >
        <CheckCircle2 size={56} className="mx-auto text-green-500 mb-4" />
        <h2 className="text-2xl font-bold text-gray-900 mb-3">
          ¡Solicitud recibida!
        </h2>
        {resultadoWhatsApp ? (
          <>
            <p className="text-gray-600 text-sm mb-8 max-w-md mx-auto">
              Hemos registrado tu solicitud. Para agilizar la confirmación,
              envía un mensaje de WhatsApp a{' '}
              <span className="font-semibold text-gray-800">
                {resultadoWhatsApp.nombre}
              </span>
              .
            </p>
            <a
              href={resultadoWhatsApp.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-3 bg-green-500 hover:bg-green-600 text-white text-lg font-semibold px-8 py-4 rounded-xl shadow-lg transition"
            >
              <WhatsAppIcon filled={false} className="text-white" size={22} />
              Abrir WhatsApp para confirmar
            </a>
            <p className="text-xs text-gray-400 mt-6">
              Si no tienes WhatsApp, te llamaremos al teléfono que registraste.
            </p>
          </>
        ) : (
          <p className="text-gray-600 text-sm mb-6 max-w-md mx-auto">
            {config.mensajeExito ??
              CONFIG_FORMULARIO_AGENDAR_DEFAULTS.mensajeExito}
          </p>
        )}
        <div className="mt-8">
          <button
            type="button"
            onClick={() => {
              setSuccess(false);
              setResultadoWhatsApp(null);
            }}
            className="inline-flex items-center justify-center gap-2 bg-primary text-white px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-primary-medium transition-colors"
          >
            Enviar otra solicitud
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      // pb-20 sm:pb-8: padding inferior defensivo para que el botón submit
      // no quede tapado por elementos flotantes (botón WhatsApp, barras
      // del browser en mobile, etc.). En desktop (sm+) reducimos al
      // espaciado normal.
      className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 md:p-8 pb-20 sm:pb-8 space-y-5"
      autoComplete="on"
    >
      {/* Honeypot — invisible para humanos, visible para bots */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: '-9999px',
          width: '1px',
          height: '1px',
          overflow: 'hidden',
        }}
      >
        <label>
          No llenar este campo
          <input
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={form.hp}
            onChange={e => update({ hp: e.target.value })}
          />
        </label>
      </div>

      {/* Datos del cliente */}
      <div>
        <label className={labelClass}>
          Nombre completo <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          className={inputClass}
          value={form.clienteNombre}
          onChange={e => update({ clienteNombre: e.target.value })}
          placeholder="Juan Pérez"
          required
          autoComplete="name"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>
            Teléfono <span className="text-red-500">*</span>
          </label>
          <input
            type="tel"
            className={inputClass}
            value={form.telefono}
            onChange={e => update({ telefono: e.target.value })}
            placeholder="809-555-1234"
            required
            autoComplete="tel"
          />
        </div>
        <div>
          <label className={labelClass}>Email</label>
          <input
            type="email"
            className={inputClass}
            value={form.clienteEmail}
            onChange={e => update({ clienteEmail: e.target.value })}
            placeholder="tu@email.com"
            autoComplete="email"
          />
        </div>
      </div>

      <div className={mostrarSector ? 'grid grid-cols-1 md:grid-cols-2 gap-4' : ''}>
        <div>
          <label className={labelClass}>
            Dirección
            <span className="ml-2 text-xs text-gray-400 font-normal">
              (Busca en Google, pega URL de Maps o usa &quot;Mi ubicación&quot;)
            </span>
          </label>
          <CampoDireccionConPlaces
            valor={form.clienteDireccion}
            lat={form.clienteLat}
            lng={form.clienteLng}
            onChange={datos =>
              update({
                clienteDireccion: datos.direccion,
                clienteLat: datos.lat,
                clienteLng: datos.lng,
              })
            }
            placeholder="Busca un lugar (Agora Mall, Plaza Central...) o tu dirección"
            inputClassName={inputClass}
          />
        </div>
        {mostrarSector && (
          <div>
            <label className={labelClass}>Sector / Barrio</label>
            <input
              type="text"
              className={inputClass}
              value={form.clienteSector}
              onChange={e => update({ clienteSector: e.target.value })}
              placeholder="Naco, Bella Vista..."
            />
          </div>
        )}
      </div>

      {/* Equipo */}
      <div className="border-t border-gray-100 pt-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">
          Sobre el equipo
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>
              Tipo de equipo <span className="text-red-500">*</span>
            </label>
            {/*
              autoComplete="off" + name no-estandar evita que Chrome pre-
              seleccione un tipo via autofill heuristic (Chrome matchea por
              label text aunque el form tenga autoComplete="on" arriba).
              Sintoma observado: el select arrancaba preseleccionado en
              "Microondas" en incognito antes de este fix.
            */}
            <select
              className={inputClass}
              name="cita-equipo-tipo-no-autofill"
              autoComplete="off"
              value={form.equipoTipo}
              onChange={e => update({ equipoTipo: e.target.value })}
              required
              disabled={configWebLoading}
            >
              <option value="">
                {configWebLoading ? 'Cargando...' : 'Selecciona...'}
              </option>
              {tiposEquipo.map(t => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Marca</label>
            <input
              type="text"
              className={inputClass}
              value={form.equipoMarca}
              onChange={e => update({ equipoMarca: e.target.value })}
              placeholder="LG, Samsung, Mabe..."
            />
          </div>
        </div>

        <div className="mt-4">
          <label className={labelClass}>Modelo</label>
          {modelosDisponibles.length > 0 ? (
            <select
              className={inputClass}
              value={form.equipoModelo}
              onChange={e => update({ equipoModelo: e.target.value })}
            >
              <option value="">Selecciona configuración (opcional)</option>
              {modelosDisponibles.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              className={inputClass}
              value={form.equipoModelo}
              onChange={e => update({ equipoModelo: e.target.value })}
              placeholder="Modelo específico (opcional)"
            />
          )}
        </div>

        <div className="mt-4">
          <label className={labelClass}>
            ¿Qué problema tiene tu equipo?{' '}
            <span className="text-red-500">*</span>
          </label>
          <textarea
            className={`${inputClass} min-h-[100px] resize-y`}
            value={form.falla}
            onChange={e => update({ falla: e.target.value })}
            placeholder="Describe brevemente la falla (mínimo 10 caracteres)..."
            required
            minLength={10}
          />
        </div>

        {/* Foto del equipo */}
        <div className="mt-4">
          <label className={`${labelClass} inline-flex items-center gap-1.5`}>
            <Camera size={14} />
            Foto del equipo (opcional)
          </label>
          <p className="text-xs text-gray-500 mb-2">
            Ayuda al técnico a identificar el equipo antes de llegar.
          </p>

          {!fotoEquipoUrl && (
            <button
              type="button"
              onClick={() => fotoInputRef.current?.click()}
              disabled={fotoSubiendo}
              className="inline-flex items-center gap-2 px-4 py-3 min-h-[44px] bg-blue-50 hover:bg-blue-100 text-[#1a5fa8] rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
            >
              <Camera size={16} />
              {fotoSubiendo ? 'Subiendo...' : 'Tomar/Subir foto del equipo'}
            </button>
          )}

          {fotoEquipoUrl && (
            <div className="flex items-start gap-3">
              <img
                src={fotoEquipoUrl}
                alt="Foto del equipo"
                className="w-[150px] h-[150px] object-cover rounded-lg border border-gray-300"
              />
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={handleQuitarFoto}
                  className="inline-flex items-center gap-1 px-3 py-2 min-h-[40px] text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                >
                  <X size={12} /> Quitar
                </button>
                <button
                  type="button"
                  onClick={() => fotoInputRef.current?.click()}
                  disabled={fotoSubiendo}
                  className="inline-flex items-center gap-1 px-3 py-2 min-h-[40px] text-xs font-medium text-[#1a5fa8] bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors disabled:opacity-60"
                >
                  <Camera size={12} />
                  {fotoSubiendo ? 'Subiendo...' : 'Cambiar'}
                </button>
              </div>
            </div>
          )}

          <input
            ref={fotoInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFotoChange}
            className="hidden"
          />
        </div>
      </div>

      {/* Preferencia de fecha */}
      <div className="border-t border-gray-100 pt-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">
          ¿Cuándo prefieres la visita? (opcional)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Fecha preferida</label>
            <input
              type="date"
              className={inputClass}
              value={form.fechaSolicitada}
              min={hoy}
              onChange={e => {
                const valor = e.target.value;
                if (!valor) {
                  update({ fechaSolicitada: '' });
                  return;
                }
                const dia = new Date(valor + 'T12:00:00').getDay();
                if (dia === 0) {
                  toast.error('No atendemos los domingos. Por favor elige otro día.');
                  return;
                }
                update({ fechaSolicitada: valor });
              }}
            />
            <p className="text-xs text-gray-400 mt-1">
              Lunes a sábado. Los domingos no atendemos.
            </p>
          </div>
          <div>
            <label className={labelClass}>Hora preferida</label>
            {bloquesHora.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                {bloquesHora.map(bloque => {
                  const seleccionado = form.horaSolicitada === bloque;
                  return (
                    <button
                      type="button"
                      key={bloque}
                      onClick={() => update({ horaSolicitada: bloque })}
                      className={`px-4 py-3 rounded-lg border-2 text-sm min-h-[48px] transition ${
                        seleccionado
                          ? 'border-primary bg-primary/10 text-primary font-semibold'
                          : 'border-gray-300 text-gray-700 hover:border-primary/50'
                      }`}
                    >
                      {bloque}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-400 italic">
                No hay bloques de hora configurados. Te contactaremos para
                coordinar.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Campos personalizados */}
      {camposPersonalizados.length > 0 && (
        <div className="border-t border-gray-100 pt-5 space-y-4">
          {camposPersonalizados.map(c => (
            <div key={c.id}>
              <label className={labelClass}>
                {c.label}
                {c.requerido && <span className="text-red-500"> *</span>}
              </label>
              {c.tipo === 'textarea' ? (
                <textarea
                  className={`${inputClass} min-h-[80px] resize-y`}
                  value={form.custom[c.id] ?? ''}
                  onChange={e => updateCustom(c.id, e.target.value)}
                  required={!!c.requerido}
                />
              ) : c.tipo === 'select' ? (
                <select
                  className={inputClass}
                  value={form.custom[c.id] ?? ''}
                  onChange={e => updateCustom(c.id, e.target.value)}
                  required={!!c.requerido}
                >
                  <option value="">Selecciona...</option>
                  {(c.opciones ?? []).map(op => (
                    <option key={op} value={op}>
                      {op}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  className={inputClass}
                  value={form.custom[c.id] ?? ''}
                  onChange={e => updateCustom(c.id, e.target.value)}
                  required={!!c.requerido}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Submit */}
      <div className="pt-4">
        <button
          type="submit"
          disabled={submitting}
          // py-4 px-6 + text-lg en mobile para dar espacio táctil cómodo
          // y legibilidad. min-h-[52px] asegura el target táctil incluso
          // si la tipografía base del browser cambia.
          className="w-full inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary-medium text-white px-6 py-4 min-h-[52px] rounded-xl font-semibold text-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <Send className="w-5 h-5" />
          {submitting ? 'Enviando...' : 'Enviar solicitud'}
        </button>
        <p className="text-sm text-gray-400 text-center mt-3">
          Te contactaremos en menos de 24 horas para coordinar la visita.
        </p>
      </div>

      {/* Alternativa por WhatsApp */}
      <div className="text-center pt-3 border-t border-gray-100">
        <p className="text-sm text-gray-500 mb-3">¿Prefieres contacto directo?</p>
        <a
          href={getWhatsAppUrl(configWeb, 'Hola, quiero agendar una cita')}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 bg-green-500 text-white px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-green-600 transition-colors"
        >
          <WhatsAppIcon filled={false} className="text-white" size={14} />{' '}
          Escribir por WhatsApp
        </a>
      </div>
    </form>
  );
}
