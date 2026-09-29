import { CONFIG_BOT_INICIAL, validarConfigBot, type EquipoBotServicio } from './politicaBotServicio.js';
import { TARIFA_SERVICIO, type ConfigEjecucionBot } from './botServicioPipeline.js';
export interface RuntimeServicio extends ConfigEjecucionBot {
  repartoHabilitado: boolean; limiteDiaMicroUsd: number; limiteMesMicroUsd: number; limiteRespuestas24h: number; equipos: EquipoBotServicio[];
}
export const CONFIG_RUNTIME_INICIAL: RuntimeServicio = {
  habilitado: false, repartoHabilitado: false, version: 0, numeroCentral: '18495646767', phoneNumberId: '', permitirHorarioLaboral: false,
  tarifaVersion: TARIFA_SERVICIO.version, limiteDiaMicroUsd: 5_000_000, limiteMesMicroUsd: 50_000_000, limiteRespuestas24h: 15, equipos: [],
};
export const TARIFA_RUNTIME = { modelo: TARIFA_SERVICIO.modelo, version: TARIFA_SERVICIO.version,
  entradaMicroUsdPorMillon: TARIFA_SERVICIO.entrada * 1_000_000, salidaMicroUsdPorMillon: TARIFA_SERVICIO.salida * 1_000_000,
  maxTokensEntrada: TARIFA_SERVICIO.maxEntrada, maxTokensSalida: TARIFA_SERVICIO.maxSalida };
export function validarRuntimeSeguro(valor: unknown): RuntimeServicio {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) throw new Error('Runtime inválido');
  const c = valor as RuntimeServicio;
  if ((c.repartoHabilitado !== undefined && typeof c.repartoHabilitado !== 'boolean') || typeof c.habilitado !== 'boolean' || c.tarifaVersion !== TARIFA_SERVICIO.version || typeof c.phoneNumberId !== 'string' ||
    (c.phoneNumberId !== '' && !/^\d{1,30}$/.test(c.phoneNumberId)) || (c.habilitado && !c.phoneNumberId)) throw new Error('Runtime inválido');
  const validado = validarConfigBot({ ...CONFIG_BOT_INICIAL, version: c.version, numeroCentral: c.numeroCentral, permitirHorarioLaboral: c.permitirHorarioLaboral,
    limiteDiaMicroUsd: c.limiteDiaMicroUsd, limiteMesMicroUsd: c.limiteMesMicroUsd, limiteRespuestas24h: c.limiteRespuestas24h, equipos: c.equipos, tarifa: TARIFA_RUNTIME });
  return { repartoHabilitado: c.repartoHabilitado === true, habilitado: c.habilitado, version: validado.version, numeroCentral: validado.numeroCentral, phoneNumberId: c.phoneNumberId,
    permitirHorarioLaboral: validado.permitirHorarioLaboral, tarifaVersion: TARIFA_SERVICIO.version, limiteDiaMicroUsd: validado.limiteDiaMicroUsd,
    limiteMesMicroUsd: validado.limiteMesMicroUsd, limiteRespuestas24h: validado.limiteRespuestas24h, equipos: validado.equipos };
}
