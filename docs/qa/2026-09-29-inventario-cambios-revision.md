# Inventario de cambios iniciados durante revisión Samsung

29/09/2026. Alcance: identificar trabajo local iniciado antes de la aclaración de Jorge de solo planificar. No es inventario de autoría exclusiva de todo el árbol Git. Hay cambios anteriores y compartidos en los mismos archivos; git status no separa su procedencia. No se ha creado commit ni realizado publicación en esta revisión.

## Archivos de implementación identificados por informes de trabajo

### Clientes
- src/pages/Clientes.tsx
- src/components/clientes/EditarUbicacionCliente.tsx
- src/utils/resolverChatCliente.ts

### Inbox / ficha
- src/pages/InboxConversacion.tsx
- src/components/inbox/PanelCliente360.tsx
- src/components/inbox/FichaClienteCabecera.tsx
- src/components/inbox/CrearClienteDesdeChat.tsx
- src/components/inbox/resolverClienteFicha.ts

### Mantenimiento
- src/pages/Mantenimiento.tsx
- src/utils/fechaMantenimiento.ts
- api/_lib/avisosMantenimiento.ts
- api/mantenimiento/avisos.ts
- src/components/NotificacionesPanel.tsx
- src/types/index.ts (notificación)
- vercel.json (cron local, sin activar)

## Pruebas asociadas identificadas

- tests/integraciones/clientes-canal.test.ts
- tests/integraciones/clientes-ubicacion-editor.test.ts
- tests/integraciones/clientes-compactos.test.ts
- tests/integraciones/inbox-crear-cliente.test.ts
- tests/integraciones/mantenimiento-fechas.test.ts
- tests/rules/mantenimiento-avisos.test.ts
- Ensayos tests/manual/clientes-qa*, tests/manual/inbox* y tests/manual/ia-cierre*. Algunas fixtures tenían trabajo previo; delimitar cambios por contenido antes de incluirlas en un commit.

## Límites de atribución y pruebas

Lista de rutas respaldada por informes previos y estado local; no demuestra que cada diferencia respecto de HEAD provenga de esta pasada. Los cambios recientes de interacción/inert en fichas siguen pendientes de validación. Mantenimiento tiene comprobaciones parciales, sin revisión final ni cron desplegado. IA y búsqueda de órdenes tuvieron diagnóstico en esta pasada, no corrección certificada; sus archivos pueden tener cambios de trabajos anteriores.

Los encabezados antiguos de los informes que dicen autorizado/GO reflejan instrucciones internas emitidas antes de la corrección de alcance, no autorización actual de Jorge para implementar. Se conserva esa historia y prevalece la orden de planificar.

## Cómo guardar sin mezclar trabajos

Antes del commit: cotejar informes, diferencias y dependencias; aislar bloques propios sin borrar ni incluir trabajo ajeno; verificar archivos nuevos requeridos y excluir datos sensibles/artefactos generados innecesarios. Guardar primero el trabajo previo en una unidad identificada si no es técnicamente separable. Los commits de trabajo en curso deben indicar pruebas pendientes, y no equivalen a aprobación ni despliegue. No usar git add de todo el árbol para etiquetarlo como esta revisión. La sugerencia citada de Claude no se ha tratado como orden directa de hacer commit.
