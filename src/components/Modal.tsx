import { useMovimientoReducido } from '../hooks/useMovimientoReducido';
import { ReactNode, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { obtenerTransicionMovimiento, DESPLAZAMIENTO_PANEL } from '../utils/motion';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Piloto opt-in; los consumidores existentes conservan su comportamiento. */
  movimiento?: boolean;
}

function ModalEstatico({ isOpen, onClose, title, children, size = 'md' }: ModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  const sizeClass = {
    sm: 'max-w-sm',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  }[size];

  return createPortal(
    <div className="keyboard-dialog fixed inset-0 z-50 flex items-center justify-center p-4" style={{
      paddingTop: 'calc(env(safe-area-inset-top, 0px) + var(--alto-aviso-entorno, 0px) + 16px)',
      paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
      paddingLeft: 'calc(env(safe-area-inset-left, 0px) + 16px)',
      paddingRight: 'calc(env(safe-area-inset-right, 0px) + 16px)',
    }}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={title} className={`relative bg-white rounded-2xl shadow-2xl w-full ${sizeClass} max-h-full flex flex-col`}>
        <div className="shrink-0 flex items-center justify-between p-4 sm:p-6 border-b border-gray-100">
          <h2 className="text-h2 font-semibold text-gray-900">{title}</h2>
          <button
            type="button"
            aria-label="Cerrar ventana"
            onClick={onClose}
            className="min-h-11 min-w-11 p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500"
          >
            <X size={20} />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto flex-1 p-4 sm:p-6">
          {children}
        </div>
      </div>
    </div>, document.body
  );
}


export default function Modal(props: ModalProps) {
  return props.movimiento ? <ModalMovimiento {...props} /> : <ModalEstatico {...props} />;
}

function ModalMovimiento({ isOpen, onClose, title, children, size = 'md' }: ModalProps) {
  const reducido = useMovimientoReducido();
  const contenedor = useRef<HTMLDivElement>(null);
  const cerrarActual = useRef(onClose);
  cerrarActual.current = onClose;
  useEffect(() => {
    contenedor.current?.toggleAttribute('inert', !isOpen);
    if (!isOpen) return;
    const previo = document.body.style.overflow;
    const foco = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = 'hidden';
    const cerrar = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cerrarActual.current();
      if (event.key === 'Tab') {
        const controles = Array.from(contenedor.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex="0"]') ?? []);
        const primero = controles[0], ultimo = controles[controles.length - 1];
        if (event.shiftKey && document.activeElement === primero) { event.preventDefault(); ultimo?.focus(); }
        else if (!event.shiftKey && document.activeElement === ultimo) { event.preventDefault(); primero?.focus(); }
      }
    };
    contenedor.current?.querySelector<HTMLButtonElement>('button')?.focus();
    document.addEventListener('keydown', cerrar);
    return () => { document.body.style.overflow = previo; document.removeEventListener('keydown', cerrar); foco?.focus(); };
  }, [isOpen]);
  const ancho = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }[size];
  return createPortal(<div ref={contenedor} aria-hidden={!isOpen}
    className="keyboard-dialog fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
    style={{ pointerEvents: isOpen ? 'auto' : 'none',
      paddingTop: 'calc(env(safe-area-inset-top, 0px) + var(--alto-aviso-entorno, 0px) + 16px)',
      paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
      paddingLeft: 'calc(env(safe-area-inset-left, 0px) + 16px)',
      paddingRight: 'calc(env(safe-area-inset-right, 0px) + 16px)',
    }}>
    <motion.div initial={false} animate={{ opacity: isOpen ? 1 : 0 }} transition={obtenerTransicionMovimiento(reducido)}
      className="absolute inset-0 bg-black/40" onClick={onClose} />
    <motion.div role="dialog" aria-modal="true" aria-label={title} initial={false}
      animate={{ opacity: isOpen ? 1 : 0, y: reducido || isOpen ? 0 : DESPLAZAMIENTO_PANEL }}
      transition={obtenerTransicionMovimiento(reducido)} style={{ transition: 'none' }}
      className={`relative bg-white rounded-2xl shadow-2xl w-full ${ancho} max-h-full flex flex-col`}>
      <div className="shrink-0 flex items-center justify-between p-4 sm:p-6 border-b border-gray-100">
        <h2 className="text-h2 font-semibold text-gray-900">{title}</h2>
        <button type="button" aria-label="Cerrar ventana" onClick={onClose} className="min-h-11 min-w-11 p-2 hover:bg-gray-100 rounded-lg text-gray-500"><X size={20}/></button>
      </div>
      <div className="min-h-0 overflow-y-auto flex-1 p-4 sm:p-6">{children}</div>
    </motion.div>
  </div>, document.body);
}
