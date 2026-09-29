import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import PanelCliente360 from '../../src/components/inbox/PanelCliente360';
import '../../src/index.css';
function Preview() {
 const [vista, setVista] = useState('chat');
 return <main className="flex h-[100dvh] flex-col overflow-hidden bg-white text-slate-800">
  <style>{`@media(min-width:1024px){.inbox-preview-panel{width:420px;display:block}.inbox-preview-chat{display:flex}}`}</style>
  <header className="shrink-0 border-b bg-amber-50 p-3 text-sm">Prueba local · datos ficticios · chat ilustrativo y ficha integrada. Sin publicar.</header>
  <nav className="flex shrink-0 border-b lg:hidden"><button className="min-h-11 flex-1" onClick={() => setVista('chat')}>Conversación</button><button className="min-h-11 flex-1" onClick={() => setVista('ficha')}>Ficha del cliente</button></nav>
  <div className="flex min-h-0 flex-1">
   <section className={`${vista === 'chat' ? 'flex' : 'hidden lg:flex'} inbox-preview-chat min-w-0 flex-1 flex-col`}>
    <header className="border-b p-4"><h1 className="font-semibold">Laura · ejemplo ficticio</h1><p className="text-sm text-gray-500">(809) 555-0100</p></header>
    <div className="ms-chat-fondo flex-1 space-y-4 overflow-y-auto p-5"><p className="max-w-sm rounded-xl bg-white p-3 shadow-sm">Hola, quisiera saber cómo va la reparación de mi lavadora.</p><p className="ml-auto max-w-sm rounded-xl bg-[#d9fdd3] p-3 shadow-sm">Estamos revisando la bomba. En la ficha tienes el seguimiento de tu orden.</p></div>
    <div className="border-t p-3"><input aria-label="Borrador de prueba" placeholder="Escribe un borrador ficticio" className="min-h-11 w-full rounded-xl border px-3" /></div>
   </section>
   <aside className={`${vista === 'ficha' ? 'block' : 'hidden lg:block'} inbox-preview-panel min-h-0 w-full shrink-0 border-l`}><PanelCliente360 waId="8095550100" ubicacionesRecibidas={[{ id: 'ubicacion-ensayo', lat: 18.49, lng: -69.93, etiqueta: 'Ubicación ficticia recibida en este chat' }]} onCrearOrden={() => alert('En la aplicación conectada se abre el formulario existente. Esta prueba no crea órdenes.')} /></aside>
  </div>
 </main>;
}
createRoot(document.getElementById('root')!).render(<MemoryRouter><Preview /></MemoryRouter>);
