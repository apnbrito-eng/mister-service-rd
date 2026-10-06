import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useApp } from '../../context/AppContext';
import { mapaEfectivo } from '../../utils/efectivoResponsabilidad';
import { registrarResponsabilidadEfectivo } from '../../services/efectivoResponsabilidad.service';
import toast from 'react-hot-toast';

/** Usa pagos existentes: no crea otro cobro ni altera su verificación. */
export default function EfectivoOrdenPanel({ ordenId }: { ordenId: string }) {
  const { currentUser, userProfile } = useApp();
  const [orden, setOrden] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => onSnapshot(doc(db, 'ordenes_servicio', ordenId), s => setOrden(s.data() || {}), () => setOrden({})), [ordenId]);
  const actor = { uid: currentUser?.uid || '', rol: userProfile?.rol || '', nombre: userProfile?.nombre || '', activo: userProfile?.activo };
  const pagos = (Array.isArray(orden.pagos) ? orden.pagos.map(mapaEfectivo) : []).filter(p => p.metodo === 'efectivo' && p.requiereAceptacionEfectivo === true && (actor.rol !== 'tecnico' || p.recibidoPorId === actor.uid));
  if (!pagos.length) return null;
  const accion = async (p: Record<string, unknown>, tipo: 'aceptar' | 'recibir') => {
    if (busy) return;
    if (!window.confirm(tipo === 'aceptar' ? `¿Confirmas que recibiste RD$${Number(p.monto).toLocaleString('es-DO')} en efectivo del cliente?` : `¿Confirmas que recibiste físicamente RD$${Number(p.monto).toLocaleString('es-DO')} del técnico?`)) return;
    setBusy(true);
    try { await registrarResponsabilidadEfectivo(ordenId, String(p.id), Number(p.monto), tipo); toast.success(tipo === 'aceptar' ? 'Recepción confirmada; pendiente entregar a oficina' : 'Efectivo recibido por la empresa'); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'No se pudo registrar'); }
    finally { setBusy(false); }
  };
  return <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
    <h3 className="font-semibold text-slate-900">Responsabilidad del efectivo</h3>
    {pagos.map(p => {
      const id = String(p.id), monto = Number(p.monto);
      const aceptado = mapaEfectivo(mapaEfectivo(orden.efectivoAceptaciones)[id]).monto === monto;
      const entrega = mapaEfectivo(mapaEfectivo(orden.efectivoEntregas)[id]);
      const recibido = entrega.monto === monto;
      return <div key={id} className="rounded-lg bg-white p-3 space-y-2">
        <p className="font-semibold">RD${monto.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</p>
        <p>{recibido ? `Recibido por la empresa · ${String(entrega.entregadoPorNombre || 'Oficina')}` : aceptado ? 'Efectivo pendiente de entregar a oficina' : 'Pendiente de aceptación del técnico'}</p>
        {!aceptado && actor.rol === 'tecnico' && orden.tecnicoId === actor.uid && <button disabled={busy} onClick={() => void accion(p, 'aceptar')} className="w-full rounded-lg bg-blue-800 px-3 py-3 text-white disabled:opacity-50">Acepto que recibí este efectivo</button>}
        {aceptado && !recibido && ['administrador', 'coordinadora', 'operaria', 'secretaria'].includes(actor.rol) && <button disabled={busy} onClick={() => void accion(p, 'recibir')} className="w-full rounded-lg bg-blue-800 px-3 py-3 text-white disabled:opacity-50">Recibí el efectivo del técnico</button>}
      </div>;
    })}
    <p className="text-xs text-slate-600">La verificación del pago y la entrega del efectivo se registran por separado.</p>
  </section>;
}
