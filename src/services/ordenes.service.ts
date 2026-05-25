import {
  runTransaction, doc, serverTimestamp, Timestamp,
  updateDoc, arrayUnion, collection, query, where, getDocs, onSnapshot,
  limit, deleteField,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { crearRegistroAuditoria, generarTokenPortalCliente, parseOrden } from '../utils';
import { stripUndefined } from '../utils/firestore';
import type { OrdenServicio, Personal, PropuestaReprogramacion, SugerenciaSoloChequeo } from '../types';
import { crearNotificacion } from './notificaciones.service';
import { diasRestantesVigencia, type ChequeoVigenteInfo } from '../utils/descuentoChequeo';

/**
 * Resultado de `reactivarOrdenPostChequeo`. Devuelve `ok=false` cuando la
 * reactivación es inválida (ya hecha, no es chequeo, etc.) — el caller debe
 * mostrar `razon` al usuario.
 */
export interface ReactivarOrdenPostChequeoResult {
  ok: boolean;
  razon?:
    | 'orden_no_existe'
    | 'ya_reactivada'
    | 'no_es_solo_chequeo'
    | 'error_interno';
}

/**
 * Reactiva una orden cerrada como solo chequeo cuando el cliente regresa para
 * hacer la reparación. Conserva el cierre del chequeo previo como histórico
 * (`cierreChequeoHistorico`) y limpia el estado de cierre/aprobación para
 * que la orden vuelva al flujo normal de cotización + aprobación + cierre.
 *
 * IMPORTANTE: el conduce CG y la comisión (RD$0) del chequeo previo NO se
 * tocan — siguen vigentes en `facturas` y `comisiones` como registro fiscal
 * del cobro de los RD$2,000.
 *
 * Idempotente: si la orden ya fue reactivada, retorna `{ok:false, razon:'ya_reactivada'}`.
 */
export async function reactivarOrdenPostChequeo(
  ordenId: string,
  usuarioActual: { id: string; nombre: string },
): Promise<ReactivarOrdenPostChequeoResult> {
  const ordenRef = doc(db, 'ordenes_servicio', ordenId);

  try {
    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(ordenRef);
      if (!snap.exists()) return { ok: false, razon: 'orden_no_existe' as const };
      const data = snap.data() as Record<string, unknown>;

      // Idempotencia: si ya fue reactivada, no doble-procesar
      if (data.reactivadaPostChequeo === true) {
        return { ok: false, razon: 'ya_reactivada' as const };
      }
      if (data.soloChequeo !== true) {
        return { ok: false, razon: 'no_es_solo_chequeo' as const };
      }

      // Snapshot del cierre del chequeo previo
      const cierreServicioRaw = data.cierreServicio as Record<string, unknown> | undefined;
      const fechaCierreRaw = cierreServicioRaw?.fechaCierre ?? data.fechaCierre ?? Timestamp.now();
      const historicoBase: Record<string, unknown> = {
        monto: Number(data.precioChequeo || data.precioFinal || 0),
        fechaCierre: fechaCierreRaw,
        conduceCG: data.referenciaConduce || data.facturaNumero,
        tecnicoId: data.tecnicoId,
        tecnicoNombre: data.tecnicoNombre,
        motivoChequeo: data.motivoChequeo,
      };
      // Strip undefined antes de escribir a Firestore
      const historicoLimpio = Object.fromEntries(
        Object.entries(historicoBase).filter(([, v]) => v !== undefined && v !== null && v !== ''),
      );
      // Garantizar que `monto` y `fechaCierre` siempre estén
      if (!('monto' in historicoLimpio)) historicoLimpio.monto = 0;
      if (!('fechaCierre' in historicoLimpio)) historicoLimpio.fechaCierre = Timestamp.now();

      const usuario = usuarioActual.nombre;
      const nuevoEntradaHistorial = {
        fase: 'reactivada_post_chequeo',
        timestamp: Timestamp.now(),
        usuario,
        nota: `Reactivada para reparación. Chequeo previo: RD$${(historicoLimpio.monto as number).toLocaleString('es-DO')}`,
      };

      const auditoriaEntry = crearRegistroAuditoria(
        usuario,
        'reactivar_orden_post_chequeo',
        `Reactivada para reparación. Chequeo previo: RD$${(historicoLimpio.monto as number).toLocaleString('es-DO')}`,
      );

      const historialPrev = Array.isArray(data.historialFases) ? data.historialFases : [];
      const auditoriaPrev = Array.isArray(data.auditoria) ? data.auditoria : [];

      // Limpiar campos de cierre con `null` (Firestore no acepta `undefined`).
      // El parser ya tolera ambos (parseFirestoreDate retorna null/undefined).
      // Portal del Cliente: la reparación reactivada vuelve a `agendado`. Si
      // el chequeo previo no tenía token (orden vieja), generarlo ahora.
      const tokenExistente = typeof data.tokenPortalCliente === 'string' && data.tokenPortalCliente.length > 0
        ? (data.tokenPortalCliente as string)
        : null;

      const updates: Record<string, unknown> = {
        fase: 'agendado',
        estadoSimple: 'pendiente',
        estado: 'activo',
        soloChequeo: false,
        tipoCierre: 'reparacion_completa',
        precioSugerido: null,
        precioAprobado: null,
        precioFinal: null,
        estadoAprobacion: 'pendiente',
        aprobadoPor: null,
        fechaAprobacion: null,
        cierreServicio: null,
        metodoPagoCierre: null,
        bancoDestinoCierre: null,
        pagos: [],
        montoPagado: 0,
        estadoPago: 'pendiente',
        // La nueva reparación irá a facturación cuando cierre — limpiamos
        // las marcas del chequeo (que ya generó su CG previo).
        enviadaAFacturacion: false,
        enviadaAFacturacionAt: null,
        enviadaAFacturacionPorId: null,
        enviadaAFacturacionPorNombre: null,
        facturada: false,
        facturaId: null,
        facturaNumero: null,
        facturadaAt: null,
        facturadaPorId: null,
        facturadaPorNombre: null,
        precioChequeo: null,
        motivoChequeo: null,
        // Limpiar foto/GPS del chequeo previo: el banner verde "Chequeo
        // iniciado por X" en OrdenDetailModal/OrdenDetalle se muestra basado
        // en `inicioChequeo`. Si no se limpia, la nueva reparación arranca
        // mostrando data del chequeo previo. Foto/GPS quedan referenciados
        // en `auditoria` y en el conduce CG previo (no se pierde traza).
        inicioChequeo: null,
        // Marcar reactivación + histórico
        reactivadaPostChequeo: true,
        reactivadaPostChequeoEn: serverTimestamp(),
        reactivadaPostChequeoPor: usuario,
        cierreChequeoHistorico: historicoLimpio,
        // Historial + auditoría
        historialFases: [...historialPrev, nuevoEntradaHistorial],
        auditoria: [...auditoriaPrev, auditoriaEntry],
        updatedAt: serverTimestamp(),
      };

      if (!tokenExistente) {
        updates.tokenPortalCliente = generarTokenPortalCliente();
      }

      tx.update(ordenRef, updates);
      return { ok: true };
    });
  } catch (err) {
    console.error('Error reactivando orden post-chequeo:', err);
    return { ok: false, razon: 'error_interno' };
  }
}

// ─────────────────────────────────────────────────────────────────────
// Re-sincronización de operaria — SPRINT-130
// ─────────────────────────────────────────────────────────────────────

/**
 * Resultado de `resincronizarOperariaEnOrden`. `ok=false` cuando no se hizo
 * cambio (ya sincronizada / técnico sin operaria / orden sin técnico). Las
 * razones son discriminadas para que el caller renderice el mensaje correcto.
 */
export type ResincronizarOperariaResult =
  | { ok: true; operariaIdAnterior: string | null; operariaIdNuevo: string | null }
  | { ok: false; razon: 'orden_no_existe' | 'orden_sin_tecnico' | 'tecnico_no_encontrado' | 'tecnico_sin_operaria' | 'ya_sincronizada' | 'error_interno' };

/**
 * Re-sincroniza `operariaId` + `operariaNombre` de una orden con los valores
 * actuales de `personal/{tecnicoUid}.operariaId/operariaNombre`. Caso de uso:
 * cuando se asigna operaria a un técnico DESPUÉS de que ya tenga órdenes
 * abiertas, el snapshot congelado al crear la orden queda desactualizado.
 * Este helper permite corregirlo manualmente desde la UI (1 click = 1 orden).
 *
 * Atomicidad vía `runTransaction`: si dos clicks concurrentes disparan el
 * helper, el segundo verá el estado ya sincronizado y retornará
 * `ya_sincronizada` sin doble-escribir.
 *
 * IMPORTANTE: `orden.tecnicoId` se interpreta como `auth.uid` del técnico
 * (convención post-`c4be345`/SPRINT-106). El caller debe pasarle el array
 * `personal` para buscar el técnico por `p.uid` (no por `p.id`).
 *
 * NO toca el campo `tecnicoId` ni el `tecnicoNombre` de la orden — solo
 * `operariaId` y `operariaNombre`. Eso preserva el historial: la orden
 * siempre fue del técnico X, lo que cambia es a qué operaria reporta hoy.
 */
export async function resincronizarOperariaEnOrden(
  ordenId: string,
  personal: Personal[],
  usuarioActual: { nombre: string },
): Promise<ResincronizarOperariaResult> {
  const ordenRef = doc(db, 'ordenes_servicio', ordenId);
  try {
    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(ordenRef);
      if (!snap.exists()) return { ok: false, razon: 'orden_no_existe' as const };
      const data = snap.data() as Record<string, unknown>;

      const tecnicoId = typeof data.tecnicoId === 'string' ? data.tecnicoId : '';
      if (!tecnicoId) return { ok: false, razon: 'orden_sin_tecnico' as const };

      // Buscar técnico por uid (post-SPRINT-106 tecnicoId == auth.uid). Fallback
      // a p.id solo por compatibilidad con órdenes legacy no migradas.
      const tecnico = personal.find((p) => (p.uid || p.id) === tecnicoId);
      if (!tecnico) return { ok: false, razon: 'tecnico_no_encontrado' as const };

      const operariaIdNuevo = tecnico.operariaId ?? null;
      const operariaNombreNuevo = tecnico.operariaNombre ?? null;
      if (!operariaIdNuevo) return { ok: false, razon: 'tecnico_sin_operaria' as const };

      const operariaIdActual = typeof data.operariaId === 'string' && data.operariaId.length > 0
        ? data.operariaId
        : null;
      const operariaNombreActual = typeof data.operariaNombre === 'string' && data.operariaNombre.length > 0
        ? data.operariaNombre
        : null;

      if (operariaIdActual === operariaIdNuevo && operariaNombreActual === operariaNombreNuevo) {
        return { ok: false, razon: 'ya_sincronizada' as const };
      }

      const detalle = operariaNombreActual
        ? `Re-sincronizó operaria de "${operariaNombreActual}" a "${operariaNombreNuevo}" (derivada del técnico ${tecnico.nombre || ''}).`
        : `Asignó operaria "${operariaNombreNuevo}" (derivada del técnico ${tecnico.nombre || ''}).`;

      const auditoriaEntry = crearRegistroAuditoria(
        usuarioActual.nombre,
        'editar',
        detalle,
        'operariaId',
        operariaIdActual ?? '',
        operariaIdNuevo,
      );

      tx.update(ordenRef, {
        operariaId: operariaIdNuevo,
        operariaNombre: operariaNombreNuevo,
        auditoria: arrayUnion(auditoriaEntry),
        updatedAt: serverTimestamp(),
      });

      return {
        ok: true as const,
        operariaIdAnterior: operariaIdActual,
        operariaIdNuevo,
      };
    });
  } catch (err) {
    console.error('Error re-sincronizando operaria en orden:', err);
    return { ok: false, razon: 'error_interno' };
  }
}

// ─────────────────────────────────────────────────────────────────────
// Sugerencia de "solo chequeo" — flujo técnico → oficina (R4 endurecida)
// ─────────────────────────────────────────────────────────────────────

/**
 * Strip recursivo de undefined antes de escribir a Firestore. No usamos el
 * helper genérico de `utils/firestore` para no preservar Timestamp como
 * tipo: en este caso queremos exactamente la forma plana del payload.
 */
function stripUndefinedShallow<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

/**
 * Crea una sugerencia de "solo chequeo" en la orden y notifica a admin/coord.
 * El técnico llama esto cuando el cliente decidió no proceder con la
 * reparación. La sugerencia entra como `estado: 'pendiente'` y la oficina la
 * resuelve (aprobar/rechazar) desde `/admin/sugerencias-chequeo`.
 *
 * IMPORTANTE: este helper NO setea `soloChequeo`, `precioFinal`, ni
 * `estadoAprobacion`. Esos los setea oficina al aprobar (vía
 * `resolverSugerenciaSoloChequeo`). Las rules R4 bloquean al técnico que
 * intente esos writes directos.
 *
 * Idempotente por `sugerencia.id` (uuid client-side): un retry con la misma
 * sugerencia hará un `arrayUnion` que Firestore deduplica automáticamente.
 */
export async function crearSugerenciaSoloChequeo(
  ordenId: string,
  sugerencia: SugerenciaSoloChequeo,
  contexto: {
    ordenNumero: string;
    clienteNombre: string;
    tecnicoNombre: string;
  },
): Promise<void> {
  const ordenRef = doc(db, 'ordenes_servicio', ordenId);

  // Strip undefined antes del arrayUnion: Firestore rechaza undefined
  // dentro de arrays. Conservamos los campos opcionales solo si vienen
  // con valor.
  const sugerenciaPayload = stripUndefinedShallow({
    id: sugerencia.id,
    estado: sugerencia.estado,
    sugeridaPor: sugerencia.sugeridaPor,
    sugeridaPorNombre: sugerencia.sugeridaPorNombre,
    fechaSugerencia: sugerencia.fechaSugerencia instanceof Date
      ? Timestamp.fromDate(sugerencia.fechaSugerencia)
      : sugerencia.fechaSugerencia,
    motivo: sugerencia.motivo,
    montoChequeo: sugerencia.montoChequeo,
    resueltaPor: sugerencia.resueltaPor,
    resueltaPorNombre: sugerencia.resueltaPorNombre,
    resueltaEn: sugerencia.resueltaEn,
    notaResolucion: sugerencia.notaResolucion,
  });

  await updateDoc(ordenRef, {
    sugerenciasSoloChequeo: arrayUnion(sugerenciaPayload),
    updatedAt: Timestamp.now(),
  });

  // Fan-out de notificaciones a admin/coord. Best-effort: si una falla,
  // no abortamos el resto (seguimos el patrón de EnviarFacturacionButton).
  try {
    const qStaff = query(
      collection(db, 'personal'),
      where('activo', '==', true),
      where('rol', 'in', ['administrador', 'coordinadora']),
    );
    const snap = await getDocs(qStaff);
    const destinatarios = snap.docs
      .map(d => ({ id: d.id, ...d.data() } as Personal))
      .filter(p => !!p.uid);

    await Promise.all(
      destinatarios.map(p =>
        crearNotificacion({
          userId: p.uid!,
          destinatarioNombre: p.nombre,
          tipo: 'sugerencia_solo_chequeo',
          titulo: 'Sugerencia de solo chequeo',
          mensaje: `${contexto.tecnicoNombre} sugiere cerrar ${contexto.ordenNumero || ordenId} (${contexto.clienteNombre}) como solo chequeo. Revisa y aprueba o rechaza.`,
          ordenId,
          ordenNumero: contexto.ordenNumero,
        }),
      ),
    );
  } catch (err) {
    console.warn('No se pudieron crear todas las notificaciones de sugerencia:', err);
  }
}

/**
 * Resuelve una sugerencia de "solo chequeo" desde la vista de oficina.
 * - Aprobar: marca la sugerencia como `aprobada` y setea
 *   `soloChequeo: true`, `precioFinal: montoChequeo`,
 *   `estadoAprobacion: 'aprobado'`. Esto desbloquea el cierre del técnico.
 * - Rechazar: marca la sugerencia como `rechazada` con `notaResolucion`,
 *   sin tocar los campos operativos. La orden vuelve al flujo normal.
 *
 * Implementación: lee la orden, encuentra la sugerencia por `id`, la
 * reescribe con el estado nuevo y persiste el array completo. Usamos
 * transacción para evitar race condition con un técnico que podría estar
 * agregando otra sugerencia al mismo tiempo.
 */
export async function resolverSugerenciaSoloChequeo(
  ordenId: string,
  sugerenciaId: string,
  resolucion: 'aprobada' | 'rechazada',
  resoluciónData: {
    resueltaPor: string;
    resueltaPorNombre: string;
    notaResolucion?: string;
  },
): Promise<void> {
  const ordenRef = doc(db, 'ordenes_servicio', ordenId);
  const ahora = Timestamp.now();

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ordenRef);
    if (!snap.exists()) throw new Error('Orden no existe');
    const data = snap.data() as Record<string, unknown>;
    const lista = Array.isArray(data.sugerenciasSoloChequeo)
      ? (data.sugerenciasSoloChequeo as Array<Record<string, unknown>>)
      : [];
    const idx = lista.findIndex(s => s.id === sugerenciaId);
    if (idx === -1) throw new Error('Sugerencia no encontrada');
    const sugerencia = { ...lista[idx] };
    if (sugerencia.estado !== 'pendiente') {
      // Idempotencia: si ya fue resuelta, no la re-resolvemos
      throw new Error('Esta sugerencia ya fue resuelta');
    }
    sugerencia.estado = resolucion;
    sugerencia.resueltaPor = resoluciónData.resueltaPor;
    sugerencia.resueltaPorNombre = resoluciónData.resueltaPorNombre;
    sugerencia.resueltaEn = ahora;
    if (resoluciónData.notaResolucion && resoluciónData.notaResolucion.trim().length > 0) {
      sugerencia.notaResolucion = resoluciónData.notaResolucion.trim();
    }
    const nuevaLista = [...lista];
    nuevaLista[idx] = sugerencia;

    const auditoriaPrev = Array.isArray(data.auditoria) ? data.auditoria : [];
    const detalleAuditoria = resolucion === 'aprobada'
      ? `Aprobó solo chequeo (RD$${(sugerencia.montoChequeo as number).toLocaleString('es-DO')}) — ${sugerencia.motivo}`
      : `Rechazó sugerencia de solo chequeo${resoluciónData.notaResolucion ? ` — ${resoluciónData.notaResolucion}` : ''}`;
    const registroAuditoria = crearRegistroAuditoria(
      resoluciónData.resueltaPorNombre,
      'marcar_chequeo',
      detalleAuditoria,
      'sugerenciaSoloChequeo.estado',
      'pendiente',
      resolucion,
    );

    const updates: Record<string, unknown> = {
      sugerenciasSoloChequeo: nuevaLista,
      auditoria: [...auditoriaPrev, registroAuditoria],
      updatedAt: ahora,
    };

    if (resolucion === 'aprobada') {
      // Oficina aprueba → desbloquea el cierre del técnico seteando
      // soloChequeo + precioFinal + estadoAprobacion. El técnico solo
      // podrá cerrar después de esto (rule R4 chequea ordenAprobada()).
      updates.soloChequeo = true;
      updates.precioFinal = sugerencia.montoChequeo;
      updates.precioChequeo = sugerencia.montoChequeo;
      updates.tipoCierre = 'solo_chequeo';
      updates.motivoChequeo = sugerencia.motivo;
      updates.estadoAprobacion = 'aprobado';
      updates.aprobadoPor = resoluciónData.resueltaPorNombre;
      updates.fechaAprobacion = ahora;
    }

    tx.update(ordenRef, updates);
  });

  // Notificar al técnico que originó la sugerencia
  try {
    const snap = await getDocs(
      query(collection(db, 'ordenes_servicio'), where('__name__', '==', ordenId)),
    );
    // Releer la orden para obtener el técnico — no hace falta, ya tenemos
    // el sugeridaPor adentro de la sugerencia al inicio. Mejor: pasamos
    // la sugerencia ya enriquecida al notif vía retry-read. Pero como el
    // que llama (UI admin) ya tiene la orden cargada, el patrón real es:
    // notif se envía con el destinatarioId desde el caller. Diferimos:
    // este helper hace el write y el caller hace el notif.
    void snap; // no-op, evita warning de no-usado
  } catch (err) {
    console.warn('No se pudo verificar técnico para notificación:', err);
  }
}

/**
 * Wrapper: resuelve la sugerencia y notifica al técnico que originó.
 * Pensado para llamarse desde `/admin/sugerencias-chequeo`. Recibe la
 * orden ya cargada (con la sugerencia objetivo) para enviar la notif sin
 * re-leer Firestore.
 */
export async function resolverSugerenciaSoloChequeoConNotif(
  orden: OrdenServicio,
  sugerencia: SugerenciaSoloChequeo,
  resolucion: 'aprobada' | 'rechazada',
  resoluciónData: {
    resueltaPor: string;
    resueltaPorNombre: string;
    notaResolucion?: string;
  },
): Promise<void> {
  await resolverSugerenciaSoloChequeo(orden.id, sugerencia.id, resolucion, resoluciónData);

  if (sugerencia.sugeridaPor) {
    try {
      const titulo = resolucion === 'aprobada'
        ? 'Solo chequeo aprobado'
        : 'Solo chequeo rechazado';
      const mensaje = resolucion === 'aprobada'
        ? `Tu sugerencia de solo chequeo en ${orden.numero || orden.id} fue aprobada. Podés cerrar la orden ahora.`
        : `Tu sugerencia de solo chequeo en ${orden.numero || orden.id} fue rechazada${resoluciónData.notaResolucion ? `: "${resoluciónData.notaResolucion}"` : ''}. Volvé al flujo normal de aprobación de precio.`;
      await crearNotificacion({
        userId: sugerencia.sugeridaPor,
        destinatarioNombre: sugerencia.sugeridaPorNombre,
        tipo: 'sugerencia_solo_chequeo_resuelta',
        titulo,
        mensaje,
        ordenId: orden.id,
        ordenNumero: orden.numero,
      });
    } catch (err) {
      console.warn('No se pudo notificar al técnico:', err);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────
// Reprogramaciones — flujo cliente → admin/coord (Hito 2 Portal Cliente)
// ─────────────────────────────────────────────────────────────────────

/**
 * Acción que admin/coord aplica a una propuesta de reprogramación pendiente.
 *  - 'aprobar': acepta la fecha del cliente, mueve `fechaCita` a la nueva
 *    fecha y marca la propuesta como `aceptada`.
 *  - 'rechazar': rechaza la propuesta. NO toca `fechaCita`. Requiere nota.
 *  - 'contraproponer': marca la propuesta del cliente como `contrapropuesta`
 *    y crea una nueva propuesta con `propuestaPor: 'admin'` en estado
 *    pendiente. NO toca `fechaCita` (el admin no aplica unilateralmente —
 *    espera que el cliente confirme por WhatsApp o desde el portal).
 */
export type AccionReprogramacion = 'aprobar' | 'rechazar' | 'contraproponer';

export interface ResolverPropuestaArgs {
  resueltaPor: string;
  resueltaPorNombre: string;
  /** Nota libre (admin la usa para WhatsApp). Obligatoria al rechazar. */
  notaResolucion?: string;
  /** Solo cuando `accion === 'contraproponer'`. Date en zona local. */
  contrapropuestaFecha?: Date;
}

/**
 * Convierte un Date a Timestamp Firestore con strip-undefined defensivo.
 * Si recibe un Timestamp ya hidratado lo devuelve tal cual.
 */
function toTimestamp(value: Date | Timestamp): Timestamp {
  return value instanceof Timestamp ? value : Timestamp.fromDate(value);
}

/**
 * Resuelve una propuesta de reprogramación dentro de una orden.
 *
 * Implementación: lee la orden, encuentra la propuesta por `id`, la
 * reescribe con el estado nuevo y persiste el array completo (NO usamos
 * arrayUnion porque modificamos una entry existente — arrayUnion sólo
 * agrega). Usamos transacción para evitar race con un cliente que podría
 * estar agregando otra propuesta al mismo tiempo.
 *
 * Idempotente: si la propuesta ya está resuelta, lanza un error claro
 * `'Esta propuesta ya fue resuelta'`. El caller debe manejarlo.
 */
export async function resolverPropuestaReprogramacion(
  ordenId: string,
  propuestaId: string,
  accion: AccionReprogramacion,
  data: ResolverPropuestaArgs,
): Promise<void> {
  const ordenRef = doc(db, 'ordenes_servicio', ordenId);
  const ahora = Timestamp.now();

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ordenRef);
    if (!snap.exists()) throw new Error('Orden no existe');
    const orden = snap.data() as Record<string, unknown>;

    const lista = Array.isArray(orden.propuestasReprogramacion)
      ? (orden.propuestasReprogramacion as Array<Record<string, unknown>>)
      : [];
    const idx = lista.findIndex(p => p.id === propuestaId);
    if (idx === -1) throw new Error('Propuesta no encontrada');
    const propuesta = { ...lista[idx] };
    if (propuesta.estado !== 'pendiente') {
      throw new Error('Esta propuesta ya fue resuelta');
    }

    // Comunes: trazabilidad
    propuesta.resueltaPor = data.resueltaPor;
    propuesta.resueltaPorNombre = data.resueltaPorNombre;
    propuesta.resueltaEn = ahora;
    if (data.notaResolucion && data.notaResolucion.trim().length > 0) {
      propuesta.notaResolucion = data.notaResolucion.trim();
    }

    const nuevaLista = [...lista];

    const auditoriaPrev = Array.isArray(orden.auditoria) ? orden.auditoria : [];
    const updates: Record<string, unknown> = {
      updatedAt: ahora,
    };

    if (accion === 'aprobar') {
      propuesta.estado = 'aceptada';
      nuevaLista[idx] = propuesta;

      // Aplicar la nueva fecha a la orden. NO tocamos `historialFases`:
      // ese array refleja transiciones de fase reales, y reprogramar NO
      // cambia la fase (la orden sigue en `agendado` o donde estuviera).
      // Si pusiéramos otra entry `agendado` con timestamp posterior a una
      // entry intermedia (ej `en_diagnostico`), el historial del cliente
      // quedaría cronológicamente raro. La traza queda en `auditoria`
      // con detalle textual de la reprogramación.
      const fechaNuevaTs = propuesta.fechaNuevaPropuesta as Timestamp | Date | undefined;
      const fechaActualOrdenSnap = propuesta.fechaActualOrden as Timestamp | Date | null | undefined;
      if (fechaNuevaTs) {
        updates.fechaCita = toTimestamp(fechaNuevaTs);
      }

      // Construir detalle más informativo (de → a) cuando tenemos las dos fechas
      const fechaAntesDate =
        fechaActualOrdenSnap instanceof Timestamp
          ? fechaActualOrdenSnap.toDate()
          : fechaActualOrdenSnap instanceof Date
            ? fechaActualOrdenSnap
            : null;
      const fechaNuevaDate =
        fechaNuevaTs instanceof Timestamp
          ? fechaNuevaTs.toDate()
          : fechaNuevaTs instanceof Date
            ? fechaNuevaTs
            : null;
      const detalle = fechaAntesDate && fechaNuevaDate
        ? `Reprogramada de ${fechaAntesDate.toISOString()} a ${fechaNuevaDate.toISOString()} (propuesta del cliente aprobada)`
        : 'Aprobó propuesta de reprogramación del cliente';
      updates.auditoria = [
        ...auditoriaPrev,
        crearRegistroAuditoria(
          data.resueltaPorNombre,
          'editar',
          detalle,
          'fechaCita',
          undefined,
          undefined,
        ),
      ];
    } else if (accion === 'rechazar') {
      if (!data.notaResolucion || data.notaResolucion.trim().length < 10) {
        throw new Error('La nota de rechazo es obligatoria (mínimo 10 caracteres)');
      }
      propuesta.estado = 'rechazada';
      nuevaLista[idx] = propuesta;

      const detalle = `Rechazó propuesta de reprogramación: ${data.notaResolucion.trim()}`;
      updates.auditoria = [
        ...auditoriaPrev,
        crearRegistroAuditoria(
          data.resueltaPorNombre,
          'editar',
          detalle,
        ),
      ];
    } else if (accion === 'contraproponer') {
      if (!data.contrapropuestaFecha) {
        throw new Error('Falta la fecha de contrapropuesta');
      }
      propuesta.estado = 'contrapropuesta';
      propuesta.contrapropuestaFecha = Timestamp.fromDate(data.contrapropuestaFecha);
      nuevaLista[idx] = propuesta;

      // Crear nueva propuesta del admin como pendiente. El cliente la verá
      // y deberá confirmarla (o el admin la marca aceptada vía WhatsApp manual).
      const fechaActualOrdenSnapshot = orden.fechaCita ?? null;
      const nuevaPropAdmin: Record<string, unknown> = {
        id:
          typeof globalThis.crypto?.randomUUID === 'function'
            ? globalThis.crypto.randomUUID()
            : `prop_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
        propuestaPor: 'admin',
        fechaPropuesta: ahora,
        fechaActualOrden: fechaActualOrdenSnapshot,
        fechaNuevaPropuesta: Timestamp.fromDate(data.contrapropuestaFecha),
        motivo: data.notaResolucion?.trim() || '',
        estado: 'pendiente',
      };
      const nuevaPropLimpia = Object.fromEntries(
        Object.entries(nuevaPropAdmin).filter(([, v]) => v !== undefined),
      );
      nuevaLista.push(nuevaPropLimpia);

      const detalle = `Contrapropuso fecha alternativa al cliente`;
      updates.auditoria = [
        ...auditoriaPrev,
        crearRegistroAuditoria(
          data.resueltaPorNombre,
          'editar',
          detalle,
        ),
      ];
    }

    updates.propuestasReprogramacion = nuevaLista;
    tx.update(ordenRef, updates);
  });
}

/**
 * Wrapper: resuelve la propuesta y crea una notificación interna de
 * auditoría al admin que la resolvió. La notificación al cliente NO se
 * crea como doc Firestore (el cliente no tiene cuenta) — se envía por
 * WhatsApp manual desde la UI del panel admin.
 *
 * Recibe la orden ya cargada para enriquecer la notif sin re-leer Firestore.
 */
export async function resolverPropuestaReprogramacionConNotif(
  orden: OrdenServicio,
  propuesta: PropuestaReprogramacion,
  accion: AccionReprogramacion,
  data: ResolverPropuestaArgs,
): Promise<void> {
  await resolverPropuestaReprogramacion(orden.id, propuesta.id, accion, data);

  // Notif interna al admin/coord que resolvió (auditoría — feed personal).
  // No bloqueamos si falla.
  try {
    const tituloMap: Record<AccionReprogramacion, string> = {
      aprobar: 'Reprogramación aprobada',
      rechazar: 'Reprogramación rechazada',
      contraproponer: 'Contrapropuesta enviada',
    };
    const mensajeMap: Record<AccionReprogramacion, string> = {
      aprobar: `Aprobaste la reprogramación de ${orden.numero || orden.id}.`,
      rechazar: `Rechazaste la reprogramación de ${orden.numero || orden.id}.`,
      contraproponer: `Enviaste contrapropuesta para ${orden.numero || orden.id}.`,
    };
    await crearNotificacion({
      userId: data.resueltaPor,
      destinatarioNombre: data.resueltaPorNombre,
      tipo: 'reprogramacion_resuelta',
      titulo: tituloMap[accion],
      mensaje: mensajeMap[accion],
      ordenId: orden.id,
      ordenNumero: orden.numero,
    });
  } catch (err) {
    console.warn('No se pudo crear notif de reprogramación resuelta:', err);
  }
}

/**
 * Subscribe a todas las órdenes y filtra client-side las que tienen al menos
 * una propuesta de reprogramación con `estado: 'pendiente'`. Mismo patrón
 * que `SugerenciasChequeo` — evita índice compuesto sobre arrays.
 *
 * Pensado para usarse desde el panel admin `/admin/reprogramaciones` y
 * desde el sidebar (badge live count).
 *
 * Devuelve una función para des-suscribir.
 */
export function suscribirOrdenesConPropuestaReprogramacionPendiente(
  callback: (ordenes: OrdenServicio[]) => void,
): () => void {
  return onSnapshot(collection(db, 'ordenes_servicio'), (snap) => {
    const ordenes: OrdenServicio[] = [];
    for (const d of snap.docs) {
      const data = d.data();
      if (data.eliminada) continue;
      const lista = data.propuestasReprogramacion;
      if (!Array.isArray(lista)) continue;
      // Solo traer órdenes con propuesta del CLIENTE pendiente — las
      // contrapropuestas del admin no aparecen en el panel.
      if (
        !lista.some(
          (p: Record<string, unknown>) =>
            p && p.estado === 'pendiente' && p.propuestaPor === 'cliente',
        )
      ) {
        continue;
      }
      ordenes.push(parseOrden(d.id, data));
    }
    callback(ordenes);
  });
}

// ─────────────────────────────────────────────────────────────────────
// SPRINT-178 — Búsqueda de chequeo previo vigente para descuento
// ─────────────────────────────────────────────────────────────────────

/**
 * Busca el chequeo previo (`tipoCierre: 'solo_chequeo'`) MÁS RECIENTE de un
 * cliente para un `equipoTipo` específico. Aplica regla SPRINT-178:
 *  - Match: `clienteId + equipoTipo` (sin equipoModelo — decisión Jorge,
 *    matching permisivo "cualquier aire del mismo cliente cuenta").
 *  - Vigencia: 30 días desde la fecha de cierre del chequeo (constante
 *    `VIGENCIA_CHEQUEO_DIAS` en `utils/descuentoChequeo.ts`).
 *  - Edge case 2+ chequeos vigentes: aplica el MÁS RECIENTE (sort
 *    client-side por fecha resuelta DESC).
 *  - Excluye chequeos ya reactivados (`reactivadaPostChequeo: true`) — esos
 *    ya cambiaron a `tipoCierre: 'reparacion_completa'` y no son "chequeos
 *    cerrados disponibles para descuento".
 *
 * IMPORTANTE: si `vigente === false` (o sea, hay un chequeo pero está
 * vencido), igual lo retorna con `vigente: false`. El caller decide si
 * mostrarlo informativamente o permitir override manual (admin/coord).
 *
 * SPRINT-187 Bug B (causa raíz):
 *   La versión SPRINT-178 usaba `orderBy('fechaCierre', 'desc')` sobre el
 *   campo RAÍZ. Pero NINGÚN path del código persistía `fechaCierre` a nivel
 *   raíz del doc:
 *     - `CierreServicioWizard.tsx:374-376` guarda `fechaCierre` DENTRO de
 *       `cierreServicio` (anidado).
 *     - `AgendaDia.tsx::handleCerrarChequeo` (línea 175-191) NO escribía
 *       `fechaCierre` en absoluto (sólo `updatedAt`).
 *   Resultado: Firestore EXCLUYE en el orderBy todos los docs que no
 *   tienen el campo del orden → `snap.empty === true` → helper retornaba
 *   null → banner descuento nunca aparecía. Detectado por QA visual
 *   sidepanel 2026-05-18 (OS-0058 cerrada vía AgendaDia 14-may).
 *
 * Fix: query sin `orderBy` ni `limit(5)` — traemos hasta 20 chequeos del
 * cliente+equipo (cuota razonable) y ordenamos client-side por la fecha
 * resuelta (preferimos `cierreServicio.fechaCierre`, fallback `fechaCierre`
 * raíz, último fallback `updatedAt` para chequeos legacy que no tenían
 * fecha persistida explícita). Forward fix: `AgendaDia.tsx` y el wizard
 * ahora persisten `fechaCierre` raíz para chequeos nuevos — el helper
 * los encontrará por cualquiera de los 3 caminos.
 *
 * El índice compuesto en `firestore.indexes.json` queda dormido (no se
 * borra para no perder el deploy ya hecho; refactoring de índices es un
 * sprint propio).
 *
 * Retorna `null` si:
 *  - El cliente nunca tuvo un chequeo del mismo equipo.
 *  - Ninguno de los docs encontrados tiene fecha + monto válidos.
 *
 * @param clienteId id del cliente (NO clienteTelefono — el match es por id).
 * @param equipoTipo string del catálogo de tipos (ej: 'Aire Acondicionado',
 *   'Lavadora'). Match case-sensitive — el catálogo guarda el valor canónico.
 */
export async function buscarChequeoVigentePorCliente(
  clienteId: string,
  equipoTipo: string,
): Promise<ChequeoVigenteInfo | null> {
  if (!clienteId || !equipoTipo) return null;

  try {
    const q = query(
      collection(db, 'ordenes_servicio'),
      where('clienteId', '==', clienteId),
      where('equipoTipo', '==', equipoTipo),
      where('tipoCierre', '==', 'solo_chequeo'),
      limit(20), // Tope razonable; un cliente realista no tiene 20 chequeos del mismo equipo.
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;

    // Resolver fecha de cada doc + filtrar inválidos + sortear DESC client-side.
    // Cubre los 3 caminos de persistencia:
    //   1) `cierreServicio.fechaCierre` — wizard (CierreServicioWizard.tsx).
    //   2) `fechaCierre` raíz — chequeos nuevos post-SPRINT-187.
    //   3) `updatedAt` — fallback legacy para chequeos pre-SPRINT-187 cerrados
    //      vía oficina (`AgendaDia.tsx::handleCerrarChequeo` antes de
    //      SPRINT-187 no escribía fechaCierre en absoluto).
    type Candidato = {
      docId: string;
      data: Record<string, unknown>;
      fechaCierre: Date;
    };
    const candidatos: Candidato[] = [];
    for (const d of snap.docs) {
      const data = d.data() as Record<string, unknown>;
      if (data.reactivadaPostChequeo === true) continue;
      if (data.eliminada === true) continue;

      const cierreServ = data.cierreServicio as Record<string, unknown> | undefined;
      const fechaRaw =
        cierreServ?.fechaCierre ??
        data.fechaCierre ??
        data.updatedAt ??
        null;
      if (!fechaRaw) continue;
      const fechaCierre: Date | null =
        fechaRaw instanceof Timestamp
          ? fechaRaw.toDate()
          : fechaRaw instanceof Date
            ? fechaRaw
            : null;
      if (!fechaCierre || isNaN(fechaCierre.getTime())) continue;

      const monto = Number(
        data.precioChequeo ||
        data.precioFinal ||
        data.precioAprobado ||
        0,
      );
      if (monto <= 0) continue;

      candidatos.push({ docId: d.id, data, fechaCierre });
    }

    if (candidatos.length === 0) return null;

    // Sort DESC por fecha resuelta — el más reciente queda primero.
    candidatos.sort((a, b) => b.fechaCierre.getTime() - a.fechaCierre.getTime());
    const ganador = candidatos[0];
    const monto = Number(
      ganador.data.precioChequeo ||
      ganador.data.precioFinal ||
      ganador.data.precioAprobado ||
      0,
    );
    const dias = diasRestantesVigencia(ganador.fechaCierre);
    return {
      ordenId: ganador.docId,
      ordenNumero: typeof ganador.data.numero === 'string' ? ganador.data.numero : ganador.docId,
      fechaCierre: ganador.fechaCierre,
      montoChequeo: monto,
      vigente: dias > 0,
      diasRestantes: dias,
    };
  } catch (err) {
    // Log warn + null para no bloquear el flujo de aprobación de precio.
    console.warn('[buscarChequeoVigentePorCliente] error buscando chequeo previo:', err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────
// SPRINT-177 (2026-05-18) — "Avisar a oficina" desde vista técnico
// ─────────────────────────────────────────────────────────────────────

/**
 * El técnico llega al sitio pero la visita no se concreta (cliente no abre,
 * pidió otra fecha, dirección incorrecta). Marca `visitaFallida` en la
 * orden, persiste un audit log y notifica a operarias/coordinadoras/admins
 * activos para que gestionen (reagendar / llamar / cancelar).
 *
 * IMPORTANTE: la fase de la orden NO cambia (sigue en `agendado`). Esto
 * permite reagendar sin retroceder en el pipeline. Cuando se reagenda
 * exitosamente, el caller debe llamar `limpiarVisitaFallida(ordenId)` para
 * borrar el banner (la orden vuelve a su estado normal).
 *
 * IMPORTANTE: `tecnicoUid` DEBE ser `currentUser.uid` (Firebase Auth) — la
 * rule de `ordenes_servicio` gatea el update por `tecnicoId == auth.uid`.
 * NO usar `userProfile.id` (puede ser `personalDocId` vía fallback, ver
 * gotcha CLAUDE.md "userProfile.id NO siempre es auth.uid"). P-001 cazador.
 *
 * Patrón canónico (mismo que `crearSugerenciaSoloChequeo` arriba):
 *  - tx covers orden + audit log atómicamente.
 *  - fan-out de notificaciones FUERA del tx (best-effort, no bloquea).
 *  - lookup de destinatarios filtra por `p.uid` truthy (P-006 — excluye
 *    empleados sin Auth, ej: alta vieja sin onboarding completo).
 */
export async function marcarVisitaFallida(
  ordenId: string,
  params: { detalleCliente: string; tecnicoUid: string; tecnicoNombre: string },
): Promise<void> {
  const { detalleCliente, tecnicoUid, tecnicoNombre } = params;
  if (!ordenId || !detalleCliente || detalleCliente.length < 10) {
    throw new Error('marcarVisitaFallida: ordenId requerido y detalleCliente mínimo 10 chars');
  }
  if (!tecnicoUid) {
    throw new Error('marcarVisitaFallida: tecnicoUid (auth.uid) requerido');
  }

  const ordenRef = doc(db, 'ordenes_servicio', ordenId);
  let ordenNumero = '';
  let clienteNombre = '';
  let clienteTelefono = '';

  // Tx: actualizar orden + crear audit log atómicamente. Si una de las dos
  // mutaciones falla, ambas se rollback.
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ordenRef);
    if (!snap.exists()) throw new Error('orden-no-encontrada');
    const data = snap.data() as Record<string, unknown>;
    ordenNumero = typeof data.numero === 'string' ? data.numero : '';
    clienteNombre = typeof data.clienteNombre === 'string' ? data.clienteNombre : '';
    clienteTelefono = typeof data.clienteTelefono === 'string' ? data.clienteTelefono : '';

    tx.update(ordenRef, {
      visitaFallida: {
        detalleCliente,
        reportadoAt: serverTimestamp(),
        tecnicoUid,
        tecnicoNombre,
      },
      updatedAt: serverTimestamp(),
    });

    const auditRef = doc(collection(db, 'auditoria_admin'));
    // Shape canónico de audit alineado con campanasMarketing.service.ts:388
    // y recordatorios.service.ts: actorUid/actorNombre + tipoEntidad/entidadId
    // + meta para datos específicos de la acción. Habilita queries
    // cross-acción tipo "todo lo que hizo X uid" sin OR de campos.
    tx.set(auditRef, stripUndefined({
      accion: 'avisar_oficina',
      tipoEntidad: 'orden',
      entidadId: ordenId,
      actorUid: tecnicoUid,
      actorNombre: tecnicoNombre,
      meta: {
        ordenNumero: ordenNumero || null,
        detalleCliente,
      },
      timestamp: serverTimestamp(),
    }));
  });

  // Fan-out de notificaciones FUERA del tx (best-effort). Si Firestore
  // está caído o falla la query de operarias, la orden YA quedó marcada
  // como visita fallida — el operativo no se rompe.
  try {
    const operariasSnap = await getDocs(
      query(
        collection(db, 'personal'),
        where('activo', '==', true),
        where('rol', 'in', ['operaria', 'coordinadora', 'administrador']),
      ),
    );
    // P-006: filtrar `p.uid` truthy — empleados sin Auth doc no reciben
    // notifs (la rule las descarta por userId == auth.uid sin match).
    const destinatarios = operariasSnap.docs
      .map((d) => {
        const dd = d.data() as Record<string, unknown>;
        return {
          uid: typeof dd.uid === 'string' ? dd.uid : undefined,
          nombre: typeof dd.nombre === 'string' ? dd.nombre : '',
        };
      })
      .filter((p): p is { uid: string; nombre: string } => typeof p.uid === 'string' && p.uid.length > 0);

    if (destinatarios.length === 0) {
      // Sin destinatarios: ningún staff oficina activo con uid Auth válido.
      // La orden YA quedó marcada — el técnico ve "Aviso enviado" pero
      // operativamente nadie recibe la notif. Loggeamos para que el admin
      // detecte el gap (típicamente alta de empleado sin onboarding completo).
      console.warn(
        // @safe-numero-doc: interpola ordenNumero (parámetro pre-validado, viene del contador); es mensaje de log
        `[marcarVisitaFallida] 0 destinatarios para OS-${ordenNumero}: ` +
          'no hay staff oficina activo con uid Auth. Operaria debe revisar ' +
          'el listado de personal o el flujo de alta de empleado (P-004).',
      );
    }

    const recorte = detalleCliente.length > 100
      ? `${detalleCliente.substring(0, 100)}...`
      : detalleCliente;
    // `orden.numero` ya viene prefijado por el contador atómico
    // (contadores.service.ts:16). NO reprefijar — causaría "OS-OS-####".
    const tituloPrefijo = ordenNumero || ordenId;
    const titulo = `Visita fallida — ${tituloPrefijo}`;
    const clienteParte = clienteNombre || 'sin nombre';
    const telParte = clienteTelefono ? `, tel ${clienteTelefono}` : '';
    const mensaje =
      `${tecnicoNombre} reporta: "${recorte}". Cliente ${clienteParte}${telParte}. Llamar para coordinar.`;

    await Promise.all(
      destinatarios.map((d) =>
        crearNotificacion({
          userId: d.uid,
          destinatarioNombre: d.nombre,
          tipo: 'aviso_oficina',
          titulo,
          mensaje,
          ordenId,
          ordenNumero,
        }).catch((err) => {
          // Cada notif es independiente. Una falla NO aborta las demás.
          console.warn('[marcarVisitaFallida] notif fallback:', err);
        }),
      ),
    );
  } catch (err) {
    console.warn('[marcarVisitaFallida] fan-out notifs falló (orden ya actualizada):', err);
  }
}

/**
 * Limpia el banner `visitaFallida` de una orden. Se llama después de que
 * oficina coordina (reagenda, contacta al cliente, etc.) para indicar que
 * la situación ya fue resuelta. Es un update simple — la traza queda en
 * `auditoria_admin` con la entry `accion: 'avisar_oficina'` que creó el
 * marcado original.
 */
export async function limpiarVisitaFallida(ordenId: string): Promise<void> {
  if (!ordenId) throw new Error('limpiarVisitaFallida: ordenId requerido');
  await updateDoc(doc(db, 'ordenes_servicio', ordenId), {
    visitaFallida: deleteField(),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Busca órdenes activas (fase != cerrado/cancelado) por teléfono del
 * cliente. SPRINT-INBOX-5 (2026-05-20).
 *
 * Estrategia:
 *   - Query `ordenes_servicio where clienteTelefono == <telNorm>`.
 *   - Filter client-side por fase != ('cerrado', 'cancelado') y `eliminada
 *     != true`. Evita índice compuesto (single where + filter).
 *
 * IMPORTANTE: `clienteTelefono` puede estar guardado en formato distinto
 * según el path de creación (raw vs normalizado). Hacemos query con
 * la versión normalizada Y con la raw recibida, mergeando resultados.
 * Si no hay match exacto, retornamos array vacío.
 *
 * @param telefonoRaw teléfono en cualquier formato (será normalizado).
 * @returns lista de órdenes activas ordenadas por fechaCreacion desc.
 */
export async function obtenerOrdenesActivasPorTelefono(
  telefonoRaw: string,
): Promise<OrdenServicio[]> {
  if (!telefonoRaw || telefonoRaw.length < 7) return [];
  // Normalización RD: 10 dígitos al final.
  const soloDigitos = telefonoRaw.replace(/\D/g, '');
  const telNorm = soloDigitos.length >= 10 ? soloDigitos.slice(-10) : soloDigitos;
  if (telNorm.length < 7) return [];

  const fasesTerminales = new Set<string>(['cerrado', 'cancelado']);
  const docsMap = new Map<string, OrdenServicio>();

  // Búsqueda por teléfono normalizado.
  const q1 = query(
    collection(db, 'ordenes_servicio'),
    where('clienteTelefono', '==', telNorm),
  );
  const snap1 = await getDocs(q1);
  snap1.docs.forEach((d) => {
    const data = d.data();
    if (data.eliminada === true) return;
    if (fasesTerminales.has(data.fase as string)) return;
    docsMap.set(d.id, parseOrden(d.id, data));
  });

  // Si llegan formatos distintos (ej: cliente guardado con guiones),
  // probamos también un match exacto del raw.
  if (telefonoRaw !== telNorm) {
    const q2 = query(
      collection(db, 'ordenes_servicio'),
      where('clienteTelefono', '==', telefonoRaw),
    );
    const snap2 = await getDocs(q2);
    snap2.docs.forEach((d) => {
      if (docsMap.has(d.id)) return;
      const data = d.data();
      if (data.eliminada === true) return;
      if (fasesTerminales.has(data.fase as string)) return;
      docsMap.set(d.id, parseOrden(d.id, data));
    });
  }

  // Sort client-side: createdAt desc (fallback updatedAt).
  const ordenes = Array.from(docsMap.values());
  ordenes.sort((a, b) => {
    const aTime = a.createdAt ?? a.updatedAt;
    const bTime = b.createdAt ?? b.updatedAt;
    const ta = aTime instanceof Date ? aTime.getTime() : 0;
    const tb = bTime instanceof Date ? bTime.getTime() : 0;
    return tb - ta;
  });
  return ordenes;
}

/**
 * SPRINT-INBOX-10-CLIENTE-360 (2026-05-22).
 *
 * Variante de `obtenerOrdenesActivasPorTelefono` que devuelve TODAS las
 * órdenes del cliente (incluidas cerradas/canceladas) ordenadas por
 * `createdAt` descendente (más recientes primero). Pensado para el panel
 * cliente 360 del inbox que muestra el histórico completo del cliente,
 * no sólo las activas en curso.
 *
 * Misma lógica de búsqueda dual (telefonoNormalizado RD 10 dígitos + raw)
 * para tolerar formatos heredados con guiones / paréntesis. Sin `orderBy`
 * en la query Firestore (cazador P-015): sort 100% client-side con
 * cascada de fallbacks (createdAt → updatedAt → 0). Filtra
 * `eliminada === true` defensivamente.
 *
 * Nota: este helper NO filtra por fase terminal. El consumidor decide
 * cómo agrupar/etiquetar activas vs cerradas.
 */
export async function obtenerTodasOrdenesPorTelefono(
  telefonoRaw: string,
): Promise<OrdenServicio[]> {
  if (!telefonoRaw || telefonoRaw.length < 7) return [];
  const soloDigitos = telefonoRaw.replace(/\D/g, '');
  const telNorm = soloDigitos.length >= 10 ? soloDigitos.slice(-10) : soloDigitos;
  if (telNorm.length < 7) return [];

  const docsMap = new Map<string, OrdenServicio>();

  const q1 = query(
    collection(db, 'ordenes_servicio'),
    where('clienteTelefono', '==', telNorm),
  );
  const snap1 = await getDocs(q1);
  snap1.docs.forEach((d) => {
    const data = d.data();
    if (data.eliminada === true) return;
    docsMap.set(d.id, parseOrden(d.id, data));
  });

  if (telefonoRaw !== telNorm) {
    const q2 = query(
      collection(db, 'ordenes_servicio'),
      where('clienteTelefono', '==', telefonoRaw),
    );
    const snap2 = await getDocs(q2);
    snap2.docs.forEach((d) => {
      if (docsMap.has(d.id)) return;
      const data = d.data();
      if (data.eliminada === true) return;
      docsMap.set(d.id, parseOrden(d.id, data));
    });
  }

  const ordenes = Array.from(docsMap.values());
  ordenes.sort((a, b) => {
    const aTime = a.createdAt ?? a.updatedAt;
    const bTime = b.createdAt ?? b.updatedAt;
    const ta = aTime instanceof Date ? aTime.getTime() : 0;
    const tb = bTime instanceof Date ? bTime.getTime() : 0;
    return tb - ta;
  });
  return ordenes;
}

/**
 * Resultado del helper `confirmarPagoOrden`.
 *
 * - `ok=true` → el pago se confirmó OK (o ya estaba confirmado y la operación
 *   fue idempotente sin escribir).
 * - `ok=false, razon='orden_no_existe'` → orden borrada/inválida.
 * - `ok=false, razon='pago_no_existe'` → el pago no está en el array (race
 *   con borrado/edición).
 * - `ok=false, razon='ya_confirmado'` → idempotencia: el pago ya estaba
 *   `verificado=true`. No se reescribe ni se duplica audit log.
 * - `ok=false, razon='error_interno'` → throw inesperado.
 */
export interface ConfirmarPagoResult {
  ok: boolean;
  razon?: 'orden_no_existe' | 'pago_no_existe' | 'ya_confirmado' | 'error_interno';
}

/**
 * SPRINT-PAGOS-CONFIRMA-MARIA-FASE-B-1 (2026-05-21).
 *
 * Confirma un pago previamente registrado por la operaria. La separación de
 * funciones de fase A bloquea el conduce hasta que un usuario con permiso
 * `pagosVerificar` (típicamente María / coord / admin) confirme cada pago.
 * Esta helper centraliza la confirmación con tres garantías:
 *
 * 1. **Atomicidad cross-collection (P-003).** El update a `ordenes_servicio`
 *    + el audit log a `auditoria_admin` van en el mismo `runTransaction`.
 *    Si la red corta entre ambas, ninguna queda persistida.
 *
 * 2. **Idempotencia (patrón establecido en `marcarClienteEnviado` `a38eb89`).**
 *    La verificación `pago.verificado === true` va DENTRO del callback,
 *    DESPUÉS del `tx.get()`. Re-confirmar un pago ya confirmado retorna
 *    `{ok:false, razon:'ya_confirmado'}` sin escribir nada → 0 escrituras
 *    duplicadas, 0 audit logs dobles.
 *
 * 3. **Defense-in-depth client-side (gap de fase B).** Hasta que B.3 deploye
 *    la rule de subcolección, la rule actual de `ordenes_servicio` permite a
 *    cualquier staff escribir cualquier campo. Esta función es el único path
 *    sancionado para confirmar — la página `/admin/pagos-pendientes` la
 *    consume con `useApp().currentUser.uid` (P-001).
 *
 * El array `pagos` se reescribe completo en lugar de usar `arrayUnion`/`arrayRemove`
 * porque necesitamos mutar un elemento existente (no agregar uno nuevo). Strip
 * de undefined inline para evitar el clásico "Function setDoc() called with
 * invalid data" (sub-regla CLAUDE.md).
 *
 * @param ordenId — ID del doc en `ordenes_servicio`.
 * @param pagoId — `pagos[i].id` a confirmar.
 * @param confirmadoPor — `{id: currentUser.uid, nombre: userProfile.nombre}`.
 *   IMPORTANTE: el `id` debe ser `currentUser.uid`, NO `userProfile.id`
 *   (gotcha P-001). El caller es responsable.
 */
export async function confirmarPagoOrden(
  ordenId: string,
  pagoId: string,
  confirmadoPor: { id: string; nombre: string },
): Promise<ConfirmarPagoResult> {
  const ordenRef = doc(db, 'ordenes_servicio', ordenId);
  const auditoriaRef = doc(collection(db, 'auditoria_admin'));

  try {
    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(ordenRef);
      if (!snap.exists()) return { ok: false, razon: 'orden_no_existe' as const };
      const data = snap.data() as Record<string, unknown>;

      const pagosActuales = Array.isArray(data.pagos)
        ? (data.pagos as Array<Record<string, unknown>>)
        : [];
      const idx = pagosActuales.findIndex((p) => p.id === pagoId);
      if (idx === -1) return { ok: false, razon: 'pago_no_existe' as const };

      const pagoActual = pagosActuales[idx];
      // Idempotencia: si ya está verificado, no doble-escribir ni duplicar
      // audit log. Retorna ok=false con razón clara para que la UI muestre
      // "ya estaba confirmado" sin lanzar error rojo.
      if (pagoActual.verificado === true) {
        return { ok: false, razon: 'ya_confirmado' as const };
      }

      const ahora = Timestamp.now();
      const pagoActualizado: Record<string, unknown> = {
        ...pagoActual,
        verificado: true,
        verificadoPorId: confirmadoPor.id,
        verificadoPorNombre: confirmadoPor.nombre,
        verificadoAt: ahora,
      };
      const nuevosPagos = pagosActuales.slice();
      nuevosPagos[idx] = pagoActualizado;

      const ordenUpdate: Record<string, unknown> = {
        pagos: nuevosPagos,
        updatedAt: serverTimestamp(),
      };
      tx.update(ordenRef, stripUndefined(ordenUpdate));

      // Audit log dentro de la misma transacción (P-003).
      const auditPayload: Record<string, unknown> = {
        accion: 'pago.confirmado',
        ordenId,
        pagoId,
        actorId: confirmadoPor.id,
        actorNombre: confirmadoPor.nombre,
        monto: typeof pagoActual.monto === 'number' ? pagoActual.monto : 0,
        metodo: pagoActual.metodo ?? null,
        ts: serverTimestamp(),
      };
      tx.set(auditoriaRef, stripUndefined(auditPayload));

      return { ok: true };
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[confirmarPagoOrden] error:', err);
    return { ok: false, razon: 'error_interno' as const };
  }
}

/**
 * SPRINT-PAGOS-CONFIRMA-MARIA-FASE-B-1 (2026-05-21).
 *
 * Suscripción real-time a órdenes con al menos un pago `verificado === false`.
 * Lee del array `orden.pagos` (modelo legacy de fase A — fase B.2 migrará a
 * subcolección).
 *
 * La query subscribe TODA la colección `ordenes_servicio` activa (no terminada).
 * Filtra client-side porque Firestore no soporta queries sobre campos dentro de
 * arrays en docs (`array-contains` no calza con la semántica que necesitamos:
 * "al menos un elemento con verificado=false"). El volumen esperado en
 * producción es bajo (órdenes activas <500) y la mayoría no tiene pagos.
 *
 * Sin `orderBy` para evitar P-015 (campos no garantizados). El ordering
 * cliente-side por `updatedAt` desc es suficiente.
 *
 * @param callback — recibe pairs `[ordenId, pagoPendiente]` planos para la UI.
 */
export function suscribirPagosPendientes(
  callback: (
    items: Array<{
      ordenId: string;
      orden: OrdenServicio;
      pago: NonNullable<OrdenServicio['pagos']>[number];
    }>,
  ) => void,
): () => void {
  // No usar where() sobre `fase != 'cerrado'` porque Firestore no soporta `!=`
  // sin índice + restringe a 1 inequality filter. Filtramos client-side.
  const q = collection(db, 'ordenes_servicio');
  const unsub = onSnapshot(q, (snap) => {
    const items: Array<{
      ordenId: string;
      orden: OrdenServicio;
      pago: NonNullable<OrdenServicio['pagos']>[number];
    }> = [];

    snap.docs.forEach((d) => {
      const data = d.data() as Record<string, unknown>;
      if (data.eliminada === true) return;
      const pagos = Array.isArray(data.pagos)
        ? (data.pagos as Array<Record<string, unknown>>)
        : [];
      if (pagos.length === 0) return;

      const pagosPendientes = pagos.filter((p) => p?.verificado === false);
      if (pagosPendientes.length === 0) return;

      const orden = parseOrden(d.id, data);
      pagosPendientes.forEach((p) => {
        // El parser ya retorna `pagos` tipados — buscamos por id para
        // recuperar la versión tipada (con Date en lugar de Timestamp).
        const pagoTipado = orden.pagos?.find((pp) => pp.id === p.id);
        if (!pagoTipado) return;
        items.push({ ordenId: d.id, orden, pago: pagoTipado });
      });
    });

    // Ordenar por fecha de pago desc (más reciente primero).
    items.sort((a, b) => {
      const ta = a.pago.fecha instanceof Date ? a.pago.fecha.getTime() : 0;
      const tb = b.pago.fecha instanceof Date ? b.pago.fecha.getTime() : 0;
      return tb - ta;
    });

    callback(items);
  });
  return unsub;
}
