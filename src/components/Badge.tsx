import { FaseOrden } from '../types';
import { faseLabel, faseColor } from '../utils';
import { CLASES_CHIP, estadoChipDeFase, type EstadoChip } from '../utils/chipEstado';

interface BadgeProps {
  fase?: FaseOrden | 'reactivada_post_chequeo';
  label?: string;
  color?: string;
  apariencia?: 'actual' | 'apple';
  estado?: EstadoChip;
}

export default function Badge({ fase, label, color, apariencia = fase ? 'apple' : 'actual', estado }: BadgeProps) {
  if (apariencia === 'apple') {
    const estadoVisual = fase === 'garantia_reclamada' ? 'garantia' : estado ?? (fase ? estadoChipDeFase(fase) : 'neutro');
    return (
      <span data-estado-chip={estadoVisual} className={`inline-flex items-center px-2 py-1 rounded-full text-[12px] leading-4 font-medium whitespace-nowrap ${CLASES_CHIP[estadoVisual]}`}>
        {fase ? faseLabel(fase) : label}
      </span>
    );
  }
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
