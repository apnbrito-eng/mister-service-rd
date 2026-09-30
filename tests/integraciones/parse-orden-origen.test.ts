import { expect, it } from 'vitest';
import { parseOrden } from '../../src/utils';
import { construirMetadatosCita } from '../../src/utils/metadatosCita';
it('cita pública conserva captador distinto del técnico final y autor exacto al recargar', () => {
 const metadatosCita=construirMetadatosCita({id:'cita',clienteNombre:'Cliente',telefono:'8090000000',servicio:'Equipo',createdAt:new Date(),calendarioId:'cal',calendarioNombre:'Agenda',asignadoId:'captador',asignadoNombre:'Técnico captador',equipoId:'equipo',responsableAtencionId:'oficina',origen:'formulario_publico'});
 const orden=parseOrden('orden',{creadoPorId:'uid-oficina',creadoPor:'Nombre',tecnicoId:'tecnico-final',metadatosCita});
 expect(orden.metadatosCita).toEqual(metadatosCita);
 expect(orden.creadoPorId).toBe('uid-oficina'); expect(orden.tecnicoId).toBe('tecnico-final');
});
it('solicitud conserva formulario, empresa y vínculo de origen', () => {
 const metadatosCita={origen:'solicitud_formulario',solicitudId:'sol',formularioId:'f',formularioNombre:'Solicitud',empresaId:'empresa',empresaNombre:'Empresa',camposPersonalizados:{equipo:'Nevera'}};
 expect(parseOrden('o',{metadatosCita}).metadatosCita).toEqual(metadatosCita);
});
it('no inventa origen ni autor para legacy y descarta tipos inválidos', () => {
 const orden=parseOrden('o',{creadoPor:'Nombre',creadoPorId:33,metadatosCita:{origen:'inventado',calendarioId:15,empresaNombre:' ',equipoId:[],responsableAtencionId:null}});
 expect(orden.creadoPorId).toBeUndefined(); expect(orden.metadatosCita).toBeUndefined();
});
