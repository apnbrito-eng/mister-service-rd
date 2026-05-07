# Postmortems

Análisis estructurado de cada bug que rompió producción en Mister Service RD.

## Para qué existe este directorio

Convertir incidentes en aprendizaje. Cada postmortem responde:

1. **¿Qué pasó?** (resumen + timeline)
2. **¿A quién afectó?** (impacto cuantificado)
3. **¿Por qué pasó?** (5 porqués hasta causa raíz estructural)
4. **¿Qué hicimos para arreglarlo?** (acciones inmediatas)
5. **¿Cómo evitamos que vuelva?** (acciones preventivas — cazadores, sub-reglas)
6. **¿Qué aprendimos?** (lecciones para el equipo del futuro)

Sin esto, los bugs se arreglan y se olvidan. Con esto, el sistema mejora con cada incidente.

## Quién escribe los postmortems

El agente `archivist` (`.claude/agents/archivist.md`), invocado por el `coordinator` después de cerrar cualquier sprint hotfix de bug en producción.

Es **obligatorio** según la sub-regla de CLAUDE.md: "Postmortem completo es obligatorio antes de marcar un sprint hotfix como COMPLETADO".

## Estructura

- `_TEMPLATE.md` — template estructurado. **Usalo siempre como base**, no inventes formato nuevo.
- `YYYY-MM-DD-<slug>.md` — un archivo por incidente. Slug en kebab-case descriptivo (3-6 palabras).

Ejemplo: `2026-05-07-iniciar-chequeo-rules-sin-deploy.md`.

## Convenciones

- **Honestidad sobre diplomacia.** Si el sistema falló porque alguien olvidó deployar, decilo así. Los postmortems blandos no enseñan.
- **5 porqués completos.** Parar en el 2° pierde la causa estructural. Si parás antes, justificá por qué.
- **Acciones preventivas concretas.** "Tener más cuidado" no es una acción preventiva. Un cazador determinístico sí lo es.
- **Métricas reales.** MTTR medido en minutos/horas reales, no estimaciones cosméticas.
- **Recurrencia es señal de fallo del cazador.** Si un bug es recurrencia de un patrón P-XXX ya catalogado, eso significa que el cazador X falló — no es bug nuevo, es ciclo de retroalimentación roto.

## Métricas que se calculan desde acá

`scripts/metricas-mejora-continua.ts` (alias `npm run metricas`) lee este directorio y calcula:

- **MTBF** — días promedio entre incidentes.
- **MTTR** — minutos promedio detección → fix.
- **Recurrence rate** — % de postmortems con "es recurrencia: sí". Objetivo <5%.
- **Catch rate** — % de bugs cazados pre-commit (cazador grita) vs post-commit (postmortem). Objetivo >80%.

Output en `docs/sprints/METRICAS_<fecha>.md`.

## Relación con otros docs

| Doc | Rol |
|---|---|
| `docs/PATRONES_REGRESION.md` | Catálogo P-XXX. Cada postmortem que es "clase nueva" agrega un P-XXX. |
| `scripts/invariantes/check-*.ts` | Cazadores determinísticos. Cada postmortem propone uno nuevo (clase nueva) o refinamiento (recurrencia). |
| `.claude/agents/regression_guardian.md` | Capa semántica que evalúa diffs. Lee `docs/PATRONES_REGRESION.md` (no este directorio). |
| `.claude/agents/archivist.md` | Genera postmortems acá. Lee este directorio en modo PRE-CHANGE para advertir al coordinator. |

## Política

- Un postmortem por incidente. No agrupar varios bugs distintos en un mismo archivo.
- Una vez creado, el postmortem es inmutable salvo correcciones de hechos. Si después aprendés algo nuevo, agregá un "Update YYYY-MM-DD" al final, no reescribas la historia.
- Severidad declarada al momento del incidente. No ablandar después.
