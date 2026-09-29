/** Base aislada: no habilita proveedores ni envíos. Configuración solo simulación. */
export interface TarifaBotServicio {
  modelo: string; version: string;
  entradaMicroUsdPorMillon: number; salidaMicroUsdPorMillon: number;
  maxTokensEntrada: number; maxTokensSalida: number;
}
export interface EquipoBotServicio { id: string; operariaUid: string; secretariaUid: string }
export interface ConfigBotServicio {
  version: number; habilitado: false; modo: 'simulacion'; numeroCentral: string;
  permitirHorarioLaboral: boolean; limiteDiaMicroUsd: number; limiteMesMicroUsd: number;
  limiteRespuestas24h: number; tarifa: TarifaBotServicio | null; equipos: EquipoBotServicio[];
}
export const CONFIG_BOT_INICIAL: ConfigBotServicio = {
  version: 0, habilitado: false, modo: 'simulacion', numeroCentral: '18495646767',
  permitirHorarioLaboral: false, limiteDiaMicroUsd: 5_000_000, limiteMesMicroUsd: 50_000_000,
  limiteRespuestas24h: 15, tarifa: null, equipos: [],
};
export function enteroSeguro(n: unknown, minimo = 0): n is number {
  return typeof n === 'number' && Number.isSafeInteger(n) && n >= minimo;
}
export function validarConfigBot(valor: unknown): ConfigBotServicio {
  if (!valor || typeof valor !== 'object') throw new Error('Configuración inválida');
  const c = valor as ConfigBotServicio;
  if (c.habilitado !== false || c.modo !== 'simulacion' || !enteroSeguro(c.version) ||
    c.numeroCentral !== CONFIG_BOT_INICIAL.numeroCentral || typeof c.permitirHorarioLaboral !== 'boolean' ||
    !enteroSeguro(c.limiteDiaMicroUsd, 1) || !enteroSeguro(c.limiteMesMicroUsd, 1) ||
    c.limiteDiaMicroUsd > c.limiteMesMicroUsd || !enteroSeguro(c.limiteRespuestas24h, 1) || c.limiteRespuestas24h > 15 ||
    !Array.isArray(c.equipos) || c.equipos.length > 2) throw new Error('Configuración inválida');
  const ids = new Set<string>(), miembros = new Set<string>();
  for (const e of c.equipos) {
    if (!e || ![e.id, e.operariaUid, e.secretariaUid].every(idBotValido) || ids.has(e.id) ||
      miembros.has(e.operariaUid) || miembros.has(e.secretariaUid) || e.operariaUid === e.secretariaUid) throw new Error('Equipos inválidos');
    ids.add(e.id); miembros.add(e.operariaUid); miembros.add(e.secretariaUid);
  }
  let tarifa: TarifaBotServicio | null = null;
  if (c.tarifa !== null) {
    const t = c.tarifa;
    if (!t || !idBotValido(t.modelo) || !idBotValido(t.version) ||
      !enteroSeguro(t.entradaMicroUsdPorMillon, 1) || !enteroSeguro(t.salidaMicroUsdPorMillon, 1) ||
      !enteroSeguro(t.maxTokensEntrada, 1) || !enteroSeguro(t.maxTokensSalida, 1)) throw new Error('Tarifa inválida');
    tarifa = { modelo: t.modelo, version: t.version, entradaMicroUsdPorMillon: t.entradaMicroUsdPorMillon,
      salidaMicroUsdPorMillon: t.salidaMicroUsdPorMillon, maxTokensEntrada: t.maxTokensEntrada, maxTokensSalida: t.maxTokensSalida };
    costeMaximoBot(tarifa);
  }
  return { version: c.version, habilitado: false, modo: 'simulacion', numeroCentral: c.numeroCentral,
    permitirHorarioLaboral: c.permitirHorarioLaboral, limiteDiaMicroUsd: c.limiteDiaMicroUsd,
    limiteMesMicroUsd: c.limiteMesMicroUsd, limiteRespuestas24h: c.limiteRespuestas24h,
    tarifa, equipos: c.equipos.map(e => ({ id: e.id, operariaUid: e.operariaUid, secretariaUid: e.secretariaUid })) };
}
export function idBotValido(v: unknown): v is string { return typeof v === 'string' && /^[a-zA-Z0-9_.:-]{1,128}$/.test(v); }
export function periodosBot(ahora: number) {
  if (!enteroSeguro(ahora)) throw new Error('Fecha inválida');
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short' }).formatToParts(ahora);
  const p = Object.fromEntries(partes.map(v => [v.type, v.value]));
  return { dia: `${p.year}-${p.month}-${p.day}`, mes: `${p.year}-${p.month}`, laboral: p.weekday !== 'Sun' && Number(p.hour) >= 8 && Number(p.hour) < (p.weekday === 'Sat' ? 16 : 18) };
}
export function costeMaximoBot(t: TarifaBotServicio) {
  const total = t.maxTokensEntrada * t.entradaMicroUsdPorMillon + t.maxTokensSalida * t.salidaMicroUsdPorMillon;
  if (!enteroSeguro(total, 1)) throw new Error('Tarifa excede precisión segura');
  return Math.ceil(total / 1_000_000);
}
export function resolverLineaBot(numero: string, lineas: { numero: string; phoneNumberId: string }[]) {
  const coincidencias = lineas.filter(l => l.numero.replace(/\D/g, '') === numero);
  if (coincidencias.length !== 1 || !/^\d+$/.test(coincidencias[0].phoneNumberId)) throw new Error('Línea ausente o ambigua');
  return coincidencias[0].phoneNumberId;
}
export interface DatosServicioBot { equipo?: string; servicio?: 'reparacion' | 'mantenimiento'; falla?: string; fotoId?: string; ubicacion?: { lat: number; lng: number } }
export function evaluarBot(c: ConfigBotServicio, entrada: { ahora: number; pideHumano: boolean; baja: boolean; ventanaAbierta: boolean; datos: DatosServicioBot }) {
  validarConfigBot(c);
  if (entrada.baja) return { accion: 'pausa', motivo: 'baja' } as const;
  if (entrada.pideHumano) return { accion: 'entregar', motivo: 'humano' } as const;
  const d = entrada.datos;
  const ubicacion = d.ubicacion && Number.isFinite(d.ubicacion.lat) && Number.isFinite(d.ubicacion.lng) && Math.abs(d.ubicacion.lat) <= 90 && Math.abs(d.ubicacion.lng) <= 180;
  if (d.equipo?.trim() && d.servicio && (d.servicio === 'mantenimiento' || d.falla?.trim()) && d.fotoId && ubicacion) return { accion: 'entregar', motivo: 'datos_completos' } as const;
  if (!entrada.ventanaAbierta) return { accion: 'pausa', motivo: 'ventana_cerrada' } as const;
  if (periodosBot(entrada.ahora).laboral && !c.permitirHorarioLaboral) return { accion: 'pausa', motivo: 'horario' } as const;
  if (!c.tarifa) return { accion: 'pausa', motivo: 'sin_tarifa' } as const;
  return { accion: 'simular', motivo: 'recopilar' } as const;
}
