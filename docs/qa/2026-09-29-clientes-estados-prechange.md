# Clientes e Inbox — PRE-CHANGE y mapa de estados

Fecha: 29/09/2026. Inspección de código local; no certifica despliegue ni prueba física.

## Alcance autorizado

Clientes e Inbox: dos accesos diferenciados (WhatsApp externo e Inbox), editar coordenadas conservando dirección/zona, crear únicamente cliente desde contacto y permitir orden posterior, movimiento lista/detalle respetando reducción de movimiento. No modificar Ordenes.tsx, financieras, API, reglas ni transiciones.

Touch-list prevista: `src/pages/Clientes.tsx`, `src/components/inbox/PanelCliente360.tsx`, `src/components/inbox/FichaClienteCabecera.tsx`, `src/pages/InboxConversacion.tsx`; componentes nuevos de edición de ubicación, alta desde chat y resolución del chat, más pruebas. Servicios de clientes y WhatsApp son consumidores/contratos a preservar, no autorización para ampliarlos.

## Historial y precauciones

- Clientes: c8b81d5 (22/05, abrir cliente específico sin tapar chat), a3b56bf (18/05, deduplicación), c61dad7 (02/07, nombres largos). Panel: a4b3873 (22/05, ficha 360), 3eff5eb (23/05, UX Inbox). FichaClienteCabecera no presenta historial comprometido.
- Servicio clientes: b6486e4 (18/05, excluir eliminados), d62ded1 (05/05, rechazar códigos internacionales en normalización local), 381805c (19/04, múltiples direcciones).
- Postmortem 2026-05-18-parser-cliente-eliminado-olvido: omitir campos soft-delete del parser hizo reaparecer clientes eliminados. Mantener parser y filtros.
- Patrones pertinentes: P-001 identidad autenticada, P-003 atomicidad si se amplía a varias colecciones, P-009 parsers completos, P-014 deduplicación, P-025 no generar órdenes con cliente vacío. No hay cambio de rules previsto.
- MAPA_RIESGOS contiene una recomendación antigua de tomar últimos diez dígitos que contradice el fix d62ded1: conservar normalizador actual.

## Estados comprobados en código

Las fases visuales están en `src/utils/index.ts:7`: nuevo_lead, en_gestion, agendado, en_diagnostico, en_cotizacion, aprobado, trabajo_realizado y cerrado. Cancelado es una salida adicional. La posición visual no implica avance autónomo por tiempo.

| Evento | Transición observada | Evidencia |
|---|---|---|
| Aprobar solicitud y generar orden | nuevo_lead | src/services/solicitudes.service.ts:115 |
| Crear orden con cita | agendado | src/hooks/useOrdenCreateForm.ts:773 |
| Iniciar chequeo | en_diagnostico si no está en una fase posterior | src/components/ordenes/IniciarChequeoButton.tsx:280 |
| Técnico guarda nota con precio sugerido | en_diagnostico → en_cotizacion; otras fases se conservan | src/pages/TecnicoVista.tsx:475 |
| Administración aprueba precio | aprobado | src/pages/OrdenDetalle.tsx:167 |
| Técnico completa wizard de cierre | trabajo_realizado | src/components/CierreServicioWizard.tsx:519 |
| Procesar facturación/conduce | cerrado | src/components/facturacion-pendiente/ProcesarFacturacionModal.tsx:840 |
| Confirmar solo chequeo | cerrado | src/pages/OrdenDetalle.tsx:501 |
| Ajuste manual de fase | según permisos y confirmaciones | src/components/ordenes/FaseStepper.tsx:74; src/components/ordenes/OrdenesTablero.tsx:117 |

No se identificó una asignación automática fija a en_gestion en los handlers inspeccionados. No afirmar que toda orden recorre obligatoriamente cada fase.

`estadoSimple` es un resumen: diagnóstico/cotización = en_proceso; trabajo_realizado/cerrado = completado; cancelado = cancelado; resto = pendiente (`FaseStepper.tsx:21`). Por tanto, completado no equivale necesariamente a cierre administrativo.

El seguimiento CRM también tiene su propia etapa: `api/crm/orden.ts:107` deriva supervision cuando existe cierreServicio/trabajo_realizado y cerrada cuando está facturada. No confundirla con fase ni con clasificación general del cliente.

## Pruebas propuestas para esta unidad

- Alta desde chat crea cliente sin orden, conserva borrador ante error y evita doble envío.
- Ubicación: coordenadas válidas, incluido cero; guardar/cancelar/fallo; conservar dirección, zona y cliente seleccionado.
- WhatsApp externo e Inbox resuelven el mismo cliente sin mezclar identidades o números ambiguos.
- Volver de detalle/chat conserva contexto; movimiento reducido no desplaza paneles.
- 375 px y 1440 px: controles visibles, menú sin recorte, sin desbordamiento.
- TS app/API, pruebas dirigidas, suite global una vez, lint de cambios y regresión. No repetir emuladores sin cambios API/rules.

Pendiente: ejecución independiente tras congelar archivos de builders. Las referencias de línea corresponden a la inspección previa y pueden desplazarse con la implementación.
