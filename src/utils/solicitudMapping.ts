import type { CampoFormulario, SolicitudServicio } from '../types/formularios';

/**
 * Campos "canónicos" de una orden que un formulario puede alimentar al
 * convertirse. NO cubren el catálogo completo de `OrdenServicio` — solo los
 * que un formulario público puede realistícamente aportar sin invención.
 * Cualquier otro dato (técnico, precio, fecha de cita, etc.) queda a
 * discreción del admin al convertir.
 */
export type CampoOrdenMapeable =
  | 'clienteNombre'
  | 'clienteTelefono'
  | 'clienteEmail'
  | 'clienteDireccion'
  | 'clienteReferencia'
  | 'equipoTipo'
  | 'equipoMarca'
  | 'equipoModelo'
  | 'descripcionFalla';

export interface MappingResuelto {
  /** Valor auto-inferido (o `''` si no se encontró). */
  valor: string;
  /** Id del campo de la solicitud que se mapeó (para trazabilidad UI). */
  fuenteCampoId?: string;
  /** Etiqueta legible del campo mapeado. */
  fuenteEtiqueta?: string;
  /** Confianza: `alta` si vino de `tipo` estándar, `media` si vino de
   *  match por etiqueta, `baja` si es fallback por presencia del key. */
  confianza: 'alta' | 'media' | 'baja' | 'ninguna';
}

/** Normaliza etiqueta para hacer matching flexible: minúsculas, sin acentos, sin espacios extras. */
export function normalizarEtiqueta(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Patrones de etiqueta por campo canónico. El primer match gana. */
const PATRONES_ETIQUETA: Record<CampoOrdenMapeable, RegExp[]> = {
  clienteNombre: [/\bnombre\b/, /\bcliente\b/, /\bfull ?name\b/],
  clienteTelefono: [/\btelefono\b/, /\bcelular\b/, /\bmovil\b/, /\bwhatsapp\b/, /\bphone\b/],
  clienteEmail: [/\bemail\b/, /\bcorreo\b/, /\be ?mail\b/],
  clienteDireccion: [/\bdireccion\b/, /\bubicacion\b/, /\bdomicilio\b/, /\baddress\b/],
  clienteReferencia: [/\breferencia\b/, /\bpunto de referencia\b/, /\bcerca de\b/],
  equipoTipo: [/\btipo de equipo\b/, /\btipo equipo\b/, /\bequipo\b/, /\bappliance\b/, /\baparato\b/],
  equipoMarca: [/\bmarca\b/, /\bbrand\b/, /\bfabricante\b/],
  equipoModelo: [/\bmodelo\b/, /\bmodel\b/, /\bconfiguracion\b/],
  descripcionFalla: [
    /\bfalla\b/, /\bproblema\b/, /\bdescripcion\b/, /\bdetalle\b/, /\bque le pasa\b/,
    /\bissue\b/, /\bque necesita\b/, /\bservicio\b/,
  ],
};

/**
 * Prioridad por `tipo` de campo del formulario. Si un campo del formulario
 * tiene un tipo específico (email, telefono, direccion), gana sobre cualquier
 * match por etiqueta — la intención del creador del formulario es explícita.
 */
const TIPO_A_CAMPO_ORDEN: Partial<Record<CampoFormulario['tipo'], CampoOrdenMapeable>> = {
  email: 'clienteEmail',
  telefono: 'clienteTelefono',
  direccion: 'clienteDireccion',
};

/**
 * Auto-mapea los campos de una solicitud a los campos canónicos de una
 * orden usando heurísticas por `tipo` (alta confianza) y por etiqueta
 * normalizada (media). NO adivina valores — solo redirige lo que ya está
 * en `solicitud.datos`.
 *
 * El caller (Solicitudes.tsx) DEBE mostrar el resultado al admin para
 * revisión/edición antes de crear la orden. La heurística es "primer
 * intento", no "verdad".
 */
export function inferirMappingSolicitud(
  campos: CampoFormulario[],
  datos: Record<string, unknown>,
): Record<CampoOrdenMapeable, MappingResuelto> {
  const resultado: Record<CampoOrdenMapeable, MappingResuelto> = {
    clienteNombre: { valor: '', confianza: 'ninguna' },
    clienteTelefono: { valor: '', confianza: 'ninguna' },
    clienteEmail: { valor: '', confianza: 'ninguna' },
    clienteDireccion: { valor: '', confianza: 'ninguna' },
    clienteReferencia: { valor: '', confianza: 'ninguna' },
    equipoTipo: { valor: '', confianza: 'ninguna' },
    equipoMarca: { valor: '', confianza: 'ninguna' },
    equipoModelo: { valor: '', confianza: 'ninguna' },
    descripcionFalla: { valor: '', confianza: 'ninguna' },
  };

  // Pasada 1: match por `tipo` (alta confianza). Un formulario con
  // `tipo: 'telefono'` gana sobre cualquier otro campo con "teléfono"
  // en la etiqueta.
  for (const campo of campos) {
    const canonico = TIPO_A_CAMPO_ORDEN[campo.tipo];
    if (!canonico) continue;
    const valorCrudo = datos[campo.id];
    if (valorCrudo === undefined || valorCrudo === null || valorCrudo === '') continue;
    const valor = String(valorCrudo).trim();
    if (!valor) continue;
    // Solo pisa si aún no tenemos algo con esta u otra alta confianza previa.
    if (resultado[canonico].confianza !== 'alta') {
      resultado[canonico] = {
        valor,
        fuenteCampoId: campo.id,
        fuenteEtiqueta: campo.etiqueta,
        confianza: 'alta',
      };
    }
  }

  // Pasada 2: match por etiqueta normalizada (media confianza).
  for (const campo of campos) {
    const valorCrudo = datos[campo.id];
    if (valorCrudo === undefined || valorCrudo === null || valorCrudo === '') continue;
    const valor = String(valorCrudo).trim();
    if (!valor) continue;
    const etiquetaNorm = normalizarEtiqueta(campo.etiqueta || campo.id);
    for (const [canonico, patrones] of Object.entries(PATRONES_ETIQUETA) as [
      CampoOrdenMapeable, RegExp[],
    ][]) {
      // Ya cubierto por `tipo` — no sobre-escribir alta con media.
      if (resultado[canonico].confianza === 'alta') continue;
      const match = patrones.some(p => p.test(etiquetaNorm));
      if (!match) continue;
      // Solo pisa si aún no hay match previo (media/baja).
      if (resultado[canonico].confianza === 'ninguna' ||
          resultado[canonico].confianza === 'baja') {
        resultado[canonico] = {
          valor,
          fuenteCampoId: campo.id,
          fuenteEtiqueta: campo.etiqueta,
          confianza: 'media',
        };
      }
    }
  }

  // Pasada 3: fallback por id literal exacto (baja confianza).
  // Nombres típicos del editor cuando el admin no personaliza el id.
  const FALLBACKS: Record<CampoOrdenMapeable, string[]> = {
    clienteNombre: ['nombre'],
    clienteTelefono: ['telefono'],
    clienteEmail: ['email'],
    clienteDireccion: ['direccion'],
    clienteReferencia: ['referencia'],
    equipoTipo: ['tipo_equipo', 'equipo', 'tipoEquipo'],
    equipoMarca: ['marca'],
    equipoModelo: ['modelo'],
    descripcionFalla: ['falla', 'descripcion', 'problema'],
  };
  for (const [canonico, ids] of Object.entries(FALLBACKS) as [
    CampoOrdenMapeable, string[],
  ][]) {
    if (resultado[canonico].confianza !== 'ninguna') continue;
    for (const id of ids) {
      const valorCrudo = datos[id];
      if (valorCrudo === undefined || valorCrudo === null || valorCrudo === '') continue;
      const valor = String(valorCrudo).trim();
      if (!valor) continue;
      const campoEncontrado = campos.find(c => c.id === id);
      resultado[canonico] = {
        valor,
        fuenteCampoId: id,
        fuenteEtiqueta: campoEncontrado?.etiqueta || id,
        confianza: 'baja',
      };
      break;
    }
  }

  return resultado;
}

/**
 * Detecta si un valor "parece" un teléfono RD válido (10 dígitos tras
 * normalizar strippeando no-dígitos y colapsando prefijo `1`). Usado por el
 * resumen sin schema para elegir cuál valor mostrar como teléfono en la lista
 * de solicitudes cuando `datos.telefono` no está por convención (formulario
 * con ids auto-generados). No inventa números: si nada matchea, retorna `''`.
 */
function parecePhoneRD(v: unknown): string {
  if (typeof v !== 'string' && typeof v !== 'number') return '';
  const soloDigitos = String(v).replace(/\D/g, '');
  if (soloDigitos.length === 11 && soloDigitos.startsWith('1')) return soloDigitos.slice(1);
  if (soloDigitos.length === 10) return soloDigitos;
  return '';
}

/**
 * Resumen liviano de una solicitud cuando NO tenemos el schema cargado (lista
 * admin, búsqueda). No inventa: si `datos.nombre`/`datos.telefono` existen los
 * usa, si no aplica heurística sobre los valores del payload:
 *   - `telefono`: primer valor cuyo normalizado tenga 10 dígitos RD.
 *   - `nombre`: primer valor string plano que NO sea ese teléfono, ni un email,
 *     ni un URL/archivo (`starts with http` / `[archivo`), ni un blob de
 *     objeto/geo.
 *
 * Para la búsqueda, `valoresTextoSolicitud` retorna todos los valores string
 * planos del payload (excluye objetos/arrays/booleanos) para que el filtro
 * pueda hacer match en cualquier campo dinámico del formulario.
 */
export function resumirSolicitudDatos(
  datos: Record<string, unknown>,
): { nombre: string; telefono: string } {
  // Compat: claves fijas siguen ganando si existen.
  const nombreFijo = typeof datos.nombre === 'string' ? datos.nombre.trim() : '';
  const telefonoFijo = typeof datos.telefono === 'string' || typeof datos.telefono === 'number'
    ? String(datos.telefono).trim() : '';

  let telefono = telefonoFijo;
  if (!telefono) {
    for (const v of Object.values(datos)) {
      const t = parecePhoneRD(v);
      if (t) { telefono = String(v); break; }
    }
  }

  let nombre = nombreFijo;
  if (!nombre) {
    const telNorm = parecePhoneRD(telefono);
    for (const v of Object.values(datos)) {
      if (v == null) continue;
      if (typeof v !== 'string' && typeof v !== 'number') continue;
      const s = String(v).trim();
      if (!s) continue;
      if (s.startsWith('http') || s.startsWith('[archivo')) continue;
      if (s.includes('@')) continue; // email
      if (parecePhoneRD(s) && parecePhoneRD(s) === telNorm) continue;
      // Rechazar valores puramente numéricos (evita capturar precios/ids).
      if (/^\d+$/.test(s)) continue;
      nombre = s;
      break;
    }
  }

  return { nombre, telefono };
}

/**
 * Lista de valores string/número planos del payload — para buscar por
 * cualquier campo dinámico del formulario. Excluye objetos/arrays/booleanos
 * (no aportan al match textual) y URLs/refs a archivos.
 */
export function valoresTextoSolicitud(datos: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const v of Object.values(datos)) {
    if (v == null) continue;
    if (typeof v !== 'string' && typeof v !== 'number') continue;
    const s = String(v).trim();
    if (!s) continue;
    if (s.startsWith('[archivo')) continue;
    out.push(s);
  }
  return out;
}

/**
 * Extrae `{lat, lng}` del payload de una solicitud siguiendo el mismo orden
 * de preferencia que `FormularioPublico.tsx` (SPRINT-FIX-LEADS 2026-05-25):
 * primero `solicitud.ubicacion` (persistido por el form público como top-level),
 * luego cualquier campo de tipo `ubicacion` cuyo `datos[campo.id]` sea `{lat, lng}`.
 *
 * Rechaza coordenadas inválidas (NaN, |lat|>90, |lng|>180) — retorna `null`
 * en lugar de propagar un dato corrupto a la orden.
 */
export function extraerCoordenadasSolicitud(
  solicitud: SolicitudServicio,
  campos: CampoFormulario[],
): { lat: number; lng: number } | null {
  const validar = (lat: unknown, lng: unknown): { lat: number; lng: number } | null => {
    if (typeof lat !== 'number' || typeof lng !== 'number') return null;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { lat, lng };
  };

  if (solicitud.ubicacion) {
    const v = validar(solicitud.ubicacion.lat, solicitud.ubicacion.lng);
    if (v) return v;
  }

  const campoUbicacion = campos.find(c => c.tipo === 'ubicacion');
  if (campoUbicacion) {
    const val = solicitud.datos[campoUbicacion.id];
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const obj = val as { lat?: unknown; lng?: unknown };
      const v = validar(obj.lat, obj.lng);
      if (v) return v;
    }
  }

  return null;
}
