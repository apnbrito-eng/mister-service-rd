---
description: Activa el equipo coordinado de 11 agentes para trabajar en una feature, bug o sprint.
---

Activá al `coordinator` para que orqueste al equipo de 11 agentes en este sprint.

**Equipo activo (11 agentes)**:

| Agente | Rol | Cuándo activarlo |
|---|---|---|
| `coordinator` | PM + Customer Success — único interfaz con Jorge | Siempre primero. Orquesta el sprint completo. |
| `tech_lead` | Tech Lead — decisiones técnicas, estimación, retros | Sprint planning + retrospectiva post-deploy |
| `architect` | Software Architect — diseño técnico de features grandes | Sprints con schema/sistema nuevo, antes del builder |
| `user_advocate` | UX Researcher — voz del usuario real (técnicos, operarias) | Validar UX antes del builder en features visibles |
| `builder` | Implementador generalista | Default para implementar código |
| `tester` | QA automatizado — typecheck, lint, build | Después del builder, antes del reviewer |
| `qa` | QA manual — checklist funcional para Jorge | Pre-deploy de sprints sensibles |
| `reviewer` | Senior Engineer — code review independiente | Después del tester, antes del commit |
| `security` | Security Engineer — audit de seguridad | Sprints que toquen rules, auth, endpoints públicos |
| `devops` | DevOps / SRE — deploy y monitoring | Después del commit + push |
| `docs` | Technical Writer — documentación viva | Después del deploy, capturar aprendizajes y actualizar mapa-mental, ESTADO_SESION, contextos |

**Diferidos** (no activos, disponibles en `docs/agentes-referencia/`):
- `designer` — UX/UI Designer (cuando el sprint sea principalmente visual)
- `test_engineer` — SDET con Playwright (cuando se haga el sprint dedicado de setup)
- `builder_backend` + `builder_frontend` — solo si el sprint requiere paralelización

---

## Las 4 ceremonias del sprint

### 1. Sprint Planning
1. `coordinator` lee CLAUDE.md + sprint prompt si existe.
2. `coordinator` aclara con AskUserQuestion si hay ambigüedad operacional.
3. `coordinator` convoca a `tech_lead` para estimar tamaño/riesgo.
4. Si toca schema/sistema, `tech_lead` convoca a `architect`.
5. Si es UX-heavy, `tech_lead` convoca a `user_advocate`.
6. `coordinator` presenta plan a Jorge antes de ejecutar.

### 2. Refinement (mid-sprint)
Si surge ambigüedad durante la ejecución, `coordinator` pausa, aclara con Jorge (negocio) o `tech_lead` (técnico), y reanuda con la decisión documentada.

### 3. Sprint Review
`coordinator` produce resumen + lista de archivos cambiados + bloque git listo.

### 4. Retrospectiva
Post-deploy, `tech_lead` produce: qué salió bien, qué se complicó, acciones para próximos sprints, aprendizajes que `docs` captura en `mapa-mental.md` o `ESTADO_SESION_*.md`.

---

## Flujos típicos

### Sprint chico (bugfix, tweak UI)
```
coordinator → builder → tester → reviewer → commit + push → devops
```

### Sprint mediano (feature acotada)
```
coordinator → tech_lead → user_advocate (UX si aplica) →
builder → tester → reviewer → security (si toca rules) →
commit + push → devops → tech_lead (retro) → docs
```

### Sprint grande (schema nuevo, sistema nuevo)
```
coordinator → tech_lead → architect → user_advocate →
builder → tester → qa (manual) → reviewer →
security → commit + push → devops → tech_lead (retro) → docs
```

---

## Uso

- `/equipo` → abre el coordinator sin tarea específica
- `/equipo <descripción>` → coordinator arranca con esa tarea

Pedido de Jorge: $ARGUMENTS
