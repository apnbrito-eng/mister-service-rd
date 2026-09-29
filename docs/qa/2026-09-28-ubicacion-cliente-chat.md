# Ubicación del cliente desde el chat — 28/09/2026

## Implementado localmente
La ficha del cliente ofrece Cambiar ubicación (Agregar ubicación si no tiene coordenadas). Muestra ubicaciones entrantes del mismo chat entre los mensajes cargados, permite elegir, previsualizar y confirmar. Cancelar no escribe; fallo de guardado mantiene selección y mapa anterior. Se guardan lat/lng por el servicio existente, que puede inferir zona cuando estaba vacía; no se cambia dirección escrita ni órdenes históricas. Administración, coordinación, secretaria y operaria conservan permisos existentes. Se rechazan coordenadas no finitas o fuera de rango. Cambiar conversación descarta la selección anterior.

## Verificación
- 11 pruebas de ficha aprobadas, incluyendo 4 nuevas: guardado explícito, error/reintento/cancelación, roles y coordenadas inválidas, cambio de cliente.
- Compilación web y tipos web/API aprobados.
- ESLint de los tres componentes/página sin errores; diff sin errores de espacios.
- Sin cambios a datos reales. Pendiente publicación y prueba visual web/Android de esta función. No se ha generado APK con este cambio.

## Archivos
- src/components/inbox/FichaClienteCabecera.tsx
- src/components/inbox/PanelCliente360.tsx
- src/pages/InboxConversacion.tsx
- tests/integraciones/panel-cliente-inbox.test.ts
