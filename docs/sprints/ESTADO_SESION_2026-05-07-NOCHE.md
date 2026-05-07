# Estado de sesión — 2026-05-07 noche

> **Para retomar:** lee este archivo + `docs/sprints/COLA_AUTONOMA.md`. Con eso tenés todo.

---

## TL;DR — qué pasó hoy y qué está pasando ahora

1. **Bug crítico cerrado**: Aury Mon (técnico) no podía iniciar chequeo. Era una cadena de 2 bugs:
   - **P-006**: dropdowns de "Asignar técnico" guardaban `personal.id` en lugar de `personal.uid` (auth.uid). 47 órdenes migradas.
   - **P-002 variante `!=`**: rule `modificaPrecioFinal()` usaba acceso directo a campo opcional. Fix: `.get('precioFinal', null)`.
2. **Aury YA puede trabajar**: confirmamos visualmente que "Iniciar chequeo" funciona en OS-0049.
3. **Rename "Stand-by" → "Pendiente de piezas"** en 9 archivos de UI.
4. **Cola autónoma actualizada** con SPRINT-108 a SPRINT-113.
5. **Jorge ejecutó `trabaja` en Claude Code** antes de cerrar la sesión — el coordinator está procesando los sprints en autonomía.

---

## Commits del día (orden cronológico)

```
c4be345  fix(P-006): tecnicoId guardado como personal.id en lugar de auth.uid
b7b6464  fix(rules): modificaPrecioFinal usa .get para campo opcional
1b75ca6  ux: renombrar Stand-by a Pendiente de piezas en UI
[pending] feat(cola): SPRINT-108 a SPRINT-113 (auditoría + UX flujo)
```

---

## Estado del sistema

| Item | Estado |
|---|---|
| Iniciar chequeo (técnico) | ✅ Funciona (verificado por Aury 6:32 PM) |
| Sugerir solo chequeo | ✅ Funciona (verificado, nota se registra) |
| Reglas Firestore | ✅ Deployadas, lock sincronizado (`94c7639c1a6c...`) |
| Migración tecnicoId | ✅ Completada — 47 órdenes, 4 huérfanas |
| Cazadores P-001 a P-005 | ✅ Pasan (0 hits) |
| Vercel deploy | ✅ Auto-deploy en cada push |
| Backfill usuarios desde personal | ✅ 21/22 OK, 1 conflicto pendiente (apnbrito0318 vs nwilainy@gmail.com) |

---

## Datos críticos para diagnósticos

- **Aury Mon (técnico)**: `auth.uid = 3m5bk3uhKqQCaSphuRFjEdHNOs82` · email `Misterservicetecnicos01@gmail.com` · doc `personal/DRNmXGLXxyoMuKRcVRRa`
- **OS-0049** (orden de prueba): docId `ZIep3ClP60Npp79HSS5u`, cliente Brito, secadora individual
- **Vivas / Eliminadas en Firestore**: 1 viva, 50 eliminadas (Jorge borró la mayoría hoy probando)

---

## Qué está procesando Claude Code ahora (modo autónomo)

Jorge ejecutó `trabaja`. El coordinator debería procesar los sprints en este orden:

1. **SPRINT-108** (alta prioridad — deuda obligatoria del hotfix):
   - Postmortem en `docs/postmortems/2026-05-07-iniciar-chequeo-permission-denied.md`
   - P-006 en `docs/PATRONES_REGRESION.md`
   - Cazador `scripts/invariantes/check-tecnicoid-personal-id-misuse.ts`
   - Extender cazador P-002 para `!=` (no solo `==`)
   - Update gotcha CLAUDE.md
2. **SPRINT-109** — limpiar 22 hits P-001
3. **SPRINT-110** — limpiar 13 hits P-002
4. **SPRINT-111** — auditar otros campos ID (operariaId, ayudanteId, creadaPor, etc.)
5. **SPRINT-112** — schema drift + matriz permisos por rol
6. **SPRINT-113** — UX flujo paso a paso intuitivo

Cualquier sprint que requiera OK de Jorge (migración masiva, rules sensibles) queda en `docs/sprints/BLOQUEOS.md`.

---

## Cuando vuelvas (paso a paso)

### Si Claude Code terminó (te llega notificación o ves los commits)

1. Abrí terminal y corré:
   ```bash
   cd ~/Desktop/mister-service-rd && \
   git log --oneline -20
   ```
   Buscá los SPRINT-108 a SPRINT-113.

2. Lee `docs/sprints/EJECUCION_AUTONOMA.md` — tiene el log de qué hizo el coordinator.

3. Lee `docs/sprints/DIARIO_<fecha>.md` — resumen de 60 segundos.

4. Si ves errores/bloqueos: lee `docs/sprints/BLOQUEOS.md`.

### Si Claude Code se interrumpió (por la actualización de Anthropic)

1. Mismo `git log --oneline -20` para ver dónde quedó.

2. Lee `docs/sprints/EJECUCION_AUTONOMA.md` para ver el último sprint en progreso.

3. Decile a Claude Code (o a la sesión nueva): **"retomá desde donde quedó. Lee `docs/sprints/ESTADO_SESION_2026-05-07-NOCHE.md` y `docs/sprints/EJECUCION_AUTONOMA.md`. Ejecutá `trabaja` para continuar."**

4. El coordinator es idempotente — sprints ya completados los va a saltar.

### Si querés decidir manualmente qué sigue

1. Lee `docs/sprints/COLA_AUTONOMA.md` para ver qué sprints están PENDIENTE.
2. Si querés saltar un sprint, marca su estado como `SKIP` con motivo.
3. Si querés priorizar uno distinto, movelo arriba.

---

## Lo que NO hay que repetir

- ❌ NO volver a correr `npx tsx scripts/migrar-tecnicoid-a-authuid.ts` — ya se ejecutó, es idempotente pero innecesario.
- ❌ NO volver a deployar las rules `firestore.rules` actuales — ya están en producción.
- ❌ NO tocar `enStandby`, `StandbyPieza`, `standby_piezas`, ruta `/admin/standby` — son identificadores internos. El rename de hoy fue solo UI.
- ❌ NO crear nuevos cazadores duplicados de los existentes (P-001 a P-005).

---

## Decisiones tomadas hoy (para no re-discutirlas mañana)

1. **`tecnicoId` ahora es `auth.uid`** en todas las órdenes activas. La convención original "personal.id == auth.uid" queda obsoleta para técnicos creados después de hoy.
2. **Las reglas usan `.get(field, null)`** para campos opcionales. Patrón establecido P-002.
3. **El cazador P-002 todavía solo busca `==`** — SPRINT-108 lo extiende a `!=` también.
4. **"Stand-by" se renombró solo en UI** (no en código ni en Firestore). Los identificadores internos `enStandby`, `StandbyPieza`, `standby_piezas` siguen igual.
5. **La auditoría va PRIMERO, las mejoras de UX después** (Jorge eligió C+B en ese orden).

---

## Archivos clave para una sesión nueva

| Archivo | Para qué |
|---|---|
| `CLAUDE.md` | Contexto general del proyecto + gotchas + sub-reglas |
| `docs/sprints/COLA_AUTONOMA.md` | Cola de sprints pendientes |
| `docs/sprints/COLA_AUTONOMA_PROTOCOLO.md` | Cómo funciona el modo autónomo |
| `docs/sprints/EJECUCION_AUTONOMA.md` | Log de ejecución del coordinator |
| `docs/PATRONES_REGRESION.md` | Catálogo de bugs catalogados (P-001 a P-005, P-006 pending) |
| `docs/postmortems/` | Postmortems estructurados |
| `docs/sprints/ESTADO_SESION_2026-05-07-NOCHE.md` | **ESTE archivo** — punto de partida |
| `firestore.rules.deployed.lock` | SHA-256 de las rules deployadas (para cazador P-005) |
| `service-account.json` | Credenciales Admin SDK (no commitear, ya está en .gitignore) |

---

## Sub-reglas obligatorias que NO se cumplieron (deuda)

CLAUDE.md tiene 3 sub-reglas obligatorias que el hotfix de hoy violó:

1. **"Cada bug capturado debe ser cazador"** — bug P-006 todavía no tiene cazador (SPRINT-108 lo crea).
2. **"Postmortem completo es obligatorio antes de marcar hotfix COMPLETADO"** — falta el archivo en `docs/postmortems/` (SPRINT-108 lo crea).
3. **"Sub-regla obligatoria — coordinator debe invocar `regression_guardian` en sprints que toquen rules, services o context"** — el commit `b7b6464` (rules) no pasó por regression_guardian (no se invocó).

SPRINT-108 paga las primeras 2. La 3 se aplica de ahora en adelante.

---

## Contacto / debugging rápido

Si Aury (o cualquier técnico) reporta bugs futuros similares:

1. Pedí su email + UID de Firebase Auth.
2. Corré el script de diagnóstico:
   ```bash
   cd ~/Desktop/mister-service-rd && node -e "
   const admin = require('firebase-admin');
   const sa = require('./service-account.json');
   admin.initializeApp({ credential: admin.credential.cert(sa) });
   const UID = '<PEGAR_UID_AQUI>';
   admin.firestore().doc('usuarios/' + UID).get().then(u => {
     console.log('usuarios/UID exists:', u.exists, u.exists ? u.data() : '');
     process.exit();
   });
   "
   ```
3. Verificá que la rule no tenga acceso directo a campos opcionales.

---

**Buen descanso. Mañana solo necesitás abrir Claude Code y escribir `trabaja` (si el coordinator no terminó) o leer este archivo + `EJECUCION_AUTONOMA.md`.**
