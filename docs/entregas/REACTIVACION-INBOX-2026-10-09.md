# Reactivación: conversación empresarial

## Implementado
- Se comprobó que ModalLinksWhatsApp solo lo consume TabReactivacion. Se mantiene el nombre interno para evitar ruptura de imports; su interfaz visible es «Audiencia preparada».
- «Preparar audiencia» conserva la selección/filtros/campaña existente. No anuncia un envío.
- Cada cliente abre la conversación completa en `/admin/inbox/{waId}?clienteId={clienteId}`, mediante el mismo resolvedor exacto de Clientes y el contexto de Atención. No crea conversaciones ni envía al abrir.
- Desaparecen enlaces wa.me, copiar links y la acción manual «Marcar enviado». Abrir el chat no modifica enviado/cooldown.
- Teléfono incompatible bloquea apertura; identidad asociada incompatible muestra error y permite reintento. Apertura concurrente bloqueada por ref.
- Conserva permiso de reactivación y roles administrador/coordinadora. No amplía acceso a secretaria/operaria.

## Pendiente explícito
El envío por lote de marketing NO está implementado por este cambio. Requiere flujo empresarial de plantillas aprobadas por Meta, consentimiento/opt-outs, límites del canal, deduplicación y estado de entrega. La plantilla local que se visualiza como borrador no acredita aprobación Meta. Desde la conversación se usan las funciones empresariales existentes, con sus restricciones; no se copia el borrador automáticamente al compositor ni se envía fuera de ventana.

## Verificación
Tres pruebas React + MemoryRouter: destino completo/contexto, no enlaces externos ni marcado enviado; teléfono incompatible/rol sin permiso; fallo conserva audiencia y reintento. Typecheck frontend y lint del alcance. No QA física, datos migrados ni mensajes reales.
