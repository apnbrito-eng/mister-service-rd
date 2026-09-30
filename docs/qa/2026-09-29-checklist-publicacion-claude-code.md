# Checklist de publicación coordinada — candidata integral (Claude Code, read-only)

Fecha: 2026-09-29. Autor: Claude Code (solo lectura). Base: `docs/qa/2026-09-29-candidato-integral.md`, `docs/qa/2026-09-29-permisos-candidato.md`, `docs/qa/2026-09-29-formularios-publicos-seguros.md`, `docs/qa/2026-09-29-apk-oficial-reproducible.md`, `docs/qa/2026-09-29-alcance-correcciones-movil.md`, `docs/qa/2026-09-29-review-final-claude.md`, `docs/qa/2026-09-29-calendarios-solicitudes-claude-code.md`, `docs/qa/2026-09-29-marketing-conocimiento-claude.md`, `docs/integraciones/ANDROID-PRODUCCION-2026-09-24.md`, y la lectura del árbol local. No se ejecutaron builds, tests, firmas, ni operaciones externas. No se editó código, reglas, locks, envs ni datos.

## 1. Hechos verificados y no verificables

### Locks vs repo (lo que sí se ve local)
- `firestore.rules.deployed.lock` (`firestore.rules.deployed.lock:7-8`) apunta a `sha256: 1c69d44db29c945d12d29e6360759a5e6c195b026ab86e50085bed5f183911a8`, deployedAt `2026-09-27T03:43:53Z`. `docs/qa/2026-09-29-permisos-candidato.md:19-21` reporta hash actual `6247be7…` distinto → P-005 activo. Buscando entre 24 revisiones locales, no se encontró un `firestore.rules` histórico cuyo SHA-256 coincida con el registrado en el lock; **no se puede reconstruir el baseline exacto de producción desde este checkout**. No inventar diff.
- `storage.rules.deployed.lock` (`storage.rules.deployed.lock:7-8`) apunta a `sha256: fd605585…`, deployedAt `2026-09-25T01:06:14Z`. `docs/qa/2026-09-29-permisos-candidato.md:21` reporta hash actual `7741e903…` distinto → P-013 activo. Según indicación de coordinación (Jorge), el hash del lock corresponde al `storage.rules` inmediatamente posterior al commit `808cc1e` (`storage.rules` con solo `crm-private` protegido, subidas públicas por SDK con MIME/tamaño). El working tree ya introduce `allow write: if false` para `fotos-equipos-publico/**` y `solicitudes-publico/**`; la publicación cambia el contrato para visitantes.
- El comodín `match /{folder}/{allPaths=**}` autenticado (`storage.rules:67-72`) NO se endurece: staff conserva subida por SDK a paths no reservados. Regla explícita de SPRINT-138 (no tocarlo sin sprint de seguridad separado). El working tree lo respeta.

### Lo que este checkout no permite verificar
- SHA-256 exacto del baseline productivo desplegado (no está en repo; el lock guarda solo hash).
- Configuración real de CORS del bucket `mister-service-app-cloude.firebasestorage.app` para `PUT` firmado desde `https://www.misterservicerd.com` con `content-type`, `content-length`, `x-goog-if-generation-match`, `x-goog-meta-permiso-publico`.
- Permiso IAM `iam.serviceAccounts.signBlob` (o `Service Account Token Creator`) sobre la SA que corre las funciones Vercel para poder emitir `getSignedUrl v4 action:'write'` en `api/publico/subida.ts:33`.
- Valor real en Vercel de `MOBILE_FIREBASE_APP_IDS`, `META_APP_SECRET`, `META_ACCESS_TOKEN`, `META_API_VERSION`, `CRON_SECRET`, `ANTHROPIC_API_KEY`, `BOT_SERVICIO_ENABLED`, `ALLOW_EXTERNAL_SENDS`, `BOT_CENTRAL_PHONE_NUMBER_ID`, `MOBILE_PUSH_ENABLED`, `APP_ENV`.
- Contenido real de `subidas_publicas_config/limites`, `citas_publicas_config/limites`, `solicitudes_publicas_config/limites`. El código tiene defaults (`api/_lib/subidaPublica.ts:24`, `api/_lib/citaPublica.ts:18`, `api/_lib/solicitudPublica.ts:60`) pero acepta override desde Firestore.
- Existencia y validez de `.env.mobile-production.local` (fuera de git; `scripts/mobile/build-oficial.mjs:34` la exige para candidato oficial).
- Estado real de App Check Play Integrity para `1:342961599729:android:f656156d29ece85719a550` y del SHA256 de firma registrado, según `docs/integraciones/ANDROID-PRODUCCION-2026-09-24.md:10`.

## 2. Orden concreto de publicación (dependencias explícitas)

El objetivo es NO cerrar la vía anterior de subida pública hasta comprobar que la nueva vía firmada funciona con infraestructura real. Los pasos 3, 4 y 5 quedan bloqueados hasta que las tres primeras validaciones humanas queden verdes.

### Paso A — prerrequisitos externos que no puedo verificar
1. **Vercel envs (producción y preview)** deben tener: `MOBILE_FIREBASE_APP_IDS` con el appId `1:342961599729:android:f656156d29ece85719a550` (y iOS si aplica), `META_APP_SECRET`, `META_ACCESS_TOKEN`, `META_API_VERSION` (o dejar default `v21.0`), `CRON_SECRET`, `ANTHROPIC_API_KEY`. Sin `MOBILE_FIREBASE_APP_IDS`, `api/_lib/appMovilVerificada.ts:8` responde 503 y la app 1.0.17 no hace ponche, jornada, ni registra dispositivos.
2. **IAM en el servicio de Vercel**: la Service Account con la que corre `firebase-admin` en `api/_lib/firebaseAdmin.ts` necesita permiso para firmar (`Service Account Token Creator` o equivalente). Sin esto, `api/publico/subida.ts:33` responde 503 al primer POST del formulario público.
3. **CORS del bucket** debe permitir origen `https://www.misterservicerd.com`, método `PUT`, headers `content-type,content-length,x-goog-if-generation-match,x-goog-meta-permiso-publico`, con exposición razonable de `etag`. Sin CORS el PUT falla en Chrome/Safari sin llegar al servidor. El repo no versiona la configuración CORS del bucket.
4. **Play Integrity + SHA256 firma** para la app oficial ya registrados (según `docs/integraciones/ANDROID-PRODUCCION-2026-09-24.md:10`). Confirmar que el nuevo certificado sigue siendo `d65aec5154307ec45f707402ba180d0f9a22746d7e37dda46886f4950e8ca2cd` (`scripts/mobile/build-oficial.mjs:20`); si se rotó, App Check rechaza tokens y todo lo gated por `exigirAppMovil` cae.

### Paso B — validación in-vivo antes de tocar rules
5. En un entorno de staging con las reglas actuales (baseline aún desplegado) y las variables/CORS del Paso A ya aplicadas, ejecutar UNA sola subida pública firmada extremo a extremo desde el formulario `/agendar` con archivo real (JPG o PDF <5 MiB, y también un caso de 6 MiB para verificar rechazo). Debe:
   - Recibir HTTP 200 en `POST /api/publico/subida` acción implícita (reservar).
   - Ejecutar `PUT` firmado a Storage y recibir 200 (no 412 por generación).
   - Recibir HTTP 200 en `POST /api/publico/subida` con `{ accion: 'completar', id }`.
   - Ver el archivo desde `/admin/citas` como autenticado. Este trayecto ejerce IAM, CORS, tamaño exacto de `content-length` en la firma (`docs/qa/2026-09-29-formularios-publicos-seguros.md:8`) y el marcador `permiso-publico`.
   Si algo falla, corregir la infraestructura y repetir. NUNCA reabrir subidas anónimas como parche (`docs/qa/2026-09-29-formularios-publicos-seguros.md:30`).
6. Repetir con `/f/:slug` (formulario dinámico) y con `/cita/:calendarId` para cubrir los tres destinos declarados en `api/_lib/subidaPublica.ts:5` (`agendar`, `solicitud`, `calendario`).
7. Confirmar rechazo determinista: SVG (`api/_lib/subidaPublica.ts:MIME_PUBLICOS`), PDF fuera de `campo.tipo==='archivo'`, un segundo `PUT` sobre el mismo permiso (debe fallar por `x-goog-if-generation-match:0` o venir 412 sin marcar el permiso como completo).

### Paso C — publicación coordinada de reglas y frontend
8. Fusionar/entregar el frontend (Vercel) que ya usa `enviarCitaPublicaSegura`, `crearSolicitud` y `subirArchivoPublicoSeguro`. El working tree ya está en ese estado. El deploy no debe preceder a los pasos B, porque una vez publicada la web las pestañas nuevas envían a los endpoints; si CORS o IAM aún fallan, el formulario público queda inutilizable aunque las rules viejas sigan aceptando SDK directo.
9. Deploy de reglas Firestore: `npm run deploy:rules` (`package.json:11`). Antes de esto, revisar el diff completo del `firestore.rules` local contra la copia real de producción por consola Firebase (el checkout no contiene el baseline). Este deploy activa `esStaff()` como requisito de create en `citas_por_confirmar` (`firestore.rules:295-306`) y `solicitudes_servicio` (`firestore.rules:312-316`) y suma la rule cerrada de `suplidores` (`firestore.rules:1022-1031`). Sin publicar el frontend nuevo primero, un visitante con pestaña vieja recibe `permission-denied` silencioso.
10. Deploy de reglas Storage: `npm run deploy:storage-rules` (`package.json:12`). Activa `allow write: if false` en `fotos-equipos-publico/**` y `solicitudes-publico/**` (`storage.rules:35-47`). El endpoint firmado sigue funcionando (bypasea rules); la banda SDK anónima muere. Esta orden 8→9→10 evita ventanas donde el nuevo cliente pide firma sin backend, o donde el nuevo backend cierra la banda vieja mientras aún hay clientes viejos usándola.
11. Registrar los locks solo tras deploy exitoso (los `npm run deploy:*` ya invocan `marcar-*-deployadas.ts`). No editar los locks a mano; el cazador P-005/P-013 seguirá gritando hasta que el hash coincida (`scripts/invariantes/check-rules-pendientes-deploy.ts`).

### Paso D — APK oficial candidato 1.0.18
12. Ejecutar preflight sin generar archivos: `node scripts/mobile/build-oficial.mjs --check --google-services /tmp/mister-android-review-20260928/android/app/google-services.json`. Corrobora certificado, JSON productivo, JDK 21, build-tools 35.0.0 y firma con permisos 0600 (`scripts/mobile/build-oficial.mjs:36-44`). Si el snapshot `/tmp/mister-android-review-*` desapareció, proporcionar otra copia validada del JSON productivo, nunca la de ensayo.
13. Build aislado: `node scripts/mobile/build-oficial.mjs --build --google-services … --output /tmp/mister-service-oficial-1.0.18-candidata`. El directorio debe no existir. El script fuerza `com.misterservicerd.app`, versionCode 19, versionName 1.0.18 (`scripts/mobile/build-oficial.mjs:21`) y ajusta el `__APP_VERSION__` de `vite.mobile.config.ts:66` (`mobile-production-1.0.17` → `mobile-production-1.0.18`, `build-oficial.mjs:72`). La firma se toma de `~/.codex/private/mister-service-android-produccion` y no se copia al output.
14. Publicar APK como reemplazo del 1.0.17 en `/descargas/mister-service-rd-1.0.18.apk` y actualizar `public/descargas/android.html` en un deploy diferenciado del Paso C, con el mismo `applicationId` y firma para permitir instalación sobre 1.0.17 sin desinstalar. NUNCA borrar datos ni desinstalar como camino de resolución (`docs/qa/2026-09-29-candidato-integral.md:39`).

### Paso E — verificación física
15. Instalar 1.0.18 sobre 1.0.17 en Samsung; confirmar sesión previa preservada, ponche/jornada/GPS, IA/atrás nativo, foto/cámara. Todo esto queda pendiente de validación humana; el build no la certifica (`docs/qa/2026-09-29-apk-oficial-reproducible.md:40`).

## 3. Compatibilidad con app 1.0.17 ya instalada (contra rules nuevas)

Contra el working tree de rules, revisado camino por camino:

- **Rutas del cliente WhatsApp/inbox y móvil (`/api/movil/estado`, `/api/movil/chat`, `/api/movil/avisos`)**: sin cambios de contrato. `api/movil/estado.ts:11` sigue exigiendo App Check nativo (`X-Firebase-AppCheck`) con `appId ∈ MOBILE_FIREBASE_APP_IDS`. La compilación 1.0.17 ya envía ese header (`src/mobile/runtime.ts:19-21`). Riesgo: si `MOBILE_FIREBASE_APP_IDS` no contiene el appId real productivo (`docs/integraciones/ANDROID-PRODUCCION-2026-09-24.md:6`), la app 1.0.17 responde con "Abre esta función desde la app móvil verificada." (`api/_lib/appMovilVerificada.ts:10`). No es regresión: es prerrequisito del Paso A.
- **Directo a `citas_por_confirmar` desde app 1.0.17**: revisando `src/pages/public/AgendarPage.tsx`, `src/components/public/FormularioAgendarPublico.tsx:491` y `src/services/formularioAgendar.service.ts:170`, hoy el flujo pasa por `enviarCitaPublicaSegura` → `POST /api/publico/cita`. Las escrituras directas a `citas_por_confirmar` que quedan en cliente (`src/pages/Citas.tsx:491`, `src/pages/Facturas.tsx:301`, `src/hooks/useOrdenCreateForm.ts`) están todas en rutas admin (`esStaff()`); pasan las nuevas rules (`firestore.rules:295-306`). Sin regresión para app 1.0.17 (mobile-tech no toca esa colección directamente).
- **Directo a `solicitudes_servicio` desde app 1.0.17**: `src/services/solicitudes.service.ts:46` ya usa el endpoint público; el resto (`src/components/Sidebar.tsx:101`) son lecturas de staff. Cierre pasa las rules nuevas (`firestore.rules:312-316`).
- **Escrituras a Storage `fotos-equipos-publico/**` y `solicitudes-publico/**`**: en 1.0.17 se hacían por SDK directo desde el navegador anónimo. Las nuevas rules las bloquean (`storage.rules:35-47`). Si queda ALGÚN cliente marketing web con bundle viejo cacheado, la subida falla con `storage/unauthorized`. Mitigación: banner de nueva versión (CLAUDE.md → BannerNuevaVersion) fuerza reload; el usuario ve mensaje "Recargar ahora". Aún así se recomienda mantener el orden 8→10 (frontend antes que Storage).
- **Comodín autenticado en Storage**: `storage.rules:67-72` NO se endurece. La app 1.0.17 sigue leyendo/escribiendo con el patrón viejo bajo cualquier carpeta que no sea `crm-private`. No hay regresión visible para el técnico.
- **Rules de `suplidores`**: agregadas de cero (`firestore.rules:1022-1031`). La app 1.0.17 no conoce esa colección; el módulo nuevo solo aparece cuando el frontend se despliega. Antes del deploy de rules, cualquier intento de la app nueva a `suplidores` cae en default-deny.
- **Cita pública con `calendarioId`**: `api/_lib/citaPublica.ts:105-114` valida el calendario y sus días/horas. Rule pública en `calendarios/{docId}` sigue `allow read: if true` (`firestore.rules:269-272`). Compat con app 1.0.17 preservada.

Ninguna de las rutas anteriores exige cambio en el cliente 1.0.17 para seguir funcionando; el riesgo real es dejar 1.0.17 sin la variable `MOBILE_FIREBASE_APP_IDS` o sin App Check válido, que ya venía del pre-existing setup. Nada del sprint actual introduce ruptura silenciosa sobre 1.0.17 mientras se respeten pasos A→C.

## 4. Cómo comprobar sin datos reales

- **Rules Firestore/Storage**: `npm run test:rules` corre `tests/rules/publico.rules.test.ts` (12/12 según `docs/qa/2026-09-29-permisos-candidato.md:14`), `tests/rules/publico-storage.rules.test.ts` (3/3, `docs/qa/2026-09-29-formularios-publicos-seguros.md:24`) y `tests/rules/suplidores.rules.test.ts` (12/12). Necesita `firebase emulators`. No sube archivos reales.
- **Endpoints server**: los `tests/rules/*-backend.test.ts` (`cita-publica-backend.test.ts`, `solicitud-publica-backend.test.ts`, `subida-publica-backend.test.ts`) ejercitan `api/_lib/*` con Firestore emulado; ningún request llega a Meta ni a Google Storage real.
- **Firma v4**: `tests/integraciones/subida-firma-sdk.test.ts` valida que `getSignedUrl` firma `content-length`, `x-goog-if-generation-match` y no duplica `content-type`. No golpea Google. Es el único punto que emula la firma; para probar el PUT real hace falta bucket verdadero (Paso B).
- **Regresión determinista**: `npm run check:regression` corre los 39 cazadores. Se espera FAIL en P-005 y P-013 (mientras los locks no se sincronicen) y en P-023 según `docs/qa/2026-09-29-calendarios-solicitudes-claude-code.md:52`. Ningún otro debería gritar.
- **Suite completa**: `npm run test:integraciones`. Última corrida reportada: 686/686 (`docs/qa/2026-09-29-candidato-integral.md:7`). No modifiqué código; no volví a correrla en esta pasada.
- **APK preflight**: `node scripts/mobile/build-oficial.mjs --check …`. Verifica firma, versión, paquete y JSON productivo sin producir binarios.

## 5. Riesgos confirmados que ya bloquean o pueden bloquear el cierre

- **Bloqueantes de negocio ya escritos por el reviewer independiente** (`docs/qa/2026-09-29-review-final-claude.md:6-33`): B1 orden queda sin salida cuando la cotización se rechaza/borra; B2 pagos legacy sin `verificado` frenan conduce y no aparecen en pagos pendientes; B3 comisión resuelta por `personal/{tecnicoId}` cuando `tecnicoId=auth.uid` cae en fallback (`src/utils/comisiones.ts:251`); B4 doble comisión por carrera. Los cuatro requieren decisión y sprint dedicado antes de considerar al candidato listo para producción productiva de datos reales. No los toco desde esta revisión.
- **Bloqueantes de infraestructura**: pasos A.1 a A.4 sin verificar. Cualquier falla ahí rompe la banda pública en el momento del deploy y no hay tracing local que lo detecte antes.
- **Deuda documentada del anti-regresión** en `808cc1e`: P-015 en `src/services/whatsappInbox.service.ts:172,244,250`; P-019 en `api/whatsapp/audio.ts:23` y `api/whatsapp/media-proxy.ts:77`; P-010 en `src/types/index.ts`. No bloquean build pero el commit ya viajó con `--no-verify`. Si el próximo commit toca esos archivos, el pre-commit falla.
- **Limpieza de objetos abandonados en Storage** y **retención de docs de cuota** (`subidas_publicas_permisos/**`, `subidas_publicas_cuotas/**`, `citas_publicas_control/**`, `citas_publicas_cuotas/**`, `citas_publicas_alertas/**`, `solicitudes_publicas_control/**`, `solicitudes_publicas_cuotas/**`, `solicitudes_publicas_alertas/**`): no hay cron declarado en `vercel.json:16-29` ni política escrita. Costo de Storage y de Firestore crece sin techo declarado; deuda explícita en `docs/qa/2026-09-29-formularios-publicos-seguros.md:16`.
- **`__APP_VERSION__` del bundle mobile**: `vite.mobile.config.ts:66` está hardcodeado a `mobile-production-1.0.17`. El script `build-oficial.mjs:72` lo reemplaza en el snapshot antes de compilar. No es fallo, pero si alguien corre `npm run mobile:build` sin el script oficial, el bundle sale etiquetado como 1.0.17 aún siendo otro código.
- **`export const config = { api: { bodyParser: false } }` en `api/whatsapp/webhook.ts:58-60`**: mantenido intencionalmente porque el webhook lee raw body por stream (`req.on('data')`) para el HMAC. No bloquea build ni causa regresión funcional; CLAUDE.md documenta el patrón.

## 6. Hipótesis pendientes de confirmación (no bloquean si Jorge las valida)

- El lock de Storage `fd605585…` corresponde al `storage.rules` "post-`808cc1e`" (comodín + `crm-private`). No pude verificarlo por SHA-256 en local (no ejecuto `shasum`). Si Jorge confirma, el diff que activa la vía firmada es exactamente lo que reporta `git diff 808cc1e -- storage.rules` en el working tree.
- El baseline productivo de `firestore.rules` (hash `1c69d44…`) no aparece entre 24 revisiones locales examinadas. Puede ser un deploy manual con cambios fuera de banda hechos por consola. Antes del Paso C.9 el reviewer humano debe descargar la copia real de Firebase Console y compararla con el working tree; sin esa comparación no hay garantía de que la única diferencia sean los cambios previstos (`citas_por_confirmar` staff-only, `solicitudes_servicio` staff-only, `suplidores` nuevo).

## 7. Fallos concretos con archivo/línea que sí bloquean si no se ordenan

- `firestore.rules` con hash distinto al lock: bloquea pre-commit por P-005 hasta ejecutar `npm run deploy:rules` (`firestore.rules.deployed.lock:7`).
- `storage.rules` con hash distinto al lock: bloquea pre-commit por P-013 hasta ejecutar `npm run deploy:storage-rules` (`storage.rules.deployed.lock:7`).
- `docs/qa/2026-09-29-calendarios-solicitudes-claude-code.md:53` reporta P-023 gritando en `ProcesarFacturacionModal.tsx`. Si el sprint que lo trajo no ha cerrado, el pre-commit siguiente en ese archivo va a fallar. Fuera del ownership de este revisor.

Nada de lo anterior impide `npm run build` en el estado actual del working tree (los cazadores corren en pre-commit, no en build). El typecheck de `api/` y `scripts/` (parte de `npm run build`) sí correría; los cambios revisados son coherentes con `tsconfig.api.json`.

## 8. Explícitamente NO recomendado

- No cerrar la vía anónima directa de Storage hasta haber comprobado el PUT firmado en el Paso B contra bucket real. El endurecimiento del comodín autenticado sigue siendo deuda de un sprint aparte (`storage.rules:65-72`), NO parte de esta publicación.
- No editar los locks `firestore.rules.deployed.lock` y `storage.rules.deployed.lock` a mano para "callar" el cazador. Solo `marcar-*-deployadas.ts` los actualiza tras deploy real.
- No desinstalar 1.0.17 ni borrar datos del Samsung para resolver incompatibilidad; siempre update in-place con misma firma (`docs/qa/2026-09-29-candidato-integral.md:39`).
- No enviar mensajes reales (WhatsApp o push) durante la validación. Los flags `BOT_SERVICIO_ENABLED`, `ALLOW_EXTERNAL_SENDS`, `MOBILE_PUSH_ENABLED` gobiernan la vía externa; mantenerlos en `false` mientras se valida.

## Firma

Este documento resume lo observable en el checkout `integraciones-marketing-conocimiento-20260915` en su estado local sin cambios; no lo firma un test ejecutado en esta pasada. Los archivos citados existen y se leyeron; los pasos externos (IAM, CORS, envs Vercel, App Check productivo) NO pudieron verificarse desde este entorno y quedan como responsabilidad humana antes del Paso C.
