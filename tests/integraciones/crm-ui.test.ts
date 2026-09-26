import React from "react";
import { act, create } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ api: vi.fn(), enviar: vi.fn() }));
vi.mock("../../src/services/equipoApi", () => ({ equipoApi: m.api }));
vi.mock("../../src/services/whatsapp.service", () => ({
  enviarTexto: m.enviar,
}));
vi.mock("../../src/context/AppContext", () => ({
  useApp: () => ({ currentUser: { uid: "admin" } }),
}));
vi.mock("../../src/components/crm/PropuestaTrabajo", () => ({
  default: () => null,
}));
import GestionOrden from "../../src/components/crm/GestionOrden";
const data = () => ({
  orden: {
    id: "o",
    numero: "OS",
    clienteNombre: "Cliente",
    equipoTipo: "Lavadora",
    fase: "en_diagnostico",
    pagos: [
      {
        id: "p",
        monto: 3000,
        metodo: "efectivo",
        verificado: true,
        crm: true,
        recibidoPorNombre: "Técnico",
      },
    ],
  },
  meta: { version: 0 },
  notas: [],
  eventos: [],
  recibos: [],
  balance: { confirmados: 3000, pendientes: 0, saldo: 5000, excedente: 0 },
  equipo: [],
  permisos: {
    oficina: true,
    supervisor: true,
    verificar: true,
    registrar: true,
  },
});
let r: any;
const button = (label: string) =>
  r.root
    .findAllByType("button")
    .find((b: any) => b.children.join("") === label);
beforeEach(() => {
  m.api.mockReset();
  m.enviar.mockReset();
  m.api.mockImplementation(async (_: string, body?: object) =>
    body ? { ok: true } : data(),
  );
  vi.stubGlobal("window", { setInterval: () => 1, clearInterval: () => {} });
});
async function montar() {
  await act(async () => {
    r = create(React.createElement(GestionOrden, { ordenId: "o" }));
  });
}
describe("Ficha CRM", () => {
  it("guardar una nota interna no envía mensajes de WhatsApp", async () => {
    await montar();
    await act(async () => button("Notas").props.onClick());
    await act(async () =>
      r.root
        .findByType("textarea")
        .props.onChange({ target: { value: "Avisar antes de llegar" } }),
    );
    await act(async () =>
      r.root.findByType("form").props.onSubmit({ preventDefault() {} }),
    );
    expect(
      m.api.mock.calls.some(
        (c) =>
          c[1]?.accion === "nota" && c[1]?.texto === "Avisar antes de llegar",
      ),
    ).toBe(true);
    expect(m.enviar).not.toHaveBeenCalled();
    r.unmount();
  });
  it("revisar y cancelar una entrega no registra dinero", async () => {
    await montar();
    await act(async () => button("Pagos").props.onClick());
    const input = r.root
      .findAllByType("input")
      .find((x: any) => x.props.max === 3000);
    await act(async () => input.props.onChange({ target: { value: "2000" } }));
    await act(async () => button("Revisar entrega a oficina").props.onClick());
    await act(async () => button("Cancelar").props.onClick());
    expect(m.api.mock.calls.filter((c) => c[1])).toHaveLength(0);
    r.unmount();
  });
  it("solo confirmar la revisión registra una entrega parcial", async () => {
    await montar();
    await act(async () => button("Pagos").props.onClick());
    const input = r.root
      .findAllByType("input")
      .find((x: any) => x.props.max === 3000);
    await act(async () => input.props.onChange({ target: { value: "2000" } }));
    await act(async () => button("Revisar entrega a oficina").props.onClick());
    await act(async () => button("Sí, registrar entrega").props.onClick());
    expect(
      m.api.mock.calls.filter((c) => c[1]?.accion === "entrega_efectivo"),
    ).toHaveLength(1);
    expect(
      m.api.mock.calls.find((c) => c[1]?.accion === "entrega_efectivo")?.[1],
    ).toMatchObject({ monto: 2000, pagoId: "p", ordenId: "o" });
    r.unmount();
  });
});
