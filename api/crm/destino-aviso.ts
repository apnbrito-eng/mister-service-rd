import type { VercelRequest, VercelResponse } from "@vercel/node";
import { accesoEquipo, ErrorAcceso } from "../_lib/accesoEquipo.js";
import { accesoOrdenTecnico } from "../_lib/accesoOrdenTecnico.js";
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET")
    return res.status(405).json({ error: "Método no permitido." });
  try {
    const { db, uid, rol } = await accesoEquipo(req);
    const id = req.query.id;
    if (typeof id !== "string" || !/^[\w.-]{1,160}$/.test(id))
      throw new ErrorAcceso(400, "Aviso inválido.");
    const n = (await db.collection("notificaciones").doc(id).get()).data();
    if (!n || n.userId !== uid)
      throw new ErrorAcceso(403, "Este aviso no corresponde a tu cuenta.");
    if (
      typeof n.conversacionId === "string" &&
      /^\d{7,16}$/.test(n.conversacionId)
    ) {
      if (
        !["administrador", "coordinadora", "secretaria", "operaria"].includes(
          rol,
        )
      )
        throw new ErrorAcceso(403, "Conversación de oficina.");
      const a = (
        await db.collection("crm_atencion").doc(n.conversacionId).get()
      ).data();
      if (n.requiereResponsableActual) {
        const responsable = a
          ? a.responsableId
          : (
              await db
                .collection("whatsapp_conversaciones")
                .doc(n.conversacionId)
                .get()
            ).data()?.asignadaA;
        if (responsable !== uid)
          throw new ErrorAcceso(
            409,
            "La atención ya fue transferida a otra persona.",
          );
      }
      return res.json({ ruta: `/admin/inbox/${n.conversacionId}` });
    }
    if (typeof n.ordenId === "string" && /^[\w.-]{1,160}$/.test(n.ordenId)) {
      if (rol === "tecnico") {
        await accesoOrdenTecnico(db, uid, n.ordenId);
        return res.json({ ruta: `/tecnico?orden=${encodeURIComponent(n.ordenId)}` });
      }
      return res.json({ ruta: `/admin/ordenes/${n.ordenId}` });
    }
    return res.json({
      ruta: rol === "tecnico" ? "/tecnico" : "/admin/dashboard",
    });
  } catch (e) {
    return res
      .status(e instanceof ErrorAcceso ? e.status : 500)
      .json({
        error:
          e instanceof ErrorAcceso ? e.message : "No se pudo abrir el aviso.",
      });
  }
}
