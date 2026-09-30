import { describe, expect, it } from 'vitest';
import { extraerTiposEmitidos } from '../../scripts/invariantes/check-tipo-notificacion-huerfano';
describe('detección de emisor transaccional', () => {
  it('reconoce payload de tx.set a notificaciones', () => {
    expect(extraerTiposEmitidos("const payload = { tipo: 'pieza_llego' }; tx.set(doc(db, 'notificaciones', id), payload);", 'src/services/flujo.ts').has('pieza_llego')).toBe(true);
  });
  it('ignora emisor comentado', () => {
    expect(extraerTiposEmitidos("const payload = { tipo: 'pieza_llego' }; // tx.set(doc(db, 'notificaciones', id), payload);", 'src/services/flujo.ts').size).toBe(0);
  });
  it('no considera otra colección un emisor', () => {
    expect(extraerTiposEmitidos("const payload = { tipo: 'pieza_llego' }; tx.set(doc(db, 'piezas', id), payload);", 'src/services/flujo.ts').size).toBe(0);
  });
});
