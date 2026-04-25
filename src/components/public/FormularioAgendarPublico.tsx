import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  ConfigFormularioAgendar,
  CONFIG_FORMULARIO_AGENDAR_DEFAULTS,
} from '../../types/configFormularioAgendar';
import {
  enviarSolicitudCita,
  suscribirConfigFormularioAgendar,
} from '../../services/formularioAgendar.service';
import { suscribirTiposEquipo } from '../../services/configTiposEquipo.service';
import { normalizarTelefono } from '../../services/clientes.service';
import WhatsAppIcon from '../icons/WhatsAppIcon';
import { useConfigWeb, getWhatsAppUrl } from '../../hooks/useConfigWeb';
import LoadingSpinner from '../LoadingSpinner';

const inputClass =
  'w-full px-4 py-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1.5';

interface FormState {
  clienteNombre: string;
  telefono: string;
  clienteEmail: string;
  clienteDireccion: string;
  clienteSector: string;
  equipoTipo: string;
  equipoMarca: string;
  equipoModelo: string;
  falla: string;
  fechaSolicitada: string;
  horaSolicitada: string;
  comoNosConocio: string;
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
  clienteSector: '',
  equipoTipo: '',
  equipoMarca: '',
  equipoModelo: '',
  falla: '',
  fechaSolicitada: '',
  horaSolicitada: '',
  comoNosConocio: '',
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
  comoNosConocio?: string;
}

/**
 * Construye el mensaje pre-llenado de WhatsApp con toda la info del form
 * para que el agente que recibe pueda ir directo a confirmar la cita en
 * /admin/citas sin pedirle datos al cliente.
 *
 * Usa formato `*bold*` que WhatsApp renderiza, viñetas Unicode `•`, y
 * sin emojis literales (consistente con la convención del proyecto).
 */
function construirMensajeWhatsApp(
  datos: DatosMensajeWhatsApp,
  camposPersonalizados: Record<string, string>,
): string {
  const lineas: (string | null)[] = [
    `Hola, soy *${datos.nombre}* y acabo de enviar una solicitud de cita por la web.`,
    ``,
    `*Teléfono:* ${datos.telefono}`,
    datos.email ? `*Email:* ${datos.email}` : null,
    ``,
    datos.direccion ? `*Dirección:* ${datos.direccion}` : null,
    datos.sector ? `*Sector:* ${datos.sector}` : null,
    ``,
    `*Equipo:* ${datos.equipoTipo}${datos.equipoMarca ? ' ' + datos.equipoMarca : ''}${datos.equipoModelo ? ' (' + datos.equipoModelo + ')' : ''}`,
    `*Falla reportada:* ${datos.falla}`,
    ``,
    `*Fecha preferida:* ${datos.fechaSolicitada || 'No especificada'}`,
    `*Hora preferida:* ${datos.horaSolicitada || 'No especificada'}`,
    datos.comoNosConocio ? `*¿Cómo nos conoció?* ${datos.comoNosConocio}` : null,
  ];

  if (
    camposPersonalizados &&
    Object.keys(camposPersonalizados).length > 0
  ) {
    lineas.push('', '*Información adicional:*');
    for (const [key, value] of Object.entries(camposPersonalizados)) {
      lineas.push(`• ${key}: ${value}`);
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
  const { config: configWeb } = useConfigWeb();

  const [config, setConfig] = useState<ConfigFormularioAgendar>({
    ...CONFIG_FORMULARIO_AGENDAR_DEFAULTS,
  });
  const [configLoaded, setConfigLoaded] = useState(false);
  const [tiposEquipo, setTiposEquipo] = useState<string[]>([]);
  const [form, setForm] = useState<FormState>(FORM_INITIAL);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [resultadoWhatsApp, setResultadoWhatsApp] = useState<{
    url: string;
    nombre: string;
  } | null>(null);

  // Suscripción a config — los cambios del admin se reflejan en vivo
  useEffect(() => {
    const unsub = suscribirConfigFormularioAgendar(c => {
      setConfig(c);
      setConfigLoaded(true);
    });
    return () => unsub();
  }, []);

  // Suscripción a tipos de equipo (mismo source que el admin)
  useEffect(() => {
    const unsub = suscribirTiposEquipo(setTiposEquipo);
    return () => unsub();
  }, []);

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
  const mostrarComoConocio = config.mostrarCampoComoNosConocio ?? true;
  const opcionesConocio = config.opcionesComoNosConocio ?? [];
  const camposPersonalizados = config.camposPersonalizados ?? [];
  const bloquesHora =
    config.bloquesHora ?? CONFIG_FORMULARIO_AGENDAR_DEFAULTS.bloquesHora;

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

      // Construir map de personalizados con label como key (más útil para staff)
      const customConLabels: Record<string, string> = {};
      for (const c of camposPersonalizados) {
        const v = form.custom[c.id];
        if (typeof v === 'string' && v.trim().length > 0) {
          customConLabels[c.label] = v.trim();
        }
      }

      const res = await enviarSolicitudCita({
        clienteNombre: nombre,
        telefono: form.telefono.trim(),
        clienteEmail: form.clienteEmail.trim() || undefined,
        clienteDireccion: form.clienteDireccion.trim() || undefined,
        clienteSector: mostrarSector
          ? form.clienteSector.trim() || undefined
          : undefined,
        equipoTipo: form.equipoTipo,
        equipoMarca: form.equipoMarca.trim() || undefined,
        equipoModelo: form.equipoModelo.trim() || undefined,
        falla: form.falla.trim(),
        fechaSolicitada: form.fechaSolicitada || undefined,
        horaSolicitada: form.horaSolicitada || undefined,
        comoNosConocio: mostrarComoConocio
          ? form.comoNosConocio.trim() || undefined
          : undefined,
        camposPersonalizados:
          Object.keys(customConLabels).length > 0
            ? customConLabels
            : undefined,
        honeypot: form.hp,
      });

      if (!res.ok) {
        // Caso especial: anti-duplicado por teléfono en las últimas 24h.
        // No es un error técnico — es esperado si ya enviaron antes.
        if (res.error === 'duplicado_24h') {
          toast(
            res.mensaje ||
              'Ya recibimos tu solicitud reciente. Te contactaremos pronto.',
            { icon: 'ℹ️', duration: 5000 },
          );
          // Limpiamos el form para que no se quede el botón "Enviando" ni
          // confundan al usuario; pero NO mostramos la pantalla de éxito
          // porque no creamos nada nuevo.
          setForm(FORM_INITIAL);
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
            equipoModelo: form.equipoModelo.trim() || undefined,
            falla: form.falla.trim(),
            fechaSolicitada: form.fechaSolicitada || undefined,
            horaSolicitada: form.horaSolicitada || undefined,
            comoNosConocio: mostrarComoConocio
              ? form.comoNosConocio.trim() || undefined
              : undefined,
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
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
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
      className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 md:p-8 space-y-5"
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
          <label className={labelClass}>Dirección</label>
          <input
            type="text"
            className={inputClass}
            value={form.clienteDireccion}
            onChange={e => update({ clienteDireccion: e.target.value })}
            placeholder="Calle Ej. #45, Edif. ..."
            autoComplete="street-address"
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
            <select
              className={inputClass}
              value={form.equipoTipo}
              onChange={e => update({ equipoTipo: e.target.value })}
              required
            >
              <option value="">Selecciona...</option>
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
          <input
            type="text"
            className={inputClass}
            value={form.equipoModelo}
            onChange={e => update({ equipoModelo: e.target.value })}
            placeholder="Opcional"
          />
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
              onChange={e => update({ fechaSolicitada: e.target.value })}
            />
          </div>
          <div>
            <label className={labelClass}>Hora preferida</label>
            {bloquesHora.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {bloquesHora.map(bloque => {
                  const seleccionado = form.horaSolicitada === bloque;
                  return (
                    <button
                      type="button"
                      key={bloque}
                      onClick={() => update({ horaSolicitada: bloque })}
                      className={`px-4 py-3 rounded-lg border-2 text-sm transition ${
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
              <p className="text-xs text-gray-400 italic">
                No hay bloques de hora configurados. Te contactaremos para
                coordinar.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Cómo nos conociste */}
      {mostrarComoConocio && opcionesConocio.length > 0 && (
        <div className="border-t border-gray-100 pt-5">
          <label className={labelClass}>¿Cómo nos conociste?</label>
          <select
            className={inputClass}
            value={form.comoNosConocio}
            onChange={e => update({ comoNosConocio: e.target.value })}
          >
            <option value="">Selecciona...</option>
            {opcionesConocio.map(op => (
              <option key={op} value={op}>
                {op}
              </option>
            ))}
          </select>
        </div>
      )}

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
          className="w-full inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary-medium text-white px-6 py-3.5 rounded-xl font-semibold text-base transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <Send className="w-5 h-5" />
          {submitting ? 'Enviando...' : 'Enviar solicitud'}
        </button>
        <p className="text-xs text-gray-400 text-center mt-3">
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
