import { FaseOrden } from '../types';
import { faseLabel, faseColor } from '../utils';

interface BadgeProps {
  fase?: FaseOrden | 'reactivada_post_chequeo';
  label?: string;
  color?: string;
}

export default function Badge({ fase, label, color }: BadgeProps) {
  if (fase) {
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${faseColor(fase)}`}>
        {faseLabel(fase)}
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${color || 'bg-gray-100 text-gray-700'}`}>
      {label}
    </span>
  );
}
