# Diario — YYYY-MM-DD

> El coordinator escribe esto al final de cada sesión `trabaja`.
> Jorge lo lee en 60 segundos a la mañana siguiente.
> Renombrar este archivo a `DIARIO_2026-MM-DD.md` por sesión.

## Resumen
- **N sprints completados** en X minutos
- **M sprints bloqueados** esperando OK de Jorge
- **K commits pusheados** a producción
- Estado final del repo: `git log --oneline -10`

## Sprints completados
| ID | Título | Hash | Archivos | Notas |
|---|---|---|---|---|
| SPRINT-XXX | ... | `abc1234` | N archivos | ... |

## Sprints bloqueados (REQUIEREN TU OK)

| ID | Por qué | Cómo desbloquear |
|---|---|---|
| SPRINT-YYY | Toca firestore.rules | Editar `BLOQUEOS.md` agregando `OK: jorge YYYY-MM-DD HH:MM` y pegar `procesa bloqueos` al coordinator |

## Cazadores anti-regresión
- **P-001 userProfile.id misuse:** N hits / 0 hits
- **P-002 rules immutability:** N hits / 0 hits
- **P-003 cross-collection sin tx:** N hits / 0 hits

## Alertas
_(Sólo si pasó algo: deploy fallido, regresión en producción, gotcha nueva, sprint que falló 3 intentos)_

- ⚠️ ...

## Próximos pasos sugeridos
_(Lo que Cowork va a poner en cola si no le decís otra cosa)_

- ...

## Métricas (para revisar mensualmente)
- Total commits del día: N
- Total minutos del coordinator trabajando: M
- Hotfixes follow-up disparados por bugs introducidos hoy: 0 (objetivo: <0.5/día)
