import type { ConfigWeb } from '../../src/services/configWeb.service';
export const configPortada = {
  hero: { modo: 'escena', badge: '', subtitulo: '' },
  whatsapp: { numeros: [], rotacion: false, mensajePredeterminado: 'Hola, necesito un servicio' },
  contacto: { telefono: '+1 (849) 564-6767', email: '', direccion: '', horario: '' },
  estadisticas: { experiencia: { valor: '', etiqueta: '' }, servicios: { valor: '', etiqueta: '' } },
  servicios: Object.fromEntries(['Lavadora', 'Nevera', 'Aire Acondicionado', 'Estufa'].map(tipo => [tipo, { tipoEquipo: tipo, habilitado: true }])),
} as unknown as ConfigWeb;
export const useConfigWeb = () => ({ config: configPortada, loading: false });
