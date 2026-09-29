# Contraste de propuestas — Claude y Codex

29/09/2026. Fuente Claude: https://claude.ai/artifact/46vDoUUvmguwtdV5nkXL1b . Leídas las diez secciones en navegador. Comparación con 2026-09-29-plan-maestro-mejoras.md. Solo planificación; no se modificó el artefacto externo ni se respondieron sus comentarios.

## Conclusión

Ambas propuestas coinciden en corregir relaciones y reglas compartidas, conservar historia, evitar reescritura total y probar recorridos completos. Claude desarrolla mejor operaciones financieras reanudables y migración progresiva. Codex conserva más explícitamente requisitos de web, presupuestos IA y decisiones pendientes sin inventar políticas monetarias. Consolidar fortalezas, sin adoptar todas las afirmaciones ni opciones por defecto.

## Comparación

| Aspecto | Claude | Plan Codex | Decisión propuesta |
|---|---|---|---|
| Prioridades | Dinero antes del flujo y diseño; interfaz en paralelo | Bloqueos de uso, flujo y luego dinero; investigación financiera desde inicio | Elevar reparación de fallos financieros a primer lote junto a salida IA; no esperar migración completa |
| Fuente financiera | Nueva colección de movimientos inmutables | Fuentes compartidas, trazabilidad y correcciones auditables | Evaluar registro de movimientos por dominio; separar desembolso, obligación, devengo y recuperación para no sumar todo como caja |
| Cierre nómina | Preparada/aplicándose/completa/incompleta y reintentos | No cerrar si quedan aplicaciones fallidas | Adoptar resultado explícito, recuperación e idempotencia, aprovechando protecciones existentes |
| Migración | Aditiva, un mes en paralelo | Inventario, simulación, respaldo y resolución de ambigüedades | Combinar; duración por cobertura y conciliación de ciclos, no por pasar un mes sin más |
| Restauración | Exportación y restauración ensayada | Respaldo recuperable y datos ficticios | Añadir prueba de restauración explícita y alcance de archivos, configuración, identidades y base; exportar Firestore no cubre todo |
| Estados | Fase calculada desde eventos | Eventos verificables y estados de trabajo/pago/documento separados | Reglas centralizadas por proceso sin exigir reconstrucción de todo desde eventos; pagos no determinan automáticamente fase técnica |
| Navegación | Hoy, Atención, Servicio, Dinero, Personal, Informes | Atención, Servicios, Finanzas, Personal, Crecimiento, Administración | Prototipar por rol; Hoy como inicio y Marketing con acciones propias, no solo informe |
| Pruebas | 18 casos concretos, fallo parcial y GPS | Recorridos integrales y roles | Unificar casos, agregar trazabilidad y criterios de salida medibles |
| Política monetaria | Opciones por defecto para garantía y cuota insuficiente | Decisiones explícitas antes de alterar reglas | No adoptar descuentos nuevos ni topes por silencio |
| Web e IA | Cobertura resumida | Detalle visual, flujo, horarios y presupuesto | Conservar requisitos completos de Jorge y añadir controles de liberación gradual |

## Correcciones necesarias a la propuesta de Claude

1. **Descuentos:** 10% sin tope y descontar préstamo hasta dejar neto cero son propuestas, no autorizaciones de Jorge. No usarlas por defecto ante falta de respuesta. Revisar política vigente, excepciones y reglas aplicables antes de implementación.
2. **Cobertura del equipo:** Jorge confirmó operaria y secretaria cubriéndose dentro del mismo equipo. No sustituirlo por otra operaria como primera opción. Escalamiento externo solo cuando ambas no puedan atender, por definir.
3. **Garantías:** la captura y RevisionGarantias.tsx ya muestran revisión humana. “Sin revisión visible” es demasiado general. Auditar cobertura y aplicación única, no asumir ausencia de controles.
4. **Servicios impagados:** que no aparezcan en Pagos pendientes no prueba que no aparezcan en ningún sitio. Revisar las otras vistas antes de esa conclusión.
5. **Cliente sin orden:** el obstáculo reportado corresponde al acceso desde chat/ficha no registrada. No generalizar que todo el módulo Clientes obliga a crear orden.
6. **Ponches:** no se demostró que todo ponche faltante produzca descuento automático. Existe revisión de asistencia; contrastar servidor y nómina para determinar el comportamiento real.
7. **Calendario financiero:** pago, verificación, emisión y prestación son fechas diferentes. No elegir fecha de verificación para toda caja por defecto. Preservar fechas y definir cada informe, incluidas confirmaciones tardías.
8. **Piezas:** registrar una compra una sola vez no resuelve por sí solo cuándo reconocer consumo/costo del servicio. Separar movimiento de inventario, pago de compra y costo atribuido; no imponer reconocimiento al comprar sin definir modelo.
9. **Permisos:** propuestas “solo administrador” o “secretaria solo cobros” requieren contraste con permisos y funciones acordadas; no recortar ni ampliar derechos por una tabla de navegación.
10. **Despliegue:** endpoints→web→reglas no es regla universal suficiente. Auditar compatibilidad de versiones y clientes abiertos, cierre de accesos y plan de reversión para el cambio concreto. No publicar como parte de esta planificación.
11. **Datos con teléfono nuevo:** no se puede identificar automáticamente al cliente anterior solo por declararlo. Verificar identidad/vínculo antes de unir registros o mostrar historial.
12. **Aportes supuestamente ausentes:** nuestro plan ya incluía ensayo ficticio, bajas, devoluciones y preferencias de contacto. La restauración ensayada sí merece mayor desarrollo. No interpretar la lista de Claude como auditoría del plan Codex, que no se le entregó necesariamente.

Claude afirma haber leído el repositorio. Sus hallazgos nuevos sobre inventario, reparto, reglas y límites técnicos quedan pendientes de contraste independiente; esta lectura de su documento no los convierte en verificados por Codex. La generalización de que no hay operaciones atómicas tampoco es exacta: existen transacciones y controles parciales que deben conservarse.

## Secuencia consolidada propuesta

A. Registrar estado exacto de candidata, fuentes y riesgos; preparar ensayo y recuperación. Ningún despliegue automático.
B. Corregir salida de IA y fallos financieros concretos (cierres incompletos, pérdidas ocultas y fechas inventadas), con pruebas; no esperar una nueva arquitectura completa.
C. Acordar definiciones y diseñar fuentes/operaciones compartidas, con simulación y conciliación de datos históricos antes de cambiar lecturas.
D. Conectar expediente, cotizaciones, piezas, inventario, taller, cobros y conduces con eventos y responsables explícitos.
E. Unificar personal, permisos, asistencia y seguimiento; informes construidos sobre fuentes verificadas.
F. Consolidar marketing, conocimiento, web y asistente; prototipos visuales pueden prepararse antes sin publicar ni alterar datos.
G. Pruebas integrales, Samsung, recuperación y revisión independiente; entregar estado exacto de cada requisito.

## Qué falta para convertirlo en ejecución

Validar nuevas observaciones de Claude, cerrar políticas monetarias y permisos, definir criterios de conciliación y preparar lotes con archivos afectados/casos de aceptación. Los documentos originales se conservan para explicar acuerdos y divergencias. Esta síntesis no autoriza acciones financieras, migraciones ni publicación.

## Segunda comparación recibida de Claude

Se acepta reforzar primer lote con cierre de nómina ante fallo y pérdidas visibles, junto a IA/Android/cliente independiente/búsqueda. Añadir también revisión de fallo al liquidar comisiones, no solo cuotas. El registro financiero en paralelo es propuesta de arquitectura; no debe bloquear reparaciones locales comprobables ni imponer un mes como garantía suficiente.

Matices: el expediente Codex ya registraba comisiones sin fecha tratadas como hoy en Estado de Resultados; sí faltaba contraste independiente del bloqueo global por órdenes sin equipo señalado por Claude. El plan distinguía hipótesis de causas globales y lecturas verificadas, no consistía únicamente en hipótesis. Se reconoce que faltaba precisar cuándo y cómo aislar commits. Inventario separado en 2026-09-29-inventario-cambios-revision.md, con límites de autoría por cambios superpuestos. No commit ejecutado por recibir una recomendación citada.
