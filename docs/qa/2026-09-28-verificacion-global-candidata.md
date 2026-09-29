# Verificación global de la candidata local

28/09/2026, ejecución iniciada a las 21:41, hora local. Resultado sobre el árbol compartido de esta pasada; no identifica una publicación ni certifica cambios posteriores.

## Resultados ejecutados

| Comando | Resultado |
| --- | --- |
| `npm run test:integraciones` | 379 pruebas, 83 archivos, todos aprobados; 13,16 s; salida 0 |
| `npm run build` | TypeScript web y API aprobados; Vite completado en 10,19 s; salida 0 |
| `npm run lint` | 0 errores, 340 advertencias; salida 0 |
| `npm run check:regression` | 0 hallazgos; salida 0 |

Logs: `/tmp/final-integraciones.log`, `/tmp/final-web-build.log`, `/tmp/final-lint.log`, `/tmp/final-regression.log`. Vite mantiene advertencia de paquetes mayores de 500 kB. No se silenciaron advertencias. El conteo de lint anterior documentado era 333: no afirmar que las 340 actuales son todas preexistentes sin comparar por archivo. Las pruebas nuevas de portada/formulario y su componente no aparecen con advertencias en esta pasada.

El fixture de chat en emulador ya fue verificado aparte con 10 pruebas; no se repitió. Véase `2026-09-28-chat-orden-fixture-appcheck.md`. Las 379 pruebas no incluyen esa ejecución y no equivalen a una aprobación funcional de la etapa de IA nueva.

## Web pública: revisión dirigida

Nueve pruebas de portada, canal público y formulario real aprobadas. Verifican selección válida, WhatsApp central, mantenimiento/reparación separado de descripción, descripción obligatoria, conservación de edición, configuración CMS legacy y retiro de equipos en vivo. Los enlaces de la portada y sus páginas públicas modificadas usan el canal central. Se conserva la configuración de otros canales.

Pendiente de evidencia visual en esta revisión: 375/1440 px, cambio reactivo de movimiento reducido, imágenes finales y dispositivo físico. La composición es fotográfica, no un modelo 3D ni despiece técnico.

## Android: conexión y preparación

`adb devices -l` reconoce un Samsung `SM_S928U` como `device`, autorizado por USB. Esta pasada solo consultó dispositivos: no instaló APK ni cambió sesión o datos.

- Identidad de actualización documentada: `com.misterservicerd.app`.
- Base nativa `/tmp/mister-android-review-20260928/android/app/build.gradle`: versión `1.0.16`, código `17`.
- `vite.mobile.config.ts` ya identifica recursos de producción `mobile-production-1.0.17`. No confundir esta cadena con un instalador construido o firmado.
- Próxima candidata debe mantener firma e identidad, y código mayor de 17; verificar manifest/certificado del APK resultante antes de instalar.
- `capacitor.config.ts` de raíz sigue siendo ensayo (`com.misterservicerd.tecnicos`): construir producción en el directorio aislado, conservando esa separación.
- Usar entorno `mobile-production` y el SDK/JDK del procedimiento existente; no copiar ni publicar credenciales de firma.

## Inventario pendiente: qué está realmente comprobado

La auditoría de 48 accesos consta de cinco revisados con Jorge y 43 capturas iniciales web/móvil. No son 48 recorridos funcionales aprobados. Fuentes: `2026-09-28-auditoria-visual-modulos.md`, `2026-09-28-android-fisico.md`, `2026-09-28-correcciones-jornada-ponche.md` y `../diseno/REVISION-GLOBAL-2026-09-28.md`.

| Tema | Evidencia y pendiente real |
| --- | --- |
| Menú contextual, botón IA, ficha/mapa | Probados históricamente en Samsung sobre 1.0.16: toque, arrastre, teclado, mapa y giro. Reprobar los cambios posteriores con APK final. |
| Jornada/GPS | Fallos físicos confirmados: segundo plano sin actualización y UI/servidor divergentes. Correcciones locales documentadas y pruebas automáticas aprobadas; requieren API y APK compatibles, entrada/salida QA, bloqueo varios minutos, regreso y pérdida/recuperación de red. No declarar resuelto por build. |
| Flujo técnico–administración | Foto, diagnóstico, propuesta, aprobación, checklist, firma de ensayo y cierre se probaron en OS-0011. Cobro/facturación no se probaron. La comisión antes de cobro fue confirmada como política permitida, no defecto. La neutralización financiera QA está documentada en correcciones de jornada. |
| Ubicación desde chat | Implementación local y 11 pruebas de ficha documentadas. Pendientes publicación y prueba visual/Android del cambio explícito de ubicación. |
| Clientes en iPad | Distribución corregida en navegador; falta iPad físico en ambas orientaciones. |
| Solicitudes/Citas/Atención | Unificación y ajustes documentados, con pruebas de navegación/contexto. Falta recorrer registros, errores, formularios y roles; vista inicial vacía no los valida. |
| Cabecera técnica | Compresión física confirmada; ajuste local documentado. Reprobar APK nueva en vertical y al girar. |
| Contabilidad | La pasada visual no valida importes, cálculos ni transacciones. Mantener QA específica por flujo, sin declarar auditoría contable completa. |
| Controles pequeños | Candidatos por confirmar: Ponche, Calendario, Mapa, Reporte avanzado, Comisiones, Página Web, Plantillas Marketing, Precios, Inventario, Conocimientos y Configuración. Medir el área táctil completa antes de atribuir defecto; contrastar versión porque algunos controles compartidos/zoom ya tuvieron correcciones históricas. |
| Mejoras propuestas | Priorización del Dashboard y vista diaria móvil del Calendario son propuestas, no defectos demostrados ni implementaciones aprobadas en este informe. |

Los títulos tapados y la supuesta ficha incorrecta durante carga no se reprodujeron tras esperar la carga; no se clasifican como fallos confirmados. Los avisos discretos de todos los módulos aún requieren definición de sus conteos. La revisión interna pendiente incluye altas/ediciones, roles, vacíos/errores, carga tardía, foco, teclado, atrás y portales autorizados.

## Dictamen

GO de compilación y verificaciones automáticas de esta pasada. La entrega integral permanece abierta hasta completar las etapas restantes, revisión independiente y pruebas físicas correspondientes. No se publicó ni se instaló nada durante esta verificación.
