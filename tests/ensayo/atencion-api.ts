import { Readable } from "node:stream";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9198";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8289";
initializeApp({ projectId: "demo-mister-ensayo" });
const db = getFirestore(),
  auth = getAuth();
const { default: atencion } = await import("../../api/crm/atencion");
const { default: bandeja } = await import("../../api/crm/bandeja");
const tokens: Record<string, string> = {};
for (const [uid, rol] of [
  ["prueba_ana", "operaria"],
  ["prueba_bea", "secretaria"],
  ["prueba_admin", "administrador"],
  ["prueba_tec", "tecnico"],
]) {
  try {
    await auth.createUser({ uid });
  } catch (e: any) {
    if (e.code !== "auth/uid-already-exists") throw e;
  }
  await db.doc(`usuarios/${uid}`).set({ rol, nombre: uid, activo: true });
  const customToken = await auth.createCustomToken(uid);
  const r = await fetch(
    "http://127.0.0.1:9198/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=demo",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  );
  tokens[uid] = (await r.json()).idToken;
}
async function call(handler: any, uid: string, body: any, method = "POST") {
  let status = 200,
    data: any;
  await handler(
    {
      method,
      headers: { authorization: `Bearer ${tokens[uid]}` },
      body,
      query: body,
    },
    {
      setHeader() {},
      status(n: number) {
        status = n;
        return this;
      },
      json(d: any) {
        data = d;
        return this;
      },
    },
  );
  return { status, data };
}
const waId = "2025550100";
await db.recursiveDelete(db.doc(`crm_atencion/${waId}`));
for (const aviso of (
  await db
    .collection("notificaciones")
    .where("conversacionId", "==", waId)
    .get()
).docs)
  await aviso.ref.delete();
await db
  .doc(`whatsapp_conversaciones/${waId}`)
  .set({
    wa_id: waId,
    asignadaA: "prueba_ana",
    clienteId: "cliente_prueba_atencion",
    noLeidos: 1,
    ultimaActividad: Timestamp.now(),
  });
await db
  .doc("crm_clientes/cliente_prueba_atencion")
  .set({ responsableId: "prueba_ana", responsableNombre: "Ana" });
const post = (uid: string, accion: string, version: number, extra = {}) =>
  call(atencion, uid, {
    waId,
    accion,
    version,
    requestId: randomUUID(),
    ...extra,
  });
assert.equal((await call(atencion, "prueba_tec", { waId }, "GET")).status, 403);
assert.equal((await post("prueba_bea", "resolver", 0)).status, 400);
const requestId = randomUUID();
assert.equal(
  (
    await post("prueba_ana", "traspasar", 0, {
      destinoId: "prueba_bea",
      motivo: "Confirmar cita",
      requestId,
    })
  ).status,
  200,
);
assert.equal(
  (
    await post("prueba_ana", "traspasar", 0, {
      destinoId: "prueba_bea",
      motivo: "Confirmar cita",
      requestId,
    })
  ).status,
  200,
);
assert.equal((await post("prueba_admin", "aceptar", 1)).status, 400);
assert.equal(
  (await db.doc(`whatsapp_conversaciones/${waId}`).get()).data()?.asignadaA,
  "prueba_ana",
);
assert.equal((await post("prueba_bea", "aceptar", 0)).status, 409);
assert.equal((await post("prueba_bea", "aceptar", 1)).status, 200);
assert.equal(
  (await db.doc(`whatsapp_conversaciones/${waId}`).get()).data()?.asignadaA,
  "prueba_bea",
);
assert.equal(
  (await db.doc("crm_clientes/cliente_prueba_atencion").get()).data()
    ?.responsableId,
  "prueba_ana",
);
const races = await Promise.all([
  post("prueba_bea", "resolver", 2),
  post("prueba_bea", "pendiente", 2),
]);
assert.deepEqual(races.map((x) => x.status).sort(), [200, 409]);
await db
  .doc("ordenes_servicio/orden_atencion_hoy")
  .set({
    clienteTelefono: "12025550100",
    fechaCita: Timestamp.now(),
    fase: "pendiente",
  });
for (const filtro of [
  "todas",
  "no_leidos",
  "cartera",
  "mias",
  "pendientes",
  "hoy",
]) {
  const r = await call(
    bandeja,
    filtro === "mias" ? "prueba_bea" : "prueba_ana",
    { filtro },
    "GET",
  );
  assert.equal(r.status, 200, JSON.stringify(r));
  if (["cartera", "mias", "no_leidos", "hoy"].includes(filtro))
    assert(r.data.items.some((x: any) => x.id === waId));
}
const avisos = await db
  .collection("notificaciones")
  .where("conversacionId", "==", waId)
  .get();
assert.equal(avisos.size, 1);
console.log(
  "Atención: roles, aceptación, cartera intacta, duplicados, conflicto concurrente y seis buzones correctos. Solo emulador.",
);

const { default: expediente } = await import("../../api/crm/expediente");
const { default: destino } = await import("../../api/crm/destino-aviso");
await db
  .doc("clientes/cliente_prueba_atencion")
  .set({
    nombre: "Cliente ficticio",
    telefono: "2025550100",
    telefonoNormalizado: "2025550100",
  });
const wamid = "prueba_atencion_" + randomUUID();
await db
  .doc(`whatsapp_mensajes_inbox/${wamid}`)
  .set({
    wa_id: waId,
    tipo: "text",
    contenido: { texto: "El equipo está en el segundo piso" },
    timestampMeta: Timestamp.now(),
  });
const entrada = {
  clienteId: "cliente_prueba_atencion",
  requestId: randomUUID(),
  texto: "Llevar ayuda para mover equipo",
  categoria: "equipo",
  wamid,
};
assert.equal((await call(expediente, "prueba_bea", entrada)).status, 200);
assert.equal((await call(expediente, "prueba_bea", entrada)).status, 200);
assert.equal((await call(expediente, "prueba_tec", entrada)).status, 403);
await db
  .doc("clientes/cliente_ajeno")
  .set({ nombre: "Otro cliente ficticio", telefono: "2025550101" });
assert.equal(
  (
    await call(expediente, "prueba_bea", {
      ...entrada,
      clienteId: "cliente_ajeno",
      requestId: randomUUID(),
    })
  ).status,
  403,
);
const documento = await db
  .doc(`crm_clientes/cliente_prueba_atencion/expediente/${entrada.requestId}`)
  .get();
assert.equal(
  documento.data()?.fuente.texto,
  "El equipo está en el segundo piso",
);
// Signed, entirely local Meta-shaped webhook; no remote request or real message.
const { default: webhook } = await import("../../api/whatsapp/webhook");
process.env.META_APP_SECRET = "solo-prueba-local";
const eventoId = "wamid.prueba_" + randomUUID();
const payload = Buffer.from(
  JSON.stringify({
    object: "whatsapp_business_account",
    entry: [
      {
        id: "ensayo",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                phone_number_id: "100000",
                display_phone_number: "12025550100",
              },
              messages: [
                {
                  id: eventoId,
                  from: waId,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: "text",
                  text: { body: "Consulta ficticia" },
                },
              ],
            },
          },
        ],
      },
    ],
  }),
);
async function entregar() {
  let status = 200;
  const req = Readable.from([payload]) as any;
  req.method = "POST";
  req.headers = {
    "x-hub-signature-256":
      "sha256=" +
      createHmac("sha256", process.env.META_APP_SECRET!)
        .update(payload)
        .digest("hex"),
  };
  await webhook(req, {
    setHeader() {},
    status(n: number) {
      status = n;
      return this;
    },
    json() {
      return this;
    },
  } as any);
  assert.equal(status, 200);
}
await entregar();
await entregar();
const nuevos = await db
  .collection("notificaciones")
  .where("conversacionId", "==", waId)
  .get();
assert.equal(nuevos.size, 2);
const mensaje = nuevos.docs.find((d) => d.data().tipo === "crm_mensaje")!;
assert.equal(mensaje.data().userId, "prueba_bea");
assert.equal(
  (await db.doc(`crm_atencion/${waId}`).get()).data()?.pendiente,
  true,
);
assert.equal(
  (await call(destino, "prueba_ana", { id: mensaje.id }, "GET")).status,
  403,
);
assert.equal(
  (await call(destino, "prueba_bea", { id: mensaje.id }, "GET")).data.ruta,
  `/admin/inbox/${waId}`,
);
console.log(
  "Expediente y webhook: texto original, permisos, cliente ajeno, reintento sin duplicado, nueva responsable y enlace autorizados correctos.",
);
const escrituraDirecta = await fetch(
  `http://127.0.0.1:8289/v1/projects/demo-mister-ensayo/databases/(default)/documents/whatsapp_conversaciones/${waId}?updateMask.fieldPaths=asignadaA`,
  { method: "PATCH", headers: { Authorization: `Bearer ${tokens.prueba_ana}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: { asignadaA: { stringValue: "prueba_ana" } } }) });
assert.equal(escrituraDirecta.status, 403);
console.log("Reglas: bloqueada reasignación directa de conversación gestionada.");
await db.terminate();
