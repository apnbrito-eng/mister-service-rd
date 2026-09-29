import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import ConciliarFechaComisionFormulario from '../../src/components/ConciliarFechaComisionFormulario';
import '../../src/index.css';
function Fixture() {
 const [fecha, setFecha] = useState(''), [motivo, setMotivo] = useState(''), [guardando, setGuardando] = useState(false), [aviso, setAviso] = useState(''), [abierto, setAbierto] = useState(true);
 return <main className="max-w-xl p-4 mx-auto space-y-4"><p>Prueba local con formulario real. No carga Firebase ni escribe datos.</p>{abierto ? <ConciliarFechaComisionFormulario fecha={fecha} motivo={motivo} guardando={guardando} onFecha={setFecha} onMotivo={setMotivo} onCancelar={() => { setAbierto(false); setAviso('Cancelado sin guardar'); }} onGuardar={e => { e.preventDefault(); setGuardando(true); setTimeout(() => { setGuardando(false); setAbierto(false); setAviso(`Simulación guardada: ${fecha} · ${motivo}`); }, 800); }} /> : <button onClick={() => { setAbierto(true); setFecha(''); setMotivo(''); }}>Abrir prueba</button>}<p role="status">{aviso}</p></main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
