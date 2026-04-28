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
  // Compat: si tiene imagenUrl viejo y NO tiene imagenFija, usar el viejo
  const imagenFija =
    typeof h.imagenFija === 'string' && h.imagenFija
      ? h.imagenFija
      : imagenUrl;

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
