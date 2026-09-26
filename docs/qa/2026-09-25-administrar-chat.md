# Administración de conversaciones

Ambas opciones autorizadas por Jorge: quitar del buzón global y eliminar historial, conservando cliente/órdenes/pagos/garantías/expediente.

API administrar-chat: POST solo administrador, confirmación del teléfono, requestId idempotente, auditoría por operación. Ocultar conserva historial y oculta hasta próxima actividad. Eliminar procesa lotes150 en transacciones con cursor persistido; sobrescribe mensajes con metadatos mínimos de deduplicación, elimina texto/raw/media de los registros y limpia previews antiguos. No borra identificadores wamid para impedir reingreso por reintentoMeta. Los mensajes recibidos después del corte sobreviven. Envíosqueued/sending bloquean el lote y permiten reanudar. Conversación conborradoEnCurso permanece visible para reanudar. Órdenes/cliente/expediente no son escritos.

Archivos físicos: se conservan en Storage para evitar romper órdenes antiguas que guardan directamente la URL del archivo original. Se elimina su referencia del chat; NO se implementó purga física de blobs. Tampoco borra mensajes en el WhatsApp del cliente ni copias de seguridad. Acciones personales previas continúan aparte.

Frontend: menú mantener pulsado/opciones; bloque Administración solo administrador; confirmación independiente; menú móvil conscroll, cierre bloqueado mientras procesa; filtros globales en lecturas de bandeja, tombstones excluidos del historial.

Pruebas: 257/56integración pasan, TypeScript frontend/API y bundleproducción. Se probaron autorización, ocultaciónsinpérdida, eliminaciónidempotente, órdenes/expedienteintactos, mensajesnuevos/chatsajenos, múltipleslotes yenvíospendientes. No se borraron conversaciones reales para probar. Falta validación táctil en Samsung y prueba conemuladorFirestore real; tests servidor usanmocktransaccional. Publicación pendiente al redactar.

Publicación completada g91l15cw1: APK1.0.8 remotoHTTP200,tamaño15963062 ySHA256idéntico local; guía actualizada; POSTadministrar-chatsinsesión401. Emuladorinstalaciónsinborrar ylaunchcorrectos. Nochatrealborrado.
