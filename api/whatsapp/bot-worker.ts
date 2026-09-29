import type { VercelRequest, VercelResponse } from '@vercel/node';
import { timingSafeEqual } from 'node:crypto';
import { ejecutarTrabajoServicio, configEjecucionValida, type DependenciasServicio } from '../_lib/botServicioPipeline.js';
import { getAdminFirestore } from '../_lib/firebaseAdmin.js';
import { crearAlmacenServicio, crearPresupuestoReal, recuperarEfectosVencidos, recuperarTrabajosDesautorizados, RUNTIME_BOT } from '../_lib/botServicioStore.js';
import { crearProveedorServicio } from '../_lib/botServicioAnthropic.js';
import { crearTransporteServicio } from '../_lib/botServicioMeta.js';
import { validarRuntimeSeguro, CONFIG_RUNTIME_INICIAL } from '../_lib/botServicioRuntime.js';

export interface ConexionWorkerServicio {
  config(): Promise<unknown>;
  /** Pendientes ordenados y leases recuperables. No devuelve proveedor_iniciado ni despachando. */
  pendientes(limite: number, ahora: number): Promise<string[]>;
  dependencias: DependenciasServicio;
}
function autorizado(req: VercelRequest, env: Record<string, string | undefined>) {
  const esperado = env.CRON_SECRET ? `Bearer ${env.CRON_SECRET}` : '';
  const recibido = req.headers.authorization;
  return !!esperado && typeof recibido === 'string' && Buffer.byteLength(recibido) === Buffer.byteLength(esperado) && timingSafeEqual(Buffer.from(recibido), Buffer.from(esperado));
}
export function crearWorkerServicio(conexion: ConexionWorkerServicio | null, entorno: Record<string, string | undefined> = process.env) {
  return async (req: VercelRequest, res: VercelResponse) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido.' });
    if (!autorizado(req, entorno)) return res.status(401).json({ error: 'No autorizado.' });
    if (entorno.BOT_SERVICIO_ENABLED !== 'true' || entorno.ALLOW_EXTERNAL_SENDS !== 'true') return res.status(200).json({ estado: 'desactivado', procesados: 0 });
    // La fábrica rechaza conexiones ausentes en lugar de improvisar un transporte.
    if (!conexion) return res.status(503).json({ estado: 'integracion_pendiente', procesados: 0 });
    try {
      const config = await conexion.config();
      if (!configEjecucionValida(config) || !conexion.dependencias.permitirExternos) return res.status(200).json({ estado: 'desactivado', procesados: 0 });
      const ids = await conexion.pendientes(3, conexion.dependencias.reloj());
      if (!Array.isArray(ids) || ids.length > 3 || ids.some(id => !/^[a-f0-9]{64}$/.test(id))) throw new Error('Cola inválida');
      await Promise.all(ids.map(id => ejecutarTrabajoServicio(id, config, conexion.dependencias)));
      const procesados = ids.length;
      return res.status(200).json({ procesados });
    } catch {
      console.error('[bot-worker] operación incompleta');
      return res.status(503).json({ error: 'No se pudo completar el trabajo.' });
    }
  };
}
export const maxDuration = 60;
/** Conectado al cron: solo procesa cuando ambas barreras explícitas están activas. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // La recuperación local continúa apagado; no inicializa ni llama proveedores.
  const env = process.env;
  if (req.method !== 'GET' || !autorizado(req, env)) return crearWorkerServicio(null)(req, res);
  const db = getAdminFirestore();
  const permitir = env.BOT_SERVICIO_ENABLED === 'true' && env.ALLOW_EXTERNAL_SENDS === 'true' && !!env.ANTHROPIC_API_KEY && !!env.META_ACCESS_TOKEN && !!env.BOT_CENTRAL_PHONE_NUMBER_ID;
  try { await recuperarTrabajosDesautorizados(db, Date.now(), permitir); }
  catch { console.error('[bot-worker] fallo de recuperación local'); return res.status(503).json({ error: 'No se pudo recuperar la atención pendiente.' }); }
  if (!permitir) return res.status(200).json({ estado: 'desactivado', procesados: 0 });
  const almacen = crearAlmacenServicio(db, crearPresupuestoReal(db));
  return crearWorkerServicio({
    async config() { const c = validarRuntimeSeguro((await db.doc(RUNTIME_BOT).get()).data() ?? CONFIG_RUNTIME_INICIAL); return c.phoneNumberId === env.BOT_CENTRAL_PHONE_NUMBER_ID ? c : null; },
    async pendientes(limite, ahora) {
      await recuperarEfectosVencidos(db, ahora);
      // @safe-orderby: disponibleMs y leaseHastaMs se escriben al crear todos los trabajos.
      const pendientes = await db.collection('bot_servicio_trabajos').where('estado', '==', 'pendiente').where('disponibleMs', '<=', ahora).orderBy('disponibleMs', 'asc').limit(limite).get();
      if (!pendientes.empty) return pendientes.docs.map(d => d.id);
      // @safe-orderby: leaseHastaMs siempre presente, incluso antes del primer claim.
      const vencidos = await db.collection('bot_servicio_trabajos').where('estado', '==', 'procesando').where('leaseHastaMs', '<=', ahora).orderBy('leaseHastaMs', 'asc').limit(limite).get();
      return vencidos.docs.map(d => d.id);
    },
    dependencias: { almacen, proveedor: crearProveedorServicio(env.ANTHROPIC_API_KEY!), transporte: crearTransporteServicio(db, almacen, env), reloj: Date.now, permitirExternos: true },
  })(req, res);
}
