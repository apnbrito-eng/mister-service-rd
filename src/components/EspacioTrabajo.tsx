import { useAtencion } from '../context/AtencionContext';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { obtenerAreas, areaPath } from '../navigation/areas';

export default function EspacioTrabajo({ compacto = false }: { compacto?: boolean }) {
  const navigate = useNavigate();
  const { seleccion, seleccionar } = useAtencion();
  const { pathname } = useLocation();
  const { userProfile } = useApp();
  const areas = obtenerAreas(userProfile);
  const node = areas.find(n => n.kind === 'section' && (areaPath(n.section.id) === pathname || n.section.items.some(i => pathname === i.to || (i.to === '/admin/inbox' && pathname.startsWith(i.to + '/')))));
  if (!node || node.kind !== 'section') return null;
  const items = node.section.items.filter(i => i.show);
  const esSolicitud = pathname === '/admin/solicitudes' || pathname === '/admin/citas';
  const vistas = items.filter(i => i.to !== '/admin/citas' || !items.some(v => v.to === '/admin/solicitudes'));
  const actual = esSolicitud && vistas.some(v => v.to === '/admin/solicitudes') ? '/admin/solicitudes' : pathname.startsWith('/admin/inbox/') ? '/admin/inbox' : pathname;
  const destino = (to: string) => {
    if (node.section.id !== 'v2_atencion' || !seleccion) return to;
    if (to === '/admin/clientes' && seleccion.clienteId) return `${to}?id=${encodeURIComponent(seleccion.clienteId)}`;
    if (to === '/admin/inbox' && seleccion.waId) return `${to}/${encodeURIComponent(seleccion.waId)}`;
    return to;
  };
  const valorSelector = vistas.some(v => v.to === actual) ? actual : vistas[0]?.to ?? '';
  if (compacto) return <select aria-label={`Cambiar vista de ${node.section.label}`} value={valorSelector} onChange={e => navigate(destino(e.target.value))} className="min-h-11 min-w-0 max-w-full bg-transparent font-semibold rounded-lg px-2">{vistas.map(v => <option key={v.to} value={v.to}>{v.to === '/admin/inbox' ? 'Conversaciones' : v.label}</option>)}</select>;
  return <section className="px-4 pt-3 pb-2 border-b bg-white" aria-label={`Espacio de trabajo: ${node.section.label}`}>
    <span className="hidden lg:inline-flex items-center min-h-11 font-semibold mb-3">{node.section.label}</span>
    <nav className="hidden lg:flex gap-2 flex-wrap" aria-label="Vistas del área">{vistas.map(v => <Link key={v.to} to={destino(v.to)} className={`rounded-full px-3 py-2 text-sm ${actual === v.to ? 'bg-primary text-white' : 'bg-gray-50 text-gray-600'}`}>{v.to === '/admin/inbox' ? 'Conversaciones' : v.label}</Link>)}</nav>
    {node.section.id === 'v2_atencion' && seleccion && <div className="flex items-center justify-between gap-2 text-sm mt-2"><span className="truncate">Cliente: {seleccion.nombre || seleccion.telefono || 'seleccionado'}</span><button className="shrink-0 min-h-11 text-blue-700" onClick={() => { seleccionar(null); navigate(pathname.startsWith('/admin/inbox') ? '/admin/inbox' : pathname); }}>Ver todos</button></div>}
    {esSolicitud && <nav aria-label="Solicitudes y citas" className="flex gap-2 mt-2">{items.filter(i => ['/admin/solicitudes','/admin/citas'].includes(i.to)).map(v => <Link key={v.to} to={destino(v.to)} className={`flex-1 sm:flex-none text-center rounded-lg px-4 py-3 text-sm ${pathname === v.to ? 'bg-primary text-white' : 'bg-gray-100'}`}>{v.to === '/admin/solicitudes' ? 'Recibidas' : 'Citas por confirmar'}</Link>)}</nav>}
  </section>;
}
