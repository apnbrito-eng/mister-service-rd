import { periodosBot } from './politicaBotServicio.js';

/** Tarifa del servidor, API estándar sin tools, caché ni thinking. No viene del cliente. */
export const TARIFA_SERVICIO = Object.freeze({ modelo: 'claude-sonnet-4-6', version: 'anthropic-standard-2026-09-28', entrada: 3, salida: 15, maxEntrada: 6000, maxSalida: 400 });
export const RESERVA_SERVICIO_MICRO_USD = TARIFA_SERVICIO.maxEntrada * TARIFA_SERVICIO.entrada + TARIFA_SERVICIO.maxSalida * TARIFA_SERVICIO.salida;
export interface ConfigEjecucionBot { habilitado: boolean; version: number; numeroCentral: string; phoneNumberId: string; permitirHorarioLaboral: boolean; tarifaVersion: string }
export interface LeaseServicio { id: string; intento: number; epoch: number; configVersion: number; trabajador: string }
export interface ContextoServicio { mensajes: string[]; saludoEnviado?: boolean; equipo?: string; servicio?: string; falla?: string; direccion?: string; tieneFoto: boolean; tieneUbicacion: boolean; pideHumano: boolean; baja: boolean; ventanaHastaMs: number; phoneNumberId: string }
export type PasoServicio = 'equipo' | 'servicio' | 'falla' | 'foto' | 'ubicacion' | 'humano';
export interface ResultadoModeloServicio { paso: PasoServicio; equipo?: string; servicio?: 'reparacion' | 'mantenimiento'; falla?: string; direccion?: string }
export interface RespuestaProveedorServicio { datos: ResultadoModeloServicio; entrada: number; salida: number }
export interface ProveedorServicio {
  contar(contexto: ContextoServicio): Promise<number>;
  generar(contexto: ContextoServicio): Promise<RespuestaProveedorServicio>;
}
/** Todas las mutaciones son transacciones. La implementación debe verificar lease/epoch/config. */
export interface AlmacenServicio {
  reclamar(id: string, ahora: number): Promise<LeaseServicio | null>;
  contexto(lease: LeaseServicio): Promise<ContextoServicio>;
  vigente(lease: LeaseServicio, ahora: number): Promise<boolean>;
  reservar(lease: LeaseServicio, maxMicroUsd: number, ahora: number): Promise<string | null>;
  iniciarProveedor(lease: LeaseServicio, reserva: string, ahora: number): Promise<boolean>;
  liberar(reserva: string): Promise<void>;
  /** Concilia gasto real aun si hubo toma humana: nunca lo libera por cancelar la respuesta. */
  registrarResultado(lease: LeaseServicio, reserva: string, respuesta: RespuestaProveedorServicio, costeMicroUsd: number): Promise<void>;
  /** Verifica también ventana24h/opt-out/config; escribe despachando antes del HTTP. */
  prepararEnvio(lease: LeaseServicio, texto: string, ahora: number): Promise<boolean>;
  completar(lease: LeaseServicio, wamid: string): Promise<void>;
  ambiguo(lease: LeaseServicio, reserva: string, etapa: 'proveedor' | 'envio'): Promise<void>;
  cancelar(lease: LeaseServicio, motivo: string): Promise<void>;
  entregarHumano(lease: LeaseServicio, motivo: string): Promise<void>;
}
export interface TransporteServicio { enviar(lease: LeaseServicio, texto: string, phoneNumberId: string): Promise<{ wamid: string }> }
export interface DependenciasServicio { almacen: AlmacenServicio; proveedor: ProveedorServicio; transporte: TransporteServicio; reloj: () => number; permitirExternos: boolean }
const PREGUNTAS: Record<Exclude<PasoServicio, 'humano'>, string> = {
  equipo: '¿Qué equipo necesita atención?',
  servicio: '¿Necesitas reparación o mantenimiento?',
  falla: '¿Qué le ocurre al equipo?',
  foto: 'Si puedes, envía una foto del equipo. También puedes continuar sin ella.',
  ubicacion: '¿Dónde se encuentra el equipo? Puedes compartir tu ubicación o escribir la dirección.',
};
export function configEjecucionValida(valor: unknown): valor is ConfigEjecucionBot {
  if (!valor || typeof valor !== 'object') return false;
  const c = valor as ConfigEjecucionBot;
  return c.habilitado === true && Number.isSafeInteger(c.version) && c.version >= 0 && c.numeroCentral === '18495646767' &&
    /^\d{1,30}$/.test(c.phoneNumberId) && typeof c.permitirHorarioLaboral === 'boolean' && c.tarifaVersion === TARIFA_SERVICIO.version;
}
export function acotarContextoServicio(c: ContextoServicio): ContextoServicio {
  if (!Array.isArray(c.mensajes) || c.mensajes.some(m => typeof m !== 'string')) throw new Error('Contexto inválido');
  return { saludoEnviado: c.saludoEnviado === true, mensajes: c.mensajes.slice(-8).map(m => m.slice(0, 1000)), equipo: c.equipo?.slice(0, 100), servicio: c.servicio?.slice(0, 30), falla: c.falla?.slice(0, 1000), direccion: c.direccion?.slice(0, 300),
    tieneFoto: c.tieneFoto === true, tieneUbicacion: c.tieneUbicacion === true, pideHumano: c.pideHumano === true, baja: c.baja === true,
    ventanaHastaMs: c.ventanaHastaMs, phoneNumberId: c.phoneNumberId };
}
export function validarRespuestaServicio(valor: unknown): ResultadoModeloServicio {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) throw new Error('Respuesta inválida');
  const v = valor as Record<string, unknown>;
  if (Object.keys(v).some(k => !['paso', 'equipo', 'servicio', 'falla', 'direccion'].includes(k)) || !['equipo', 'servicio', 'falla', 'foto', 'ubicacion', 'humano'].includes(String(v.paso)) ||
    (v.equipo !== undefined && (typeof v.equipo !== 'string' || v.equipo.length > 100)) ||
    (v.falla !== undefined && (typeof v.falla !== 'string' || v.falla.length > 1000)) ||
    (v.direccion !== undefined && (typeof v.direccion !== 'string' || !v.direccion.trim() || v.direccion.length > 300)) ||
    (v.servicio !== undefined && !['reparacion', 'mantenimiento'].includes(String(v.servicio)))) throw new Error('Respuesta inválida');
  return v as unknown as ResultadoModeloServicio;
}
/** Una ejecución por trabajo. El almacén no vuelve a reclamar proveedor_iniciado/despachando. */
export async function ejecutarTrabajoServicio(id: string, config: unknown, d: DependenciasServicio): Promise<string> {
  if (!d.permitirExternos || !configEjecucionValida(config)) return 'desactivado';
  if (periodosBot(d.reloj()).laboral && !config.permitirHorarioLaboral) return 'horario';
  const l = await d.almacen.reclamar(id, d.reloj());
  if (!l) return 'ocupado';
  let reserva = '', proveedorIniciado = false, resultadoRegistrado = false, envioIniciado = false;
  try {
    const c = acotarContextoServicio(await d.almacen.contexto(l));
    if (l.configVersion !== config.version || c.phoneNumberId !== config.phoneNumberId || !Number.isFinite(c.ventanaHastaMs) || c.ventanaHastaMs <= d.reloj() || c.baja) {
      await d.almacen.cancelar(l, 'politica'); return 'cancelado';
    }
    if (c.pideHumano || c.mensajes.some(m => /(?:no (?:puedo|quiero|tengo).{0,30}(?:foto|ubicaci[oó]n|direcci[oó]n))|(?:persona|humano|secretaria|operaria)/i.test(m)) || (c.equipo && (c.servicio === 'mantenimiento' || c.servicio === 'reparacion' && c.falla) && c.tieneFoto && c.tieneUbicacion)) {
      await d.almacen.entregarHumano(l, 'solicitud_o_datos_completos'); return 'humano';
    }
    if (!await d.almacen.vigente(l, d.reloj())) { await d.almacen.cancelar(l, 'vigencia'); return 'cancelado'; }
    reserva = await d.almacen.reservar(l, RESERVA_SERVICIO_MICRO_USD, d.reloj()) ?? '';
    if (!reserva) { await d.almacen.entregarHumano(l, 'limite'); return 'limite'; }
    const tokens = await d.proveedor.contar(c);
    if (!Number.isSafeInteger(tokens) || tokens < 0 || tokens > TARIFA_SERVICIO.maxEntrada) {
      await d.almacen.liberar(reserva); reserva = ''; await d.almacen.entregarHumano(l, 'contexto'); return 'contexto';
    }
    if (!await d.almacen.iniciarProveedor(l, reserva, d.reloj())) {
      await d.almacen.liberar(reserva); reserva = ''; await d.almacen.cancelar(l, 'vigencia'); return 'cancelado';
    }
    proveedorIniciado = true;
    const respuesta = await d.proveedor.generar(c);
    if (!Number.isSafeInteger(respuesta.entrada) || respuesta.entrada < 0 || respuesta.entrada > TARIFA_SERVICIO.maxEntrada ||
      !Number.isSafeInteger(respuesta.salida) || respuesta.salida < 0 || respuesta.salida > TARIFA_SERVICIO.maxSalida) throw new Error('Uso inesperado');
    respuesta.datos = validarRespuestaServicio(respuesta.datos);
    // La dirección debe aparecer literalmente en el texto recibido, no ser inferida por el modelo.
    if (respuesta.datos.direccion && !c.mensajes.some(m => m.toLocaleLowerCase().includes(respuesta.datos.direccion!.trim().toLocaleLowerCase()))) {
      delete respuesta.datos.direccion;
      respuesta.datos.paso = 'ubicacion';
    }
    if ((respuesta.datos.servicio ?? c.servicio) === 'mantenimiento' && respuesta.datos.paso === 'falla') {
      respuesta.datos.paso = !c.tieneFoto ? 'foto' : !c.tieneUbicacion ? 'ubicacion' : 'humano';
    }
    await d.almacen.registrarResultado(l, reserva, respuesta, respuesta.entrada * TARIFA_SERVICIO.entrada + respuesta.salida * TARIFA_SERVICIO.salida);
    resultadoRegistrado = true;
    if (respuesta.datos.paso === 'humano') { await d.almacen.entregarHumano(l, 'modelo'); return 'humano'; }
    const texto = (c.saludoEnviado ? '' : 'Soy el asistente de IA de Mister Service. ') + PREGUNTAS[respuesta.datos.paso];
    if (!await d.almacen.prepararEnvio(l, texto, d.reloj())) { await d.almacen.cancelar(l, 'vigencia'); return 'cancelado'; }
    envioIniciado = true;
    const enviado = await d.transporte.enviar(l, texto, config.phoneNumberId);
    if (!enviado.wamid || enviado.wamid.length > 256) throw new Error('Confirmación inválida');
    await d.almacen.completar(l, enviado.wamid);
    return 'completado';
  } catch {
    if (proveedorIniciado && !resultadoRegistrado || envioIniciado) await d.almacen.ambiguo(l, reserva, envioIniciado ? 'envio' : 'proveedor');
    else { if (reserva && !resultadoRegistrado) await d.almacen.liberar(reserva); await d.almacen.entregarHumano(l, 'error'); }
    return 'error';
  }
}
