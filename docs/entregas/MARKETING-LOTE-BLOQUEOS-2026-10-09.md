# Marketing por lote: evidencia y bloqueos — 2026-10-09

Auditoría de código, sin consultar cuentas Meta, enviar mensajes, preparar campañas reales ni crear plantillas.

## Lo existente

✅ Verificado: `src/components/clientes/TabReactivacion.tsx` prepara audiencia, aplica filtros y cooldown, crea campaña y avisa expresamente que no envió mensajes. `FiltrosSidebarClientes.tsx` permite cartera A/B. `src/services/campanasMarketing.service.ts` valida teléfonos/duplicados, conserva snapshot de audiencia y auditoría de creación/override; el cooldown por defecto es 30 días. La plantilla de `config_marketing/plantillas` es un borrador local, sin evidencia de aprobación Meta.

✅ Verificado: `ModalLinksWhatsApp.tsx` abre la conversación empresarial completa; no llama al envío ni marca la campaña enviada. Muestra el bloqueo de lote por consentimiento y plantillas. El servicio `marcarClienteEnviado` conserva una función heredada de marcación manual, pero la UI actual no la invoca. No usar esa función como prueba de aceptación por Meta o entrega.

✅ Verificado: `api/whatsapp/webhook.ts` y `api/_lib/preferenciasMarketing.ts` capturan bajas inequívocas (por ejemplo `stop`, `baja`, `no deseo promociones`) y guardan `whatsapp_opt_outs/{wa_id}`, array legacy y auditoría. `api/whatsapp/send.ts` bloquea por esa colección, array legacy y `clientes.optOutMarketing`; si no puede comprobar la baja, falla cerrado. Es un control de exclusión; no demuestra autorización positiva para marketing.

❓ Sin verificar: aprobación/categoría/idioma/componentes de una plantilla de marketing real en la WABA. El envío genérico no acredita esta aprobación; el comentario del endpoint indica que no valida contra cache de plantillas. El gate específico de horarios aprobado en vivo no cubre campañas.

## Bloqueos antes del lote

⏳ Pendiente — Jorge: indicar qué clientes tienen autorización comprobable para recibir marketing y cuál es su fuente/fecha/alcance. La búsqueda dirigida de `consentimiento`, `optIn`, `opt_in`, `marketingConsent` y `consent` en `api/` y `src/` no encontró un registro positivo de consentimiento; solo el aviso UI. Tener el teléfono, pertenecer a A/B, haber solicitado servicio o no haber pedido baja no acredita esa autorización.

⏳ Pendiente — Codex/Claude: definir y verificar el contrato de consentimiento positivo y revocación por cliente/canal, conservando evidencia; revisión de plantilla efectiva en Meta y restricciones vigentes antes de implementar. No convertir clientes importados automáticamente en autorizados.

⏳ Pendiente — Codex/Claude: lote servidor con revisión humana de audiencia y mensajes; revalidación de permisos, cartera vigente, consentimiento, baja y cooldown por destinatario; plantilla aprobada con esquema exacto; reserva/idempotencia; límites y progreso; fallo parcial y reintentos sin duplicados. Separar preparado, aceptado por proveedor, entregado y fallido. Registrar cooldown/contacto solo con evidencia real de aceptación según regla definida, no al abrir chat.

Código preparable sin envíos: contrato y UI de elegibilidad, preview de lote, registro de exclusiones y tests con dobles. Hasta resolver la evidencia de consentimiento y plantilla, mantener lote bloqueado. No se solicitó ninguna plantilla ni se modificó producción en esta auditoría.

— Codex
