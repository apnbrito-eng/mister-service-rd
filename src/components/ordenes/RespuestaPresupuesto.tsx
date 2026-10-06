import { useState } from 'react';
import toast from 'react-hot-toast';
import type { OrdenServicio } from '../../types';
import { useApp } from '../../context/AppContext';
import { formatMoneda } from '../../utils';
import { puedeGestionarRespuestaPresupuesto } from '../../utils/presupuestoOrden';
import { gestionarPresupuestoOrden } from '../../services/presupuestoOrden.service';

export default function RespuestaPresupuesto({ orden }: { orden: OrdenServicio }) {
  const { userProfile, currentUser } = useApp();
  const [monto, setMonto] = useState('');
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  if (!orden.presupuestoEstado || !userProfile || !currentUser || !puedeGestionarRespuestaPresupuesto(orden, userProfile.rol, currentUser.uid)) return null;
  async function guardar(accion: 'aceptar' | 'proponer') {
    if (!userProfile || !currentUser) return;
    setGuardando(true);
    try {
      await gestionarPresupuestoOrden({ orden, usuario: userProfile, uid: currentUser.uid, accion, monto: accion === 'aceptar' ? Number(orden.precioAprobado) : Number(monto), motivo });
      toast.success(accion === 'aceptar' ? 'Aceptación registrada. Técnico autorizado.' : 'Cambio enviado a la coordinadora.');
      setMonto(''); setMotivo('');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'No se pudo guardar.'); }
    finally { setGuardando(false); }
  }
  return <section className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-3">
    <h3 className="font-semibold">Presupuesto · total del servicio, piezas incluidas</h3>
    <p>Monto aprobado por oficina: <strong>{formatMoneda(orden.precioAprobado || 0)}</strong></p>
    {orden.presupuestoEstado === 'cambio_solicitado' ? <p>Cambio pendiente de coordinadora: <strong>{formatMoneda(orden.presupuestoMontoPropuesto || 0)}</strong>. {orden.presupuestoCambioMotivo} El técnico sigue pendiente de autorización.</p> : orden.presupuestoEstado === 'aceptado' ? <p>Cliente aceptó. Técnico autorizado por el monto aprobado.</p> : <>
      <p>Contacta al cliente y registra su respuesta. No se requiere otra aprobación si acepta este monto.</p>
      <button type="button" disabled={guardando} onClick={() => guardar('aceptar')} className="w-full bg-blue-800 text-white rounded-lg p-3 disabled:opacity-50">Registrar aceptación del cliente por {formatMoneda(orden.precioAprobado || 0)}</button>
      <label className="block text-sm">Proponer otro total, piezas incluidas (RD$)<input type="number" min="0.01" step="0.01" value={monto} onChange={e => setMonto(e.target.value)} className="block w-full rounded border p-2" /></label>
      <label className="block text-sm">Motivo del cambio<textarea value={motivo} onChange={e => setMotivo(e.target.value)} className="block w-full rounded border p-2" /></label>
      <button type="button" disabled={guardando || !monto || motivo.trim().length < 5} onClick={() => guardar('proponer')} className="w-full border border-blue-800 rounded-lg p-3 disabled:opacity-50">Enviar nuevo monto a aprobación</button>
    </>}
  </section>;
}
