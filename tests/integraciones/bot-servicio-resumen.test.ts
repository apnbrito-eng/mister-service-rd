import { create, act } from 'react-test-renderer';
import { createElement } from 'react';
import { expect, it } from 'vitest';
import ResumenBotServicio from '../../src/components/inbox/ResumenBotServicio';
it('presenta los datos recibidos y pendientes sin enlaces ni acciones automáticas', async () => {
  let vista!: ReturnType<typeof create>;
  await act(async () => { vista = create(createElement(ResumenBotServicio, { resumen: { estado: 'pendiente', motivo: 'humano', equipoId: null, datos: { equipo: '<script>no ejecutar</script>', servicio: 'mantenimiento', tieneFoto: true, tieneUbicacion: false }, pendientes: ['ubicacion'] } })); });
  const texto = JSON.stringify(vista.toJSON());
  expect(texto).toContain('IA pausada'); expect(texto).toContain('Mantenimiento'); expect(texto).toContain('Ubicación');
  expect(vista.root.findAllByType('button')).toHaveLength(0); expect(vista.root.findAllByType('a')).toHaveLength(0);
  expect(vista.root.findAllByType('script')).toHaveLength(0);
  await act(async () => vista.unmount());
});
