import { useState } from 'react';
import toast from 'react-hot-toast';
import type { OrdenServicio } from '../../types';
import { useApp } from '../../context/AppContext';
import { formatMoneda } from '../../utils';
import { puedeGestionarRespuestaPresupuesto } from '../../utils/presupuestoOrden';
import { confirmarSoloChequeoCliente } from '../../services/confirmacionChequeo.service';

export default function ConfirmacionChequeo({ orden }: { orden: OrdenServicio }) {
  const { userProfile, currentUser } = useApp();
  const [guardando, setGuardando] = useState(false);
  if (!orden.soloChequeo || !orden.chequeoConfirmacionEstado || !userProfile || !currentUser || !puedeGestionarRespuestaPresupuesto(orden, userProfile.rol, currentUser.uid)) return null;
  async function confirmar() {
    if (!userProfile || !currentUser) return;
    setGuardando(true);
    try { await confirmarSoloChequeoCliente(orden, userProfile, currentUser.uid); toast.success('Solo chequeo confirmado. Ya puedes registrar el pago.'); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'No se pudo confirmar.'); }
    finally { setGuardando(false); }
  }
  return <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
    <h3 className="font-semibold">Solo chequeo · {formatMoneda(orden.precioChequeo || 0)}</h3>
    {orden.chequeoConfirmacionEstado === 'confirmado' ? <p>Oficina confirmó con el cliente el servicio y el importe del chequeo.</p> : <>
      <p>Importe definido por coordinación. Confirma con el cliente que únicamente se realizó el chequeo antes de registrar el pago.</p>
      <button type="button" disabled={guardando} onClick={confirmar} className="rounded-lg bg-blue-800 text-white p-3 disabled:opacity-50">Confirmar solo chequeo por {formatMoneda(orden.precioChequeo || 0)}</button>
    </>}
  </section>;
}
