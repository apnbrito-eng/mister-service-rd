import { beforeEach, afterEach, it, expect, vi } from 'vitest';
let scripts: Array<{ src: string; remove: ReturnType<typeof vi.fn>; onerror?: () => void }>;
let ventana: Record<string, unknown>;
beforeEach(() => {
  vi.resetModules(); vi.useFakeTimers(); scripts = [];
  ventana = { setTimeout, clearTimeout };
  vi.stubGlobal('window', ventana);
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('document', { getElementById: () => null,
    createElement: () => ({ remove: vi.fn() }), head: { appendChild: (s: typeof scripts[number]) => scripts.push(s) } });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it('comparte la carga concurrente', async () => {
  const { cargarGoogleMaps } = await import('../../src/utils/cargarGoogleMaps');
  const a = cargarGoogleMaps('ficticia'), b = cargarGoogleMaps('ficticia');
  expect(a).toBe(b); expect(scripts).toHaveLength(1);
  ventana.google = { maps: { Map: class {} } };
  (ventana[new URL(scripts[0].src).searchParams.get('callback')!] as () => void)();
  expect(await a).toBe(true);
});
it('rechazo resuelve inmediatamente y no reutiliza Maps rechazado', async () => {
  const { cargarGoogleMaps, estadoGoogleMaps } = await import('../../src/utils/cargarGoogleMaps');
  const a = cargarGoogleMaps('ficticia');
  ventana.google = { maps: { Map: class {} } };
  (ventana.gm_authFailure as () => void)();
  expect(await a).toBe(false); expect(estadoGoogleMaps()).toBe('clave_rechazada');
  expect(await cargarGoogleMaps('ficticia')).toBe(false);
});
it('un rechazo posterior al éxito prevalece sobre la promesa resuelta', async () => {
  const { cargarGoogleMaps, estadoGoogleMaps } = await import('../../src/utils/cargarGoogleMaps');
  const a = cargarGoogleMaps('ficticia');
  ventana.google = { maps: { Map: class {} } };
  (ventana[new URL(scripts[0].src).searchParams.get('callback')!] as () => void)();
  expect(await a).toBe(true);
  (ventana.gm_authFailure as () => void)();
  expect(estadoGoogleMaps()).toBe('clave_rechazada');
  expect(await cargarGoogleMaps('ficticia')).toBe(false);
});
it('elimina el script al vencer; un callback viejo no resuelve el reintento', async () => {
  const { cargarGoogleMaps, estadoGoogleMaps } = await import('../../src/utils/cargarGoogleMaps');
  const a = cargarGoogleMaps('ficticia');
  const viejo = new URL(scripts[0].src).searchParams.get('callback')!;
  await vi.advanceTimersByTimeAsync(15000);
  expect(await a).toBe(false); expect(scripts[0].remove).toHaveBeenCalled();
  const b = cargarGoogleMaps('ficticia');
  (ventana[viejo] as () => void)();
  expect(estadoGoogleMaps()).toBe('cargando');
  scripts[1].onerror!(); expect(await b).toBe(false);
});
