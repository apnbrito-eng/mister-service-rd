# Inbox: cliente independiente y continuidad de ficha

## PRE-CHANGE y touch-list expandido

Autorización del coordinador para implementar, 2026-09-29. Antecedentes archivist: c8b81d5 (drawer no tapa chat), a3b56bf/P-014 (deduplicación), b6486e4 (soft-delete), d62ded1 (internacionales rechazados sin truncar), 381805c (direcciones múltiples), P-025 (no crear órdenes ficticias).

Ownership: PanelCliente360.tsx, FichaClienteCabecera.tsx, InboxConversacion.tsx, nuevo CrearClienteDesdeChat.tsx, helper puro de resolución resolverClienteFicha.ts, pruebas dirigidas y fixture. Consumidores: InboxConversacion → PanelCliente360 → ficha/editor; hook useOrdenCreateForm recibe cliente existente. Reutilizar buscarOCrearCliente sin alterar normalización global. El componente compartido EditarUbicacionCliente y Clientes.tsx pertenecen a otro builder.

Preservar: permisos clientesCrear/clientesModificar, teléfono completo, cliente canónico, borradores al alternar vistas, direcciones adicionales, ventana WhatsApp24h y handlers de órdenes. Sin envío ni escrituras de datos reales. Apertura sin documento WhatsApp no debe iniciar presencia ni crear conversación. Animar solo transform/opacity con tokens y reduced motion reactivo.
