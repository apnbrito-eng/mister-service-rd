import { describe, expect, it } from 'vitest';
import { obtenerAreas, areaPath } from '../../src/navigation/areas';
import { mismoTelefono } from '../../src/navigation/clienteSeleccionado';
import type { Usuario } from '../../src/types';
const profile = (rol: Usuario['rol']) => ({id:'qa',nombre:'QA',email:'',telefono:'',activo:true,createdAt:new Date(),rol});
const areas = (rol: Usuario['rol']) => obtenerAreas(profile(rol)).flatMap(n => n.kind === 'section' ? [n.section] : []);
describe('áreas de trabajo', () => {
 it('mantiene todos los destinos actuales sin duplicarlos al mover nómina y recursos', () => {
  const actual = obtenerAreas(profile('administrador')).flatMap(n=>n.kind==='section'?n.section.items:[n.item]).filter(i=>i.show).map(i=>i.to);
  const paths='dashboard ordenes agenda-dia operaciones calendario mapa mapa-rutas-anterior reprogramaciones sugerencias-chequeo standby taller mantenimiento historial-anuladas calendarios inbox clientes-responsables clientes solicitudes citas empresas-aliadas cotizaciones pagos-pendientes facturacion-pendiente facturas cierre-dia gastos bancos estado-resultado reporte-avanzado personal ponches nomina comisiones avances prestamos rendimiento metricas-mensuales marketing feedback web formularios configuracion-marketing precios inventario conocimiento asistente asistente/historial configuracion'.split(' ').map(s=>'/admin/'+s).concat('/ponche');
  expect(actual.sort()).toEqual(paths.sort());
  expect(new Set(actual).size).toBe(actual.length);
 });
 it('agrupa remuneración en contabilidad y conserva el historial de IA',()=>{
  expect(areas('administrador').find(a=>a.label==='Contabilidad')?.items.map(i=>i.to)).toContain('/admin/nomina');
  expect(areas('administrador').find(a=>a.label==='Equipo')?.items.map(i=>i.to)).not.toContain('/admin/nomina');
  expect(areas('administrador').find(a=>a.label==='Asistente IA')?.items.map(i=>i.to)).toContain('/admin/asistente/historial');
  expect(areaPath('v2_atencion')).toBe('/admin/area/atencion');
 });
 it('no concede acceso administrativo a operarias ni secretaria',()=>{
  for(const rol of ['operaria','secretaria'] as const){
   const visible=areas(rol).flatMap(a=>a.items).filter(i=>i.show).map(i=>i.to);
   expect(visible).toContain('/admin/inbox');
   for(const path of ['nomina','solicitudes','usuarios','asistente','asistente/historial'])expect(visible).not.toContain('/admin/'+path);
  }
 });
 it('conserva avisos de conversaciones, citas y solicitudes',()=>{
  const result=obtenerAreas(profile('administrador'),{whatsappInboxCount:2,citasCount:13,solicitudesCount:3});
  const atencion=result.find(n=>n.kind==='section'&&n.section.id==='v2_atencion');
  expect(atencion?.kind==='section'&&atencion.section.items.reduce((s,i)=>s+(i.badge??0),0)).toBe(18);
 });
 it('compara teléfonos sin unir vacíos ni números internacionales distintos',()=>{
  expect(mismoTelefono('(809) 555-0100','18095550100')).toBe(true);
  expect(mismoTelefono('','')).toBe(false);
  expect(mismoTelefono('568095550100','18095550100')).toBe(false);
 });
});
