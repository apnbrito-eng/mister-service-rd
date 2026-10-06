/**
 * HojaInferiorMovil.tsx — bottom sheet con 3 alturas (cerrada / media / alta) y manija.
 *
 * No reemplaza el panel completo: el padre controla las alturas y el contenido.
 */
import { useEffect, useRef, type ReactNode } from 'react';

export type AlturaSheet = 'cerrada' | 'media' | 'alta';

interface Props {
  altura: AlturaSheet;
  onAltura: (a: AlturaSheet) => void;
  children: ReactNode;
  tituloHandle?: string;
}

const PX_POR_ALTURA: Record<AlturaSheet, string> = {
  cerrada: 'calc(100% - 72px)',
  media: 'calc(100% - 48%)',
  alta: '72px',
};

export default function HojaInferiorMovil({ altura, onAltura, children, tituloHandle }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && altura !== 'cerrada') onAltura('cerrada');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [altura, onAltura]);

  const siguienteAltura = (): AlturaSheet => {
    if (altura === 'cerrada') return 'media';
    if (altura === 'media') return 'alta';
    return 'cerrada';
  };

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="false"
      aria-label={tituloHandle || 'Panel'}
      className="fixed inset-x-0 bottom-0 z-30 rounded-t-xl bg-white shadow-2xl transition-[top] duration-200"
      style={{ top: PX_POR_ALTURA[altura] }}
    >
      <button
        type="button"
        onClick={() => onAltura(siguienteAltura())}
        aria-label={`Cambiar altura (actual: ${altura})`}
        className="flex w-full min-h-[44px] items-center justify-center"
      >
        <span className="block h-1.5 w-10 rounded-full bg-gray-300" />
      </button>
      <div className="h-[calc(100%-44px)] overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
