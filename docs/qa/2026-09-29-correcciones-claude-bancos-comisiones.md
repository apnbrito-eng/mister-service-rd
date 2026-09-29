# Correcciones Claude — Bancos y conciliación de fecha de comisión

## Bancos (puntos 3/4/6)

La proyección acepta transferencia, tarjeta, link y otro con bancoId coincidente. Se comprobó `MetodoPago` en src/types/index.ts:365; `PagoOrden` y escritor CRM api/crm/orden.ts:516 siguen restringidos a tres métodos. Se amplía lectura cruda, no se modifican escritores ni tipos.

Se retiró la comparación y sus cifras derivadas: comparaba el mismo array consigo mismo y no ofrecía verificación independiente. Se mantienen totales confirmados, pendientes e incidencias. Pruebas de banco ahora 28 casos.

Permisos pendientes documentados también en lote2-bancos: prestamos_empleados read esStaff (rules517–520, roles82–87) y avances create/update esStaffOficina (503–506, roles90–94). No se modificaron rules ni datos.

## Acción admin de conciliación

Archivos:
- src/services/conciliarFechaComision.service.ts
- src/components/ConciliarFechaComisionFormulario.tsx
- src/pages/Comisiones.tsx (formulario explícito dentro pendientes de conciliación)
- tests/integraciones/conciliar-fecha-comision.test.ts
- tests/manual/conciliar-comision.html y conciliar-comision-preview.tsx

Servicio usa auth.currentUser.uid real y tx lee usuarios/{uid}, exigiendo rol administrador y activo===true. Guard estricto deliberado; perfiles antiguos sin activo o solamente personal requieren revisar su cuenta, no se asume permiso. La UI de coordinadora sigue leyendo incidencias pero no ofrece acción.

Tx relee comisión: fechaCobro debe ser inválida/ausente; estado pendiente (incluido legacy sin estado); no anulada y sin liquidacionId/liquidadaEn/liquidadaPor. Escribe fechaCobro y quincenaAsignada derivada del día elegido; no modifica importe. Auditoria_admin append con actorUid, motivo, fecha anterior descriptiva, fecha nueva y quincenas. Si auditoría falla, nada persiste. Si otro usuario fija fecha válida, el reintento falla sin sobrescribirla. No establece fecha automática ni inventa fecha histórica.

La etiqueta de negocio es devengo; `fechaCobro` es el nombre del campo heredado. Fecha elegida ISO día RD y cortes de quincena reutilizados, sin cambiar reglas salariales.

### Límite de autorización existente

Este servicio verifica perfil y la UI restringe la acción, pero Firestore comisiones conserva write esAdminOCoord: no afirmamos que SDK directo de coordinadora esté impedido a nivel de reglas. Auditoria_admin exige actorUid/solicitanteUid autenticado y es append-only (rules972–981). Endurecer permiso granular y exigir auditoría para otras rutas sigue pendiente de diseño/pruebas de reglas, sin cambios aquí.

### Verificación y fixture

Vitest dirigido cubre rollback auditoría, dos correcciones concurrentes, motivos/fechas inválidas, admin/inactivo/sin sesión, legacy sin estado, liquidada/anulada/origen previo, y cortes15/30. TypeScript aprobado. ESLint cero errores (fixture tiene warning Fast Refresh de archivo de entrada).

QA local: abrir `/tests/manual/conciliar-comision.html` bajo Vite. Formulario real con callback simulado, sin Firebase ni datos reales; fecha/motivo obligatorios, cancelar, estado guardando y resultado simulado. No representa prueba de escritura en producción.

No publicación, migración, cambios reales de comisiones ni Git.

## Resultado final y apoyo asistencia

- Banco 28 + conciliación 17: **45/45 pruebas aprobadas**.
- `npx tsc --noEmit`: limpio tras cambios.
- `tests/rules/asistencia-api.rules.test.ts`: nuevo caso de nómina mixta omite cerrado/bloqueado/pagado legacy y aplica sólo listo; conserva documentos omitidos, no bloquea lote, conserva neto negativo (-40), reintento no duplica descuento.
- Emulador `demo-mister-service-rules`: **4/4 tests API asistencia aprobados**, comando `npx firebase emulators:exec --only firestore --project demo-mister-service-rules 'npx vitest run --config vitest.rules.config.ts tests/rules/asistencia-api.rules.test.ts'`. API no modificada en esta tarea. Log `/tmp/asistencia-api-lote2.log`.
