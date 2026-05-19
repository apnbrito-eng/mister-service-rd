# Postmortem — webhook WhatsApp crasheaba en module-load por import de FieldValue

**Fecha del incidente:** 2026-05-19
**Detectado por:** devops agent en verificación post-deploy del commit `142d4da`
**Severidad:** alta (endpoint público nuevo 100% caído desde primer deploy)
**Patrón asociado:** clase nueva — `imports cross-archivo en api/` no tipechequeados
**Commits relacionados:**
- Introduce: `142d4da` (SPRINT-WA-1 — 2026-05-19 ~12:08 UTC)
- Fix: `50931bb` (SPRINT-WA-1-HOTFIX — 2026-05-19 ~12:50 UTC)

---

## Resumen ejecutivo

El primer deploy del webhook entrante de WhatsApp respondió HTTP 500 `FUNCTION_INVOCATION_FAILED` a todos los métodos porque `api/whatsapp/webhook.ts` intentaba importar `FieldValue` desde `api/_lib/firebaseAdmin.js`, archivo que la usa internamente pero NUNCA la re-exporta. La función crasheaba en module-load antes de ejecutar el handler. El typecheck pre-commit pasó porque el `tsconfig.json` del proyecto NO incluye el directorio `api/`.

---

## Timeline

| Hora UTC | Evento |
|---|---|
| 2026-05-19 12:08 | Push `142d4da` a `main` con SPRINT-WA-1 (webhook + helpers + cazadores P-016/P-017). Pre-commit hook PASS (typecheck + 15 cazadores). |
| 2026-05-19 ~12:37 | Vercel deploya `142d4da` (~30 min de delay por backlog de 4 pushes consecutivos del día). |
| 2026-05-19 ~12:40 | Devops agent verifica endpoint con curl: GET/POST/OPTIONS/PUT todos retornan 500 FUNCTION_INVOCATION_FAILED. |
| 2026-05-19 ~12:42 | Coordinator diagnostica causa raíz: `import { FieldValue, getAdminFirestore } from '../_lib/firebaseAdmin.js'` — `FieldValue` no exportada. |
| 2026-05-19 ~12:43 | Confirmación: `grep '^export.*FieldValue' api/_lib/firebaseAdmin.ts` → sin matches. La línea 5 importa internamente; nunca se re-exporta. |
| 2026-05-19 ~12:45 | Fix aplicado: import directo desde `firebase-admin/firestore`. |
| 2026-05-19 ~12:46 | Push `50931bb` (hotfix). |
| 2026-05-19 ~13:05 | Verificación post-fix Ready (en curso al momento de redactar). |

---

## Impacto

- **Usuarios afectados:** ninguno (el endpoint era nuevo, Jorge aún no había configurado el webhook en Meta Developers).
- **Funcionalidad bloqueada:** el módulo WhatsApp entero (sin webhook entrante no entran mensajes).
- **Tiempo total fuera:** ~30 minutos desde el primer deploy hasta el hotfix pushed. La función nunca llegó a recibir un POST real de Meta porque Jorge no había hecho el binding del webhook todavía.
- **Severidad de negocio:** baja (el endpoint NO estaba binded en Meta), pero severidad técnica ALTA porque el bug era 100% determinístico y bloqueaba el sprint cierre.
- **Pérdida de datos:** ninguna.

---

## Causa raíz (5 porqués)

1. **¿Por qué el endpoint devolvía 500?** Porque crasheaba en module-load.
2. **¿Por qué crasheaba en module-load?** Porque el import `{ FieldValue, getAdminFirestore }` desde `'../_lib/firebaseAdmin.js'` resolvía a un símbolo (`FieldValue`) que no existe en el módulo de destino.
3. **¿Por qué se intentó importar algo que no existe?** Porque al builder le pareció natural traer `FieldValue` desde el mismo wrapper que ofrece `getAdminFirestore`, asumiendo que firebaseAdmin.ts re-exportaba las primitivas de admin SDK. firebaseAdmin.ts SÍ usa FieldValue internamente (línea 5 + línea 177) pero solo lo importa para uso propio.
4. **¿Por qué no lo cazó el pre-commit?** Porque `tsconfig.json` del proyecto raíz incluye únicamente `"src"` (línea 18). El directorio `api/` no está incluido en ningún typecheck del repo. Vercel compila `api/` con su propio tsconfig al deploy time, donde sí se manifiesta el error, pero ya es tarde — el bug llegó a producción.
5. **¿Por qué `api/` no está en el typecheck del repo?** **Causa raíz:** convención histórica del proyecto (Vite + Vercel) — `tsconfig.json` se modeló para frontend (incluye `src`, JSX, DOM libs). Cuando se agregó `api/` (commit GPS antiguo), nadie extendió el tsconfig para cubrirlo porque "Vercel ya lo hace al deploy". Resultado: tenemos un gap del invariante "typecheck pre-commit cubre todo el código que va a producción" y nadie se dio cuenta hasta que un símbolo importado realmente no existía.

---

## Lo que funcionó bien

- **Devops agent en verificación post-deploy.** Habría tomado 24-72h descubrir esto si esperábamos al binding manual de Jorge en Meta — el agente lo cazó en ~3 minutos post-deploy con curl.
- **El bug era determinístico al primer request.** No es un race ni un edge case raro; cualquier llamada al endpoint lo manifestaba. Diagnóstico inmediato una vez se vieron los 500s.
- **Hotfix de 2 líneas.** El bug estaba contenido en el import statement; el resto de la lógica (489 líneas) estaba correcta.
- **Cazadores P-016 + P-017 + 13 anteriores siguieron pasando** post-fix. Los cazadores semánticos sobre patrones (HMAC, idempotency) son ortogonales a errores de resolución de imports — no es su trabajo cazarlos.

---

## Lo que falló

- **`tsconfig.json` NO incluye `api/`.** El typecheck pre-commit es "todo verde" pero solo cubre el frontend. Cualquier bug de tipos o de imports en serverless functions pasa silencioso hasta runtime en Vercel.
- **El builder asumió que el wrapper exporta lo que ya tiene en scope.** Si firebaseAdmin.ts importa `FieldValue` para uso interno, no significa que la re-exporte. La asunción es natural pero NO es la convención del repo.
- **El reviewer no cazó este import** durante el code review. Es difícil — necesitaría correr el grep `^export.*FieldValue` o intentar resolverlo mentalmente. Los reviewers se enfocan en lógica y seguridad, no en cada `import` line.
- **No hay E2E test del endpoint** (el repo no tiene test suite). Un test simple `import('../api/whatsapp/webhook.ts')` habría cazado el crash inmediatamente.

---

## Acciones tomadas (fix inmediato)

- Cambiado el import en `api/whatsapp/webhook.ts:33-34`:
  ```diff
  - import { FieldValue, getAdminFirestore } from '../_lib/firebaseAdmin.js';
  + import { FieldValue } from 'firebase-admin/firestore';
  + import { getAdminFirestore } from '../_lib/firebaseAdmin.js';
  ```
- Commit + push `50931bb`.
- 15/15 cazadores PASS post-hotfix. Typecheck pre-commit PASS (no cambia porque sigue sin chequear `api/`).

---

## Acciones preventivas (para que no vuelva)

- [ ] **Extender typecheck del proyecto a `api/`** — opciones:
  - (A) Agregar `"api"` al `include` del `tsconfig.json` raíz. Riesgo: las libs de DOM ya están en el tsconfig (porque es frontend) y podrían causar choques con `@vercel/node`. Necesita probar.
  - (B) Crear `tsconfig.api.json` con `target: ES2022`, `module: NodeNext`, `moduleResolution: NodeNext`, `include: ["api"]`, sin lib DOM. Agregar al pre-commit hook un step `tsc -p tsconfig.api.json --noEmit`. Más limpio, recomendado.
- [ ] **Sub-regla nueva en CLAUDE.md:** "Cualquier sprint que toque `api/` debe correr `tsc --project tsconfig.api.json --noEmit` antes de marcar COMPLETADO. Si el sprint introduce archivos nuevos en `api/`, validar también que el deploy responde correctamente (no 500 en module-load) ANTES de cerrar."
- [ ] **Cazador opcional P-019:** validar imports resolvables en `api/*`. Demasiado pesado para pre-commit (requeriría parsing AST + resolución), no recomendado. Mejor enforcement vía tsconfig extendido (A o B arriba).
- [ ] **Update al agente builder**: agregar bullet en su prompt "Cuando crees archivos en `api/`, verificá que TODOS los símbolos importados existan como `export` declarado en el archivo de origen (no solo `import` interno). En caso de duda, importá directo desde el paquete original (`firebase-admin/firestore`) en lugar del wrapper local."
- [ ] **Update al agente devops**: pattern "verify endpoint con curl post-deploy" ya está cubierto en el prompt actual — fue lo que cazó este bug. No requiere cambios.

> Este postmortem NO está completo hasta que al menos UNA de las acciones (A) o (B) de typecheck extendido esté implementada. Sin eso, el próximo bug de imports en `api/` se repetirá.

---

## Métricas

- **Tiempo desde introducción hasta detección:** ~32 minutos (12:08 push → 12:40 detección por agente).
- **MTTR (detección hasta fix):** ~6 minutos (12:40 detección → 12:46 push hotfix).
- **Es recurrencia de clase ya catalogada:** **NO — clase nueva.**
  - Proponer al coordinator: P-019 "imports cross-archivo en `api/` no tipechequeados" — pero la solución real es estructural (extender tsconfig), no un cazador grep.

---

## Lecciones aprendidas

- **"El pre-commit pasa" ≠ "todo el código compila".** El typecheck del proyecto no era hermético — cubría `src` pero dejaba `api` desnudo. Cuando una herramienta de calidad tiene cobertura incompleta, eventualmente la línea no cubierta es la que te muere. El sprint estaba "verde" pero faltaba el 30% del código de la base.

- **Los wrappers no transitivamente exportan lo que usan.** Si un archivo importa algo internamente, eso NO está disponible al consumidor del archivo. Es obvio en frío, pero al builder ofuscado en la lógica del HMAC le pareció natural. Fix de hábito: cuando dudás si un símbolo está exportado, hacé `grep '^export.*<simbolo>' <archivo>`. Toma 2 segundos.

- **Verificación E2E post-deploy con curl es barata y altísimamente efectiva.** El agente devops cazó esto en 3 minutos con 4 curls. Cuando un sprint introduce endpoints nuevos, este check debería ser parte del cierre por defecto. Antes de "marcar COMPLETADO", curl el endpoint y verificá los códigos de respuesta.

- **Para el equipo del futuro:** si SPRINT-WA-2 o WA-7 (también `api/`) introducen archivos nuevos, ya sabés el gap. Curláles también. Y si no hicimos (A) o (B) del typecheck extendido todavía, ESTE es el momento.

---

## Referencias

- Sprint: `docs/sprints/BLOQUEOS.md` SPRINT-WA-1 + `docs/sprints/COLA_AUTONOMA.md` entry SPRINT-WA-1 (al momento del postmortem, todavía marcado COMPLETADO con nota del hotfix pendiente).
- Diff del bug: `git show 142d4da:api/whatsapp/webhook.ts | grep -n 'FieldValue'` → línea 33 confirma el import roto.
- Diff del fix: `git show 50931bb`.
- Patrón propuesto pero NO implementado como cazador: tsconfig extendido para `api/` (acción preventiva 1).
