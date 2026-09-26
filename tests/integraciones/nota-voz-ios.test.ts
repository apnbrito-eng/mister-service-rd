import { act, create } from 'react-test-renderer';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ stopTrack: vi.fn(), send: vi.fn(), upload: vi.fn(), native: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => 'ios' }, registerPlugin: () => ({ start: mocks.native }) }));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }));
vi.mock('../../src/services/equipoApi', () => ({ equipoApi: mocks.upload }));
vi.mock('../../src/services/whatsapp.service', () => ({ enviarMedia: mocks.send }));
import NotaVoz from '../../src/components/inbox/NotaVoz';
class Recorder {
  static isTypeSupported(m: string) { return m === 'audio/mp4'; }
  state = 'inactive'; ondataavailable?: (e: {data: Blob}) => void; onstop?: () => void;
  start() { this.state = 'recording'; }
  stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['test'], {type:'audio/mp4'}) }); this.onstop?.(); }
}
beforeEach(() => {
 vi.clearAllMocks(); vi.useFakeTimers({toFake:['setInterval','clearInterval','setTimeout','clearTimeout','performance']});
 vi.stubGlobal('MediaRecorder', Recorder);
 vi.stubGlobal('navigator', {mediaDevices:{getUserMedia:vi.fn().mockResolvedValue({getTracks:()=>[{stop:mocks.stopTrack}]})}});
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('Grabación compatible con iOS', () => {
 it('muestra progreso, detiene y ofrece escuchar sin enviar automáticamente', async () => {
  let ui: ReturnType<typeof create>;
  await act(async()=> { ui=create(createElement(NotaVoz,{waId:'2025550100',disabled:false})); });
  await act(async()=> { await ui!.root.findByProps({'aria-label':'Grabar nota de voz'}).props.onClick(); });
  expect(mocks.native).not.toHaveBeenCalled();
  await act(async()=> { await vi.advanceTimersByTimeAsync(2200); });
  expect(ui!.root.findByProps({role:'timer'}).children.join('')).toBe('0:02');
  await act(async()=> { ui!.root.findByProps({'aria-label':'Detener y escuchar grabación'}).props.onClick(); });
  expect(ui!.root.findByType('audio').props.controls).toBe(true);
  expect(mocks.stopTrack).toHaveBeenCalled(); expect(mocks.send).not.toHaveBeenCalled(); expect(mocks.upload).not.toHaveBeenCalled();
  act(()=>ui!.unmount());
 });
});
