import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';

export type AccionMensaje = 'nota' | 'expediente' | 'pago';
const opciones: { accion: AccionMensaje; texto: string }[] = [
  { accion: 'nota', texto: 'Guardar en la orden' },
  { accion: 'expediente', texto: 'Guardar en expediente del cliente' },
  { accion: 'pago', texto: 'Registrar pago con evidencia' },
];

/** Coordenadas del viewport, también cuando el teclado reduce el área visible. */
export function posicionMenuMensaje(
  ancla: { left: number; top: number; bottom: number },
  menu: { width: number; height: number },
  vista: { left: number; top: number; width: number; height: number },
) {
  const margen = 8;
  const derecha = vista.left + vista.width - margen;
  const abajo = vista.top + vista.height - margen;
  const superior = ancla.top - menu.height - margen;
  return {
    left: Math.max(vista.left + margen, Math.min(ancla.left, derecha - menu.width)),
    top: Math.max(vista.top + margen, Math.min(superior >= vista.top + margen ? superior : ancla.bottom + margen, abajo - menu.height)),
  };
}

export default function MenuMensaje({ id, ancla, onCerrar, onAccion }: {
  id: string;
  ancla: RefObject<HTMLButtonElement>;
  onCerrar: () => void;
  onAccion: (accion: AccionMensaje) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [posicion, setPosicion] = useState({ left: 8, top: 8, maxHeight: 320, width: 256 });
  const cerrar = () => { ancla.current?.focus(); onCerrar(); };

  useLayoutEffect(() => {
    const menu = menuRef.current;
    const trigger = ancla.current;
    if (!menu || !trigger) return;
    const posicionar = () => {
      const visual = window.visualViewport;
      const vista = { left: visual?.offsetLeft ?? 0, top: visual?.offsetTop ?? 0, width: visual?.width ?? window.innerWidth, height: visual?.height ?? window.innerHeight };
      const width = Math.max(0, Math.min(256, vista.width - 16));
      const maxHeight = Math.max(0, vista.height - 16);
      menu.style.width = `${width}px`;
      menu.style.maxHeight = `${maxHeight}px`;
      setPosicion({ ...posicionMenuMensaje(trigger.getBoundingClientRect(), menu.getBoundingClientRect(), vista), width, maxHeight });
    };
    posicionar();
    menu.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    window.addEventListener('resize', posicionar);
    window.addEventListener('scroll', posicionar, true);
    window.visualViewport?.addEventListener('resize', posicionar);
    window.visualViewport?.addEventListener('scroll', posicionar);
    return () => {
      window.removeEventListener('resize', posicionar);
      window.removeEventListener('scroll', posicionar, true);
      window.visualViewport?.removeEventListener('resize', posicionar);
      window.visualViewport?.removeEventListener('scroll', posicionar);
      if (menu.contains(document.activeElement)) trigger.focus();
    };
  }, [ancla]);

  return createPortal(<>
    <div className="fixed inset-0 z-[70]" data-menu-mensaje-fondo="true" aria-hidden="true"
      onPointerDown={event => event.preventDefault()}
      onClick={event => { event.stopPropagation(); cerrar(); }} />
    <div id={id} ref={menuRef} role="menu" aria-label="Acciones del mensaje"
      className="fixed z-[71] overflow-y-auto bg-white border shadow-lg rounded-lg p-2"
      style={posicion}
      onBlur={event => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) onCerrar();
      }}
      onKeyDown={event => {
        const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
        const indice = items.indexOf(document.activeElement as HTMLButtonElement);
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          const siguiente = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (indice + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
          items[siguiente]?.focus();
        } else if (event.key === 'Escape' || event.key === 'Tab') {
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); }
          cerrar();
        }
      }}>
      {opciones.map(({ accion, texto }) => <button key={accion} type="button" role="menuitem" tabIndex={-1}
        className="block min-h-11 p-2 w-full text-left text-sm rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        onClick={() => { cerrar(); onAccion(accion); }}>{texto}</button>)}
      <button type="button" role="menuitem" tabIndex={-1} className="block min-h-11 p-2 w-full text-left text-sm rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" onClick={cerrar}>Cerrar</button>
    </div>
  </>, document.body);
}
