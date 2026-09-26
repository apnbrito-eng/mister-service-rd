import { it, expect, vi, beforeEach } from 'vitest';
const m = vi.hoisted(() => ({ native: true, photo: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => m.native } }));
vi.mock('@capacitor/camera', () => ({ Camera: { getPhoto: m.photo }, CameraResultType: { Uri: 'uri' }, CameraSource: { Camera: 'CAMERA' } }));
import { capturarFotoNativa } from '../../src/mobile/camara';
beforeEach(() => { vi.clearAllMocks(); m.native = true; });
it('abre exclusivamente cámara, sin galería ni guardado personal', async () => {
  m.photo.mockResolvedValue({ webPath: 'data:image/png;base64,aG9sYQ==', format: 'png' });
  const file = await capturarFotoNativa();
  expect(file.size).toBeGreaterThan(0);
  expect(m.photo).toHaveBeenCalledWith(expect.objectContaining({ source: 'CAMERA', saveToGallery: false, allowEditing: false }));
});
it('fuera de la app no simula una captura nativa', async () => {
  m.native = false; await expect(capturarFotoNativa()).rejects.toThrow(); expect(m.photo).not.toHaveBeenCalled();
});
it('cancelar la cámara no genera evidencia vacía', async () => {
  m.photo.mockRejectedValue(Error('cancelado')); await expect(capturarFotoNativa()).rejects.toThrow('cancelado');
});
