# Mensajería y apertura móvil — 24/09/2026

## Cambios
- «Todos» en tiempo real, consulta ordenada por última actividad antes de limitar. Carga inicial25, ampliable. La lista lateral también limita después de ordenar.
- Historial: últimas50 entradas y50 salidas; ampliación por bloques, espera ambos snapshots para evitar dibujar media conversación; preserva desplazamiento al ampliar. Enlaces al mensaje del expediente recuperan ese mensaje directamente.
- El panel del cliente no carga oculto en móvil. Ficha seleccionada ocupa la pantalla sin quedar debajo de la lista. Panel con nombres más claros y acceso a orden completa.
- Visores por petición para fotos, vídeos, documentos y stickers; enlaces web y Maps. Contactos, respuestas de botones y reacciones legibles. Tipo realmente desconocido mantiene aviso y no inventa contenido.
- Archivado privado de imágenes, vídeo, audio, documentos y stickers en orden/expediente; verifica correspondencia del teléfono. Enlaces firmados renovables al abrir evidencia. Restricciones MIME, origen HTTPS Meta y tamaño durante descarga.
- Micrófono22px dentro de círculo36px con área táctil44px; conserva indicadores de grabación.
- APK excluye instaladores anteriores: aproximadamente16MB frente31MB anterior.

## Verificación
- 234 pruebas generales más2 pruebas de consulta/orden en vivo:236 aprobadas. TypeScript frontend/API y compilaciones web/Android. Lint dirigido sin errores; advertencias previas de tipos any/ref en componentes extensos.
- Emulador Android, ensayo: apertura de6 módulos principales y29 adicionales sin overflow horizontal ni fallback de carga en las observaciones de1–1.5s. Esto es smoke de apertura, NO benchmark ni todas las operaciones/roles.
- Dos conversaciones ficticias2025550181/0182: actualización de0181 cambió vista previa y la subió al primer lugar sin recargar. No se enviaron WhatsApps.
- Mensaje interno ficticio qa_mensajeria_20260924_1: llegó al timeline en vivo. Pulsar su enlace abrió Google Maps nativo; CRM conservó su ruta.
- Índices producción y ensayo creados; comprobados READY. Índice remoto adicional conservado.
- Producción conserva firma y appId. APK1.0.5/code6. Verificar descarga tras publicación.

## Límites / pendientes
- Samsung físico no conectado por ADB; iPhone no recompilado en este turno. Prueba de recepción/reproducción real de cada formato y notificaciones con app cerrada pendiente.
- No equivale a paridad completa con WhatsApp. Archivos que Meta no entregue o hayan expirado requieren reenvío. Documentos hasta100MB, otros medios hasta16MB en este servicio, MIME restringidos.
- Otros filtros especializados siguen consultas paginadas del servidor y actualización manual; «Todos» y lista lateral sí son en vivo.
- Revisión funcional integral de todos los módulos, roles, operaciones y volumen real pendiente. Pruebas ficticias no demuestran rendimiento con toda la base real.

APK final1.0.5:15.955.811bytes;SHA256 b9a43329195aab72d56a32123f39d7afdaff7172a9f0d89149abadc8388b8d41. Inspección ZIP: sinAPKsanidados; bundle contiene origen/proyecto real y mobile-production-1.0.5, sin marca mobile-staging. Firma de actualización conservada.
Publicación final Vercel READY: https://mister-service-g0kswgzrd-mister-service-rd-team.vercel.app; alias www.misterservicerd.com. Endpoint media-proxy POST sin sesión devuelve401, sin exponer archivos.
