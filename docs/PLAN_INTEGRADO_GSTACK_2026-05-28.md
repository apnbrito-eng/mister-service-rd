# 🧩 Plan integrado — Tu sistema + lo único de gstack

> **Para Jorge — 2026-05-28.** Plan honesto y simple: cruzo lo que ya tenés con lo que aporta gstack, identifico SOLO lo que de verdad suma (sin duplicar) y diseño cómo encaja en tu flujo. Sin tocar tu CLAUDE.md ni romper tu workflow.
>
> **Disciplina:** planear primero. Este documento es el plan. NADA se instala hasta que lo aprobés.

---

## 1. Resumen en 60 segundos

Tenés un sistema propio muy bueno: 18 agentes en español, tuneados a tu negocio, con cazadores anti-bug, memoria viva, mapa mental, y un coordinator que orquesta todo. Gstack es el sistema más popular del mundo para Claude Code (103k estrellas, lo usa el presidente de Y Combinator).

**Mi propuesta:** dejar tu sistema como base (es el CEO de la operación) y sumarle **6 pedazos sueltos de gstack** que vos NO tenés y que de verdad valen:

1. **Cinturones de seguridad** (`/freeze`, `/guard`, `/careful`) — para trabajar tranquilo en zonas delicadas (dinero, reglas).
2. **QA con navegador real** (`/qa`) — encuentra y arregla bugs visuales en producción, genera tests para que no vuelvan.
3. **Segunda opinión cross-modelo** (`/codex`) — para sprints de dinero/reglas, le pedís a la IA de OpenAI que revise lo que escribió Claude.
4. **Diseño con IA** (`/design-shotgun` + `/design-html`) — para cuando rediseñes pantallas, generás 4-6 mockups, elegís, lo convierte en código.
5. **Vigilancia post-deploy** (`/canary`) — después de subir, vigila producción por errores.
6. **Anti-borrón** (continuous checkpoint mode) — auto-guarda tu trabajo con contexto, sobrevive a crashes y cambios de contexto.

**Lo que NO integramos:**
- `/review`, `/qa` (orquestador), `/ship`, `/cso`, `/document-release`, `/learn`, `gbrain` → vos ya tenés equivalentes en español, mejor tuneados a tu negocio.
- Team mode → reescribe tu CLAUDE.md. NO.
- iOS, voice triggers, `/pair-agent` → no aplica a tu caso hoy.

**El resultado:** tu equipo de 18 agentes sigue siendo el dueño del proceso. Gstack se vuelve una **caja de herramientas extra** disponible cuando el momento lo pide. Sin choque, sin duplicación.

---

## 2. Tabla de decisión — qué sumamos y qué no

| Pedazo de gstack | Lo que vos tenés equivalente | ¿Sumar? | Por qué |
|---|---|---|---|
| `/office-hours`, `/plan-ceo-review`, `/plan-eng-review` | `architect` + `tech_lead` + `coordinator` | ❌ NO | Ya orquestás esto. Cambiar = duplicar. |
| `/review` | `reviewer` (conoce tus cazadores P-001..P-024) | ❌ NO | El tuyo conoce TU código. El de gstack es genérico. |
| `/qa` (orquestador) | `qa` (genera planes en español) | 🟡 PARCIAL | Tu `qa` genera el plan; el `/qa` de gstack **ejecuta el plan en un navegador real**. Se complementan, no se reemplazan. |
| `/cso` | `security` | ❌ NO | El tuyo conoce tus rules de Firebase y tus endpoints `/api/*`. |
| `/ship` | `coordinator` + `devops` | ❌ NO | Tu flujo de commit/push/deploy ya está montado. |
| `/document-release` | `docs` | ❌ NO | El tuyo escribe en español y conoce tu CLAUDE.md. |
| `/learn` + gbrain | `memoria` + `archivist` + `cartografo` | ❌ NO | Tres memorias = caos. La tuya es mejor. |
| `/canary` | `devops` (vigila Vercel + GitHub) | ✅ SUMAR | El tuyo solo dispara el deploy hook. `/canary` vigila errores de consola, performance y páginas rotas después del deploy. Aporta. |
| `/freeze`, `/guard`, `/careful` | — | ✅ SUMAR | No tenés equivalente. Cinturón de seguridad genuino para zonas delicadas. |
| `/codex` | — | ✅ SUMAR | Segunda opinión de OTRA IA (OpenAI Codex). Para sprints de dinero/reglas, vale oro. |
| `/design-shotgun` + `/design-html` | — | ✅ SUMAR | Para rediseñar pantallas con mockups generados por IA. No es urgente, pero te lo dejo a mano. |
| Continuous checkpoint mode | — | ✅ SUMAR (opcional) | Auto-guarda tu trabajo con contexto. Sobrevive a crashes. |
| GStack Browser | — | 🟡 EVALUAR | Chrome especial con sidebar de Claude. Útil pero más cosas que mantener. |
| `/pair-agent` | — | ❌ NO | Coordinación multi-IA por browser compartido. Suena bien pero hoy no usás varios. |
| Team mode (auto-update, rewrite CLAUDE.md) | — | ❌ NO | Toca tu CLAUDE.md. Romper lo que funciona = no. |
| Comandos iOS | — | ❌ NO | No tenés app iOS. |
| `/spec` | `architect` + tu coordinator que escribe sprints | ❌ NO | Ya hacés esto. |

---

## 3. Plan de integración por fases (anti-bucle, con QA tuyo entre cada una)

### **FASE A — Cinturones de seguridad** ⏱️ 5 minutos, 0 riesgo

**Lo que se instala:** los 4 comandos `/careful`, `/freeze`, `/guard`, `/unfreeze` de gstack.

**Cómo se integra:**
- Se instala gstack en tu Mac (`~/.claude/skills/gstack`) **PERO sin team mode**. No toca tu repo, no toca tu CLAUDE.md.
- Vos podés invocar `/freeze src/components/facturacion-pendiente/` antes de tocar el módulo de facturación, y Claude NO podrá editar nada fuera de esa carpeta aunque quiera.
- `/careful` te pide confirmación antes de comandos peligrosos (`rm -rf`, `git reset --hard`, etc.).

**Cuándo lo usás:**
- Antes de tocar `src/services/comisiones.ts` (lógica de dinero) → `/freeze src/services/`
- Cuando estás depurando con el coordinator autónomo de noche → `/guard` para que no se vaya por las ramas.

**QA tuyo:** instalarlo y probar `/careful` con un comando inofensivo. Ver que pide confirmación.

---

### **FASE B — QA con navegador real** ⏱️ 1 hora, riesgo bajo

**Lo que se integra:** `/qa` de gstack como **ejecutor** del plan que genera tu `qa` actual.

**Cómo encaja:**
1. Cowork (o tu coordinator) le pide a tu agente `qa` el plan de pruebas (en español, conoce tu negocio).
2. El plan queda escrito en `docs/qa/<sprint>.md` (texto claro: "ir a /admin/ordenes, crear orden, verificar que aparece en lista").
3. Vos (o el coordinator) corre `/qa` de gstack pasándole ese plan. **gstack abre Chrome real, hace los clics, encuentra los bugs, los arregla, te genera un test de regresión** para que ese bug no vuelva.

**Workflow concreto:**
```
trabaja          → coordinator procesa sprint
qa               → tu agente qa genera plan en docs/qa/
/qa <url>        → gstack ejecuta el plan en navegador real
                    encuentra bug → lo arregla → genera test
git commit       → cazadores + typecheck + lint
```

**Esto reemplaza el QA manual tuyo** para los flujos visuales (inbox, formularios, pantallas). Para flujos no visuales (dinero, garantías) seguís haciendo QA a mano vos como hasta ahora.

**QA tuyo:** correr `/qa` sobre `/admin/inbox` con un plan generado por tu agente `qa`. Ver si encuentra algún bug que ya conocés.

---

### **FASE C — Segunda opinión cross-modelo** ⏱️ 30 minutos, 0 riesgo

**Lo que se integra:** `/codex` invocado por tu agente `reviewer` en sprints de dinero/reglas.

**Cómo encaja:**
- Tu `reviewer` actual revisa el código que escribió el `builder`. Ahora, para sprints marcados `[NO CERRAR sin QA Jorge]` (dinero, órdenes), el coordinator invoca también `/codex`.
- `/codex` le pide a la IA de OpenAI (GPT/Codex) que revise el mismo código de forma independiente.
- Si ambos están de acuerdo → señal verde.
- Si discrepan → te marca lo que cada uno encontró y vos decidís.

**Cuándo se dispara:**
- Sprints de dinero (comisiones, pagos, facturación).
- Sprints que tocan `firestore.rules` o `storage.rules`.
- Sprints del núcleo (`crearOrden()`).

**Requisito:** tener la CLI de Codex instalada y autenticada con OpenAI. Eso tiene costo (cuenta de OpenAI). Te aviso del costo antes de activarlo.

**QA tuyo:** correr `/codex` sobre el último sprint de dinero (DINERO-2 hash `b4fc23c`) y ver si la IA de OpenAI encuentra algo que el `reviewer` no vio.

---

### **FASE D — Vigilancia post-deploy** ⏱️ 30 minutos, 0 riesgo

**Lo que se integra:** `/canary` invocado por tu agente `devops` después de cada deploy crítico.

**Cómo encaja:**
- Hoy tu `devops` confirma que Vercel hizo el deploy. Punto.
- Con `/canary`, después del deploy entra automático a la app, navega las páginas críticas, mira errores de consola, mide performance, te alerta si algo se rompió.

**Cuándo se dispara:**
- Después de sprints de FASE 1 que tocan páginas críticas (inbox, dashboard, agenda).
- NO se dispara para cambios de docs.

**QA tuyo:** después del próximo deploy importante, correr `/canary https://misterservicerd.com` y ver el reporte.

---

### **FASE E — Diseño con IA** ⏱️ caja de herramientas, sin urgencia

**Lo que se integra:** `/design-shotgun` y `/design-html` disponibles cuando quieras rediseñar.

**Cuándo lo usás:**
- Cuando quieras una nueva pantalla del cliente (portal de garantía, factura visual).
- Cuando quieras renovar el dashboard.
- Para presentaciones / mockups para mostrar al equipo.

**Cómo se ve:**
1. Le decís: *"`/design-shotgun` pantalla de cierre de orden mostrando piezas usadas y firma del cliente"*.
2. Te abre un tablero con 4-6 mockups generados por IA, lado a lado.
3. Vos elegís 2-3 favoritos, das feedback ("más espacio entre secciones", "menos azul").
4. Genera otra ronda. Repetís hasta que tengás uno perfecto.
5. `/design-html lo-que-elegiste` → convierte ese mockup en código React real para tu proyecto.

**Sin urgencia.** Lo dejamos disponible para el día que lo necesites.

---

### **FASE F — Anti-borrón (continuous checkpoint)** ⏱️ opt-in, sin presión

**Lo que se integra:** modo `checkpoint_mode = continuous` de gstack.

**Cómo funciona:**
- Mientras el coordinator autónomo trabaja de noche, cada paso significativo se auto-commitea con prefijo `WIP:` y un cuerpo que incluye: decisiones tomadas, trabajo pendiente, intentos fallidos.
- Si el proceso muere o tu Mac se duerme, podés correr `/context-restore` y reconstruye el estado.
- `/ship` aplasta los commits `WIP:` antes de subir, para que el historial quede limpio.

**Cuándo activarlo:**
- Si te pasó alguna vez que el coordinator estuvo trabajando 30 minutos y se cortó la luz / Claude se quedó sin contexto / cerraste la sesión por error → este modo lo previene.
- Si nunca te pasó, no es urgente.

**QA tuyo:** activar `gstack-config set checkpoint_mode continuous`, dejar el coordinator trabajando, cerrar la sesión a propósito, correr `/context-restore` y ver si retoma.

---

### **FASE G — GStack Browser** ⏱️ evaluar, no urgente

**Lo que es:** Chrome especial con sidebar donde podés escribir natural ("navegá a configuración y sacá screenshot") y un Claude mini ejecuta. Tiene defensas contra prompt injection.

**Por qué dudo:** son más piezas en movimiento (otro Chrome, daemons, sidebar extension). Vos ya tenés tu Chrome normal y Claude in Chrome de Anthropic.

**Recomendación:** **NO instalar de entrada.** Si en algún momento vas a hacer mucho QA visual o investigación web profunda, lo evaluamos. Por ahora queda fuera.

---

## 4. Cómo se ve un sprint con todo integrado

**Ejemplo:** sprint NUCLEO-CREAR-ORDEN-CENTRAL (toca dinero/orden, es delicado).

```
[Jorge en Cowork]
"crear el helper crearOrden() central que exija cliente"
                ↓
[Cowork escribe sprint en COLA_AUTONOMA.md]
                ↓
[Jorge en Claude Code: trabaja]
                ↓
[coordinator]
  → archivist PRE-CHANGE (qué pasó antes con esto)
  → cartografo dame contexto (PROMPT_SISTEMA.md actualizado)
  → MAPA_RIESGOS_MODULOS (sección de Ordenes)
                ↓
[coordinator delega al builder]
[builder] /guard src/services/ordenes.service.ts          ← gstack FASE A
  ← solo puede tocar ese archivo, no se sale
  → escribe el helper
                ↓
[coordinator delega verificación EN PARALELO:]
  → reviewer (tu agente, en español, conoce cazadores)
  → guardian_logica (lógica end-to-end)
  → regression_guardian (P-001..P-024)
  → auditor_contable (toca creación de órdenes que afectan dinero)
  → /codex (segunda opinión de OpenAI)                    ← gstack FASE C
                ↓
[Si todos OK → coordinator commit + push]
[cazadores + typecheck + lint] (tu husky pre-commit)
                ↓
[devops dispara deploy hook]
[/canary https://misterservicerd.com]                     ← gstack FASE D
  → vigila producción 5 min, busca errores nuevos
                ↓
[Si /canary detecta algo → revierte o alerta a Jorge]
[Si OK → coordinator no cierra COMPLETADO, deja awaiting QA Jorge]
                ↓
[Jorge en el inbox: hace QA manual del flujo]
[O Jorge: /qa https://misterservicerd.com/admin/ordenes]   ← gstack FASE B
  → gstack abre Chrome, ejecuta plan que escribió tu agente qa
  → si encuentra bug → lo arregla → genera test de regresión
                ↓
[memoria actualiza MEMORIA_MAESTRA con hash + estado]
[cartografo regenera mapa si cambió la estructura]
                ↓
[Jorge: "OK, cerrar COMPLETADO"]
[coordinator marca COMPLETADO en MEMORIA_MAESTRA]
```

**Lo que ves:** todo TU sistema sigue siendo el dueño del proceso. Gstack aporta 3 cosas concretas en momentos específicos: `/guard` (seguridad), `/codex` (segunda opinión), `/canary` (vigilancia post-deploy). Cada uno encaja como pieza, no como reemplazo.

---

## 5. Lo que NO integramos y por qué

| No integramos | Por qué |
|---|---|
| Team mode | Reescribe tu CLAUDE.md. Romper lo que funciona ≠ progreso. |
| `gbrain` (memoria propia de gstack) | Tu `memoria` + `archivist` + `cartografo` ya cubren esto en español, tuneado a Mister Service. Tres memorias = chaos. |
| `/learn` | Mismo razonamiento que gbrain. |
| `/review`, `/cso`, `/document-release`, `/ship`, `/spec`, `/office-hours`, `/plan-*` | Tu equipo de 18 agentes ya hace esto en español, mejor tuneado a tu código. Cambiar = retroceso. |
| iOS commands | No tenés app iOS. |
| `/pair-agent` | Útil si manejaras múltiples IAs simultáneas; hoy no. |
| GStack Browser | Más piezas en movimiento. Por ahora no compensa. Queda en evaluación. |
| Voice triggers | No estás usando entrada por voz hoy. Si llegás a ello, se activa fácil. |

---

## 6. Costos a tener en cuenta

| Cosa | Costo |
|---|---|
| Instalar gstack global | Gratis (MIT) + 30 segundos. |
| Bun (dependencia de gstack) | Gratis. Una vez. |
| `/codex` | Necesita cuenta OpenAI con créditos. Cada review consume ~$0.05 a $0.30 USD según tamaño del diff. Para 5 sprints de dinero/mes = ~$1.50 USD. |
| `/qa` con navegador real | Gratis (usa tu Claude). Cada corrida consume tokens de Claude. |
| GStack Browser | Gratis. |
| Continuous checkpoint | Gratis. Solo agrega commits WIP locales. |

Total ≈ **$1.50 a $5 USD al mes** si activás `/codex`. El resto es gratis.

---

## 7. Próximo paso

**Mi recomendación de orden:**

1. **HOY:** FASE A (cinturones de seguridad). 5 minutos. Instalá `/freeze`, `/guard`, `/careful`. Probalo con un comando inofensivo.
2. **Esta semana:** FASE B (`/qa` con navegador) si tenés un flujo visual que querés probar. Si no, esperá a que aparezca el caso.
3. **Próximo sprint de dinero:** activá FASE C (`/codex`) con costo confirmado.
4. **Después de un deploy importante:** FASE D (`/canary`).
5. **Cuando quieras rediseñar algo:** FASE E (`/design-shotgun`).
6. **Si te pasa que se corta el coordinator:** FASE F (continuous checkpoint).
7. **GStack Browser:** no instalar por ahora.

**Cada fase con QA tuyo entre medio.** Si una fase no te convence o no la usás, no pasamos a la siguiente.

---

## 8. Qué necesito de Jorge ahora

- ¿Vamos con FASE A ya (5 min, 0 riesgo)?
- ¿O preferís que detalle alguna fase más antes de tocar nada?
- ¿O querés modificar el plan (sumar algo que descarté, sacar algo que sumé)?
