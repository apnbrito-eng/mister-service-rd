import {
  collection,
  Timestamp,
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  writeBatch,
  Unsubscribe,
} from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import {
  ConfigFormularioAgendar,
  CONFIG_FORMULARIO_AGENDAR_DEFAULTS,
} from '../types/configFormularioAgendar';
import { NumeroWhatsApp } from './configWeb.service';
import { enviarCitaPublicaSegura } from './solicitudesPublicas.service';
import { crearRegistroAuditoria } from '../utils';
import { stripUndefined } from '../utils/firestore';

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

/** Guarda configuración y auditoría juntas, atribuidas a la sesión autenticada. */
export async function guardarConfigFormularioAgendar(
  config: ConfigFormularioAgendar,
  usuario?: { id?: string; nombre?: string },
): Promise<void> {
  const sesion = auth.currentUser;
  if (!sesion) throw new Error('Se requiere una sesión para guardar el formulario.');
  // El id de perfil recibido por compatibilidad nunca identifica al actor.
  const solicitanteNombre = usuario?.nombre || sesion.displayName || 'Administrador';
  const limpio = stripUndefined(config) as ConfigFormularioAgendar;
  const ahora = Timestamp.now();
  const batch = writeBatch(db);
  batch.set(CONFIG_DOC, { formularioAgendar: limpio, updatedAt: ahora }, { merge: true });
  batch.set(doc(collection(db, 'auditoria_admin')), {
    accion: 'editar_config_formulario_agendar',
    objetivoTipo: 'config_web', objetivoId: 'sitio',
    solicitanteUid: sesion.uid, solicitanteNombre,
    registro: crearRegistroAuditoria(solicitanteNombre, 'editar',
      'Actualizó la configuración del formulario público de agendamiento', 'config_web.formularioAgendar'),
    timestamp: ahora,
  });
  // Un rechazo impide ambos cambios y llega al mensaje de error de la pantalla.
  await batch.commit();
}

// ─── Rotación heredada (compatibilidad; el submit público ya no la usa) ───

/** Mantiene el contrato transaccional anterior para consumidores externos.
 * La web pública usa WHATSAPP_PUBLICO. No se modifica el helper genérico interno.
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
  /**
   * Modelo elegido del catálogo configurable de
   * `config_web/sitio.modelosPorTipoEquipo` (ej: 'Torre', 'French door').
   * Si el tipo no tiene catálogo, viene como texto libre.
   */
  equipoModelo?: string;
  falla: string;
  fechaSolicitada?: string; // YYYY-MM-DD
  horaSolicitada?: string;
  /** RNC fiscal del cliente (opcional). Solo si es empresa que necesita
   *  factura. 9 a 11 dígitos. Se valida client-side y server-side. */
  rnc?: string;
  /** Razón social legal de la empresa (opcional). Solo se persiste si rnc
   *  tiene valor — sin RNC no aplica. */
  razonSocial?: string;
  /** Map { tituloCampo: valor } para los campos personalizados llenados. */
  camposPersonalizados?: Record<string, string>;
  /** Honeypot anti-bots — si tiene valor, se descarta silenciosamente. */
  honeypot?: string;
  /** URL pública de la foto del equipo subida a Firebase Storage antes
   *  del submit. Opcional. */
  fotoEquipoUrl?: string;
  /** UUID generado client-side al montar el form. Persiste en la cita
   *  para auditoría del path en Storage. */
  citaIdProvisional?: string;
}

export interface ResultadoEnvioCita {
  ok: boolean;
  citaId?: string;
  error?: string;
  mensaje?: string;
  /** Número central del canal público para confirmar la solicitud. */
  whatsappAsignado?: string;
  /** Etiqueta del número asignado (ej: "Línea 1"). */
  whatsappAsignadoNombre?: string;
}

/** La cuota y la creación se validan juntas en el servidor, también para visitantes. */
export async function enviarSolicitudCita(payload: PayloadEnvioCita): Promise<ResultadoEnvioCita> {
  return enviarCitaPublicaSegura(payload);
}
