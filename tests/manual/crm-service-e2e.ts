/** Solo emulador: transacciones reales, autenticación sustituida por identidades ficticias. */
import assert from "node:assert/strict";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8189";
const projectId = "demo-mister-crm";
const app = initializeApp({ projectId });
const db = getFirestore(app),
  auth = getAuth(app);
const anterior = auth.verifyIdToken;
auth.verifyIdToken = async (token: string) => ({ uid: token }) as any;
const { default: handler } = await import("../../api/crm/orden");
const actors: Record<string, string> = {
  qa_admin: "administrador",
  qa_operaria: "operaria",
  qa_secretaria: "secretaria",
  qa_tecnico: "tecnico",
};
for (const [uid, rol] of Object.entries(actors))
  await db.doc(`usuarios/${uid}`).set({ rol, nombre: uid, activo: true });
const orderId = `qa_${Date.now()}`;
await db
  .doc(`ordenes_servicio/${orderId}`)
  .set({
    numero: "QA-CRM",
    clienteId: "qa_cliente",
    clienteNombre: "Cliente ficticio",
    clienteTelefono: "8095550011",
    tecnicoId: "qa_tecnico",
    tecnicoNombre: "Técnico QA",
    responsableId: "qa_secretaria",
    responsableNombre: "Secretaria QA",
    fase: "agendado",
    precioFinal: 8000,
    precioAprobado: 8000,
    estadoAprobacion: "aprobado",
    pagos: [],
  });
let version = 0,
  count = 0;
async function call(
  uid: string,
  accion?: string,
  extra: Record<string, unknown> = {},
) {
  let code = 200,
    result: any;
  const body = accion
    ? {
        ordenId: orderId,
        version,
        operacionId: crypto.randomUUID(),
        accion,
        ...extra,
      }
    : { ordenId: orderId };
  const res = {
    setHeader() {},
    status(n: number) {
      code = n;
      return this;
    },
    json(v: any) {
      result = v;
      return this;
    },
  };
  await handler(
    {
      method: accion ? "POST" : "GET",
      headers: { authorization: `Bearer ${uid}` },
      body,
      query: body,
    } as any,
    res as any,
  );
  if (code === 200 && accion) version++;
  return { code, result, body };
}
try {
  assert.equal(
    (
      await call("qa_secretaria", "nota", {
        texto: "Avisar antes de llegar",
        visibilidad: "tecnico",
      })
    ).code,
    200,
  );
  count++;
  assert.equal(
    (
      await call("qa_secretaria", "nota", {
        texto: "Nota privada de oficina",
        visibilidad: "oficina",
      })
    ).code,
    200,
  );
  count++;
  assert.equal(
    (
      await call("qa_secretaria", "traspasar", {
        destinoId: "qa_operaria",
        etapa: "operaria",
        motivo: "Coordinar visita",
      })
    ).code,
    200,
  );
  count++;
  assert.equal((await call("qa_admin", "recibir")).code, 403);
  count++;
  assert.equal((await call("qa_operaria", "recibir")).code, 200);
  count++;
  assert.equal(
    (
      await call("qa_tecnico", "propuesta", {
        diagnostico: "Revisar drenaje",
        piezas: [],
        manoObraSugerida: 8000,
      })
    ).code,
    200,
  );
  count++;
  assert.equal(
    (
      await call("qa_operaria", "aprobar_propuesta", {
        revision: 1,
        precioFinal: 8000,
        motivo: "Cliente acepta el servicio por RD$8,000",
      })
    ).code,
    200,
  );
  count++;
  const registro = await call("qa_operaria", "pago", {
    monto: 3000,
    metodo: "efectivo",
    receptorId: "qa_tecnico",
  });
  assert.equal(registro.code, 200);
  count++;
  const pagoId = registro.body.operacionId;
  assert.equal(
    (await call("qa_operaria", "confirmar_pago", { pagoId })).code,
    403,
  );
  count++;
  assert.equal(
    (await call("qa_admin", "confirmar_pago", { pagoId })).code,
    200,
  );
  count++;
  assert.equal(
    (
      await call("qa_admin", "entrega_efectivo", {
        pagoId,
        monto: 2000,
        motivo: "Recepción ficticia de caja",
      })
    ).code,
    200,
  );
  count++;
  const admin = await call("qa_admin");
  assert.equal(admin.result.balance.confirmados, 3000);
  assert.equal(admin.result.balance.saldo, 5000);
  assert.equal(admin.result.orden.pagos[0].entregadoOficina, 2000);
  count++;
  assert.equal(admin.result.recibos.length, 1);
  count++;
  const tecnico = await call("qa_tecnico");
  assert.equal(tecnico.result.notas.length, 1);
  assert.equal(tecnico.result.orden.pagos, undefined);
  count++;
  assert.equal(
    (
      await call("qa_admin", "revision", {
        motivo: "Todavía no terminó",
        conforme: true,
      })
    ).code,
    400,
  );
  count++;
  console.log(
    `${count} comprobaciones del flujo completo aprobadas con transacciones reales en emulador. Autenticación ficticia; ninguna operación real.`,
  );
} finally {
  auth.verifyIdToken = anterior;
  await db.terminate();
}
