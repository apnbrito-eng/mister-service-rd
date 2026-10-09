# Carteras A/B: integración preparada

## Implementado en código
- Traslado autorizado e idempotente con motivo y auditoría server; historial en Clientes.
- Altas operativas autenticadas invocan alternador transaccional del servidor. No hay reparto de datos ejecutado.
- Inbox Todos sigue disponible. Carteras A/B consultan clientes canónicos paginados, no infieren equipo por orden ni por técnico. Localizan chats por clienteId o teléfono y deduplican resultados.
- Secretaria/operaria inicia en su equipo si gestion_accesos contiene A/B; puede seleccionar Todos u otro equipo.
- Badges A/B indican conversaciones sin leer, calculadas sobre todos los chats sin leer, no solo páginas cargadas.
- Mapa y Reactivación comparten filtro de cartera. Campaña conserva carteraEquipo en snapshot de criterios; selección final se intersecta con clientes que cumplen filtro.

## Pendientes y límites
- Reparto inicial 50/50 requiere migración controlada revisada; no ejecutada.
- Alta del cliente y llamada de asignación son dos pasos; una falla deja cartera pendiente, avisa al operador y el reintento recupera sin consumir turno adicional.
- Campañas existentes todavía generan enlaces en ModalLinksWhatsApp. El filtro de audiencia funciona, pero NO equivale a envío por WhatsApp empresarial. Migrar ese compositor al flujo empresarial de plantillas aprobadas y consentimiento antes de dar este bloque por completo. No se enviaron mensajes.
- Inbox A/B pagina clientes (25), por lo que una página puede tener cero conversaciones; Cargar más continúa recorriendo clientes.
- No comprobado runtime en producción, Firebase Emulator, navegador o APK.

## Verificación
Frontend/API typecheck pasa. Cuatro pruebas unitarias cartera y una filtro pasan; seis pruebas integración conteos pasan. Lint del alcance pasa, incluyendo Inbox; respuestas API tipadas y generación de cleanup documentada.

## Auditoría de escala y ordenamiento
- `leerHistorialCartera` consulta únicamente `clientes/{id}/cartera_historial`, ordena timestamp y limita 20. Los dos archivos escritores (`api/_lib/carteraClientes.ts` para alta/traslado; `scripts/migraciones/repartir-cartera.ts` para reparto) siempre escriben timestamp servidor. No ordena la colección raíz clientes ni excluye clientes importados sin createdAt.
- `/api/crm/bandeja` A/B pagina 25 clientes por solicitud; por página cruza IDs y teléfonos de esos clientes. No descarga los 9,000 clientes para el filtro o contador.
- `obtenerConteosBandeja` lee todos los chats sin leer y órdenes del día, como antes, y agrega lecturas de clientes vinculados a los chats sin leer en grupos hasta 100 y búsquedas por teléfonos hasta 30. Coste crece con chats sin leer, no con la cartera entera. Se refresca cada 15 segundos; revisar agregados/caché si aumenta ese volumen. No se añadió consulta completa a clientes para badges.
- La pantalla Clientes mantiene su listener completo preexistente (~9,000 documentos) compartido por lista/mapa/carteras/reactivación; primera carga y memoria siguen creciendo con la base. La nueva pestaña reutiliza ese listener y limita render 100 por columna; esto reduce DOM, no las lecturas iniciales. Pendiente paginación/contadores agregados del módulo Clientes si crece la base. No se afirma solución completa de escala.
