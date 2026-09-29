import React from 'react';
export function useApp(){return {userProfile:{rol:'administrador'}};}
const base = {responsableId:'coord', responsableNombre:'Coordinación', tecnicoId:'tec', tecnicoNombre:'Técnico de ejemplo', operariaId:'op', operariaNombre:'Atención de ejemplo', cartera:{responsableId:'op',responsableNombre:'Atención de ejemplo'}, participantes:{op:'Atención de ejemplo'}, etapa:'seguimiento', pagos:[]};
export async function equipoApi(){return {items:[
 {...base,id:'o1',clienteId:'c1',clienteNombre:'Laura · cliente de ejemplo',numero:'OS-001',equipo:'Lavadora Samsung',fase:'en_diagnostico'},
 {...base,id:'o2',clienteId:'c1',clienteNombre:'Laura · cliente de ejemplo',numero:'OS-002',equipo:'Nevera LG',fase:'agendado'},
 {...base,id:'o3',clienteId:'c2',clienteNombre:'Carlos · cliente de ejemplo',numero:'OS-003',equipo:'Aire acondicionado',fase:'en_cotizacion',responsableId:'',responsableNombre:'',traspaso:{destinoNombre:'Coordinación'}},
],cursor:null};}
export default function Detalle(){return <p>Vista de prueba de la lista. La aplicación abre aquí la gestión existente de la orden.</p>;}
