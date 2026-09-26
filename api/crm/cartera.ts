import type { VercelRequest, VercelResponse } from "@vercel/node";
import { FieldPath } from "firebase-admin/firestore";
import { accesoEquipo, ErrorAcceso } from "../_lib/accesoEquipo.js";
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET")
    return res.status(405).json({ error: "Método no permitido." });
  try {
    const { db, rol, uid } = await accesoEquipo(req);
    if (!["administrador", "coordinadora"].includes(rol))
      throw new ErrorAcceso(
        403,
        "La cartera global corresponde a administración y coordinación.",
      );
    const cursor = req.query.cursor;
    if (
      cursor &&
      (typeof cursor !== "string" || !/^[\w.-]{1,160}$/.test(cursor))
    )
      throw new ErrorAcceso(400, "Página inválida.");
    let q = db
      .collection("ordenes_servicio")
      .orderBy(FieldPath.documentId())
      .limit(100);
    if (cursor) q = q.startAfter(cursor);
    const snap = await q.get();
    const metas = snap.empty
      ? []
      : await db.getAll(
          ...snap.docs.map((d) => db.collection("crm_ordenes").doc(d.id)),
        );
    const clientesIds = [
      ...new Set(
        snap.docs
          .map((d) => d.data().clienteId)
          .filter((x) => typeof x === "string" && /^[\w.-]{1,160}$/.test(x)),
      ),
    ];
    const carteras = clientesIds.length
      ? await db.getAll(
          ...clientesIds.map((id) => db.collection("crm_clientes").doc(id)),
        )
      : [];
    return res.json({
      items: snap.docs
        .filter((d) => !d.data().eliminada)
        .map((d) => {
          const o = d.data(),
            meta = metas.find((m) => m.id === d.id)?.data() || {};
          return {
            cartera: carteras.find((c) => c.id === o.clienteId)?.data() || null,
            participantes: meta.participantes || {},
            id: d.id,
            clienteId: o.clienteId || "",
            clienteNombre: o.clienteNombre || "",
            numero: o.numero || "",
            equipo: `${o.equipoTipo || ""} ${o.equipoMarca || ""}`,
            tecnicoId: o.tecnicoId || "",
            tecnicoNombre: o.tecnicoNombre || "",
            responsableId:
              meta.responsableId || o.responsableId || o.operariaId || "",
            responsableNombre:
              meta.responsableNombre ||
              o.responsableNombre ||
              o.operariaNombre ||
              "",
            operariaId: o.operariaId || "",
            operariaNombre: o.operariaNombre || "",
            fase: o.fase || "",
            etapa: meta.etapa || "",
            traspaso: meta.traspaso || null,
            pagos: o.pagos || [],
          };
        }),
      cursor: snap.size === 100 ? snap.docs[snap.docs.length - 1].id : null,
      usuarioId: uid,
    });
  } catch (e) {
    return res
      .status(e instanceof ErrorAcceso ? e.status : 500)
      .json({
        error:
          e instanceof ErrorAcceso
            ? e.message
            : "No se pudo cargar la cartera.",
      });
  }
}
