# Cierre del día — detalle operativo

- Lista cierres y solo chequeos, cliente/técnico y enlace a orden. Fecha desde cierreServicio/historial terminal RAW; nunca updatedAt ni fecha actual inventada.
- Conduces sin fecha válida son incidencias; no se asignan a hoy.
- Gastos por fecha registrada con monto válido, visibles junto a caja confirmada. No se presentan como salidas pagadas ni utilidad contable porque el esquema no demuestra conciliación del gasto.
- Nuevos cierres guardan snapshot v2: detalle órdenes/gastos, total gastos, conteo conduces y anomalías. El servicio existente preserva primer snapshot y no sobrescribe al repetir.
- Histórico sin v2 se rotula sin desglose; no se reconstruye con registros actuales. Importe histórico ausente dice sin dato en lugar de cero.
- Listeners esperan las cuatro fuentes distintas; error bloquea cierre y se muestra. No altera entrega de efectivo ni cálculo de nómina.

Pruebas: 3 focales de fecha real, historial/chequeo y gastos sin fecha/importe inválido. TypeScript limpio. P035 extendido contra fecha de cierre inventada.

Límite: snapshot de fuentes cargadas en cliente no equivale a instantánea transaccional de todas las colecciones. Las variaciones posteriores siguen indicando conciliación. No se publicaron datos, reglas o código. Se requiere revisión UI y verificación integrada.

## Revisión final B1/R2/R3 (29/09)
- Conteo de conduces, fecha inicial y texto usan día de República Dominicana, independiente del dispositivo. Una emisión 29/09 23:00 RD sigue en día 29 bajo TZ Auckland. Fechas ausentes nunca se asignan a hoy.
- `cerrarDiaAtomico` devuelve `creado`; segundo operador ve el snapshot original y aviso de cierre existente, con responsable y hora originales. No afirma un cierre nuevo.
- Standby consulta la colección sin `orderBy(createdAt)` y ordena localmente; piezas sin fecha permanecen visibles como «Fecha sin registrar».
- Focales de cierre/consulta/fechas: 11 pruebas PASS; TypeScript limpio. Emulador de cierre pendiente de ejecución focal tras liberar puerto compartido.

Verificación posterior: emulador caja/cierre 4/4 PASS (concurrente conserva snapshot ganador y distingue `creado`), junto a 4/4 vínculos cotización. Puerto liberado. Regresión solo bloqueos de publicación P005/P013 conocidos.
