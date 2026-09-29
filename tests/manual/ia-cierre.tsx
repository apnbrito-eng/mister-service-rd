import React from 'react';
import {createRoot} from 'react-dom/client';
import Asistente from '../../src/components/AsistenteIAFlotante';
import '../../src/index.css';
createRoot(document.getElementById('root')!).render(<div className="app-shell service-ui"><header className="relative z-30 glass-toolbar"><select aria-label="Cambiar módulo"><option>Órdenes</option><option>Agenda</option><option>Calendario</option><option>Mapa</option></select></header><p>Ensayo local: sin llamadas IA ni datos reales.</p><Asistente/></div>);
