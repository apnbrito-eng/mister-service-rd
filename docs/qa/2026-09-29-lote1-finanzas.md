# Primer lote financiero — 29/09/2026

## Cambios respecto al respaldo previo de esta ejecución

- `src/services/nomina.service.ts`: cierre completo en una transacción Firestore. Se leen nómina y registros antes de escribir. Comisiones, avances, cuotas y cierre se confirman juntos; un error impide todos los cambios. Reintentar una nómina cerrada no vuelve a descontar. No hay fase parcial nueva ni bloqueo permanente al fallar.
- Las referencias duplicadas, sumas distintas al borrador, cuotas canceladas/desactualizadas e historiales inconsistentes detienen el cierre para revisión. Los registros ya aplicados de la misma liquidación solo se aceptan si coinciden importe, cuota, período y saldo; comisión sin origen no se reasigna automáticamente.
- Compatibilidad histórica: comisión sin estado conserva el default pendiente de generación; préstamo sin historial solo se admite con cero cuotas y saldo total íntegro.
- Descuentos ad hoc respetan el bloqueo de asistencia de un cierre heredado. En cierres nuevos, la transacción sobre nómina serializa cambios concurrentes con el cierre.
- `src/services/estadoResultado.service.ts`: cálculo existente extraído desde la página para probarlo; utilidad bruta conserva valores negativos. `src/pages/EstadoResultado.tsx` consume el servicio. Sin modificar criterios de ingreso, porcentajes o quincenas.

## Verificación

- Pruebas dirigidas de cierre: fallo de escritura en comisión/cuota/nómina deja todo intacto, reintento no duplica, dos callers, préstamo cancelado, ajuste cambiado, origen ambiguo, historial legacy y saldo inconsistente.
- Prueba del cálculo completo mensual: ventas100, piezas180 y gastos20 producen utilidad bruta−80 y operativa−100.
- Pruebas previas de asistencia preservadas.
- Emulador Firestore con rules actuales: dos sesiones admin/coordinadora cierran una sola vez; inconsistencia deja comisión/avance/nómina intactos; técnico no puede cerrar. 3/3 pasaron. No se usó producción ni se editaron rules.
- Verificación final después de revisión:14/14 pruebas dirigidas,3/3 emulador, `npx tsc --noEmit` y lint dirigido pasan sin errores ni advertencias.

## Límites y pendientes

- Límite defensivo de400 referencias más la nómina por transacción. Probada concurrencia con nómina pequeña; no es una prueba de capacidad de400 movimientos ni de documentos cercanos al máximo de tamaño Firestore. Si el servidor rechaza tamaño/plazo, la transacción no confirma nada.
- Cierres parciales heredados con comisión liquidada sin identificador de liquidación necesitan conciliación; no se puede inferir el origen solo por quincena.
- No se corrigieron políticas de neto mínimo, generación con fechas faltantes, bonos, ni integraciones del plan financiero posterior. El cierre rechaza comisiones anuladas; borradores que ya las incluyan necesitan revisión.
- No se aplicaron descuentos reales ni se cerraron nóminas reales. No commit, push o publicación.
- Advertencias prechange recibidas por coordinación: preservar avances atómicos (fa26ec1), evitar silencios (05a00a2), sueldo mensual/2 y cortes30→14/15→29. Se preservaron; atomicidad ampliada a todo el cierre.
- Cazadores y entradas P del cierre y pérdida bruta quedan a cargo del coordinador para evitar conflictos en registro compartido.
