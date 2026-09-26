/** Keep inputs reachable in nested scroll containers and in browser IME overlays.
 * Pinch zoom belongs to the user: never resize/recenter the interface while zoomed.
 */
export function desplazamientoVisible(top: number, bottom: number, height: number): number {
  if (bottom > height - 16) return bottom - height + 16;
  if (top < 16) return top - 16;
  return 0;
}
export function iniciarViewport() {
  const viewport = window.visualViewport;
  let frame = 0;
  let maxHeight = window.innerHeight;
  const root = document.documentElement;
  function actualizar() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      if (viewport && Math.abs(viewport.scale - 1) > 0.05) return;
      const height = Math.min(window.innerHeight, viewport?.height ?? window.innerHeight);
      const active = document.activeElement;
      const editable = active instanceof HTMLElement && active.matches('input, textarea, [contenteditable="true"]');
      maxHeight = Math.max(maxHeight, window.innerHeight);
      const keyboard = editable && maxHeight - height > 120;
      root.style.setProperty('--alto-visible', `${height}px`);
      root.classList.toggle('teclado-visible', !!keyboard);
      if (!editable) return;
      const rect = active.getBoundingClientRect();
      if (desplazamientoVisible(rect.top, rect.bottom, height) !== 0) {
        active.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
      }
    });
  }
  const orientar = () => { maxHeight = window.innerHeight; actualizar(); };
  window.addEventListener('resize', actualizar);
  window.addEventListener('orientationchange', orientar);
  viewport?.addEventListener('resize', actualizar);
  document.addEventListener('focusin', actualizar);
  document.addEventListener('focusout', actualizar);
  actualizar();
}
