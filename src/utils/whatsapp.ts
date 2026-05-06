import { normalizarTelefono } from '../services/clientes.service';
import type { Factura } from '../types';

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

  /**
   * Empuje a operaria desde admin/coord cuando hay un recordatorio diario
   * pendiente (SPRINT-104). Tono profesional, no agresivo.
   * TODO: Jorge revisar copy si querés más cálido/firme.
   */
  recordatorioOperariaRutaManana: (operariaNombre: string, actorNombre: string): string =>
    `Hola ${operariaNombre}, soy ${actorNombre}. Te recuerdo organizar la ruta de mañana antes que cierre la ventana. Gracias.`,

  recordatorioOperariaAvisosClientes: (operariaNombre: string, actorNombre: string): string =>
    `Hola ${operariaNombre}, soy ${actorNombre}. Te recuerdo avisar a los clientes de mañana antes que cierre la ventana. Gracias.`,
};

/**
 * Arma el mensaje de WhatsApp para enviarle al cliente el conduce de garantía
 * recién emitido, junto al link público para consultar el estado y reclamar la
 * garantía. El link sólo se incluye si la factura tiene `garantia.token`.
 */
export function mensajeConduceGarantia(factura: Factura): string {
  const lineas: string[] = [];
  lineas.push(`Hola ${factura.clienteNombre || ''},`.trim());
  lineas.push('');
  lineas.push(`Tu Conduce de Garantía *${factura.numero}* fue emitido.`);

  const equipo = [factura.equipoTipo, factura.equipoMarca].filter(Boolean).join(' ').trim();
  if (equipo) {
    lineas.push(`Equipo: ${equipo}.`);
  }

  const total = typeof factura.total === 'number' ? factura.total : 0;
  lineas.push(
    `Total: RD$${total.toLocaleString('es-DO', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}.`,
  );

  if (factura.garantia?.token) {
    const finFechaRaw = factura.garantia.finFecha;
    const finFecha = finFechaRaw instanceof Date
      ? finFechaRaw
      : (finFechaRaw && typeof (finFechaRaw as { toDate?: () => Date }).toDate === 'function'
        ? (finFechaRaw as { toDate: () => Date }).toDate()
        : new Date(finFechaRaw as unknown as string));
    const finFechaTxt = isNaN(finFecha.getTime())
      ? ''
      : finFecha.toLocaleDateString('es-DO', { day: '2-digit', month: 'long', year: 'numeric' });
    lineas.push('');
    lineas.push('Tu garantía:');
    lineas.push(`https://www.misterservicerd.com/garantia/${factura.garantia.token}`);
    if (finFechaTxt) {
      lineas.push(`Vigente hasta el ${finFechaTxt}.`);
    }
  }

  lineas.push('');
  lineas.push('Gracias por confiar en Mister Service RD.');
  return lineas.join('\n');
}

/**
 * Arma el mensaje de WhatsApp con los datos de una cuenta bancaria para que el cliente
 * haga una transferencia. Incluye la política de pago de Mister Service RD.
 */
export function mensajeDatosCuentaBancaria(args: {
  clienteNombre?: string;
  banco: string;
  numeroCuenta?: string;
  tipoCuenta?: 'ahorro' | 'corriente';
  titular?: string;
  rnc?: string;
  cedula?: string;
  emailComprobante?: string;
  monto?: number;
}): string {
  const {
    clienteNombre = '',
    banco,
    numeroCuenta,
    tipoCuenta,
    titular,
    rnc,
    cedula,
    emailComprobante,
    monto,
  } = args;

  const saludo = clienteNombre ? `Hola ${clienteNombre}, ` : 'Hola, ';
  const lineas: string[] = [];
  lineas.push(`${saludo}estos son los datos para la transferencia:`);
  lineas.push('');
  lineas.push(`🏦 *${banco}*${tipoCuenta ? ` — Cuenta de ${tipoCuenta}` : ''}`);
  if (numeroCuenta) lineas.push(`N°: ${numeroCuenta}`);
  if (titular) lineas.push(`A nombre de: ${titular}`);
  if (rnc) lineas.push(`RNC: ${rnc}`);
  if (cedula) lineas.push(`Cédula: ${cedula}`);
  if (typeof monto === 'number' && monto > 0) {
    lineas.push('');
    lineas.push(
      `Monto: RD$${monto.toLocaleString('es-DO', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`,
    );
  }
  lineas.push('');
  lineas.push('⚠️ La transferencia debe realizarse después de que el técnico culmine el servicio y *antes* de que se retire de la residencia (política de empresa).');
  lineas.push('');
  lineas.push('Por favor envíe foto del comprobante.');
  if (emailComprobante) lineas.push(`También puede enviarlo al correo ${emailComprobante}.`);
  lineas.push('');
  lineas.push('Gracias de antemano — Mister Service RD');

  return lineas.join('\n');
}
