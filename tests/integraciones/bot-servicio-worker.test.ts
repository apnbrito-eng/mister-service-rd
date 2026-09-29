import { expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { crearWorkerServicio, type ConexionWorkerServicio } from '../../api/whatsapp/bot-worker';
async function pedir(env: Record<string, string | undefined>, auth = 'Bearer qa-secret', conexion: ConexionWorkerServicio | null = null) {
  let status = 200, body: unknown;
  const res = { setHeader() {}, status(n: number) { status = n; return this; }, json(v: unknown) { body = v; return this; } };
  await crearWorkerServicio(conexion, env)({ method: 'GET', headers: { authorization: auth } } as VercelRequest, res as VercelResponse);
  return { status, body };
}
it('sin secreto o credencial equivocada rechaza antes de leer datos', async () => {
  expect((await pedir({})).status).toBe(401);
  expect((await pedir({ CRON_SECRET: 'otro' })).status).toBe(401);
});
it('ambas autorizaciones externas son explícitas y conexión ausente falla cerrada', async () => {
  const env = { CRON_SECRET: 'qa-secret', BOT_SERVICIO_ENABLED: 'true' };
  expect((await pedir(env)).body).toEqual({ estado: 'desactivado', procesados: 0 });
  expect((await pedir({ ...env, ALLOW_EXTERNAL_SENDS: 'true' })).status).toBe(503);
});
it('config runtime desactivada no consulta trabajos', async () => {
  const pendientes = vi.fn();
  const conexion = { config: async () => ({ habilitado: false }), pendientes, dependencias: { permitirExternos: true } } as unknown as ConexionWorkerServicio;
  expect((await pedir({ CRON_SECRET: 'qa-secret', BOT_SERVICIO_ENABLED: 'true', ALLOW_EXTERNAL_SENDS: 'true' }, 'Bearer qa-secret', conexion)).body).toEqual({ estado: 'desactivado', procesados: 0 });
  expect(pendientes).not.toHaveBeenCalled();
});
