import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Standby from '../../src/pages/Standby';
import EstadoResultado from '../../src/pages/EstadoResultado';
import PersonalPage from '../../src/pages/PersonalPage';
import '../../src/index.css';
window.fetch = async () => { throw new Error('QA local: fetch bloqueado. No se envía ni guarda.'); };
window.open = () => { throw new Error('QA local: apertura externa bloqueada.'); };
document.addEventListener('click', e => { const a = (e.target as Element)?.closest('a'); if (a && new URL(a.href, location.href).origin !== location.origin) { e.preventDefault(); e.stopPropagation(); } }, true);
function Destino() { const { pathname, search } = useLocation(); return <div className="p-5"><h1>Destino local sustituido</h1><p>{pathname}{search}</p><p>Inbox/ficha fuera del alcance. Ningún mensaje enviado.</p><button onClick={() => history.back()}>Volver</button></div>; }
createRoot(document.getElementById('root')!).render(<BrowserRouter><div className="app-shell service-ui"><header className="p-3 bg-amber-50">QA ficticia · escrituras, fetch y enlaces externos bloqueados</header><nav className="p-3 flex gap-4 flex-wrap"><Link to="/qa/piezas">Piezas/suplidores</Link><Link to="/qa/resultado">Estado de Resultados</Link><Link to="/qa/personal">Personal</Link><a href="/tests/manual/qa-final.html?incompleto=1">Datos incompletos</a></nav><Routes><Route path="/qa/piezas" element={<Standby/>}/><Route path="/qa/resultado" element={<EstadoResultado/>}/><Route path="/qa/personal" element={<PersonalPage/>}/><Route path="/admin/*" element={<Destino/>}/><Route path="*" element={<Standby/>}/></Routes><Toaster/></div></BrowserRouter>);
