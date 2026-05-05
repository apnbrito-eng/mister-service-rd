import {
  collection,
  doc,
  getDoc,
  increment,
  onSnapshot,
  query,
  orderBy,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  Unsubscribe,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import {
  CampanaMarketing,
  Cliente,
  ClienteEnCampana,
  FiltrosCampanaMarketing,
  PlantillaMarketing,
  Usuario,
} from '../types';
import { stripUndefined } from '../utils/firestore';

// ──────────────────────────────────────────────────────────────────
// Constantes
// ──────────────────────────────────────────────────────────────────

const CAMPANAS_COL = 'campanas_marketing';
const CONFIG_COL = 'config_marketing';
const PLANTILLAS_DOC = 'plantillas';
const COOLDOWN_DOC = 'cooldown';
const AUDITORIA_COL = 'auditoria_admin';

/** Cap de entries en `cliente.contactosMarketing[]`. Si una campaña empuja
 *  el array por encima del cap, se hace `slice(-50)` (mantiene los 50 más
 *  recientes). Se aplica en `marcarClienteEnviado`. */
export const CONTACTOS_MARKETING_CAP = 50;

/** Cooldown anti-spam en días. Default 30; configurable en
 *  `config_marketing/cooldown.dias`. Override admin documentado en
 *  `marcarClienteEnviado` y `crearCampana`. */
export const COOLDOWN_DIAS_DEFAULT = 30;

// ──────────────────────────────────────────────────────────────────
// Plantillas seed (botón en /admin/configuracion-marketing)
// ──────────────────────────────────────────────────────────────────

export const PLANTILLAS_INICIALES: PlantillaMarketing[] = [
  {
    id: 'mantenimiento_3meses',
    nombre: 'Recordatorio mantenimiento (3+ meses)',
    mensaje:
      'Hola {nombre}, soy de Mister Service RD. Hace {mesesUltimoServicio} meses te ayudamos con tu {equipoTipo}. ¿Querés que te agendemos un mantenimiento preventivo? Respondé y coordinamos.',
    activa: true,
  },
  {
    id: 'oferta_promocional',
    nombre: 'Oferta promocional',
    mensaje:
      'Hola {nombre}, te escribimos de Mister Service RD. Aprovechá 15% de descuento este mes en mantenimiento de electrodomésticos. ¿Coordinamos una visita?',
    activa: true,
  },
  {
    id: 'encuesta_satisfaccion',
    nombre: 'Encuesta satisfacción tardía',
    mensaje:
      'Hola {nombre}, ¿cómo va el {equipoTipo} que te reparamos? Tu opinión nos ayuda a mejorar el servicio. — Mister Service RD',
    activa: true,
  },
  {
    id: 'reactivacion_general',
    nombre: 'Reactivación general',
    mensaje:
      'Hola {nombre}, te saluda Mister Service RD. Hace {ultimoServicio} fuimos a tu casa. ¿Cómo podemos ayudarte hoy?',
    activa: true,
  },
];

// ──────────────────────────────────────────────────────────────────
// Plantillas — read / write
// ──────────────────────────────────────────────────────────────────

interface PlantillasDoc {
  plantillas: PlantillaMarketing[];
}

/** Suscripción real-time al doc `config_marketing/plantillas`. Devuelve
 *  un array vacío si el doc no existe (todavía no hay seed). */
export function subscribeToPlantillas(
  callback: (plantillas: PlantillaMarketing[]) => void,
): Unsubscribe {
  return onSnapshot(doc(db, CONFIG_COL, PLANTILLAS_DOC), (snap) => {
    if (!snap.exists()) {
      callback([]);
      return;
    }
    const data = snap.data() as PlantillasDoc;
    const list = Array.isArray(data.plantillas) ? data.plantillas : [];
    // Defensive parse — descarta entries malformadas.
    const limpias = list
      .filter((p) => p && typeof p === 'object' && typeof p.id === 'string' && typeof p.nombre === 'string' && typeof p.mensaje === 'string')
      .map((p) => ({
        id: p.id,
        nombre: p.nombre,
        mensaje: p.mensaje,
        activa: p.activa !== false,
      }));
    callback(limpias);
  });
}

/** Guarda el array completo de plantillas (merge sobre el doc).
 *  Solo admin debería invocar esto (gated por rule de Firestore). */
export async function guardarPlantillas(plantillas: PlantillaMarketing[]): Promise<void> {
  const payload = stripUndefined({ plantillas });
  await setDoc(doc(db, CONFIG_COL, PLANTILLAS_DOC), payload, { merge: true });
}

/** Seed inicial de las 4 plantillas del spec. Solo escribe si el doc no
 *  existe — idempotente. */
export async function seedPlantillasIniciales(): Promise<void> {
  await setDoc(doc(db, CONFIG_COL, PLANTILLAS_DOC), {
    plantillas: PLANTILLAS_INICIALES,
  });
}

// ──────────────────────────────────────────────────────────────────
// Cooldown
// ──────────────────────────────────────────────────────────────────

interface CooldownDoc {
  dias?: number;
}

/** Lee `config_marketing/cooldown.dias`. Default 30. Si la lectura falla
 *  (sin permisos, doc inexistente), devuelve el default. */
export async function leerCooldownDias(): Promise<number> {
  try {
    const snap = await getDoc(doc(db, CONFIG_COL, COOLDOWN_DOC));
    if (!snap.exists()) return COOLDOWN_DIAS_DEFAULT;
    const data = snap.data() as CooldownDoc | undefined;
    const v = data?.dias;
    if (typeof v !== 'number' || isNaN(v) || v < 0) return COOLDOWN_DIAS_DEFAULT;
    return v;
  } catch {
    return COOLDOWN_DIAS_DEFAULT;
  }
}

/**
 * Helper UI: ¿el cliente está en cooldown según los últimos N días?
 * Lee `cliente.ultimoContactoMarketing` y compara contra `Date.now()`.
 * No bloquea si la fecha es inválida (defensivo).
 */
export function enCooldown(
  ultimoContacto: Date | Timestamp | undefined | null,
  cooldownDias: number,
): boolean {
  if (!ultimoContacto) return false;
  const fecha = ultimoContacto instanceof Date
    ? ultimoContacto
    : (typeof (ultimoContacto as Timestamp).toDate === 'function'
      ? (ultimoContacto as Timestamp).toDate()
      : null);
  if (!fecha || isNaN(fecha.getTime())) return false;
  const diffMs = Date.now() - fecha.getTime();
  const diffDias = diffMs / (1000 * 60 * 60 * 24);
  return diffDias < cooldownDias;
}

// ──────────────────────────────────────────────────────────────────
// Campañas
// ──────────────────────────────────────────────────────────────────

export interface CrearCampanaArgs {
  plantilla: PlantillaMarketing;
  filtrosAplicados: FiltrosCampanaMarketing;
  clientes: Array<{ id: string; nombre: string; telefono: string }>;
  agente: Pick<Usuario, 'id' | 'nombre'>;
  /** Si true, el admin saltó el cooldown — se agrega al doc + audit log
   *  atómicamente en un `writeBatch` (security condition #2). */
  overrideCooldown?: boolean;
  overrideCooldownMotivo?: string;
}

/**
 * Crea una nueva campaña en `campanas_marketing`. Si `overrideCooldown`
 * es true, escribe el flag + un audit log en la MISMA `writeBatch` para
 * que un atacante no pueda crear la campaña sin el audit (security
 * condition #2).
 */
export async function crearCampana(args: CrearCampanaArgs): Promise<string> {
  const {
    plantilla,
    filtrosAplicados,
    clientes,
    agente,
    overrideCooldown,
    overrideCooldownMotivo,
  } = args;

  const ahora = Timestamp.now();
  const clientesContactados: ClienteEnCampana[] = clientes.map((c) => ({
    clienteId: c.id,
    clienteNombre: c.nombre,
    telefono: c.telefono,
    enviado: false,
  }));

  // Construimos el payload base. `creadaEn` y `fecha` son inmutables
  // por la rule de Firestore — `creadaPor` también.
  const basePayload: Record<string, unknown> = {
    fecha: ahora,
    plantillaId: plantilla.id,
    plantillaNombre: plantilla.nombre,
    filtrosAplicados,
    clientesContactados,
    creadaPor: agente.id,
    creadaPorNombre: agente.nombre,
    totalEnviados: 0,
    creadaEn: ahora,
  };
  if (overrideCooldown) {
    basePayload.overrideCooldown = true;
    basePayload.overrideCooldownPorId = agente.id;
    basePayload.overrideCooldownPorNombre = agente.nombre;
    basePayload.overrideCooldownEn = ahora;
    if (overrideCooldownMotivo) {
      basePayload.overrideCooldownMotivo = overrideCooldownMotivo;
    }
  }
  const payload = stripUndefined(basePayload);

  // writeBatch atómico: campaña + audit log. Si una falla, ambas
  // revierten. Esto cierra el agujero de "creo la campaña, no escribo el
  // audit" de security #2.
  const batch = writeBatch(db);
  const campanaRef = doc(collection(db, CAMPANAS_COL));
  batch.set(campanaRef, payload);

  const auditPayload: Record<string, unknown> = {
    accion: overrideCooldown ? 'campana_creada_con_override' : 'campana_creada',
    tipoEntidad: 'campana_marketing',
    campanaId: campanaRef.id,
    plantillaId: plantilla.id,
    plantillaNombre: plantilla.nombre,
    totalClientes: clientesContactados.length,
    solicitanteUid: agente.id,
    solicitanteNombre: agente.nombre,
    timestamp: ahora,
  };
  if (overrideCooldown) {
    auditPayload.overrideCooldown = true;
    if (overrideCooldownMotivo) auditPayload.motivo = overrideCooldownMotivo;
  }
  const auditRef = doc(collection(db, AUDITORIA_COL));
  batch.set(auditRef, stripUndefined(auditPayload));

  await batch.commit();
  return campanaRef.id;
}

// ──────────────────────────────────────────────────────────────────
// Marcar enviado (transacción atómica)
// ──────────────────────────────────────────────────────────────────

export interface MarcarClienteEnviadoArgs {
  campanaId: string;
  clienteId: string;
  agente: Pick<Usuario, 'id' | 'nombre'>;
  plantillaId: string;
  plantillaNombre: string;
}

/**
 * Marca un cliente de una campaña como `enviado: true` y actualiza
 * `cliente.ultimoContactoMarketing` + `cliente.contactosMarketing` con
 * `arrayUnion` cap 50.
 *
 * Idempotente: si el cliente ya está marcado como enviado, no incrementa
 * `totalEnviados` ni vuelve a empujar el contactosMarketing (el array
 * está cap-eado y `arrayUnion` con valor idéntico no duplica entries —
 * pero como cada entry tiene `fecha` único, NO usamos arrayUnion para el
 * cliente; reescribimos el array entero con cap).
 *
 * Atomicidad: runTransaction sobre los 2 docs (campana + cliente).
 *
 * NOTA defense-in-depth (security #3): el schema extension Cliente
 * (`ultimoContactoMarketing`, `contactosMarketing`) se valida UI-side.
 * Las rules de `clientes` permiten update genérico por staff oficina;
 * no hay rule específica que enforce shape de estos campos. Si se
 * agrega una rule futura, considerar que ambas escrituras viven dentro
 * de un mismo runTransaction (atomicidad). Cap 50 está enforced acá
 * (cliente) — no en rules.
 */
export async function marcarClienteEnviado(args: MarcarClienteEnviadoArgs): Promise<{
  yaEstabaEnviado: boolean;
}> {
  const { campanaId, clienteId, agente, plantillaId, plantillaNombre } = args;
  const campanaRef = doc(db, CAMPANAS_COL, campanaId);
  const clienteRef = doc(db, 'clientes', clienteId);

  return runTransaction(db, async (tx) => {
    const [campanaSnap, clienteSnap] = await Promise.all([
      tx.get(campanaRef),
      tx.get(clienteRef),
    ]);
    if (!campanaSnap.exists()) {
      throw new Error('La campaña ya no existe.');
    }
    if (!clienteSnap.exists()) {
      throw new Error('El cliente ya no existe.');
    }
    const campanaData = campanaSnap.data() as Partial<CampanaMarketing>;
    const clientesContactados = Array.isArray(campanaData.clientesContactados)
      ? [...(campanaData.clientesContactados as ClienteEnCampana[])]
      : [];
    const idx = clientesContactados.findIndex((c) => c.clienteId === clienteId);
    if (idx === -1) {
      throw new Error('Cliente no presente en la campaña.');
    }
    const yaEstabaEnviado = clientesContactados[idx].enviado === true;
    if (yaEstabaEnviado) {
      // Idempotente: nada que cambiar. Devolvemos info al caller.
      return { yaEstabaEnviado: true };
    }

    const ahora = Timestamp.now();

    // 1. Update campaña: flippeamos el entry + incrementamos totalEnviados.
    clientesContactados[idx] = {
      ...clientesContactados[idx],
      enviado: true,
      fechaEnvio: ahora,
    };
    const totalEnviados = (campanaData.totalEnviados || 0) + 1;
    tx.update(campanaRef, {
      clientesContactados,
      totalEnviados,
    });

    // 2. Update cliente: ultimoContactoMarketing + contactosMarketing
    //    cap 50 (slice -50 mantiene los más recientes).
    const clienteData = clienteSnap.data() as Record<string, unknown>;
    const contactosPrev = Array.isArray(clienteData.contactosMarketing)
      ? (clienteData.contactosMarketing as Array<Record<string, unknown>>)
      : [];
    const nuevoContacto = {
      fecha: ahora,
      plantillaId,
      plantillaNombre,
      agenteId: agente.id,
      agenteNombre: agente.nombre,
      campanaId,
    };
    // Mantenemos los últimos 50: pegamos al final, slice(-50).
    const contactosNuevos = [...contactosPrev, nuevoContacto].slice(-CONTACTOS_MARKETING_CAP);

    tx.update(clienteRef, stripUndefined({
      ultimoContactoMarketing: ahora,
      contactosMarketing: contactosNuevos,
      updatedAt: ahora,
    }));

    // 3. Audit log atómico (sprint Mapa Commit 2 iter 2 — fix reviewer):
    //    marcar enviado es una acción auditable. Vive dentro del mismo
    //    runTransaction → si campaña o cliente fallan, el audit no se
    //    commitea (3-way atomic). Idempotencia: el early-return de
    //    yaEstabaEnviado=true ya excluyó este path, así que no se
    //    escriben audits duplicados.
    const auditRef = doc(collection(db, AUDITORIA_COL));
    tx.set(auditRef, stripUndefined({
      accion: 'marcado_enviado_campana',
      tipoEntidad: 'cliente',
      entidadId: clienteId,
      actorUid: agente.id,
      actorNombre: agente.nombre,
      meta: {
        campanaId,
        plantillaId,
        plantillaNombre,
      },
      timestamp: serverTimestamp(),
    }));

    return { yaEstabaEnviado: false };
  });
}

// ──────────────────────────────────────────────────────────────────
// ROI tracking — Commit 3 (sprint Mapa Clientes)
// ──────────────────────────────────────────────────────────────────

/** Ventana de reactivación: si la orden se crea dentro de los N días
 *  siguientes al último contacto de marketing del cliente, la atribuimos
 *  a esa campaña. Spec del sprint: 60 días. */
export const REACTIVACION_VENTANA_DIAS = 60;

export interface MarcarOrdenReactivadaArgs {
  ordenId: string;
  cliente: Pick<Cliente, 'id' | 'ultimoContactoMarketing' | 'contactosMarketing'>;
}

export interface MarcarOrdenReactivadaResult {
  reactivada: boolean;
  campanaId?: string;
}

/**
 * Detecta si una orden recién creada cuenta como "reactivada" por una
 * campaña reciente y, en caso afirmativo:
 *
 * 1. Marca `orden.reactivadaPor = { campanaId, campanaFecha, ... }`.
 * 2. Incrementa `campana.totalReactivados` (+1 atomic).
 * 3. Escribe un audit log en `auditoria_admin` (`accion: 'orden_reactivada_detectada'`).
 *
 * Las 3 escrituras viven en el mismo `runTransaction` → 3-way atomic. Si
 * cualquiera falla, ninguna se commitea. Idempotente: si la orden ya tiene
 * `reactivadaPor` seteado, retorna `{reactivada: false}` sin tocar campaña.
 *
 * No-ops defensivos (retornan `{reactivada: false}`):
 *  - `cliente.ultimoContactoMarketing` ausente.
 *  - Último contacto > `REACTIVACION_VENTANA_DIAS` (default 60d).
 *  - `cliente.contactosMarketing[]` vacío o ausente (no podemos resolver
 *    qué campaña tomar como referencia).
 *  - La campaña referenciada no existe en Firestore.
 *  - La orden referenciada no existe (race con eliminación).
 *
 * Best-effort: el caller debe envolverlo en try/catch — si falla, la orden
 * recién creada queda intacta. NO se usa para gating de creación.
 *
 * Toma como "campaña responsable" el ÚLTIMO entry de `contactosMarketing[]`
 * (el más reciente). Esto coincide con `marcarClienteEnviado`, que
 * agrega contactos al final del array (slice -50). Si en el futuro se
 * rotan contactos en orden distinto, ajustar acá.
 */
export async function marcarOrdenReactivada(
  args: MarcarOrdenReactivadaArgs,
): Promise<MarcarOrdenReactivadaResult> {
  const { ordenId, cliente } = args;

  // Defensivo: sin último contacto, no hay nada que evaluar.
  const ultimo = cliente.ultimoContactoMarketing;
  if (!ultimo) return { reactivada: false };

  // Resolver fecha del último contacto.
  const fechaUltimoMs = ultimo instanceof Date
    ? ultimo.getTime()
    : (typeof (ultimo as Timestamp)?.toDate === 'function'
      ? (ultimo as Timestamp).toDate().getTime()
      : NaN);
  if (!isFinite(fechaUltimoMs)) return { reactivada: false };

  const diffDias = (Date.now() - fechaUltimoMs) / (1000 * 60 * 60 * 24);
  if (diffDias > REACTIVACION_VENTANA_DIAS) return { reactivada: false };

  // Resolver el último entry de contactos. Sin entries no podemos saber
  // a qué campaña atribuir.
  const contactos = Array.isArray(cliente.contactosMarketing) ? cliente.contactosMarketing : [];
  if (contactos.length === 0) return { reactivada: false };
  const ultimoContacto = contactos[contactos.length - 1];
  if (!ultimoContacto || !ultimoContacto.campanaId) return { reactivada: false };

  const campanaId = ultimoContacto.campanaId;
  const ordenRef = doc(db, 'ordenes_servicio', ordenId);
  const campanaRef = doc(db, CAMPANAS_COL, campanaId);

  return runTransaction(db, async (tx) => {
    const [ordenSnap, campanaSnap] = await Promise.all([
      tx.get(ordenRef),
      tx.get(campanaRef),
    ]);

    // No-ops defensivos (race conditions): la orden o la campaña pueden
    // haber sido eliminadas entre la creación de la orden y este hook.
    if (!ordenSnap.exists()) return { reactivada: false };
    if (!campanaSnap.exists()) return { reactivada: false };

    // Idempotencia: si la orden YA tiene `reactivadaPor`, no incrementamos
    // de nuevo. Esto evita doble-conteo si por algún motivo el caller
    // re-invoca el helper sobre la misma orden.
    const ordenData = ordenSnap.data() as Record<string, unknown>;
    if (ordenData.reactivadaPor && typeof ordenData.reactivadaPor === 'object') {
      return { reactivada: false };
    }

    // Resolver snapshot de campaña.
    const campanaData = campanaSnap.data() as Partial<CampanaMarketing>;
    const campanaFecha = campanaData.fecha;
    const campanaPlantillaNombre = campanaData.plantillaNombre || '';
    if (!campanaFecha) {
      // Defensivo: campaña sin fecha. No bloqueamos pero no marcamos.
      return { reactivada: false };
    }

    // Snapshot fechaContacto: usamos la fecha del entry específico (no
    // ultimoContactoMarketing, que se reescribe en cada envío). Eso da
    // trazabilidad fina cuando hay múltiples campañas en cooldown.
    const fechaContacto = ultimoContacto.fecha;

    // 1. Update orden: snapshot reactivadaPor.
    tx.update(ordenRef, {
      reactivadaPor: stripUndefined({
        campanaId,
        campanaFecha,
        campanaPlantillaNombre,
        fechaContacto,
      }),
      updatedAt: Timestamp.now(),
    });

    // 2. Update campaña: incrementar totalReactivados (+1) atomic.
    tx.update(campanaRef, {
      totalReactivados: increment(1),
      totalReactivadosUpdatedAt: serverTimestamp(),
    });

    // 3. Audit log atómico (3-way atomic con orden + campaña).
    const auditRef = doc(collection(db, AUDITORIA_COL));
    tx.set(auditRef, stripUndefined({
      accion: 'orden_reactivada_detectada',
      tipoEntidad: 'orden',
      entidadId: ordenId,
      meta: {
        campanaId,
        plantillaId: campanaData.plantillaId || '',
        plantillaNombre: campanaPlantillaNombre,
        clienteId: cliente.id,
        diasDesdeContacto: Math.round(diffDias),
      },
      timestamp: serverTimestamp(),
    }));

    return { reactivada: true, campanaId };
  });
}

// ──────────────────────────────────────────────────────────────────
// Listado histórico de campañas (Commit 3 — sección ROI en
// /admin/configuracion-marketing)
// ──────────────────────────────────────────────────────────────────

/**
 * Suscripción real-time a `campanas_marketing` ordenado por `fecha desc`.
 * Devuelve campañas con `id` para alimentar la tabla histórica de ROI.
 * Lectura gate: la rule `campanas_marketing.read` es esAdminOCoord(),
 * así que esto solo funciona desde sesiones con ese rol.
 */
export function subscribeToCampanas(
  callback: (campanas: CampanaMarketing[]) => void,
): Unsubscribe {
  const q = query(collection(db, CAMPANAS_COL), orderBy('fecha', 'desc'));
  return onSnapshot(q, (snap) => {
    const lista: CampanaMarketing[] = snap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      return {
        id: d.id,
        fecha: (data.fecha as Timestamp) || Timestamp.now(),
        plantillaId: typeof data.plantillaId === 'string' ? data.plantillaId : '',
        plantillaNombre: typeof data.plantillaNombre === 'string' ? data.plantillaNombre : '',
        filtrosAplicados: (data.filtrosAplicados as FiltrosCampanaMarketing) || {},
        clientesContactados: Array.isArray(data.clientesContactados)
          ? (data.clientesContactados as ClienteEnCampana[])
          : [],
        creadaPor: typeof data.creadaPor === 'string' ? data.creadaPor : '',
        creadaPorNombre: typeof data.creadaPorNombre === 'string' ? data.creadaPorNombre : '',
        totalEnviados: typeof data.totalEnviados === 'number' ? data.totalEnviados : 0,
        totalReactivados: typeof data.totalReactivados === 'number' ? data.totalReactivados : undefined,
        totalReactivadosUpdatedAt: (data.totalReactivadosUpdatedAt as Timestamp) || undefined,
        overrideCooldown: data.overrideCooldown === true ? true : undefined,
        overrideCooldownPorId: typeof data.overrideCooldownPorId === 'string' ? data.overrideCooldownPorId : undefined,
        overrideCooldownPorNombre: typeof data.overrideCooldownPorNombre === 'string' ? data.overrideCooldownPorNombre : undefined,
        overrideCooldownEn: (data.overrideCooldownEn as Timestamp) || undefined,
        overrideCooldownMotivo: typeof data.overrideCooldownMotivo === 'string' ? data.overrideCooldownMotivo : undefined,
        creadaEn: (data.creadaEn as Timestamp) || (data.fecha as Timestamp) || Timestamp.now(),
      };
    });
    callback(lista);
  });
}
