import type { VercelRequest, VercelResponse } from "@vercel/node";
import { FieldPath, Timestamp } from "firebase-admin/firestore";
import { accesoEquipo, ErrorAcceso } from "../_lib/accesoEquipo.js";
import { normalizarWaIdRd } from "../_lib/whatsappWebhook.js";
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET")
    return res.status(405).json({ error: "Método no permitido." });
  try {
    const { db, uid, rol } = await accesoEquipo(req);
    if (
      !["administrador", "coordinadora", "secretaria", "operaria"].includes(rol)
    )
      throw new ErrorAcceso(403, "Bandeja de oficina.");
    const filtro = String(req.query.filtro || "todas");
    const cursor = req.query.cursor;
    if (
      cursor &&
      (typeof cursor !== "string" || !/^[\w.-]{1,160}$/.test(cursor))
    )
      throw new ErrorAcceso(400, "Página inválida.");
    let q: FirebaseFirestore.Query = db.collection("whatsapp_conversaciones");
    let origen = "conversaciones";
    if (filtro === "mias") q = q.where("asignadaA", "==", uid);
    else if (filtro === "no_leidos")
      // @safe-orderby: el filtro noLeidos > 0 ya exige el campo; no omite chats elegibles.
      q = q.where("noLeidos", ">", 0).orderBy("noLeidos", "desc");
    else if (filtro === "pendientes") {
      origen = "atencion";
      q = db.collection("crm_atencion").where("pendiente", "==", true);
    } else if (filtro === "cartera") {
      origen = "cartera";
      q = db.collection("crm_clientes").where("responsableId", "==", uid);
    } else if (filtro === "hoy") {
      origen = "ordenes";
      const hoy = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Santo_Domingo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
      const inicio = new Date(`${hoy}T00:00:00-04:00`);
      q = db
        .collection("ordenes_servicio")
        .where("fechaCita", ">=", Timestamp.fromDate(inicio))
        .where(
          "fechaCita",
          "<",
          Timestamp.fromMillis(inicio.getTime() + 86400000),
        )
        // @safe-orderby: la ventana del día ya exige fechaCita en ambos where.
        .orderBy("fechaCita");
    } else if (filtro !== "todas")
      throw new ErrorAcceso(400, "Filtro inválido.");
    q = q.orderBy(FieldPath.documentId(), filtro === "no_leidos" ? "desc" : "asc");
    if (cursor) {
      const coleccion =
        origen === "atencion"
          ? "crm_atencion"
          : origen === "cartera"
            ? "crm_clientes"
            : origen === "ordenes"
              ? "ordenes_servicio"
              : "whatsapp_conversaciones";
      const anterior = await db.collection(coleccion).doc(cursor).get();
      if (!anterior.exists)
        throw new ErrorAcceso(409, "La página cambió. Vuelve al inicio.");
      q = q.startAfter(anterior);
    }
    const page = await q.limit(25).get();
    let docs: FirebaseFirestore.DocumentSnapshot[] = page.docs;
    if (origen === "atencion")
      docs = page.empty
        ? []
        : await db.getAll(
            ...page.docs.map((d) =>
              db.collection("whatsapp_conversaciones").doc(d.id),
            ),
          );
    if (origen === "cartera")
      docs = page.empty
        ? []
        : (
            await db
              .collection("whatsapp_conversaciones")
              .where(
                "clienteId",
                "in",
                page.docs.map((d) => d.id),
              )
              .get()
          ).docs;
    if (origen === "ordenes") {
      const telefonos = [
        ...new Set(
          page.docs
            .filter(
              (d) =>
                !d.data().eliminada &&
                !d.data().eliminado &&
                !["cancelado", "cerrado"].includes(d.data().fase),
            )
            .map((d) =>
              normalizarWaIdRd(String(d.data().clienteTelefono || "")),
            )
            .filter((t): t is string => !!t),
        ),
      ];
      docs = telefonos.length
        ? await db.getAll(
            ...telefonos.map((t) =>
              db.collection("whatsapp_conversaciones").doc(t),
            ),
          )
        : [];
    }
    const items = docs
      .filter((d) => d.exists)
      .map((d) => ({ id: d.id, ...d.data() }));
    return res.json({
      items,
      cursor: page.size === 25 ? page.docs[page.docs.length - 1].id : null,
    });
  } catch (e) {
    return res
      .status(e instanceof ErrorAcceso ? e.status : 500)
      .json({
        error:
          e instanceof ErrorAcceso
            ? e.message
            : "No se pudo cargar la bandeja.",
      });
  }
}
