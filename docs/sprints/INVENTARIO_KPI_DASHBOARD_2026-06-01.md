# INVENTARIO DE KPIs DEL DASHBOARD — Auditoría data-slop

**Fecha:** 2026-06-01
**Sprint origen:** `SPRINT-DISENO-I-DATA-SLOP-DASHBOARD-AUDIT` (Fase 1 — autónoma)
**Origen externo:** leak prompt diseño Claude (`asgeirtj/system_prompts_leaks/Anthropic/claude-design.md`):
> *"Avoid 'data slop' — unnecessary numbers or icons or stats that are not useful."*

**Para Jorge:** revisá la tabla de abajo, marcá en la columna "Decisión" `MANTENER`,
`QUITAR` o `MOVER A REPORTE SEPARADO`. Después agregá en `BLOQUEOS.md` la línea
`OK: jorge YYYY-MM-DD opcion=mantener-X-quitar-Y-mover-Z` listando los items
que decidiste, y corré `procesa bloqueos`. El coordinator hará Fase 3 (aplicar).

**Alcance:** TODOS los KPIs/cards/stats visibles en `src/pages/Dashboard.tsx`
post-SPRINT-DISENO-C (reorganización en 4 bloques Hoy/Pipeline/Plata/Equipo).
**NO se incluye** el KPI hero "Órdenes atrasadas" (ya validado por Jorge como
indicador dominante, opción C).

---

## BLOQUE HOY

| KPI / Card | Archivo:línea | Fuente del dato | Costo mant. | ¿Lo miras a diario? | Decisión Jorge |
|---|---|---|---|---|---|
| Recordatorio "Ruta de mañana" | Dashboard.tsx:711 | derivado de citas + ubicación técnicos | bajo | sí (operativa) | ___ |
| Recordatorio "Horarios clientes" | Dashboard.tsx:712 | derivado de citas + preferencias horario | bajo | sí (operativa) | ___ |
| KPI "Cotizaciones Pendientes" (RD$ + count) | Dashboard.tsx:741-748 | onSnapshot `cotizaciones where estado=='pendiente'` | bajo | revisar | ___ |
| KPI "Órdenes Activas" (count) | Dashboard.tsx:749-756 | derivado de `ordenesActivasHoy` | bajo | sí (Hoy) | ___ |
| KPI "Conduces Emitidos" (RD$ + count del mes) | Dashboard.tsx:757-764 | helper kpis.ts `conducesEmitidosMonto/Count` | bajo | revisar (mes vs hoy ambigüedad) | ___ |
| KPI "Ingresos del Mes" (RD$ + count pagadas) | Dashboard.tsx:765-772 | helper `ingresosFacturasPagadas` (factura.estado==='pagada') | bajo | sí (Plata) — ¿duplicado de Plata? | ___ |
| Card "Conversaciones sin responder" (count) | Dashboard.tsx:782-793 | `metricasInbox.sinResponder` | bajo | sí si operás inbox | ___ |
| Card "Tiempo de respuesta (mediana)" | Dashboard.tsx:794-809 | `metricasInbox.medianaRespuestaSegundos` | medio (cálculo cliente-side) | revisar (métrica útil sólo si la persigues) | ___ |
| Card "Más antigua sin responder" (hace cuánto) | Dashboard.tsx:810-829 | `metricasInbox.masAntiguaSinResponder` | bajo | sí si operás inbox | ___ |

**Notas para Jorge sobre HOY:**
- "Conduces Emitidos" (count + RD$ mensual) y "Ingresos del Mes" (count + RD$ pagado mensual) pueden parecer parecidos pero NO lo son: el primero suma todos los conduces (pagados o no) del mes, el segundo solo los efectivamente cobrados. Si los confundís, podemos consolidarlos.
- Las 3 cards de Inbox sólo se muestran a roles oficina (admin/coord/secretaria). Operaria/técnico no las ven.

---

## BLOQUE PIPELINE

| KPI / Card | Archivo:línea | Fuente del dato | Costo mant. | ¿Lo miras a diario? | Decisión Jorge |
|---|---|---|---|---|---|
| Embudo de Servicio (8 fases con conteo + click navegable) | Dashboard.tsx:840-861 | `faseConteo[fase]` derivado de `ordenes` | bajo | revisar (alta visibilidad pero ¿accionable?) | ___ |
| Sección "Alertas en Tiempo Real" (lista rojas + naranjas) | Dashboard.tsx:864-916 | `getAlertasFromOrdenes(ordenes)` | bajo | sí (operativa crítica) | ___ |

---

## BLOQUE PLATA

| KPI / Card | Archivo:línea | Fuente del dato | Costo mant. | ¿Lo miras a diario? | Decisión Jorge |
|---|---|---|---|---|---|
| Card "Ingresos vs Gastos" (barras + balance) con selector hoy/semana/mes/año | Dashboard.tsx:923-996 | derivado de `facturas pagadas` + `gastos` por período | medio (selector + cálculo periodo) | sí (Plata) | ___ |
| Card "Balance Pendiente" (< 30 días vs > 30 días + total) | Dashboard.tsx:998-1027 | derivado de `facturas.estado==='pendiente'` con diff timestamps | bajo | revisar (¿lo usas para cobrar o sólo curiosidad?) | ___ |

**Notas para Jorge sobre PLATA:**
- El selector de período (hoy/semana/mes/año) en Ingresos vs Gastos es la única variable interactiva del Dashboard. Si nunca lo cambias, podemos fijarlo a "mes" y simplificar.

---

## BLOQUE EQUIPO Y TRABAJOS

| KPI / Card | Archivo:línea | Fuente del dato | Costo mant. | ¿Lo miras a diario? | Decisión Jorge |
|---|---|---|---|---|---|
| Card "Estado de Casos por Técnico" (lista técnicos × {pendiente, en proceso, completado}) | Dashboard.tsx:1037-1075 | `casosPorTecnico` derivado de filtro de órdenes | bajo | revisar (mucha info por técnico, ¿la procesás de un vistazo?) | ___ |
| Card "Rendimiento por Técnico" (barras + %completadas + monto emitido) | Dashboard.tsx:1081-1126 | `rendimientoTecnicos` derivado de órdenes cerradas / total | medio (cálculo + render barras) | revisar | ___ |
| Card "Alertas de Inventario" (top piezas stock bajo, gated por `puedeVerInventario`) | Dashboard.tsx:1129-1160 | `alertasInventario` from inventario | bajo | sí si gestionas piezas | ___ |
| Card "Órdenes anuladas esta semana" (3 contadores: eliminadas/canceladas/total, gated por `puedeVerAnuladas`) | Dashboard.tsx:1163-1189 | `anuladasSemana` | bajo | revisar (¿necesario verlo a diario? ¿semanal o mensual ya alcanza?) | ___ |
| Card "Próxima nómina" (quincena + comisiones acumuladas + total estimado, gated por `puedeVerNomina`) | Dashboard.tsx:1192-1222 | `nominaProxima` | medio | sí cerca del 15/30; no el resto | ___ |
| Card "Nómina proyectada del mes" (RD$ + breakdown sueldos/comisiones/bonos, gated por `puedeVerNomina`) | Dashboard.tsx:1225-1260 | `proyeccionNomina` | medio | revisar (sólo es link a /admin/metricas-mensuales) | ___ |
| Card "Reparaciones por Tipo de Equipo" (top con barras count) | Dashboard.tsx:1263-1294 | `reparacionesPorTipo` derivado de órdenes cerradas | bajo | revisar (¿analítico o accionable?) | ___ |
| Card "Agenda del Día" (link a /admin/agenda-dia + conteo) | Dashboard.tsx:1297-1310+ | derivado de citas hoy | bajo | revisar (¿lo abrís desde aquí o desde sidebar?) | ___ |

**Notas para Jorge sobre EQUIPO Y TRABAJOS:**
- Hay 2 cards de nómina ("Próxima" + "Proyectada"). ¿Las dos hacen falta? La proyectada es solo un link a `/admin/metricas-mensuales`.
- "Reparaciones por Tipo de Equipo" es típicamente analítico (informe mensual) más que operativo diario. Candidato a MOVER A REPORTE.
- "Órdenes anuladas esta semana" — pregunta similar. ¿Lo vigilas a diario o te alcanza revisarlo semanal?

---

## CANDIDATOS CLAROS A MOVER A REPORTE SEPARADO

Items que el coordinator sugiere de entrada por ser analíticos/históricos
más que operativos día-a-día (Jorge confirma o rechaza):

- **"Reparaciones por Tipo de Equipo"** → `/admin/reportes/reparaciones-por-tipo`. Es comparativa mensual, no decisión diaria.
- **"Órdenes anuladas esta semana"** → `/admin/reportes/anuladas` (ya existe `/admin/historial-anuladas` que la card linkea).
- **"Nómina proyectada del mes"** → ya es solo link a `/admin/metricas-mensuales`, quitarlo del Dashboard libera espacio.
- **"Rendimiento por Técnico"** → `/admin/reportes/rendimiento-tecnicos` (es análisis, no operativo de hoy).

---

## CANDIDATOS A QUITAR (no a mover)

Items que el coordinator sospecha que son ruido visual y no se consultan
para decidir (Jorge confirma o rechaza):

- _Ninguno propuesto por el coordinator_ — la decisión de quitar definitivo
  es de Jorge. El coordinator se inclina a "mover a reporte" antes que a
  "borrar" para preservar la información a 1 click.

---

## CÓMO RESPONDER (formato sugerido para BLOQUEOS.md)

```
OK: jorge 2026-06-XX opcion=mantener-todo
```

o más granular:

```
OK: jorge 2026-06-XX
  mantener=[
    Ingresos del Mes,
    Conversaciones sin responder,
    Embudo de Servicio,
    Alertas en Tiempo Real,
    Ingresos vs Gastos,
    Balance Pendiente,
    Estado de Casos por Técnico,
    Alertas de Inventario,
    Próxima nómina,
    Agenda del Día
  ]
  quitar=[
    Tiempo de respuesta (mediana),
    Nómina proyectada del mes
  ]
  mover=[
    Reparaciones por Tipo de Equipo → /admin/reportes/reparaciones-por-tipo,
    Órdenes anuladas esta semana → /admin/historial-anuladas (ya existe link, quitar card),
    Rendimiento por Técnico → /admin/reportes/rendimiento-tecnicos
  ]
```

Cualquier formato que el coordinator pueda parsear sin ambigüedad sirve.

---

## SIGUIENTE PASO (Fase 3 — autónoma post-OK Jorge)

Cuando Jorge agregue `OK: jorge ...` en `BLOQUEOS.md`:

1. Coordinator corre `procesa bloqueos`.
2. Builder aplica:
   - `QUITAR`: elimina el card del JSX + dead-code-pass de los `useMemo`/`subscribe` que solo lo alimentaban.
   - `MOVER`: crea ruta `/admin/reportes/<scope>` con el card movido + deja card o link compacto en Dashboard si Jorge lo pide.
   - `MANTENER`: nada.
3. Cazadores 25/25 PASS. Build PASS. QA Jorge final.

---

**Fin del inventario.**
