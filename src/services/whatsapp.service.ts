import { getAuth } from 'firebase/auth';

/**
 * Wrapper cliente del endpoint serverless `api/whatsapp/send.ts`.
 *
 * SPRINT-WA-2. Responsabilidades:
 *  - Adjuntar Authorization: Bearer <idToken> con el token Firebase del user
 *    logueado (la rule WhatsApp gates por rol en el backend).
 *  - Generar `tempId` único por request (idempotency P-017) — regex
 *    `^[A-Za-z0-9_-]{16,32}$`.
 *  - Tipar las 3 variantes de envío: texto libre, plantilla HSM y media.
 *
 * NO usar `nanoid` (no está instalado en este repo). Usar `Math.random()`
 * sobre base36 para el tempId — suficiente entropy para idempotency dentro
 * de una sesión de usuario.
 *
 * Decisiones firmes referenciadas:
 *  - D6=C: el backend rechaza con 403 si el rol del caller no está en
 *    `[administrador, coordinadora, secretaria, operaria]`. Este service
 *    NO valida rol del lado cliente — el UI debe gating con `puede(...)` o
 *    `RolRoute` antes de exponer botones.
 *  - D1=D: si la conversación tiene `ultimoPhoneNumberId`, el backend lo
 *    usa por default. `opciones.phoneNumberIdOverride` sólo es útil para
 *    iniciar una conversación desde un número específico cuando hay >1
 *    cuenta WABA activa.
 *  - D8=A: el backend rechaza con 422 si el destinatario está en
 *    `whatsapp_config.optOuts[]` o si el cliente tiene `optOutMarketing=true`.
 *    Este service NO duplica el check — el UI puede mostrar el error 422
 *    para evitar el spinner inútil, pero la fuente de verdad es el backend.
 */

export type EstadoEnvio = 'queued' | 'sent' | 'delivered' | 'read' | 'failed';

export interface RespuestaEnvioOk {
  ok: true;
  outboxId: string;
  wamid: string | null;
  estado: EstadoEnvio;
  intentos?: number;
  idempotent?: boolean;
}

export interface RespuestaEnvioError {
  ok?: false;
  error: string;
  detalle?: unknown;
  outboxId?: string;
  fuente?: string;
  rol?: string;
  ultimoEntranteAt?: string;
  intentos?: number;
}

export type RespuestaEnvio = RespuestaEnvioOk | RespuestaEnvioError;

interface OpcionesEnvio {
  ordenId?: string;
  phoneNumberIdOverride?: string;
}

interface PlantillaArgs {
  nombre: string;
  idioma: 'es' | 'es_DO';
  variables: string[];
  /**
   * URL HTTPS opcional del encabezado IMAGE de la plantilla (SPRINT-WA-FIX-PLANTILLAS-PARAMS
   * 2026-05-25). Si la plantilla en Meta tiene configurado header IMAGE,
   * pasar acá la URL del banner branded. Ver `api/whatsapp/send.ts` L164-169
   * — si no se pasa, send.ts cae al logo público fallback.
   */
  headerImageUrl?: string;
}

interface MediaArgs {
  storageUrl: string;
  mimeType: string;
  caption?: string;
}

/**
 * Obtiene el ID token del usuario logueado. Throws `Error('no-auth')` si
 * no hay sesión — el caller debe redirigir a login en ese caso.
 */
async function obtenerIdToken(): Promise<string> {
  const user = getAuth().currentUser;
  if (!user) throw new Error('no-auth');
  return user.getIdToken();
}

/**
 * Genera un `tempId` que matchea `^[A-Za-z0-9_-]{16,32}$`. Usa Date.now()
 * en base36 como prefijo (resistente a colisiones en la misma máquina) +
 * 2 chunks de `Math.random().toString(36)` como sufijo random.
 *
 * Entropía: el componente random aporta ~52 bits — más que suficiente para
 * que dos POSTs simultáneos del mismo user no colisionen. La idempotency
 * server-side adicionalmente filtra colisiones (P-017).
 */
function generarTempId(): string {
  // Preferimos crypto.randomUUID (browser moderno, garantiza 36 chars con guiones).
  // Quitamos los guiones para ajustarnos al regex server ^[A-Za-z0-9_-]{16,32}$ — el
  // resultado es 32 chars hex, dentro del rango. Fallback a Math.random sólo
  // si el runtime no expone randomUUID (testing/SSR raro).
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '');
  }
  // Fallback determinístico-en-longitud: timestamp en base36 (~9 chars en 2026)
  // + 24 chars random. Padding garantiza length >= 16 incluso si los Math.random
  // se truncan a sub-strings cortos (caso patológico cuando los dígitos terminan
  // en 0 — security audit WA-2 CONCERN 6).
  const t = Date.now().toString(36);
  const r1 = Math.random().toString(36).slice(2);
  const r2 = Math.random().toString(36).slice(2);
  const random = `${r1}${r2}`.padEnd(24, '0').substring(0, 24);
  return `${t}${random}`.substring(0, 32);
}

interface BodyEnvio {
  wa_id: string;
  tipo: 'texto_libre' | 'plantilla' | 'media';
  texto?: string;
  plantilla?: PlantillaArgs;
  media?: MediaArgs;
  ordenId?: string;
  phoneNumberIdOverride?: string;
  tempId: string;
}

/**
 * Hace POST al endpoint serverless `api/whatsapp/send`. Adjunta el ID token
 * + el body recibido + tempId generado. Retorna el JSON parseado tal cual
 * (forma OK o forma error según el status).
 */
async function llamarApiSend(
  body: Omit<BodyEnvio, 'tempId'>,
): Promise<RespuestaEnvio> {
  const idToken = await obtenerIdToken();
  const tempId = generarTempId();
  const payload: BodyEnvio = { ...body, tempId };

  const r = await fetch('/api/whatsapp/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  let parsed: unknown;
  try {
    parsed = await r.json();
  } catch {
    return { error: `http-${r.status}-no-json` };
  }

  if (parsed && typeof parsed === 'object') {
    return parsed as RespuestaEnvio;
  }
  return { error: 'respuesta-no-objeto' };
}

/**
 * Envía un mensaje de texto libre. Sólo válido si la conversación tiene
 * ventana de 24h abierta (último mensaje entrante <24h). El backend rechaza
 * con 422 `window-cerrada` si no.
 */
export async function enviarTexto(
  wa_id: string,
  texto: string,
  opciones?: OpcionesEnvio,
): Promise<RespuestaEnvio> {
  return llamarApiSend({
    wa_id,
    tipo: 'texto_libre',
    texto,
    ordenId: opciones?.ordenId,
    phoneNumberIdOverride: opciones?.phoneNumberIdOverride,
  });
}

/**
 * Envía una plantilla HSM aprobada por Meta. Único modo de iniciar
 * conversación o re-abrir ventana de 24h vencida.
 *
 * `nombre` debe matchear una plantilla aprobada en Meta Business Manager.
 * `variables` se mapea a `{{1}}`, `{{2}}`, ... en orden.
 *
 * `headerImageUrl` (opcional, HTTPS) — si la plantilla en Meta tiene
 * configurado header IMAGE, pasar la URL del banner branded. Si no se pasa,
 * el endpoint cae al logo público fallback (ver `api/whatsapp/send.ts`
 * L164-169 + L300-312). Se incluye en el body solo si está definido para
 * mantener el patrón "strip undefined" del repo.
 *
 * Nota: WA-5 implementará validación contra cache `whatsapp_plantillas`
 * (estado APPROVED + cantidad de variables matchea). Hoy el backend NO
 * valida la plantilla — un nombre inválido o variables faltantes resultan
 * en error de Meta (502).
 */
export async function enviarPlantilla(
  wa_id: string,
  nombre: string,
  idioma: 'es' | 'es_DO',
  variables: string[],
  headerImageUrl?: string,
  opciones?: OpcionesEnvio,
): Promise<RespuestaEnvio> {
  const plantilla: PlantillaArgs = { nombre, idioma, variables };
  if (headerImageUrl) {
    plantilla.headerImageUrl = headerImageUrl;
  }
  return llamarApiSend({
    wa_id,
    tipo: 'plantilla',
    plantilla,
    ordenId: opciones?.ordenId,
    phoneNumberIdOverride: opciones?.phoneNumberIdOverride,
  });
}

/**
 * Envía un mensaje de media (imagen/audio/video/documento). `storageUrl`
 * debe ser una URL accesible por Meta — típicamente Firebase Storage con
 * download token público.
 *
 * El tipo de media se infiere del `mimeType`:
 *  - `image/*` → image
 *  - `audio/*` → audio
 *  - `video/*` → video
 *  - resto → document
 */
export async function enviarMedia(
  wa_id: string,
  storageUrl: string,
  mimeType: string,
  caption?: string,
  opciones?: OpcionesEnvio,
): Promise<RespuestaEnvio> {
  const media: MediaArgs = { storageUrl, mimeType };
  if (caption !== undefined) media.caption = caption;
  return llamarApiSend({
    wa_id,
    tipo: 'media',
    media,
    ordenId: opciones?.ordenId,
    phoneNumberIdOverride: opciones?.phoneNumberIdOverride,
  });
}
