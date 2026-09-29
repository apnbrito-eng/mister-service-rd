import React from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import PreciosServicios from '../../src/pages/PreciosServicios';
import Citas from '../../src/pages/Citas';
import OrdenFilters from '../../src/components/ordenes/OrdenFilters';
import '../../src/index.css';
function Preview(){const [vista,setVista]=React.useState('citas');return <MemoryRouter><div className="service-ui"><nav className="flex flex-wrap gap-2 p-4">{['citas','precios','filtros'].map(v=><button className="px-3 bg-primary text-white rounded-lg" key={v} onClick={()=>setVista(v)}>{v}</button>)}</nav><p className="px-4 text-caption">Ensayo aislado con datos ficticios. Escrituras bloqueadas.</p><main className="service-main">{vista==='precios'?<PreciosServicios/>:vista==='citas'?<Citas/>:<div className="p-4"><OrdenFilters busqueda="" setBusqueda={()=>{}} filtroMes="2026-09" setFiltroMes={()=>{}} filtroTecnico="" setFiltroTecnico={()=>{}} filtroEstado="" setFiltroEstado={()=>{}} tecnicos={[]} ESTADOS_SIMPLE={[]}/></div>}</main></div></MemoryRouter>}
createRoot(document.getElementById('root')!).render(<Preview/>);
