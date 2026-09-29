import type { ConfigWeb } from '../services/configWeb.service';

/** Canal público aprobado por Jorge. Los canales internos conservan su configuración. */
export const WHATSAPP_PUBLICO = '18495646767';
export const NOMBRE_WHATSAPP_PUBLICO = 'Mister Service RD';
export function obtenerWhatsAppPublico(config: ConfigWeb, mensaje?: string): string {
  return `https://wa.me/${WHATSAPP_PUBLICO}?text=${encodeURIComponent(mensaje || config.whatsapp.mensajePredeterminado)}`;
}
export type IntencionServicio = 'Reparación' | 'Mantenimiento';
export function leerSeleccionServicio(params: URLSearchParams, equiposPermitidos: string[]) {
  const equipo = params.get('equipo') ?? '';
  const servicio = params.get('servicio');
  return {
    equipo: equiposPermitidos.includes(equipo) ? equipo : '',
    servicio: servicio === 'Reparación' || servicio === 'Mantenimiento' ? servicio : '',
  };
}
export function enlaceAgendar(equipo: string, servicio: IntencionServicio): string {
  return `/agendar?${new URLSearchParams({ equipo, servicio })}`;
}
