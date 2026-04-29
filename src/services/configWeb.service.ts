import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase/config';
import {
  ConfigFormularioAgendar,
  CONFIG_FORMULARIO_AGENDAR_DEFAULTS,
} from '../types/configFormularioAgendar';

// ─── Tipos ───────────────────────────────────────────

export interface NumeroWhatsApp {
  numero: string;
  nombre: string;
  activo: boolean;
}

export interface ConfigWhatsApp {
  numeros: NumeroWhatsApp[];
  mensajePredeterminado: string;
  rotacion: boolean;
}

export interface ConfigHero {
  titulo: string;
  tituloDestacado: string;
  subtitulo: string;
  /**
   * @deprecated Usar `imagenFija`. Se preserva en el schema solo por
   * compatibilidad con docs viejos en Firestore — el parser
   * `parseConfigHero` lo migra automáticamente a `imagenFija` en lectura.
   */
  imagenUrl: string;
  badge: string;
  /** Modo de visualización del hero. Default `'fija'` para compat. */
  modo?: 'fija' | 'carrusel';
  /** URL única usada cuando `modo === 'fija'`. */
  imagenFija?: string;
  /**
   * Lista de URLs usada cuando `modo === 'carrusel'`. Mín 2, máx 6
   * (validado en el editor admin, defensivo en runtime).
   */
  imagenesCarrusel?: string[];
  /** Intervalo en segundos entre slides del carrusel. Rango 2-10, default 3. */
  intervaloCarrusel?: number;
  /** Si true, el carrusel pausa cuando el cursor está encima. Default true. */
  pausarEnHover?: boolean;
}

export interface EstadisticaItem {
  valor: string;
  etiqueta: string;
}

export interface ConfigEstadisticas {
  experiencia: EstadisticaItem;
  servicios: EstadisticaItem;
  satisfaccion: EstadisticaItem;
  respuesta: EstadisticaItem;
  rating: string;
}

export interface ConfigContacto {
  telefono: string;
  email: string;
  direccion: string;
  horario: string;
}

/**
 * Pregunta y respuesta de FAQ asociada a una página dedicada de servicio
 * (`/servicios/:slug`).
 */
export interface ServicioFAQ {
  pregunta: string;
  respuesta: string;
}

/**
 * Detalle de un servicio dedicado. Cada uno se publica en
 * `/servicios/:slug` y se renderiza también en la card de la home.
 *
 * Las páginas se editan desde `/admin/web` → sección Servicios.
 * Los 6 slugs canónicos (`lavadoras`, `neveras`, `aires-acondicionados`,
 * `estufas-y-hornos`, `secadoras`, `otros-equipos`) vienen pre-poblados
 * en `CONFIG_WEB_DEFAULTS.servicios`.
 */
export interface ServicioDetalle {
  /** Slug canónico (sólo `[a-z0-9-]+`). Usado en la URL. */
  slug: string;
  /** Tipo de equipo asociado — matchea con `tiposEquipoPublicos`. */
  tipoEquipo: string;
  /** Título largo: ej "Reparación de Lavadoras a Domicilio". */
  titulo: string;
  /** Descripción corta para la card de home. Recomendado max 100 chars. */
  descripcionCorta: string;
  /** Descripción extendida (texto plano / markdown ligero) para la página. */
  descripcionLarga?: string;
  /** Imagen recortada para la card de home. */
  imagenCard?: string;
  /** Imagen wide para el hero de `/servicios/:slug`. */
  imagenHero?: string;
  /** Lista de problemas comunes que se reparan. */
  problemasComunes: string[];
  /** Marcas que se reparan (chips). */
  marcasReparadas: string[];
  /** Preguntas frecuentes específicas del servicio. */
  faqs: ServicioFAQ[];
  /** Tiempo estimado de reparación (texto libre). Ej "1-3 horas". */
  tiempoEstimadoReparacion?: string;
  /** Toggle visible en home + página dedicada. */
  habilitado: boolean;
  /** Orden numérico para la grilla de la home. */
  orden: number;
}

/**
 * Configuración del sistema NPS de feedback en `/tracking/:token` cuando una
 * orden se cierra (sprint feedback).
 */
export interface ConfigFeedbackNPS {
  /** Si está deshabilitado, el componente no se muestra en /tracking */
  habilitado: boolean;
  /** URL de Google Reviews / Maps a la que se redirige al promotor (9-10) */
  googleReviewsUrl?: string;
  /** Mensaje mostrado tras enviar feedback (paso "gracias") */
  mensajeAgradecimiento?: string;
  /** Mensaje preformateado del WhatsApp del detractor al contactar coordinador */
  mensajeWhatsAppDetractor?: string;
}

export interface ConfigWeb {
  whatsapp: ConfigWhatsApp;
  hero: ConfigHero;
  estadisticas: ConfigEstadisticas;
  contacto: ConfigContacto;
  marcas: string[];
  /** Configuración del formulario público de agendamiento (`/agendar`). */
  formularioAgendar?: ConfigFormularioAgendar;
  /**
   * Tipos de equipo expuestos al formulario público `/agendar`.
   * Se sincroniza desde `/admin/configuracion` cuando el admin edita la
   * lista (que vive en `config/tiposEquipo`, doc admin con reglas auth).
   * Este doc (`config_web/sitio`) tiene lectura pública, así que el form
   * público lo lee desde aquí sin chocar con PERMISSION_DENIED silencioso.
   */
  tiposEquipoPublicos?: string[];
  /**
   * Catálogo configurable de modelos por tipo de equipo. Se usa como
   * source-of-truth para renderizar dinámicamente el campo "Modelo" del
   * formulario público `/agendar` y del modal interno "Crear Orden":
   *   - Si el tipo elegido tiene modelos definidos -> dropdown.
   *   - Si la lista está vacía o no existe -> input texto libre.
   * Editado desde `/admin/configuracion`. Lectura pública garantizada por
   * vivir en este mismo doc.
   */
  modelosPorTipoEquipo?: { [tipoEquipo: string]: string[] };
  /**
   * Configuración del sistema NPS de feedback al cerrar orden (sprint
   * feedback). Lectura pública desde `/tracking/:token`, edición admin
   * desde `/admin/web`.
   */
  feedbackNPS?: ConfigFeedbackNPS;
  /**
   * Catálogo de páginas dedicadas por servicio. Indexado por slug. Las
   * cards de la home iteran sobre los servicios habilitados ordenados
   * por `orden`. Las páginas viven en `/servicios/:slug`. Se pre-puebla
   * con 6 servicios canónicos en `CONFIG_WEB_DEFAULTS.servicios`.
   */
  servicios?: { [slug: string]: ServicioDetalle };
  updatedAt?: Date;
}

// ─── Valores por defecto ─────────────────────────────

export const CONFIG_WEB_DEFAULTS: ConfigWeb = {
  whatsapp: {
    numeros: [
      { numero: '8293897474', nombre: 'Línea 1', activo: true },
      { numero: '8092809601', nombre: 'Línea 2', activo: true },
      { numero: '8298287880', nombre: 'Línea 3', activo: true },
    ],
    mensajePredeterminado: 'Hola, necesito un servicio',
    rotacion: true,
  },
  hero: {
    titulo: 'Reparamos sus electrodomésticos',
    tituloDestacado: 'con garantía',
    subtitulo: 'Técnicos profesionales a domicilio en Santo Domingo y todo el país. Diagnóstico honesto, precios justos, seguimiento en tiempo real.',
    imagenUrl: '',
    badge: 'Servicio técnico certificado en RD',
    modo: 'fija',
    imagenFija: '',
    imagenesCarrusel: [],
    intervaloCarrusel: 3,
    pausarEnHover: true,
  },
  estadisticas: {
    experiencia: { valor: '10+', etiqueta: 'Años de experiencia' },
    servicios: { valor: '5K+', etiqueta: 'Servicios realizados' },
    satisfaccion: { valor: '98%', etiqueta: 'Clientes satisfechos' },
    respuesta: { valor: '24h', etiqueta: 'Tiempo de respuesta' },
    rating: '4.9',
  },
  contacto: {
    telefono: '(829) 389-7474',
    email: 'info@misterservicerd.com',
    direccion: 'Santo Domingo, República Dominicana',
    horario: 'Lun - Sáb: 8:00 AM - 6:00 PM',
  },
  marcas: ['LG', 'Samsung', 'Whirlpool', 'Mabe', 'GE', 'Frigidaire', 'Electrolux', 'Bosch', 'Daewoo', 'Panasonic', 'Carrier', 'Midea'],
  formularioAgendar: { ...CONFIG_FORMULARIO_AGENDAR_DEFAULTS },
  tiposEquipoPublicos: [
    'Lavadora',
    'Nevera',
    'Estufa',
    'Aire Acondicionado',
    'Microondas',
    'Secadora',
    'Otro',
  ],
  modelosPorTipoEquipo: {
    'Lavadora': ['Torre', 'Individual'],
    'Nevera': ['Side-by-side', 'French door', 'Top freezer', 'Mini bar'],
    'Estufa': ['Eléctrica', 'Gas', 'Mixta'],
    'Aire Acondicionado': ['Split', 'Ventana', 'Portátil', 'Cassette'],
    'Microondas': [],
    'Secadora': ['Torre', 'Individual'],
  },
  feedbackNPS: {
    habilitado: true,
    mensajeAgradecimiento: 'Gracias por tu feedback. Cada respuesta nos ayuda a mejorar.',
    mensajeWhatsAppDetractor:
      'Hola, tuve un servicio recientemente y quiero compartirles mi experiencia.',
  },
  servicios: {
    'lavadoras': {
      slug: 'lavadoras',
      tipoEquipo: 'Lavadora',
      titulo: 'Reparación de Lavadoras a Domicilio',
      descripcionCorta:
        'Reparación de todo tipo de lavadoras: no centrifuga, no drena, hace ruido, no enciende.',
      descripcionLarga:
        'Reparamos lavadoras de carga frontal, superior, automáticas y semiautomáticas, todas las marcas. Diagnóstico honesto, repuestos de calidad y garantía por escrito en cada servicio.',
      problemasComunes: [
        'No centrifuga / no escurre',
        'Hace ruido fuerte al lavar',
        'No drena el agua',
        'Pierde agua / gotea',
        'No enciende / no responde',
        'Marca código de error',
        'Vibra excesivamente',
        'Puerta no abre / no cierra',
      ],
      marcasReparadas: ['LG', 'Samsung', 'Whirlpool', 'Mabe', 'GE', 'Frigidaire'],
      faqs: [
        {
          pregunta: '¿Cuánto cuesta una reparación de lavadora?',
          respuesta:
            'El chequeo a domicilio es RD$2,000. Si decides reparar, se descuenta del costo total. La reparación varía según la falla.',
        },
        {
          pregunta: '¿Cuánto tarda?',
          respuesta:
            'La mayoría de reparaciones se hacen el mismo día en 1-3 horas.',
        },
        {
          pregunta: '¿Qué garantía dan?',
          respuesta:
            'Todas las reparaciones tienen Conduce de Garantía por escrito. Cubre repuestos y mano de obra.',
        },
      ],
      tiempoEstimadoReparacion: '1-3 horas',
      habilitado: true,
      orden: 1,
    },
    'neveras': {
      slug: 'neveras',
      tipoEquipo: 'Nevera',
      titulo: 'Reparación de Neveras y Refrigeradores',
      descripcionCorta:
        'No enfría, hace hielo excesivo, ruido extraño, fuga de agua. Todas las marcas.',
      descripcionLarga:
        'Diagnóstico y reparación de neveras, refrigeradores, side-by-side y congeladores de todas las marcas. Servicio a domicilio o recogida para reparaciones complejas en taller.',
      problemasComunes: [
        'No enfría correctamente',
        'Forma hielo excesivo',
        'Hace ruido extraño',
        'Fuga de agua interior',
        'Compresor no arranca',
        'Termostato defectuoso',
        'Luz interior no enciende',
        'Puerta no sella bien',
      ],
      marcasReparadas: ['LG', 'Samsung', 'Whirlpool', 'Mabe', 'GE', 'Frigidaire'],
      faqs: [
        {
          pregunta: '¿Atienden neveras side-by-side y french door?',
          respuesta:
            'Sí, tenemos experiencia en todas las configuraciones: top freezer, bottom freezer, side-by-side y french door.',
        },
        {
          pregunta: '¿Recargan gas refrigerante?',
          respuesta:
            'Sí, recargamos gas R-134a y R-600a. Antes verificamos que no haya fuga, porque sin sellado la recarga dura poco.',
        },
        {
          pregunta: '¿Qué garantía dan?',
          respuesta:
            'Cada reparación lleva Conduce de Garantía CG-#### por escrito que cubre repuestos y mano de obra.',
        },
      ],
      tiempoEstimadoReparacion: '1-3 horas',
      habilitado: true,
      orden: 2,
    },
    'aires-acondicionados': {
      slug: 'aires-acondicionados',
      tipoEquipo: 'Aire Acondicionado',
      titulo: 'Reparación e Instalación de Aires Acondicionados',
      descripcionCorta:
        'Instalación, mantenimiento preventivo, recarga de gas, limpieza profunda.',
      descripcionLarga:
        'Servicio técnico completo de aires acondicionados split, inverter, ventana, portátil y cassette. Instalación, mantenimiento preventivo, recarga de gas y limpieza profunda.',
      problemasComunes: [
        'No enfría suficiente',
        'Gotea agua dentro de la casa',
        'Hace ruido o vibración',
        'No enciende',
        'Recarga de gas refrigerante',
        'Limpieza profunda de equipos',
        'Instalación de equipos nuevos',
        'Mantenimiento preventivo',
      ],
      marcasReparadas: [
        'LG',
        'Samsung',
        'Carrier',
        'Midea',
        'Daewoo',
        'Whirlpool',
      ],
      faqs: [
        {
          pregunta: '¿Hacen instalación de aires nuevos?',
          respuesta:
            'Sí, instalamos splits y ventanas. El cliente puede traer su equipo o pedirnos cotización con todo incluido.',
        },
        {
          pregunta: '¿Cada cuánto se debe limpiar un split?',
          respuesta:
            'Recomendamos limpieza profunda cada 6 meses. Mantiene la eficiencia y evita problemas respiratorios.',
        },
        {
          pregunta: '¿Trabajan en oficinas y comercios?',
          respuesta:
            'Sí, atendemos hogares, oficinas y comercios. Para volumen alto coordinamos visitas mensuales programadas.',
        },
      ],
      tiempoEstimadoReparacion: '1-2 horas',
      habilitado: true,
      orden: 3,
    },
    'estufas-y-hornos': {
      slug: 'estufas-y-hornos',
      tipoEquipo: 'Estufa',
      titulo: 'Reparación de Estufas y Hornos',
      descripcionCorta:
        'Quemadores, hornos, encendido electrónico, válvulas de gas, resistencias.',
      descripcionLarga:
        'Servicio técnico de estufas de gas, eléctricas, mixtas, hornos y cooktops. Diagnóstico de seguridad cuando hay olor a gas, encendido electrónico, válvulas y resistencias.',
      problemasComunes: [
        'Quemador no enciende',
        'Horno no calienta',
        'Olor a gas',
        'Encendido electrónico dañado',
        'Válvula de gas defectuosa',
        'Resistencia quemada',
        'Termostato no regula',
        'Perillas dañadas',
      ],
      marcasReparadas: ['Whirlpool', 'Mabe', 'GE', 'Frigidaire', 'Samsung', 'LG'],
      faqs: [
        {
          pregunta: 'Tengo olor a gas, ¿qué hago?',
          respuesta:
            'Cierra la válvula principal del cilindro, ventila el área y NO enciendas nada eléctrico. Llámanos por WhatsApp para coordinar visita urgente.',
        },
        {
          pregunta: '¿Atienden estufas industriales?',
          respuesta:
            'Sí, también reparamos estufas comerciales. Pídenos cotización con marca y modelo del equipo.',
        },
        {
          pregunta: '¿Qué garantía dan?',
          respuesta:
            'Cada reparación lleva Conduce de Garantía CG-#### por escrito que cubre repuestos y mano de obra.',
        },
      ],
      tiempoEstimadoReparacion: '1-2 horas',
      habilitado: true,
      orden: 4,
    },
    'secadoras': {
      slug: 'secadoras',
      tipoEquipo: 'Secadora',
      titulo: 'Reparación de Secadoras',
      descripcionCorta:
        'No calienta, no gira, hace ruido, no seca correctamente. Servicio completo.',
      descripcionLarga:
        'Reparación de secadoras de ropa a gas y eléctricas, todas las marcas. Diagnóstico de resistencia, sensor de humedad, correa, motor y ventilación obstruida.',
      problemasComunes: [
        'No calienta',
        'No gira el tambor',
        'Hace ruido fuerte',
        'No seca la ropa',
        'Se apaga sola',
        'Correa rota',
        'Sensor de humedad dañado',
        'Ventilación obstruida',
      ],
      marcasReparadas: ['LG', 'Samsung', 'Whirlpool', 'Mabe', 'GE', 'Frigidaire'],
      faqs: [
        {
          pregunta: '¿Reparan secadoras a gas?',
          respuesta:
            'Sí, atendemos secadoras a gas y eléctricas. Si la falla está en la línea de gas hacemos diagnóstico de seguridad antes.',
        },
        {
          pregunta: '¿Por qué mi secadora no seca aunque calienta?',
          respuesta:
            'Generalmente es ventilación obstruida o sensor de humedad. Lo verificamos en la visita.',
        },
        {
          pregunta: '¿Qué garantía dan?',
          respuesta:
            'Cada reparación lleva Conduce de Garantía CG-#### por escrito que cubre repuestos y mano de obra.',
        },
      ],
      tiempoEstimadoReparacion: '1-3 horas',
      habilitado: true,
      orden: 5,
    },
    'otros-equipos': {
      slug: 'otros-equipos',
      tipoEquipo: 'Otro',
      titulo: 'Otros Electrodomésticos',
      descripcionCorta:
        'Microondas, dispensadores de agua, extractores y más. Consúltenos.',
      descripcionLarga:
        'También reparamos microondas, dispensadores de agua, extractores de grasa, lavavajillas y más. Si tu equipo no aparece en otra categoría, escríbenos por WhatsApp con marca y modelo y te decimos si lo atendemos.',
      problemasComunes: [
        'Microondas no calienta',
        'Dispensador no enfría agua',
        'Extractor no succiona',
        'Lavavajillas no lava bien',
        'Licuadora industrial',
        'Batidora profesional',
        'Otros equipos — consúltenos',
      ],
      marcasReparadas: ['LG', 'Samsung', 'Whirlpool', 'Mabe', 'GE', 'Panasonic'],
      faqs: [
        {
          pregunta: '¿Cómo sé si reparan mi equipo?',
          respuesta:
            'Escríbenos por WhatsApp con marca, modelo y la falla. Te confirmamos en pocas horas si podemos atenderlo.',
        },
        {
          pregunta: '¿Reparan equipos comerciales?',
          respuesta:
            'En muchos casos sí. Depende del equipo y disponibilidad de repuestos. Pídenos cotización primero.',
        },
        {
          pregunta: '¿Qué garantía dan?',
          respuesta:
            'Cada reparación lleva Conduce de Garantía CG-#### por escrito que cubre repuestos y mano de obra.',
        },
      ],
      tiempoEstimadoReparacion: '1-3 horas',
      habilitado: true,
      orden: 6,
    },
  },
};

// ─── Referencia Firestore ────────────────────────────

const CONFIG_DOC = doc(db, 'config_web', 'sitio');

// ─── Helpers internos ────────────────────────────────

/**
 * Parsea defensivamente el campo `modelosPorTipoEquipo` desde Firestore.
 * Acepta sólo objects donde cada valor sea array de strings no vacíos.
 * Retorna `undefined` si la forma no calza; el caller decide si usa
 * defaults o no para no pisar la edición del admin (puede haber dejado
 * una key vacía a propósito → input texto libre).
 */
function parseModelosPorTipoEquipo(
  raw: unknown,
): { [tipoEquipo: string]: string[] } | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: { [tipoEquipo: string]: string[] } = {};
  for (const [tipo, lista] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof tipo !== 'string' || !tipo) continue;
    if (!Array.isArray(lista)) continue;
    const limpia = lista.filter(
      (x): x is string => typeof x === 'string' && x.trim().length > 0,
    );
    out[tipo] = limpia;
  }
  return out;
}

/**
 * Parsea defensivamente el campo `hero` desde Firestore. Migra el campo
 * legacy `imagenUrl` a `imagenFija` cuando el doc viejo no tiene la nueva
 * forma. NO escribe a Firestore: la migración es solo en lectura, y se
 * persiste cuando el admin guarda con el editor nuevo.
 *
 * Defensas:
 * - `modo` solo acepta `'carrusel'` o (default) `'fija'`.
 * - `imagenesCarrusel` se filtra a strings no vacíos.
 * - `intervaloCarrusel` se clampa al rango [2, 10] (default 3 si fuera de rango / NaN).
 * - `pausarEnHover` default `true`.
 */
export function parseConfigHero(raw: unknown): ConfigHero {
  const def = CONFIG_WEB_DEFAULTS.hero;
  if (!raw || typeof raw !== 'object') return { ...def };
  const h = raw as Record<string, unknown>;

  const titulo = typeof h.titulo === 'string' ? h.titulo : def.titulo;
  const tituloDestacado =
    typeof h.tituloDestacado === 'string' ? h.tituloDestacado : def.tituloDestacado;
  const subtitulo = typeof h.subtitulo === 'string' ? h.subtitulo : def.subtitulo;
  const badge = typeof h.badge === 'string' ? h.badge : def.badge;

  const imagenUrl = typeof h.imagenUrl === 'string' ? h.imagenUrl : '';
  // Compat: solo migramos imagenUrl → imagenFija cuando el campo nuevo
  // NO existe en absoluto. Si imagenFija === '' (string vacío explícito),
  // significa que el admin lo borró deliberadamente y NO queremos resucitarlo
  // desde el campo legacy.
  const imagenFija =
    typeof h.imagenFija === 'string' ? h.imagenFija : imagenUrl;

  const modo: 'fija' | 'carrusel' = h.modo === 'carrusel' ? 'carrusel' : 'fija';

  const imagenesCarrusel = Array.isArray(h.imagenesCarrusel)
    ? (h.imagenesCarrusel as unknown[]).filter(
        (u): u is string => typeof u === 'string' && u.length > 0,
      )
    : [];

  const intervaloRaw = h.intervaloCarrusel;
  const intervaloCarrusel =
    typeof intervaloRaw === 'number' &&
    Number.isFinite(intervaloRaw) &&
    intervaloRaw >= 2 &&
    intervaloRaw <= 10
      ? intervaloRaw
      : 3;

  const pausarEnHover = h.pausarEnHover !== false; // default true

  return {
    titulo,
    tituloDestacado,
    subtitulo,
    imagenUrl,
    badge,
    modo,
    imagenFija,
    imagenesCarrusel,
    intervaloCarrusel,
    pausarEnHover,
  };
}

/**
 * Convierte texto libre a un slug válido para URL: lowercase, sin tildes,
 * espacios → guiones, descarta cualquier carácter que no sea `[a-z0-9-]`.
 * No agrega números mágicos: si dos servicios producen el mismo slug, el
 * caller debe deduplicar (el editor admin avisa).
 */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quitar diacríticos
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Parsea defensivamente una FAQ desde Firestore. Acepta sólo objetos con
 * `pregunta` y `respuesta` strings; cae al "default vacío" si la forma no
 * calza.
 */
function parseServicioFAQ(raw: unknown): ServicioFAQ | null {
  if (!raw || typeof raw !== 'object') return null;
  const f = raw as Record<string, unknown>;
  const pregunta = typeof f.pregunta === 'string' ? f.pregunta : '';
  const respuesta = typeof f.respuesta === 'string' ? f.respuesta : '';
  if (!pregunta && !respuesta) return null;
  return { pregunta, respuesta };
}

/**
 * Parsea defensivamente un único `ServicioDetalle` desde Firestore.
 * Si `raw` no es un objeto válido, retorna null y el caller usa defaults.
 * Filtra arrays a strings no vacíos. Los campos opcionales se preservan
 * como `undefined` cuando no existen (lo que `stripUndefined` luego
 * limpia antes de escribir).
 */
function parseServicioDetalle(slug: string, raw: unknown): ServicioDetalle | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;

  const titulo = typeof s.titulo === 'string' ? s.titulo : '';
  const tipoEquipo = typeof s.tipoEquipo === 'string' ? s.tipoEquipo : '';
  const descripcionCorta =
    typeof s.descripcionCorta === 'string' ? s.descripcionCorta : '';
  const descripcionLarga =
    typeof s.descripcionLarga === 'string' ? s.descripcionLarga : undefined;
  const imagenCard = typeof s.imagenCard === 'string' ? s.imagenCard : undefined;
  const imagenHero = typeof s.imagenHero === 'string' ? s.imagenHero : undefined;
  const tiempoEstimadoReparacion =
    typeof s.tiempoEstimadoReparacion === 'string'
      ? s.tiempoEstimadoReparacion
      : undefined;

  const problemasComunes = Array.isArray(s.problemasComunes)
    ? (s.problemasComunes as unknown[]).filter(
        (x): x is string => typeof x === 'string' && x.trim().length > 0,
      )
    : [];

  const marcasReparadas = Array.isArray(s.marcasReparadas)
    ? (s.marcasReparadas as unknown[]).filter(
        (x): x is string => typeof x === 'string' && x.trim().length > 0,
      )
    : [];

  const faqs = Array.isArray(s.faqs)
    ? (s.faqs as unknown[])
        .map(parseServicioFAQ)
        .filter((f): f is ServicioFAQ => f !== null)
    : [];

  const habilitado = s.habilitado !== false; // default true para no romper docs viejos
  const ordenRaw = typeof s.orden === 'number' && Number.isFinite(s.orden) ? s.orden : 999;

  return {
    slug,
    tipoEquipo,
    titulo,
    descripcionCorta,
    descripcionLarga,
    imagenCard,
    imagenHero,
    problemasComunes,
    marcasReparadas,
    faqs,
    tiempoEstimadoReparacion,
    habilitado,
    orden: ordenRaw,
  };
}

/**
 * Parsea defensivamente el campo `servicios` (mapa de slug → ServicioDetalle)
 * desde Firestore. Si el campo no existe o tiene forma inválida, retorna
 * los defaults (los 6 servicios canónicos). Patrón análogo al de
 * `tiposEquipoPublicos`: el cliente nunca escribe en lectura.
 */
export function parseConfigServicios(
  raw: unknown,
): { [slug: string]: ServicioDetalle } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...(CONFIG_WEB_DEFAULTS.servicios ?? {}) };
  }
  const out: { [slug: string]: ServicioDetalle } = {};
  for (const [slug, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof slug !== 'string' || !slug) continue;
    const parsed = parseServicioDetalle(slug, v);
    if (parsed) out[slug] = parsed;
  }
  return out;
}

// ─── Funciones ───────────────────────────────────────

/** Lee la config web de Firestore; retorna defaults si no existe */
export async function obtenerConfigWeb(): Promise<ConfigWeb> {
  try {
    const snap = await getDoc(CONFIG_DOC);
    if (!snap.exists()) return { ...CONFIG_WEB_DEFAULTS };
    const data = snap.data();
    return {
      whatsapp: (data.whatsapp as ConfigWhatsApp) || CONFIG_WEB_DEFAULTS.whatsapp,
      hero: parseConfigHero(data.hero),
      estadisticas: (data.estadisticas as ConfigEstadisticas) || CONFIG_WEB_DEFAULTS.estadisticas,
      contacto: (data.contacto as ConfigContacto) || CONFIG_WEB_DEFAULTS.contacto,
      marcas: Array.isArray(data.marcas) ? (data.marcas as string[]) : CONFIG_WEB_DEFAULTS.marcas,
      formularioAgendar:
        (data.formularioAgendar as ConfigFormularioAgendar) ||
        CONFIG_WEB_DEFAULTS.formularioAgendar,
      tiposEquipoPublicos: Array.isArray(data.tiposEquipoPublicos)
        ? (data.tiposEquipoPublicos as string[]).filter(
            (x): x is string => typeof x === 'string' && !!x,
          )
        : CONFIG_WEB_DEFAULTS.tiposEquipoPublicos,
      modelosPorTipoEquipo: parseModelosPorTipoEquipo(data.modelosPorTipoEquipo),
      feedbackNPS:
        (data.feedbackNPS as ConfigFeedbackNPS) || CONFIG_WEB_DEFAULTS.feedbackNPS,
      servicios: parseConfigServicios(data.servicios),
      updatedAt: data.updatedAt?.toDate?.() || undefined,
    };
  } catch (err) {
    console.error('Error leyendo config web:', err);
    return { ...CONFIG_WEB_DEFAULTS };
  }
}

/** Guarda la config web en Firestore (merge para no pisar campos no incluidos) */
export async function guardarConfigWeb(config: ConfigWeb): Promise<void> {
  // Firestore rechaza valores `undefined`. Como `ConfigHero` y otros tipos
  // tienen campos opcionales, hacemos un strip recursivo del payload antes
  // de escribir. (Convención #1 del proyecto.)
  const payload: Record<string, unknown> = stripUndefined({
    ...config,
    updatedAt: Timestamp.now(),
  });
  await setDoc(CONFIG_DOC, payload, { merge: true });
}

/**
 * Recursivamente elimina campos `undefined` de un objeto, preservando
 * arrays, objetos anidados, `Date` y `Timestamp` (Firestore). Necesario
 * porque Firestore rechaza `undefined` en setDoc.
 */
function stripUndefined<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map((v) => stripUndefined(v)) as unknown as T;
  }
  // Preservar tipos especiales (Date, Timestamp, otros con prototipo propio)
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value;
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue;
      out[k] = stripUndefined(v);
    }
    return out as T;
  }
  return value;
}

/**
 * Sincroniza la lista de tipos de equipo al doc público `config_web/sitio`
 * para que el formulario público `/agendar` pueda leerla sin chocar con
 * las reglas auth del doc admin `config/tiposEquipo`. Llamar después de
 * cada `actualizarTiposEquipo` desde la pantalla de configuración.
 */
export async function sincronizarTiposEquipoPublicos(
  lista: string[],
): Promise<void> {
  const listaLimpia = lista.filter(
    (x): x is string => typeof x === 'string' && x.trim().length > 0,
  );
  await setDoc(
    CONFIG_DOC,
    {
      tiposEquipoPublicos: listaLimpia,
      updatedAt: Timestamp.now(),
    },
    { merge: true },
  );
}

/**
 * Persiste el catálogo `modelosPorTipoEquipo` en `config_web/sitio`. Limpia
 * los valores antes de escribir: cada array se filtra para descartar
 * strings vacíos y trim. Las keys de tipos vacíos se preservan (significa
 * "este tipo está en el catálogo pero usa input texto libre"), así que
 * NO eliminamos arrays vacíos. Llamar desde `/admin/configuracion` cuando
 * el admin guarda cambios al editor.
 */
export async function sincronizarModelosPorTipoEquipo(
  modelosPorTipoEquipo: { [tipoEquipo: string]: string[] },
): Promise<void> {
  const limpio: { [tipoEquipo: string]: string[] } = {};
  for (const [tipo, lista] of Object.entries(modelosPorTipoEquipo)) {
    const tipoTrim = tipo.trim();
    if (!tipoTrim) continue;
    if (!Array.isArray(lista)) continue;
    limpio[tipoTrim] = lista
      .map(m => (typeof m === 'string' ? m.trim() : ''))
      .filter(m => m.length > 0);
  }
  await setDoc(
    CONFIG_DOC,
    {
      modelosPorTipoEquipo: limpio,
      updatedAt: Timestamp.now(),
    },
    { merge: true },
  );
}

/** Sube una imagen para la web pública y retorna la URL */
export async function subirImagenWeb(file: File | Blob, seccion: string): Promise<string> {
  const timestamp = Date.now();
  const path = `web-assets/${seccion}/${timestamp}.jpg`;
  const ref = storageRef(storage, path);
  await uploadBytes(ref, file);
  return await getDownloadURL(ref);
}

/** Genera la URL de WhatsApp seleccionando un número (con rotación si está activa) */
export function getWhatsAppUrl(config: ConfigWeb, mensajeOverride?: string): string {
  const activos = config.whatsapp.numeros.filter(n => n.activo);
  if (activos.length === 0) return '#';

  let numero: string;
  if (config.whatsapp.rotacion && activos.length > 1) {
    // Seleccionar uno aleatorio entre los activos
    const idx = Math.floor(Math.random() * activos.length);
    numero = activos[idx].numero;
  } else {
    numero = activos[0].numero;
  }

  // Asegurar formato internacional +1 para RD
  const digits = numero.replace(/\D/g, '');
  const intl = digits.length === 10 ? `1${digits}` : digits;
  const mensaje = mensajeOverride || config.whatsapp.mensajePredeterminado;
  return `https://wa.me/${intl}?text=${encodeURIComponent(mensaje)}`;
}

/** Variante async que lee la config y genera la URL en un solo paso */
export async function obtenerWhatsAppUrl(mensajeOverride?: string): Promise<string> {
  const config = await obtenerConfigWeb();
  return getWhatsAppUrl(config, mensajeOverride);
}
