import { useEffect, useRef } from 'react';

export default function EntornoPruebas() {
  const aviso = useRef<HTMLDivElement>(null);
  const esPrueba = window.location.hostname === 'mister-service-rd-mister-service-rd-team.vercel.app';
  useEffect(() => {
    if (!esPrueba || !aviso.current) return;
    const tituloAnterior = document.title;
    document.title = 'PRUEBAS · Mister Service RD';
    const medir = () => document.documentElement.style.setProperty('--alto-aviso-entorno', `${aviso.current?.getBoundingClientRect().height ?? 0}px`);
    const observador = new ResizeObserver(medir);
    observador.observe(aviso.current); medir();
    return () => { observador.disconnect(); document.title = tituloAnterior; document.documentElement.style.removeProperty('--alto-aviso-entorno'); };
  }, [esPrueba]);
  if (!esPrueba) return null;
  return <div ref={aviso} role="note" className="bg-amber-100 border-b border-amber-300 text-amber-950 px-4 py-3 text-center text-sm"><strong>ENTORNO DE PRUEBAS</strong><span className="ml-2">Conectado a datos reales. Los cambios se guardan.</span></div>;
}
