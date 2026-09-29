import React from 'react';
import {createRoot} from 'react-dom/client';
import RevisionAsistencia from '../../src/components/asistencia/RevisionAsistencia';
import '../../src/index.css';
createRoot(document.getElementById('root')!).render(<main className="max-w-5xl mx-auto p-4 bg-gray-50"><h1 className="font-bold text-xl mb-4">Ponche y nómina · Datos ficticios de prueba</h1><RevisionAsistencia desde="2026-09-16" hasta="2026-09-30" liquidacionId="nomina-qa"/></main>);
