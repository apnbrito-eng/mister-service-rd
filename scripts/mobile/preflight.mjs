import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const faltantes = [];
const command = (bin, args) => { try { return execFileSync(bin, args, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return null; } };
if (!command('xcodebuild', ['-version'])) faltantes.push('iPhone: instalar Xcode completo y seleccionar sus herramientas.');
const sdk = process.env.ANDROID_HOME || `${process.env.HOME}/Library/Android/sdk`;
if (!existsSync(`${sdk}/platforms/android-35`)) faltantes.push('Android: instalar SDK 35 y herramientas de compilación.');
if (!existsSync('android/app/google-services.json')) faltantes.push('Android: registrar app en Firebase de pruebas y añadir google-services.json.');
if (!existsSync('ios/App/App/GoogleService-Info.plist')) faltantes.push('iPhone: registrar app en Firebase de pruebas y añadir GoogleService-Info.plist al proyecto Xcode.');
if (!existsSync('.env.mobile.local')) faltantes.push('Definir backend HTTPS y Firebase de pruebas en .env.mobile.local.');
if (!existsSync('dist-mobile/index.html')) faltantes.push('Compilar el paquete móvil con mobile:build.');
if (existsSync('android/app/google-services.json')) {
  const config = JSON.parse(readFileSync('android/app/google-services.json', 'utf8'));
  const ensayo = JSON.parse(readFileSync('config/mobile.staging.json', 'utf8'));
  if (config.project_info?.project_id !== ensayo.projectId) faltantes.push('Android: configuración Firebase ajena al proyecto de ensayo.');
  if (!config.client?.some(c => c.client_info?.android_client_info?.package_name === 'com.misterservicerd.tecnicos')) faltantes.push('Android: el identificador Firebase no coincide con la app.');
}
console.log(faltantes.length ? `Faltan ${faltantes.length} requisitos locales de preparación:\n- ${faltantes.join('\n- ')}` : 'Requisitos básicos presentes. Falta comprobar firma, permisos, App Check y prueba física.');
process.exitCode = faltantes.length ? 1 : 0;
