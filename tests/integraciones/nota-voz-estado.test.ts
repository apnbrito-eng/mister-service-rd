import { act, create } from 'react-test-renderer';
import { createElement } from 'react';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
const n = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn(), cancel: vi.fn(), level: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => 'android' }, registerPlugin: () => n }));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }));
vi.mock('../../src/services/equipoApi', () => ({ equipoApi: vi.fn() }));
vi.mock('../../src/services/whatsapp.service', () => ({ enviarMedia: vi.fn() }));
import NotaVoz from '../../src/components/inbox/NotaVoz';
beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance'] }); n.start.mockResolvedValue(undefined); n.cancel.mockResolvedValue(undefined); n.level.mockResolvedValue({ active: true, amplitude: 16000 }); });
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });
describe('Estado visible de grabación', () => {
  it('muestra grabando, tiempo y niveles reales; cancelar vuelve al micrófono', async () => {
    let app: ReturnType<typeof create>;
    await act(async () => { app = create(createElement(NotaVoz, { waId: '2025550100', disabled: false })); });
    await act(async () => { await app!.root.findByProps({ 'aria-label': 'Grabar nota de voz' }).props.onClick(); });
    expect(app!.root.findByProps({ role: 'status' }).children).toEqual(['Grabando audio']);
    await act(async () => { await vi.advanceTimersByTimeAsync(2200); });
    expect(app!.root.findByProps({ role: 'timer' }).children.join('')).toBe('0:02');
    expect(n.level).toHaveBeenCalled();
    await act(async () => { await app!.root.findByProps({ 'aria-label': 'Cancelar grabación' }).props.onClick(); });
    expect(n.cancel).toHaveBeenCalled();
    expect(app!.root.findAllByProps({ role: 'timer' })).toHaveLength(0);
    expect(app!.root.findByProps({ 'aria-label': 'Grabar nota de voz' })).toBeTruthy();
    act(() => app!.unmount());
  });
});
