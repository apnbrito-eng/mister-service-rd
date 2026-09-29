# Correcciones tras revisión de Claude — lote2

Solicitud recibida el29/09/2026, sin publicar. Base preservada en codex/lote2-20260929 (1e21a806). La propuesta externa se contrastó con el código antes de construir.

## Objetivo y criterios
Resolver seis observaciones con evidencia, conservar historia y no ejecutar pagos/ajustes reales. El empleado con datos incompletos debe seguir visible y recuperable sin detener a todos los demás. Ninguna cifra estimada debe confundirse con monto pagable.

## Cambios implementados
1. Cierre por empleado dentro de la misma liquidación. Estados opcionales bloqueado/listo/cerrado compatibles con documentos antiguos. Generación conserva afectados como pendientes; cierre procesa únicamente habilitados, no vuelve a aplicar descuentos a cerrados. Recalcular solamente afectados después de conciliar. El estado global permanece abierto hasta completar todos. Pago, ajustes y asistencia deben respetar cierre individual.
2. Resultado mensual incluye comisionMonto más ajuste de garantía firmado, igual que nómina; prueba cruzada.
3. Historial de bancos acepta link y otro si tienen cuenta identificada; conserva verificación, fechas e incidencias.
4. Retirar diferencia/comparación derivada del mismo array. No ofrecerla como conciliación entre fuentes.
5. Detener cierre cuando descuentos exceden devengado. Mostrar saldo negativo de borrador y aviso; no condonar deuda ni recortar silenciosamente a cero.
6. Documentar permisos amplios de lectura préstamos/escritura avances y limitaciones de publicación, sin cambiar reglas en este lote.

## Decisiones de implementación
No crear liquidaciones complemento: los lectores actuales seleccionan un documento por quincena y podrían ignorar otro o duplicar sueldos. Cierre individual requiere coordinar types, parser/serializador, servicios, pantalla nómina, asistencia y reporte; no basta eliminar al afectado del cálculo.

Conciliar fecha será acción explícita administrativa: fecha verificable, motivo obligatorio y auditoría atómica. No altera comisiones liquidadas, anuladas o cuya fecha ya fue corregida por otro usuario. No reconstruye historia cerrada automáticamente.

## Casos a verificar
Dos empleados, uno bloqueado; cierre/pago del habilitado; reintento no duplica; conciliación y recalcular afectado; cierre final; fallo transaccional; documentos antiguos cerrados; UID distinto de personalId; comisión sin dueño; fecha de otroperíodo; exceso descuentos por cada concepto; ajuste garantía negativo; link/otro por banco; falta de permiso/cambio concurrente durante corrección fecha.

## Estado
Entrega local terminada y revisión independiente aprobada. Sin publicación ni datos reales modificados.

## Evidencia final
- Suite general: 547/547 pruebas, 110 archivos.
- Revisión independiente: 78 pruebas dirigidas; TypeScript web/API y lint aprobados. P030 añade cinco pruebas que detectan regresiones de atomicidad y cierre parcial.
- Emulador Firestore: cierre de nómina 4/4 y API asistencia 4/4, según ejecuciones de builders. Incluye cierre parcial y cuota aplicada una sola vez.
- Compilación web aprobada. Advertencia de tamaño de fragmentos conservada.
- Formulario real de conciliación en fixture sin Firebase: 390px sin desborde, campos requeridos, estado guardando, guardado simulado y cancelación verificados.
- P030/P032/P033 aprobados. P005/P013 siguen fallando por reglas anteriores pendientes de despliegue; no se alteraron reglas ni marcas de despliegue.

## Límites y pendientes explícitos
- UI/servicio exigen administrador activo para corregir fecha; las reglas actuales aún permiten a coordinadoras escribir directamente comisiones. No es una restricción completa de servidor.
- Lectura amplia de prestamos_empleados y escritura de avances pendientes de revisión de permisos: ver informe de bancos/comisiones.
- Historial pagado, cuotas consumidas por otra nómina y comisiones sin dueño o de otro período requieren conciliación. No se reabren pagos ni se inventan fechas.
- Carrera al crear dos liquidaciones de una quincena y conciliación entre Conduces/Gastos/Cierre siguen fuera de estas seis correcciones.
- Guardado como checkpoint local independiente; no entrega lista para publicar y no modifica la rama activa ni su índice.

## Informes complementarios
- [Nómina parcial y ajustes](2026-09-29-nomina-parcial-y-ajustes.md)
- [Bancos, conciliación y permisos pendientes](2026-09-29-correcciones-claude-bancos-comisiones.md)
