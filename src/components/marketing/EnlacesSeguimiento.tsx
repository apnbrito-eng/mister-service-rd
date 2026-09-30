import { Link } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { enlacesSeguimientoPara } from '../../utils/enlacesSeguimiento';

interface Props { actual?: string; titulo?: string }

/** Accesos entre marketing, seguimiento, conocimiento y precios, filtrados por las mismas rutas y roles de App.tsx. */
export default function EnlacesSeguimiento({ actual, titulo = 'Relacionado' }: Props) {
  const { userProfile } = useApp();
  const enlaces = enlacesSeguimientoPara(userProfile).filter(e => e.to !== actual);
  if (!enlaces.length) return null;
  return (
    <nav aria-label={titulo} className="rounded-2xl border bg-white p-4">
      <p className="text-xs font-semibold uppercase text-gray-500 mb-2">{titulo}</p>
      <ul className="flex flex-wrap gap-2">
        {enlaces.map(e => (
          <li key={e.to}>
            <Link to={e.to} title={e.descripcion} className="inline-flex min-h-[44px] items-center rounded-xl border px-3 text-sm text-primary hover:border-primary">{e.titulo}</Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
