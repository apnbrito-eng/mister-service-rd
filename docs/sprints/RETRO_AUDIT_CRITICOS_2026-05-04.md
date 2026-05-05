# Retrospectiva — Sprint Críticos Post-Audit (4 de 5 ejecutados)

**Fecha:** 2026-05-04
**Sprint:** Críticos Post-Audit (C1–C5)

## Contexto

C1, C3, C4, C5 desplegados en producción:

- `fa26ec1` C4 nómina atomicidad runTransaction.
- `9a61e7d` C5 denormalización siempre que haya actividad.
- `d62ded1` C1 phone normalization rechaza códigos no-RD.
- `58e3a72` C3 eliminar synthesized admin fallback.

C2 (App Check fase B) PAUSADO — plan Hobby Vercel solo retiene logs ~1h, criterio "<5% sin app_check.ok últimos 2 días" no validable sin instrumentación previa.

## Qué salió bien

- C5 reviewer atrapó `eliminadasHuerfanas` faltante en `tuvoActividad`. Sin eso el path edge re-emisión técnicos 0% seguía abierto. Tester vio build verde; reviewer leyó la condición completa y vio el hueco semántico.
- C4 cerrado en una sola iteración aplicando `runTransaction` con patrón existente (`aplicarCuota`). Reusar convención del repo evitó debate.
- C1 defense-in-depth no estaba en spec pero fue legítimo. Builder agregó throw Error en `buscarOCrearCliente` y `crearOActualizarClienteDesdeCita`.
- C3 reviewer cazó instrucción peligrosa en `PROMPTS-CLAUDE-CODE.md:92` (decía "NO toques fallback admin demo"). Sin esa inversión, sprint futuro hubiera reintroducido la vulnerabilidad guiado por nuestros propios docs.

## Qué se complicó

- Documentación contradictoria como vulnerabilidad latente: C3 iter 2 invertir 4 docs (uno con instrucción explícita de NO eliminar el demo mode).
- C5 perdió tilde en `'N técnicos'` vs helper canónico. Síntoma de copy-paste sin verificar fuente única.
- Tester no detectó 2 bugs semánticos (C5 `eliminadasHuerfanas`, C3 hueco try/catch).
- C2 bloqueado por plan Hobby Vercel (logs ~1h). Debería haberse detectado al estimar.

## Aprendizajes accionables

1. **CLAUDE.md sección "Documentación viva"**: cuando se elimina un patrón, grep `PROMPTS-CLAUDE-CODE.md`, `CONTEXTO_PROYECTO.md`, `README.md`, `.claude/agents/*` para invertir instrucciones. Checklist obligatorio del builder pre-PR.
2. **Reviewer es no-negociable en sprints SENSIBLE**. C3, C4, C5 tocaron auth/dinero/comisiones. En 3 de 4 críticos el reviewer aportó valor que tester no detectó.
3. **Strings de UI deben venir de helpers únicos**. Bug tilde C5 hasta tener `pluralizarTecnicos()` o similar.
4. **Estimación debe verificar observabilidad disponible**. Validar plan Vercel/Firebase ANTES de aceptar sprint que requiere métricas de producción.

## Estado 5 críticos

| Crítico | Estado | Hash |
|---|---|---|
| C1 phone normalization | Desplegado | `d62ded1` |
| C2 App Check fase B | Pausado | — |
| C3 admin fallback | Desplegado | `58e3a72` |
| C4 nómina atomicidad | Desplegado | `fa26ec1` |
| C5 denormalización | Desplegado | `9a61e7d` |

## Recomendación C2

**Opción A** (~10-15 min): persistir resultado `verificarAppCheck` en colección `app_check_audit` 24-48h. Después validar.

Razones: mínima superficie, sin dependencias externas (Logtail requiere config + retención tier free a verificar), datos en Firestore = consultables con tools existentes.

Riesgo de mantener soft enforcement una semana más: BAJO-MEDIO. App Check monitor mode no rechaza nada hoy, solo loggea.

## Bonus `api/ai/chat.ts`

**Diagnóstico**: omisión, no diseño deliberado. Firebase ID token autentica usuario pero NO valida origen (App Check valida origen).

**Cobertura**:

- Corto plazo: agregar `verificarAppCheck` (1 línea + import).
- Mediano plazo: rate limiting por uid (cap diario tokens).

**Recomendación**: backlog inmediato como **C2.5**. No bloquear C2 fase B pero no cerrar audit completo sin esto.

## Métricas del sprint

- 5 hashes intentados, 4 desplegados, 1 pausado.
- Loops CHANGES_NEEDED: 4 (2 en C5, 2 en C3, 0 en C1/C4).
- Tiempo total estimado: ~3-4h efectivas.
- Tests automatizados agregados: 0 (sigue siendo deuda).

## Pendientes derivados

1. Instrumentación `app_check_audit` (desbloquea C2).
2. App Check en `api/ai/chat.ts` (C2.5).
3. Helper único para pluralización de técnicos.
4. Checklist "doc sync" en `.claude/agents/builder.md` y `reviewer.md`.
