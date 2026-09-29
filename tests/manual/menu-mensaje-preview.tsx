import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import MensajeBubble from '../../src/components/inbox/MensajeBubble';
import '../../src/index.css';
function Prueba() {
  const [acciones, setAcciones] = useState(0);
  return <main style={{padding:16}}><p>Prueba local sin operaciones reales</p><output aria-label="Acciones ejecutadas">{acciones}</output>
    <div style={{height:300,overflow:'auto',border:'1px solid #ddd'}}>{Array.from({length:12},(_,i)=><MensajeBubble key={i} mensaje={{_direccion:'entrante',tipo:'text',contenido:{texto:`Mensaje de prueba ${i+1}`},wamid:`prueba-${i}`,timestampMeta:new Date()} as React.ComponentProps<typeof MensajeBubble>['mensaje']} onGestionCrm={()=>setAcciones(v=>v+1)} />)}</div>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Prueba />);
