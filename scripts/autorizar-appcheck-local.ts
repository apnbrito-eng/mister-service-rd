/** Ejecutar únicamente tras autorización de Jorge. Credencial solo en .env.local ignorado. */
import { loadEnv } from 'vite';
import { cert } from 'firebase-admin/app';
import { randomUUID } from 'node:crypto';
import { readFileSync, appendFileSync } from 'node:fs';
const env = loadEnv('development', process.cwd(), '');
const cred = env.FIREBASE_PROJECT_ID ? cert({ projectId: env.FIREBASE_PROJECT_ID, clientEmail: env.FIREBASE_CLIENT_EMAIL, privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') }) : null;
const token = env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN || randomUUID();
const oauth = cred ? await cred.getAccessToken() : JSON.parse(readFileSync(process.env.HOME + '/.config/configstore/firebase-tools.json', 'utf8')).tokens;
const projectNumber = env.VITE_FIREBASE_APP_ID.split(':')[1];
const parent = `projects/${projectNumber}/apps/${env.VITE_FIREBASE_APP_ID}`;
const response = await fetch(`https://firebaseappcheck.googleapis.com/v1/${parent}/debugTokens`, { method: 'POST', headers: { Authorization: `Bearer ${oauth.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ displayName: 'Codex local Mister Service 2026-09-15', token }) });
if (!response.ok) { console.log(JSON.stringify({ ok: false, status: response.status })); process.exit(1); }
const result = await response.json() as { name?: string };
if (!readFileSync('.env.local', 'utf8').includes('VITE_FIREBASE_APPCHECK_DEBUG_TOKEN=')) appendFileSync('.env.local', `\nVITE_FIREBASE_APPCHECK_DEBUG_TOKEN=${token}\n`);
console.log(JSON.stringify({ ok: true, recurso: result.name }));
