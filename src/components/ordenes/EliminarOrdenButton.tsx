import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { OrdenServicio } from '../../types';
import { useApp } from '../../context/AppContext';
import { puede } from '../../utils/permisos';
import EliminarOrdenModal from './EliminarOrdenModal';

interface Props {
  orden: OrdenServicio;
  variant?: 'icon' | 'button' | 'text';
  size?: 'sm' | 'md';
  className?: string;
  onDeleted?: () => void;
  /** Detiene la propagación del click al contenedor padre (útil en tarjetas clickeables). */
  stopPropagation?: boolean;
}

export default function EliminarOrdenButton({
  orden, variant = 'icon', size = 'md', className, onDeleted, stopPropagation = true,
}: Props) {
  const { userProfile } = useApp();
  const [showModal, setShowModal] = useState(false);

  if (!puede(userProfile, 'ordenesEliminar')) return null;
  if (orden.eliminada) return null;

  const handleClick = (e: React.MouseEvent) => {
    if (stopPropagation) {
      e.stopPropagation();
      e.preventDefault();
    }
    setShowModal(true);
  };

  const iconSize = size === 'sm' ? 13 : 14;

  const triggerBase: Record<typeof variant, string> = {
    icon: `p-2 hover:bg-red-50 rounded-lg text-red-500 transition-colors ${size === 'sm' ? 'p-1.5' : ''}`,
    button: 'flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors',
    text: 'text-red-600 hover:text-red-700 hover:underline text-xs font-medium inline-flex items-center gap-1',
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        title={variant === 'icon' ? 'Eliminar orden' : undefined}
        className={`${triggerBase[variant]} ${className || ''}`.trim()}
      >
        <Trash2 size={iconSize} />
        {variant === 'button' && <span>Eliminar</span>}
        {variant === 'text' && <span>Eliminar</span>}
      </button>
      <EliminarOrdenModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        orden={orden}
        userProfile={userProfile}
        onDeleted={onDeleted}
      />
    </>
  );
}
