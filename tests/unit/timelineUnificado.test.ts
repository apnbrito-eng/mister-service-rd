import assert from 'node:assert/strict';
import { test } from 'node:test';
import { construirTimelineUnificado } from '../../src/utils/timelineUnificado';
import type { WhatsAppMensajeInbox } from '../../src/types';

function descripcion(contenido: WhatsAppMensajeInbox['contenido'], tipo: WhatsAppMensajeInbox['tipo'] = 'text') {
  const mensaje: WhatsAppMensajeInbox & { _direccion: 'entrante' } = {
    id: 'qa-message', wamid: 'qa-message', phoneNumberId: 'qa-phone',
    wa_id: 'qa-client', from: 'qa-client', conversacionId: 'qa-client',
    tipo, contenido, procesadoBot: false, _direccion: 'entrante',
    timestampMeta: new Date('2026-09-13T14:00:00Z'),
    timestampRecibido: new Date('2026-09-13T14:00:01Z'),
  };
  return construirTimelineUnificado({ historialFases: [], auditoria: [] }, [mensaje])[0].descripcion;
}

test('muestra el texto normalizado del webhook en la ficha de la orden', () => {
  assert.equal(descripcion({ texto: 'Mi lavadora no centrifuga' }), 'Mi lavadora no centrifuga');
});

test('mantiene el respaldo de mensajes históricos con body', () => {
  const legado = { body: 'Mensaje anterior' } as unknown as WhatsAppMensajeInbox['contenido'];
  assert.equal(descripcion(legado), 'Mensaje anterior');
});

test('mantiene el límite del resumen y los indicadores de contenido vacío o multimedia', () => {
  assert.equal(descripcion({ texto: 'a'.repeat(150) }), 'a'.repeat(140) + '…');
  assert.equal(descripcion({}), '(mensaje vacío)');
  assert.equal(descripcion({}, 'audio'), '[audio]');
  assert.equal(descripcion({}, 'image'), '[imagen]');
});
