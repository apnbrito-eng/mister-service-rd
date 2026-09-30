# Checklist de publicación coordinada — candidata integral (Claude Code, read-only)

> Actualización de coordinación, 29/09 23:10 RD: Codex recuperó reglas productivas mediante lectura autenticada y verificó ambos hashes contra locks; ver `2026-09-29-permisos-candidato.md`. B1–B4/R1–R3 y contrato App Check del chat corregidos localmente con pruebas. APK 1.0.18 candidata firmada/verificada, sin instalar/publicar. Las referencias de este informe que indiquen esos puntos como pendientes describen su revisión anterior. Infraestructura real y Samsung siguen pendientes.

Fecha: 2026-09-29. Autor: Claude Code (solo lectura, con verificaciones locales `git show` / `shasum` / `unzip -p`). Base: `docs/qa/2026-09-29-candidato-integral.md`, `docs/qa/2026-09-29-permisos-candidato.md`, `docs/qa/2026-09-29-formularios-publicos-seguros.md`, `docs/qa/2026-09-29-apk-oficial-reproducible.md`, `docs/qa/2026-09-29-alcance-correcciones-movil.md`, `docs/qa/2026-09-29-review-final-claude.md`, `docs/qa/2026-09-29-calendarios-solicitudes-claude-code.md`, `docs/qa/2026-09-29-comisiones-devengo-atomico.md`, `docs/qa/2026-09-29-nomina-duplicados-legacy.md`, `docs/qa/2026-09-29-pagos-legacy-conciliacion.md`, `docs/qa/2026-09-29-marketing-conocimiento-claude.md`, `docs/integraciones/ANDROID-PRODUCCION-2026-09-24.md`. No se ejecutaron builds, firmas, tests contra emulador, deploys ni envíos externos. No se editó código, reglas, locks, envs ni datos.

## 1. Hechos verificados y no verificables

### Locks vs repo (verificado con `git show` + `shasum`)
- `firestore.rules.deployed.lock:7-8` apunta a `sha256: 1c69d44db29c945d12d29e6360759a5e6c195b026ab86e50085bed5f183911a8`, deployedAt `2026-09-27T03:43:53Z`. Hash actual del working tree: `6247be7ebefd36515c5e1a88793f911c17983c37717b2c20d081d4eae0f3f9eb` (`shasum -a 256 firestore.rules`, sin secretos) → P-005 activo. Ninguna de las 24 revisiones locales de `firestore.rules` produce el hash `1c69d44…`; el baseline productivo no es reconstruible desde este checkout — se necesita traer el archivo real desde Firebase Console para diff antes del deploy.
- `storage.rules.deployed.lock:7-8` apunta a `sha256: fd605585f7ed45cedb6a618f769b8127fd8c2216f2460b66429491b74485b289`, deployedAt `2026-09-25T01:06:14Z`. Hash actual del working tree: `7741e9031ddfafae7bcbf85e0671441927050af6f2c7298d0a53906301438f51` → P-013 activo. **Confirmado por hash exacto**: `git show 808cc1ececd2425ff314f1837e6f772e3cc5fced:storage.rules | shasum -a 256` devuelve `fd605585…`. Es decir, el lock corresponde exactamente al `storage.rules` que quedó en el commit `808cc1e` (consolidación WT, 2026-09-26). Verificación reproducible por cualquiera con acceso al repo, sin exposición de datos ni secretos. La diferencia entre working tree y lock es el endurecimiento `allow write: if false` para `fotos-equipos-publico/**` y `solicitudes-publico/**` (working tree `storage.rules:35-47`), más los cambios asociados. Cierra la subida SDK anónima.
- El comodín `match /{folder}/{allPaths=**}` autenticado (`storage.rules:67-72`) NO se endurece; SPRINT-138 requiere sprint separado. El working tree lo respeta.

### Lo que este checkout NO permite verificar (queda para el humano con acceso al proyecto)
- Contenido real del `firestore.rules` desplegado (hash `1c69d44…` no está entre las 24 revisiones locales; posible deploy con edición fuera de banda por consola).
- Configuración real de CORS del bucket `mister-service-app-cloude.firebasestorage.app` para `PUT` firmado desde `https://www.misterservicerd.com` con `content-type`, `content-length`, `x-goog-if-generation-match`, `x-goog-meta-permiso-publico`.
- Permiso IAM `iam.serviceAccounts.signBlob` (o `Service Account Token Creator`) sobre la SA que corre las funciones Vercel para emitir `getSignedUrl v4 action:'write'` (`api/publico/subida.ts:33`).
- Valor real en Vercel de `MOBILE_FIREBASE_APP_IDS`, `META_APP_SECRET`, `META_ACCESS_TOKEN`, `META_API_VERSION`, `CRON_SECRET`, `ANTHROPIC_API_KEY`, `BOT_SERVICIO_ENABLED`, `ALLOW_EXTERNAL_SENDS`, `BOT_CENTRAL_PHONE_NUMBER_ID`, `MOBILE_PUSH_ENABLED`, `APP_ENV`.
- Contenido real de `subidas_publicas_config/limites`, `citas_publicas_config/limites`, `solicitudes_publicas_config/limites`. Defaults presentes en `api/_lib/subidaPublica.ts:24`, `api/_lib/citaPublica.ts:18`, `api/_lib/solicitudPublica.ts:60`.
- Existencia y validez de `.env.mobile-production.local` (fuera de git; requerido por `scripts/mobile/build-oficial.mjs:34`).
- Estado real de App Check Play Integrity para `1:342961599729:android:f656156d29ece85719a550` y del SHA256 de firma registrado, según `docs/integraciones/ANDROID-PRODUCCION-2026-09-24.md:10`.
- Bundle web y versionCode/versionName de la APK **realmente instalada en el Samsung**. Solo dispongo del artefacto `/tmp/mister-service-instalado-verificacion.apk` (ver §3), que puede no reflejar lo que corre en el dispositivo hoy.

## 2. Orden concreto de publicación (dependencias explícitas)

El objetivo es NO cerrar la vía anterior de subida pública hasta comprobar que la nueva vía firmada funciona con infraestructura real. Los pasos 3, 4 y 5 quedan bloqueados hasta que las tres primeras validaciones humanas queden verdes.

### Paso A — prerrequisitos externos que no puedo verificar
1. **Vercel envs (producción y preview)** deben tener: `MOBILE_FIREBASE_APP_IDS` con el appId `1:342961599729:android:f656156d29ece85719a550` (y iOS si aplica), `META_APP_SECRET`, `META_ACCESS_TOKEN`, `META_API_VERSION` (o dejar default `v21.0`), `CRON_SECRET`, `ANTHROPIC_API_KEY`. Sin `MOBILE_FIREBASE_APP_IDS`, `api/_lib/appMovilVerificada.ts:8` responde 503 y las rutas gated caen (ver §3 para el nuevo alcance de esas rutas).
2. **IAM en el servicio de Vercel**: la Service Account con la que corre `firebase-admin` en `api/_lib/firebaseAdmin.ts` necesita permiso para firmar (`Service Account Token Creator` o equivalente). Sin esto, `api/publico/subida.ts:33` responde 503 al primer POST del formulario público.
3. **CORS del bucket** debe permitir origen `https://www.misterservicerd.com`, método `PUT`, headers `content-type,content-length,x-goog-if-generation-match,x-goog-meta-permiso-publico`, con exposición razonable de `etag`. Sin CORS el PUT falla en Chrome/Safari sin llegar al servidor. El repo no versiona la configuración CORS del bucket.
4. **Play Integrity + SHA256 firma** para la app oficial ya registrados (según `docs/integraciones/ANDROID-PRODUCCION-2026-09-24.md:10`). Confirmar que el nuevo certificado sigue siendo `d65aec5154307ec45f707402ba180d0f9a22746d7e37dda46886f4950e8ca2cd` (`scripts/mobile/build-oficial.mjs:20`); si se rotó, App Check rechaza tokens y todo lo gated por `exigirAppMovil` cae.

### Paso B — validación in-vivo antes de tocar rules
5. En staging con las reglas actuales (baseline aún desplegado) y las variables/CORS del Paso A aplicadas, ejecutar UNA subida pública firmada extremo a extremo desde `/agendar` con archivo real (JPG o PDF <5 MiB, y también 6 MiB para verificar rechazo). Debe:
   - Recibir HTTP 200 en `POST /api/publico/subida` (acción implícita "reservar").
   - Ejecutar `PUT` firmado a Storage y recibir 200 (no 412 por generación).
   - Recibir HTTP 200 en `POST /api/publico/subida` con `{ accion: 'completar', id }`.
   - Ver el archivo desde `/admin/citas` como autenticado. Ejercita IAM, CORS, `content-length` exacto en la firma (`docs/qa/2026-09-29-formularios-publicos-seguros.md:8`) y el marcador `permiso-publico`.
   Si falla, corregir infraestructura y repetir. NUNCA reabrir subidas anónimas como parche (`docs/qa/2026-09-29-formularios-publicos-seguros.md:30`).
6. Repetir con `/f/:slug` (formulario dinámico) y con `/cita/:calendarId` para cubrir los tres destinos declarados en `api/_lib/subidaPublica.ts:5` (`agendar`, `solicitud`, `calendario`).
7. Confirmar rechazo determinista: SVG (`api/_lib/subidaPublica.ts:MIME_PUBLICOS`), PDF fuera de `campo.tipo==='archivo'`, un segundo `PUT` sobre el mismo permiso (debe fallar por `x-goog-if-generation-match:0` o venir 412 sin marcar el permiso como completo).

### Paso C — publicación coordinada de reglas y frontend
8. Fusionar/entregar el frontend (Vercel) que ya usa `enviarCitaPublicaSegura`, `crearSolicitud` y `subirArchivoPublicoSeguro`. El working tree ya está en ese estado. El deploy web no debe preceder a los pasos B, porque una vez publicada la web las pestañas nuevas envían a los endpoints; si CORS o IAM aún fallan, el formulario público queda inutilizable aunque las rules viejas sigan aceptando SDK directo.
9. Deploy de reglas Firestore: `npm run deploy:rules` (`package.json:11`). Antes, descargar el `firestore.rules` real desde Firebase Console y hacer diff textual contra el working tree (el hash del baseline no aparece entre las 24 revisiones locales). Este deploy activa `esStaff()` como requisito de create en `citas_por_confirmar` (`firestore.rules:295-306`) y `solicitudes_servicio` (`firestore.rules:312-316`) y suma la rule cerrada de `suplidores` (`firestore.rules:1022-1031`). Sin frontend nuevo publicado primero, un visitante con pestaña vieja recibe `permission-denied` silencioso.
10. Deploy de reglas Storage: `npm run deploy:storage-rules` (`package.json:12`). Activa `allow write: if false` en `fotos-equipos-publico/**` y `solicitudes-publico/**` (`storage.rules:35-47`). El endpoint firmado sigue funcionando (bypasea rules); la banda SDK anónima muere. Esta orden 8→9→10 evita ventanas donde el nuevo cliente pide firma sin backend, o donde el nuevo backend cierra la banda vieja mientras aún hay clientes viejos usándola.
11. Registrar los locks solo tras deploy exitoso (los `npm run deploy:*` invocan `marcar-*-deployadas.ts`). No editar locks a mano; los cazadores P-005/P-013 seguirán gritando hasta que el hash coincida (`scripts/invariantes/check-rules-pendientes-deploy.ts`, `scripts/invariantes/check-storage-rules-pendientes-deploy.ts`).

### Paso D — APK oficial candidato 1.0.18
12. Preflight sin generar archivos: `node scripts/mobile/build-oficial.mjs --check --google-services /tmp/mister-android-review-20260928/android/app/google-services.json`. Corrobora certificado, JSON productivo, JDK 21, build-tools 35.0.0 y firma con permisos 0600 (`scripts/mobile/build-oficial.mjs:36-44`). Si el snapshot `/tmp/mister-android-review-*` desapareció, proveer otra copia validada del JSON productivo, nunca la de ensayo.
13. Build aislado: `node scripts/mobile/build-oficial.mjs --build --google-services … --output /tmp/mister-service-oficial-1.0.18-candidata`. El directorio debe no existir. El script fuerza `com.misterservicerd.app`, versionCode 19, versionName 1.0.18 (`scripts/mobile/build-oficial.mjs:21`) y ajusta el `__APP_VERSION__` de `vite.mobile.config.ts:66` (`mobile-production-1.0.17` → `mobile-production-1.0.18`, `build-oficial.mjs:72`). La firma se toma de `~/.codex/private/mister-service-android-produccion` y no se copia al output. **El APK se puede construir hoy sin depender del deploy backend**; su instalación operativa (chat técnico incluido) depende de que Paso C y el hallazgo §3 estén resueltos.
14. Publicar APK como reemplazo del 1.0.17 en `/descargas/mister-service-rd-1.0.18.apk` y actualizar `public/descargas/android.html` en un deploy diferenciado del Paso C, con el mismo `applicationId` y firma para permitir instalación sobre 1.0.17 sin desinstalar. NUNCA borrar datos ni desinstalar como camino de resolución (`docs/qa/2026-09-29-candidato-integral.md:39`).

### Paso E — verificación física
15. Instalar 1.0.18 sobre 1.0.17 en Samsung; confirmar sesión previa preservada, ponche/jornada/GPS, IA/atrás nativo, foto/cámara, y **chat técnico dentro de una orden** (endpoint `/api/movil/chat`, ver §3 y §5). Todo esto queda pendiente de validación humana; el build no la certifica (`docs/qa/2026-09-29-apk-oficial-reproducible.md:40`).

## 3. Compatibilidad con la app 1.0.17 y con la 1.0.18 candidata (evidencia delimitada)

### Fuentes usadas
- Código actual del working tree: `src/mobile/runtime.ts`, `src/services/equipoApi.ts`, `src/mobile/ChatOrdenTecnico.tsx`, `src/mobile/{jornada,notificaciones}.ts`, `src/mobile/useAvisosNativos.ts`.
- Endpoints actuales: `api/movil/estado.ts`, `api/movil/chat.ts`, `api/_lib/appMovilVerificada.ts`, `api/publico/*.ts`.
- `git log 808cc1e..HEAD -- api/movil/` (2 commits: `7082bc5` MOB-1 y `6fdcd43` S7).
- Artefacto local `/tmp/mister-service-instalado-verificacion.apk` (existencia y contenido delimitado con `unzip -p`, sin decompilación; solo lectura de metadatos públicos y strings del bundle web ya público).

### Lo que muestra el artefacto (no equivale a lo que corre en el Samsung)
- `AndroidManifest.xml` (strings UTF-16): `versionName = 1.0.17`, package `com.misterservicerd.app`.
- `assets/capacitor.config.json`: `appId com.misterservicerd.app`, `webDir dist-mobile`, `useLegacyBridge true`.
- `assets/public/version.json`: `{ commit: "bc59269", builtAt: "2026-09-29T02:38:50.787Z" }` — el commit de bundle web coincide con `HEAD` del repo.
- El bundle web incluye la intercepción `fetch` de `runtime.ts` (grep confirma la rama `path === "/api/movil/estado"` + `X-Firebase-AppCheck`) y el consumidor `ChatOrdenTecnico` llamando `Wa(\`/api/movil/chat?...\`)`.

**Conclusión sobre el artefacto:** es un empaquetado con `versionName 1.0.17` pero web bundle del commit HEAD; no puedo afirmar que sea idéntico bit-a-bit a lo instalado en el Samsung. Lo que este artefacto sí demuestra es que el patrón de `runtime.ts` compilado bajo `versionName 1.0.17` tiene la misma lógica de adjuntar AppCheck **solo** a `/api/movil/estado`.

### Contrato por endpoint (working tree HEAD contra clientes en circulación)
- **`/api/movil/estado`** (`api/movil/estado.ts:11`): exige `exigirAppMovil` desde antes. `src/mobile/runtime.ts:18-22` adjunta `X-Firebase-AppCheck` para ese path. Sin regresión de contrato.
- **`/api/movil/chat`** (`api/movil/chat.ts:9`, commit `7082bc5` MOB-1 tras `808cc1e`): **exige `exigirAppMovil` desde este sprint** (contrato nuevo). `src/mobile/runtime.ts:18` solo adjunta AppCheck a `/api/movil/estado`, **no** a `/api/movil/chat`. Efecto tras deploy backend: el chat técnico dentro de una orden (`ChatOrdenTecnico.tsx:11,29`) devolverá `403 "Abre esta función desde la app móvil verificada."` (o `503 "La validación de la app móvil está pendiente de configuración."` si `MOBILE_FIREBASE_APP_IDS` no está). Afecta a cualquier cliente que consuma el endpoint sin haber actualizado `src/mobile/runtime.ts`, incluidos el bundle instalado y el bundle candidato del artefacto examinado.
- **`/api/movil/avisos`**: no encontrado como archivo en `api/movil/`. `useAvisosNativos.ts:32` llama `/api/crm/destino-aviso`, que no invoca `exigirAppMovil`. Sin regresión.
- **`citas_por_confirmar` / `solicitudes_servicio`**: el bundle instalado no escribe directamente esas colecciones desde el móvil técnico (revisar `src/mobile/`); la escritura pública vive en la web marketing. Sin regresión móvil.
- **Storage `fotos-equipos-publico/**` y `solicitudes-publico/**`**: si algún cliente web con bundle previo cacheado intenta la subida directa por SDK anónima, recibirá `storage/unauthorized`. Mitigación existente: `BannerNuevaVersion` **ofrece** botón "Recargar ahora" (`src/components/BannerNuevaVersion.tsx:15-20`, `src/hooks/useVersionCheck.ts`); **no fuerza recarga** y una pestaña vieja abandonada permanece con el bundle en memoria hasta que el usuario recarga o cierra. Por eso el orden 8→10 es prerrequisito, no adorno.
- **Comodín `match /{folder}/{allPaths=**}` autenticado (`storage.rules:67-72`)**: no se endurece. Los técnicos con sesión válida siguen leyendo/escribiendo bajo carpetas no reservadas. Sin regresión visible.
- **`suplidores`** (`firestore.rules:1022-1031`): rules nuevas de cero; el bundle instalado no conoce esa colección; el módulo aparece cuando se despliega el frontend.
- **Cita pública con `calendarioId`** (`api/_lib/citaPublica.ts:105-114`): calendario valida días/horas. Rule pública `calendarios/{docId}` sigue `allow read: if true` (`firestore.rules:269-272`). Compat preservada.

Fuera del hallazgo `/api/movil/chat`, ninguna otra ruta consumida por 1.0.17 desde móvil rompe contrato en HEAD. El hallazgo se puede verificar en cualquier commit ejecutando `grep -n exigirAppMovil api/movil/*.ts` y `grep -nE "movil/(chat|estado)" src/mobile/runtime.ts` — no requiere prueba en producción ni ejecución de la app.

## 4. Cómo comprobar sin datos reales

- **Rules Firestore/Storage**: `npm run test:rules` corre `tests/rules/publico.rules.test.ts` (12/12 según `docs/qa/2026-09-29-permisos-candidato.md:14`), `tests/rules/publico-storage.rules.test.ts` (3/3, `docs/qa/2026-09-29-formularios-publicos-seguros.md:24`) y `tests/rules/suplidores.rules.test.ts` (12/12). Necesita `firebase emulators`. No sube archivos reales.
- **Endpoints server**: los `tests/rules/*-backend.test.ts` (`cita-publica-backend.test.ts`, `solicitud-publica-backend.test.ts`, `subida-publica-backend.test.ts`) ejercen `api/_lib/*` con Firestore emulado; ningún request llega a Meta ni a Google Storage real.
- **Firma v4**: `tests/integraciones/subida-firma-sdk.test.ts` valida que `getSignedUrl` firma `content-length`, `x-goog-if-generation-match` y no duplica `content-type`. Sin golpear Google. Único punto que emula la firma; para probar el `PUT` real hace falta bucket verdadero (Paso B).
- **Regresión determinista**: `npm run check:regression` corre los cazadores en paralelo. En el estado local actual se espera FAIL solamente en P-005 y P-013 (mientras los locks no se sincronicen). **P-023 pasa** con el código actual — comprobado ejecutando `npx tsx scripts/invariantes/check-gate-conduce-pago-verificado.ts` directamente: `status: pass`. Cualquier reporte histórico que lo listara como fallando refleja un estado anterior a la corrección visible en `ProcesarFacturacionModal.tsx:418`.
- **Suite completa**: `npm run test:integraciones`. Última corrida reportada: 725/725 (`docs/qa/2026-09-29-calendarios-solicitudes-claude-code.md:35`). No modifiqué código; no la volví a correr.
- **APK preflight**: `node scripts/mobile/build-oficial.mjs --check …`. Verifica firma, versión, paquete y JSON productivo sin producir binarios. La APK candidata puede construirse hoy con `--build` sin depender del deploy backend; su operación **efectiva** (particularmente `/api/movil/chat`) sí depende.

## 5. Riesgos que bloquean o pueden bloquear el cierre

Ordenados por tipo de bloqueo. NO hay una sola clase de riesgo; en el HEAD actual coexisten:

### Contrato móvil (nuevo, verificado por código)
- **Chat técnico caído tras deploy backend** — `api/movil/chat.ts:9` (`exigirAppMovil`, commit `7082bc5`) vs `src/mobile/runtime.ts:18` (solo adjunta AppCheck a `/api/movil/estado`). El bundle instalado y el bundle candidato del artefacto examinado (§3) llaman a `/api/movil/chat` sin el header. Post-deploy: 403/503. Acción de mitigación no invasiva: publicar deploy backend solo si el mismo release corrige `runtime.ts` para adjuntar `X-Firebase-AppCheck` también cuando el path empiece por `/api/movil/`. Fuera del ownership de este revisor (no toco código en esta pasada).

### Bloqueantes de negocio confirmados por el reviewer independiente (`docs/qa/2026-09-29-review-final-claude.md:6-33`)
- **B1 (en edición concurrente)** — cotización rechazada/borrada deja la orden sin salida para emitir conduce. No verifiqué fix en HEAD; según instrucciones, se está editando en paralelo. Antes de cerrar hay que confirmar que existe una ruta de desvinculación o que el gate acepta el flujo sin cotización.
- **B2 (corregido localmente)** — pagos legacy sin `verificado` ya no quedan huérfanos. `src/utils/pagosConciliacion.ts:11` filtra por `verificado !== true` en la bandeja; `src/services/ordenes.service.ts:1362-1414` (`suscribirPagosPendientes`) los incluye; `ordenes.service.ts:1463` habilita reparación auditada preservando `verificado:false` hasta confirmación explícita. Alineado con `docs/qa/2026-09-29-pagos-legacy-conciliacion.md`. Falta la validación in-vivo que el propio doc menciona ("emulador pendiente", "UI de reparación requiere QA integrado").
- **B3 (corregido localmente)** — `src/utils/comisiones.ts:174-190` resuelve el técnico con unión `getDoc(personal/{tecnicoId})` + `getDocs(where uid==tecnicoId)`, exige coincidencia única y bloquea si hay ambigüedad o ausencia. `registrarComisionPorOrden` reusa el helper (`comisiones.ts:617`). Alineado con `docs/qa/2026-09-29-comisiones-devengo-atomico.md`. Persistencia de defaults por nivel solo se mantiene para persona existente sin porcentaje explícito.
- **B4 (corregido localmente)** — `src/utils/comisiones.ts:622` usa ID canónico `orden_${encodeURIComponent(ordenId)}` dentro de un `runTransaction` que relee orden, persona, fuentes y comisiones legacy (`:626-630`), bloqueando doble creación. La conciliación de duplicados legacy en nómina se resuelve por `docs/qa/2026-09-29-nomina-duplicados-legacy.md`.

### Riesgos importantes del reviewer, estado actualizado
- **R1 (corregido localmente)** — `src/utils/comisiones.ts:647` toma items de la cotización solo si `cot.data().estado === 'aceptada'`, así que borradores/rechazadas no reducen la base del técnico.
- **R2 (en edición concurrente)** — cierre doble de día. No verifiqué el fix en HEAD; queda a cargo del builder responsable.
- **R3 (en edición concurrente)** — dos criterios de día en `CierreDia` (RD vs local). Idem.

### Infraestructura (no verificable local)
- Pasos A.1 a A.4 sin verificar; cualquier falla ahí rompe la banda pública en el momento del deploy y no hay tracing local que lo detecte antes.

### Deuda documentada del anti-regresión en `808cc1e`
- P-015 en `src/services/whatsappInbox.service.ts:172,244,250`; P-019 en `api/whatsapp/audio.ts:23` y `api/whatsapp/media-proxy.ts:77`; P-010 en `src/types/index.ts`. No bloquean build pero el commit ya viajó con `--no-verify`. Si un próximo commit toca esos archivos, pre-commit falla.

### Otros
- **Limpieza de objetos abandonados en Storage** y **retención de docs de cuota** (`subidas_publicas_permisos/**`, `subidas_publicas_cuotas/**`, `citas_publicas_control/**`, `citas_publicas_cuotas/**`, `citas_publicas_alertas/**`, `solicitudes_publicas_control/**`, `solicitudes_publicas_cuotas/**`, `solicitudes_publicas_alertas/**`): sin cron declarado en `vercel.json:16-29`. Deuda explícita en `docs/qa/2026-09-29-formularios-publicos-seguros.md:16`.
- **`__APP_VERSION__` del bundle mobile**: `vite.mobile.config.ts:66` hardcodeado a `mobile-production-1.0.17`. `build-oficial.mjs:72` lo reemplaza en el snapshot antes de compilar. Si alguien corre `npm run mobile:build` sin el script oficial, el bundle sale etiquetado como 1.0.17 aún siendo otro código.
- **`export const config = { api: { bodyParser: false } }` en `api/whatsapp/webhook.ts:58-60`**: mantenido intencionalmente porque el webhook lee raw body por stream para HMAC (documentado en CLAUDE.md).

## 6. Hechos previamente en hipótesis, ahora resueltos

- ~~El lock de Storage `fd605585…` corresponde al `storage.rules` "post-`808cc1e`".~~ **Confirmado por hash** con `git show 808cc1e:storage.rules | shasum -a 256` = `fd605585…`. Reproducible sin datos ni secretos. Ver §1.
- El baseline productivo de `firestore.rules` (hash `1c69d44…`) **sigue sin aparecer** entre las 24 revisiones locales examinadas. Antes del Paso C.9 se necesita comparar contra la copia real descargada de Firebase Console.

## 7. Fallos concretos con archivo/línea que sí bloquean si no se ordenan

- `firestore.rules` con hash distinto al lock: bloquea pre-commit por P-005 hasta ejecutar `npm run deploy:rules` (`firestore.rules.deployed.lock:7`).
- `storage.rules` con hash distinto al lock: bloquea pre-commit por P-013 hasta ejecutar `npm run deploy:storage-rules` (`storage.rules.deployed.lock:7`).
- Contrato roto `/api/movil/chat` — `api/movil/chat.ts:9` vs `src/mobile/runtime.ts:18`. Sin reparar, el chat técnico móvil deja de funcionar apenas se despliegue el backend. No es un cazador automatizado hoy; verificable con `grep -nE "movil/(chat|estado)" src/mobile/runtime.ts` + `grep -n exigirAppMovil api/movil/*.ts`.

`npm run build` sigue funcionando en el estado actual del working tree; los cazadores corren en pre-commit, no en build. El typecheck de `api/` y `scripts/` (parte de `npm run build`) es coherente con `tsconfig.api.json`.

## 8. Explícitamente NO recomendado

- No cerrar la vía anónima directa de Storage hasta haber comprobado el `PUT` firmado en el Paso B contra bucket real. El endurecimiento del comodín autenticado sigue siendo deuda de un sprint aparte (`storage.rules:65-72`), NO parte de esta publicación.
- No editar los locks `firestore.rules.deployed.lock` y `storage.rules.deployed.lock` a mano para "callar" el cazador. Solo `marcar-*-deployadas.ts` los actualiza tras deploy real.
- No desinstalar 1.0.17 ni borrar datos del Samsung para resolver incompatibilidad; siempre update in-place con misma firma (`docs/qa/2026-09-29-candidato-integral.md:39`).
- No enviar mensajes reales (WhatsApp o push) durante la validación. Los flags `BOT_SERVICIO_ENABLED`, `ALLOW_EXTERNAL_SENDS`, `MOBILE_PUSH_ENABLED` gobiernan la vía externa; mantenerlos en `false` mientras se valida.
- No confiar en que `BannerNuevaVersion` cierre solo el problema de bundles viejos cacheados en pestañas — **ofrece** botón "Recargar ahora" (`src/components/BannerNuevaVersion.tsx:15-20`) pero no fuerza recarga; una pestaña olvidada sigue corriendo el bundle anterior indefinidamente.

## Firma

Este documento resume lo observable en el checkout `integraciones-marketing-conocimiento-20260915` en su estado local sin cambios. Verificaciones ejecutadas en esta pasada:
- `shasum -a 256 firestore.rules storage.rules` (hashes actuales del working tree).
- `git show 808cc1e:storage.rules | shasum -a 256` (baseline Storage — coincide con lock).
- `npx tsx scripts/invariantes/check-gate-conduce-pago-verificado.ts` (P-023 pasa).
- `unzip -p /tmp/mister-service-instalado-verificacion.apk assets/{capacitor.config.json,public/version.json,public/index.html}` (metadatos del artefacto sin descompilación).
- Strings UTF-16 del `AndroidManifest.xml` del artefacto para leer `versionName`/package.
- `grep`/lectura de `api/movil/chat.ts`, `api/movil/estado.ts`, `api/_lib/appMovilVerificada.ts`, `src/mobile/runtime.ts`, `src/services/equipoApi.ts`, `src/mobile/ChatOrdenTecnico.tsx`.

Los pasos externos (IAM, CORS, envs Vercel, App Check productivo, contenido real del `firestore.rules` desplegado, bundle real del Samsung) NO pueden verificarse desde este entorno y quedan como responsabilidad humana antes del Paso C. Ningún cambio a código, rules, locks, envs, datos o infra. Ningún envío externo.
