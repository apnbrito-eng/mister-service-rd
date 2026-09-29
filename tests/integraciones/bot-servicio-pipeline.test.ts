import { beforeEach, expect, it, vi } from 'vitest';
import { ejecutarTrabajoServicio, TARIFA_SERVICIO, type DependenciasServicio, type ConfigEjecucionBot } from '../../api/_lib/botServicioPipeline';
const now = Date.UTC(2026, 8, 29, 2);
const lease = { id: 'a'.repeat(64), intento: 1, epoch: 0, configVersion: 1, trabajador: 'qa' };
const config: ConfigEjecucionBot = { habilitado: true, version: 1, numeroCentral: '18495646767', phoneNumberId: '123', permitirHorarioLaboral: false, tarifaVersion: TARIFA_SERVICIO.version };
let d: DependenciasServicio;
beforeEach(() => {
  d = { permitirExternos: true, reloj: () => now, almacen: {
    reclamar: vi.fn(async () => lease), contexto: vi.fn(async () => ({ mensajes: ['Mi lavadora no funciona'], tieneFoto: false, tieneUbicacion: false, pideHumano: false, baja: false, ventanaHastaMs: now + 10000, phoneNumberId: '123' })),
    vigente: vi.fn(async () => true), reservar: vi.fn(async () => 'reserva'), iniciarProveedor: vi.fn(async () => true), liberar: vi.fn(async () => {}), registrarResultado: vi.fn(async () => {}),
    prepararEnvio: vi.fn(async () => true), completar: vi.fn(async () => {}), ambiguo: vi.fn(async () => {}), cancelar: vi.fn(async () => {}), entregarHumano: vi.fn(async () => {}),
  }, proveedor: { contar: vi.fn(async () => 200), generar: vi.fn(async () => ({ datos: { paso: 'servicio' as const }, entrada: 200, salida: 20 })) }, transporte: { enviar: vi.fn(async () => ({ wamid: 'wamid.qa' })) } };
});
it('configuración inválida/desactivada no reclama ni llama externos', async () => {
  for (const c of [null, {}, { ...config, habilitado: false }, { ...config, tarifaVersion: 'ajena' }]) expect(await ejecutarTrabajoServicio(lease.id, c, d)).toBe('desactivado');
  expect(d.almacen.reclamar).not.toHaveBeenCalled();
  expect(d.proveedor.contar).not.toHaveBeenCalled();
});
it('reserva primero y cobra uso real; solo envía una pregunta predeterminada', async () => {
  expect(await ejecutarTrabajoServicio(lease.id, config, d)).toBe('completado');
  expect(d.almacen.reservar).toHaveBeenCalledWith(lease, 24000, now);
  expect(d.almacen.registrarResultado).toHaveBeenCalledWith(lease, 'reserva', expect.any(Object), 900);
  expect(d.transporte.enviar).toHaveBeenCalledWith(lease, expect.stringContaining('reparación o mantenimiento'), '123');
  expect(vi.mocked(d.almacen.reservar).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(d.proveedor.contar).mock.invocationCallOrder[0]);
});
it('no llama al modelo si supera límite de entrada; libera reserva sin gasto', async () => {
  vi.mocked(d.proveedor.contar).mockResolvedValue(6001);
  expect(await ejecutarTrabajoServicio(lease.id, config, d)).toBe('contexto');
  expect(d.almacen.liberar).toHaveBeenCalledWith('reserva');
  expect(d.proveedor.generar).not.toHaveBeenCalled();
});
it('toma humana durante proveedor conserva gasto pero bloquea respuesta', async () => {
  vi.mocked(d.almacen.prepararEnvio).mockResolvedValue(false);
  expect(await ejecutarTrabajoServicio(lease.id, config, d)).toBe('cancelado');
  expect(d.almacen.registrarResultado).toHaveBeenCalled();
  expect(d.almacen.liberar).not.toHaveBeenCalled();
  expect(d.transporte.enviar).not.toHaveBeenCalled();
});
it('timeout del proveedor retiene reserva ambigua y no envía', async () => {
  vi.mocked(d.proveedor.generar).mockRejectedValue(new Error('timeout'));
  expect(await ejecutarTrabajoServicio(lease.id, config, d)).toBe('error');
  expect(d.almacen.ambiguo).toHaveBeenCalledWith(lease, 'reserva', 'proveedor');
  expect(d.almacen.liberar).not.toHaveBeenCalled();
  expect(d.transporte.enviar).not.toHaveBeenCalled();
});
it('envío incierto no se reintenta y no devuelve gasto del proveedor', async () => {
  vi.mocked(d.transporte.enviar).mockRejectedValue(new Error('timeout'));
  expect(await ejecutarTrabajoServicio(lease.id, config, d)).toBe('error');
  expect(d.transporte.enviar).toHaveBeenCalledTimes(1);
  expect(d.almacen.ambiguo).toHaveBeenCalledWith(lease, 'reserva', 'envio');
  expect(d.almacen.liberar).not.toHaveBeenCalled();
});
it('rechaza texto libre del modelo e instrucciones fuera del esquema', async () => {
  vi.mocked(d.proveedor.generar).mockResolvedValue({ entrada: 200, salida: 20, datos: { paso: 'servicio', texto: 'Precio confirmado' } } as never);
  expect(await ejecutarTrabajoServicio(lease.id, config, d)).toBe('error');
  expect(d.transporte.enviar).not.toHaveBeenCalled();
});
it('mantenimiento completo no exige falla y deriva sin llamar al proveedor', async () => {
  vi.mocked(d.almacen.contexto).mockResolvedValue({ mensajes: [], equipo: 'Nevera', servicio: 'mantenimiento', tieneFoto: true, tieneUbicacion: true, pideHumano: false, baja: false, ventanaHastaMs: now + 10000, phoneNumberId: '123' });
  expect(await ejecutarTrabajoServicio(lease.id, config, d)).toBe('humano');
  expect(d.proveedor.generar).not.toHaveBeenCalled();
});
it('declinar foto deriva sin volver a pedirla ni bloquear atención', async () => {
  const c = await d.almacen.contexto(lease);
  vi.mocked(d.almacen.contexto).mockResolvedValue({ ...c, mensajes: ['No puedo enviar foto ahora'] });
  expect(await ejecutarTrabajoServicio(lease.id, config, d)).toBe('humano');
  expect(d.proveedor.generar).not.toHaveBeenCalled(); expect(d.transporte.enviar).not.toHaveBeenCalled();
});

it('mantenimiento nunca pregunta por una falla aunque el modelo lo sugiera', async () => {
  vi.mocked(d.proveedor.generar).mockResolvedValue({ entrada: 200, salida: 20, datos: { paso: 'falla', servicio: 'mantenimiento' } });
  expect(await ejecutarTrabajoServicio(lease.id, config, d)).toBe('completado');
  expect(d.transporte.enviar).toHaveBeenCalledWith(lease, expect.stringContaining('foto'), '123');
});

it('no conserva una dirección inventada que no aparece en el mensaje recibido', async () => {
  vi.mocked(d.proveedor.generar).mockResolvedValue({ entrada: 200, salida: 20, datos: { paso: 'foto', direccion: 'Calle inventada 123' } });
  await ejecutarTrabajoServicio(lease.id, config, d);
  const resultado = vi.mocked(d.almacen.registrarResultado).mock.calls[0][2];
  expect(resultado.datos.direccion).toBeUndefined();
  expect(d.transporte.enviar).toHaveBeenCalledWith(lease, expect.stringContaining('dirección'), '123');
});
