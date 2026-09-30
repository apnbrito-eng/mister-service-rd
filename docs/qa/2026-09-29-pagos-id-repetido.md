# C2 — reparación de ID de pago repetido

La conciliación relee todos los pagos dentro de transacción y bloquea cualquier ID repetido, aunque cambien monto, método o fecha. Nunca genera otro ID para una copia. La bandeja muestra «requiere revisión de origen» y oculta reparación ID/fecha para esos registros. La confirmación continúa bloqueada por incidencia.

Los registros quedan intactos. No se implementa una marca de exclusión de duplicados: requiere definir evidencia del cobro original, autorización y reversibilidad, y actualizar de forma coherente caja, bancos, conduces, métricas, nómina y lecturas históricas antes de aplicar una resolución auditada. Este pendiente no se resuelve manualmente renombrando IDs.

Pruebas: copias idénticas no admiten reparar ni confirmar; ID repetido con importes diferentes también bloqueado. Prueba de emulador añadida en auditoria-writers.rules.test.ts. No datos reales ni reglas modificadas.

Verificado: TypeScript limpio; 12/12 focales; 6/6 emulador Firestore (incluye copia idéntica bloqueada sin escrituras/auditoría de éxito). Log `/tmp/c2-pagos-emulator.log`. Cazador P035 pasa; suite de regresión conserva únicamente bloqueos de publicación P005/P013 conocidos. Fuentes congeladas tras esta corrección.

Borde legacy: la comparación normaliza IDs string (trim) y números finitos. `123` numérico y `"123"` se consideran el mismo identificador. Null, undefined y cadenas vacías no se agrupan como ID repetido. Pruebas focales específicas añadidas.
