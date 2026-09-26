import { cp, mkdir, readFile, writeFile, access, rm } from 'node:fs/promises';
import path from 'node:path';
const root = process.cwd();
const spm = path.join(root, 'ios/App/CapApp-SPM');
const manifest = path.join(spm, 'Package.swift');
try { await access(manifest); } catch { process.exit(0); }
const original = '../../../node_modules/@capacitor-firebase/app-check';
const unique = '.generated/CapacitorFirebaseAppCheck';
const text = await readFile(manifest, 'utf8');
if (!text.includes(`path: "${original}"`) && !text.includes(`path: "${unique}"`)) throw Error('No se encontró la dependencia local App Check esperada; revisar integración SPM.');
// SwiftPM identifica paquetes por el último componente de su ruta: app-check
// colisiona con google/app-check (AppCheckCore). Conservamos fuentes del plugin
// instalado en una carpeta generada de nombre único, sin modificar node_modules.
const source = path.join(root, 'node_modules/@capacitor-firebase/app-check');
const target = path.join(spm, unique);
// Regenerar solo esta copia derivada evita fuentes obsoletas o duplicadas.
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(path.join(source, 'Package.swift'), path.join(target, 'Package.swift'));
await cp(path.join(source, 'ios'), path.join(target, 'ios'), { recursive: true });
await cp(path.join(source, 'LICENSE'), path.join(target, 'LICENSE'));
await writeFile(manifest, text.replace(`path: "${original}"`, `path: "${unique}"`));
console.log('SwiftPM: App Check nativo separado de AppCheckCore de Google.');
