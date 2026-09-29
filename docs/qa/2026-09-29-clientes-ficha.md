# Clientes: acciones y ubicación

Touch-list autorizado: Clientes.tsx, componentes/clientes/EditarUbicacionCliente.tsx, utils/resolverChatCliente.ts y pruebas dirigidas. Consumidor del editor en FichaClienteCabecera pertenece al otro builder; no se modifica aquí.
PRECHANGE: c8b81d5 preservar chat/drawer, a3b56bf deduplicación, b6486e4 soft-delete, d62ded1 no truncar internacionales. Creación independiente ya usa buscarOCrearCliente; se conserva. No se cambia política telefónica, permisos ni Ordenes.tsx.
Editor guarda lat/lng y zona explícita para evitar inferencia secundaria; conserva dirección textual. Motion solo transform/opacity con tokens y preferencia reducida reactiva. Sin datos reales ni envíos.

Implementación local: dos acciones en cabecera, WhatsApp externo y WhatsApp empresa. Inbox usa roles actuales, consulta vínculo exacto y navega con clienteId sin crear documentos. Si existe vínculo con otro teléfono, informa conflicto. Números no admitidos por normalizador actual se bloquean; no se amplió política internacional.

Ubicación: formulario compartido manual/enlace/ubicaciones recibidas con validación finita y rangos. No expande enlaces cortos ni geocodifica automáticamente. Persiste coordenadas y zona explícita para evitar inferencia; conserva dirección. Fallos conservan borrador; guardado protegido contra doble envío. Creación existente independiente conserva deduplicación y soft-delete.

Movimiento: entrada de ficha y retorno de lista con tokens existentes; lista permanece montada para preservar scroll, retorno restaura foco sin desplazar. Preferencia reducida reactiva, sin animar altura ni importes. QA visual375/1440 y física pendientes de tester/root.

Verificación: cuatro pruebas dirigidas aprobadas; lint dirigido sin errores (warning previo dependencia historial). Tsc inicial limpio; última corrida encontró únicamente cambio concurrente InboxConversacion717 nullable, notificado al propietario para cierre global.
