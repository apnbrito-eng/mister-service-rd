import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { db } from '../../firebase/config';
import type { Banco } from '../../types';
import { useApp } from '../../context/AppContext';
import { puede } from '../../utils/permisos';
import { proyectarCobrosBanco, diaCobroRD, type OrdenCobrosCruda } from '../../utils/movimientosCobros';

const moneda = (n: number) => new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(n);
export function HistorialBanco({ bancos, ordenes }: { bancos: Pick<Banco, 'id' | 'nombre' | 'numeroCuenta'>[]; ordenes: OrdenCobrosCruda[] }) {
  const [bancoId, setBancoId] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const datos = useMemo(() => proyectarCobrosBanco(ordenes, bancoId, desde, hasta), [ordenes, bancoId, desde, hasta]);
  return <section className="bg-white border rounded-2xl p-4 sm:p-6 space-y-4 min-w-0">
    <h2 className="text-xl font-semibold">Movimientos por cuenta</h2>
    <p className="text-sm text-gray-600">Pagos registrados en órdenes. No es una conexión al banco ni su saldo real. Sin fechas seleccionadas se muestra el historial completo.</p>
    <div className="grid sm:grid-cols-3 gap-3">
      <label className="text-sm">Cuenta<select className="block border rounded-lg p-2 w-full" value={bancoId} onChange={e => setBancoId(e.target.value)}><option value="">Selecciona una cuenta</option>{bancos.map(b => <option key={b.id} value={b.id}>{b.nombre} · {b.numeroCuenta || b.id}</option>)}</select></label>
      <label className="text-sm">Desde<input className="block border rounded-lg p-2 w-full" type="date" value={desde} onChange={e => setDesde(e.target.value)} /></label>
      <label className="text-sm">Hasta<input className="block border rounded-lg p-2 w-full" type="date" value={hasta} onChange={e => setHasta(e.target.value)} /></label>
    </div>
    <p className="text-xs text-gray-500">El período usa la fecha del pago en República Dominicana, no la fecha de confirmación.</p>
    {(desde || hasta) && <button className="text-blue-700 underline" onClick={() => { setDesde(''); setHasta(''); }}>Ver historial completo</button>}
    {datos.rangoInvalido && <p role="alert" className="text-red-700">La fecha Desde debe ser anterior o igual a Hasta.</p>}
    {bancoId && !datos.rangoInvalido && <>
      <div className="grid sm:grid-cols-3 gap-3"><div>Confirmados<strong className="block">{moneda(datos.totalConfirmado)}</strong></div><div>Pendientes de verificar<strong className="block">{moneda(datos.totalPendiente)}</strong></div><div>Registros con incidencias<strong className="block">{datos.incidencias.length}</strong></div></div>
      {!datos.movimientos.length && <p>No hay movimientos válidos para esta selección.</p>}
      <ul className="divide-y">{datos.movimientos.map(m => <li key={m.clave} className="py-3 flex flex-wrap justify-between gap-2"><div><Link className="text-blue-700 underline" to={`/admin/ordenes/${encodeURIComponent(m.ordenId)}`}>{m.ordenNumero}</Link><p>{m.cliente}</p><p className="text-sm text-gray-600">{diaCobroRD(m.fecha)} · {m.referencia || 'Sin referencia'}</p></div><div><strong>{moneda(m.monto)}</strong><p className="text-sm">{m.confirmado ? 'Confirmado' : 'Pendiente de verificar'}</p></div></li>)}</ul>
      {!!datos.incidencias.length && <div className="bg-amber-50 border border-amber-200 rounded-lg p-3"><h3 className="font-semibold">Incidencias excluidas del total</h3><p className="text-sm">Los registros sin fecha se muestran aunque filtres un período, porque no se pueden asignar a una fecha.</p><ul className="space-y-2 mt-2">{datos.incidencias.map(i => <li key={i.clave} className="text-sm"><Link className="underline" to={`/admin/ordenes/${encodeURIComponent(i.ordenId)}`}>{i.ordenNumero}</Link>: {i.motivo}</li>)}</ul></div>}
    </>}
  </section>;
}

export default function MovimientosBanco({ bancos }: { bancos: Banco[] }) {
  const { userProfile } = useApp();
  const autorizado = !!userProfile && ['administrador', 'coordinadora'].includes(userProfile.rol) && puede(userProfile, 'bancosGestionar');
  const identidad = autorizado ? userProfile.id : '';
  const [estado, setEstado] = useState<{ identidad: string; ordenes: OrdenCobrosCruda[]; error: string; cargando: boolean }>({ identidad: '', ordenes: [], error: '', cargando: true });
  useEffect(() => {
    if (!autorizado) return;
    setEstado({ identidad, ordenes: [], error: '', cargando: true });
    let activo = true;
    const cancelar = onSnapshot(collection(db, 'ordenes_servicio'), snap => {
      if (activo) setEstado({ identidad, ordenes: snap.docs.map(d => ({ id: d.id, datos: d.data() })), error: '', cargando: false });
    }, () => { if (activo) setEstado({ identidad, ordenes: [], error: 'No se pudieron cargar los movimientos. Revisa la conexión y los permisos.', cargando: false }); });
    return () => { activo = false; cancelar(); };
  }, [autorizado, identidad]);
  if (!autorizado) return null;
  if (estado.identidad !== identidad || estado.cargando) return <p role="status">Cargando movimientos…</p>;
  if (estado.error) return <p role="alert" className="text-red-700">{estado.error}</p>;
  return <HistorialBanco bancos={bancos} ordenes={estado.ordenes} />;
}
