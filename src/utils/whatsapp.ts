import { normalizarTelefono } from '../services/clientes.service';

/** Abre WhatsApp con número formateado para RD (+1) */
export function abrirWhatsApp(telefono: string, mensaje: string = ''): void {
  const soloDigitos = normalizarTelefono(telefono);
  const numero = soloDigitos.length === 10 ? `1${soloDigitos}` : soloDigitos;
  const url = mensaje
    ? `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`
    : `https://wa.me/${numero}`;
  window.open(url, '_blank');
}

/** Genera URL de WhatsApp */
export function whatsappUrl(telefono: string, mensaje: string = ''): string {
  const soloDigitos = normalizarTelefono(telefono);
  const numero = soloDigitos.length === 10 ? `1${soloDigitos}` : soloDigitos;
  const url = `https://wa.me/${numero}`;
  return mensaje ? `${url}?text=${encodeURIComponent(mensaje)}` : url;
}

/** Mensajes WhatsApp predefinidos para cada situación */
export const mensajesWhatsApp = {
  confirmacion: (nombre: string, equipo: string): string =>
    `Hola ${nombre}, somos *Mister Service RD*. Recibimos su solicitud de servicio para ${equipo}. ¿Podemos confirmar su cita?`,

  recordatorioCita: (nombre: string, fecha: string, hora: string): string =>
    `Hola ${nombre}, le recordamos que tiene una cita programada para el *${fecha}* a las *${hora}*. — Mister Service RD`,

  enDiagnostico: (nombre: string, equipo: string): string =>
    `Hola ${nombre}, le informamos que su ${equipo} está siendo evaluado por nuestro equipo técnico. Le enviaremos el diagnóstico pronto. — Mister Service RD`,

  cotizacion: (nombre: string, numero: string, total: string): string =>
    `Hola ${nombre}, le enviamos la cotización *${numero}* por un total de *${total}*. Para aceptarla, responda a este mensaje. — Mister Service RD`,

  cotizacionAprobada: (nombre: string, equipo: string): string =>
    `Hola ${nombre}, su cotización para ${equipo} ha sido aprobada. Procederemos con la reparación. — Mister Service RD`,

  piezaEnEspera: (nombre: string, equipo: string): string =>
    `Hola ${nombre}, le informamos que el repuesto para su ${equipo} está siendo gestionado. Le avisaremos cuando esté disponible. — Mister Service RD`,

  piezaLlego: (nombre: string, equipo: string): string =>
    `Hola ${nombre}, ¡buenas noticias! El repuesto para su ${equipo} ya llegó. Procederemos con la reparación. — Mister Service RD`,

  equipoListo: (nombre: string, equipo: string): string =>
    `Hola ${nombre}, su ${equipo} está *listo para retirar* en nuestro taller. Gracias por confiar en Mister Service RD.`,

  trabajoRealizado: (nombre: string, equipo: string): string =>
    `Hola ${nombre}, le informamos que el trabajo en su ${equipo} ha sido completado exitosamente. — Mister Service RD`,

  seguimiento: (nombre: string): string =>
    `Hola ${nombre}, ¿cómo está funcionando su equipo después del servicio? En Mister Service RD nos importa su satisfacción. ¿Tiene alguna pregunta?`,

  mantenimientoProgramado: (nombre: string, equipo: string, fecha: string): string =>
    `Hola ${nombre}, le recordamos que tiene un mantenimiento programado de su ${equipo} para el *${fecha}*. ¿Desea confirmar? — Mister Service RD`,
};
