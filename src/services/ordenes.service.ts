import { runTransaction, doc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { crearRegistroAuditoria } from '../utils';

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

      tx.update(ordenRef, updates);
      return { ok: true };
    });
  } catch (err) {
    console.error('Error reactivando orden post-chequeo:', err);
    return { ok: false, razon: 'error_interno' };
  }
}
