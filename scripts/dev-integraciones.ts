/** Servidor local opt-in. Solo sirve las rutas listadas; no envía mensajes. */
import { createServer } from 'node:http';
import { loadEnv } from 'vite';
import type { VercelRequest, VercelResponse } from '@vercel/node';
const env = loadEnv('development', process.cwd(), '');
for (const key of ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY', 'ANTHROPIC_API_KEY', 'META_ADS_ACCESS_TOKEN']) if (env[key]) process.env[key] = env[key];
if (!process.env.FIREBASE_PRIVATE_KEY && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  const { initializeApp, applicationDefault } = await import('firebase-admin/app');
  initializeApp({ projectId: env.VITE_FIREBASE_PROJECT_ID, credential: applicationDefault() });
}
const { default: conocimiento } = await import('../api/ai/conocimiento.js');
const { default: borrador } = await import('../api/ai/borrador.js');
const { default: marketing } = await import('../api/marketing/resumen.js');
const handlers: Record<string, typeof conocimiento> = { '/api/marketing/resumen': marketing, '/api/ai/conocimiento': conocimiento, '/api/ai/borrador': borrador };
createServer(async (req, response) => {
  const url = new URL(req.url || '/', 'http://localhost');
  const handler = handlers[url.pathname];
  response.setHeader('Content-Type', 'application/json');
  if (!handler) { response.writeHead(404); response.end('{"error":"Ruta local no disponible"}'); return; }
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 32000) { response.writeHead(413); response.end('{}'); return; } chunks.push(chunk); }
  const request = Object.assign(req, { body: Buffer.concat(chunks).toString(), query: Object.fromEntries(url.searchParams) });
  const res = Object.assign(response, { status(code: number) { response.statusCode = code; return res; }, json(value: unknown) { response.end(JSON.stringify(value)); return res; }, send(value: string) { response.end(value); return res; } });
  try { await handler(request as VercelRequest, res as unknown as VercelResponse); }
  catch { if (!response.writableEnded) { response.statusCode = 500; response.end('{"error":"Fallo local"}'); } }
}).listen(5174, '127.0.0.1', () => console.log('API local disponible; usa las credenciales del proyecto y exige sesión.'));
