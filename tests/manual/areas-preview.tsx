import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom';
import { AtencionProvider } from '../../src/context/AtencionContext';
import { obtenerAreas, areaPath } from '../../src/navigation/areas';
import AreaTrabajo from '../../src/pages/AreaTrabajo';
import EspacioTrabajo from '../../src/components/EspacioTrabajo';
import '../../src/index.css';
const perfil={id:'qa',nombre:'Ejemplo',email:'',telefono:'',rol:'administrador' as const,activo:true,createdAt:new Date()};
function Preview(){return <MemoryRouter initialEntries={['/admin/area/atencion']}><AtencionProvider><div className="min-h-screen bg-gray-50"><header className="p-4 bg-amber-50">Prueba local de navegación · componentes reales · sin datos de producción</header><div className="flex flex-col lg:flex-row"><nav className="lg:w-64 p-3 flex lg:flex-col flex-wrap gap-2">{obtenerAreas(perfil).map(n=>n.kind==='section'?<Link key={n.section.id} className="p-3 rounded-lg bg-white border" to={areaPath(n.section.id)}>{n.section.label}</Link>:null)}</nav><main className="min-w-0 flex-1"><div className="lg:hidden p-3"><EspacioTrabajo compacto/></div><EspacioTrabajo/><Routes><Route path="/admin/area/:area" element={<AreaTrabajo/>}/><Route path="*" element={<div className="p-8">Destino seleccionado. Los datos de esta página no se cargan en esta prueba de navegación.</div>}/></Routes></main></div></div></AtencionProvider></MemoryRouter>}
createRoot(document.getElementById('root')!).render(<Preview/>);
