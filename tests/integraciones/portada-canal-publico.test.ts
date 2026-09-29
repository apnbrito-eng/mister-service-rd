import { expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ addDoc: vi.fn(async () => ({ id: 'qa-cita' })), runTransaction: vi.fn() }));
vi.mock('../../src/firebase/config', () => ({ db: {}, storage: {}, auth: {} }));
vi.mock('firebase/firestore', async () => ({
 ...await vi.importActual<object>('firebase/firestore'),
 doc: vi.fn(() => ({})), collection: vi.fn(() => ({})), query: vi.fn(() => ({})), where: vi.fn(), limit: vi.fn(),
 getDoc: vi.fn(async () => ({ exists: () => false })), getDocs: vi.fn(async () => ({ empty: true, docs: [] })),
 addDoc: mocks.addDoc, runTransaction: mocks.runTransaction,
}));
vi.mock('../../src/services/clientes.service', () => ({ normalizarTelefono: (valor: string) => valor.replace(/\D/g, '') }));
vi.mock('../../src/services/notificaciones.service', () => ({ crearNotificacion: vi.fn() }));
vi.mock('../../src/utils', () => ({ crearRegistroAuditoria: vi.fn() }));
import { parseConfigHero } from '../../src/services/configWeb.service';
vi.mock('../../src/lib/appCheck', () => ({ obtenerAppCheckToken: async () => 'qa-token' }));
import { enviarSolicitudCita } from '../../src/services/formularioAgendar.service';
it('preserva hero CMS explícito y legacy; solo nuevos defaults usan escena', () => {
 expect(parseConfigHero({ modo: 'carrusel', imagenesCarrusel: ['uno','dos'] }).modo).toBe('carrusel');
 expect(parseConfigHero({ modo: 'fija', imagenFija: 'foto' }).imagenFija).toBe('foto');
 expect(parseConfigHero({ imagenUrl: 'legacy' }).modo).toBe('fija');
 expect(parseConfigHero({}).modo).toBe('escena');
 expect(parseConfigHero({ modo: 'escena', imagenFija: 'guardada' }).imagenFija).toBe('guardada');
});
it('envía solicitud al endpoint verificado, sin escritura directa ni rotación interna', async () => {
 const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, whatsappAsignado: '18495646767' }) }));
 vi.stubGlobal('fetch', fetchMock);
 try {
 const resultado = await enviarSolicitudCita({ clienteNombre: 'Prueba QA', telefono: '8090000000', equipoTipo: 'Nevera', falla: 'Mantenimiento: limpieza de equipo' });
 expect(resultado).toMatchObject({ ok: true, whatsappAsignado: '18495646767' });
 expect(mocks.runTransaction).not.toHaveBeenCalled();
 expect(mocks.addDoc).not.toHaveBeenCalled();
 expect(fetchMock).toHaveBeenCalledWith('/api/publico/cita', expect.objectContaining({ headers: expect.objectContaining({ 'X-Firebase-AppCheck': 'qa-token' }) }));
 } finally { vi.unstubAllGlobals(); }
});
