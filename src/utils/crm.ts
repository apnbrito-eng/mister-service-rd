export type CrmPago = {
  id: string;
  monto: number;
  metodo: string;
  verificado?: boolean;
  recibidoPorId?: string;
  recibidoPorNombre?: string;
  referencia?: string;
  fecha?: unknown;
  crm?: boolean;
  entregadoOficina?: number;
};
export function centavos(valor: unknown): number {
  if (
    typeof valor !== "number" ||
    !Number.isFinite(valor) ||
    valor < 0 ||
    valor > 10000000
  )
    throw new Error("Importe inválido.");
  return Math.round(valor * 100);
}
export function balanceCrm(pagos: CrmPago[], total: number | null) {
  let confirmados = 0,
    pendientes = 0;
  for (const p of pagos) {
    const n = centavos(p.monto);
    if (p.verificado === true) confirmados += n;
    else pendientes += n;
  }
  const t = total === null ? null : centavos(total);
  return {
    confirmados: confirmados / 100,
    pendientes: pendientes / 100,
    saldo: t === null ? null : Math.max(0, t - confirmados) / 100,
    excedente: t === null ? 0 : Math.max(0, confirmados - t) / 100,
  };
}
export function efectivoPendiente(p: CrmPago): number {
  if (p.metodo !== "efectivo" || p.verificado !== true) return 0;
  return (
    Math.max(0, centavos(p.monto) - centavos(p.entregadoOficina ?? 0)) / 100
  );
}
export function totalAcordado(o: Record<string, unknown>): number | null {
  if (o.estadoAprobacion !== "aprobado") return null;
  const n = o.precioFinal ?? o.precioAprobado;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : null;
}
export function textoRecibo(
  o: { numero?: string; clienteNombre?: string },
  p: CrmPago,
  saldo: number | null,
) {
  if (!p.verificado) throw new Error("El pago aún no está confirmado.");
  const dinero = (n: number) =>
    `RD$ ${n.toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `Mister Service RD · Comprobante de abono\nRecibo: ${p.id}\nCliente: ${o.clienteNombre || "Sin nombre"}\nOrden: ${o.numero || "Sin número"}\nAbono recibido: ${dinero(p.monto)}\nMétodo: ${p.metodo}${p.referencia ? `\nReferencia: ${p.referencia}` : ""}\nSaldo al confirmar este abono: ${saldo === null ? "Presupuesto por confirmar" : dinero(saldo)}\nEste comprobante registra el abono; no sustituye la factura.`;
}
export function normalizarTelefono(v: unknown) {
  return String(v ?? "")
    .replace(/\D/g, "")
    .slice(-10);
}
