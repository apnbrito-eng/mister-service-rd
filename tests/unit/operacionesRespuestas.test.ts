import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { OrdenServicio } from '../../src/types';
import { agregarAvisos, respuestaPendiente } from '../../src/utils/operacionesPrioridad';
const ahora = new Date('2026-10-02T16:00:00Z');
const base = { id: 'a', clienteNombre: 'Ana', fase: 'en_cotizacion', estado: 'activo', operariaNombre: 'Wila', precioSugerido: 3000, historialFases: [], notasTecnico: 'Reemplazar bomba' } as OrdenServicio;
test('precio pendiente muestra nota e importe, no usa cita como fecha de espera', () => {
 const aviso = respuestaPendiente({ ...base, fechaCita: new Date('2026-10-01') }, ahora)!;
 assert.equal(aviso.categoria, 'precio_por_revisar');
 assert.equal(aviso.importeSugerido, 3000);
 assert.equal(aviso.detalleTecnico, 'Reemplazar bomba');
 assert.equal(aviso.metrica, 'Espera sin fecha registrada');
});
test('espera toma última sugerencia persistida y descarta futuro', () => {
 const auditoria = [{ accion: 'precio_sugerido' as const, usuario: 'Técnico', fecha: new Date('2026-10-02T15:30:00Z') }];
 assert.equal(respuestaPendiente({ ...base, auditoria }, ahora)?.metrica, '30 min esperando respuesta');
 auditoria[0].fecha = new Date('2026-10-03');
 assert.equal(respuestaPendiente({ ...base, auditoria }, ahora)?.metrica, 'Espera sin fecha registrada');
});
test('aprobado, eliminado, cerrado o cancelado no exige respuesta', () => {
 for (const cambios of [{estadoAprobacion: 'aprobado'}, {eliminada: true}, {estado: 'cerrado'}, {fase: 'cancelado'}]) {
  assert.equal(respuestaPendiente({ ...base, ...cambios } as OrdenServicio, ahora), null);
 }
 assert.equal(respuestaPendiente({ ...base, precioSugerido: NaN }, ahora), null);
});
test('chequeo usa estado real y desaparece al rechazo o aprobación', () => {
 const sugerencia = { id: 's', estado: 'pendiente' as const, sugeridaPor: 't', sugeridaPorNombre: 'Técnico', fechaSugerencia: new Date('2026-10-02T15:00:00Z'), motivo: 'Solo chequeo solicitado', montoChequeo: 1200 };
 const orden = { ...base, precioSugerido: undefined, sugerenciasSoloChequeo: [sugerencia] };
 assert.equal(respuestaPendiente(orden, ahora)?.categoria, 'chequeo_por_revisar');
 for (const estado of ['aprobada', 'rechazada'] as const) assert.equal(respuestaPendiente({...orden, sugerenciasSoloChequeo: [{...sugerencia, estado}]}, ahora), null);
});
test('anteriores conservan categoría específica y filtros equipo sin duplicar', () => {
 const input = { ordenes: [base], pendientesAnteriores: [base], ahora };
 assert.equal(agregarAvisos(input).totalesCategoria.precio_por_revisar, 1);
 assert.equal(agregarAvisos({...input, ordenes: []}).totalesCategoria.precio_por_revisar, 1);
 assert.equal(agregarAvisos({...input, equipo: 'B'}).avisos.length, 0);
 assert.equal(agregarAvisos({...input, equipo: 'A'}).avisos.length, 1);
});
