#!/usr/bin/env node
/** Candidata oficial aislada. Por defecto verifica; --build compila, nunca instala. */
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, realpathSync } from 'node:fs';
import { resolve, join, relative, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { loadEnv } from 'vite';

const raiz = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const args = process.argv.slice(2);
const construir = args.includes('--build');
const valor = nombre => { const i = args.indexOf(nombre); return i < 0 ? undefined : args[i + 1]; };
const home = process.env.HOME;
const sdk = process.env.ANDROID_HOME || join(home, 'Library/Android/sdk');
const java = process.env.MISTER_JAVA_HOME || join(home, '.codex/deps/mister-mobile/jdk-21.0.12.1+1/Contents/Home');
const firma = process.env.MISTER_SIGNING_DIR || join(home, '.codex/private/mister-service-android-produccion');
const google = valor('--google-services');
const salida = valor('--output');
const certificado = 'd65aec5154307ec45f707402ba180d0f9a22746d7e37dda46886f4950e8ca2cd';
const version = '1.0.22', codigo = 23, paquete = 'com.misterservicerd.app';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const ejecutar = (bin, argumentos, cwd = raiz, env = entorno) => execFileSync(bin, argumentos, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 }).toString();
const entorno = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('VITE_')));
entorno.JAVA_HOME = java; entorno.ANDROID_HOME = sdk;
entorno.PATH = `${java}/bin:${process.env.PATH}`;
function exigir(condicion, mensaje) { if (!condicion) throw new Error(mensaje); }
function verificarCertificado(texto) { exigir(texto.toLowerCase().replaceAll(':', '').includes(certificado), 'Certificado distinto del oficial: abortado.'); }
try {
  exigir(args.every((a, i) => ['--build', '--check', '--google-services', '--output'].includes(a) || ['--google-services', '--output'].includes(args[i - 1])), 'Argumentos desconocidos.');
  exigir(google && existsSync(google), 'Indica --google-services con el JSON productivo existente; no se usa el de ensayo.');
  const firebase = JSON.parse(readFileSync(google, 'utf8'));
  exigir(firebase.project_info?.project_id === 'mister-service-app-cloude' && firebase.client?.some(c => c.client_info?.android_client_info?.package_name === paquete), 'Firebase no coincide con proyecto y paquete oficiales.');
  exigir(existsSync(join(raiz, '.env.mobile-production.local')), 'Falta configuración explícita .env.mobile-production.local.');
  const configuracion = loadEnv('mobile-production', raiz, 'VITE_');
  exigir(configuracion.VITE_MOBILE_STAGE === 'production' && configuracion.VITE_FIREBASE_PROJECT_ID === 'mister-service-app-cloude' && configuracion.VITE_MOBILE_API_ORIGIN === 'https://www.misterservicerd.com' && configuracion.VITE_MOBILE_APPCHECK_DEBUG === 'false', 'Entorno productivo inválido.');
  for (const [k, v] of Object.entries(configuracion)) {
    exigir(!/SECRET|PASSWORD|PRIVATE_KEY/.test(k), 'Se detectó una variable sensible en configuración frontend.');
    entorno[k] = v;
  }
  for (const f of ['bin/java', 'bin/keytool']) exigir(existsSync(join(java, f)), 'Falta JDK 21 configurado.');
  for (const f of ['apksigner', 'zipalign', 'aapt']) exigir(existsSync(join(sdk, 'build-tools/35.0.0', f)), 'Faltan build-tools 35.0.0.');
  for (const f of ['release.jks', 'signing-password.txt']) exigir(existsSync(join(firma, f)) && (statSync(join(firma, f)).mode & 0o077) === 0, 'Firma ausente o con permisos demasiado abiertos.');
  verificarCertificado(ejecutar(join(java, 'bin/keytool'), ['-list', '-alias', 'mister-service', '-keystore', join(firma, 'release.jks'), '-storepass:file', join(firma, 'signing-password.txt')]));
  console.log(`Preflight oficial válido: ${paquete} ${version} / ${codigo}; certificado conservado. No se muestran variables ni contraseñas.`);
  if (construir) {
    exigir(salida && !existsSync(resolve(salida)), '--output debe ser un directorio nuevo, fuera del repositorio.');
    const destino = resolve(salida);
    let ancestro = destino;
    while (!existsSync(ancestro)) ancestro = dirname(ancestro);
    const destinoReal = resolve(realpathSync(ancestro), relative(ancestro, destino));
    const raizReal = realpathSync(raiz);
    exigir(!destinoReal.startsWith(raizReal + '/') && destinoReal !== raizReal, 'El snapshot debe estar fuera del checkout, también al resolver enlaces simbólicos.');
    mkdirSync(destino, { recursive: true, mode: 0o700 });
    const excluidos = new Set(['.git', '.gradle', 'build', 'dist', 'dist-mobile', '.cache', '.vite', 'descargas']);
    const filtro = ruta => !(ruta.includes('/node_modules/') ? ['.git', '.gradle', '.cache'].includes(basename(ruta)) || /\/android\/build(?:\/|$)/.test(ruta) : excluidos.has(basename(ruta))) && !ruta.startsWith(join(raiz, 'android/app/src/main/assets/public')) && !basename(ruta).startsWith('.env') && !/\.(jks|keystore|apk|aab|idsig)$/.test(ruta) && !/ \d+\.[^/]+$/.test(ruta) && basename(ruta) !== 'local.properties' && basename(ruta) !== 'google-services.json';
    // Algunos componentes importan contratos puros compartidos de api/_lib.
    // Copiar sus fuentes permite comprobar el mismo grafo que el checkout.
    for (const nombre of ['src', 'api', 'public', 'config', 'android', 'node_modules', 'package.json', 'package-lock.json', 'index.html', 'vite.mobile.config.ts', 'vite.config.ts', 'tsconfig.json', 'tsconfig.node.json', 'tailwind.config.js', 'postcss.config.js']) {
      if (existsSync(join(raiz, nombre))) cpSync(join(raiz, nombre), join(destino, nombre), { recursive: true, filter: filtro, dereference: true });
    }
    // Snapshot actual; se adapta identidad sólo aquí. Capacitor regenera plugins desde dependencias copiadas.
    const pkg = JSON.parse(readFileSync(join(destino, 'package.json'), 'utf8'));
    delete pkg.scripts['capacitor:sync:after']; delete pkg.scripts['capacitor:update:after'];
    writeFileSync(join(destino, 'package.json'), JSON.stringify(pkg, null, 2));
    const configTS = readFileSync(join(raiz, 'capacitor.config.ts'), 'utf8').replaceAll('com.misterservicerd.tecnicos', paquete).replaceAll('Mister Service · Ensayo', 'Mister Service RD');
    writeFileSync(join(destino, 'capacitor.config.ts'), configTS);
    const gradle = join(destino, 'android/app/build.gradle');
    writeFileSync(gradle, readFileSync(gradle, 'utf8').replaceAll('com.misterservicerd.tecnicos', paquete).replace(/versionCode\s+\d+/, `versionCode ${codigo}`).replace(/versionName\s+"[^"]+"/, `versionName "${version}"`));
    function adaptar(dir) { for (const e of readdirSync(dir, { withFileTypes: true })) { const p = join(dir, e.name); if (e.isDirectory()) adaptar(p); else if (/\.(java|kt|xml)$/.test(p)) writeFileSync(p, readFileSync(p, 'utf8').replaceAll('com.misterservicerd.tecnicos', paquete).replaceAll('Mister Service · Ensayo', 'Mister Service RD')); } }
    adaptar(join(destino, 'android/app/src'));
    cpSync(google, join(destino, 'android/app/google-services.json'));
    const vite = join(destino, 'vite.mobile.config.ts');
    writeFileSync(vite, readFileSync(vite, 'utf8').replace(/mobile-production-\d+\.\d+\.\d+/g, `mobile-production-${version}`));
    const manifiesto = [];
    function registrar(dir) { for (const e of readdirSync(dir, { withFileTypes: true })) { if (['node_modules'].includes(e.name)) continue; const p = join(dir, e.name); if (e.isDirectory()) registrar(p); else manifiesto.push({ path: relative(destino, p), sha256: sha(readFileSync(p)) }); } }
    registrar(destino);
    writeFileSync(join(destino, 'source-manifest.json'), JSON.stringify({ version, codigo, archivos: manifiesto }, null, 2));
    ejecutar(process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit'], destino);
    ejecutar(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--mode', 'mobile-production', '--config', 'vite.mobile.config.ts'], destino);
    ejecutar(process.execPath, ['node_modules/@capacitor/cli/bin/capacitor', 'sync', 'android'], destino);
    ejecutar('./gradlew', [':app:assembleRelease', '--offline', '--no-daemon'], join(destino, 'android'));
    const tools = join(sdk, 'build-tools/35.0.0');
    const unsigned = join(destino, 'android/app/build/outputs/apk/release/app-release-unsigned.apk');
    const aligned = join(destino, 'aligned.apk'), apk = join(destino, `mister-service-rd-${version}-candidata.apk`);
    ejecutar(join(tools, 'zipalign'), ['-p', '-f', '4', unsigned, aligned]);
    // La clave oficial utiliza la contraseña del almacén. apksigner consume
    // otra línea si se pasa el mismo archivo también como --key-pass.
    ejecutar(join(tools, 'apksigner'), ['sign', '--ks', join(firma, 'release.jks'), '--ks-key-alias', 'mister-service', '--ks-pass', `file:${join(firma, 'signing-password.txt')}`, '--out', apk, aligned]);
    const verificacion = ejecutar(join(tools, 'apksigner'), ['verify', '--verbose', '--print-certs', apk]);
    verificarCertificado(verificacion);
    const identidad = ejecutar(join(tools, 'aapt'), ['dump', 'badging', apk]).split('\n')[0];
    exigir(identidad.includes(`name='${paquete}'`) && identidad.includes(`versionCode='${codigo}'`) && identidad.includes(`versionName='${version}'`), 'APK final tiene identidad incorrecta.');
    let recursos = 0;
    function comprobarRecursos(dir) { for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) comprobarRecursos(p);
      else {
        const ruta = relative(join(destino, 'dist-mobile'), p);
        const empaquetado = execFileSync('/usr/bin/unzip', ['-p', apk, `assets/public/${ruta}`], { maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
        exigir(sha(empaquetado) === sha(readFileSync(p)), `Recurso empaquetado distinto: ${ruta}`); recursos++;
      }
    } }
    comprobarRecursos(join(destino, 'dist-mobile'));
    exigir(!ejecutar('/usr/bin/unzip', ['-Z1', apk]).split('\n').some(p => /\.(apk|aab)$/i.test(p)), 'El APK contiene instaladores anidados.');
    console.log(`${recursos} recursos comparados byte a byte.`);
    writeFileSync(join(destino, 'verification.txt'), `${identidad}\n${verificacion}\nSHA256 APK: ${sha(readFileSync(apk))}\n`);
    console.log(`Candidata verificada: ${apk}. Sin instalar ni publicar; requiere servidor compatible y prueba física.`);
  }
} catch (error) {
  // No imprimir stdout/stderr de procesos: podrían contener configuración local.
  console.error(error?.status !== undefined ? `Falló herramienta de compilación (código ${error.status}). Snapshot preservado; revisar localmente sin divulgar secretos.` : error.message);
  process.exitCode = 1;
}
