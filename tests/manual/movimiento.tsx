/** Fixture local: no ruta pública, no Firebase ni operaciones de negocio. */
import React, { useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import BotonAsistenteMovil from '../../src/components/BotonAsistenteMovil';
import Modal from '../../src/components/Modal';
function Prueba() {
 const [abierto, setAbierto] = useState(false);
 const cerrar = useCallback(() => setAbierto(false), []);
 return <main className="service-ui p-6"><h1>Prueba local de movimiento</h1>
 <p>Arrastra el botón, vuelve a agarrarlo mientras se mueve y abre la hoja. No se guardan datos de negocio.</p>
 <button className="min-h-11 p-3 border rounded" onClick={()=>setAbierto(v=>!v)}>Alternar hoja</button>
 <BotonAsistenteMovil onAbrir={()=>setAbierto(true)} hayNoLeido={false}/>
 <Modal movimiento isOpen={abierto} onClose={cerrar} title="Prueba de hoja"><label>Campo de prueba<input className="border min-h-11 block"/></label><button className="min-h-11 p-3" onClick={cerrar}>Cerrar prueba</button></Modal>
 </main>;
}
createRoot(document.getElementById('root')!).render(<Prueba/>);
