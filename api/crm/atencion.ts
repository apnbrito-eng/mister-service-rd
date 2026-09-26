import { ordenAbiertaChat } from '../_lib/rutaChatOrden.js';
import { normalizarTelefono } from '../../src/utils/crm.js';
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { FieldValue } from "firebase-admin/firestore";
import { accesoEquipo, ErrorAcceso } from "../_lib/accesoEquipo.js";
import {
  cambiarAtencion,
  type AtencionChat,
  type AccionAtencion,
} from "../../src/utils/atencionChat.js";
const oficina = ["administrador", "coordinadora", "secretaria", "operaria"];
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (!["GET", "POST"].includes(req.method || ""))
    return res.status(405).json({ error: "Método no permitido." });
  try {
    const { db, uid, rol } = await accesoEquipo(req);
    if (!oficina.includes(rol))
      throw new ErrorAcceso(
        403,
        "Solo el equipo de oficina gestiona la atención.",
      );
    const body =
      req.method === "GET"
        ? req.query
        : typeof req.body === "string"
          ? JSON.parse(req.body)
          : req.body;
    if (!body || typeof body.waId !== "string" || !/^\d{7,16}$/.test(body.waId))
      throw new ErrorAcceso(400, "Conversación inválida.");
    const ref = db.collection("crm_atencion").doc(body.waId);
    const convRef = db.collection("whatsapp_conversaciones").doc(body.waId);
    const inicial = (
      conv: Record<string, any>,
      estado?: Record<string, any>,
    ): AtencionChat => ({
      version: estado?.version || 0,
      responsableId: estado
        ? estado.responsableId || null
        : conv.asignadaA || null,
      responsableNombre: estado?.responsableNombre || null,
      pendiente: estado?.pendiente ?? true,
      traspaso: estado?.traspaso || null,
    });
    if (req.method === "POST" && body.accion === "presencia") {
      if (typeof body.activa !== "boolean")
        throw new ErrorAcceso(400, "Estado inválido.");
      if (!(await convRef.get()).exists)
        throw new ErrorAcceso(404, "Conversación no disponible.");
      const actor = (await db.collection("usuarios").doc(uid).get()).data();
      await ref
        .collection("presencia")
        .doc(uid)
        .set({
          uid,
          nombre: actor?.nombre || "Usuario",
          hastaMs: body.activa ? Date.now() + 45000 : 0,
        });
      return res.json({ ok: true });
    }
    if (req.method === "GET" && body.soloPresencia === "1") {
      if (!(await convRef.get()).exists)
        throw new ErrorAcceso(404, "Conversación no disponible.");
      const presencia = await ref
        .collection("presencia")
        .where("hastaMs", ">", Date.now())
        .limit(10)
        .get();
      return res.json({
        redactando: presencia.docs
          .filter((d) => d.id !== uid)
          .map((d) => ({ nombre: d.data().nombre })),
      });
    }
    if (req.method === "GET") {
      const [conv, estado, equipo] = await Promise.all([
        convRef.get(),
        ref.get(),
        db.collection("usuarios").get(),
      ]);
      if (!conv.exists)
        throw new ErrorAcceso(404, "Conversación no disponible.");
      const personas = equipo.docs
        .filter(
          (d) =>
            oficina.includes(d.data().rol) &&
            d.data().activo !== false &&
            !d.data().eliminado,
        )
        .map((d) => ({ uid: d.id, nombre: d.data().nombre || "Sin nombre" }));
      const atencion = inicial(conv.data()!, estado.data());
      atencion.responsableNombre ||=
        personas.find((p) => p.uid === atencion.responsableId)?.nombre || null;
      const clienteId = conv.data()?.clienteId;
      const cartera =
        typeof clienteId === "string" && /^[\w.-]{1,160}$/.test(clienteId)
          ? (await db.collection("crm_clientes").doc(clienteId).get()).data()
          : null;
      const presencia = await ref
        .collection("presencia")
        .where("hastaMs", ">", Date.now())
        .limit(10)
        .get();
      const telefonos = [...new Set([body.waId, normalizarTelefono(body.waId)])];
      const ordenes = await db.collection('ordenes_servicio').where('clienteTelefono', 'in', telefonos).get();
      return res.json({
        ordenes: ordenes.docs.filter(d => ordenAbiertaChat(d.data())).map(d => ({ id: d.id, numero: d.data().numero || d.id, tecnicoNombre: d.data().tecnicoNombre || 'Sin técnico' })),
        atencion,
        equipo: personas,
        carteraNombre: cartera?.responsableNombre || null,
        redactando: presencia.docs
          .filter((d) => d.id !== uid)
          .map((d) => ({ nombre: d.data().nombre })),
      });
    }
    if (
      !Number.isSafeInteger(body.version) ||
      body.version < 0 ||
      typeof body.requestId !== "string" ||
      !/^[\w-]{16,80}$/.test(body.requestId)
    )
      throw new ErrorAcceso(400, "Solicitud inválida.");
    if (
      typeof body.motivo !== "undefined" &&
      (typeof body.motivo !== "string" || body.motivo.length > 1000)
    )
      throw new ErrorAcceso(400, "Resumen demasiado largo.");
    const evento = ref.collection("eventos").doc(body.requestId);
    await db.runTransaction(async (tx) => {
      const [conv, estado, previo, actor] = await Promise.all([
        tx.get(convRef),
        tx.get(ref),
        tx.get(evento),
        tx.get(db.collection("usuarios").doc(uid)),
      ]);
      if (!conv.exists)
        throw new ErrorAcceso(404, "Conversación no disponible.");
      if (previo.exists) {
        if (
          previo.data()?.actorId !== uid ||
          previo.data()?.accion !== body.accion ||
          previo.data()?.destinoId !== (body.destinoId || null) ||
          previo.data()?.motivo !== (body.motivo || "") || (previo.data()?.ordenId || null) !== (body.ordenId || null)
        )
          throw new ErrorAcceso(409, "Identificador de operación reutilizado.");
        return;
      }
      const actual = inicial(conv.data()!, estado.data());
      if (actual.version !== body.version)
        throw new ErrorAcceso(
          409,
          "El chat cambió. Actualiza antes de continuar.",
        );
      let destino: { uid: string; nombre: string } | undefined;
      if (body.accion === "traspasar" || body.accion === "transferir") {
        if (
          typeof body.destinoId !== "string" ||
          !/^[\w.-]{1,160}$/.test(body.destinoId)
        )
          throw new ErrorAcceso(400, "Selecciona una responsable.");
        const persona = (
          await tx.get(db.collection("usuarios").doc(body.destinoId))
        ).data();
        if (
          !persona ||
          !oficina.includes(persona.rol) ||
          persona.activo === false ||
          persona.eliminado
        )
          throw new ErrorAcceso(400, "Responsable no disponible.");
        destino = {
          uid: body.destinoId,
          nombre: persona.nombre || "Sin nombre",
        };
      }
      let siguiente: AtencionChat;
      try {
        siguiente = cambiarAtencion(
          actual,
          {
            uid,
            nombre: actor.data()?.nombre || "Usuario",
            supervisor: ["administrador", "coordinadora"].includes(rol),
          },
          body.accion as AccionAtencion,
          destino,
          body.motivo,
        );
      } catch (e) {
        throw new ErrorAcceso(400, (e as Error).message);
      }
      let ordenRef: FirebaseFirestore.DocumentReference | null = null;
      let ordenAnterior: Record<string, unknown> | null = null;
      let versionOrden = 0;
      if (body.accion === 'transferir') {
        if (actor.data()?.permisosPersonalizados && actor.data()?.permisosSistema?.ordenesEditar !== true) throw new ErrorAcceso(403, 'No tienes permiso para cambiar la asignación de citas.');
        const abiertas = await tx.get(db.collection('ordenes_servicio').where('clienteTelefono', 'in', [...new Set([body.waId, normalizarTelefono(body.waId)])]));
        const activas = abiertas.docs.filter(d => ordenAbiertaChat(d.data()));
        if (activas.length && !body.ordenId) throw new ErrorAcceso(400, 'Selecciona la cita que vas a traspasar.');
        if (body.ordenId) {
          const orden = activas.find(d => d.id === body.ordenId);
          if (!orden) throw new ErrorAcceso(400, 'La cita no corresponde a este cliente o ya está cerrada.');
          ordenRef = orden.ref; ordenAnterior = orden.data();
          versionOrden = (await tx.get(db.collection("crm_ordenes").doc(orden.id))).data()?.version || 0;
        }
      }
      if (ordenRef && destino) {
        tx.update(ordenRef, { operariaId: destino.uid, operariaNombre: destino.nombre, responsableId: destino.uid, responsableNombre: destino.nombre, tecnicoId: FieldValue.delete(), tecnicoNombre: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() });
        tx.set(db.collection('crm_ordenes').doc(ordenRef.id), { responsableId: destino.uid, responsableNombre: destino.nombre, revision: null, version: versionOrden + 1 }, { merge: true });
        tx.set(db.collection('crm_chat_rutas').doc(body.waId), { ordenId: ordenRef.id, desdeMs: Date.now(), actualizadoPor: uid }, { merge: true });
        tx.create(ordenRef.collection('cambios_asignacion').doc(body.requestId), { actorId: uid, anteriorOperariaId: ordenAnterior?.operariaId || null, anteriorTecnicoId: ordenAnterior?.tecnicoId || null, nuevaOperariaId: destino.uid, motivo: body.motivo, fecha: FieldValue.serverTimestamp() });
      }
      tx.set(
        ref,
        { ...siguiente, actualizadoEn: FieldValue.serverTimestamp() },
        { merge: true },
      );
      tx.update(convRef, { asignadaA: siguiente.responsableId });
      tx.create(evento, {
        actorId: uid,
        actorNombre: actor.data()?.nombre || "Usuario",
        accion: body.accion,
        destinoId: body.destinoId || null,
        motivo: body.motivo || "",
        ordenId: body.ordenId || null,
        anterior: actual,
        siguiente,
        fecha: FieldValue.serverTimestamp(),
      });
      if (destino)
        tx.create(db.collection("notificaciones").doc(), {
          userId: destino.uid,
          tipo: body.accion === "transferir" ? "crm_asignacion" : "crm_traspaso",
          titulo: body.accion === "transferir" ? "Conversación asignada" : "Chat pendiente de recibir",
          mensaje:
            body.accion === "transferir" ? "Revisa el resumen y asigna un técnico a la cita transferida." : "Te han solicitado recibir una conversación. Revisa el resumen antes de aceptarla.",
          conversacionId: body.waId,
          leida: false,
          createdAt: FieldValue.serverTimestamp(),
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
            : "No se pudo actualizar la atención.",
      });
  }
}
