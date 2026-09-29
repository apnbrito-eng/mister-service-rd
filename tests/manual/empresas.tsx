/** Ensayo local; datos ficticios, todas las escrituras bloqueadas por alias. */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'react-hot-toast';
import '../../src/index.css';
import EmpresasAliadas from '../../src/pages/EmpresasAliadas';
createRoot(document.getElementById('root')!).render(<main className="service-ui"><p className="p-3 text-sm">Ensayo local de Empresas Aliadas. Datos de prueba; guardar y activar están bloqueados.</p><EmpresasAliadas/><Toaster/></main>);
