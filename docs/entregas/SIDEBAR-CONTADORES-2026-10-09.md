# Contadores del menú — 2026-10-09

✅ Verificado en código: el menú muestra `0` cuando la suscripción entregó datos; mientras carga o si falla muestra `—` con descripción accesible. El error no se presenta como ausencia de pendientes.

Se conservan las fuentes existentes: conversaciones sin leer, citas por confirmar, solicitudes pendientes, órdenes con propuesta pendiente, órdenes con sugerencias, órdenes con pagos sin verificar y órdenes enviadas a facturación sin conduce emitido. La bandeja de facturación filtra `enviadaAFacturacion` y excluye `facturada` y `eliminada`, igual que su página.

Las piezas pendientes y las órdenes en espera se muestran por separado (`P` y `O`); se retiró la suma por sección que mezclaba unidades. No se inventaron totales para clientes u otros módulos sin fuente. Las suscripciones de los cinco contadores antes incondicionales ahora siguen los mismos permisos/roles de sus destinos. No se añadieron lecturas masivas ni permisos.

Archivos: `src/components/Sidebar.tsx`, `src/navigation/badgesSidebar.ts`, prueba unitaria nueva y adaptaciones de los dobles de Sidebar en pruebas de integración/manuales.

✅ Verificado: TypeScript sin errores tras corregir el genérico Query; ESLint sin errores ni advertencias; 3 pruebas unitarias de contadores y 10 pruebas de navegación/Sidebar aprobadas. Avisos de futuras opciones de React Router no afectan los resultados.

⏳ Pendiente, responsable Codex/Dot: comprobación visual en web y Android tras integración. No se enviaron mensajes ni modificaron datos ni se publicó desde este subtask.

— Codex

## Totales autorizados, continuación

✅ Verificado en implementación: administración/coordinación consultan `/api/sidebar/conteos` con Auth y App Check; Android utiliza el origen propio de su runtime y ahora exige App Check también para esta ruta. Clientes/clientes y responsables comparten total de clientes activos; empresas muestra empresas activas (administración); órdenes muestra no eliminadas; Agenda muestra órdenes agendadas hoy; Centro muestra abiertas del día. Se conservan gates de clientes/órdenes y no se añadió un total de inbox.

Consulta cada 60 segundos mientras la página sea visible, sin solicitudes superpuestas y con límite de 45 segundos para la cadena completa de autenticación/consulta. Cambio de UID o permisos cancela e invalida respuestas anteriores. El contrato valida enteros no negativos, fecha de República Dominicana y antigüedad máxima de dos minutos; datos ausentes, error o carga muestran guion, nunca cero inventado. Al volver a visible se consulta de nuevo con estado cargando.

✅ Verificado: TypeScript y ESLint aprobados; 3 tests de badges, 6 tests Sidebar y 3 pruebas de contrato/transporte/lifecycle aprobados. El test de hook verifica cabecera App Check, exclusión de requests superpuestos, cambio UID y revocación de permisos. No se efectuó tráfico con cuentas reales ni validación del proveedor móvil.
