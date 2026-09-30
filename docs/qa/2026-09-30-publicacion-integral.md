# Publicación coordinada — 30 de septiembre de 2026

## Alcance y autorización

Jorge autorizó terminar los lotes, coordinar trabajo pesado con Claude y desplegar antes de regresar para probar el Samsung. Esta autorización reemplaza la restricción anterior de candidata sin publicar. No se enviaron mensajes a clientes ni se conciliaron importes históricos por inferencia.

## Cambios de esta entrega

- Panel principal: cobros confirmados desde los pagos de órdenes, con la misma proyección compartida por los módulos financieros. Conserva los datos crudos para detectar fechas e identidades ausentes.
- Gastos y cobros usan el mismo período en hora dominicana. Un gasto de fecha conocida fuera del período no invalida su cobertura. Los registros sin fecha quedan pendientes de revisión.
- El balance muestra que es provisional cuando hay incidencias o falló la carga de información. Permite abrir las órdenes afectadas.
- Estado de Resultados: aviso de posible doble conteo entre costos de piezas y gastos de repuestos. No elimina importes automáticamente.
- Nuevas pruebas de pagos antiguos: reparación de identidad/fecha, permisos, auditoría y confirmación simultánea sin duplicar el registro de confirmación.
- Guía de descarga identifica correctamente el sistema real y ofrece la aplicación oficial actualizada.

## Infraestructura publicada

- Web y API compiladas y publicadas en los dominios oficiales. Última promoción registrada abajo.
- Firestore y Storage publicados mediante scripts oficiales; archivos de constancia actualizados. Hash Firestore: `6247be7ebefd36515c5e1a88793f911c17983c37717b2c20d081d4eae0f3f9eb`. Storage: `7741e9031ddfafae7bcbf85e0671441927050af6f2c7298d0a53906301438f51`.
- CORS del bucket permite PUT desde los dos dominios oficiales, conservando la configuración anterior. Cambio protegido por metageneration.
- Trece índices remotos coinciden con la configuración local. Se agregaron tres del procesamiento de servicio y se conservó el índice remoto de empresas aliadas. No se activó el bot.

## Verificación realizada

| Área | Evidencia y límite |
|---|---|
| Integración | 834 pruebas aprobadas en 144 archivos después de la revisión final del panel. |
| Firestore | Claude ejecutó 184 pruebas aprobadas; 3 de Storage omitidas en esa ejecución, que levantó solo Firestore. Las 13 nuevas de conciliación también pasaron por separado. |
| Regresiones | Todos los cazadores aprobaron sin coincidencias. |
| Calidad del panel | Revisión independiente de cambios y lint de los tres archivos: sin errores ni advertencias. |
| Subida pública real | Reserva, PUT y completar devolvieron 200; foto visible. Repetido después de publicar reglas. SVG, PDF no admitido y tamaño excedido rechazados; segunda escritura exacta con la misma firma devolvió 412. |
| Sitio público | Seis rutas respondieron 200 sin desbordamiento documental a 390 y 1440 píxeles. |
| Búsqueda | Misma orden encontrada por número sin guion, apellido sin tilde, modelo y teléfono con guiones. |
| Módulos administrativos | Carga de operaciones, finanzas, personal, marketing, formularios, inventario y conocimiento sin errores de consola en la sesión revisada. Es prueba de carga, no de todos los formularios y permisos. |
| Samsung | Los cuatro controles de salida de la IA pasaron físicamente esta mañana en 1.0.18. Las versiones posteriores requieren la prueba conjunta indicada abajo. |

Las pruebas públicas generaron pequeños archivos de prueba y registros de autorización/cuota; no crearon órdenes, citas ni pagos. No se borraron archivos ajenos.

## Coordinación efectiva

Claude Code, usando la suscripción Max, realizó auditoría, corrección financiera, pruebas con emulador y las dos pasadas del panel. Codex contrastó sus resultados con el código, corrigió el límite de período de gastos y los textos de usuario, ejecutó la suite completa, administró infraestructura y compilación móvil, y revisó el sistema publicado. La auditoría inicial de Claude contenía ausencias incorrectas sobre búsqueda y seguimiento; fueron corregidas en su informe y no se usaron como hechos.

## Pendientes para aceptar el sistema completo

1. **Samsung desbloqueado:** cámara y fotos, teclado, conversación activa de IA, notificaciones y GPS con pantalla apagada/cambio de aplicación. El teléfono quedó bloqueado durante la instalación; no se intentó eludirlo.
2. **Recorrido conjunto con cuentas de prueba:** solicitud → asignación → diagnóstico → cotización → aprobación → pieza si corresponde → trabajo → pago registrado y confirmado → conduce → garantía y valoración. Probar también cancelación, reprogramación, repetición y dos usuarios.
3. **Datos administrativos:** revisar pagos antiguos incompletos y posibles compras de piezas duplicadas. Los avisos actuales requieren documentos de respaldo para conciliar. No son importes que deba inventar el software.
4. **Configuración comercial:** actualmente no hay calendarios públicos configurados; el directorio de suplidores revisado está vacío. Completar con datos reales autorizados. WhatsApp automático depende de configuración y plantillas aprobadas y sigue sin activarse.
5. **Apple:** esta publicación es web y Android; no certifica una publicación en App Store. Continúa el trámite empresarial correspondiente.

## Guion breve al regreso de Jorge

- Desbloquear el Samsung y confirmar la versión instalada.
- Abrir la IA desde una orden, escribir sin enviar una acción de negocio y salir con flecha, minimizar, X y Atrás. Verificar que vuelve a la misma pantalla.
- Probar foto y ubicación en una orden expresamente de prueba.
- Iniciar jornada de prueba, apagar pantalla/cambiar de aplicación y comprobar el seguimiento desde administración; cerrar jornada y comprobar que se detiene.
- Ejecutar el recorrido de servicio con importes ficticios controlados, conservar evidencias y excluirlo de la nómina/caja reales según el protocolo de pruebas.

## Evidencia y recuperación

Evidencias privadas en `~/.codex/artifacts/mister-service/2026-09-30/coordinacion/`: informes de Claude, pruebas, despliegues, CORS antes/después y respaldo de Git. Los archivos de configuración privada están excluidos del respaldo Git y de la publicación.

El respaldo local usa `codex/publicacion-integral-20260930`, conservando la rama y el área de preparación originales. La versión web anterior verificada es `mister-service-dzcggzzrf-mister-service-rd-team.vercel.app`, disponible como referencia de reversión de la última corrección del panel.
