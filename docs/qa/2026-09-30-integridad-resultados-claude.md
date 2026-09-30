# Integridad Estado de Resultado — incidencia de posible solapamiento

Fecha: 2026-09-30
Ejecutor: Claude Code
Alcance acotado autorizado por Jorge para reforzar integridad del informe sin
tocar dinero histórico ni inventar exclusiones.

## Problema

En `src/services/estadoResultado.service.ts` el informe suma dos conceptos que
pueden referirse a la **misma compra real** sin que exista vínculo trazable
entre ellos:

- `costoPiezas`: suma de `f.costoPiezas` de cada conduce/factura emitido en el
  rango (agregada línea 74 del servicio).
- `gastos.repuestos`: suma de gastos con `categoria === 'repuestos'` del rango
  (agregada línea 85 del servicio).

No hay campo apuntador entre `gastos` y `facturas.items`, así que si una
compra se registró en `gastos` y también entra al `costoPiezas` de un conduce,
la utilidad operativa la resta dos veces. Al revés, si sólo se registra por un
lado, la utilidad es real. **Sin más información, no se puede saber cuál es
el caso**.

## Decisión

- **No inventar exclusión** ni ajustar montos históricos.
- **Declarar incidencia** cuando ambos conceptos son positivos en el mismo
  período, con lenguaje explícito de "posible solapamiento" y "utilidad
  provisional; requiere conciliación manual".
- Aprovechar el contrato existente: la UI `EstadoResultado.tsx` ya invoca
  `coberturaCompleta(data)`, que devuelve `false` cuando hay incidencias, y
  entonces oculta el número de utilidad (renderiza "Incompleto — ver
  desglose"). No se agregó un panel nuevo — la incidencia aparece en el bloque
  `<details open>` de "Incidencias" ya existente.
- Mantener el desglose completo (subtotal, costo de piezas, gastos por
  categoría, nómina) intocado.

## Cambio implementado

`src/services/estadoResultado.service.ts:87-91` (tras el loop de gastos):

```ts
if (costoPiezas > 0 && gastos.repuestos > 0) {
  incidencias.push('Posible solapamiento: costo de piezas de conduces y gastos categoría repuestos del período pueden referirse a las mismas compras. Utilidad provisional; requiere conciliación manual antes de firmar el resultado.');
}
```

Cero cambios en `EstadoResultado.tsx`. La UI ya:

- Renderiza cada incidencia en el `<details open>` "Incidencias".
- Oculta la utilidad operativa cuando `data.incidencias.length > 0`
  (`coberturaCompleta` returns false, tarjeta muestra "Incompleto — ver
  desglose", fila del P&L omite la comparativa Δ%).
- Comparativa gráfica marca "resultado operativo omitido por cobertura
  incompleta".

## Verificaciones

Pruebas focales agregadas en `tests/integraciones/estado-resultado-solapamiento.test.ts`
(5 casos, todos pasan):

1. Ambos positivos en el rango → incidencia presente; utilidadOperativa no se toca.
2. Sólo conduces con `costoPiezas>0` (gasto en categoría transporte) → sin incidencia.
3. Sólo gasto `repuestos>0` (conduce sin piezas) → sin incidencia.
4. Ambos aparecen pero en **períodos distintos** (gasto en agosto, conduce
   en septiembre) → sin incidencia.
5. Ambos aparecen pero el gasto de repuestos es **inválido** (monto negativo,
   monto no numérico, fecha ausente) → no se acumula → sin incidencia de
   solapamiento; sí queda incidencia de "importe inválido"/"fecha desconocida".

Suite completa del feature ejecutada, 21/21 tests pasan:

```
tests/integraciones/estado-resultado-perdida.test.ts       (1 test)  passed
tests/integraciones/estado-resultado-solapamiento.test.ts  (5 tests) passed
tests/integraciones/estado-resultado-fechas.test.ts        (2 tests) passed
tests/integraciones/estado-resultado-rango.test.ts         (6 tests) passed
tests/integraciones/estado-resultado-ui.test.ts            (7 tests) passed
Test Files  5 passed (5)
Tests  21 passed (21)
```

Typechecks:

- `npx tsc --noEmit` (app) → sin errores.
- `npm run typecheck:api` (api + scripts) → sin errores.

Lint focal:

- `npx eslint src/services/estadoResultado.service.ts src/pages/EstadoResultado.tsx tests/integraciones/estado-resultado-solapamiento.test.ts` → sin warnings.

Cazadores de regresión relacionados:

- `check-resultado-perdidas.ts` (P-031) → pass.
- `check-resultado-snapshots.ts` (P-040) → pass.

## Limitaciones y siguientes pasos

- Esta incidencia es **detección de riesgo, no resolución**: cuando dispara,
  Jorge o el equipo administrativo debe conciliar manualmente cuáles gastos
  de la colección `gastos` corresponden a items 'pieza' de qué conduces.
- La solución estructural requeriría un campo apuntador (p. ej.
  `gastos.origen = { conduceId, itemId }` o `facturas.items[i].gastoId`) y
  un flujo UI para vincular al registrar. Fuera del alcance de este lote.
- Si el equipo decide dejar de registrar los repuestos por un lado (p. ej.
  sólo dentro del conduce), la incidencia dejará de disparar por sí sola.
- La regla no distingue "monto pequeño vs. monto grande": basta con que
  ambos sean positivos. Es intencional — un solapamiento parcial también es
  un riesgo de doble conteo.
- No se agregó un cazador de anti-regresión: la lógica es una condición
  simple protegida por 5 tests focales. Si en el futuro se refactoriza el
  loop de gastos, los tests atrapan cualquier ruptura del comportamiento.

## Alcance respetado

Archivos tocados:

- `src/services/estadoResultado.service.ts` (5 líneas agregadas).
- `tests/integraciones/estado-resultado-solapamiento.test.ts` (nuevo).
- `docs/qa/2026-09-30-integridad-resultados-claude.md` (este archivo).
- `docs/qa/2026-09-30-auditoria-integracion-claude.md` (corrección de auditoría
  previa, en documento propio para no pisar notas de otros).

Sin commits, sin deploys, sin cambios a rules, sin escritura de datos reales,
sin acceso a secretos, sin tocar el snapshot en `/tmp/mister-publicacion-20260930`.
