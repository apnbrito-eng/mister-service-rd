import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter,Routes,Route,useLocation,Link} from 'react-router-dom';
import {Toaster} from 'react-hot-toast';
import Clientes from '../../src/pages/Clientes';
import {AtencionProvider} from '../../src/context/AtencionContext';
import '../../src/index.css';
export function Destino() {const {pathname,search}=useLocation();return <section><h1>Destino Inbox comprobable</h1><p>{pathname}{search}</p><Link to="/tests/manual/clientes-qa.html">Volver al ensayo</Link></section>;}
createRoot(document.getElementById('root')!).render(<BrowserRouter><AtencionProvider><div className="app-shell service-ui"><header className="px-4 py-2 text-sm border-b">Ensayo local · datos ficticios · no envía mensajes</header><main><Routes><Route path="/admin/inbox/:id" element={<Destino/>}/><Route path="*" element={<Clientes/>}/></Routes></main></div><Toaster/></AtencionProvider></BrowserRouter>);
