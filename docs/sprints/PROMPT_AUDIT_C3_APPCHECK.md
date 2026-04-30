# Sprint: C3 audit — App Check enforcement en endpoints serverless

## Hallazgo previo (verificado por devops el 2026-04-30)

**App Check ya está configurado en Firebase Console.** No hace falta
tocar Console — el sprint es 100% código.

```
API firebaseappcheck.googleapis.com:  HABILITADA
Apps registradas:                     1 (web, appId 1:342961599729:web:aa7d3bdb531e530419a550)
Provider:                             reCAPTCHA v3 (siteSecretSet=true, ttl=24h, minScore=0.5)
                                      reCAPTCHA Enterprise (configurado vacio, no activo)
Cliente inicializa App Check:         SI (src/firebase/config.ts:22-41, condicional a VITE_RECAPTCHA_SITE_KEY)
Storage enforcement:                  ENFORCED desde 2026-04-23
Identity Toolkit enforcement:         ENFORCED desde 2026-04-23
Firestore enforcement:                UNENFORCED (monitor) desde 2026-04-17
```

Conclusion del devops: **VITE_RECAPTCHA_SITE_KEY ya está seteada en
Vercel** (de lo contrario login y subida de fotos estarían rotos en
producción). La infra está lista.

## Threat model

Los endpoints `/api/feedback/[token].ts`, `/api/garantia/[token].ts`,
`/api/portal-cliente/[token].ts` son funciones serverless en Vercel,
**no APIs de Google**. App Check enforcement automático no las cubre.
Hoy son endpoints públicos sin auth (gateados solo por token de la
orden), y aceptan cualquier request HTTP de cualquier origen.

Riesgos:
- Scraping masivo del catálogo de órdenes (alguien con un token
  válido puede iterar tokens cercanos buscando colisiones — los
  tokens son 32 chars hex random, así que la probabilidad real es
  baja, pero el endpoint no tiene throttling).
- DoS desde clientes no legítimos (cualquiera puede generar millones
  de requests a `/api/portal-cliente/<token>` con tokens random).
- Costo en Firestore reads (cada request del endpoint dispara 1-2
  reads a `ordenes_servicio` y `personal`).

App Check valida que el request viene de **una app cliente legítima
registrada en Firebase** (con token reCAPTCHA verificado), no de un
script anónimo. Cierra esos vectores.

## Plan revisado (2 fases en commits separados)

### Fase A — soft enforcement (logging sin bloquear)

**Cliente** (`src/`):
- Crear helper `obtenerAppCheckToken()` que llama a
  `getToken(appCheck, false)` y devuelve el JWT (o null si falla).
- En cada `fetch` desde el portal cliente / componente de feedback /
  componente de garantía a los endpoints serverless, agregar header
  `X-Firebase-AppCheck` con el token.
- Si la obtención del token falla en cliente, mandar el request
  igual sin header (en fase A no queremos romper el flujo).

**Server** (`api/`):
- En `api/feedback/[token].ts`, `api/garantia/[token].ts`,
  `api/portal-cliente/[token].ts`:
  - Importar `getAppCheck` de `firebase-admin/app-check`.
  - Leer header `X-Firebase-AppCheck`.
  - Si presente: `await getAppCheck().verifyToken(headerValue)` y
    loggear `{ ok: true, appId: result.appId }`.
  - Si no presente o inválido: loggear `{ ok: false, reason: 'no-token' | 'invalid-token' }`.
  - **NO retornar error.** Continuar con el flujo normal del endpoint.
- Los logs van a Vercel Functions logs. Después de 24-48h se cuentan
  cuántos requests vienen con token vs sin token.

**Validación 24-48h:**
- Métrica esperada: >95% de requests legítimos vienen con token
  válido (el resto son retries antes de que el cliente cargue
  appCheck, o sesiones con bloqueador de scripts).
- Si la métrica está debajo, investigar antes de pasar a fase B.

**Commit message fase A:**
```
feat(audit C3 fase A): soft enforcement App Check en endpoints publicos

Cliente envia header X-Firebase-AppCheck en requests a
/api/feedback, /api/garantia, /api/portal-cliente. Server valida con
firebase-admin/app-check pero NO bloquea — solo loggea con-token vs
sin-token para validar 24-48h antes de pasar a hard enforcement
(fase B, sprint separado).

Cliente:
- Helper obtenerAppCheckToken() en src/lib/appCheck.ts (llama
  getToken(appCheck, false), retorna JWT o null si falla).
- PortalCliente.tsx, FeedbackNPS, GarantiaCliente: agregar header
  cuando hay token disponible. Si no, request sigue sin header
  (en fase A queremos data, no romper flujos).

Server:
- api/feedback, api/garantia, api/portal-cliente: leen header,
  validan con verifyToken, loggean resultado, continuan flujo
  normal sin error.

Sin breaking changes. Logs en Vercel Functions para validacion.
```

### Fase B — hard enforcement (sprint separado, después de validar fase A)

Después de 24-48h con métricas de fase A:

**Server** (`api/`):
- Si header ausente: retornar 401 `{ error: 'app_check_required' }`.
- Si verifyToken falla: retornar 401 `{ error: 'app_check_invalid' }`.
- Si pasa: continuar normal.

Este sprint es de un solo commit, ~30 min:

**Commit message fase B:**
```
feat(audit C3 fase B): hard enforcement App Check en endpoints publicos

Despues de 24-48h en fase A (commit XXXXXXX), las metricas confirman
que >95% de requests legitimos vienen con token App Check valido.
Ahora bloqueamos: requests sin header o con token invalido reciben
401 + mensaje de error.

Cierra el threat model: scraping masivo, DoS, abuso de costos
Firestore desde scripts anonimos. Solo apps cliente legitimas
registradas en Firebase pueden hablar con estos endpoints.

Cambios server-side en api/feedback, api/garantia, api/portal-cliente.
Cliente sin cambios (ya manda header desde fase A).
```

## Investigación previa (antes de arrancar Fase A)

1. **Confirmar `VITE_RECAPTCHA_SITE_KEY` en Vercel.** Si no está,
   activar App Check en cliente está roto silenciosamente.
   (Comando: `vercel env ls --environment=production` o desde Vercel
   Dashboard.)
2. **Leer `src/firebase/config.ts:22-41`** para entender cómo está
   inicializado el provider en cliente y dónde exporta el `appCheck`
   instance.
3. **Confirmar `firebase-admin/app-check` está disponible** — la
   dependencia ya está (porque el resto de los endpoints usan
   firebase-admin), pero `app-check` es un módulo separado:
   `import { getAppCheck } from 'firebase-admin/app-check'`.

## Verificación

**Tester fase A:**
- Abrir `/cliente/<token>` en producción → verificar en Vercel Logs
  que el request tiene `app_check.ok=true` con un `appId` válido.
- Abrir el mismo endpoint con `curl` (sin header) → verificar log
  `app_check.ok=false reason=no-token`. Endpoint sigue respondiendo
  200 con los datos (NO bloquea en fase A).
- Validar contadores agregados al final del periodo (24-48h):
  ratio con-token vs sin-token > 95%.

**Reviewer fase A:**
- Confirmar que el cliente NO loggea el token App Check (es un JWT
  con info de la app — no debería aparecer en `console.log`).
- Confirmar que el `try/catch` alrededor de `getToken` no rompe el
  flujo del componente si falla (UI sigue funcionando aunque no
  pueda mandar el header).
- Confirmar que el endpoint server registra fallos sin exponer el
  token mismo en logs.
- Verificar que el handler usa `getAppCheck()` desde `firebase-admin/app-check`,
  no desde `firebase/app-check` (cliente).

## Alcance estimado

- Fase A: ~2-3 horas. Cliente helper + 3 fetches + 3 endpoints
  server con logging + tester + reviewer.
- Validación 24-48h: tiempo real, sin work activo.
- Fase B: ~30-45 min. Cambiar logging a return 401 + tester +
  reviewer + deploy.

## Dependencias

- `VITE_RECAPTCHA_SITE_KEY` en Vercel (verificar que está).
- `firebase-admin@>=12` (probablemente ya en `package.json`).
- App Check ya configurado en Console (verificado el 2026-04-30).

## Cuándo arrancar

A decisión de Jorge. No hay urgencia — el threat es bajo-medio porque
los tokens son 32 chars hex random (improbable enumeración) y los
endpoints no exponen datos críticos. Pero cierra una superficie
abierta y suma defense-in-depth al portal cliente recién lanzado.

Sugerencia: arrancar fase A en una sesión donde queden 2-3h libres,
pushear, y dejar que la métrica se acumule mientras se trabaja en
otras cosas. Volver a la fase B después.
