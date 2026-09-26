import type { VercelRequest, VercelResponse } from "@vercel/node";
import { FieldValue } from "firebase-admin/firestore";
import { createHash } from "node:crypto";
import { accesoEquipo, ErrorAcceso } from "../_lib/accesoEquipo.js";
import { normalizarTelefono } from "../../src/utils/crm.js";
const categorias = ["equipo", "acuerdo", "documento", "comprobante", "otro"];
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (!["GET", "POST"].includes(req.method || ""))
    return res.status(405).json({ error: "Método no permitido." });
  try {
    const { db, uid, rol } = await accesoEquipo(req);
    if (
      !["administrador", "coordinadora", "secretaria", "operaria"].includes(rol)
    )
      throw new ErrorAcceso(
        403,
        "El expediente general es de oficina. Comparte con el técnico únicamente las notas de su orden.",
      );
    const b =
      req.method === "GET"
        ? req.query
        : typeof req.body === "string"
          ? JSON.parse(req.body)
          : req.body;
    if (
      !b ||
      typeof b.clienteId !== "string" ||
      !/^[\w.-]{1,160}$/.test(b.clienteId)
    )
      throw new ErrorAcceso(400, "Cliente inválido.");
    const ref = db
      .collection("crm_clientes")
      .doc(b.clienteId)
      .collection("expediente");
    const cliente = await db.collection("clientes").doc(b.clienteId).get();
    if (
      !cliente.exists ||
      cliente.data()?.eliminado ||
      cliente.data()?.eliminada
    )
      throw new ErrorAcceso(404, "Cliente no disponible.");
    if (req.method === "GET") {
      // @safe-orderby: subcolección crm_clientes/{id}/expediente; tx.create siempre persiste fechaMs.
      let q = ref.orderBy("fechaMs", "desc").limit(30);
      if (b.cursor) {
        if (typeof b.cursor !== "string" || !/^[\w-]{1,80}$/.test(b.cursor))
          throw new ErrorAcceso(400, "Página inválida.");
        const anterior = await ref.doc(b.cursor).get();
        if (!anterior.exists)
          throw new ErrorAcceso(409, "Actualiza el expediente.");
        q = q.startAfter(anterior);
      }
      const snap = await q.get();
      return res.json({
        items: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
        cursor: snap.size === 30 ? snap.docs[snap.size - 1].id : null,
      });
    }
    if (
      typeof b.requestId !== "string" ||
      !/^[\w-]{16,80}$/.test(b.requestId) ||
      typeof b.texto !== "string" ||
      !b.texto.trim() ||
      b.texto.length > 3000 ||
      !categorias.includes(b.categoria)
    )
      throw new ErrorAcceso(400, "Añade una aclaración y categoría válidas.");
    const actor = (await db.collection("usuarios").doc(uid).get()).data();
    await db.runTransaction(async (tx) => {
      const nota = ref.doc(b.requestId),
        previa = await tx.get(nota);
      if (previa.exists) {
        if (
          previa.data()?.autorId !== uid ||
          previa.data()?.texto !== b.texto.trim() ||
          previa.data()?.categoria !== b.categoria ||
          (previa.data()?.fuente?.wamid || null) !== (b.wamid || null)
        )
          throw new ErrorAcceso(409, "Identificador de operación reutilizado.");
        return;
      }
      let fuente: Record<string, unknown> | null = null;
      if (b.wamid) {
        if (
          typeof b.wamid !== "string" ||
          b.wamid.length > 300 ||
          b.wamid.includes("/")
        )
          throw new ErrorAcceso(400, "Mensaje inválido.");
        const msg = (
          await tx.get(db.collection("whatsapp_mensajes_inbox").doc(b.wamid))
        ).data();
        const tel = normalizarTelefono(cliente.data()?.telefono);
        if (!msg || tel.length !== 10 || tel !== normalizarTelefono(msg.wa_id))
          throw new ErrorAcceso(403, "El mensaje no pertenece a este cliente.");
        if (!["text", "image", "video", "audio", "document", "sticker", "location"].includes(msg.tipo))
          throw new ErrorAcceso(400, "Selecciona un mensaje compatible.");
        if (["image", "video", "audio", "document", "sticker"].includes(msg.tipo)) {
          const key = createHash("sha256").update(b.wamid).digest("hex");
          if (
            !(
              await tx.get(
                db
                  .collection("crm_clientes")
                  .doc(b.clienteId)
                  .collection("evidencias")
                  .doc(key),
              )
            ).exists
          )
            throw new ErrorAcceso(400, "Guarda primero el archivo.");
        }
        fuente = {
          wamid: b.wamid,
          waId: msg.wa_id,
          tipo: msg.tipo,
          texto: String(
            msg.contenido?.texto || msg.contenido?.mediaCaption || "",
          ).slice(0, 3000),
          fecha: msg.timestampMeta || null,
        };
      }
      tx.create(nota, {
        texto: b.texto.trim(),
        categoria: b.categoria,
        fuente,
        autorId: uid,
        autorNombre: actor?.nombre || "Usuario",
        fechaMs: Date.now(),
        createdAt: FieldValue.serverTimestamp(),
        visibilidad: "oficina",
      });
    });
    return res.json({ ok: true });
  } catch (e) {
    return res
      .status(e instanceof ErrorAcceso ? e.status : 500)
      .json({
        error:
          e instanceof ErrorAcceso
            ? e.message
            : "No se pudo guardar el expediente.",
      });
  }
}
