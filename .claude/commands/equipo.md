---
description: Arranca el flujo de trabajo del equipo multi-agente. Usa al coordinator como punto de entrada.
---

Activa el flujo de trabajo del equipo de 5 agentes (coordinator → builder → tester → reviewer → devops).

El coordinator leerá CLAUDE.md, entenderá el contexto del proyecto, y te preguntará qué quieres hacer. Luego delegará a los agentes especializados según necesite.

Uso:
- `/equipo` → abre el coordinator sin tarea específica (útil al empezar una sesión)
- `/equipo <descripción de lo que quieres>` → coordinator arranca directamente con esa tarea

Ejemplo:
- `/equipo necesito que los técnicos puedan ver su ranking de la semana`
- `/equipo arregla el bug del mapa que no muestra pines en zoom lejano`

$ARGUMENTS
