import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { puede } from '../../utils/permisos';
import type { Personal } from '../../types';

/** Conserva identidad de Personal; nunca busca por nombre ni sustituye por auth.uid. */
export default function NavegacionPersonal({ personal }: { personal: Personal[] }) {
  const { userProfile } = useApp();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const id = params.get('personalId') || '';
  const elegido = personal.find(p => p.id === id);
  const oficina = ['administrador', 'coordinadora'].includes(userProfile?.rol || '');
  const links = [
    ...(puede(userProfile, 'personalVer') ? [{ ruta: '/admin/personal', titulo: 'Personal' }] : []),
    ...(oficina ? [{ ruta: '/admin/usuarios', titulo: 'Accesos y permisos' }, { ruta: '/admin/ponches', titulo: 'Ponches y asistencia' }] : []),
  ];
  return <section className="rounded-xl border bg-white p-4 space-y-3 mb-4">
    <nav aria-label="Gestión del empleado" className="flex flex-wrap gap-2">
      {links.map(l => <Link key={l.ruta} aria-current={location.pathname === l.ruta ? 'page' : undefined} className={`min-h-11 inline-flex items-center px-3 rounded-lg border ${location.pathname === l.ruta ? 'bg-primary text-white' : ''}`} to={l.ruta + (id ? `?personalId=${encodeURIComponent(id)}` : '')}>{l.titulo}</Link>)}
      {oficina && <Link className="min-h-11 inline-flex items-center px-3 underline" to="/admin/nomina">Nómina general</Link>}
    </nav>
    <label className="block text-sm">Empleado
      <select className="block border rounded-lg min-h-11 w-full max-w-lg px-3 mt-1" value={id} onChange={e => { const next = new URLSearchParams(params); if (e.target.value) next.set('personalId', e.target.value); else next.delete('personalId'); setParams(next); }}>
        <option value="">Todo el personal</option>
        {id && !elegido && <option value={id}>Empleado no disponible</option>}
        {/* @safe-tecnicoid-id: filtro URL por documento Personal; no asigna técnico ni escribe Firestore. */}
        {personal.map(p => <option key={p.id} value={p.id}>{p.nombre} · {p.rol}{p.activo === false ? ' · Inactivo' : ''}</option>)}
      </select>
    </label>
    {id && !elegido && <p role="alert" className="text-amber-800">No se encontró el empleado seleccionado. Revisa el enlace o selecciona otro empleado.</p>}
    {elegido && <p className="text-sm">{elegido.uid ? 'Cuenta de acceso vinculada.' : 'Sin cuenta de acceso vinculada.'} Los datos laborales, permisos y ponches corresponden a esta misma ficha.</p>}
  </section>;
}
