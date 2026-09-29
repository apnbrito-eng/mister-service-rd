import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ add: vi.fn(), remove: vi.fn(), api: vi.fn(), permiso: vi.fn() }));
vi.mock('@capacitor/core', () => ({ registerPlugin: () => ({ addWatcher: mocks.add, removeWatcher: mocks.remove }) }));
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: { requestPermissions: mocks.permiso } }));
vi.mock('../../src/services/equipoApi', () => ({ equipoApi: mocks.api }));
vi.mock('../../src/mobile/camara', () => ({ esAppNativa: () => true }));
beforeEach(() => {
  vi.resetModules(); vi.resetAllMocks(); vi.useFakeTimers();
  mocks.permiso.mockResolvedValue({ display: 'granted' });
  mocks.api.mockResolvedValue({ jornada: { id: 'jornada-1', activa: true, expiraEn: Date.now() + 3600000 } });
  mocks.add.mockResolvedValue('watcher-1'); mocks.remove.mockResolvedValue(undefined);
});
afterEach(() => { vi.useRealTimers(); });
it('si el sensor no se detiene conserva un control visible para reintentar y no duplica watchers', async () => {
  const mod = await import('../../src/mobile/jornada'); const estados: any[] = [];
  mod.observarJornada(s => estados.push(s));
  await mod.iniciarJornada(); mocks.remove.mockRejectedValueOnce(Error('sensor ocupado'));
  await expect(mod.detenerJornada()).rejects.toThrow('No se pudo detener');
  expect(estados.at(-1)).toMatchObject({ activa: true, pendiente: false });
  expect(estados.at(-1).error).toContain('reintentar');
  await expect(mod.iniciarJornada()).rejects.toThrow('Finaliza');
  expect(mocks.add).toHaveBeenCalledTimes(1);
  await mod.detenerJornada();
  expect(mocks.remove).toHaveBeenCalledTimes(2);
  expect(estados.at(-1)).toMatchObject({ activa: false });
  expect(mocks.api).toHaveBeenCalledWith('/api/movil/estado', { accion: 'finalizar', jornadaId: 'jornada-1' });
});
it('evita dos inicios simultáneos y retira un watcher que llega después de cancelar', async () => {
  const mod = await import('../../src/mobile/jornada'); let resolver!: (id: string) => void;
  mocks.add.mockImplementation(() => new Promise<string>(r => { resolver = r; }));
  const inicio = mod.iniciarJornada(); await vi.waitFor(() => expect(mocks.add).toHaveBeenCalledTimes(1));
  await expect(mod.iniciarJornada()).rejects.toThrow('iniciando');
  await mod.detenerJornada(); resolver('watcher-tardio'); await inicio;
  expect(mocks.remove).toHaveBeenCalledWith({ id: 'watcher-tardio' });
});
it('conserva la hora real de GPS y no transmite nuevas posiciones tras finalizar', async () => {
  const mod = await import('../../src/mobile/jornada'); await mod.iniciarJornada();
  const callback = mocks.add.mock.calls[0][1]; const time = Date.now() - 1000;
  callback({ latitude: 18.4, longitude: -69.9, accuracy: 12, time, simulated: false });
  await Promise.resolve();
  expect(mocks.api).toHaveBeenCalledWith('/api/movil/estado', expect.objectContaining({ accion: 'ubicacion', muestra: expect.objectContaining({ capturadaEn: time, precision: 12 }) }));
  await mod.detenerJornada(); const llamadas = mocks.api.mock.calls.length;
  callback({ latitude: 18.5, longitude: -69.8, accuracy: 8, time: Date.now(), simulated: false });
  await vi.advanceTimersByTimeAsync(120000);
  expect(mocks.api).toHaveBeenCalledTimes(llamadas);
});
it('ignora muestras anteriores al inicio sin detener una jornada válida', async () => {
  const inicio = Date.now(); mocks.api.mockResolvedValue({ jornada: { id: 'jornada-1', iniciadaEn: inicio, activa: true, expiraEn: inicio + 3600000 } });
  const mod = await import('../../src/mobile/jornada'); await mod.iniciarJornada();
  mocks.add.mock.calls[0][1]({ latitude: 18.4, longitude: -69.9, accuracy: 12, time: inicio - 1000, simulated: false });
  await Promise.resolve(); expect(mocks.api).toHaveBeenCalledTimes(1); expect(mocks.remove).not.toHaveBeenCalled();
  await mod.detenerJornada();
});
it.each([401,403,429,500])('no anuncia jornada detenida por un fallo de envío %s', async status => {
  const mod = await import('../../src/mobile/jornada'); let estado: any; mod.observarJornada(s => { estado = s; });
  await mod.iniciarJornada(); mocks.api.mockRejectedValueOnce(Object.assign(Error('fallo'), {status}));
  mocks.add.mock.calls[0][1]({ latitude:18.4, longitude:-69.9, accuracy:12, time:Date.now(), simulated:false });
  await vi.waitFor(() => expect(estado.error).toBeTruthy()); expect(estado.activa).toBe(true); expect(mocks.remove).not.toHaveBeenCalled();
  await mod.detenerJornada();
});
it('un cierre sin conexión conserva la posibilidad de finalizar en oficina', async () => {
  const mod = await import('../../src/mobile/jornada'); let estado: any; mod.observarJornada(s => {estado=s;}); await mod.iniciarJornada();
  mocks.api.mockRejectedValueOnce(Error('sin red')); await expect(mod.detenerJornada()).rejects.toThrow('oficina');
  expect(estado).toMatchObject({activa:false,pendiente:true});
  await mod.detenerJornada(); expect(mocks.api.mock.calls.filter(c=>c[1]?.accion==='finalizar')).toHaveLength(2);
});
it('sin entrada abierta no solicita permisos ni inicia un sensor', async () => {
  mocks.api.mockResolvedValue({jornada:null}); const mod = await import('../../src/mobile/jornada'); await mod.reconciliarJornada();
  expect(mocks.permiso).not.toHaveBeenCalled(); expect(mocks.add).not.toHaveBeenCalled();
});
it('recupera la jornada del servidor tras reiniciar el módulo', async () => {
  const mod = await import('../../src/mobile/jornada'); await mod.reconciliarJornada();
  expect(mocks.api).toHaveBeenCalledWith('/api/movil/estado'); expect(mocks.add).toHaveBeenCalledTimes(1);
  await mod.reconciliarJornada(); expect(mocks.add).toHaveBeenCalledTimes(1); await mod.detenerJornada();
});
it('compensa un inicio que responde después de que el usuario finaliza', async () => {
  let resolver!: (v:any)=>void; mocks.api.mockImplementationOnce(()=>new Promise(r=>{resolver=r;}));
  const mod=await import('../../src/mobile/jornada'); const inicio=mod.iniciarJornada(); await Promise.resolve();
  await mod.detenerJornada(); resolver({jornada:{id:'tardia',activa:true,expiraEn:Date.now()+3600000}}); await inicio;
  expect(mocks.add).not.toHaveBeenCalled(); expect(mocks.api).toHaveBeenCalledWith('/api/movil/estado',{accion:'finalizar',jornadaId:'tardia'});
});
it('recupera el cierre pendiente si el servidor ya tiene otra jornada', async()=>{
  const mod=await import('../../src/mobile/jornada');await mod.iniciarJornada();
  mocks.api.mockRejectedValueOnce(Object.assign(Error('cambió'),{status:409})).mockResolvedValueOnce({jornada:null});
  await mod.detenerJornada(); expect(mocks.api).toHaveBeenCalledWith('/api/movil/estado');
});
