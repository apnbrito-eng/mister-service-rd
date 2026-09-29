# Lote 1 — búsqueda de órdenes

Fecha: 2026-09-29. Cambios locales; no publicación ni cambios en datos.

## Cambios

- `src/utils/buscarOrden.ts`: comparación pura por número, nombre y teléfono del cliente, tipo/marca/modelo del equipo, modelo del fabricante y descripción de falla.
- `src/pages/Ordenes.tsx`: únicamente import y sustitución de `matchBusqueda`. Se mantiene `ordenesVisibles` como fuente, así como filtros por estado, técnico y mes. No se agregaron listeners ni consultas.
- `src/components/ordenes/OrdenFilters.tsx`: indicación de búsqueda por orden, cliente, teléfono o detalle.
- `tests/integraciones/buscar-orden.test.ts`: 28 casos.

## Comportamiento

Ignora mayúsculas, tildes y espacios repetidos. Acepta coincidencias parciales. En consultas telefónicas elimina separadores y normaliza el prefijo 1 únicamente si hay once dígitos. No convierte consultas textuales con números en teléfonos. Acepta OS-0011, OS0011 y #OS 0011. Los campos ausentes de registros antiguos no provocan errores. Una consulta vacía mantiene las órdenes permitidas por los demás filtros.

## Verificación

- `npx vitest run --config vitest.integraciones.config.ts tests/integraciones/buscar-orden.test.ts`: 28/28 aprobadas.
- `npx tsc --noEmit`: aprobado.
- PRECHANGE transmitido por coordinación: preservar permisos/ordenesVisibles, filtros y soft delete; cumplido al modificar solamente el predicado de búsqueda.
- Pendiente prueba visual integrada de la página y revisión independiente del lote.

No se modifican colecciones, permisos, parsers, estados de órdenes ni datos. No se ejecutaron comandos Git.

## Cazadores registrados por coordinación

P-029 protege búsqueda y filtros; P-030 inspecciona cierre transaccional sin errores silenciados; P-031 protege utilidad bruta negativa. Entradas añadidas al catálogo y registradas en run-all, conservando P-028. Hashes pendientes del commit del coordinador, sin inventarlos.

`npm run check:regression` ejecutado sin error de runtime (916 ms): P-029/P-030/P-031 pasan. El comando global termina con código 1 exclusivamente por P-005/P-013, reglas pendientes de despliegue preexistentes; no se desactivaron ni se añadieron excepciones. ESLint dirigido de los tres cazadores limpio.
