# Búsqueda de órdenes — PRE-CHANGE

29/09/2026. Alcance aprobado por root a partir del pedido explícito de Jorge: número, nombre, teléfono, equipo y falla, ignorando diferencias de tildes/espacios/guiones.

Causa actual: Ordenes.tsx:846 sólo compara clienteNombre y numero, con minúsculas. OrdenFilters.tsx:45 anuncia únicamente nombre/#OS.

Touch-list: nuevo src/utils/busquedaOrdenes.ts y pruebas; OrdenFilters.tsx sólo placeholder; Ordenes.tsx sólo import y sustitución del predicado. Sin refactor, handlers, reglas, consultas, roles, dataset ni cambios de filtros de estado/técnico/mes.

Historial: OrdenFilters d75e74e (16/04 extracción), fbb77d1 (30/05 estilos); Ordenes b6486e4 (18/05 excluir soft-deleted), 808cc1e (26/09 consolidación). Consumidor único del helper será el predicado sobre ordenesVisibles. Preservar ese límite evita mostrar registros fuera del alcance del usuario.

Campos reales: clienteNombre, numero, clienteTelefono, equipoTipo, equipoMarca, equipoModelo, equipoModeloFabricante, equipoTipoMotor legado y descripcionFalla. No inferir que equipoModelo es modelo de fabricante: representa configuración física.

Propuesta: normalizar Unicode/tildes/minúsculas; búsqueda textual por palabras sobre campos compuestos; alternativa compacta para teléfono/número/modelo con separadores. Consulta vacía muestra la misma lista filtrada de antes. No normalizar teléfonos a últimos diez dígitos ni mutar datos.

QA obligatoria por página crítica: buscar número, teléfono formateado, marca/modelo, falla con tildes; combinar con mes/técnico/estado; limpiar búsqueda restaura resultados sin resetear los otros filtros. Pruebas de helper y TS/lint/regresión. No hay escrituras ni efectos financieros.
