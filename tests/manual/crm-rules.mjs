import { initializeApp as adminApp } from "firebase-admin/app";
import { getFirestore as adminFirestore } from "firebase-admin/firestore";
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  connectFirestoreEmulator,
  doc,
  updateDoc,
  getDoc,
  terminate,
} from "firebase/firestore";
import assert from "node:assert/strict";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8189";
const projectId = "demo-mister-crm";
const db = adminFirestore(adminApp({ projectId }));
for (const [id, rol] of [
  ["tech", "tecnico"],
  ["office", "administrador"],
])
  await db.doc(`usuarios/${id}`).set({ rol, activo: true });
await db
  .doc("ordenes_servicio/prueba")
  .set({
    tecnicoId: "tech",
    ayudanteId: "",
    estadoAprobacion: "aprobado",
    precioAprobado: 5000,
    precioFinal: 5000,
    fase: "aprobado",
    soloChequeo: false,
    sugerenciasSoloChequeo: [],
    crmGestion: true,
    pagos: [],
    montoPagado: 0,
  });
await db.doc("crm_ordenes/prueba/notas/privada").set({ texto: "Solo oficina" });
let count = 0;
async function deniega(promise, label) {
  let denied = false;
  try {
    await promise;
  } catch (e) {
    denied = e.code === "permission-denied";
  }
  assert.equal(denied, true, label);
  count++;
}
const tech = getFirestore(initializeApp({ projectId, apiKey: "demo" }, "tech"));
connectFirestoreEmulator(tech, "127.0.0.1", 8189, {
  mockUserToken: { sub: "tech" },
});
await updateDoc(doc(tech, "ordenes_servicio/prueba"), {
  notasTecnico: "Diagnóstico permitido",
});
count++;
await deniega(
  updateDoc(doc(tech, "ordenes_servicio/prueba"), { precioFinal: 9000 }),
  "técnico no cambia precio aprobado",
);
await deniega(
  updateDoc(doc(tech, "ordenes_servicio/prueba"), {
    pagos: [{ monto: 5000, verificado: true }],
  }),
  "técnico no fabrica pago",
);
await deniega(
  getDoc(doc(tech, "crm_ordenes/prueba/notas/privada")),
  "nota privada no se lee directamente",
);
const office = getFirestore(
  initializeApp({ projectId, apiKey: "demo" }, "office"),
);
connectFirestoreEmulator(office, "127.0.0.1", 8189, {
  mockUserToken: { sub: "office" },
});
await deniega(
  updateDoc(doc(office, "ordenes_servicio/prueba"), {
    pagos: [{ monto: 5000, verificado: true }],
  }),
  "oficina usa servicio auditado para pagos CRM",
);
await deniega(
  updateDoc(doc(office, "ordenes_servicio/prueba"), { crmGestion: false }),
  "no se desactiva protección desde navegador",
);
await updateDoc(doc(office, "ordenes_servicio/prueba"), {
  notas: "Edición ordinaria permitida",
});
count++;
await db
  .doc("ordenes_servicio/prueba")
  .update({
    estadoAprobacion: "pendiente",
    propuestaCrmRevision: 2,
    propuestaCrmAprobada: 1,
  });
await deniega(
  updateDoc(doc(tech, "ordenes_servicio/prueba"), { fase: "cerrado" }),
  "no cierra por estado alterno sin aprobación vigente",
);
await deniega(
  updateDoc(doc(tech, "ordenes_servicio/prueba"), {
    cierreServicio: { fechaCierre: new Date() },
  }),
  "no cierra por objeto de cierre sin aprobación",
);
await deniega(
  updateDoc(doc(office, "ordenes_servicio/prueba"), {
    propuestaCrmAprobada: 2,
  }),
  "aprobación versionada solo por servicio auditado",
);
await db
  .doc("ordenes_servicio/prueba")
  .update({ estadoAprobacion: "aprobado", propuestaCrmAprobada: 2 });
await updateDoc(doc(tech, "ordenes_servicio/prueba"), {
  fase: "trabajo_realizado",
  cierreServicio: { fechaCierre: new Date() },
});
count++;
console.log(
  `${count} comprobaciones reales de reglas aprobadas en emulador local.`,
);
await terminate(tech);
await terminate(office);
await db.terminate();
