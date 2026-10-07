import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { beforeEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import AltaEquipos from '../../src/components/usuarios/AltaEquipos';
import { plantillaEquipos } from '../../api/_lib/plantillaEquipos';
const m = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../../src/services/equipoApi', () => ({ equipoApi: m.api }));
const personas = plantillaEquipos.filter(p => !['leany.a', 'disnely.b', 'franklin.b'].includes(p.usuario)).map(p => ({ ...p, nombre: p.usuario === 'jorge' ? 'Jorge ' : p.existentes[0], uid: `id-${p.usuario}`, personalId: `p-${p.usuario}`, usuario: '', activo: true, version: 0, supervisora: false, recuperacion: false, email: '' }));
beforeEach(() => { m.api.mockReset().mockImplementation(async (_ruta, body) => body ? { ok: true, uid: body.uid || `nuevo-${body.usuario}` } : { personas }); });
it('lote reutiliza 13 cuentas, crea 3 y conserva las claves de dirección', async () => {
 let vista!: ReactTestRenderer;
 await act(async () => { vista = create(createElement(AltaEquipos, { personas, plantillaEquipos, onComplete: vi.fn().mockResolvedValue(undefined) })); });
 await act(async () => { vista.root.findByProps({ type: 'password' }).props.onChange({ target: { value: 'CLAVE-EXCLUSIVA-FIXTURE' } }); vista.root.findByProps({ type: 'checkbox' }).props.onChange({ target: { checked: true } }); });
 await act(async () => { vista.root.findByType('button').props.onClick(); });
 const cuerpos = m.api.mock.calls.map(c => c[1]).filter(Boolean);
 expect(cuerpos.filter(c => c.accion === 'guardar')).toHaveLength(16);
 expect(cuerpos.filter(c => c.accion === 'guardar' && !c.uid)).toHaveLength(3);
 expect(cuerpos.filter(c => c.accion === 'clave')).toHaveLength(11);
 expect(cuerpos.filter(c => ['id-jorge','id-maria'].includes(c.uid)).every(c => !('password' in c))).toBe(true);
 expect(cuerpos.some(c => c.accion === 'recuperacion' && c.uid === 'id-maria')).toBe(false);
 expect(vista.root.findByProps({ type: 'password' }).props.value).toBe('');
 await act(async () => vista.unmount());
});
it('coincidencia ambigua bloquea el lote completo antes de cambios', async () => {
 m.api.mockResolvedValue({ personas: [...personas, personas[0]] }); let vista!: ReactTestRenderer;
 await act(async () => { vista = create(createElement(AltaEquipos, { personas, plantillaEquipos, onComplete: vi.fn().mockResolvedValue(undefined) })); });
 await act(async () => { vista.root.findByProps({ type: 'password' }).props.onChange({ target: { value: 'CLAVE-EXCLUSIVA-FIXTURE' } }); vista.root.findByProps({ type: 'checkbox' }).props.onChange({ target: { checked: true } }); });
 await act(async () => { vista.root.findByType('button').props.onClick(); });
 expect(m.api.mock.calls.filter(c => c[1])).toHaveLength(0); expect(vista.root.findByProps({ role: 'status' }).children.join('')).toContain('varias cuentas');
 await act(async () => vista.unmount());
});
it('reactiva responsables antes de guardar integrantes tras limpieza y deja extras bloqueados', async () => {
 const inactivas = personas.map(p => ({ ...p, activo: ['id-jorge', 'id-maria'].includes(p.uid) }));
 m.api.mockImplementation(async (_ruta, body) => body ? { ok: true, uid: body.uid || `nuevo-${body.usuario}` } : { personas: [...inactivas, { ...inactivas[0], nombre: 'Extra fuera de plantilla', usuario: 'extra', uid: 'extra', equipo: '', activo: false }] });
 let vista!: ReactTestRenderer;
 await act(async () => { vista = create(createElement(AltaEquipos, { personas: inactivas, plantillaEquipos, onComplete: vi.fn().mockResolvedValue(undefined) })); });
 await act(async () => { vista.root.findByProps({ type: 'password' }).props.onChange({ target: { value: 'CLAVE-EXCLUSIVA-FIXTURE' } }); vista.root.findByProps({ type: 'checkbox' }).props.onChange({ target: { checked: true } }); });
 await act(async () => { vista.root.findByType('button').props.onClick(); });
 const cuerpos = m.api.mock.calls.map(c => c[1]).filter(Boolean);
 expect(cuerpos.filter(c => c.accion === 'restaurar')).toHaveLength(11);
 for (const [lider, miembro] of [['id-wila.a', 'leany.a'], ['id-yohana.b', 'disnely.b']]) {
  expect(cuerpos.findIndex(c => c.accion === 'restaurar' && c.uid === lider)).toBeLessThan(cuerpos.findIndex(c => c.accion === 'guardar' && c.usuario === miembro));
 }
 expect(cuerpos.some(c => c.uid === 'extra')).toBe(false);
 await act(async () => vista.unmount());
});
it('otra operaria activa en el equipo bloquea antes de cambiar cuentas', async () => {
 m.api.mockResolvedValue({ personas: [...personas, { ...personas[2], nombre: 'Otra responsable', usuario: 'otra.a', uid: 'otra', equipo: 'A', activo: true }] });
 let vista!: ReactTestRenderer;
 await act(async () => { vista = create(createElement(AltaEquipos, { personas, plantillaEquipos, onComplete: vi.fn().mockResolvedValue(undefined) })); });
 await act(async () => { vista.root.findByProps({ type: 'password' }).props.onChange({ target: { value: 'CLAVE-EXCLUSIVA-FIXTURE' } }); vista.root.findByProps({ type: 'checkbox' }).props.onChange({ target: { checked: true } }); });
 await act(async () => { vista.root.findByType('button').props.onClick(); });
 expect(m.api.mock.calls.filter(c => c[1])).toHaveLength(0);
 expect(vista.root.findByProps({ role: 'status' }).children.join('')).toContain('otra responsable activa');
 await act(async () => vista.unmount());
});
