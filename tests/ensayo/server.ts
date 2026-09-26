import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase-admin/app';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

// No credenciales reales, no dotenv, puertos fijos loopback, proyecto demo.
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9198';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8289';
process.env.FIREBASE_STORAGE_EMULATOR_HOST = '127.0.0.1:9298';
initializeApp({ projectId: 'demo-mister-ensayo', storageBucket: 'demo-mister-ensayo.appspot.com' });
const { default: orden } = await import('../../api/crm/orden');
const { default: cartera } = await import('../../api/crm/cartera');
const { default: atencion } = await import('../../api/crm/atencion');
const { default: bandeja } = await import('../../api/crm/bandeja');
const { default: expediente } = await import('../../api/crm/expediente');
const { default: destinoAviso } = await import('../../api/crm/destino-aviso');
const handlers: Record<string, any> = { '/api/crm/orden': orden, '/api/crm/cartera': cartera, '/api/crm/atencion': atencion, '/api/crm/bandeja': bandeja, '/api/crm/expediente': expediente, '/api/crm/destino-aviso': destinoAviso };

const server = await createServer({
  configFile: false, envFile: false,
  plugins: [{name:'ensayo-modulos', enforce:'pre', transform(_code, id) {
    const clean = id.split('?')[0];
    if (clean === resolve('src/services/storage.service.ts')) return _code.replace('  if (!navigator.geolocation) {', "  onError?.({code:2,message:'GPS simulado no disponible en ensayo',highAccuracy:false}); return Promise.resolve(null);\n  if (!navigator.geolocation) {");
    if (clean === resolve('src/firebase/config.ts')) return readFileSync(resolve('tests/ensayo/firebase.ts'),'utf8');
    if (clean === resolve('src/components/EntornoPruebas.tsx')) return readFileSync(resolve('tests/ensayo/Banner.tsx'),'utf8');
  }}, react(), {
    name: 'ensayo-api-aislada',
    configureServer(server) {
      server.middlewares.use(async (req: any, res: any, next) => {
        // Bloquea conexiones del navegador a servicios externos incluso si alguna pantalla las intenta.
        res.setHeader('Content-Security-Policy', "connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:*; form-action 'self'");
        const url = new URL(req.url || '/', 'http://127.0.0.1:5190');
        if (url.pathname === '/version.json') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({commit:'ensayo-local'})); return; }
        if (!url.pathname.startsWith('/api/')) return next();
        res.setHeader('Content-Type', 'application/json');
        const handler = handlers[url.pathname];
        if (!handler) { res.statusCode = 503; res.end(JSON.stringify({error:'Acción externa no habilitada en el ensayo aislado.'})); return; }
        try {
          let raw = '';
          for await (const part of req) { raw += part; if (raw.length > 1_000_000) throw new Error('Solicitud demasiado grande'); }
          req.body = raw ? JSON.parse(raw) : {};
          req.query = Object.fromEntries(url.searchParams);
          res.status = (code: number) => { res.statusCode = code; return res; };
          res.json = (value: unknown) => { res.end(JSON.stringify(value)); return res; };
          await handler(req, res);
        } catch { res.statusCode = 500; res.end(JSON.stringify({error:'Fallo en el servidor local de ensayo.'})); }
      });
    },
  }],
  define: { __APP_VERSION__: JSON.stringify('ensayo-local') },
  resolve: { alias: [
    { find: /.*\/firebase\/config(?:\.ts)?$/, replacement: resolve('tests/ensayo/firebase.ts') },
    { find: /.*\/components\/EntornoPruebas$/, replacement: resolve('tests/ensayo/Banner.tsx') },
  ] },
  server: {host:'127.0.0.1',port:5190,strictPort:true, watch:{ignored:['**/android/**','**/ios/**','**/dist-mobile/**']}},
});
await server.listen();
server.printUrls();
