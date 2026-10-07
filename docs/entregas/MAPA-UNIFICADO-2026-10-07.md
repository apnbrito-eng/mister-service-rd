# Mapa único de operaciones — entrega Codex

Decisión de Jorge 07/10/2026: unificar los mapas tomando el nuevo como base.

## Resultado
- Un solo mapa visible: /admin/mapa, Mapa de operaciones. Retirados menú y botón «Mapa anterior».
- /admin/mapa-rutas-anterior es compatibilidad: redirige al nuevo conservando query y fragmento, sin montar Leaflet ni duplicar suscripciones. La implementación antigua sigue recuperable en Git.
- GPS en vivo integrado en la capa Vans; rutas por técnico/día, Google Routes por acción explícita, fechas RD, vistas mapa/lista/semana/mes, capas de clientes, reparto y reasignación conservados.
- Migrado filtro por zona de citas con el criterio existente zonaDeOrden (zona manual cliente, luego coordenadas). Cambiar zona cierra la ficha anterior e invalida cálculo de ruta.
- Migrada sugerencia de recorrido por cercanía dentro de la ficha de ruta. Solo paradas pendientes con ubicación, excluye trabajos completos y standby. Parte de la primera cita pendiente; usa el algoritmo existente, muestra km geométricos aproximados y enlaces segmentados de Google Maps. No cambia agenda ni horas ni asignaciones, no dispara API de Routes automática.
- Editar y otras operaciones completas siguen accesibles desde la ficha de cita/«Abrir orden completa». La optimización antigua que agrupaba por nombre y mezclaba días ya no dirige el mapa.

## Comprobación
Pruebas de navegación, redirección con query/hash, zona que excluye y recupera citas, y sugerencia sin alterar orden/horarios ni incluir standby/completadas/sin coordenadas. Suite completa 186 archivos/1266 pruebas aprobadas; build web/mobile, lint e invariantes se registran al cerrar publicación. No se editaron órdenes reales durante QA.

## Para Claude
Integra origin/codex/mapa-unificado. Esta rama incluye toda la revisión de Personal de Codex. Lee también docs/entregas/CLAUDE-CONTINUACION-2026-10-07.md para ficha, privacidad y decisiones financieras. El mapa anterior ya no es un pendiente de integración: no reconstruyas su página ni vuelvas a añadir su entrada. Conserva la ruta de compatibilidad.
Cada siguiente lote debe coordinar web y APK oficial con Codex, sin exponer firma. Registra fuente, pruebas y lo que realmente queda por validar.
