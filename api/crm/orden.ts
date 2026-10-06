import { leerComisionRetenida, liberarComisionPorCobro } from '../_lib/comisionCobro.js';
import { POLITICA_COBRO_COMISION } from '../../src/utils/comisionCobro.js';
import { operariaDeTecnico } from '../_lib/equipoResponsable.js';
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { accesoEquipo, ErrorAcceso } from "../_lib/accesoEquipo.js";
import {
  balanceCrm,
  centavos,
  efectivoPendiente,
  normalizarTelefono,
  textoRecibo,
  totalAcordado,
  type CrmPago,
} from "../../src/utils/crm.js";

const OFICINA = ["administrador", "coordinadora", "secretaria", "operaria"];
const idValido = (s: unknown) =>
  typeof s === "string" && /^[\w.-]{1,160}$/.test(s);
const exigir = (ok: unknown, mensaje: string, status = 400) => {
  if (!ok) throw new ErrorAcceso(status, mensaje);
};
const limpio = (x: unknown, max = 3000) => {
  exigir(
    typeof x === "string" && x.trim().length > 0 && x.length <= max,
    "Texto vacío o demasiado largo.",
  );
  return (x as string).trim();
};
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (!["GET", "POST"].includes(req.method || ""))
    return res.status(405).json({ error: "Método no permitido." });
  try {
    const { db, uid, rol } = await accesoEquipo(req);
    const perfil = (await db.collection("usuarios").doc(uid).get()).data()!;
    const oficina = OFICINA.includes(rol),
      supervisor = ["administrador", "coordinadora"].includes(rol);
    const permiso = (nombre: string, defecto: boolean) =>
      perfil.permisosPersonalizados === true
        ? perfil.permisosSistema?.[nombre] === true
        : defecto;
    const nombre = String(perfil.nombre || perfil.displayName || "Usuario");
    const body =
      req.method === "POST"
        ? typeof req.body === "string"
          ? JSON.parse(req.body)
          : req.body
        : req.query;
    exigir(body && typeof body === "object", "Solicitud inválida.");
    const ordenId = body.ordenId;
    exigir(idValido(ordenId), "Orden inválida.");
    const ref = db.collection("ordenes_servicio").doc(ordenId);
    const crm = db.collection("crm_ordenes").doc(ordenId);
    if (req.method === "GET") {
      const snap = await ref.get();
      exigir(
        snap.exists && !snap.data()?.eliminada,
        "Orden no disponible.",
        404,
      );
      const o = snap.data()!;
      exigir(
        oficina || o.tecnicoId === uid,
        "No tienes acceso a esta orden.",
        403,
      );
      const [meta, eventos, notas, equipo, recibos, cartera] =
        await Promise.all([
          crm.get(),
          crm.collection("eventos").limit(201).get(),
          crm.collection("notas").limit(201).get(),
          oficina ? db.collection("usuarios").get() : Promise.resolve(null),
          oficina ? crm.collection("recibos").get() : Promise.resolve(null),
          oficina && idValido(o.clienteId)
            ? db.collection("crm_clientes").doc(o.clienteId).get()
            : Promise.resolve(null),
        ]);
      const notasVisibles = notas.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((n: any) => oficina || n.visibilidad === "tecnico");
      const historial = oficina
        ? eventos.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .sort((a: any, b: any) => b.fechaMs - a.fechaMs)
        : [];
      const revision = meta.data()?.revision;
      const revisionVigente = revision?.estado === "revisado" &&
        revision.precioFinal === (o.precioFinal ?? null) &&
        revision.tecnicoId === (o.tecnicoId || null) &&
        isDeepStrictEqual(revision.pagos, o.pagos || []) &&
        isDeepStrictEqual(revision.cierreServicio, o.cierreServicio || null);
      const pagos = (o.pagos || []) as CrmPago[];
      return res.json({
        cartera: cartera?.data() || null,
        recibos: recibos?.docs.map((d) => ({ id: d.id, ...d.data() })) || [],
        orden: oficina
          ? { id: snap.id, ...o }
          : {
              id: snap.id,
              numero: o.numero,
              equipoTipo: o.equipoTipo,
              equipoMarca: o.equipoMarca,
            },
        meta: oficina
          ? { ...(meta.data() || { version: 0 }), revisionVigente,
              etapa: o.facturada ? "cerrada" : o.cierreServicio || o.fase === "trabajo_realizado" ? "supervision" : meta.data()?.etapa,
              responsableNombre: o.facturada ? o.facturadaPorNombre || meta.data()?.responsableNombre : (o.cierreServicio || o.fase === "trabajo_realizado") && !meta.data()?.revision ? "Supervisión pendiente de asignar" : meta.data()?.responsableNombre,
            }
          : {
              version: meta.data()?.version || 0,
              propuesta: meta.data()?.propuesta || null,
            },
        notas: notasVisibles,
        eventos: historial,
        parcial: notas.size > 200 || eventos.size > 200,
        balance: oficina ? balanceCrm(pagos, totalAcordado(o)) : null,
        permisos: {
          oficina,
          supervisor,
          verificar: oficina && permiso("pagosVerificar", supervisor),
          registrar: oficina && permiso("pagosRegistrar", true),
        },
        equipo:
          equipo?.docs
            .filter((d) => d.data().activo !== false && !d.data().eliminado)
            .map((d) => ({
              uid: d.id,
              nombre: d.data().nombre || "Sin nombre",
              rol: d.data().rol,
            })) || [],
      });
    }
    exigir(
      oficina || (rol === "tecnico" && body.accion === "propuesta"),
      "Esta gestión corresponde a oficina.",
      403,
    );
    exigir(idValido(body.operacionId), "Identificador de operación inválido.");
    const hash = createHash("sha256")
      .update(JSON.stringify(body))
      .digest("hex");
    const eventoRef = crm.collection("eventos").doc(body.operacionId);
    const action = String(body.accion);
    const resultado = await db.runTransaction(async (tx) => {
      const [snap, metaSnap, previo] = await Promise.all([
        tx.get(ref),
        tx.get(crm),
        tx.get(eventoRef),
      ]);
      const comisionRetenida = ['pago', 'confirmar_pago', 'entrega_efectivo'].includes(action) ? await leerComisionRetenida(tx, db, ordenId) : null;

      exigir(
        snap.exists && !snap.data()?.eliminada,
        "Orden no disponible.",
        404,
      );
      if (previo.exists) {
        exigir(
          previo.data()?.hash === hash && previo.data()?.actorId === uid,
          "Operación reutilizada con datos diferentes.",
          409,
        );
        return { duplicado: true };
      }
      const o = snap.data()!,
        meta = metaSnap.data() || { version: 0 };
      exigir(
        oficina || o.tecnicoId === uid,
        "No eres el técnico asignado.",
        403,
      );
      exigir(
        Number(body.version) === (meta.version || 0),
        "Otra persona actualizó el caso. Recarga y revisa antes de guardar.",
        409,
      );
      const ahora = Timestamp.now(),
        fechaMs = ahora.toMillis();
      let cambio: Record<string, unknown> = {},
        cambiosCrm: Record<string, unknown> = {};
      let detalle: Record<string, unknown> = {};
      let source: Record<string, unknown> | null = null;
      if (body.wamid) {
        exigir(
          typeof body.wamid === "string" &&
            body.wamid.length < 300 &&
            !body.wamid.includes("/"),
          "Mensaje inválido.",
        );
        const msg = await tx.get(
          db.collection("whatsapp_mensajes_inbox").doc(body.wamid),
        );
        exigir(
          msg.exists &&
            normalizarTelefono(msg.data()?.wa_id) ===
              normalizarTelefono(o.clienteTelefono) &&
            normalizarTelefono(o.clienteTelefono).length === 10,
          "El mensaje no corresponde al cliente de esta orden.",
          403,
        );
        if (["image", "video", "audio", "document", "sticker"].includes(msg.data()!.tipo)) {
          const evidenceId = createHash("sha256")
            .update(body.wamid)
            .digest("hex");
          const evidence = await tx.get(
            crm.collection("evidencias").doc(evidenceId),
          );
          exigir(evidence.exists, "Guarda primero la imagen de evidencia.");
        }
        source = {
          wamid: body.wamid,
          waId: msg.data()!.wa_id,
          tipo: msg.data()!.tipo,
          texto: String(
            msg.data()!.contenido?.texto ||
              msg.data()!.contenido?.mediaCaption ||
              "",
          ).slice(0, 3000),
          fecha: msg.data()!.timestampMeta || null,
        };
      }
      if (action === "propuesta") {
        exigir(
          !o.cierreServicio &&
            !["cerrado", "trabajo_realizado", "cancelado"].includes(o.fase),
          "La visita está terminada; solicita revisión a oficina.",
        );
        const diagnostico = limpio(body.diagnostico, 3000);
        exigir(
          Array.isArray(body.piezas) && body.piezas.length <= 20,
          "Lista de piezas inválida.",
        );
        const piezas = body.piezas.map((p: any) => {
          const pieza = limpio(p.nombre, 200),
            cantidad = Number(p.cantidad),
            costoUnitario = centavos(p.costoUnitario) / 100;
          exigir(
            Number.isInteger(cantidad) && cantidad >= 1 && cantidad <= 100,
            "Cantidad inválida.",
          );
          const url = new URL(String(p.fotoUrl));
          exigir(
            ((url.protocol === "https:" && url.hostname === "firebasestorage.googleapis.com") ||
              ("projectId" in db && db.projectId === "demo-mister-ensayo" && process.env.FIREBASE_STORAGE_EMULATOR_HOST === "127.0.0.1:9298" && url.origin === "http://127.0.0.1:9298")) &&
              decodeURIComponent(url.pathname).includes(
                `/fotos-piezas/${ordenId}/`,
              ),
            "Cada pieza necesita una foto subida para esta orden.",
          );
          return {
            nombre: pieza,
            cantidad,
            costoUnitario,
            fotoUrl: String(p.fotoUrl),
          };
        });
        const manoObraSugerida = centavos(body.manoObraSugerida) / 100;
        const revision = Number(meta.propuesta?.revision || 0) + 1;
        cambiosCrm.propuesta = {
          revision,
          diagnostico,
          piezas,
          manoObraSugerida,
          estado: "pendiente",
          autorId: uid,
          autorNombre: nombre,
          fechaMs,
        };
        cambiosCrm.revision = null;
        cambio = {
          estadoAprobacion: "pendiente",
          propuestaCrmRevision: revision,
          propuestaCrmAprobada: null,
          fase: "en_cotizacion",
          estado: "activo",
          estadoSimple: "pendiente",
        };
        detalle = cambiosCrm.propuesta as Record<string, unknown>;
      } else if (
        action === "aprobar_propuesta" ||
        action === "devolver_propuesta"
      ) {
        exigir(
          oficina && permiso("ordenesEditar", true),
          "Solo oficina puede revisar el presupuesto.",
          403,
        );
        exigir(
          meta.propuesta &&
            meta.propuesta.estado === "pendiente" &&
            meta.propuesta.revision === body.revision,
          "La propuesta cambió o ya fue revisada.",
          409,
        );
        exigir(
          !o.cierreServicio &&
            !["cerrado", "trabajo_realizado", "cancelado"].includes(o.fase),
          "La visita está terminada.",
        );
        const acuerdo = limpio(body.motivo, 1500);
        cambiosCrm.propuesta = {
          ...meta.propuesta,
          estado:
            action === "aprobar_propuesta"
              ? "aprobado"
              : "requiere_informacion",
          revisadoPor: uid,
          revisadoNombre: nombre,
          acuerdo,
          revisadoEnMs: fechaMs,
        };
        if (action === "aprobar_propuesta") {
          const precio = centavos(body.precioFinal) / 100;
          cambio = {
            precioFinal: precio,
            precioAprobado: precio,
            estadoAprobacion: "aprobado",
            aprobadoPor: nombre,
            fechaAprobacion: ahora,
            propuestaCrmAprobada: meta.propuesta.revision,
            fase: "aprobado",
            estadoSimple: "pendiente",
            estado: "activo",
          };
        }
        detalle = {
          revision: body.revision,
          acuerdo,
          precioFinal: cambio.precioFinal ?? null,
        };
      } else if (action === "cartera") {
        exigir(
          supervisor,
          "Solo supervisión asigna la cartera del cliente.",
          403,
        );
        exigir(
          idValido(o.clienteId) && idValido(body.destinoId),
          "Cliente o responsable inválido.",
        );
        const dest = await tx.get(
          db.collection("usuarios").doc(body.destinoId),
        );
        const clienteRef = db.collection("crm_clientes").doc(o.clienteId);
        const anterior = await tx.get(clienteRef);
        exigir(
          dest.exists &&
            dest.data()?.activo !== false &&
            !dest.data()?.eliminado &&
            OFICINA.includes(dest.data()?.rol),
          "Selecciona responsable de oficina activo.",
        );
        exigir(
          (anterior.data()?.version || 0) === (body.carteraVersion || 0),
          "La cartera cambió desde que abriste la ficha.",
          409,
        );
        detalle = {
          anteriorId: anterior.data()?.responsableId || null,
          destinoId: body.destinoId,
          destinoNombre: dest.data()!.nombre || "Sin nombre",
          motivo: limpio(body.motivo, 1000),
        };
        tx.set(clienteRef, {
          responsableId: body.destinoId,
          responsableNombre: dest.data()!.nombre || "Sin nombre",
          actualizadoPor: uid,
          actualizadoMs: fechaMs,
          version: (anterior.data()?.version || 0) + 1,
        });
      } else if (action === "nota") {
        const texto = limpio(body.texto);
        const visibilidad =
          body.visibilidad === "tecnico" ? "tecnico" : "oficina";
        if (body.responsableId) {
          exigir(idValido(body.responsableId), "Responsable inválido.");
          const persona = await tx.get(
            db.collection("usuarios").doc(body.responsableId),
          );
          exigir(
            persona.exists &&
              persona.data()?.activo !== false &&
              !persona.data()?.eliminado,
            "Responsable no disponible.",
          );
          if (visibilidad === "oficina")
            exigir(
              OFICINA.includes(persona.data()?.rol),
              "Un pendiente de oficina necesita responsable de oficina.",
            );
          else
            exigir(
              OFICINA.includes(persona.data()?.rol) ||
                body.responsableId === o.tecnicoId,
              "Selecciona oficina o el técnico asignado.",
            );
        }
        tx.create(crm.collection("notas").doc(body.operacionId), {
          texto,
          visibilidad,
          fuente: source,
          autorId: uid,
          autorNombre: nombre,
          fechaMs,
          destacada: body.destacada === true,
          responsableId: body.responsableId || null,
          resuelta: false,
        });
        detalle = { texto, visibilidad, fuente: source };
      } else if (action === "resolver_nota") {
        exigir(idValido(body.notaId), "Nota inválida.");
        const nr = crm.collection("notas").doc(body.notaId),
          nota = await tx.get(nr);
        exigir(nota.exists, "Nota no encontrada.", 404);
        tx.update(nr, {
          resuelta: true,
          resueltaPor: uid,
          resueltaPorNombre: nombre,
          resueltaEnMs: fechaMs,
        });
        detalle = { notaId: body.notaId };
      } else if (action === "traspasar") {
        exigir(
          !meta.traspaso,
          "Ya hay un traspaso pendiente. Recíbelo o cancélalo antes de enviar otro.",
          409,
        );
        exigir(idValido(body.destinoId), "Elige quién recibe el caso.");
        const destino = await tx.get(
          db.collection("usuarios").doc(body.destinoId),
        );
        exigir(
          destino.exists &&
            destino.data()?.activo !== false &&
            !destino.data()?.eliminado &&
            OFICINA.includes(destino.data()?.rol),
          "Selecciona una persona activa de oficina.",
        );
        exigir(
          supervisor ||
            (meta.responsableId || o.responsableId || o.operariaId) === uid,
          "Solo responsable actual o supervisión puede traspasar.",
          403,
        );
        exigir(
          ["secretaria", "operaria", "supervision"].includes(body.etapa),
          "Etapa inválida.",
        );
        const rolesEtapa: Record<string, string[]> = {
          secretaria: [
            "secretaria",
            "operaria",
            "coordinadora",
            "administrador",
          ],
          operaria: ["operaria", "coordinadora", "administrador"],
          supervision: ["coordinadora", "administrador"],
        };
        exigir(
          rolesEtapa[body.etapa].includes(destino.data()!.rol),
          "La persona no puede recibir esa etapa.",
        );
        cambiosCrm.traspaso = {
          deId: meta.responsableId || o.responsableId || o.operariaId || null,
          destinoId: body.destinoId,
          destinoNombre: destino.data()!.nombre || "Sin nombre",
          etapa: body.etapa,
          motivo: limpio(body.motivo, 1000),
          enviadoPor: uid,
          fechaMs,
        };
        detalle = cambiosCrm.traspaso as Record<string, unknown>;
      } else if (action === "recibir") {
        exigir(
          meta.traspaso?.destinoId === uid,
          "Solo la persona destinataria puede recibir el caso.",
          403,
        );
        cambiosCrm = {
          responsableId: uid,
          responsableNombre: nombre,
          etapa: meta.traspaso.etapa,
          traspaso: null,
        };
        cambio = {
          responsableId: uid,
          responsableNombre: nombre,
          ...(meta.traspaso.etapa === "operaria"
            ? { operariaId: uid, operariaNombre: nombre }
            : {}),
        };
        detalle = {
          anteriorId: meta.traspaso.deId,
          destinoId: uid,
          etapa: meta.traspaso.etapa,
        };
      } else if (action === "cancelar_traspaso") {
        exigir(
          supervisor && meta.traspaso,
          "Solo supervisión cancela un traspaso pendiente.",
          403,
        );
        detalle = {
          anterior: meta.traspaso,
          motivo: limpio(body.motivo, 1000),
        };
        cambiosCrm.traspaso = null;
      } else if (action === "pago") {
        exigir(
          permiso("pagosRegistrar", true),
          "No tienes permiso para registrar pagos.",
          403,
        );
        const monto = centavos(body.monto) / 100;
        exigir(
          monto > 0 &&
            ["efectivo", "transferencia", "tarjeta"].includes(body.metodo),
          "Pago inválido.",
        );
        const pagos = (o.pagos || []) as (CrmPago & Record<string, unknown>)[];
        exigir(
          pagos.length < 100,
          "Esta orden requiere revisión antes de añadir más pagos.",
        );
        let receptor: Record<string, unknown> = {};
        if (body.metodo === "efectivo") {
          exigir(
            idValido(body.receptorId),
            "Selecciona quién recibió realmente el efectivo.",
          );
          const pr = await tx.get(
            db.collection("usuarios").doc(body.receptorId),
          );
          exigir(
            pr.exists && pr.data()?.activo !== false && !pr.data()?.eliminado,
            "Receptor no disponible.",
          );
          receptor = {
            recibidoPorId: body.receptorId,
            recibidoPorNombre: pr.data()!.nombre || "Sin nombre",
          };
        } else
          exigir(
            typeof body.referencia === "string" &&
              body.referencia.trim().length >= 3,
            "Incluye la referencia reportada del pago.",
          );
        const referencia = String(body.referencia || "")
          .trim()
          .slice(0, 120);
        exigir(
          !source ||
            !pagos.some((p) => (p.fuente as any)?.wamid === body.wamid),
          "Ese mensaje ya respalda un pago en esta orden. Revisa el registro existente.",
          409,
        );
        exigir(
          !referencia ||
            !pagos.some(
              (p) => p.referencia === referencia && p.metodo === body.metodo,
            ),
          "Ya existe esa referencia en la orden.",
          409,
        );
        const clavesComprobante = [
          ...(source ? [`mensaje:${source.waId}:${body.wamid}`] : []),
          ...(referencia
            ? [
                `referencia:${o.clienteId || normalizarTelefono(o.clienteTelefono)}:${body.metodo}:${referencia.toLowerCase()}`,
              ]
            : []),
        ];
        const refsComprobante = clavesComprobante.map((k) =>
          db
            .collection("crm_comprobantes")
            .doc(createHash("sha256").update(k).digest("hex")),
        );
        for (const cr of refsComprobante) {
          const existente = await tx.get(cr);
          exigir(
            !existente.exists,
            "Ese comprobante ya está registrado en otra operación. Revisa la orden original antes de asignar otro abono.",
            409,
          );
        }
        for (const cr of refsComprobante)
          tx.create(cr, {
            ordenId,
            pagoId: body.operacionId,
            fechaMs,
            actorId: uid,
          });
        const pago = {
          id: body.operacionId,
          monto,
          metodo: body.metodo,
          referencia,
          ...receptor,
          fecha: ahora,
          registradoPorId: uid,
          registradoPorNombre: nombre,
          verificado: false,
          crm: true,
          ...(body.metodo === "efectivo" ? { requiereAceptacionEfectivo: true } : {}),
          fuente: source,
        };
        const nuevos = [...pagos, pago];
        cambio = {
          pagos: nuevos,
          montoPagado: balanceCrm(nuevos, totalAcordado(o)).confirmados,
          montoReportado: nuevos.reduce((s, p) => s + Number(p.monto), 0),
          ...(body.metodo === "efectivo" ? { flujoEfectivo: "confirmacion_tecnico" } : {}),
          crmGestion: true,
        };
        detalle = {
          pagoId: pago.id,
          monto,
          metodo: pago.metodo,
          fuente: source,
        };
      } else if (["confirmar_pago", "entrega_efectivo"].includes(action)) {
        exigir(
          permiso("pagosVerificar", supervisor),
          "No tienes permiso para confirmar dinero recibido.",
          403,
        );
        const pagos = (o.pagos || []) as (CrmPago & Record<string, unknown>)[];
        const i = pagos.findIndex((p) => p.id === body.pagoId);
        exigir(i >= 0, "Pago no encontrado.", 404);
        const p = pagos[i];
        if (action === "confirmar_pago") {
          exigir(!p.verificado, "El pago ya está confirmado.", 409);
          const referencia =
            p.metodo === "efectivo"
              ? p.referencia || ""
              : limpio(body.referencia, 120);
          if (p.metodo === "efectivo")
            exigir(
              p.recibidoPorId,
              "Falta identificar el receptor del efectivo.",
            );
          const actualizado = {
            ...p,
            referencia,
            verificado: true,
            verificadoPorId: uid,
            verificadoPorNombre: nombre,
            verificadoAt: ahora,
          };
          pagos[i] = actualizado;
          const saldo = balanceCrm(pagos, totalAcordado(o)).saldo;
          const recibo = {
            pagoId: p.id,
            fechaMs,
            texto:
              textoRecibo(o, actualizado, saldo) +
              `\nTotal aprobado: ${totalAcordado(o) === null ? "Por confirmar" : "RD$ " + totalAcordado(o)}\nAbonos confirmados acumulados: RD$ ${balanceCrm(pagos, totalAcordado(o)).confirmados}` +
              `\nConfirmado: ${new Date(fechaMs).toLocaleString("es-DO", { timeZone: "America/Santo_Domingo" })}`,
            saldo,
            monto: p.monto,
            referencia,
            ordenNumero: o.numero || "",
            clienteNombre: o.clienteNombre || "",
          };
          tx.create(crm.collection("recibos").doc(p.id), recibo);
          detalle = { pagoId: p.id, referencia, monto: p.monto };
        } else {
          exigir(p.requiereAceptacionEfectivo !== true, "Recibe este efectivo desde el panel de responsabilidad de la orden.", 409);
          const monto = centavos(body.monto) / 100;
          exigir(
            p.crm === true,
            "Concilia primero este pago histórico antes de usar la nueva rendición.",
          );
          exigir(
            monto > 0 && monto <= efectivoPendiente(p),
            "La entrega supera el efectivo pendiente o el pago no está confirmado.",
          );
          pagos[i] = {
            ...p,
            entregadoOficina:
              (centavos(p.entregadoOficina || 0) + centavos(monto)) / 100,
          };
          detalle = {
            pagoId: p.id,
            receptorId: p.recibidoPorId,
            receptorNombre: p.recibidoPorNombre,
            monto,
            motivo: limpio(body.motivo, 1000),
          };
        }
        cambio.pagos = pagos;
        cambio.montoPagado = balanceCrm(pagos, totalAcordado(o)).confirmados;
        cambio.crmGestion = true;
      } else if (action === "agenda") {
        exigir(
          permiso("ordenesEditar", true),
          "No tienes permiso para editar la agenda.",
          403,
        );
        exigir(idValido(body.tecnicoId), "Selecciona técnico.");
        const tecnico = await tx.get(
          db.collection("usuarios").doc(body.tecnicoId),
        );
        exigir(
          tecnico.exists &&
            tecnico.data()?.rol === "tecnico" &&
            tecnico.data()?.activo !== false &&
            !tecnico.data()?.eliminado,
          "Técnico no disponible.",
        );
        const operaria = await operariaDeTecnico(db, tx, body.tecnicoId);
        const telefonoChat = String(o.clienteTelefono || "").replace(/\D/g, "").slice(-10);
        const convs = telefonoChat.length === 10 ? await tx.get(db.collection("whatsapp_conversaciones").where("wa_id", "in", [telefonoChat, "1" + telefonoChat])) : null;
        const estados = convs ? await Promise.all(convs.docs.map(d => tx.get(db.collection("crm_atencion").doc(d.id)))) : [];
        const fecha = new Date(body.fechaCita);
        exigir(
          Number.isFinite(fecha.getTime()) &&
            fecha.getTime() > Date.now() - 60000,
          "Selecciona una cita futura válida.",
        );
        const otras = await tx.get(
          db
            .collection("ordenes_servicio")
            .where("tecnicoId", "==", body.tecnicoId),
        );
        const inicio = fecha.getTime(),
          fin = inicio + (Number(o.duracionMin) || 60) * 60000;
        const choque = otras.docs.some((d) => {
          const x = d.data();
          if (
            d.id === ordenId ||
            x.eliminada ||
            ["cancelado", "cerrado", "trabajo_realizado"].includes(x.fase)
          )
            return false;
          const i = x.fechaCita?.toMillis?.();
          return (
            typeof i === "number" &&
            inicio < i + (Number(x.duracionMin) || 60) * 60000 &&
            fin > i
          );
        });
        exigir(
          !choque,
          "El técnico ya tiene una cita que coincide con ese horario.",
          409,
        );
        detalle = {
          fechaAnterior: o.fechaCita || null,
          tecnicoAnterior: o.tecnicoId || null,
          motivo: limpio(body.motivo, 1000),
        };
        cambio = {
          fechaCita: Timestamp.fromDate(fecha),
          tecnicoId: body.tecnicoId,
          tecnicoNombre: tecnico.data()!.nombre || "Sin nombre",
        };
        cambio.operariaId = operaria.uid; cambio.operariaNombre = operaria.nombre;
        cambio.responsableId = operaria.uid; cambio.responsableNombre = operaria.nombre;
        cambiosCrm.responsableId = operaria.uid; cambiosCrm.responsableNombre = operaria.nombre;
        for (const [i, conv] of (convs?.docs || []).entries()) {
          tx.update(conv.ref, { asignadaA: operaria.uid });
          tx.set(db.collection('crm_atencion').doc(conv.id), { responsableId: operaria.uid, responsableNombre: operaria.nombre, traspaso: null, pendiente: true, version: (estados[i]?.data()?.version || 0) + 1, actualizadoEn: FieldValue.serverTimestamp() }, { merge: true });
          tx.set(db.collection('crm_chat_rutas').doc(conv.id), { ordenId, desdeMs: Date.now(), actualizadoPor: uid }, { merge: true });
        }
        cambiosCrm.revision = null;
      } else if (action === "revision") {
        exigir(supervisor, "La revisión final corresponde a supervisión.", 403);
        exigir(
          o.cierreServicio || ["cerrado", "trabajo_realizado"].includes(o.fase),
          "El técnico todavía no ha cerrado su trabajo.",
        );
        cambiosCrm.revision = {
          actorId: uid,
          actorNombre: nombre,
          fechaMs,
          observaciones: limpio(body.motivo, 1500),
          estado: body.conforme === true ? "revisado" : "requiere_correccion",
          precioFinal: o.precioFinal ?? null,
          pagos: o.pagos || [],
          cierreServicio: o.cierreServicio || null,
          tecnicoId: o.tecnicoId || null,
        };
        cambiosCrm.responsableId = uid;
        cambiosCrm.responsableNombre = nombre;
        cambiosCrm.etapa = o.facturada ? "cerrada" : "supervision";
        cambio = { responsableId: uid, responsableNombre: nombre };
        detalle = cambiosCrm.revision as Record<string, unknown>;
      } else throw new ErrorAcceso(400, "Acción no disponible.");
      if (Array.isArray(cambio.pagos)) {
        cambiosCrm.revision = null;
        const balance = balanceCrm(cambio.pagos as CrmPago[], totalAcordado(o));
        cambio.montoPagado = balance.confirmados;
        cambio.montoReportado = balance.confirmados + balance.pendientes;
        cambio.estadoPago =
          balance.saldo === 0 && totalAcordado(o) !== null
            ? "completo"
            : balance.confirmados > 0
              ? "parcial"
              : "pendiente";
      }
      const comisionLiberada = comisionRetenida ? liberarComisionPorCobro(tx, comisionRetenida, { ...o, ...cambio }, ahora, POLITICA_COBRO_COMISION) : false;
      if (comisionLiberada) detalle = { ...detalle, comisionLiberada: true };
      if (Object.keys(cambio).length)
        tx.update(ref, { ...cambio, updatedAt: FieldValue.serverTimestamp() });
      if (action === "pago" && body.metodo === "efectivo" && Array.isArray(cambio.pagos)) {
        const pago = cambio.pagos.find((p: { id: string }) => p.id === body.operacionId);
        if (pago) tx.create(db.collection("notificaciones").doc(`efectivo-${ordenId}-${pago.id}`), { userId: pago.recibidoPorId, destinatarioNombre: pago.recibidoPorNombre || 'Técnico', tipo: 'pago_registrado', titulo: 'Confirma el efectivo recibido', mensaje: `Oficina registró RD$${pago.monto} en efectivo. Confirma la recepción en la orden.`, ordenId, leida: false, createdAt: ahora });
      }
      tx.set(
        crm,
        {
          ...cambiosCrm,
          participantes: {
            ...(meta.participantes || {}),
            [uid]: nombre,
            ...(action === "recibir" ? { [uid]: nombre } : {}),
          },
          version: (meta.version || 0) + 1,
          clienteId: o.clienteId || null,
          ordenNumero: o.numero || "",
          actualizadoMs: fechaMs,
        },
        { merge: true },
      );
      tx.create(eventoRef, {
        accion: action,
        actorId: uid,
        actorNombre: nombre,
        detalle,
        fechaMs,
        hash,
      });
      tx.create(db.collection("auditoria_admin").doc(), {
        accion: `crm.${action}`,
        comisionLiberada,
        ordenId,
        actorId: uid,
        operacionId: body.operacionId,
        fecha: ahora,
      });
      return { ok: true };
    });
    return res.json(resultado);
  } catch (e) {
    return res
      .status(e instanceof ErrorAcceso ? e.status : 500)
      .json({
        error:
          e instanceof ErrorAcceso
            ? e.message
            : "No se pudo completar la operación. Reintenta con los mismos datos o recarga.",
      });
  }
}
