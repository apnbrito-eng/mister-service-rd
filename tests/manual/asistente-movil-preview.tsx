import React from 'react';
import {createRoot} from 'react-dom/client';
import Boton from '../../src/components/BotonAsistenteMovil';
import '../../src/index.css';
function Preview(){const [opens,setOpens]=React.useState(0);return <main className="service-ui min-h-screen p-4"><h1 className="text-h1">Prueba del botón de IA</h1><p>Arrastra el botón para apartarlo. Esta prueba no consulta la IA.</p><output aria-label="Aperturas">{opens}</output><Boton onAbrir={()=>setOpens(v=>v+1)} hayNoLeido={false}/></main>}
createRoot(document.getElementById('root')!).render(<Preview/>);
