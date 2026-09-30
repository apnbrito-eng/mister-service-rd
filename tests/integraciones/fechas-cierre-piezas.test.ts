import { expect, it } from 'vitest';
import { conducesDelDiaRD } from '../../src/utils/resumenOperativoDia';
import { piezasLegacyVisibles } from '../../src/utils/piezasLegacy';
it('conduce a las 23 RD pertenece al 29 incluso en Auckland',()=>{
 const anterior=process.env.TZ;process.env.TZ='Pacific/Auckland';
 try {expect(conducesDelDiaRD([{id:'a',fechaEmision:'2026-09-29T23:00:00-04:00'},{id:'sinfecha'},{id:'b',fechaEmision:'2026-09-30T00:00:00-04:00'}],'2026-09-29').map(c=>c.id)).toEqual(['a']);}
 finally {if(anterior===undefined) delete process.env.TZ; else process.env.TZ=anterior;}
});
it('pieza sin createdAt permanece visible sin inventar fecha',()=>{
 const r=piezasLegacyVisibles([{id:'legacy',estado:'buscando'},{id:'actual',createdAt:'2026-09-29',fechaInicio:'2026-09-28'}]);
 expect(r.map(p=>p.id)).toEqual(['actual','legacy']);expect(Number.isNaN(r[1].fechaInicio.getTime())).toBe(true);
});
