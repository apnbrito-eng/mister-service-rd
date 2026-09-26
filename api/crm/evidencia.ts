import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHash } from "node:crypto";
import { accesoEquipo, ErrorAcceso } from "../_lib/accesoEquipo.js";
import { getAdminStorage } from "../_lib/firebaseAdmin.js";
import { normalizarTelefono } from "../../src/utils/crm.js";
import { mediaPermitido, limiteMedia } from "../_lib/mediaPermitido.js";
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST")
    return res.status(405).json({ error: "Método no permitido." });
  try {
    const { db, rol } = await accesoEquipo(req);
    if (
      !["administrador", "coordinadora", "secretaria", "operaria"].includes(rol)
    )
      throw new ErrorAcceso(403, "Las evidencias de cobro son de oficina.");
    const b = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const cliente = typeof b?.clienteId === 'string';
    const entidadId = cliente ? b.clienteId : b?.ordenId;
    if (
      !b ||
      typeof entidadId !== "string" ||
      !/^[\w.-]{1,160}$/.test(entidadId) ||
      typeof b.wamid !== "string" ||
      b.wamid.length > 300 ||
      b.wamid.includes("/")
    )
      throw new ErrorAcceso(400, "Evidencia inválida.");
    const [ord, msg] = await Promise.all([
      db.collection(cliente ? "clientes" : "ordenes_servicio").doc(entidadId).get(),
      db.collection("whatsapp_mensajes_inbox").doc(b.wamid).get(),
    ]);
    if (
      !ord.exists ||
      ord.data()?.eliminada ||
      ord.data()?.eliminado ||
      !msg.exists ||
      normalizarTelefono(cliente ? ord.data()?.telefono : ord.data()?.clienteTelefono).length !== 10 ||
      normalizarTelefono(cliente ? ord.data()?.telefono : ord.data()?.clienteTelefono) !==
        normalizarTelefono(msg.data()?.wa_id)
    )
      throw new ErrorAcceso(403, "El mensaje no corresponde al expediente seleccionado.");
    const data = msg.data()!;
    const MAX = limiteMedia(data.tipo);
    if (!["image", "video", "audio", "document", "sticker"].includes(data.tipo))
      throw new ErrorAcceso(
        400,
        "Esta acción admite imágenes. El texto se conserva en la nota o pago.",
      );
    const key = createHash("sha256").update(b.wamid).digest("hex");
    const path = `crm-private/${cliente ? "cliente-" : ""}${entidadId}/${key}`;
    const file = getAdminStorage().bucket().file(path);
    if (!(await file.exists())[0]) {
      const token = process.env.META_ACCESS_TOKEN;
      if (!token)
        throw new ErrorAcceso(
          503,
          "Falta la conexión con WhatsApp para guardar la imagen.",
        );
      if (!/^\d+$/.test(String(data.contenido?.mediaId)))
        throw new ErrorAcceso(400, "El mensaje no contiene imagen disponible.");
      const resp = await fetch(
        `https://graph.facebook.com/${process.env.META_API_VERSION || "v21.0"}/${data.contenido.mediaId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!resp.ok)
        throw new ErrorAcceso(
          502,
          "WhatsApp no pudo recuperar la imagen. Solicita que la reenvíen si ya expiró.",
        );
      const info = (await resp.json()) as {
        url: string;
        mime_type: string;
        file_size: number;
      };
      const u = new URL(info.url);
      if (
        u.protocol !== "https:" ||
        !/(^|\.)(facebook\.com|fbcdn\.net|fbsbx\.com)$/.test(u.hostname) ||
        !mediaPermitido(info.mime_type) ||
        info.file_size > MAX
      )
        throw new ErrorAcceso(
          400,
          "Formato, origen o tamaño de imagen no admitido.",
        );
      const media = await fetch(u, {
        headers: { Authorization: `Bearer ${token}` },
        redirect: "error",
        signal: AbortSignal.timeout(20000),
      });
      if (!media.ok || !media.body)
        throw new ErrorAcceso(502, "No se pudo descargar la imagen.");
      const chunks: Uint8Array[] = [];
      let size = 0;
      for await (const chunk of media.body as any) {
        size += chunk.length;
        if (size > MAX)
          throw new ErrorAcceso(413, "La imagen es demasiado grande.");
        chunks.push(chunk);
      }
      await file.save(Buffer.concat(chunks), {
        resumable: false,
        contentType: info.mime_type,
      });
    }
    await db
      .collection(cliente ? "crm_clientes" : "crm_ordenes")
      .doc(entidadId)
      .collection("evidencias")
      .doc(key)
      .set({ wamid: b.wamid, storagePath: path }, { merge: true });
    const [url] = await file.getSignedUrl({
      action: "read",
      expires: Date.now() + 5 * 60000,
    });
    return res.json({ url, evidenciaId: key, tipo: data.tipo });
  } catch (e) {
    return res
      .status(e instanceof ErrorAcceso ? e.status : 500)
      .json({
        error:
          e instanceof ErrorAcceso
            ? e.message
            : "No se pudo guardar o abrir la evidencia.",
      });
  }
}
