# Avances para revisar con Jorge

La IA volvió a responder en el dominio de pruebas. Se mantuvo Claude; el error inicial era una validación de acceso que el chat no enviaba. No se configuró otro proveedor.

## Mejoras comprobadas
- Respuesta real, saludo breve y reconocimiento de la pantalla actual.
- Consulta de 11 campañas de Mister Service desde Meta en el módulo Marketing.
- Corrección de la selección de órdenes: números repetidos con pruebas eliminadas provocaban respuestas equivocadas. La última comparación recuperó los dos leads vigentes.
- Más contexto registrado: historial de fases, nota de urgencia para administrador y límites explícitos de los resultados.
- Nueva conversación descarta respuestas pendientes de la anterior. La espera de 60 segundos cubre también la lectura de la respuesta.
- Negritas legibles sin interpretar HTML del modelo. Campos del detalle limitados para perfiles de atención.
- 37 pruebas automáticas, compilación y controles previos al commit aprobados. Las pruebas simuladas no reemplazan la validación real por cada perfil.

## Qué falta
La respuesta de prioridades aún puede extenderse demasiado; conviene probarla con preguntas habituales del equipo antes de seguir ajustando el estilo. No se ha validado todo el software ni se garantiza ausencia de fallos.

Pendientes de la integración amplia: pruebas con sesiones separadas de empleados; permisos avanzados y recepción de Instagram/Messenger; validación completa de seguimiento WhatsApp y atribución de anuncios a ventas. La biblioteca usa solo conocimientos aprobados, pero su selección y escala necesitan más evaluación con procedimientos reales.

## Dónde probar y qué publicar
Dominio de pruebas: https://mister-service-rd-mister-service-rd-team.vercel.app. Muestra el aviso de pruebas y usa datos reales; las pruebas realizadas no enviaron mensajes a clientes ni modificaron anuncios, citas o pagos.

El sitio principal no se promovió. La revisión automática rechazó la promoción anterior por falta de validación real y autorización clara para producción. Ahora existen pruebas reales, pero la publicación principal debe resolverse con aprobación concreta del resultado.

Último código: 13e7632, rama integraciones-marketing-conocimiento-20260915. Despliegue de pruebas confirmado READY: dpl_6XBNJQrb7xJF5b1MNasK2yCZR1FQ. Comprobación final: la API devuelve 401 a una solicitud sin validación App Check, como corresponde. El último ajuste de campos por rol está verificado con pruebas automatizadas; faltan sesiones reales independientes de esos empleados.
