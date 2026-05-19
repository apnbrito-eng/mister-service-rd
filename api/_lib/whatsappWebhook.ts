/**
 * Helpers de parsing y normalización para el webhook entrante de WhatsApp
 * Cloud API (Meta).
 *
 * Diseñado para SPRINT-WA-1. Mantenido como módulo puro sin side effects
 * (NO importa Firebase, NO escribe a Firestore, NO loguea) para que los
 * helpers sean reutilizables y, en el futuro, faciles de testear si se
 * agrega una test suite.
 *
 * Referencia del shape Meta: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/components
 */

/**
 * Tipos de mensaje entrante soportados. `unsupported` cubre tipos que
 * Meta puede mandar pero que aún no procesamos (ej. `sticker`, `order`,
 * `system`). NO los rechazamos — los almacenamos como `unsupported` para
 * audit, y un operador humano decide si responder.
 */
export type TipoMensajeEntrante =
  | 'text'
  | 'image'
  | 'audio'
  | 'video'
  | 'document'
  | 'location'
  | 'button'
  | 'interactive'
  | 'reaction'
  | 'contacts'
  | 'sticker'
  | 'unsupported';

/**
 * Estados que Meta puede mandar en status callbacks de mensajes salientes.
 * Mapeamos a string interno para tener control sobre el enum.
 */
export type EstadoStatusCallback = 'sent' | 'delivered' | 'read' | 'failed';

/**
 * Shape canónico del contenido de un mensaje entrante normalizado. Cada
 * `tipo` puebla un subset distinto de los campos opcionales.
 *
 * NO usamos `any` acá — `tipo` discrimina el shape esperado pero el caller
 * trata todo como opcional para flexibilidad (Meta a veces omite campos).
 */
export interface ContenidoMensaje {
  texto?: string;
  mediaId?: string;
  mediaMimeType?: string;
  mediaSha256?: string;
  mediaCaption?: string;
  mediaFilename?: string;
  location?: {
    lat: number;
    lng: number;
    name?: string;
    address?: string;
  };
  buttonText?: string;
  buttonPayload?: string;
  interactiveType?: string;
  interactivePayload?: Record<string, unknown>;
  reactionEmoji?: string;
  reactionTargetWamid?: string;
  contactsPayload?: Record<string, unknown>;
  /** Solo para `unsupported`: motivo / metadata del tipo desconocido. */
  unsupportedReason?: string;
}

export interface MensajeEntranteNormalizado {
  wamid: string;
  from: string;
  /** Teléfono RD normalizado a 10 dígitos. */
  wa_id: string;
  phoneNumberId: string;
  timestampMeta: Date;
  tipo: TipoMensajeEntrante;
  contenido: ContenidoMensaje;
  /** Payload Meta crudo del mensaje individual (capeado al persistir). */
  rawMessage: Record<string, unknown>;
}

export interface StatusCallbackNormalizado {
  wamid: string;
  estado: EstadoStatusCallback;
  timestampStatus: Date;
  phoneNumberId: string;
  /** Errores asociados (solo cuando `estado === 'failed'`). */
  errorMeta?: {
    code?: number;
    title?: string;
    mensaje?: string;
    detalles?: string;
  };
}

export interface PayloadMetaParseado {
  messages: MensajeEntranteNormalizado[];
  statuses: StatusCallbackNormalizado[];
}

/**
 * Allowlist de `phoneNumberId` aceptados por nuestro webhook (security audit
 * SPRINT-WA-1: defense-in-depth contra payloads firmados desde otra cuenta
 * WABA en caso de error de Meta o secret leak). Valores válidos vienen
 * del env `META_PHONE_NUMBER_IDS_ALLOWLIST` (CSV) — fallback a
 * `META_PHONE_NUMBER_ID` (single) si no está definido el plural. Si NINGUNO
 * está configurado, retornamos null y el caller acepta cualquier id (legacy/
 * dev mode). Para producción ambas envs deberían estar seteadas.
 */
export function obtenerPhoneNumberIdsAllowlist(): Set<string> | null {
  const csvRaw = process.env.META_PHONE_NUMBER_IDS_ALLOWLIST;
  if (typeof csvRaw === 'string' && csvRaw.trim().length > 0) {
    return new Set(
      csvRaw.split(',').map((s) => s.trim()).filter((s) => s.length > 0),
    );
  }
  const single = process.env.META_PHONE_NUMBER_ID;
  if (typeof single === 'string' && single.trim().length > 0) {
    return new Set([single.trim()]);
  }
  return null;
}

/**
 * Regex defensiva contra wamids con caracteres no esperados. Meta emite
 * wamids con formato `wamid.<base64url+padding>`. Cualquier otro formato es
 * sospechoso (defensa-in-depth contra path traversal hacia docs Firestore
 * aunque el Admin SDK valida internamente).
 */
const WAMID_REGEX = /^wamid\.[A-Za-z0-9+/=_-]{1,200}$/;

/**
 * Normaliza un `from` (típicamente con prefijo país, ej. `18095551234`) a
 * formato RD interno de 10 dígitos.
 *
 * Reglas (consistente con `normalizarTelefono` en src/services/clientes.service.ts):
 *  - Strip non-digits.
 *  - Si tiene 11 dígitos y empieza con `1` → drop el `1`.
 *  - Si tiene >=10 dígitos → últimos 10.
 *  - Si tiene <10 → string vacío (NO RD válido, caller decide qué hacer).
 *
 * NO replicamos los rejects estrictos de `normalizarTelefono` (códigos
 * internacionales NO-RD con 11 dígitos sin `1`) porque Meta puede enviar
 * mensajes desde números internacionales que igual queremos loggear como
 * inbox raw — son audit, no son alta de cliente. Los callers que crean
 * cliente desde `wa_id` deben validar formato 10 dígitos antes.
 */
export function normalizarWaIdRd(from: string): string {
  const soloDigitos = (from ?? '').replace(/\D/g, '');
  if (soloDigitos.length === 11 && soloDigitos.startsWith('1')) {
    return soloDigitos.substring(1);
  }
  if (soloDigitos.length >= 10) {
    return soloDigitos.slice(-10);
  }
  return '';
}

/**
 * Trunca un wa_id a los últimos 4 dígitos para logs. NO usar para escribir
 * a Firestore — sólo para identificar la conversación en logs sin PII total.
 */
export function truncarWaIdParaLog(waId: string): string {
  if (waId.length <= 4) return waId;
  return `***${waId.slice(-4)}`;
}

/**
 * Mapea el `status` string de Meta a nuestro enum interno.
 * Estados desconocidos retornan `null` — caller debe loggear y skipear.
 */
export function mapearEstadoStatusCallback(status: unknown): EstadoStatusCallback | null {
  if (typeof status !== 'string') return null;
  const s = status.toLowerCase();
  if (s === 'sent' || s === 'delivered' || s === 'read' || s === 'failed') {
    return s;
  }
  return null;
}

/**
 * Comparador para decidir si un nuevo callback de estado avanza el estado
 * anterior. Meta puede enviar callbacks fuera de orden — `read` puede
 * llegar antes que `delivered` por la red. Solo actualizamos si el nuevo
 * estado tiene mayor "rango", o si es `failed` (siempre actualiza).
 *
 * Orden: sent (1) < delivered (2) < read (3). failed siempre wins SALVO
 * regresión sospechosa desde delivered/read (security audit SPRINT-WA-1:
 * un atacante con HMAC válido podría marcar como failed un mensaje ya
 * entregado, contaminando métricas y disparando lógica reactiva. Meta
 * NO debería emitir esa regresión — si llega, la bloqueamos defense-in-
 * depth).
 */
export function debeActualizarEstado(
  estadoActual: string | undefined,
  estadoNuevo: EstadoStatusCallback,
): boolean {
  if (estadoNuevo === 'failed') {
    // Anti-regresión: si ya está delivered/read, NO permitir downgrade a failed.
    if (estadoActual === 'delivered' || estadoActual === 'read') {
      return false;
    }
    return true;
  }
  const rank: Record<string, number> = {
    queued: 0,
    sent: 1,
    delivered: 2,
    read: 3,
    failed: 4,
  };
  const actual = rank[estadoActual ?? 'queued'] ?? 0;
  const nuevo = rank[estadoNuevo] ?? 0;
  return nuevo > actual;
}

/**
 * Extrae el contenido canónico de un mensaje entrante según su `type`.
 * Defense-in-depth: cada acceso es opcional + narrowing, asumimos shape
 * dinámico de Meta.
 */
export function extraerContenidoMensaje(msg: Record<string, unknown>): {
  tipo: TipoMensajeEntrante;
  contenido: ContenidoMensaje;
} {
  const rawTipo = typeof msg.type === 'string' ? msg.type : 'unsupported';
  const contenido: ContenidoMensaje = {};

  switch (rawTipo) {
    case 'text': {
      const text = (msg.text ?? {}) as Record<string, unknown>;
      if (typeof text.body === 'string') contenido.texto = text.body;
      return { tipo: 'text', contenido };
    }
    case 'image':
    case 'audio':
    case 'video':
    case 'document':
    case 'sticker': {
      const media = (msg[rawTipo] ?? {}) as Record<string, unknown>;
      if (typeof media.id === 'string') contenido.mediaId = media.id;
      if (typeof media.mime_type === 'string') contenido.mediaMimeType = media.mime_type;
      if (typeof media.sha256 === 'string') contenido.mediaSha256 = media.sha256;
      if (typeof media.caption === 'string') contenido.mediaCaption = media.caption;
      if (typeof media.filename === 'string') contenido.mediaFilename = media.filename;
      return { tipo: rawTipo as TipoMensajeEntrante, contenido };
    }
    case 'location': {
      const loc = (msg.location ?? {}) as Record<string, unknown>;
      const lat = Number(loc.latitude);
      const lng = Number(loc.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        contenido.location = { lat, lng };
        if (typeof loc.name === 'string') contenido.location.name = loc.name;
        if (typeof loc.address === 'string') contenido.location.address = loc.address;
      }
      return { tipo: 'location', contenido };
    }
    case 'button': {
      const btn = (msg.button ?? {}) as Record<string, unknown>;
      if (typeof btn.text === 'string') contenido.buttonText = btn.text;
      if (typeof btn.payload === 'string') contenido.buttonPayload = btn.payload;
      return { tipo: 'button', contenido };
    }
    case 'interactive': {
      const inter = (msg.interactive ?? {}) as Record<string, unknown>;
      if (typeof inter.type === 'string') contenido.interactiveType = inter.type;
      // Guardamos el payload entero para que la UI/bot pueda razonar sobre
      // botones list/button_reply etc. Cap defensivo a 20KB (security audit
      // SPRINT-WA-1): Meta podría enviar list responses largos que sumados
      // al raw pasen del límite 1MB de Firestore.
      contenido.interactivePayload = caparObjetoSiExcede(inter, 20_000);
      return { tipo: 'interactive', contenido };
    }
    case 'reaction': {
      const r = (msg.reaction ?? {}) as Record<string, unknown>;
      if (typeof r.emoji === 'string') contenido.reactionEmoji = r.emoji;
      if (typeof r.message_id === 'string') contenido.reactionTargetWamid = r.message_id;
      return { tipo: 'reaction', contenido };
    }
    case 'contacts': {
      const c = msg.contacts as unknown;
      // Cap defensivo a 20KB para evitar doc Firestore >1MB si Meta envía
      // tarjetas con 100+ contactos.
      contenido.contactsPayload = caparObjetoSiExcede({ contacts: c }, 20_000);
      return { tipo: 'contacts', contenido };
    }
    default: {
      contenido.unsupportedReason = `tipo Meta no soportado: ${rawTipo}`;
      return { tipo: 'unsupported', contenido };
    }
  }
}

/**
 * Convierte un timestamp Meta (segundos epoch como string o number) a Date.
 * Si el valor es inválido, retorna `new Date()` (now) como fallback —
 * mejor tener un timestamp aproximado que perder el mensaje.
 */
export function parsearTimestampMeta(raw: unknown): Date {
  if (typeof raw === 'string' || typeof raw === 'number') {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) {
      return new Date(n * 1000);
    }
  }
  return new Date();
}

/**
 * Parsea el payload completo del webhook Meta y retorna mensajes entrantes
 * + status callbacks normalizados.
 *
 * Si el shape global es inválido (no es objeto, no tiene `entry`, etc.),
 * retorna `{ messages: [], statuses: [] }` SIN throw — el caller (webhook)
 * va a responder 200 OK igual porque Meta nos manda eventos heterogéneos
 * y NO queremos que reintente.
 *
 * Mensajes individuales con shape inválido se skipean silenciosamente
 * (vuelven a aparecer si Meta reintenta).
 */
export function parsearPayloadMeta(jsonRaw: unknown): PayloadMetaParseado {
  const messages: MensajeEntranteNormalizado[] = [];
  const statuses: StatusCallbackNormalizado[] = [];

  if (!jsonRaw || typeof jsonRaw !== 'object') {
    return { messages, statuses };
  }
  const payload = jsonRaw as Record<string, unknown>;
  const entries = Array.isArray(payload.entry) ? payload.entry : [];

  // Allowlist de phoneNumberId. Si está configurada, rechazamos cualquier
  // payload con phone_number_id distinto (defense-in-depth contra payloads
  // firmados desde otra cuenta WABA — improbable pero posible si Meta hace
  // routing erróneo o el secret leakea).
  const phoneIdsPermitidos = obtenerPhoneNumberIdsAllowlist();

  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    const changes = Array.isArray((entry as Record<string, unknown>).changes)
      ? ((entry as Record<string, unknown>).changes as unknown[])
      : [];

    for (const change of changes) {
      if (!change || typeof change !== 'object') continue;
      const value = (change as Record<string, unknown>).value as
        | Record<string, unknown>
        | undefined;
      if (!value || typeof value !== 'object') continue;

      const metadata = (value.metadata ?? {}) as Record<string, unknown>;
      const phoneNumberId =
        typeof metadata.phone_number_id === 'string' ? metadata.phone_number_id : '';

      // Si hay allowlist y el id no coincide → skip todo el value.
      if (phoneIdsPermitidos && !phoneIdsPermitidos.has(phoneNumberId)) {
        continue;
      }

      // ─── Mensajes entrantes ──────────────────────────────────────────
      const rawMessages = Array.isArray(value.messages) ? value.messages : [];
      for (const rawMsg of rawMessages) {
        if (!rawMsg || typeof rawMsg !== 'object') continue;
        const msg = rawMsg as Record<string, unknown>;

        const wamid = typeof msg.id === 'string' ? msg.id : '';
        const from = typeof msg.from === 'string' ? msg.from : '';
        if (!wamid || !from || !phoneNumberId) continue;

        // Defense-in-depth: validar formato de wamid antes de usarlo como
        // doc id en Firestore. Admin SDK ya valida internamente pero
        // queremos catch explícito en parsing.
        if (!WAMID_REGEX.test(wamid)) continue;

        const wa_id = normalizarWaIdRd(from);
        if (!wa_id) {
          // Mensaje desde número no-normalizable (muy corto o vacío).
          // Lo skipeamos — caller no tiene cómo escribir a conversaciones/{wa_id}.
          continue;
        }

        const timestampMeta = parsearTimestampMeta(msg.timestamp);
        const { tipo, contenido } = extraerContenidoMensaje(msg);

        messages.push({
          wamid,
          from,
          wa_id,
          phoneNumberId,
          timestampMeta,
          tipo,
          contenido,
          rawMessage: msg,
        });
      }

      // ─── Status callbacks de mensajes salientes ──────────────────────
      const rawStatuses = Array.isArray(value.statuses) ? value.statuses : [];
      for (const rawStatus of rawStatuses) {
        if (!rawStatus || typeof rawStatus !== 'object') continue;
        const st = rawStatus as Record<string, unknown>;

        const wamid = typeof st.id === 'string' ? st.id : '';
        const estado = mapearEstadoStatusCallback(st.status);
        if (!wamid || !estado) continue;
        if (!WAMID_REGEX.test(wamid)) continue;

        const timestampStatus = parsearTimestampMeta(st.timestamp);

        const callback: StatusCallbackNormalizado = {
          wamid,
          estado,
          timestampStatus,
          phoneNumberId,
        };

        if (estado === 'failed') {
          const errors = Array.isArray(st.errors) ? st.errors : [];
          const firstError = (errors[0] ?? {}) as Record<string, unknown>;
          const errorMeta: NonNullable<StatusCallbackNormalizado['errorMeta']> = {};
          if (typeof firstError.code === 'number') errorMeta.code = firstError.code;
          if (typeof firstError.title === 'string') errorMeta.title = firstError.title;
          if (typeof firstError.message === 'string') errorMeta.mensaje = firstError.message;
          const details = firstError.error_data as Record<string, unknown> | undefined;
          if (details && typeof details.details === 'string') {
            errorMeta.detalles = details.details;
          }
          if (Object.keys(errorMeta).length > 0) {
            callback.errorMeta = errorMeta;
          }
        }

        statuses.push(callback);
      }
    }
  }

  return { messages, statuses };
}

/**
 * Strip recursivo de campos `undefined` para que Firestore acepte el
 * objeto. Recursivo sobre objetos planos; arrays se preservan tal cual
 * (Firestore acepta arrays con valores `null` pero no `undefined`).
 *
 * Para nested objects, retorna `undefined` si después del strip el objeto
 * queda vacío — el caller filtra el campo arriba.
 */
export function stripUndefinedDeep<T>(value: T): T {
  if (value === undefined) return value;
  if (value === null) return value;
  if (Array.isArray(value)) {
    return value.map((v) => stripUndefinedDeep(v)) as unknown as T;
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue;
      const cleaned = stripUndefinedDeep(v);
      out[k] = cleaned;
    }
    return out as unknown as T;
  }
  return value;
}

/**
 * Trunca el raw payload Meta a un tamaño máximo seguro para Firestore
 * (límite hard de Firestore: 1MB por doc). Capeamos al stringify a 50KB
 * según schema en `docs/MODULO_WHATSAPP.md` sección 1.1, dejando margen.
 *
 * Si el JSON serialized excede el cap, retornamos un objeto con la primera
 * porción como string + flag de truncamiento — preserva debugging básico
 * sin romper el write.
 */
export function caparRawPayload(
  raw: Record<string, unknown>,
  maxBytes = 50_000,
): Record<string, unknown> {
  try {
    const s = JSON.stringify(raw);
    if (s.length <= maxBytes) return raw;
    return {
      __truncado: true,
      __tamañoOriginal: s.length,
      __preview: s.slice(0, maxBytes - 200),
    };
  } catch {
    return { __truncado: true, __motivo: 'JSON.stringify falló' };
  }
}

/**
 * Helper genérico de capeo para sub-objetos del `contenido` que vienen de
 * Meta y pueden ser arbitrariamente grandes (interactive list responses,
 * contacts cards, etc.). Misma estrategia que `caparRawPayload` pero con
 * default más conservador (20KB) porque se aplica a múltiples campos del
 * mismo doc.
 */
export function caparObjetoSiExcede(
  obj: Record<string, unknown>,
  maxBytes = 20_000,
): Record<string, unknown> {
  try {
    const s = JSON.stringify(obj);
    if (s.length <= maxBytes) return obj;
    return {
      __truncado: true,
      __tamañoOriginal: s.length,
      __preview: s.slice(0, maxBytes - 200),
    };
  } catch {
    return { __truncado: true, __motivo: 'JSON.stringify falló' };
  }
}
