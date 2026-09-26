import { describe, it, expect } from "vitest";
import {
  balanceCrm,
  efectivoPendiente,
  totalAcordado,
  textoRecibo,
} from "../../src/utils/crm";
describe("CRM: pagos y custodia de efectivo", () => {
  it("separa transferencias pendientes de confirmadas", () => {
    expect(
      balanceCrm(
        [
          { id: "a", monto: 3000, metodo: "transferencia" },
          { id: "b", monto: 2000, metodo: "efectivo", verificado: true },
        ],
        10000,
      ),
    ).toEqual({
      confirmados: 2000,
      pendientes: 3000,
      saldo: 8000,
      excedente: 0,
    });
  });
  it("entrega parcial liquida custodia sin reducir el pago del cliente", () => {
    const p = {
      id: "a",
      monto: 3000,
      metodo: "efectivo",
      verificado: true,
      entregadoOficina: 2000,
    };
    expect(efectivoPendiente(p)).toBe(1000);
    expect(balanceCrm([p], 5000).saldo).toBe(2000);
  });
  it("transferencias y pagos sin verificar no son efectivo a rendir", () => {
    expect(
      efectivoPendiente({
        id: "a",
        monto: 3000,
        metodo: "transferencia",
        verificado: true,
      }),
    ).toBe(0);
    expect(
      efectivoPendiente({ id: "a", monto: 3000, metodo: "efectivo" }),
    ).toBe(0);
  });
  it("no convierte el sugerido en total aprobado y respeta precio cero", () => {
    expect(totalAcordado({ precioSugerido: 5000 })).toBeNull();
    expect(
      totalAcordado({
        estadoAprobacion: "aprobado",
        precioFinal: 0,
        precioAprobado: 5000,
      }),
    ).toBe(0);
  });
  it("no resta el chequeo dos veces", () => {
    const total = totalAcordado({
      estadoAprobacion: "aprobado",
      precioFinal: 8000,
      descuentoChequeoPrevioMonto: 2000,
    });
    expect(
      balanceCrm(
        [{ id: "a", monto: 3000, metodo: "efectivo", verificado: true }],
        total,
      ).saldo,
    ).toBe(5000);
  });
  it("nunca emite recibo de dinero no verificado", () => {
    expect(() =>
      textoRecibo({}, { id: "a", monto: 3000, metodo: "efectivo" }, 0),
    ).toThrow();
  });
  it("rechaza importes no finitos y negativos", () => {
    for (const monto of [NaN, Infinity, -1])
      expect(() =>
        balanceCrm([{ id: "a", monto, metodo: "efectivo" }], 0),
      ).toThrow();
  });
  it("avisa excedente sin saldo negativo", () => {
    expect(
      balanceCrm(
        [{ id: "a", monto: 101, metodo: "efectivo", verificado: true }],
        100,
      ),
    ).toMatchObject({ excedente: 1, saldo: 0 });
  });
});
