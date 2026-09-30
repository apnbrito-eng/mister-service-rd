# Nómina: recuperación de comisiones tardías

## Cambio local

- H1 reproducido antes de modificar: repetir Generar conservaba el borrador y omitía una comisión registrada después. Ahora cada empleado abierto e impago dispone de **Actualizar comisiones**; actualiza únicamente sus comisiones y mantiene los snapshots de sueldo, bono, asistencia, avances, préstamos y descuentos manuales.
- H2 reproducido: una comisión con devengo anterior no entraba en la próxima quincena. Generar o actualizar incluye pendientes hasta el fin del período. Conserva la fecha real y registra origen, destino y actor en `comisionesAtrasadas`; no modifica el devengo.
- Cerrar relee comisión, propietario e importe. Si otra nómina la liquidó, el segundo cierre falla. Actualizar retira el importe solamente si la nómina origen demuestra el mismo empleado cerrado con esa referencia; conserva `comisionesYaLiquidadas` como explicación.
- Nuevas nóminas usan un documento real `nomina-<quincena>` con creación transaccional. Adopta un único documento legacy y rechaza duplicados ya presentes. No crea documentos auxiliares que puedan sumarse por error.
- No reabre ni recalcula empleados pagados/cerrados. Sueldos de períodos distintos siguen siendo válidos.

## Concurrencia y límite H3

La consulta de candidatos ocurre antes de la transacción y no impide una inserción posterior. Una comisión creada después del snapshot o del cierre conserva estado pendiente y se recupera al actualizar un empleado todavía abierto o generar una nómina posterior. El test de emulador inserta una tardía después del cierre y demuestra liquidación única en la siguiente nómina con fecha original intacta.

No se afirma exclusión global de creaciones: requeriría coordinación de todos los escritores. Clientes antiguos todavía pueden crear otro documento legacy durante la consulta; requiere publicación conjunta futura. No hay migración masiva ni cambios de rules.

## Evidencia

- `npx tsc --noEmit`: limpio.
- Integraciones nómina parcial/atómica/asistencia: 36/36.
- Emulador Firestore demo con rules actuales: 5/5, incluyendo dos generaciones simultáneas, cierre concurrente, recuperación parcial y tardía posterior al cierre.
- P034 protege contra reintroducir filtro inferior de fecha y addDoc aleatorio en generación/actualización; pruebas funcionales cubren la semántica que el análisis estático no demuestra.
- PRECHANGE respetado: fa26ec1/05a00a2, P003/P006/P009/P012/P021/P024; descuentos siguen atómicos y los errores no se silencian.

Todo permanece local; sin datos reales, publicación ni commit por el builder.

## Segunda revisión: cuotas y nuevas huérfanas

Se reprodujeron ambos casos antes de corregirlos. Cuando actualizar comisiones cambia el devengado de cero a positivo y no había cuotas capturadas, se marca `cuotasPendientesRevision` y se bloquea solamente ese empleado. **Revisar cuotas pendientes** muestra motivo, número e importe; confirmar relee los préstamos y exige que coincidan con la vista previa. No aplica la cuota al préstamo: el cierre transaccional conserva ese único efecto. Un snapshot de cuotas ya existente no se reemplaza durante actualización ordinaria.

**Buscar y actualizar conciliaciones** ahora descubre comisiones huérfanas nuevas (incluidas ambiguas y de empleados ausentes), mantiene su aviso global y permite cerrar a los sanos. La consulta completa de comisiones se conserva para no perder documentos legacy sin estado. Es deuda de escala, no una optimización terminada; las consultas previas tampoco excluyen inserciones concurrentes.

## Tercera revisión: reversión del devengo y motivo de préstamo

Si una comisión tardía elevó el devengado de cero y luego se anula, actualizar limpia la solicitud de revisar cuotas únicamente cuando vuelve a devengado no positivo y no existen cuotas capturadas. Las comisiones sin fecha mantienen su propio bloqueo. Prueba completa: cero → 3,000 → anulación → cero → cierre, con otra comisión sin fecha durante el recorrido.

Confirmar cuotas compara también el motivo con la vista previa, lo revalida en la lectura transaccional y persiste el motivo del documento leído. Un cambio exige revisar de nuevo.

La interfaz explica el límite de los snapshots: actualizar comisiones no agrega préstamos creados después de generar una nómina con devengado positivo. Esos préstamos requieren revisión administrativa antes del cierre; no se agregó un cargo automático ni una nueva política de descuentos.
