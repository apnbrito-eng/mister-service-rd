import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { analizarCierreNomina } from '../../scripts/invariantes/check-nomina-cierre-atomico';
const codigo = readFileSync('src/services/nomina.service.ts', 'utf8');
it('acepta cierre parcial por empleado dentro de una transacción', () => { expect(analizarCierreNomina(codigo).status).toBe('pass'); });
it('detecta reintroducir escritura independiente', () => {
 const roto = codigo.replace('const base = db;', "const base = db; await updateDoc(ref, { estado: 'cerrada' });");
 expect(analizarCierreNomina(roto).status).toBe('fail');
});
it('detecta error capturado aunque mantenga runTransaction', () => {
 const roto = codigo.replace('const base = db;', 'const base = db; try { await aplicarCuota(); } catch { console.warn("ignorado"); }');
 expect(analizarCierreNomina(roto).status).toBe('fail');
});
it('detecta incluir empleados previamente cerrados', () => {
 const roto = codigo.replace("todosEmpleados.filter(e => !e.estadoCierre || e.estadoCierre === 'listo')", 'todosEmpleados');
 expect(analizarCierreNomina(roto).status).toBe('fail');
});
it('detecta cerrar globalmente cuando queda gente bloqueada', () => {
 const roto = codigo.replace("estado: completa ? 'cerrada' : 'abierta'", "estado: 'cerrada'");
 expect(analizarCierreNomina(roto).status).toBe('fail');
});
