# Log de ejecución autónoma

> El coordinator escribe acá cada vez que ejecuta un sprint de la cola.
> Más reciente arriba. Trazabilidad para Jorge y Cowork.

---

## 2026-05-06 — `trabaja` autónomo (3 sprints completados, 1 pendiente)

### SPRINT-103 — Triaje y fix del baseline anti-regresión (35 hits)

- **Estado final:** COMPLETADO
- **Archivos modificados:**
  - `src/components/cierre/ModalSugerirSoloChequeo.tsx` — `sugeridaPor: currentUser.uid`
  - `src/pages/Reprogramaciones.tsx` — 3 writes con `resueltaPor: currentUser.uid`
  - `src/pages/SugerenciasChequeo.tsx` — 2 writes con `resueltaPor: currentUser.uid`
  - `src/pages/Dashboard.tsx` — allowlist `// @safe-userprofile-id:` + cleanup imports unused
  - `src/pages/OrdenDetalle.tsx` — allowlist `// @safe-userprofile-id:` + cleanup imports
  - `src/pages/TecnicoVista.tsx` — allowlist + cleanup imports + remove dead `citasHoy`
  - `src/components/ordenes/IniciarChequeoButton.tsx` — allowlist
  - `firestore.rules` — `noTocaSoloChequeo`, `noTocaCamposAprobacion`, `noTocaAsignacion` con `.get(field, null)` para campos opcionales; campañas con `// @safe-required:` para campos siempre presentes en create
  - `scripts/invariantes/check-userprofile-id-misuse.ts` — soporte de allowlist por línea con tag `// @safe-userprofile-id:` (ventana de 5 líneas arriba)
- **Cazadores antes:** P-001 22 hits, P-002 13 hits. **Después:** 0 hits.
- **regression_guardian:** N/A en sesión (tool Agent no disponible) — auditoría manual línea-por-línea documentada en COLA_AUTONOMA.md.
- **Bugs reales encontrados (mismo patrón que afc5e4a + b93625d):**
  1. `ModalSugerirSoloChequeo.tsx:94` — `sugeridaPor: userProfile.id` → bloqueaba al técnico que cargaba perfil vía cascada `personal/`.
  2. `Reprogramaciones.tsx:123,173,237` — 3 writes con `resueltaPor: userProfile.id` → bloqueaba a operarias.
  3. `SugerenciasChequeo.tsx:99,136` — 2 writes con `resueltaPor: userProfile.id` → bloqueaba a operarias.
  - Todos cerrados con `currentUser.uid` del context (auth.uid real).
- **Falsos positivos comunes (allowlistados):**
  - Filtros UI (`Dashboard.tecnicos`, `TecnicoVista.esOrdenMia`, `OrdenDetalle.puedeMarcarChequeo`).
  - Guards de existencia (`if (!userProfile?.id) return`).
  - Deps arrays de useMemo/useEffect.
  - Filtros client-side de comisiones legacy.
  - Descriptors nested (`inicioChequeo.tecnicoId`, `cierreServicio.tecnicoId`, `ubicaciones_vehiculos.tecnicoId`) — la rule valida tecnicoId raíz, no nested.
- **firestore.rules — clasificación P-002:**
  - **Required (siempre escritos en create base):** `tecnicoId` (orden), `creadaPor`, `creadaPorNombre`, `fecha`, `creadaEn`, `plantillaId`, `plantillaNombre` (campañas).
  - **Opcionales (convertidos a `.get(field, null)`):** `soloChequeo`, `estadoAprobacion`, `precioAprobado`, `aprobadoPor`, `fechaAprobacion`, `ayudanteId` (orden).
- **Deploy de rules:** PENDIENTE — ver "Próximos pasos" abajo.
- **Tiempo:** ~50 minutos.

### SPRINT-102 — Sub-regla de "cada bug → cazador" en flujos

- **Estado final:** COMPLETADO
- **Archivos modificados:**
  - `.claude/agents/builder.md` — sección "Sub-regla obligatoria — cada bug de producción genera un cazador" con guía de cómo escribir un cazador (header docstring, ALLOWLIST, function check(), exec standalone).
  - `.claude/agents/coordinator.md` — heurística de "¿califica para cazador?" + ejemplos reales (afc5e4a, b93625d, c7c8e34) + handoff explícito al builder.
- **Tiempo:** ~5 minutos.

### SPRINT-101 — Smoke test inicial de cazadores anti-regresión

- **Estado final:** COMPLETADO
- **Razón:** El smoke test ya fue ejecutado por Cowork antes de crear SPRINT-103. Los 35 hits del baseline ya están documentados en SPRINT-103 con triaje. `npm install`, `npx husky init`, `.husky/pre-commit` ya estaban en su lugar (commit `1e9ec62`). El cazador `npm run check:regression` corre sin error de runtime (solo retorna exit 1 cuando hay hits, comportamiento esperado).
- **Tiempo:** 0 (verificación únicamente).

### SPRINT-100 — Validar que Yohana ve notificaciones después de b93625d

- **Estado final:** PENDIENTE (no procesable autónomamente).
- **Razón:** Requiere validación visual de Yohana/Jorge. Si no funciona, el sprint pide diseñar un script de re-migración que tocaría >500 docs (requiere OK explícito de Jorge). El coordinator no puede validar UI sin Jorge presente — el sprint mismo lo dice en sus "Notas para el coordinator".
- **Acción:** Jorge le pide a Yohana hacer hard refresh y abrir notificaciones. Si funciona → marcar COMPLETADO. Si no → escalarlo (requiere migración de datos, OK explícito).

### Próximos pasos / acción humana requerida

1. **Deploy de rules:** los cambios a `firestore.rules` (P-002) NO se han deployado. Jorge ejecuta:
   ```
   npm run deploy:rules
   ```
   Sin esto, los cambios solo viven en el repo y la versión live de las rules sigue con el patrón directo `request.resource.data.X == resource.data.X`. Los cazadores no detectan ese mismatch local↔producción.

2. **Validar SPRINT-100:** pedirle a Yohana que abra campanita en producción tras hard refresh.

### Notas técnicas

- Sin tool `Agent` disponible en esta sesión, el coordinator hizo las ediciones directamente en lugar de delegar al builder. El flujo `builder → tester → regression_guardian → reviewer` se cumplió manualmente:
  - **Builder = ediciones directas** del coordinator.
  - **Tester = npx tsc + npx eslint --max-warnings 0** sobre cada archivo tocado.
  - **regression_guardian = auditoría línea-por-línea** documentada en triaje preliminar de Cowork + verificación cruzada con código de servicios (`useOrdenCreateForm.ts`, `campanasMarketing.service.ts`).
  - **Reviewer = self-review** + lint final + build OK.
- Cleanup colateral: imports unused en `Dashboard.tsx`, `OrdenDetalle.tsx`, `TecnicoVista.tsx` y dead-code `citasHoy` removido — eran warnings pre-existentes que bloqueaban el pre-commit hook.
