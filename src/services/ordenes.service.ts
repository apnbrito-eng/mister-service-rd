import {
  runTransaction, doc, serverTimestamp, Timestamp,
  updateDoc, arrayUnion, collection, query, where, getDocs,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { crearRegistroAuditoria, generarTokenPortalCliente } from '../utils';
import type { OrdenServicio, Personal, SugerenciaSoloChequeo } from '../types';
import { crearNotificacion } from './notificaciones.service';

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
          destinatarioId: p.uid!,
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
        destinatarioId: sugerencia.sugeridaPor,
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
