# Rediseño visual: alcance recuperado

Jorge aclara el 30/09 que esperaba el rediseño estético completo, además de las mejoras funcionales. Samsung es la web https://www.samsung.com/latin/ como referencia de composición, tipografía y movimiento. Aplicar Emil Kowalski (`emil-design-eng`) y Apple Design respetando el diseño propio de Mister Service, azul #0f3460 y superficies sólidas.

## Estado comprobado

- Web/API y Android 1.0.20 están publicados con mejoras funcionales. Esto NO equivale al rediseño completo.
- El sitio oficial conserva portada oscura con dibujo de equipos y cifras sobrepuestas. Verificado en navegador el 30/09.
- `PortadaElectrodomesticos` existe como alternativa para modo `escena`. La portada publicada muestra otra configuración.
- La entrega visual anterior corrigió fuente, controles, IA y algunas distribuciones. Las fases de DESIGN.md no están todas implementadas.

## Primera entrega concreta

Vista previa interactiva de portada: escena amplia con equipos, selección Reparación/Mantenimiento y equipo, acciones visibles; adaptación a escritorio y móvil. Claude tiene propiedad exclusiva de `tests/manual/portada-redesign.*` y su configuración Vite. Codex prepara el marco de revisión y verifica en navegador. Sin conexiones a datos reales ni envíos externos en el prototipo.

| Antes | Después propuesto | Motivo |
|---|---|---|
| Portada oscura con dibujo de fondo | Composición clara con equipos protagonistas | Dar prioridad al servicio y al producto |
| Estadísticas flotando sobre la escena | Jerarquía de título, contexto y acciones | Facilitar lectura sin superposiciones |
| Selección escondida más adelante | Servicio y equipo seleccionables en portada | Mantener contexto al iniciar solicitud |
| Animación genérica | Respuesta inmediata y transiciones reversibles | Aplicar Emil/Apple sin retrasar tareas |

## Continuidad del software interno

Conservar el alcance original: navegación, listas/detalle, formularios, órdenes y vista técnica. No presentar la portada como rediseño del CRM. Revisar cada lote con los mismos datos y anchos; no cambiar cálculos, permisos ni flujos financieros para conseguir un efecto visual. Las pruebas físicas y tareas técnicas anteriores permanecen pendientes mientras se prioriza la entrega visual solicitada.
