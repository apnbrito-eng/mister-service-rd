import { expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import type { AlmacenServicio } from '../../api/_lib/botServicioPipeline';
import { crearTransporteServicio } from '../../api/_lib/botServicioMeta';
const lease = { id: 'qa', intento: 1, epoch: 0, configVersion: 1, trabajador: 'qa' };
it('pausa antes del transporte impide HTTP aun con una salida preparada', async () => {
  const solicitar = vi.fn();
  const db = { doc: vi.fn() } as unknown as Firestore;
  const almacen = { vigente: vi.fn(async () => false) } as unknown as AlmacenServicio;
  const transporte = crearTransporteServicio(db, almacen, { BOT_SERVICIO_ENABLED: 'true', ALLOW_EXTERNAL_SENDS: 'true', META_ACCESS_TOKEN: 'ficticio', BOT_CENTRAL_PHONE_NUMBER_ID: '123' }, () => 1, solicitar);
  await expect(transporte.enviar(lease, 'Pregunta de prueba', '123')).rejects.toThrow('Envío no autorizado');
  expect(solicitar).not.toHaveBeenCalled(); expect(db.doc).not.toHaveBeenCalled();
});
it('flags ausentes bloquean toda llamada externa', async () => {
  const solicitar = vi.fn();
  const transporte = crearTransporteServicio({} as Firestore, {} as AlmacenServicio, {}, () => 1, solicitar);
  await expect(transporte.enviar(lease, 'Prueba', '123')).rejects.toThrow('Envío desactivado');
  expect(solicitar).not.toHaveBeenCalled();
});
