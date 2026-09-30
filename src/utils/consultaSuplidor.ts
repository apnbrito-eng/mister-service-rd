import { normalizarTelefono } from '../services/clientes.service';
import { whatsappUrl } from './whatsapp';

/**
 * Directorio de suplidores y consulta de piezas (Standby).
 * Helpers puros: no leen ni escriben Firestore y no envían mensajes.
 */

export interface SuplidorEntrada {
  nombre: string;
  telefono: string;
  especialidad: string;
  notas?: string;
}

export interface Suplidor extends SuplidorEntrada {
  id: string;
  telefonoNormalizado: string;
  activo: boolean;
}

export type ResultadoSuplidor =
  | { ok: true; datos: { nombre: string; telefono: string; telefonoNormalizado: string; especialidad: string; notas: string } }
  | { ok: false; error: string };

const limpiar = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** Valida y normaliza un suplidor antes de guardarlo. Mismo límite que la regla propuesta. */
export function validarSuplidor(entrada: Partial<SuplidorEntrada>): ResultadoSuplidor {
  const nombre = limpiar(entrada.nombre, 120);
  const especialidad = limpiar(entrada.especialidad, 120);
  const notas = typeof entrada.notas === 'string' ? entrada.notas.trim().slice(0, 500) : '';
  const telefono = limpiar(entrada.telefono, 40);
  if (nombre.length < 2) return { ok: false, error: 'Escribe el nombre del suplidor (mínimo 2 caracteres).' };
  const telefonoNormalizado = normalizarTelefono(telefono);
  if (telefonoNormalizado.length !== 10) return { ok: false, error: 'El teléfono debe ser un número dominicano válido de 10 dígitos.' };
  if (especialidad.length < 2) return { ok: false, error: 'Indica la especialidad (por ejemplo: piezas de lavadora, compresores).' };
  return { ok: true, datos: { nombre, telefono, telefonoNormalizado, especialidad, notas } };
}

const sinTildes = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Filtro por texto (nombre, especialidad o teléfono) y por activos. */
export function filtrarSuplidores(lista: Suplidor[], texto: string, incluirInactivos = false): Suplidor[] {
  const q = sinTildes(texto.trim());
  const digitos = texto.replace(/\D/g, '');
  return lista
    .filter(s => incluirInactivos || s.activo)
    .filter(s => !q
      || sinTildes(s.nombre).includes(q)
      || sinTildes(s.especialidad).includes(q)
      || (digitos.length >= 3 && s.telefonoNormalizado.includes(digitos)))
    .sort((a, b) => Number(b.activo) - Number(a.activo) || a.nombre.localeCompare(b.nombre, 'es'));
}

export interface DatosPiezaConsulta {
  piezaFaltante: string;
  equipoTipo?: string;
  equipoMarca?: string;
  equipoModelo?: string;
  detalle?: string;
}

// Teléfonos RD (809/829/849, con o sin +1) e internacionales con "+".
// No toca números de pieza: exige separación y no puede ir pegado a letras o guiones.
const PATRON_TELEFONO = /(?<![\w-])(?:\+?1[\s.-]?)?\(?8[024]9\)?[\s.-]?\d{3}[\s.-]?\d{4}(?![\w-])|(?<![\w-])\+\d(?:[\s.-]?\d){7,14}(?![\w-])|(?<![\w-])\d{3}[\s.-]\d{4}(?![\w-])/g;
const PATRON_EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/g;

/** Quita teléfonos y correos que alguien haya escrito dentro de la descripción. */
export function ocultarContactos(texto: string): { texto: string; ocultados: number } {
  let ocultados = 0;
  const limpio = texto
    .replace(PATRON_EMAIL, () => { ocultados++; return '[dato oculto]'; })
    .replace(PATRON_TELEFONO, () => { ocultados++; return '[dato oculto]'; });
  return { texto: limpio, ocultados };
}

/**
 * Mensaje para el suplidor. Solo usa pieza, equipo, marca, modelo y detalle técnico.
 * Nunca recibe nombre, teléfono, dirección ni número de orden del cliente.
 */
export function construirMensajeConsulta(datos: DatosPiezaConsulta): { mensaje: string; ocultados: number } {
  const pieza = limpiar(datos.piezaFaltante, 200);
  const equipo = [limpiar(datos.equipoTipo, 100), limpiar(datos.equipoMarca, 100)].filter(Boolean).join(' ');
  const modelo = limpiar(datos.equipoModelo, 150);
  const detalle = limpiar(datos.detalle, 500);
  const lineas = [
    'Hola, le escribimos de Mister Service RD.',
    `¿Tiene disponible esta pieza? ${pieza}`,
    equipo ? `Equipo: ${equipo}` : '',
    modelo ? `Modelo: ${modelo}` : '',
    detalle ? `Detalle: ${detalle}` : '',
    'Por favor indíquenos precio y tiempo de entrega. Gracias.',
  ].filter(Boolean);
  const r = ocultarContactos(lineas.join('\n'));
  return { mensaje: r.texto, ocultados: r.ocultados };
}

/**
 * Solo acepta fotos de piezas guardadas por la app en Firebase Storage
 * (ruta fotos-piezas/). Cualquier otro enlace se rechaza y no se abre.
 */
export function esFotoPiezaSegura(url: unknown): url is string {
  if (typeof url !== 'string' || url.length > 2048) return false;
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== 'https:' || u.hostname !== 'firebasestorage.googleapis.com' || u.username || u.password || u.port) return false;
  const m = /^\/v0\/b\/[a-z0-9._-]+\/o\/([^/]+)$/i.exec(u.pathname);
  if (!m) return false;
  let objeto: string;
  try { objeto = decodeURIComponent(m[1]); } catch { return false; }
  return /^fotos-piezas\/[\w-]+\/[\w-]+\.jpg$/.test(objeto) && u.searchParams.get('alt') === 'media';
}

/** Número de WhatsApp (con prefijo 1) o null si el teléfono no es válido para RD. */
export function numeroWhatsAppSuplidor(telefono: string): string | null {
  const n = normalizarTelefono(telefono);
  return n.length === 10 ? `1${n}` : null;
}

/** Enlace wa.me para el WhatsApp del dispositivo. Abrirlo no envía nada. */
export function enlaceWhatsAppDispositivo(telefono: string, mensaje: string): string | null {
  return numeroWhatsAppSuplidor(telefono) ? whatsappUrl(telefono, mensaje) : null;
}

export interface EstadoChatEmpresa {
  existe: boolean;
  clienteId?: string;
  ventanaAbierta: boolean;
}

/** Abrir el Inbox no envía mensajes; sin ventana el usuario debe elegir una plantilla. */
export function evaluarChatEmpresa(estado: EstadoChatEmpresa):
  | { puede: true; requierePlantilla: boolean }
  | { puede: false; motivo: string } {
  if (estado.clienteId) return { puede: false, motivo: 'Ese número está vinculado a un cliente en el Inbox. Revisa el teléfono del suplidor antes de continuar; no se mezcla con la ficha del cliente.' };
  return { puede: true, requierePlantilla: !estado.existe || !estado.ventanaAbierta };
}
