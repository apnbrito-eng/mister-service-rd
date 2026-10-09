import { expect, it, vi } from 'vitest';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { limitesDiaRD, obtenerConteosSidebar, permisosConteosSidebar } from '../../api/_lib/conteosSidebar';
vi.mock('../../api/_lib/accesoEquipo.js', () => ({ ErrorAcceso: class extends Error { constructor(public status: number, message: string) { super(message); } } }));
type Datos = Record<string, unknown>;
function database(datos: Record<string, Datos[]>, falla = '') {
 const lecturas: string[]=[];
 function query(nombre:string,filtros:Array<[string,string,unknown]>=[]) {
  const docs=()=> (datos[nombre]||[]).map((data,i)=>({id:String(i),data:()=>data})).filter(d=>filtros.every(([campo,op,valor])=>{
   const v=d.data()[campo];if(op==='==')return v===valor;
   if(v instanceof Timestamp&&valor instanceof Timestamp)return op==='>='?v.toMillis()>=valor.toMillis():v.toMillis()<valor.toMillis();
   return op==='>'&&typeof v==='string'&&typeof valor==='string'&&v>valor;
  }));
  return {where:(campo:string,op:string,valor:unknown)=>query(nombre,[...filtros,[campo,op,valor]]),select:(...campos:string[])=>({get:async()=>{if(nombre===falla)throw new Error('offline');lecturas.push(`${nombre}:${filtros.length}:${campos.join(',')}`);return {docs:docs().map(d=>({id:d.id,data:()=>Object.fromEntries(campos.filter(c=>c in d.data()).map(c=>[c,d.data()[c]]))}))};}}),count:()=>({get:async()=>{if(nombre===falla)throw new Error('offline');return {data:()=>({count:docs().length})};}})};
 }
 return {db:{collection:query} as unknown as Firestore,lecturas};
}
it('rechaza roles fuera de alcance, perfiles inactivos y conserva revocaciones',()=>{
 expect(()=>permisosConteosSidebar({rol:'operaria'})).toThrow();expect(()=>permisosConteosSidebar({rol:'administrador',activo:false})).toThrow();
 expect(permisosConteosSidebar({rol:'coordinadora',permisosPersonalizados:true,permisosSistema:{clientesVer:false,ordenesVer:true}})).toEqual({clientes:false,ordenes:true,empresas:false});
});
it('cuenta legacy, deduplica bajas/fusiones y separa agenda de abiertas RD',async()=>{
 const hoy=Timestamp.fromDate(new Date('2026-10-10T03:59:59Z'));const manana=Timestamp.fromDate(new Date('2026-10-10T04:00:00Z'));
 const fixture=database({clientes:[{},{eliminado:true},{mergedaCon:'x'},{eliminado:true,mergedaCon:'x'}],empresas_aliadas:[{},{activa:false}],ordenes_servicio:[{fechaCita:hoy},{fechaCita:hoy,fase:'cerrado'},{fechaCita:hoy,eliminada:true,eliminado:true},{fechaCita:manana}]});
 const r=await obtenerConteosSidebar(fixture.db,{rol:'administrador'},new Date('2026-10-10T03:59:59Z'));
 expect(r.fechaRD).toBe('2026-10-09');expect(r.conteos).toEqual({clientes:{estado:'disponible',total:1},empresasAliadas:{estado:'disponible',total:1},ordenes:{estado:'disponible',total:3},agendaDia:{estado:'disponible',total:2},operacionesDia:{estado:'disponible',total:1}});
 expect(fixture.lecturas.every(l=>!l.includes(':0:'))).toBe(true);
});
it('falla parcial no inventa ceros y omite datos denegados',async()=>{
 const {db}=database({},'clientes');const r=await obtenerConteosSidebar(db,{rol:'administrador'});expect(r.conteos.clientes).toEqual({estado:'error'});expect(r.conteos.empresasAliadas).toEqual({estado:'disponible',total:0});
 expect((await obtenerConteosSidebar(db,{rol:'coordinadora',permisosPersonalizados:true,permisosSistema:{}})).conteos).toEqual({});
});
it('límites RD no dependen de zona de navegador',()=>{
 const d=limitesDiaRD(new Date('2026-10-10T04:00:00Z'));expect(d.fechaRD).toBe('2026-10-10');expect(d.fin.getTime()-d.inicio.getTime()).toBe(86400000);
});
it('Centro excluye terminales legacy por estado aunque fase siga agendada',async()=>{
 const fechaCita=Timestamp.fromDate(new Date('2026-10-09T16:00:00Z'));const {db}=database({ordenes_servicio:[{fechaCita,fase:'agendado',estado:'cerrado'},{fechaCita,fase:'agendado',estado:'cancelado'},{fechaCita,fase:'agendado'}]});
 const r=await obtenerConteosSidebar(db,{rol:'coordinadora'},new Date('2026-10-09T17:00:00Z'));expect(r.conteos.agendaDia).toEqual({estado:'disponible',total:3});expect(r.conteos.operacionesDia).toEqual({estado:'disponible',total:1});
});
