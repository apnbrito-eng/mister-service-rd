import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Banknote,
  Building2,
  CheckCircle,
  Loader2,
  Phone,
  Receipt,
  ShieldCheck,
  User,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useApp } from '../context/AppContext';
import { puede } from '../utils/permisos';
import { confirmarPagoOrden, suscribirPagosPendientes } from '../services/ordenes.service';
import { formatFecha, formatMoneda } from '../utils';
import LoadingSpinner from '../components/LoadingSpinner';
import type { OrdenServicio, PagoOrden } from '../types';

/**
 * SPRINT-PAGOS-CONFIRMA-MARIA-FASE-B-1 (2026-05-21).
 *
 * Página dedicada para que María (o cualquier usuario con `pagosVerificar`)
 * vea TODOS los pagos pendientes de confirmación across órdenes activas y
 * confirme cada uno con un clic. Hasta que confirme, el conduce NO se emite
 * (gate C3 de fase A en `ProcesarFacturacionModal`).
 *
 * Esta es la **Fase B.1** del plan aprobado por Jorge 2026-05-21 10:30. Lee
 * del array `orden.pagos` (modelo legacy). B.2 migrará a subcolección. B.3
 * deployará la rule estricta. Sin tocar `firestore.rules` en B.1 — la rule
 * actual de `ordenes_servicio` ya permite a staff escribir; este gate es
 * defense-in-depth client-side hasta B.3.
 *
 * Gate: si `puede(userProfile, 'pagosVerificar') === false`, la página muestra
 * "Sin acceso" en lugar del contenido. El item del sidebar tampoco aparece.
 */

interface PagoPendienteItem {
  ordenId: string;
  orden: OrdenServicio;
  pago: PagoOrden;
}

export default function PagosPendientes() {
  const { userProfile, currentUser } = useApp();
  const navigate = useNavigate();
  const [items, setItems] = useState<PagoPendienteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);

  const puedeVerificar = useMemo(() => puede(userProfile, 'pagosVerificar'), [userProfile]);

  useEffect(() => {
    if (!puedeVerificar) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = suscribirPagosPendientes((next) => {
      setItems(next);
      setLoading(false);
    });
    return () => unsub();
  }, [puedeVerificar]);

  async function handleConfirmar(item: PagoPendienteItem) {
    if (confirmandoId) return;
    // P-001: usar currentUser.uid, NO userProfile.id.
    const actorId = currentUser?.uid;
    const actorNombre = userProfile?.nombre || userProfile?.email || 'staff';
    if (!actorId) {
      toast.error('No se detectó sesión activa — recargá la página.');
      return;
    }
    const key = `${item.ordenId}:${item.pago.id}`;
    setConfirmandoId(key);
    try {
      const r = await confirmarPagoOrden(item.ordenId, item.pago.id, {
        id: actorId,
        nombre: actorNombre,
      });
      if (r.ok) {
        toast.success('Pago confirmado');
      } else if (r.razon === 'ya_confirmado') {
        toast.success('Ese pago ya estaba confirmado (sin cambios)');
      } else if (r.razon === 'orden_no_existe') {
        toast.error('La orden ya no existe (puede haber sido eliminada)');
      } else if (r.razon === 'pago_no_existe') {
        toast.error('El pago ya no está en la orden — recargá la lista');
      } else {
        toast.error('Error al confirmar pago. Reintentá.');
      }
    } finally {
      setConfirmandoId(null);
    }
  }

  if (!puedeVerificar) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
          <ShieldCheck size={32} className="mx-auto text-amber-600 mb-2" />
          <h2 className="text-lg font-semibold text-amber-900 mb-1">Acceso restringido</h2>
          <p className="text-sm text-amber-800">
            Esta página es solo para usuarios con permiso de confirmar pagos
            (típicamente coordinadora/administrador). Si necesitás acceso,
            pedile al administrador que habilite tu permiso{' '}
            <code className="px-1 py-0.5 bg-amber-100 rounded">pagosVerificar</code>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-4 lg:p-6">
      <header className="mb-5">
        <div className="flex items-center gap-3 mb-1">
          <Banknote size={22} className="text-emerald-600" />
          <h1 className="text-xl lg:text-2xl font-semibold text-gray-900">
            Pagos pendientes de confirmación
          </h1>
        </div>
        <p className="text-sm text-gray-500">
          Pagos registrados por operarias que aún no fueron verificados contra el
          banco / efectivo recibido. Confirmarlos desbloquea la emisión del conduce.
        </p>
      </header>

      {loading ? (
        <LoadingSpinner />
      ) : items.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
          <CheckCircle size={36} className="mx-auto text-emerald-500 mb-3" />
          <h3 className="text-base font-medium text-gray-900 mb-1">Todo al día</h3>
          <p className="text-sm text-gray-500">
            No hay pagos pendientes de confirmación en este momento.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => {
            const key = `${item.ordenId}:${item.pago.id}`;
            const confirmando = confirmandoId === key;
            const orden = item.orden;
            const pago = item.pago;
            return (
              <li
                key={key}
                className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-[260px] space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <Receipt size={14} className="text-gray-400" />
                      <button
                        type="button"
                        onClick={() => navigate(`/admin/ordenes?id=${orden.id}`)}
                        className="font-semibold text-[#1a5fa8] hover:underline"
                        title="Abrir orden"
                      >
                        {/* @safe-numero-doc: fallback display cuando la orden todavía no tiene número asignado; no persiste */}
                        {orden.numero || `OS-${orden.id.slice(-6)}`}
                      </button>
                      <span className="text-xs text-gray-400">·</span>
                      <span className="text-xs text-gray-500">{orden.fase}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-700">
                      <span className="flex items-center gap-1.5">
                        <User size={13} className="text-gray-400" />
                        {orden.clienteNombre || '—'}
                      </span>
                      {orden.clienteTelefono && (
                        <span className="flex items-center gap-1.5 text-gray-500">
                          <Phone size={12} />
                          {orden.clienteTelefono}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                      <div>
                        <p className="text-gray-400 uppercase tracking-wide">Monto</p>
                        <p className="font-semibold text-gray-900 text-sm">
                          {formatMoneda(pago.monto)}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-400 uppercase tracking-wide">Método</p>
                        <p className="text-gray-700 capitalize">{pago.metodo}</p>
                      </div>
                      <div>
                        <p className="text-gray-400 uppercase tracking-wide">
                          {pago.metodo === 'efectivo' ? 'Recibido por' : 'Banco'}
                        </p>
                        <p className="text-gray-700 flex items-center gap-1">
                          {pago.metodo === 'efectivo' ? (
                            pago.recibidoPorNombre || '—'
                          ) : (
                            <>
                              <Building2 size={12} className="text-gray-400" />
                              {pago.bancoNombre || '—'}
                            </>
                          )}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-400 uppercase tracking-wide">Fecha</p>
                        <p className="text-gray-700">{formatFecha(pago.fecha)}</p>
                      </div>
                    </div>
                    {(pago.referencia || pago.notas) && (
                      <div className="text-xs text-gray-600 pt-2 border-t border-gray-100">
                        {pago.referencia && (
                          <p>
                            <span className="text-gray-400">Ref:</span>{' '}
                            <span className="font-mono">{pago.referencia}</span>
                          </p>
                        )}
                        {pago.notas && (
                          <p>
                            <span className="text-gray-400">Notas:</span> {pago.notas}
                          </p>
                        )}
                      </div>
                    )}
                    <p className="text-[11px] text-gray-400">
                      Registrado por: {pago.registradoPorNombre || pago.registradoPorId}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 min-w-[140px]">
                    <button
                      type="button"
                      onClick={() => handleConfirmar(item)}
                      disabled={confirmando}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                    >
                      {confirmando ? (
                        <>
                          <Loader2 size={14} className="animate-spin" />
                          Confirmando...
                        </>
                      ) : (
                        <>
                          <CheckCircle size={14} />
                          Confirmar pago
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate(`/admin/ordenes?id=${orden.id}`)}
                      className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      Ver orden
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
