/**
 * Tipos para el formulario público de agendamiento (`/agendar`).
 *
 * El admin edita esta config desde `/admin/web` → sección
 * "Formulario de Agendamiento". Se persiste como un campo dentro
 * del doc `config_web/sitio` (mismo doc que el resto de la config
 * pública) para evitar duplicar listeners y caches.
 */

/** Tipos soportados para campos personalizados que el admin agrega al form. */
export type CampoPersonalizadoTipo = 'text' | 'textarea' | 'select';

/** Campo extra que el admin define libremente (ej: "¿Tu equipo está bajo garantía?"). */
export interface CampoPersonalizado {
  /** ID estable generado al crear (random string). Se usa como key y como
   *  llave dentro del map `camposPersonalizados` que se guarda en la cita. */
  id: string;
  /** Etiqueta visible al usuario (ej: "Marca específica del compresor"). */
  label: string;
  /** Tipo de input a renderizar. */
  tipo: CampoPersonalizadoTipo;
  /** Solo aplica si `tipo === 'select'`. */
  opciones?: string[];
  /** Si true, el form bloquea submit hasta que el campo tenga valor. */
  requerido?: boolean;
}

/**
 * Configuración editable del formulario público de agendamiento.
 * Todos los campos son opcionales para permitir merge incremental
 * desde Firestore — el render usa defaults razonables si faltan.
 */
export interface ConfigFormularioAgendar {
  /** Si false, `/agendar` muestra un mensaje de "temporalmente cerrado"
   *  con botón a WhatsApp en vez del form. */
  habilitado?: boolean;
  /** Título grande del hero. */
  tituloHero?: string;
  /** Subtítulo del hero (debajo del título). */
  subtituloHero?: string;
  /** Mensaje verde que se muestra después de un envío exitoso. */
  mensajeExito?: string;
  /** Mensaje gris que se muestra cuando `habilitado === false`. */
  mensajeDeshabilitado?: string;
  /** Si true, mostrar input "Sector" (no requerido). Default: true. */
  mostrarCampoSector?: boolean;
  /** Si true, mostrar select "¿Cómo nos conociste?". Default: true. */
  mostrarCampoComoNosConocio?: boolean;
  /** Opciones para el select de "¿Cómo nos conociste?". */
  opcionesComoNosConocio?: string[];
  /** Lista ordenada de campos extra. Render en el mismo orden del array. */
  camposPersonalizados?: CampoPersonalizado[];
}

/** Defaults razonables si la config no existe en Firestore. */
export const CONFIG_FORMULARIO_AGENDAR_DEFAULTS: Required<
  Omit<ConfigFormularioAgendar, 'camposPersonalizados'>
> & { camposPersonalizados: CampoPersonalizado[] } = {
  habilitado: true,
  tituloHero: 'Agenda tu cita',
  subtituloHero:
    'Llena este formulario y te contactaremos en menos de 24 horas para coordinar la visita.',
  mensajeExito:
    'Recibimos tu solicitud. Te contactaremos pronto para coordinar la visita.',
  mensajeDeshabilitado:
    'Agendamiento en línea temporalmente cerrado. Por favor contáctanos por WhatsApp.',
  mostrarCampoSector: true,
  mostrarCampoComoNosConocio: true,
  opcionesComoNosConocio: [
    'Google',
    'Facebook',
    'Instagram',
    'Recomendación',
    'Otro',
  ],
  camposPersonalizados: [],
};
