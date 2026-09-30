import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Mantenimiento from '../../src/pages/Mantenimiento';
import SugerenciasChequeo from '../../src/pages/SugerenciasChequeo';
import CierreDia from '../../src/pages/CierreDia';
import '../../src/index.css';
window.open = () => { throw new Error('Ensayo: apertura externa bloqueada.'); };
document.addEventListener('click', event => { const enlace = (event.target as Element)?.closest('a'); if (enlace && new URL(enlace.href, location.href).origin !== location.origin) { event.preventDefault(); event.stopPropagation(); alert('Ensayo: enlace externo bloqueado.'); } }, true);
function Destino() { const { pathname, search } = useLocation(); return <section className="p-4"><h1>Destino de ensayo</h1><p className="break-all">{pathname}{search}</p><p>Ficha externa sustituida por marcador local. No se envía ni guarda.</p><button className="btn-primary" onClick={() => history.back()}>Volver</button></section>; }
function Menu() { return <nav className="p-3 flex flex-wrap gap-3 border-b"><Link to="/qa/mantenimiento">Mantenimiento</Link><Link to="/qa/chequeo">Solo chequeo</Link><Link to="/qa/cierre">Cierre del día</Link></nav>; }
createRoot(document.getElementById('root')!).render(<BrowserRouter><div className="app-shell service-ui"><header className="p-3 bg-amber-50">Ensayo local · todos los datos son ficticios · escrituras y conexiones externas bloqueadas</header><Menu/><main><Routes><Route path="/qa/mantenimiento" element={<Mantenimiento/>}/><Route path="/qa/chequeo" element={<SugerenciasChequeo/>}/><Route path="/qa/cierre" element={<CierreDia/>}/><Route path="/admin/*" element={<Destino/>}/><Route path="*" element={<Mantenimiento/>}/></Routes></main></div><Toaster/></BrowserRouter>);
