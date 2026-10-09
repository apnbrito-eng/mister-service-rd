import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ token: vi.fn(), fetch: vi.fn(), enviado: vi.fn() }));
vi.mock('../../src/lib/appCheck', () => ({ obtenerAppCheckToken: m.token }));
import EvaluacionServicio from '../../src/components/public/EvaluacionServicio';
let vista: ReactTestRenderer;
beforeEach(async () => {
 vi.clearAllMocks();
 m.token.mockResolvedValue(null);
 m.fetch.mockResolvedValue({ ok: true, status: 200 });
 vi.stubGlobal('fetch', m.fetch);
 await act(async () => { vista = create(createElement(EvaluacionServicio, { token: 'token-sintetico-portal', onEnviado: m.enviado })); });
});
afterEach(() => { act(() => vista.unmount()); vi.unstubAllGlobals(); });
const boton = () => vista.root.findAllByType('button').find(b => b.children.includes('Enviar evaluación'))!;
async function seleccionar(grupo: string, categoria: string, valor: number) {
 await act(async () => { vista.root.findAllByProps({ type: 'radio' }).find(r => r.props.name === `${grupo}-${categoria}` && r.props.value === valor)!.props.onChange(); });
}
async function atencionCompleta() {
 for (const clave of ['puntualidad', 'trato', 'claridad']) await seleccionar('Atención al cliente', clave, 4);
}
it('permite atención independiente y envía solo puntuaciones, sin identidades', async () => {
 expect(boton().props.disabled).toBe(true);
 await atencionCompleta();
 expect(boton().props.disabled).toBe(false);
 await act(async () => { await boton().props.onClick(); });
 const cuerpo = JSON.parse(m.fetch.mock.calls[0][1].body as string);
 expect(cuerpo).toEqual({ evaluacion: { atencion: { puntualidad: 4, trato: 4, claridad: 4 } }, comentario: '' });
 expect(m.enviado).toHaveBeenCalledTimes(1);
});
it('no envía un segundo bloque incompleto; permite omitirlo expresamente', async () => {
 await atencionCompleta();
 await seleccionar('Servicio técnico', 'calidad', 5);
 expect(boton().props.disabled).toBe(true);
 expect(m.fetch).not.toHaveBeenCalled();
 const omitir = vista.root.findAllByType('button').filter(b => b.children.includes('Prefiero no evaluar'));
 await act(async () => { omitir[1].props.onClick(); });
 expect(boton().props.disabled).toBe(false);
});
it('conserva selección y permite reintentar ante fallo del servidor', async () => {
 await atencionCompleta();
 m.fetch.mockResolvedValueOnce({ ok: false, status: 500 });
 await act(async () => { await boton().props.onClick(); });
 expect(m.enviado).not.toHaveBeenCalled();
 expect(vista.root.findByProps({ role: 'alert' })).toBeDefined();
 expect(boton().props.disabled).toBe(false);
 await act(async () => { await boton().props.onClick(); });
 expect(m.enviado).toHaveBeenCalledTimes(1);
});
