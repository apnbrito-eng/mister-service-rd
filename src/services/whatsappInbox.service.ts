import {
  collection,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where,
  Unsubscribe,
  Timestamp,
  addDoc,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import {
  WhatsAppConversacion,
  WhatsAppMensajeInbox,
  WhatsAppMensajeOutbox,
} from '../types';

/**
 * Service de lectura del inbox WhatsApp CRM (SPRINT-INBOX-1, 2026-05-20).
 *
 * IMPORTANTE — frontera de responsabilidades:
 *   - Este service SOLO lee `whatsapp_conversaciones` / `_inbox` / `_outbox`
 *     y hace updates PARCIALES sobre campos UI-mutables. NO envía mensajes
 *     (eso es `whatsapp.service.ts`, wrapper del endpoint serverless
 *     `api/whatsapp/send`).
 *   - El modelo de datos lo escribe el backend (webhook + send via Admin SDK).
 *     Las rules `firestore.rules:686-844` permiten al cliente tocar SOLO
 *     `asignadaA`, `noLeidos`, `etiquetas`, `bot.habilitado`. Cualquier
 *     update masivo (`updateDoc(ref, todoElObjeto)`) re-escribe campos
 *     inmutables y la rule rechaza con `permission-denied`. Por eso acá
 *     usamos dot-path (`{ 'bot.habilitado': true }`) y updateDoc selectivo.
 *
 * Gotchas aplicadas:
 *   - P-001 (`userProfile.id ≠ auth.uid`): el audit y `asignadaA` usan
 *     el `uid` recibido por parámetro, que el caller obtiene de
 *     `useApp().currentUser?.uid` (no de `userProfile.id`).
 *   - P-015 (orderBy sobre campo no garantizado): la query de conversaciones
 *     ordena por `ultimaActividad` que el webhook escribe en CADA mensaje
 *     entrante con `FieldValue.serverTimestamp()`; la tag `@safe-orderby`
 *     marca el caso. Conversaciones creadas pero sin actividad reciente
 *     no es un caso real (webhook siempre la escribe), pero la cascada
 *     defensive client-side ordena por updatedAt como fallback.
 */

const COLLECTION_CONVERSACIONES = 'whatsapp_conversaciones';
const COLLECTION_MENSAJES_INBOX = 'whatsapp_mensajes_inbox';
const COLLECTION_MENSAJES_OUTBOX = 'whatsapp_mensajes_outbox';

/** Normaliza un Timestamp Firestore o Date a milisegundos epoch. */
function toMillis(t: Timestamp | Date | undefined | null): number {
  if (!t) return 0;
  if (t instanceof Date) return t.getTime();
  // Timestamp Firestore tiene .toMillis()
  if (typeof (t as Timestamp).toMillis === 'function') {
    return (t as Timestamp).toMillis();
  }
  return 0;
}

/**
 * Parsea un doc de `whatsapp_conversaciones` desde Firestore al tipo
 * canónico. Tolera campos faltantes (conversaciones viejas, drift).
 */
function parsearConversacion(id: string, data: Record<string, unknown>): WhatsAppConversacion {
  return {
    id,
    wa_id: (data.wa_id as string) ?? id,
    ultimoPhoneNumberId: (data.ultimoPhoneNumberId as string) ?? '',
    clienteId: (data.clienteId as string) ?? undefined,
    ultimoMensajeEntrante: data.ultimoMensajeEntrante as
      | WhatsAppConversacion['ultimoMensajeEntrante']
      | undefined,
    ultimoMensajeSaliente: data.ultimoMensajeSaliente as
      | WhatsAppConversacion['ultimoMensajeSaliente']
      | undefined,
    noLeidos: typeof data.noLeidos === 'number' ? data.noLeidos : 0,
    totalMensajesEntrantes:
      typeof data.totalMensajesEntrantes === 'number'
        ? data.totalMensajesEntrantes
        : undefined,
    totalMensajesSalientes:
      typeof data.totalMensajesSalientes === 'number'
        ? data.totalMensajesSalientes
        : undefined,
    ventana24h: (data.ventana24h as WhatsAppConversacion['ventana24h']) ?? {
      abierta: false,
      cierraEn: new Date(0),
    },
    requiereHumano: data.requiereHumano === true,
    asignadaA: (data.asignadaA as string | null | undefined) ?? null,
    etiquetas: Array.isArray(data.etiquetas) ? (data.etiquetas as string[]) : [],
    bot: data.bot as WhatsAppConversacion['bot'],
    primeraInteraccion: data.primeraInteraccion as Timestamp | Date | undefined,
    ultimaActividad: data.ultimaActividad as Timestamp | Date | undefined,
    updatedAt: data.updatedAt as Timestamp | Date | undefined,
  };
}

function parsearMensajeInbox(
  id: string,
  data: Record<string, unknown>,
): WhatsAppMensajeInbox {
  return {
    id,
    wamid: (data.wamid as string) ?? id,
    phoneNumberId: (data.phoneNumberId as string) ?? '',
    wa_id: (data.wa_id as string) ?? '',
    from: (data.from as string) ?? '',
    tipo: (data.tipo as WhatsAppMensajeInbox['tipo']) ?? 'unsupported',
    contenido: (data.contenido as WhatsAppMensajeInbox['contenido']) ?? {},
    timestampMeta: (data.timestampMeta as Timestamp | Date) ?? new Date(0),
    timestampRecibido: (data.timestampRecibido as Timestamp | Date) ?? new Date(0),
    procesadoBot: data.procesadoBot === true,
    conversacionId: (data.conversacionId as string) ?? (data.wa_id as string) ?? '',
    raw: data.raw as Record<string, unknown> | undefined,
  };
}

function parsearMensajeOutbox(
  id: string,
  data: Record<string, unknown>,
): WhatsAppMensajeOutbox {
  return {
    id,
    tempId: (data.tempId as string) ?? id,
    wamid: (data.wamid as string | null) ?? null,
    phoneNumberId: (data.phoneNumberId as string) ?? '',
    wa_id: (data.wa_id as string) ?? '',
    tipo: (data.tipo as WhatsAppMensajeOutbox['tipo']) ?? 'texto_libre',
    plantilla: (data.plantilla as WhatsAppMensajeOutbox['plantilla']) ?? null,
    texto: (data.texto as string | null) ?? null,
    media: (data.media as WhatsAppMensajeOutbox['media']) ?? null,
    estado: (data.estado as WhatsAppMensajeOutbox['estado']) ?? 'queued',
    intentosEnvio: typeof data.intentosEnvio === 'number' ? data.intentosEnvio : 0,
    creadoPor: (data.creadoPor as string) ?? '',
    creadoPorNombre: (data.creadoPorNombre as string) ?? undefined,
    ordenId: (data.ordenId as string | null) ?? null,
    conversacionId: (data.conversacionId as string) ?? (data.wa_id as string) ?? '',
    createdAt: (data.createdAt as Timestamp | Date) ?? new Date(0),
    updatedAt: (data.updatedAt as Timestamp | Date) ?? new Date(0),
    errorMeta: data.errorMeta as WhatsAppMensajeOutbox['errorMeta'] | undefined,
  };
}

/**
 * Suscribe a todas las conversaciones, ordenadas por última actividad
 * (más recientes primero). Devuelve `Unsubscribe` para que el caller
 * limpie en su useEffect cleanup.
 *
 * Ordenamiento: client-side post-snapshot por `ultimaActividad`
 * (o `updatedAt` fallback), porque la consulta sin where no requiere
 * índice compuesto (solo staff oficina lee — rule la gatea por rol).
 *
 * @safe-listener-sin-where: la rule `whatsapp_conversaciones` (line 730)
 *   permite read a `esStaffOficina()`. La query devuelve TODA la colección,
 *   sin where — es intencional para construir la bandeja global. NO romper
 *   el cazador P-012 con un where artificial.
 */
export function suscribirConversaciones(
  callback: (conversaciones: WhatsAppConversacion[]) => void,
): Unsubscribe {
  const colRef = collection(db, COLLECTION_CONVERSACIONES);
  return onSnapshot(colRef, (snap) => {
    const items: WhatsAppConversacion[] = snap.docs.map((d) =>
      parsearConversacion(d.id, d.data()),
    );
    // Sort client-side por última actividad descendente. Fallback updatedAt.
    items.sort((a, b) => {
      const ta = toMillis(a.ultimaActividad ?? a.updatedAt);
      const tb = toMillis(b.ultimaActividad ?? b.updatedAt);
      return tb - ta;
    });
    callback(items);
  });
}

/**
 * Suscribe a los mensajes (entrantes + salientes) de UNA conversación.
 * Hace 2 listeners (inbox y outbox), merge client-side, sort por timestamp
 * ascendente (más viejos arriba, como un chat normal).
 *
 * Las 2 queries tienen where('wa_id', '==', wa_id) — necesario porque las
 * colecciones son globales y la rule de outbox permite read a staff
 * oficina (sin filtrar por conversación). El filter por wa_id es UX-side,
 * no security-side; las rules igual cubren.
 *
 * NO usamos `orderBy('timestampMeta')` en la query porque el outbox usa
 * `createdAt` distinto, y mezclar requiere sort client-side. Esto evita
 * crear índice compuesto innecesario (P-015 aplica al revés acá — no
 * agregamos orderBy sobre campo que puede faltar).
 */
export function suscribirMensajes(
  wa_id: string,
  callback: (mensajes: Array<
    | (WhatsAppMensajeInbox & { _direccion: 'entrante' })
    | (WhatsAppMensajeOutbox & { _direccion: 'saliente' })
  >) => void,
): Unsubscribe {
  // Estado local: 2 listas separadas que se mergean en cada cambio.
  let entrantes: WhatsAppMensajeInbox[] = [];
  let salientes: WhatsAppMensajeOutbox[] = [];

  function emit() {
    const merged: Array<
      | (WhatsAppMensajeInbox & { _direccion: 'entrante' })
      | (WhatsAppMensajeOutbox & { _direccion: 'saliente' })
    > = [
      ...entrantes.map((m) => ({ ...m, _direccion: 'entrante' as const })),
      ...salientes.map((m) => ({ ...m, _direccion: 'saliente' as const })),
    ];
    merged.sort((a, b) => {
      const ta =
        a._direccion === 'entrante'
          ? toMillis(a.timestampMeta)
          : toMillis(a.createdAt);
      const tb =
        b._direccion === 'entrante'
          ? toMillis(b.timestampMeta)
          : toMillis(b.createdAt);
      return ta - tb;
    });
    callback(merged);
  }

  // Filtramos por wa_id explícitamente. Las rules gatean por
  // esStaffOficina() en ambas colecciones. Cazador P-012 no aplica
  // (las queries SÍ tienen where).
  const qInbox = query(
    collection(db, COLLECTION_MENSAJES_INBOX),
    where('wa_id', '==', wa_id),
  );
  const qOutbox = query(
    collection(db, COLLECTION_MENSAJES_OUTBOX),
    where('wa_id', '==', wa_id),
  );

  const unsubIn = onSnapshot(qInbox, (snap) => {
    entrantes = snap.docs.map((d) => parsearMensajeInbox(d.id, d.data()));
    emit();
  });
  const unsubOut = onSnapshot(qOutbox, (snap) => {
    salientes = snap.docs.map((d) => parsearMensajeOutbox(d.id, d.data()));
    emit();
  });

  return () => {
    unsubIn();
    unsubOut();
  };
}

/**
 * Marca una conversación como leída (reset noLeidos a 0). Update PARCIAL
 * para no triggear inmutabilidad de los otros campos.
 *
 * No bloquea si falla — es UX, no crítico. El caller puede ignorar el
 * resultado.
 */
export async function marcarLeida(wa_id: string): Promise<void> {
  const ref = doc(db, COLLECTION_CONVERSACIONES, wa_id);
  await updateDoc(ref, { noLeidos: 0 });
}

/**
 * Toggle del bot IA para una conversación. Update parcial con dot-path
 * (`bot.habilitado`) para no tocar `bot.contexto` / `bot.turnosCount`
 * que son inmutables desde cliente (rule line 751-752).
 *
 * La rule (line 767-772) exige que el caller sea admin/coord O la
 * asignataria de la conversación, sino rechaza con permission-denied.
 *
 * Registra audit en `auditoria_admin` (rule line 851 permite create con
 * isAuth). NO bloquea el toggle si el audit falla.
 *
 * @param wa_id ID de la conversación.
 * @param habilitado Nuevo estado del bot.
 * @param actorUid auth.uid del staff que dispara el cambio (gotcha P-001:
 *   debe venir de currentUser.uid, NO userProfile.id).
 */
export async function toggleBot(
  wa_id: string,
  habilitado: boolean,
  actorUid: string,
): Promise<void> {
  const ref = doc(db, COLLECTION_CONVERSACIONES, wa_id);
  // Update parcial dot-path: solo bot.habilitado. Los otros campos del
  // sub-objeto bot (contexto, turnosCount) quedan intactos por Firestore.
  await updateDoc(ref, { 'bot.habilitado': habilitado });

  // Audit log (no bloquea si falla).
  try {
    await addDoc(collection(db, 'auditoria_admin'), {
      accion: habilitado ? 'wa_bot_activar' : 'wa_bot_pausar',
      solicitanteUid: actorUid,
      objetivoTipo: 'whatsapp_conversacion',
      objetivoId: wa_id,
      // Truncamos el wa_id en el log (PII) — coincide con el patrón del
      // backend (truncarWaIdParaLog).
      objetivoWaIdTruncado: wa_id.length >= 4 ? `***${wa_id.slice(-4)}` : '***',
      timestamp: Timestamp.now(),
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      '[whatsappInbox] audit toggleBot falló (no bloquea):',
      err,
    );
  }
}

/**
 * Toma o suelta la asignación de una conversación. Update parcial.
 *
 * Anti-robo (rule line 754-764, security audit SPRINT-WA-RULES):
 *   - admin/coord: libre (cualquier transición).
 *   - resto: solo tomar (previo null → uid propio), soltar (previo uid
 *     propio → null), o mantener. NO puede robar (uidOtro → uidPropio).
 *
 * Si la rule rechaza, el `updateDoc` lanza FirebaseError 'permission-denied'.
 * El caller debe envolver en try/catch + toast UX.
 *
 * @param wa_id Conversación.
 * @param nuevoAsignadoUid `null` para soltar, `auth.uid` para tomar.
 * @param actorUid auth.uid del operador (audit).
 */
export async function asignarConversacion(
  wa_id: string,
  nuevoAsignadoUid: string | null,
  actorUid: string,
): Promise<void> {
  const ref = doc(db, COLLECTION_CONVERSACIONES, wa_id);
  await updateDoc(ref, { asignadaA: nuevoAsignadoUid });

  try {
    await addDoc(collection(db, 'auditoria_admin'), {
      accion: nuevoAsignadoUid === null ? 'wa_conv_soltar' : 'wa_conv_tomar',
      solicitanteUid: actorUid,
      objetivoTipo: 'whatsapp_conversacion',
      objetivoId: wa_id,
      objetivoWaIdTruncado: wa_id.length >= 4 ? `***${wa_id.slice(-4)}` : '***',
      nuevoAsignadoUid: nuevoAsignadoUid ?? null,
      timestamp: Timestamp.now(),
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      '[whatsappInbox] audit asignarConversacion falló (no bloquea):',
      err,
    );
  }
}

/**
 * Actualiza las etiquetas de la conversación (reemplazo completo del array).
 * La rule permite tocar `etiquetas` sin restricción de contenido (campo
 * libre clasificatorio). Update parcial.
 */
export async function actualizarEtiquetas(
  wa_id: string,
  etiquetas: string[],
): Promise<void> {
  const ref = doc(db, COLLECTION_CONVERSACIONES, wa_id);
  await updateDoc(ref, { etiquetas });
}

/**
 * Suma el contador de `noLeidos` de todas las conversaciones (badge
 * sidebar). Devuelve la función de unsubscribe.
 */
export function suscribirContadorSinLeer(callback: (total: number) => void): Unsubscribe {
  return suscribirConversaciones((convs) => {
    const total = convs.reduce((acc, c) => acc + (c.noLeidos || 0), 0);
    callback(total);
  });
}

/**
 * Heurística "sin responder": último mensaje entrante existe Y es más
 * nuevo que el último saliente (o no hay saliente).
 * Compartida con la página /admin/inbox.
 */
function estaSinResponder(c: WhatsAppConversacion): boolean {
  const ent = c.ultimoMensajeEntrante?.timestamp;
  if (!ent) return false;
  const sal = c.ultimoMensajeSaliente?.timestamp;
  if (!sal) return true;
  const tEnt = ent instanceof Date ? ent.getTime() : (ent as { toMillis?: () => number }).toMillis?.() ?? 0;
  const tSal = sal instanceof Date ? sal.getTime() : (sal as { toMillis?: () => number }).toMillis?.() ?? 0;
  return tEnt > tSal;
}

/**
 * Métricas agregadas del inbox para cards del Dashboard (SPRINT-INBOX-6,
 * 2026-05-20). Single listener que emite las 3 métricas en cada cambio:
 *   - `sinResponder`: cantidad de conversaciones con último entrante más
 *     nuevo que último saliente (o sin saliente).
 *   - `medianaRespuestaSegundos`: mediana del lag entre ultimoEntrante
 *     y ultimoSaliente para conversaciones que SÍ tuvieron respuesta
 *     (mide qué tan rápido contesta el equipo). `null` si no hay datos.
 *   - `masAntiguaSinResponder`: la conversación más vieja sin responder,
 *     para CTA "Atender la más urgente". `null` si todas están al día.
 *
 * Eficiente: las 3 derivan del mismo snapshot — no triplica el listener.
 */
export interface MetricasInbox {
  sinResponder: number;
  medianaRespuestaSegundos: number | null;
  masAntiguaSinResponder: WhatsAppConversacion | null;
}

export function suscribirMetricasInbox(
  callback: (m: MetricasInbox) => void,
): Unsubscribe {
  return suscribirConversaciones((convs) => {
    const sinResponderList = convs.filter(estaSinResponder);

    // Mediana de tiempo de respuesta: para conversaciones donde el
    // último saliente es más nuevo que el último entrante (= se respondió
    // al menos una vez). Distancia entre los 2 timestamps.
    const lags: number[] = [];
    for (const c of convs) {
      const ent = c.ultimoMensajeEntrante?.timestamp;
      const sal = c.ultimoMensajeSaliente?.timestamp;
      if (!ent || !sal) continue;
      const tEnt = ent instanceof Date ? ent.getTime() : (ent as { toMillis?: () => number }).toMillis?.() ?? 0;
      const tSal = sal instanceof Date ? sal.getTime() : (sal as { toMillis?: () => number }).toMillis?.() ?? 0;
      if (tSal > tEnt) {
        // Saliente más nuevo → ya se respondió al último entrante.
        lags.push((tSal - tEnt) / 1000);
      }
    }
    lags.sort((a, b) => a - b);
    let mediana: number | null = null;
    if (lags.length > 0) {
      const mid = Math.floor(lags.length / 2);
      mediana = lags.length % 2 === 0 ? (lags[mid - 1] + lags[mid]) / 2 : lags[mid];
    }

    // Más antigua sin responder: la del último entrante más viejo.
    let masAntigua: WhatsAppConversacion | null = null;
    let tMin = Infinity;
    for (const c of sinResponderList) {
      const ent = c.ultimoMensajeEntrante?.timestamp;
      if (!ent) continue;
      const t = ent instanceof Date ? ent.getTime() : (ent as { toMillis?: () => number }).toMillis?.() ?? 0;
      if (t > 0 && t < tMin) {
        tMin = t;
        masAntigua = c;
      }
    }

    callback({
      sinResponder: sinResponderList.length,
      medianaRespuestaSegundos: mediana,
      masAntiguaSinResponder: masAntigua,
    });
  });
}
