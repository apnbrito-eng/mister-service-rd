import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  setDoc,
  Timestamp,
  Unsubscribe,
  query,
  where,
  getDocs,
  limit,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import {
  ConfigFormularioAgendar,
  CONFIG_FORMULARIO_AGENDAR_DEFAULTS,
} from '../types/configFormularioAgendar';
import { ConfigWhatsApp, NumeroWhatsApp } from './configWeb.service';
import { Personal } from '../types';
import { normalizarTelefono } from './clientes.service';
import { crearNotificacion } from './notificaciones.service';
import { crearRegistroAuditoria } from '../utils';

const CONFIG_DOC = doc(db, 'config_web', 'sitio');
const CONTADORES_DOC = doc(db, 'config_web', 'contadores');

/**
 * Lee la config del formulario público desde `config_web/sitio.formularioAgendar`.
 * Si el doc o el campo no existen, retorna los defaults.
 */
export async function obtenerConfigFormularioAgendar(): Promise<ConfigFormularioAgendar> {
  try {
    const snap = await getDoc(CONFIG_DOC);
    if (!snap.exists()) return { ...CONFIG_FORMULARIO_AGENDAR_DEFAULTS };
    const data = snap.data();
    const cfg = (data?.formularioAgendar as ConfigFormularioAgendar) || {};
    return { ...CONFIG_FORMULARIO_AGENDAR_DEFAULTS, ...cfg };
  } catch (err) {
    console.error('Error leyendo config formulario agendar:', err);
    return { ...CONFIG_FORMULARIO_AGENDAR_DEFAULTS };
  }
}

/**
 * Suscripción en tiempo real a la config del formulario.
 * Llamar `unsubscribe()` al desmontar.
 */
export function suscribirConfigFormularioAgendar(
  callback: (config: ConfigFormularioAgendar) => void,
): Unsubscribe {
  return onSnapshot(
    CONFIG_DOC,
    snap => {
      if (!snap.exists()) {
        callback({ ...CONFIG_FORMULARIO_AGENDAR_DEFAULTS });
        return;
      }
      const data = snap.data();
      const cfg = (data?.formularioAgendar as ConfigFormularioAgendar) || {};
      callback({ ...CONFIG_FORMULARIO_AGENDAR_DEFAULTS, ...cfg });
    },
    err => {
      console.error('Error escuchando config formulario agendar:', err);
      callback({ ...CONFIG_FORMULARIO_AGENDAR_DEFAULTS });
    },
  );
}

/**
 * Guarda la config del formulario en `config_web/sitio.formularioAgendar`.
 * Usa `setDoc(..., { merge: true })` para no pisar el resto de la config web.
 * Opcionalmente escribe un registro en `auditoria_admin` si se pasa el usuario.
 */
export async function guardarConfigFormularioAgendar(
  config: ConfigFormularioAgendar,
  usuario?: { id?: string; nombre?: string },
): Promise<void> {
  // Strip undefined antes de persistir (Firestore los rechaza)
  const limpio = Object.fromEntries(
    Object.entries(config).filter(([, v]) => v !== undefined),
  );

  await setDoc(
    CONFIG_DOC,
    {
      formularioAgendar: limpio,
      updatedAt: Timestamp.now(),
    },
    { merge: true },
  );

  // Audit log opcional — no rompe el guardado si falla
  if (usuario?.nombre) {
    try {
      const registro = crearRegistroAuditoria(
        usuario.nombre,
        'editar',
        'Actualizó la configuración del formulario público de agendamiento',
        'config_web.formularioAgendar',
      );
      const auditPayload: Record<string, unknown> = {
        accion: 'editar_config_formulario_agendar',
        objetivoTipo: 'config_web',
        objetivoId: 'sitio',
        solicitanteUid: usuario.id || null,
        solicitanteNombre: usuario.nombre,
        registro,
        timestamp: Timestamp.now(),
      };
      await addDoc(
        collection(db, 'auditoria_admin'),
        Object.fromEntries(
          Object.entries(auditPayload).filter(([, v]) => v !== undefined),
        ),
      );
    } catch (err) {
      console.warn('Audit log editar_config_formulario_agendar falló:', err);
    }
  }
}

// ─── Round-robin de WhatsApp para /agendar ──────────────────────────

/**
 * Selecciona el siguiente número de WhatsApp en rotación verdadera
 * (round-robin) usando un contador transaccional en
 * `config_web/contadores.formularioAgendarRR`.
 *
 * - SOLO se usa en el submit del formulario público `/agendar`.
 * - Ignora el flag `rotacion` de `config_web/sitio.whatsapp`: si hay
 *   más de un activo, siempre rota.
 * - Si la lista está vacía, lanza error (el caller debe manejarlo
 *   con fallback "te llamaremos").
 *
 * El resto del sitio (marketing) sigue usando `getWhatsAppUrl` que
 * elige al azar — no modifiques ese helper.
 */
export async function obtenerWhatsAppRoundRobin(
  numerosActivos: NumeroWhatsApp[],
): Promise<NumeroWhatsApp> {
  if (!numerosActivos.length) {
    throw new Error('No hay números de WhatsApp activos configurados');
  }

  const indice = await runTransaction(db, async tx => {
    const snap = await tx.get(CONTADORES_DOC);
    const actual = (snap.data()?.formularioAgendarRR ?? 0) as number;
    tx.set(
      CONTADORES_DOC,
      { formularioAgendarRR: actual + 1 },
      { merge: true },
    );
    return actual % numerosActivos.length;
  });

  return numerosActivos[indice];
}

/**
 * Lee `config_web/sitio.whatsapp` y devuelve los números marcados como
 * `activo === true`. Pensado para consumirse junto con
 * `obtenerWhatsAppRoundRobin`. Retorna `[]` si el doc no existe o
 * la lista de números no está, para que el caller decida si hace
 * fallback gracioso.
 */
async function leerNumerosWhatsAppActivos(): Promise<NumeroWhatsApp[]> {
  try {
    const snap = await getDoc(CONFIG_DOC);
    if (!snap.exists()) return [];
    const data = snap.data();
    const wa = (data?.whatsapp as ConfigWhatsApp | undefined) || undefined;
    if (!wa || !Array.isArray(wa.numeros)) return [];
    return wa.numeros.filter(n => n && n.activo === true && !!n.numero);
  } catch (err) {
    console.warn('No se pudo leer whatsapp de config_web/sitio:', err);
    return [];
  }
}

// ─── Submit del formulario público ──────────────────────────────────

export interface PayloadEnvioCita {
  clienteNombre: string;
  telefono: string;
  clienteEmail?: string;
  clienteDireccion?: string;
  /** Coordenadas capturadas por Google Places, GPS o URL pegada. */
  clienteLat?: number;
  clienteLng?: number;
  clienteSector?: string;
  equipoTipo: string;
  equipoMarca?: string;
  equipoModelo?: string;
  falla: string;
  fechaSolicitada?: string; // YYYY-MM-DD
  horaSolicitada?: string;
  comoNosConocio?: string;
  /** Map { tituloCampo: valor } para los campos personalizados llenados. */
  camposPersonalizados?: Record<string, string>;
  /** Honeypot anti-bots — si tiene valor, se descarta silenciosamente. */
  honeypot?: string;
}

export interface ResultadoEnvioCita {
  ok: boolean;
  citaId?: string;
  error?: string;
  mensaje?: string;
  /** Número de WhatsApp asignado al cliente por round-robin (si aplica). */
  whatsappAsignado?: string;
  /** Etiqueta del número asignado (ej: "Línea 1"). */
  whatsappAsignadoNombre?: string;
}

/**
 * Recibe un payload del formulario público, valida lo mínimo, escribe a
 * `citas_por_confirmar` y dispara notificaciones in-app a la coordinadora /
 * secretaria. No hace login ni audit log porque es un endpoint público.
 */
export async function enviarSolicitudCita(
  payload: PayloadEnvioCita,
): Promise<ResultadoEnvioCita> {
  // Honeypot — si tiene valor, retornamos ok=true silenciosamente para no
  // dar señal al bot, pero NO escribimos nada.
  if (payload.honeypot && payload.honeypot.trim().length > 0) {
    return { ok: true };
  }

  // Validaciones mínimas server-side (defense in depth)
  const nombre = payload.clienteNombre?.trim();
  if (!nombre) {
    return { ok: false, error: 'El nombre es obligatorio' };
  }
  const telNorm = normalizarTelefono(payload.telefono || '');
  if (telNorm.length !== 10) {
    return {
      ok: false,
      error: 'El teléfono debe tener 10 dígitos (formato RD)',
    };
  }
  const equipoTipo = payload.equipoTipo?.trim();
  if (!equipoTipo) {
    return { ok: false, error: 'Selecciona el tipo de equipo' };
  }
  const falla = payload.falla?.trim();
  if (!falla || falla.length < 10) {
    return {
      ok: false,
      error: 'Describe el problema con al menos 10 caracteres',
    };
  }

  // Construir payload sin undefined
  const data: Record<string, unknown> = {
    clienteNombre: nombre,
    telefono: payload.telefono.trim(),
    telefonoNormalizado: telNorm,
    servicio: `${equipoTipo}${payload.equipoMarca ? ` ${payload.equipoMarca.trim()}` : ''}`,
    falla,
    equipoTipo,
    origen: 'formulario_publico',
    createdAt: Timestamp.now(),
  };

  if (payload.clienteEmail?.trim()) data.clienteEmail = payload.clienteEmail.trim();
  if (payload.clienteDireccion?.trim()) data.clienteDireccion = payload.clienteDireccion.trim();
  if (typeof payload.clienteLat === 'number' && Number.isFinite(payload.clienteLat)) {
    data.clienteLat = payload.clienteLat;
  }
  if (typeof payload.clienteLng === 'number' && Number.isFinite(payload.clienteLng)) {
    data.clienteLng = payload.clienteLng;
  }
  if (payload.clienteSector?.trim()) data.clienteSector = payload.clienteSector.trim();
  if (payload.equipoMarca?.trim()) data.equipoMarca = payload.equipoMarca.trim();
  if (payload.equipoModelo?.trim()) data.equipoModelo = payload.equipoModelo.trim();
  if (payload.comoNosConocio?.trim()) data.comoNosConocio = payload.comoNosConocio.trim();
  if (payload.fechaSolicitada) {
    try {
      const d = new Date(payload.fechaSolicitada + 'T00:00:00');
      if (!isNaN(d.getTime())) data.fechaSolicitada = Timestamp.fromDate(d);
    } catch {
      /* ignorar fechas mal formateadas */
    }
  }
  if (payload.horaSolicitada?.trim()) data.horaSolicitada = payload.horaSolicitada.trim();
  if (
    payload.camposPersonalizados &&
    Object.keys(payload.camposPersonalizados).length > 0
  ) {
    // Filtrar valores vacíos para no guardar basura
    const limpios = Object.fromEntries(
      Object.entries(payload.camposPersonalizados).filter(
        ([, v]) => typeof v === 'string' && v.trim().length > 0,
      ),
    );
    if (Object.keys(limpios).length > 0) {
      data.camposPersonalizados = limpios;
    }
  }

  // Anti-duplicado: si el mismo teléfono normalizado envió una solicitud
  // en las últimas 24h, no creamos otra. Si el query falla (ej. permission
  // denied porque las rules no están listas), no bloqueamos el submit —
  // logueamos y seguimos.
  try {
    const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const dupSnap = await getDocs(
      query(
        collection(db, 'citas_por_confirmar'),
        where('telefonoNormalizado', '==', telNorm),
        where('createdAt', '>=', Timestamp.fromDate(hace24h)),
        limit(1),
      ),
    );
    if (!dupSnap.empty) {
      return {
        ok: false,
        error: 'duplicado_24h',
        mensaje:
          'Ya recibimos tu solicitud reciente. Te contactaremos pronto.',
      };
    }
  } catch (err) {
    console.warn(
      'Check anti-duplicado falló, se procede con el submit:',
      err,
    );
  }

  // Round-robin de WhatsApp: si hay números activos, asignamos uno
  // y lo guardamos en la cita. Si falla cualquier paso (read, runTx),
  // procedemos sin asignación — la cita igual queda registrada.
  let waAsignado: NumeroWhatsApp | null = null;
  try {
    const activos = await leerNumerosWhatsAppActivos();
    if (activos.length > 0) {
      waAsignado = await obtenerWhatsAppRoundRobin(activos);
      data.whatsappAsignado = waAsignado.numero;
      data.whatsappAsignadoNombre = waAsignado.nombre;
    }
  } catch (err) {
    console.warn(
      'Round-robin de WhatsApp falló, se procede sin asignación:',
      err,
    );
    waAsignado = null;
  }

  let citaId: string;
  try {
    const ref = await addDoc(collection(db, 'citas_por_confirmar'), data);
    citaId = ref.id;
  } catch (err) {
    console.error('Error escribiendo cita pública:', err);
    return {
      ok: false,
      error: 'No pudimos registrar tu solicitud. Inténtalo de nuevo.',
    };
  }

  // Notificar al staff (best-effort — si falla, la cita ya quedó guardada)
  try {
    await notificarStaffNuevaCita({
      citaId,
      nombre,
      telefono: payload.telefono.trim(),
      equipoTipo,
    });
  } catch (err) {
    console.warn('Notificación a staff falló:', err);
  }

  const resultado: ResultadoEnvioCita = { ok: true, citaId };
  if (waAsignado) {
    resultado.whatsappAsignado = waAsignado.numero;
    resultado.whatsappAsignadoNombre = waAsignado.nombre;
  }
  return resultado;
}

/**
 * Crea notificaciones in-app para coordinadora, secretaria y administradores
 * activos, avisándoles de una nueva cita pública. Usa el tipo existente
 * `nueva_cita` (no extiende el union de `TipoNotificacion`).
 */
async function notificarStaffNuevaCita(args: {
  citaId: string;
  nombre: string;
  telefono: string;
  equipoTipo: string;
}): Promise<void> {
  const rolesObjetivo: Personal['rol'][] = [
    'coordinadora',
    'secretaria',
    'administrador',
  ];

  // Una sola query por rol para no bajar todo `personal`
  const destinatariosVistos = new Set<string>();
  for (const rol of rolesObjetivo) {
    const snap = await getDocs(
      query(
        collection(db, 'personal'),
        where('rol', '==', rol),
        where('activo', '==', true),
      ),
    );
    for (const docSnap of snap.docs) {
      const raw = docSnap.data() as Partial<Personal>;
      const destId = raw.uid || docSnap.id;
      if (!destId || destinatariosVistos.has(destId)) continue;
      destinatariosVistos.add(destId);

      try {
        await crearNotificacion({
          destinatarioId: destId,
          destinatarioNombre: raw.nombre,
          tipo: 'nueva_cita',
          titulo: 'Nueva solicitud de cita (web)',
          mensaje: `${args.nombre} (${args.telefono}) — ${args.equipoTipo}`,
        });
      } catch (err) {
        console.warn(
          `crearNotificacion falló para ${rol}/${destId}:`,
          err,
        );
      }
    }
  }
}
