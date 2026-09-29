# PRECHANGE — Mantenimiento programado

Lectura únicamente, sin modificar producción ni datos. Estado observado 29/09/2026; preservar cambios locales de Mantenimiento.tsx.

## Hallazgos

- `Mantenimiento.tsx:204–256`: ya exige cliente real y llama buscarOCrearCliente antes de guardar; P025 documenta antecedente de clienteId vacío. Preservar P014 dedup y P006 auth.uid de técnico.
- `Mantenimiento.tsx:143–180`: búsqueda telefónica diferida sin invalidación de respuesta antigua. Una consulta lenta puede reemplazar selección posterior; requiere secuencia/cancelación al cambiar cliente o cerrar.
- `Mantenimiento.tsx:236`: fecha input YYYY-MM-DD se interpreta UTC; mostrarla en RD puede desplazar al día anterior. Clasificación actual a instante (391–393) considera vencido lo que corresponde hoy. Proponer clave de fecha RD, grupos Hoy/Próximos/Vencidos, sin inventar antelación.
- Cabecera `Mantenimiento.tsx:397` flex sin wrap; tarjeta al final usa fila única y acciones flex-shrink-0. En móvil las acciones desplazan y comprimen texto. Distribuir datos arriba y acciones debajo; Programar con ancho disponible y objetivos44px.
- Alta sí vinculada; no hay acción abrir ficha o WhatsApp empresa en la tarjeta. Reusar resolverChatCliente sobre cliente existente por ID. Legacy sin cliente/soft-deleted requiere reparar vínculo explícito; no fabricar ficha al abrir chat.
- `handleGenerarOrden:278–377` es acción manual existente, no cron. Crea orden y adelanta fecha con batch; no posee bloqueo contra doble clic ni idempotencia de ocurrencia. No usar para avisar, no ejecutarlo automáticamente. Si se mantiene requiere revisión aparte de idempotencia y permisos; no eliminarlo silenciosamente.
- No encontré generador servidor de avisos de mantenimiento. `recordatorios.service.ts` cubre rutas/horarios diarios de operarias; no esta programación. `api/movil/avisos.ts` distribuye notificaciones ya creadas a dispositivos, con cron minuto en vercel.json; no detecta mantenimientos vencidos.
- Plantilla `recordatorio_mantenimiento` existe en `plantillasWhatsApp.ts:149`, con cliente/meses/equipo y encabezado configurado. Abrir Inbox y selector para humano; ningún envío al abrir ni envío cron. Aprobación Meta actual no verificada en esta lectura.
- `NotificacionesPanel.tsx:54–57` solo enruta conversación/orden. Agregar mantenimientoId tipado y ruta interna fija para navegar a programación sin aceptar URL arbitraria.

## Plan mínimo y touch-list propuesto

1. Mantenimiento.tsx y helper propio de fechas: tarjetas responsive, Hoy/Próximos/Vencidos, buscar/seleccionar cliente real, abrir ficha e Inbox por helper existente, carrera lookup corregida. Preservar alta independiente, dedup, UID y handlers manuales mientras se define su reemplazo.
2. Servicio servidor nuevo `api/_lib/avisosMantenimiento.ts` y endpoint cron autenticado `api/mantenimiento/avisos.ts`: leer activos hasta día RD actual, crear notificación interna de forma transaccional con ID hash(mantenimientoId+fechaProgramada+destinatarioUid). Releer activo/fecha antes escribir. Ejecutar otra vez no duplica; reprogramación produce otra ocurrencia. No avanzar fecha ni crear órdenes ni enviar WhatsApp.
3. Destinatario propuesto: responsable válido de cartera; fallback oficina administrativa/coordinación según permisos existentes. Esta selección y hora exacta son decisiones por confirmar con coordinador/Jorge; no inventar destinatarios reales. Puede usarse fecha de vencimiento sin antelación como mínimo, con cron servidor independiente del navegador.
4. Tipos notificaciones + parse existente + NotificacionesPanel para mantenimientoId, vercel.json cron, índices si query los requiere; reglas para control exclusivo servidor si colección nueva. Reusar notificaciones actuales: push físico depende configuración existente.
5. Informe, hunter de fecha/vínculo si se confirma bug productivo y pruebas: concurrente aviso una vez; inactivo/no vencido/fecha modificada no avisa; RD medianoche; clientes eliminados; teléfono no admitido; permisos; ausencia de llamadas send/crearOrden; 375/1440 sin corte, navegación ficha/chat y borrador conservado.

No tocar Ordenes.tsx, cálculos ni canales de envío. No cerrar regla/deploy lock artificialmente. Configuración cron/índices y prueba de notificación real quedan pendientes antes publicar.

## GO builder
Touch-list ampliado autorizado: Mantenimiento.tsx, utils/fechaMantenimiento.ts, api/_lib/avisosMantenimiento.ts, api/mantenimiento/avisos.ts, src/types/index.ts (tipo/campo notificación), NotificacionesPanel.tsx, vercel.json (solo cron), pruebas y cazador si corresponde. Destinatarios: administración/coordinación activos y responsable de cartera válido de oficina. Antelación cero explícita; sin WhatsApp automático ni orden automática. Preservar cambios concurrentes y asignación por UID.
