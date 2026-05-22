import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  getAdminAuth,
  getAdminFirestore,
  getAdminStorage,
} from '../_lib/firebaseAdmin.js';
import { randomUUID } from 'node:crypto';

/**
 * SPRINT-INBOX-9-FOTOS-CHAT-ORDEN (2026-05-22) — opción A.
 *
 * Descarga una imagen del chat de WhatsApp (vía Meta Graph API) y la
 * persiste en Firebase Storage para que el cliente del inbox pueda
 * "Adjuntar a la orden" en construcción.
 *
 * Flujo:
 *   1. Auth: Bearer <idToken> firmado por Firebase Auth. Caller debe ser
 *      staff oficina (administrador / coordinadora / secretaria / operaria).
 *   2. Lee `whatsapp_mensajes_inbox/{wamid}` y valida que el mensaje
 *      pertenezca a la conversación reclamada (defense-in-depth: previene
 *      que un caller con auth válida descargue media de conversaciones
 *      arbitrarias adivinando wamids).
 *   3. Llama `GET https://graph.facebook.com/{API_VERSION}/{mediaId}` con
 *      `Authorization: Bearer ${META_ACCESS_TOKEN}` para obtener la URL
 *      temporal de Meta (TTL ~5min).
 *   4. Descarga el binario.
 *   5. Sube a Firebase Storage en `whatsapp-media/{wa_id}/{wamid}.{ext}`
 *      vía Admin SDK (ignora rules de Storage, pero las rules de SPRINT-138
 *      cubren defense-in-depth si algún día el cliente sube directo).
 *   6. Genera URL firmada de larga vida (7 días) y retorna `{ urlImagen }`.
 *
 * Idempotencia: si el archivo ya existe en Storage (por wamid + ext), se
 * reutiliza y sólo se regenera la URL firmada.
 *
 * No persiste la URL ni el path en Firestore — eso es responsabilidad del
 * caller que arma el formulario de orden (suma la URL al array `fotos[]`).
 */

const META_API_VERSION = process.env.META_API_VERSION ?? 'v21.0';
const MAX_IMAGE_BYTES = 16 * 1024 * 1024; // 16 MB (límite Meta para imágenes).
const SIGNED_URL_TTL_DAYS = 7;

const ROLES_AUTORIZADOS: ReadonlySet<string> = new Set([
  'administrador',
  'coordinadora',
  'secretaria',
  'operaria',
]);

interface MediaProxyRequestBody {
  wamid?: unknown;
  wa_id?: unknown;
}

function inferirExtension(mimeType: string | undefined): string {
  if (!mimeType) return 'bin';
  if (mimeType.startsWith('image/jpeg') || mimeType.startsWith('image/jpg')) return 'jpg';
  if (mimeType.startsWith('image/png')) return 'png';
  if (mimeType.startsWith('image/webp')) return 'webp';
  if (mimeType.startsWith('image/heic')) return 'heic';
  if (mimeType.startsWith('image/gif')) return 'gif';
  return 'bin';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method-not-allowed' });
  }

  // 1) Auth
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res
      .status(401)
      .json({ error: 'Token requerido (Authorization: Bearer <idToken>)' });
  }
  const idToken = authHeader.substring(7).trim();
  if (!idToken) {
    return res.status(401).json({ error: 'token-vacio' });
  }

  let auth: ReturnType<typeof getAdminAuth>;
  let db: ReturnType<typeof getAdminFirestore>;
  let storage: ReturnType<typeof getAdminStorage>;
  try {
    auth = getAdminAuth();
    db = getAdminFirestore();
    storage = getAdminStorage();
  } catch (err) {
    console.error('[wa/media-proxy] init admin error:', err);
    return res.status(500).json({ error: 'internal-init' });
  }

  let decodedToken: Awaited<ReturnType<typeof auth.verifyIdToken>>;
  try {
    decodedToken = await auth.verifyIdToken(idToken);
    // @safe-meta-catch: error de Firebase Auth (token expirado/invalido), no de Meta Graph API.
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === 'auth/id-token-expired' || code === 'auth/argument-error') {
      return res
        .status(401)
        .json({ error: 'Token de sesión inválido o expirado.' });
    }
    return res.status(401).json({ error: 'token-invalido' });
  }

  // 2) Verificar rol staff oficina
  const callerUid = decodedToken.uid;
  const callerEmail = decodedToken.email;
  let rolCaller: string | null = null;

  try {
    const usuarioSnap = await db.collection('usuarios').doc(callerUid).get();
    if (usuarioSnap.exists) {
      const data = usuarioSnap.data();
      if (data && typeof data.rol === 'string') rolCaller = data.rol;
    }
  } catch (err) {
    console.error('[wa/media-proxy] error leyendo usuarios/{uid}:', err);
  }

  if (!rolCaller) {
    try {
      const byUid = await db
        .collection('personal')
        .where('uid', '==', callerUid)
        .limit(1)
        .get();
      if (!byUid.empty) {
        const data = byUid.docs[0].data();
        if (typeof data.rol === 'string') rolCaller = data.rol;
      }
    } catch {
      /* no-op */
    }
  }

  if (!rolCaller && callerEmail) {
    try {
      const byEmail = await db
        .collection('personal')
        .where('email', '==', callerEmail.toLowerCase())
        .limit(1)
        .get();
      if (!byEmail.empty) {
        const data = byEmail.docs[0].data();
        if (typeof data.rol === 'string') rolCaller = data.rol;
      }
    } catch {
      /* no-op */
    }
  }

  if (!rolCaller || !ROLES_AUTORIZADOS.has(rolCaller)) {
    return res.status(403).json({ error: 'rol-no-autorizado' });
  }

  // 3) Validar body (acepta string|object|null — patrón defensivo CLAUDE.md
  // gotcha "@vercel/node ignora export const config" + JSON.parse fallback)
  let bodyRaw: unknown = req.body;
  if (typeof bodyRaw === 'string') {
    try {
      bodyRaw = JSON.parse(bodyRaw);
      // @safe-meta-catch: error de JSON.parse del body local, no de Meta Graph API.
    } catch {
      return res.status(400).json({ error: 'body-invalido' });
    }
  }
  if (!bodyRaw || typeof bodyRaw !== 'object') {
    return res.status(400).json({ error: 'body-requerido' });
  }
  const { wamid, wa_id } = bodyRaw as MediaProxyRequestBody;
  if (typeof wamid !== 'string' || !wamid) {
    return res.status(400).json({ error: 'wamid-requerido' });
  }
  if (typeof wa_id !== 'string' || !wa_id) {
    return res.status(400).json({ error: 'wa_id-requerido' });
  }

  // 4) Leer mensaje del inbox + validar pertenencia a la conversación.
  let mensajeData: Record<string, unknown>;
  try {
    const mensajeSnap = await db
      .collection('whatsapp_mensajes_inbox')
      .doc(wamid)
      .get();
    if (!mensajeSnap.exists) {
      return res.status(404).json({ error: 'mensaje-no-encontrado' });
    }
    mensajeData = mensajeSnap.data() as Record<string, unknown>;
  } catch (err) {
    console.error('[wa/media-proxy] error leyendo mensaje:', err);
    return res.status(500).json({ error: 'internal-read' });
  }

  // Defense in depth: el caller declara wa_id; rechazar si no coincide con
  // el del mensaje persistido. Evita que un caller con auth válida adivine
  // wamids de conversaciones a las que no debería tener acceso.
  if (mensajeData.wa_id !== wa_id) {
    return res.status(403).json({ error: 'conversacion-mismatch' });
  }

  // Validar que el mensaje sea efectivamente image y tenga mediaId.
  const tipo = mensajeData.tipo;
  if (tipo !== 'image') {
    return res.status(400).json({ error: 'tipo-no-soportado', tipo });
  }
  const contenido = mensajeData.contenido as
    | { mediaId?: unknown; mediaMimeType?: unknown }
    | undefined;
  const mediaId = contenido?.mediaId;
  const mediaMimeType =
    typeof contenido?.mediaMimeType === 'string' ? contenido.mediaMimeType : undefined;
  if (typeof mediaId !== 'string' || !mediaId) {
    return res.status(400).json({ error: 'mediaId-ausente' });
  }

  // 5) Persistir en Storage en path determinístico → idempotencia natural.
  const ext = inferirExtension(mediaMimeType);
  const objectPath = `whatsapp-media/${wa_id}/${wamid}.${ext}`;
  const bucket = storage.bucket();
  const file = bucket.file(objectPath);

  let yaExiste = false;
  try {
    const [exists] = await file.exists();
    yaExiste = exists;
  } catch (err) {
    console.warn('[wa/media-proxy] no se pudo verificar existencia previa:', err);
  }

  if (!yaExiste) {
    // Llamar a Meta para obtener URL temporal.
    const metaToken = process.env.META_ACCESS_TOKEN;
    if (!metaToken) {
      console.error('[wa/media-proxy] META_ACCESS_TOKEN no configurado');
      return res.status(500).json({ error: 'meta-token-no-configurado' });
    }

    let metaMediaUrl: string;
    let metaContentType: string | undefined;
    try {
      const metaInfoUrl = `https://graph.facebook.com/${META_API_VERSION}/${mediaId}`;
      const metaInfoResp = await fetch(metaInfoUrl, {
        headers: { Authorization: `Bearer ${metaToken}` },
      });
      if (!metaInfoResp.ok) {
        const body = await metaInfoResp.text().catch(() => '');
        console.error(
          '[wa/media-proxy] Meta GET info falló:',
          metaInfoResp.status,
          body.substring(0, 300),
        );
        return res
          .status(502)
          .json({ error: 'meta-info-failed', status: metaInfoResp.status });
      }
      const info = (await metaInfoResp.json()) as {
        url?: unknown;
        mime_type?: unknown;
        file_size?: unknown;
      };
      if (typeof info.url !== 'string' || !info.url) {
        return res.status(502).json({ error: 'meta-info-sin-url' });
      }
      metaMediaUrl = info.url;
      metaContentType =
        typeof info.mime_type === 'string' ? info.mime_type : undefined;
      const declared = typeof info.file_size === 'number' ? info.file_size : 0;
      if (declared > MAX_IMAGE_BYTES) {
        return res.status(413).json({
          error: 'archivo-demasiado-grande',
          bytesDeclarados: declared,
          maxBytes: MAX_IMAGE_BYTES,
        });
      }
    } catch (err) {
      console.error('[wa/media-proxy] Meta info fetch error:', err);
      return res.status(502).json({ error: 'meta-info-error' });
    }

    // Descargar el binario.
    let buffer: Buffer;
    try {
      const binResp = await fetch(metaMediaUrl, {
        headers: { Authorization: `Bearer ${metaToken}` },
      });
      if (!binResp.ok) {
        return res
          .status(502)
          .json({ error: 'meta-bin-failed', status: binResp.status });
      }
      const arrayBuf = await binResp.arrayBuffer();
      if (arrayBuf.byteLength > MAX_IMAGE_BYTES) {
        return res.status(413).json({
          error: 'archivo-excede-maximo',
          bytesDescargados: arrayBuf.byteLength,
          maxBytes: MAX_IMAGE_BYTES,
        });
      }
      buffer = Buffer.from(arrayBuf);
    } catch (err) {
      console.error('[wa/media-proxy] Meta bin fetch error:', err);
      return res.status(502).json({ error: 'meta-bin-error' });
    }

    // Subir a Storage.
    try {
      const downloadToken = randomUUID();
      await file.save(buffer, {
        contentType: metaContentType ?? mediaMimeType ?? 'image/jpeg',
        metadata: {
          metadata: {
            // Token de descarga (compat con `getDownloadURL` del SDK web).
            firebaseStorageDownloadTokens: downloadToken,
            wamid,
            wa_id,
            origen: 'whatsapp-meta-graph-api',
          },
        },
      });
    } catch (err) {
      console.error('[wa/media-proxy] Storage save error:', err);
      return res.status(500).json({ error: 'storage-save-error' });
    }
  }

  // 6) Generar URL firmada (válida 7 días). Para preview en UI y para que
  // el caller pueda persistirla en el array `fotos[]` del equipo en la
  // orden (mismo patrón que `getDownloadURL` de fotos de cierre).
  let urlImagen: string;
  try {
    const [signed] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + SIGNED_URL_TTL_DAYS * 24 * 60 * 60 * 1000,
    });
    urlImagen = signed;
  } catch (err) {
    console.error('[wa/media-proxy] getSignedUrl error:', err);
    return res.status(500).json({ error: 'signed-url-error' });
  }

  return res.status(200).json({
    ok: true,
    urlImagen,
    storagePath: objectPath,
    reused: yaExiste,
  });
}
