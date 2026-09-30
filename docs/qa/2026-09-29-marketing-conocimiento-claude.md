# Marketing, seguimiento, conocimiento y precios — entrega Claude (Cowork)

29/09/2026. Local, sin publicar ni commit. Sin envíos, campañas, cambios de configuración externa ni escrituras de datos. No se tocaron App/Sidebar, tipos centrales, finanzas, Personal, Citas/Solicitudes, IA flotante, reglas ni APIs.

## Qué cambia para el usuario

**Marketing y seguimiento (`/admin/marketing`, admin y coordinadora)**
- Barra "Seguimiento y herramientas" con accesos a Inbox, Clientes y reactivación, Mantenimientos, Solo chequeo, Satisfacción, Conocimiento, Precios y Plantillas de campaña. Cada enlace aparece solo si el rol puede entrar a esa ruta (mismo guard que App.tsx), así nadie ve un acceso que luego le rechaza.
- Nuevo panel **"Seguimiento con evidencia"** con período Desde/Hasta en hora RD. Lee una sola vez al pulsar Calcular, sin listeners:
  1. **Órdenes por origen**: órdenes creadas en el período agrupadas por `metadatosCita.origen` (formulario web, calendario público, formulario dinámico, oficina, garantía). Muestra cerradas, canceladas, con cobro verificado y monto verificado. Las órdenes antiguas sin ese campo salen como "Sin origen registrado"; no se adivina.
  2. **Consultas desde anuncios de Meta**: conversaciones con `origenMarketing` (lo guarda el webhook) por anuncio. Consultas, cuántas tienen cliente vinculado y "órdenes posteriores": solo órdenes del mismo `clienteId` creadas después de la consulta. Se rotula como seguimiento, no como prueba de que el anuncio causó la orden.
  3. **Campañas de reactivación**: contactos preparados, marcados como enviados y reactivados según la medición que ya guarda cada campaña (ventana de 60 días). Si una campaña no tiene medición, muestra "Sin medición", no cero. Avisa si un cliente recibió más de una campaña en el período (control de insistencia).
- Si una fuente no se puede leer (permiso o red), esa sección dice "Sin datos", nunca cero. Registros sin fecha válida se cuentan aparte como incidencia.
- Se conserva el panel de anuncios de Meta existente (solo lectura) y el aviso de que un clic no es una venta.

**Conocimiento (`/admin/conocimiento`)** y **Precios (`/admin/precios`)**: misma barra de accesos relacionados (en Conocimiento, oculta para técnicos). No se cambió su lógica.

## Definiciones (para que coincidan con otros informes)
- Cobro verificado: pago de `orden.pagos` con `verificado === true` y monto > 0; un mismo `id` de pago no se suma dos veces.
- Cerrada: `fase === 'cerrado'`. Cancelada: `fase === 'cancelado'`. Órdenes eliminadas no cuentan.
- Período: días completos en UTC-4.

## Archivos
- Nuevos: `src/utils/seguimientoMarketing.ts`, `src/utils/enlacesSeguimiento.ts`, `src/services/seguimientoMarketing.service.ts`, `src/components/marketing/SeguimientoMarketing.tsx`, `src/components/marketing/EnlacesSeguimiento.tsx`, `tests/integraciones/seguimiento-marketing.test.ts`.
- Editados: `src/pages/MarketingIntegrado.tsx` (las 3 tarjetas fijas pasan a la barra por rol, más el panel), `src/pages/ConocimientoEquipo.tsx` y `src/pages/PreciosServicios.tsx` (1 import + 1 línea cada uno; tenían cambios previos de otros, conservados).

## Consultas y permisos
- `ordenes_servicio where createdAt >= desde`, `whatsapp_conversaciones where origenMarketing.canal == 'whatsapp'`, `campanas_marketing where fecha >= desde`. Filtros de un campo: sin índices compuestos nuevos. Reglas actuales ya permiten estas lecturas a admin/coordinadora.
- Órdenes sin `createdAt` quedan fuera de la consulta por Firestore (limitación conocida, ver CLAUDE.md sobre orderBy/rango).
- Costo: una lectura por documento de las tres consultas por cada cálculo. Con mucho histórico, acotar el período.

## Verificación
En copia aislada (el `node_modules` de la carpeta compartida es de macOS):
- `vitest`: `seguimiento-marketing.test.ts` 7/7 y `consulta-suplidor.test.ts` 30/30. Cubre rango RD, pagos verificados sin duplicar, agrupación por origen, exclusión de eliminadas/fuera de rango/sin fecha, anuncios solo por `clienteId` y después de la consulta, campañas con y sin medición, clientes repetidos y enlaces por rol (admin, coordinadora, secretaria, técnico, sin sesión).
- `tsc` estricto sobre las 3 páginas, los componentes, utils, service y Standby.tsx: 0 errores.
- Pendiente para Codex en la Mac: suite completa, lint, build y QA visual 390 px / Samsung.

## Requisitos documentados, no implementados (necesitan reglas, API o decisión)
1. **Historial de precios**: hoy editar un precio sobrescribe el documento de `precios_servicios`. Guardar versiones exige un campo o subcolección nueva y su regla. Propuesta: subcolección `precios_servicios/{id}/versiones` de solo alta, con actor y fecha del servidor.
2. **Atribución anuncio → orden más fuerte**: `marketing_atribuciones` existe pero no tiene regla de lectura (default-deny). Leerla requiere endpoint de administración o regla nueva.
3. **Gasto publicitario una sola vez**: la inversión solo vive en Meta (consulta en vivo). Guardar un cierre mensual del gasto requiere colección y regla.
4. **Historial común de contactos** entre mantenimiento, solo chequeo y campañas: hoy cada módulo guarda lo suyo; el panel solo detecta repetición entre campañas. Unificarlo requiere colección de contactos y reglas.
5. **Plantillas de WhatsApp aprobadas** (Meta) para iniciar conversaciones: requiere configuración externa y API de envío (fuera de alcance).

No se declara el software terminado.
