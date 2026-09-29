# Entrega para revisión independiente

Estado: candidata local construida y firmada; publicación retenida. Este documento no equivale a una autorización de publicación ni a una revisión realizada por Claude.

## Qué revisar

1. Portada pública: selección reparación/mantenimiento/equipo, conservación de datos, WhatsApp central +1 849 564 6767, navegación por teclado y movimiento reducido. La escena usa ilustraciones fotográficas; no es un modelo 3D ni un despiece real. Activación CMS pendiente.
2. Menú lateral y controles: accesos por rol, cierre del grupo activo, flecha sin recorte, arrastre de IA sin abrir accidentalmente el chat, foco y preferencias de movimiento en vivo.
3. Clientes/Empresas: tarjetas móviles, formulario, ubicación compartida guardada explícitamente desde el chat, conservación de la ubicación anterior si falla el guardado.
4. Asistente de servicio: interruptores desactivados por defecto, recogida breve de datos, paso a humano, pausa al intervenir una persona, presupuesto atómico, deduplicación y tratamiento de envíos ambiguos. No hay autorización para enviar mensajes reales como parte de esta revisión.
5. Reparto: control independiente de la IA; equipos reales todavía sin configurar. Cliente existente conserva equipo; nuevo cliente verificado se reparte por carga. Un teléfono escrito en una solicitud pública no demuestra identidad y no debe modificar la cartera de otra persona.
6. Formularios y archivos públicos: App Check, validación en servidor, cuotas, reintentos, permisos de subida limitados, rechazo de rutas/URLs ajenas y cierre de escritura anónima directa. Verificar orden de publicación; no activar reglas que rompan clientes antiguos antes de desplegar sus reemplazos.
7. Jornada/GPS: revisar correcciones locales frente a los fallos físicos documentados. Compilar Android no prueba seguimiento en segundo plano.

## Fuentes de evidencia

- `2026-09-28-cierre-visual-local.md`: capturas y pruebas visuales web/móvil con datos ficticios.
- `2026-09-28-bot-runtime-integrado.md`: pipeline y pruebas del asistente.
- `2026-09-29-formularios-publicos-seguros.md`: contratos de subidas y limitaciones de infraestructura.
- `2026-09-28-verificacion-global-candidata.md`: resultados por pasada; usar la última fecha, no sumar suites superpuestas.
- `../sprints/ENTREGA-INTEGRAL-2026-09-28.md`: alcance y decisiones.

## Bloqueos que deben conservarse visibles

- Falta prueba controlada real de firma, CORS y subida desde navegador/Android. Los mocks no certifican ese circuito.
- Falta revisión externa de Claude. Las revisiones internas están documentadas por separado.
- Samsung bloqueado en la última observación: no hay prueba física nueva de esta candidata ni instalación final.
- Falta configurar integrantes reales, activar de manera controlada IA/reparto y verificar credenciales/modelo/envío. Todo queda apagado.
- Aprendizaje supervisado: propuesta manual para revisión; no entrenamiento automático ni exposición de conocimiento interno a clientes.
- La auditoría de 48 accesos no certifica todas las operaciones contables ni todos los roles. No hay material final 3D/video ni fotos reales del equipo.

## Instrucción de revisión

Revisar en modo lectura el diff y los informes. Identificar fallos reproducibles, archivo y línea, impacto, escenario y prueba faltante. Diferenciar bloqueantes de publicación, riesgos y mejoras. No editar, enviar WhatsApp, modificar datos reales, instalar, hacer commit, push o desplegar durante la revisión.

## Ajustes de cierre relevantes

- La cuota de citas nuevas deja de tratar cualquier segundo envío del mismo teléfono como una repetición. Se deduplica la solicitud exacta; solicitudes distintas se permiten con un límite técnico configurable de cinco por hora por teléfono y 500 por hora global. No son cifras de negocio confirmadas por Jorge.
- Cambio de configuración mientras un trabajo del asistente espera: debe dejar el caso visible para atención humana, incluso si cambia entre recuperar y reclamar el trabajo.
- Respuesta de subida perdida: se conserva el permiso del mismo archivo/campo y se intenta completar la operación; no se consume una nueva reserva ni se repite una escritura ya realizada.
- Evidencia visual adicional: `evidencias-mejoras-20260927/bot-reparto-independiente.png` muestra los dos controles separados.

## Resultado final local, 28/09/2026

415 pruebas generales aprobadas; TypeScript web/API, web y recursos móviles compilan. Revisión independiente interna GO local: 19 runtime, 17 backend público, tres reintento/firma y 660 denegaciones esperadas. Suites separadas, no sumar como una sola batería. Lint sin errores, 354 advertencias del repo y siete al revisar API explícitamente. Regresión conserva P-005/P-013 por reglas sin publicar. Véase `2026-09-28-cierre-integrado-final.md`.

APK candidata local: `/Users/jorgeluisbritogarcia/.codex/artifacts/mister-service/2026-09-28/mister-service-rd-1.0.17-candidata.apk`.
- Identidad `com.misterservicerd.app`, versión1.0.17, código18; firma previa conservada.
- SHA256: `c0ef4153b7beffaa2d8eedc7bde405dd6f34e2b50ec64cf4e7fde59a08415373`.
- 16.253.895 bytes. Android assembleRelease completado; apksigner verifica v1/v2/v3. Informe completo de firma conservado en el directorio de artefactos, incluidas sus advertencias META-INF.
- 236 recursos canónicos comparados byte a byte con dist-mobile, sin diferencias y sin APK anidadas. 37 copias numeradas con espacio en el nombre no están empaquetadas ni referenciadas por HTML/JS/CSS canónicos; no se usan como evidencia de recursos funcionales.
- Primera compilación interrumpida porque Gradle se quedó leyendo un archivo temporal duplicado en node_modules/@capacitor/local-notifications/android/build. Se apartó esa carpeta generada a /tmp como respaldo y se regeneró; segundo build completo PASS.
- No se instaló por USB, no se publicó y no se certifica GPS/cámara físicos. Esta candidata necesita un servidor compatible antes de probar los flujos nuevos. No entregarla como actualización de producción todavía.

## Instalación USB autorizada — 28/09/2026, 23:37 RD
Jorge pidió «instala la apk en el samsung». adb install -r terminó Success; paquete com.misterservicerd.app confirma versión1.0.17/code18 y actualización23:37:16. No desinstalación ni borrado de datos. MCP abrió la app y observó Dashboard con sesión existente, menú y navegación inferior. Esto verifica instalación y apertura, no GPS/IA/subidas ni todos los flujos. Servidor sin desplegar; siguen pendientes de compatibilidad y publicación documentados. Fuentechat01a0e013-8ae2-7ed0-be3e-23142f7e2ae3.
