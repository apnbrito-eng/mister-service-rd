# Caja, cobros y cierre diario — implementación local

## Cambios
- `movimientosCobros.ts`: proyección de caja general desde pagos RAW; wrapper Bancos mantiene firma. Solo suma monto positivo, identificador único dentro de orden, fecha válida, método válido y verificación explícita. Desconocidos son incidencias, no ingresos de hoy. Efectivo se admite sin banco.
- Conduces: cobrado anual y cobros mensuales salen de pagos reales según día RD, no del total de un documento etiquetado pagado. Emisión tiene conteo separado. Registrar pago navega al detalle de la orden; conduce huérfano requiere conciliación. Los filtros documentales no modifican los totales de caja.
- Gastos: usa la misma proyección y guarda fecha escrita a medianoche RD, no UTC. Monto finito positivo y permiso requeridos. Fechas históricas inválidas no se sustituyen por hoy.
- Cierre: ingresos/transferencias/efectivo de técnicos salen de pagos confirmados, no precio final. ID determinista por día, transacción sin sobrescritura, adopta cierre legacy existente; varios legacy bloquean.
- Entrega de efectivo: transacción de todas las órdenes, metadatos `efectivoEntregas[pagoId]` con monto, fecha y responsable. Verifica el snapshot del recibo (ID/monto/fecha/verificación/método). Pago posterior no hereda entrega previa. Boolean histórico sin desglose bloquea para conciliar.

## Evidencia
- 37/37 pruebas focales: caja (3), cierre/entrega (6), bancos (28).
- Fallo commit simulado deja cero escrituras. Cierre concurrente simulado conserva primer total/documento. Estas pruebas mock no sustituyen prueba real de concurrencia en emulador.
- ESLint de los cinco archivos de producción pasó antes del último ajuste visual menor; coordinator debe repetir al integrar.
- `tsc --noEmit` ejecutado; primera corrida detectó error concurrente ajeno `nomina.service.ts:520`; resultado final se informa al coordinador.
- `check:regression` ejecutado sin error runtime; P035 nuevo. P005/P013 siguen restricciones previas de rules sin publicar.

## Límites a revisar antes de publicar
- No cambia reglas. Validar permisos para nuevo mapa de entregas de efectivo en entorno de prueba.
- Cierre fija snapshot de pantalla; no es bloqueo transaccional de todas las órdenes frente a pagos nuevos durante el cierre. Nuevos movimientos posteriores requieren conciliación y no sobrescriben cierre guardado.
- Efectivo por técnico conserva exclusión de órdenes CRM que usan RendicionEfectivo. No migró ese circuito ni sus metadatos.
- Clientes antiguos no deben seguir creando cierres con IDs aleatorios después de publicar; necesita control de versión/rules en lote permisos.
- `fechaCobro` de una comisión significa devengo del trabajo en código legacy; la fecha usada aquí es `pagos[].fecha`, pago real. No son intercambiables.
- P035 hash pendiente del coordinador; no se ejecutó Git, no se publicó ni modificaron datos reales.

## Revisión correctiva de caja
- Snapshot bancario usa bancoId como clave y conserva nombre separado; dos cuentas con nombre igual no se sobrescriben.
- Entrega requiere UID de Auth coincidente y permiso `cierreDiaEjecutar` leído de `usuarios/{uid}` dentro de la transacción. Auditoría por recibo guarda `entregadoPor` (UID) y `entregadoPorNombre`.
- El resumen guardado del cierre permanece visible junto a cobros actuales y variación. Una variación exige conciliación; no modifica el cierre. Nuevos recibos pueden entregarse tras el cierre, cada uno por su ID.
- Acción del conduce: «Registrar pago» abre la orden.
- Emulador real, rules locales: concurrencia de cierres, entrega concurrente idempotente y pago posterior de 50 sobre cierre de 100 conservando snapshot; usuario técnico sin acceso al cierre. Sin datos reales ni publicación.
- Las reglas amplias existentes siguen pendientes del lote de permisos: estos guards del cliente no sustituyen hardening de Firestore. Sin edición de rules en esta corrección.
- Validación final correctiva: 8/8 integración y 4/4 emulador real, incluyendo denegación por permiso personalizado. `npx tsc --noEmit` y ESLint focal limpios. P035 ampliado contra clave bancaria por nombre y actor sin UID.
- Revisión final: la consulta por fecha ignora respuestas antiguas mediante cleanup del efecto, vacía el cierre al cambiar fecha y presenta carga/error/reintento. El guard del handler impide cerrar sin consulta válida. Prueba UI con promesas resueltas en orden inverso: cierre actual permanece y cierre obsoleto no aparece (1/1).
- Texto de confirmación corregido: permite entregas posteriores por recibo conservando snapshot; fecha no cambia durante escritura.
