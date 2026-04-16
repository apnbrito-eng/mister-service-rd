import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase/config';

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
  imagenUrl: string;
  badge: string;
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

export interface ConfigWeb {
  whatsapp: ConfigWhatsApp;
  hero: ConfigHero;
  estadisticas: ConfigEstadisticas;
  contacto: ConfigContacto;
  marcas: string[];
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
};

// ─── Referencia Firestore ────────────────────────────

const CONFIG_DOC = doc(db, 'config_web', 'sitio');

// ─── Funciones ───────────────────────────────────────

/** Lee la config web de Firestore; retorna defaults si no existe */
export async function obtenerConfigWeb(): Promise<ConfigWeb> {
  try {
    const snap = await getDoc(CONFIG_DOC);
    if (!snap.exists()) return { ...CONFIG_WEB_DEFAULTS };
    const data = snap.data();
    return {
      whatsapp: (data.whatsapp as ConfigWhatsApp) || CONFIG_WEB_DEFAULTS.whatsapp,
      hero: (data.hero as ConfigHero) || CONFIG_WEB_DEFAULTS.hero,
      estadisticas: (data.estadisticas as ConfigEstadisticas) || CONFIG_WEB_DEFAULTS.estadisticas,
      contacto: (data.contacto as ConfigContacto) || CONFIG_WEB_DEFAULTS.contacto,
      marcas: Array.isArray(data.marcas) ? (data.marcas as string[]) : CONFIG_WEB_DEFAULTS.marcas,
      updatedAt: data.updatedAt?.toDate?.() || undefined,
    };
  } catch (err) {
    console.error('Error leyendo config web:', err);
    return { ...CONFIG_WEB_DEFAULTS };
  }
}

/** Guarda la config web en Firestore */
export async function guardarConfigWeb(config: ConfigWeb): Promise<void> {
  await setDoc(CONFIG_DOC, {
    ...config,
    updatedAt: Timestamp.now(),
  });
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
