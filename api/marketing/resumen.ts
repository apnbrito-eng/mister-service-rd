import type { VercelRequest, VercelResponse } from '@vercel/node';
import { accesoEquipo, ErrorAcceso } from '../_lib/accesoEquipo.js';
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido.' });
  try {
    const { rol } = await accesoEquipo(req);
    if (!['administrador', 'coordinadora'].includes(rol)) return res.status(403).json({ error: 'Solo administración y coordinación consultan la inversión publicitaria.' });
    const token = process.env.META_ADS_ACCESS_TOKEN;
    if (!token) return res.status(503).json({ error: 'Falta conectar la credencial de anuncios en el servidor. WhatsApp conserva su conexión independiente.' });
    // Alcance fijo del negocio: nunca aceptar un account ID arbitrario del navegador.
    const url = new URL('https://graph.facebook.com/v25.0/act_180693964677323/insights');
    url.searchParams.set('fields', 'campaign_id,campaign_name,spend,impressions,clicks,actions,account_currency,date_start,date_stop');
    url.searchParams.set('date_preset', 'last_30d');
    url.searchParams.set('level', 'campaign');
    url.searchParams.set('limit', '100');
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
    const datos = await response.json() as { error?: { code?: number }; paging?: { next?: string }; data?: Array<Record<string, unknown>> };
    if (!datos || typeof datos !== 'object') throw new Error('Respuesta inválida');
    if (!response.ok || datos.error) return res.status(502).json({ error: 'Meta no permitió consultar los anuncios. Revisa vigencia del acceso y permisos de esta cuenta.', codigoMeta: datos.error?.code });
    return res.json({ cuenta: '180693964677323', periodo: 'Últimos 30 días', consultadoEn: new Date().toISOString(), parcial: Boolean(datos.paging?.next), campanas: (datos.data || []).map((c: Record<string, unknown>) => ({ id: c.campaign_id, nombre: c.campaign_name, gasto: c.spend, impresiones: c.impressions, clics: c.clicks, moneda: c.account_currency, desde: c.date_start, hasta: c.date_stop })) });
  } catch (e) { return res.status(e instanceof ErrorAcceso ? e.status : 503).json({ error: e instanceof ErrorAcceso ? e.message : 'No pudimos consultar Meta. Intenta nuevamente.' }); }
}
