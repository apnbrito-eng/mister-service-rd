import { Link, useParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { obtenerAreas, areaPath } from '../navigation/areas';

export default function AreaTrabajo() {
  const { area } = useParams();
  const { userProfile } = useApp();
  const node = obtenerAreas(userProfile).find(n => n.kind === 'section' && areaPath(n.section.id) === `/admin/area/${area}`);
  if (!node || node.kind !== 'section') return <div className="p-6">Área no disponible.</div>;
  const items = node.section.items.filter(i => i.show);
  return <section className="p-4 md:p-6 max-w-6xl mx-auto"><h1 className="text-2xl font-bold text-gray-900 mb-2">{node.section.label}</h1><p className="text-gray-500 mb-6">Selecciona lo que necesitas hacer.</p><div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
    {items.filter(i => i.to !== '/admin/citas' || !items.some(v => v.to === '/admin/solicitudes')).map(item => <Link key={item.to} to={item.to} className="flex items-center gap-3 min-h-20 bg-white border border-gray-200 rounded-2xl p-4 hover:bg-blue-50"><item.icon size={22} className="shrink-0 text-primary"/><span className="font-medium">{item.to === '/admin/inbox' ? 'Conversaciones · WhatsApp' : item.label}{item.to === '/admin/solicitudes' && <small className="block font-normal text-gray-500">Recibidas y citas por confirmar</small>}</span></Link>)}
  </div>{!items.length && <p>No tienes opciones habilitadas en esta área.</p>}</section>;
}
