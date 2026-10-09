# Portal del Cliente — Evaluación separada atención/técnico (v2)

Autor: Claude Code · Fecha: 2026-10-09 · Branch: `codex/personal-pendientes`
No commiteado · Pruebas no corridas localmente (Codex ejecuta).

## Contexto

Jorge autorizó avanzar el pendiente del §4 del encargo integral (`docs/entregas/CLAUDE-PLAN-INTEGRAL-2026-10-08.md`): dividir la evaluación del Portal del Cliente en dos secciones separadas (atención al cliente vs. servicio técnico) y vincularlas a los participantes reales de la orden usando identificadores de servidor, no suministrados por el cliente.

Restricciones aceptadas en esta pasada:
- Codex trabaja en paralelo carteras/rutas/Personal — no se tocaron rules, types globales (`src/types/index.ts`), dinero, ni los archivos en curso de Codex.
- No se publicó commit ni se desplegaron rules.
- No se envían encuestas, mensajes ni pagos reales.
- Shell local no disponible aquí; Codex corre typecheck/lint/tests.

## Alcance (archivos modificados)

| Archivo | Tipo de cambio |
|---|---|
| `api/_lib/evaluacionServicio.ts` | Extendido: añade `validarEvaluacionV2`, `extraerParticipantes`, tipos. Conserva `validarEvaluacion` v1. |
| `api/feedback/[token].ts` | Importa helpers v2; nueva rama POST que acepta payload v2 y captura participantes dentro de la transacción. Preserva fallback v1 legacy, antiduplicado, `fase === 'cerrado'`, GET privado sin participantes. |
| `src/components/public/EvaluacionServicio.tsx` | Rediseñado con dos bloques independientes (Atención, Técnico). Botón “Prefiero no evaluar” por sección. Validación de completitud por bloque. Envía shape v2. |
| `tests/integraciones/evaluacion-servicio.test.ts` | Vitest ampliado: v1 preservado + casos v2 (una sección, dos secciones, claves extras, scores inválidos) + `extraerParticipantes` (identidad servidor, fallbacks nulos, no inferir de operariaId/responsableId). |
| `tests/ensayo/evaluacion-portal-v2-emulador.test.ts` | Nuevo test de ensayo contra emulador: participantes del doc (no del body), nulos explícitos, antiduplicado concurrente, privacidad del GET (ni UIDs ni notas internas), rechazo de orden abierta y de secciones incompletas, compat v1. |

`src/pages/public/PortalCliente.tsx`: no requiere cambios. El wrapper `FeedbackNPSWrapper` ya reacciona a `yaEnviado && evaluacionServicio` sin importar la versión persistida.

## Shape nuevo (v2) persistido

```jsonc
"evaluacionServicio": {
  "version": 2,
  "escala": 5,
  "atencion": { "puntualidad": 4, "trato": 5, "claridad": 3 } | null,
  "tecnico":  { "puntualidad": 5, "trato": 5, "claridad": 4, "calidad": 5 } | null,
  "comentario": "...",
  "fecha": Timestamp,
  "participantes": {
    "tecnicoUid":  "uid-...  | null",
    "atencionUid": "uid-...  | null",
    "atribucionTecnicoConfiable":  true | false,
    "atribucionAtencionConfiable": true | false
  }
}
```

- `atencion` / `tecnico` son `null` cuando el cliente omite esa sección (al menos una debe venir completa).
- `participantes` siempre está presente. Es la ÚNICA fuente de verdad para atribución post-cierre y se deriva del doc de la orden, no del body del cliente.

### Fuentes de atribución (reglas aceptadas)

| Rol | Fuente del doc | Confianza |
|---|---|---|
| Técnico | `ordenes_servicio/{id}.tecnicoId` | Fiable (invariante sprint-108: `tecnicoId == auth.uid`). |
| Atención | `ordenes_servicio/{id}.metadatosCita.responsableAtencionId` | Fiable (UID explícito introducido 2026-09-29 por el sprint calendarios/solicitudes). |

Deliberadamente NO se usan como fallback:
- `operariaId` / `responsableId`: pueden ser doc.id en órdenes previas al sprint-111 pendiente. “Identidad estable o nada”.
- `creadoPor` (nombre): la regla de Jorge prohíbe inferir atribución por nombre.
- `creadoPorId` para atención: representa a quien creó la orden, no necesariamente al responsable de atención del canal. Se descartó para evitar atribuciones incorrectas en bonos futuros.

Cuando no hay fuente fiable, se persiste `null` + `atribucion*Confiable: false`. Esto es visible y auditable, no silencioso.

## Invariantes preservadas

- **Antiduplicado transaccional**: la rama v2 usa el mismo `runTransaction` + chequeo `data.evaluacionServicio || data.feedback` dentro del callback. Dos envíos concurrentes resuelven 200/409. Cubierto por el test de ensayo `dos envíos simultáneos`.
- **Orden cerrada**: `fase === 'cerrado'` sigue siendo requisito. Rechazo 400 en otras fases.
- **Token**: resolución vía `tokenPortalCliente` o `trackingGPS.token` legacy, re-verificada dentro de la transacción.
- **Validación 1–5**: validadores enteros exclusivos, mismas 4 categorías técnico y 3 atención. No se aceptan fracciones ni strings ni fuera de rango.
- **Lectura de evaluaciones previas**: GET sigue respondiendo `{ yaEnviado: true, evaluacionServicio: true }` para v1 y v2 por igual.

## Privacidad del endpoint público

- GET `/api/feedback/[token]` no expone participantes, UIDs, costos ni notas internas. Sólo `yaEnviado` + flag `evaluacionServicio: true`. Cubierto por el test de ensayo `GET expone yaEnviado SIN filtrar…`.
- POST aceptable aunque el cliente intente inyectar `participantes` en el body: la rama v2 ignora el campo y usa `extraerParticipantes(data)` sobre el doc en Firestore. Cubierto por el test `persiste participantes extraídos del doc (NUNCA del body)`.
- La respuesta POST sólo informa `{ ok: true }` o un código de error semántico; no filtra lo que se escribió.

## Compat & migración

- Documentos v1 preexistentes siguen rindiendo al 100% para el flujo público (yaEnviado idéntico) y para el admin reader (`src/utils/metricasNegocio.ts::calidadServicio`), que lee `evaluacionServicio.categorias`.
- Clientes que todavía envíen el shape v1 (`evaluacion: { puntualidad, trato, claridad, calidad }`) son aceptados y persistidos como `version: 1` con `participantes` capturados igual. Permite ola de deploy escalonada entre web, APK y endpoint. Cubierto por el test `acepta payload v1 legacy`.
- No se migraron documentos existentes.

## Pruebas (preparadas, no corridas aquí)

Codex debe ejecutar:

1. **Unit (Vitest)** — `tests/integraciones/evaluacion-servicio.test.ts`
   - v1: preservado — guardar 4 categorías; rechazar extras/fracciones/strings/fuera de rango/`nps`.
   - v2: aceptar sólo atención, sólo técnico, ambos; rechazar vacío, nulos, claves fuera de `atencion/tecnico`, bloques incompletos, puntajes fuera de rango o fracciones, atención como string o array.
   - `extraerParticipantes`: extrae `tecnicoId` y `metadatosCita.responsableAtencionId`; marca `atribucion*Confiable`; devuelve nulos sin fallback a legacy; ignora whitespace y tipos no-string.
   - Comando sugerido: `npm run test:integraciones`.

2. **Ensayo con emulador (Vitest)** — `tests/ensayo/evaluacion-portal-v2-emulador.test.ts`
   - Participantes capturados del doc, cuerpos inyectados ignorados.
   - Participantes nulos explícitos cuando no hay identidad fiable.
   - Antiduplicado transaccional (200/409 bajo concurrencia).
   - Privacidad del GET: sin UIDs, sin notas internas, sin costos.
   - Rechazo de orden abierta y de bloques incompletos.
   - Compat v1: payload legacy aceptado + participantes capturados.
   - Requiere `FIRESTORE_EMULATOR_HOST=127.0.0.1:8289`. Mock registra `exigirAppCheck` (coincide con la firma real del endpoint).

3. **Typecheck** — `npm run typecheck:api` y `npm run build` (frontend).
4. **Lint** — `npm run lint` sobre los archivos tocados (hook pre-commit usa `--max-warnings 0`).

## QA manual sugerido (para Jorge/Codex)

Golden path y edge cases en navegador móvil:
- [ ] Orden cerrada con `tecnicoId` y `metadatosCita.responsableAtencionId` → ambas secciones evaluables → envío con sólo atención → verificar Firestore: `evaluacionServicio.tecnico === null`, `participantes.atencionUid === <uid real>`, `tecnicoUid === <uid real>`.
- [ ] Mismo flujo pero enviando sólo técnico → verifica `atencion === null`.
- [ ] Enviar ambos → ambas secciones persistidas, participantes capturados.
- [ ] Orden sin `metadatosCita.responsableAtencionId` → UI permite enviar; Firestore guarda `atencionUid: null`, `atribucionAtencionConfiable: false`.
- [ ] Orden sin `tecnicoId` → análogo con `tecnicoUid: null`.
- [ ] Doble submit rápido (dos pestañas) → ambos reciben 200 u 200+409; sólo un doc persistido.
- [ ] Payload adulterado (DevTools, inyectar `participantes` en el body) → ignorado.
- [ ] Vista “Gracias. Tu evaluación quedó registrada.” se mantiene y GET sigue devolviendo payload mínimo (inspeccionar con Network tab).
- [ ] Reabrir el link del portal tras enviar → ya no muestra el formulario.

## Pendientes documentados (follow-up — fuera del alcance de este sprint)

Jorge y Codex deciden si se escalan a `BLOQUEOS.md` o a su propio sprint:

1. **Lector admin `src/utils/metricasNegocio.ts::calidadServicio`**: hoy lee sólo `evaluacionServicio.categorias` (shape v1). Las evaluaciones v2 (sin `categorias`) quedan invisibles para la pantalla `src/pages/Feedback.tsx`. Requiere actualizar `calidadServicio` para:
   - Promediar por lado (atención vs. técnico) de forma separada.
   - Agrupar por `participantes.atencionUid` y `participantes.tecnicoUid` cuando `atribucion*Confiable === true`; dejar grupo “Sin atribución” para los demás (sin inventar nombre).
   - Mantener compat v1 para órdenes históricas.
   - Dependencia tocada: `src/pages/Feedback.tsx` (lectura y copy “no individualmente a la operaria”, línea 240, debe actualizarse para describir las dos agrupaciones).
   - Se dejó fuera porque `src/types/index.ts` y `src/utils/metricasNegocio.ts` no están declarados en el ownership de este sprint (Codex coordina Personal/carteras en paralelo).

2. **Tipo global `OrdenServicio.evaluacionServicio`**: no existe hoy en `src/types/index.ts`. Los lectores lo acceden ad-hoc (`o.datos.evaluacionServicio`) o vía `OrdenCobrosCruda`. Se escaló fuera porque las rules e types globales están vedados en esta pasada.

3. **Fórmula de bono por evaluación**: congelada por decisión de Jorge en §4 (“no alterar fórmula bono por evaluación”). Cualquier recálculo que cruce `participantes.*Uid` debe discutirse antes.

4. **Rule de inmutabilidad para `evaluacionServicio.participantes`**: hoy no hay rule porque Jorge pidió no tocar `firestore.rules`. Riesgo mitigado por el endpoint: cliente nunca puede escribir participantes (POST se derivan server-side; el campo entra dentro del mismo update transaccional). Un admin autenticado sí podría editarlo manualmente — fuera del alcance del portal.

## Rollback

- Revertir los 4 archivos modificados + eliminar los 2 archivos nuevos (una test file + este doc) deja el sistema igual al estado del HEAD actual.
- Documentos v2 persistidos tras el deploy no se descartan al revertir código: `calidadServicio` legacy los ignora (lee sólo `.categorias`). No corrompen la pantalla admin.
- El endpoint v1 que vuelve queda compatible con el UI v1 anterior (no se migraron datos en Firestore).

## Qué NO se probó

- Carga real contra Firestore de producción (no autorizado).
- Flujo de deploy (sin publicar web/APK).
- Comportamiento con App Check “hard” (`APPCHECK_ENFORCE=1`); los tests mockean el verificador.
- Interacción con lectores externos a Mister Service (CRM, BI, dashboards fuera del repo).

## Firma

`Claude Code · 2026-10-09`.

## Revisión independiente Codex — 09/10/2026

✅ Corregido: una cadena `tecnicoId` no demuestra UID Auth. El endpoint ahora lee `usuarios/{id}` dentro de la misma transacción y antes del update; únicamente atribuye candidatos con documento canónico existente. ID legacy de `personal` sin usuario canónico queda nulo y no confiable. También verifica el candidato de atención y no usa identidades suministradas por cliente. Este chequeo acredita identidad, no prueba quién prestó materialmente el servicio; se conserva el dato asignado en la orden.

✅ Validación: 14 pruebas de validadores/atribución pasan; 8 pruebas del endpoint pasan en Firestore local `127.0.0.1:8289`, proyecto `demo-mister-ensayo`. Incluyen UID existente, docId legacy sin usuario, concurrentes200/409, estado no cerrado, privacidad GET y compat v1. App Check sigue mockeado únicamente en ensayo. API typecheck y ESLint scope pasan sin bypass ni suppressions nuevos. No acceso a datos reales, publicación ni cambios de permisos.

Comandos: `npx vitest run --config vitest.integraciones.config.ts tests/integraciones/evaluacion-servicio.test.ts`; `npx firebase emulators:exec --only firestore --project demo-mister-ensayo --config firebase.ensayo.json 'npx vitest run --config /tmp/portal-evaluacion-vitest.config.mjs'`. Config temporal dirige solo `tests/ensayo/evaluacion-portal-v2-emulador.test.ts` con timeouts30s/25s; no modifica firebase.json.

— Codex

## Integración del lector — Codex
✅ Resuelto seguimiento 1: metricasNegocio/Feedback muestran v2 por atención/técnico, solo UID confiable identificado de forma única, secciones omitidas no son cero. V1 histórico general aparte sin atribución individual. 12 tests métricas pasan, incluidos 3 nuevos. 3 tests UI pasan (atención sola, bloqueo parcial/omisión, fallo y reintento). Frontend typecheck/lint pasan. Nómina y NPS no modificados.
— Codex
