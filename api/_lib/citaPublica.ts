import { prepararRepartoCanal } from './equiposAtencion.js';
import { validarArchivoPublico } from './subidaPublica.js';
import { createHash } from 'node:crypto';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';

export class ErrorCitaPublica extends Error {
  constructor(public status: number, public codigo: string, mensaje: string) { super(mensaje); }
}
const fallo = (): never => { throw new ErrorCitaPublica(400, 'datos_invalidos', 'Revisa los datos de la solicitud.'); };
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const texto = (v: unknown, max: number, obligatorio = false): string => {
  if (v === undefined || v === null || v === '') { if (obligatorio) return fallo(); return ''; }
  if (typeof v !== 'string' || v.trim().length > max || (obligatorio && !v.trim())) return fallo();
  return v.trim();
};
const CENTRAL = '18495646767';
// Valor técnico provisional configurable, no cifra confirmada por Jorge; nunca body/IP.
export const CUPO_CITAS_HORA_DEFAULT = 500;

export function validarCitaPublica(entrada: unknown): Record<string, unknown> {
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) return fallo();
  const p = entrada as Record<string, unknown>;
  if (Object.keys(p).length > 28 || Buffer.byteLength(JSON.stringify(p), 'utf8') > 16384) return fallo();
  const telefono = texto(p.telefono, 40, true);
  let normalizado = telefono.replace(/\D/g, '');
  if (normalizado.length === 11 && normalizado.startsWith('1')) normalizado = normalizado.slice(1);
  if (!/^\d{10}$/.test(normalizado)) return fallo();
  const equipoTipo = texto(p.equipoTipo, 100, true), equipoMarca = texto(p.equipoMarca, 100);
  const calendarioId = texto(p.calendarioId, 160);
  if (calendarioId && !/^[\w-]+$/.test(calendarioId)) return fallo();
  const falla = texto(p.falla, 4000, true);
  // El prefijo del selector no sustituye la descripción del cliente.
  if (!calendarioId && falla.replace(/^\[(Reparación|Mantenimiento)\]\s*/, '').length < 10) return fallo();
  const data: Record<string, unknown> = {
    clienteNombre: texto(p.clienteNombre, 199, true), telefono, telefonoNormalizado: normalizado,
    equipoTipo, servicio: `${equipoTipo}${equipoMarca ? ` ${equipoMarca}` : ''}`, falla,
    origen: 'formulario_publico', estado: 'pendiente', whatsappAsignado: CENTRAL,
    whatsappAsignadoNombre: 'Mister Service RD',
  };
  for (const [campo, max] of Object.entries({ clienteEmail: 254, clienteDireccion: 1000, clienteSector: 200, equipoMarca: 100, equipoModelo: 150, razonSocial: 200, citaIdProvisional: 100, horarioSolicitado: 200 })) {
    const valor = texto(p[campo], max); if (valor) data[campo] = valor;
  }
  if (data.clienteEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(data.clienteEmail))) return fallo();
  for (const [campo, limite] of [['clienteLat', 90], ['clienteLng', 180]] as const) {
    const valor = p[campo]; if (valor !== undefined && valor !== null) {
      if (typeof valor !== 'number' || !Number.isFinite(valor) || Math.abs(valor) > limite) return fallo();
      data[campo] = valor;
    }
  }
  const rnc = texto(p.rnc, 20).replace(/\D/g, '');
  if (rnc && !/^\d{9,11}$/.test(rnc)) return fallo();
  if (rnc) data.rnc = rnc; else delete data.razonSocial;
  const foto = texto(p.fotoEquipoUrl, 2048);
  if (foto) {
    let url: URL; try { url = new URL(foto); } catch { return fallo(); }
    if (url.protocol !== 'https:' || url.hostname !== 'firebasestorage.googleapis.com') return fallo();
    data.fotoEquipoUrl = foto;
  }
  const fecha = texto(p.fechaSolicitada, 10), hora = texto(p.horaSolicitada, 20);
  if (fecha) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !Number.isFinite(Date.parse(fecha + 'T00:00:00-04:00'))) return fallo();
    const d = new Date(fecha + 'T00:00:00-04:00');
    if (new Date(d.getTime() - 4 * 3600000).toISOString().slice(0, 10) !== fecha) return fallo();
    data.fechaSolicitada = Timestamp.fromDate(d);
  }
  if (hora) { if (!calendarioId && !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) return fallo(); data.horaSolicitada = hora; }
  if (calendarioId) { if (!fecha || !hora) return fallo(); data.calendarioId = calendarioId; }
  if (p.camposPersonalizados !== undefined) {
    if (!p.camposPersonalizados || typeof p.camposPersonalizados !== 'object' || Array.isArray(p.camposPersonalizados)) return fallo();
    const campos = Object.entries(p.camposPersonalizados);
    if (campos.length > 20) return fallo();
    data.camposPersonalizados = Object.fromEntries(campos.map(([k, v]) => [texto(k, 100, true), texto(v, 1000)]));
  }
  return data;
}

export async function registrarCitaPublica(db: Firestore, entrada: unknown, ahora = Date.now()) {
  const data = validarCitaPublica(entrada);
  if (data.fotoEquipoUrl) await validarArchivoPublico(db, String(data.fotoEquipoUrl));
  const reserva = db.doc(`citas_publicas_control/${hash(JSON.stringify(data))}`);
  const hora = Math.floor(ahora / 3600000);
  const cuota = db.doc(`citas_publicas_cuotas/${hora}`);
  const cuotaTelefono = db.doc(`citas_publicas_cuotas/tel_${hash(String(data.telefonoNormalizado))}_${hora}`);
  const cita = db.collection('citas_por_confirmar').doc();
  return db.runTransaction(async tx => {
    const [anterior, contador, contadorTelefono, config, web, calendario] = await Promise.all([
      tx.get(reserva), tx.get(cuota), tx.get(cuotaTelefono), tx.get(db.doc('citas_publicas_config/limites')),
      tx.get(db.doc('config_web/sitio')),
      data.calendarioId ? tx.get(db.doc(`calendarios/${data.calendarioId}`)) : Promise.resolve(null),
    ]);
    if (anterior.exists && Number(anterior.data()?.creadoMs) > ahora - 86400000) {
      // Respuesta neutra: no se expone ID ni información de la cita de otro visitante.
      return { ok: true, whatsappAsignado: CENTRAL, whatsappAsignadoNombre: 'Mister Service RD' };
    }
    const limite = config.data()?.maxSolicitudesHora ?? CUPO_CITAS_HORA_DEFAULT;
    if (!Number.isSafeInteger(limite) || limite < 1 || limite > 100000) throw new ErrorCitaPublica(503, 'configuracion', 'El formulario no está disponible. Inténtalo más tarde.');
    const limiteTelefono = config.data()?.maxSolicitudesTelefonoHora ?? 5;
    if (!Number.isSafeInteger(limiteTelefono) || limiteTelefono < 1 || limiteTelefono > 100) throw new ErrorCitaPublica(503, 'configuracion', 'El formulario no está disponible. Inténtalo más tarde.');
    if ((contadorTelefono.data()?.total ?? 0) >= limiteTelefono) return { ok: false, limitado: true } as const;
    if ((contador.data()?.total ?? 0) >= limite) {
      // El documento estable evita crear una alerta por cada intento bloqueado.
      tx.set(db.doc(`citas_publicas_alertas/${hora}`), { codigo: 'CUPO_HORA', hora, limite, actualizadoEn: Timestamp.fromMillis(ahora) });
      return { ok: false, limitado: true } as const;
    }
    if (data.calendarioId) {
      const c = calendario?.data();
      if (!c || c.activo === false) throw new ErrorCitaPublica(400, 'calendario', 'Este calendario no está disponible.');
      const fecha = (data.fechaSolicitada as Timestamp).toDate();
      const dia = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][new Date(fecha.getTime() - 4 * 3600000).getUTCDay()];
      const hoy = new Date(ahora - 4 * 3600000).toISOString().slice(0, 10);
      if (!Array.isArray(c.dias) || !c.dias.includes(dia) || !Array.isArray(c.horas) || !c.horas.includes(data.horaSolicitada) || fecha.toISOString().slice(0, 10) < hoy) throw new ErrorCitaPublica(400, 'horario', 'Selecciona una fecha y hora disponibles.');
      data.calendarioNombre = texto(c.nombre, 200);
      for (const campo of ['asignadoId', 'asignadoNombre']) { const v = texto(c[campo], 200); if (v) data[campo] = v; }
    }
    const rolesValidos = ['administrador', 'coordinadora', 'secretaria', 'operaria'];
    const configurados: unknown = web.data()?.formularioAgendar?.notificarA;
    const roles = Array.isArray(configurados) && configurados.length ? configurados.filter(r => rolesValidos.includes(r)) : rolesValidos.slice(0, 3);
    const personal = roles.length ? await tx.get(db.collection('personal').where('activo', '==', true).where('rol', 'in', [...new Set(roles)])) : null;
    const destinos = new Map<string, string>();
    for (const persona of personal?.docs ?? []) { const p = persona.data(); const uid = typeof p.uid === 'string' && p.uid ? p.uid : persona.id; destinos.set(uid, typeof p.nombre === 'string' ? p.nombre : ''); }
    if (destinos.size > 400) throw new ErrorCitaPublica(503, 'configuracion', 'El formulario no está disponible. Inténtalo más tarde.');
    const reparto = await prepararRepartoCanal(db, tx, null, String(data.telefonoNormalizado), 'web');
    const asignacion = reparto?.asignacion;
    asignacion?.aplicar();
    tx.create(cita, { ...data, ...(reparto ? { equipoId: asignacion?.equipoId ?? null, responsableAtencionId: asignacion?.secretariaUid ?? null, repartoPendiente: !asignacion } : {}), createdAt: Timestamp.fromMillis(ahora) });
    tx.set(reserva, { creadoMs: ahora, citaId: cita.id });
    tx.set(cuotaTelefono, { total: (contadorTelefono.data()?.total ?? 0) + 1, hora });
    tx.set(cuota, { total: (contador.data()?.total ?? 0) + 1, hora });
    for (const [uid, nombre] of destinos) tx.create(db.collection('notificaciones').doc(), {
      userId: uid, destinatarioNombre: nombre, tipo: 'nueva_cita', titulo: 'Nueva solicitud de cita (web)',
      mensaje: `${data.clienteNombre} (${data.telefono}) — ${data.equipoTipo}`, leida: false, createdAt: Timestamp.fromMillis(ahora),
    });
    return { ok: true, whatsappAsignado: CENTRAL, whatsappAsignadoNombre: 'Mister Service RD' };
  });
}
