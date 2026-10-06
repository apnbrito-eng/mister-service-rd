/* eslint-disable @typescript-eslint/no-explicit-any -- Dobles de Firebase/API deliberadamente parciales; solo fixtures de pruebas. */
import { beforeEach, describe, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({
  data: new Map<string, any>(),
  uid: "oficina",
  rol: "administrador",
  seq: 0,
}));
vi.mock("../../api/_lib/accesoEquipo.js", () => {
  class ErrorAcceso extends Error {
    constructor(
      public status: number,
      mensaje: string,
    ) {
      super(mensaje);
    }
  }
  const snap = (path: string) => ({
    id: path.split("/").pop(),
    exists: fake.data.has(path),
    data: () => structuredClone(fake.data.get(path)),
  });
  const collection = (path: string): any => ({
    doc: (id = `auto-${++fake.seq}`) => ({
      path: `${path}/${id}`,
      get: async () => snap(`${path}/${id}`),
      collection: (name: string) => collection(`${path}/${id}/${name}`),
    }),
    limit: () => collection(path),
    get: async () => {
      const docs = [...fake.data.keys()]
        .filter(
          (k) =>
            k.startsWith(path + "/") &&
            k.split("/").length === path.split("/").length + 1,
        )
        .map(snap);
      return { docs, size: docs.length };
    },
  });
  const db = {
    doc: (path: string) => ({ path }),
    collection,
    runTransaction: async (callback: any) => {
      const pending: (() => void)[] = [];
      let write = false;
      const tx = {
        get: async (ref: any) => {
          if (write) throw new Error("read after write");
          return snap(ref.path);
        },
        update: (ref: any, data: any) => {
          write = true;
          pending.push(() =>
            fake.data.set(ref.path, { ...fake.data.get(ref.path), ...data }),
          );
        },
        set: (ref: any, data: any, options?: any) => {
          write = true;
          pending.push(() =>
            fake.data.set(
              ref.path,
              options?.merge ? { ...fake.data.get(ref.path), ...data } : data,
            ),
          );
        },
        create: (ref: any, data: any) => {
          write = true;
          if (fake.data.has(ref.path)) throw new Error("duplicate create");
          pending.push(() => fake.data.set(ref.path, data));
        },
      };
      const result = await callback(tx);
      pending.forEach((f) => f());
      return result;
    },
  };
  return {
    ErrorAcceso,
    accesoEquipo: async () => ({ db, uid: fake.uid, rol: fake.rol }),
  };
});
import handler from "../../api/crm/orden";
async function llamar(body: any, method = "POST") {
  let status = 200,
    resultado: any;
  const res = {
    setHeader() {},
    status(n: number) {
      status = n;
      return this;
    },
    json(b: any) {
      resultado = b;
      return this;
    },
  };
  await handler({ method, body, query: body } as any, res as any);
  return { status, body: resultado };
}
const pago = {
  id: "pago1",
  monto: 3000,
  metodo: "efectivo",
  recibidoPorId: "tecnico1",
  recibidoPorNombre: "Técnico",
  verificado: false,
  crm: true,
};
const base = (accion: string, rest = {}) => ({
  ordenId: "orden1",
  operacionId: "op1",
  version: 0,
  accion,
  ...rest,
});
beforeEach(() => {
  fake.data.clear();
  fake.uid = "oficina";
  fake.rol = "administrador";
  fake.data.set("usuarios/oficina", {
    nombre: "Oficina",
    rol: "administrador",
  });
  fake.data.set("usuarios/operaria1", { nombre: "Operaria", rol: "operaria" });
  fake.data.set("usuarios/tecnico1", { nombre: "Técnico", rol: "tecnico" });
  fake.data.set("ordenes_servicio/orden1", {
    numero: "OS1",
    clienteNombre: "Cliente",
    clienteTelefono: "8095550000",
    tecnicoId: "tecnico1",
    responsableId: "oficina",
    estadoAprobacion: "aprobado",
    precioFinal: 8000,
    pagos: [pago],
  });
});
describe("CRM endpoint: permisos, transacciones e idempotencia", () => {
  it("la revisión guarda el estado aprobado y asigna supervisión", async () => {
    const o = fake.data.get("ordenes_servicio/orden1");
    o.fase = "trabajo_realizado";
    o.cierreServicio = { fotoUrl: "foto-ficticia" };
    expect((await llamar(base("revision", { motivo: "Revisado", conforme: true }))).status).toBe(200);
    const meta = fake.data.get("crm_ordenes/orden1");
    expect(meta.revision.precioFinal).toBe(8000);
    expect(meta.revision.pagos).toEqual([pago]);
    expect(meta.responsableId).toBe("oficina");
    expect(meta.etapa).toBe("supervision");
    expect((await llamar({ ordenId: "orden1" }, "GET")).body.meta.revisionVigente).toBe(true);
    fake.data.get("ordenes_servicio/orden1").precioFinal = 9000;
    expect((await llamar({ ordenId: "orden1" }, "GET")).body.meta.revisionVigente).toBe(false);
  });
  it("un nuevo pago confirmado invalida la revisión anterior", async () => {
    fake.data.set("crm_ordenes/orden1", { version: 0, revision: { estado: "revisado" } });
    expect((await llamar(base("confirmar_pago", { pagoId: "pago1" }))).status).toBe(200);
    expect(fake.data.get("crm_ordenes/orden1").revision).toBeNull();
  });
  it("confirmar pago crea recibo y actualiza ingreso confirmado una vez", async () => {
    const b = base("confirmar_pago", { pagoId: "pago1" });
    expect((await llamar(b)).status).toBe(200);
    expect(fake.data.get("ordenes_servicio/orden1").montoPagado).toBe(3000);
    expect(fake.data.get("crm_ordenes/orden1/recibos/pago1").saldo).toBe(5000);
    const size = fake.data.size;
    expect((await llamar(b)).body.duplicado).toBe(true);
    expect(fake.data.size).toBe(size);
  });
  it("rechaza reutilizar identificador con otros datos", async () => {
    await llamar(base("nota", { texto: "Primera", visibilidad: "oficina" }));
    expect(
      (
        await llamar(
          base("nota", { texto: "Distinta", visibilidad: "oficina" }),
        )
      ).status,
    ).toBe(409);
  });
  it("rechaza una escritura con versión anterior sin cambios parciales", async () => {
    await llamar(base("nota", { texto: "Primera" }));
    const size = fake.data.size;
    expect(
      (await llamar(base("nota", { texto: "Otra", operacionId: "op2" })))
        .status,
    ).toBe(409);
    expect(fake.data.size).toBe(size);
  });
  it("no deja confirmar dinero a una operaria sin permiso", async () => {
    fake.rol = "operaria";
    fake.uid = "operaria1";
    expect(
      (await llamar(base("confirmar_pago", { pagoId: "pago1" }))).status,
    ).toBe(403);
    expect(fake.data.get("ordenes_servicio/orden1").pagos[0].verificado).toBe(
      false,
    );
  });
  it("no permite escritura de oficina desde identidad técnica", async () => {
    fake.rol = "tecnico";
    fake.uid = "tecnico1";
    expect((await llamar(base("nota", { texto: "Intento" }))).status).toBe(403);
  });
  it("mantiene responsable al enviar y cambia solo cuando destinataria recibe", async () => {
    expect(
      (
        await llamar(
          base("traspasar", {
            destinoId: "operaria1",
            etapa: "operaria",
            motivo: "Atender cita",
          }),
        )
      ).status,
    ).toBe(200);
    expect(fake.data.get("ordenes_servicio/orden1").responsableId).toBe(
      "oficina",
    );
    expect(
      (await llamar(base("recibir", { version: 1, operacionId: "op2" })))
        .status,
    ).toBe(403);
    fake.uid = "operaria1";
    fake.rol = "operaria";
    expect(
      (await llamar(base("recibir", { version: 1, operacionId: "op2" })))
        .status,
    ).toBe(200);
    expect(fake.data.get("ordenes_servicio/orden1").responsableId).toBe(
      "operaria1",
    );
  });
  it("entrega parcial no duplica pago ni importe recibido del cliente", async () => {
    await llamar(base("confirmar_pago", { pagoId: "pago1" }));
    const b = base("entrega_efectivo", {
      version: 1,
      operacionId: "op2",
      pagoId: "pago1",
      monto: 2000,
      motivo: "Recibido en caja",
    });
    expect((await llamar(b)).status).toBe(200);
    expect((await llamar(b)).body.duplicado).toBe(true);
    const o = fake.data.get("ordenes_servicio/orden1");
    expect(o.pagos).toHaveLength(1);
    expect(o.montoPagado).toBe(3000);
    expect(o.pagos[0].entregadoOficina).toBe(2000);
    expect(
      (await llamar({ ...b, version: 2, operacionId: "op3", monto: 2000 }))
        .status,
    ).toBe(400);
  });
  it("rechaza evidencia de otro cliente", async () => {
    fake.data.set("whatsapp_mensajes_inbox/mensaje", {
      wa_id: "8095550001",
      tipo: "text",
      contenido: { texto: "Pagué" },
    });
    expect(
      (await llamar(base("nota", { texto: "Pago", wamid: "mensaje" }))).status,
    ).toBe(403);
  });
  it("impide aplicar la misma referencia del cliente a dos órdenes", async () => {
    fake.data.set("ordenes_servicio/orden2", {
      ...fake.data.get("ordenes_servicio/orden1"),
      numero: "OS2",
    });
    const b = base("pago", {
      monto: 1000,
      metodo: "transferencia",
      referencia: "REF-123",
    });
    expect((await llamar(b)).status).toBe(200);
    expect(
      (await llamar({ ...b, ordenId: "orden2", operacionId: "op2" })).status,
    ).toBe(409);
    expect(fake.data.get("ordenes_servicio/orden2").pagos).toHaveLength(1);
  });
  it("no revisa supervisión antes del cierre técnico", async () => {
    expect(
      (await llamar(base("revision", { motivo: "Conforme", conforme: true })))
        .status,
    ).toBe(400);
  });
  it("una nueva propuesta invalida aprobación anterior y exige revisión vigente", async () => {
    fake.uid = "tecnico1";
    fake.rol = "tecnico";
    expect(
      (
        await llamar(
          base("propuesta", {
            diagnostico: "Bomba bloqueada",
            piezas: [],
            manoObraSugerida: 3000,
          }),
        )
      ).status,
    ).toBe(200);
    expect(fake.data.get("ordenes_servicio/orden1").estadoAprobacion).toBe(
      "pendiente",
    );
    fake.uid = "oficina";
    fake.rol = "administrador";
    expect(
      (
        await llamar(
          base("aprobar_propuesta", {
            version: 1,
            operacionId: "op2",
            revision: 2,
            precioFinal: 5000,
            motivo: "Acuerdo",
          }),
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await llamar(
          base("aprobar_propuesta", {
            version: 1,
            operacionId: "op2",
            revision: 1,
            precioFinal: 5000,
            motivo: "Acuerdo con el cliente",
          }),
        )
      ).status,
    ).toBe(200);
    expect(fake.data.get("ordenes_servicio/orden1").propuestaCrmAprobada).toBe(
      1,
    );
  });
  it("solo el técnico asignado puede enviar propuesta", async () => {
    fake.uid = "otro";
    fake.rol = "tecnico";
    fake.data.set("usuarios/otro", { nombre: "Otro", rol: "tecnico" });
    expect(
      (
        await llamar(
          base("propuesta", {
            diagnostico: "Intento",
            piezas: [],
            manoObraSugerida: 0,
          }),
        )
      ).status,
    ).toBe(403);
  });
  it("lectura técnica no expone pagos ni notas internas de oficina", async () => {
    fake.data.set("crm_ordenes/orden1/notas/n1", {
      texto: "Solo oficina",
      visibilidad: "oficina",
    });
    fake.data.set("crm_ordenes/orden1/notas/n2", {
      texto: "Instrucción",
      visibilidad: "tecnico",
    });
    fake.uid = "tecnico1";
    fake.rol = "tecnico";
    const r = await llamar({ ordenId: "orden1" }, "GET");
    expect(r.status).toBe(200);
    expect(r.body.notas).toHaveLength(1);
    expect(r.body.orden.pagos).toBeUndefined();
    expect(r.body.eventos).toEqual([]);
  });
});

it('CRM libera comisión retenida al confirmar saldo final y preserva identidad al reintentar', async () => {
  const orden = fake.data.get('ordenes_servicio/orden1');
  orden.fase = 'cerrado';
  orden.pagos = [{ ...pago, id: 'anticipo', monto: 4000, verificado: true }, { ...pago, id: 'saldo', monto: 4000 }];
  fake.data.set('comisiones/orden_orden1', { ordenId: 'orden1', precioFinal: 8000, estadoLiquidacion: 'retenida_por_cobro', comisionMonto: 700 });
  const solicitud = base('confirmar_pago', { pagoId: 'saldo' });
  expect((await llamar(solicitud)).status).toBe(200);
  const liberada = fake.data.get('comisiones/orden_orden1');
  expect(liberada).toMatchObject({ estadoLiquidacion: 'pendiente', comisionMonto: 700 });
  await llamar(solicitud);
  expect(fake.data.get('comisiones/orden_orden1')).toEqual(liberada);
});
