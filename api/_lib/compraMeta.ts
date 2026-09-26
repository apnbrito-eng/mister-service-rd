/** Eligibility only. Never treats a document emission or unverified deposit as a purchase. */
export type CompraMetaEntrada = {
  facturaId: string;
  facturaOrdenId: string;
  ordenId: string;
  facturaTotal: number;
  moneda: string;
  facturaAnulada: boolean;
  ordenAnulada: boolean;
  cierreSupervisorConfirmado: boolean;
  cierreMs: number;
  pagos: Array<{ monto: number; verificado?: boolean }>;
  ctwaClid?: string;
};

export function prepararCompraMeta(input: CompraMetaEntrada, ahora = Date.now()) {
  if (!input.facturaId || !input.ordenId || input.facturaOrdenId !== input.ordenId) return { ok: false as const, motivo: 'factura_no_vinculada' };
  if (input.facturaAnulada || input.ordenAnulada) return { ok: false as const, motivo: 'anulada' };
  if (!input.cierreSupervisorConfirmado) return { ok: false as const, motivo: 'falta_cierre_supervision' };
  if (!Number.isFinite(input.cierreMs) || input.cierreMs <= 0 || input.cierreMs > ahora) return { ok: false as const, motivo: 'fecha_invalida' };
  if (!Number.isFinite(input.facturaTotal) || input.facturaTotal <= 0 || !/^[A-Z]{3}$/.test(input.moneda)) return { ok: false as const, motivo: 'importe_o_moneda_invalidos' };
  if (input.pagos.some(p => !Number.isFinite(p.monto) || p.monto < 0)) return { ok: false as const, motivo: 'pago_invalido' };
  const confirmado = input.pagos.filter(p => p.verificado === true).reduce((sum, p) => sum + Math.round(p.monto * 100), 0);
  if (confirmado < Math.round(input.facturaTotal * 100)) return { ok: false as const, motivo: 'pago_no_confirmado_completo' };
  if (!input.ctwaClid || !/^[A-Za-z0-9_-]{1,2048}$/.test(input.ctwaClid)) return { ok: false as const, motivo: 'sin_referencia_de_clic' };
  return { ok: true as const, evento: {
    event_name: 'Purchase',
    event_id: `factura:${input.facturaId}`,
    event_time: Math.floor(input.cierreMs / 1000),
    action_source: 'business_messaging',
    messaging_channel: 'whatsapp',
    user_data: { ctwa_clid: input.ctwaClid },
    custom_data: { value: Math.round(input.facturaTotal * 100) / 100, currency: input.moneda },
  } };
}
