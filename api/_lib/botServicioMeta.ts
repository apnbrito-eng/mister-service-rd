import type { Firestore } from 'firebase-admin/firestore';
import type { AlmacenServicio, TransporteServicio } from './botServicioPipeline.js';
/** Texto solamente; nunca toma destinatario, URL o credenciales del modelo. Sin reintentos automáticos. */
export function crearTransporteServicio(db: Firestore, almacen: AlmacenServicio, env: Record<string, string | undefined>, reloj = Date.now, solicitar: typeof fetch = fetch): TransporteServicio {
  return { async enviar(l, texto, phoneNumberId) {
    if (env.BOT_SERVICIO_ENABLED !== 'true' || env.ALLOW_EXTERNAL_SENDS !== 'true' || !env.META_ACCESS_TOKEN || env.BOT_CENTRAL_PHONE_NUMBER_ID !== phoneNumberId) throw new Error('Envío desactivado');
    if (!texto.trim() || texto.length > 1000 || !/^\d{1,30}$/.test(phoneNumberId) || !await almacen.vigente(l, reloj())) throw new Error('Envío no autorizado');
    const out = (await db.doc(`whatsapp_mensajes_outbox/bot_${l.id}`).get()).data();
    if (!out || out.estado !== 'queued' || out.texto !== texto || out.phoneNumberId !== phoneNumberId || !/^\d{7,16}$/.test(out.wa_id)) throw new Error('Salida inválida');
    const version = env.META_API_VERSION ?? 'v21.0';
    if (!/^v\d+\.\d+$/.test(version)) throw new Error('Versión Meta inválida');
    const respuesta = await solicitar(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
      method: 'POST', headers: { Authorization: `Bearer ${env.META_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: out.wa_id, type: 'text', text: { body: texto, preview_url: false } }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!respuesta.ok) throw new Error(`Meta rechazó solicitud (${respuesta.status})`);
    const body = await respuesta.json() as { messages?: { id?: string }[] };
    const wamid = body.messages?.[0]?.id;
    if (typeof wamid !== 'string' || !wamid || wamid.length > 256) throw new Error('Respuesta Meta incompleta');
    return { wamid };
  } };
}
