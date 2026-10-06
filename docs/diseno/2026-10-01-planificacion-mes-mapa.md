# Planificación de citas: mes, semana, día y mapa

Fecha: 01/10/2026. Estado: plan revisado; no implementado. Fuente: petición de Jorge en chat 01a0f833-70e2-7e63-b204-027995df6176.

## Objetivo confirmado
Ver las citas futuras de los equipos y técnicos, localizar espacios libres e identificar zonas con concentración de citas. Incorporar vista mensual y aprovechar el mapa existente. Presentar siempre web y móvil.

## Base existente revisada en código
- `src/pages/Calendario.tsx`: vistas mes/semana/día; reúne órdenes, citas por confirmar y mantenimientos. Los tentativos sin técnico siguen apareciendo bajo el filtro de técnico: deben distinguirse explícitamente como solicitudes sin asignar.
- `src/pages/MapaRutas.tsx`: órdenes activas con fecha, rango de fechas, técnico y zona; coordenadas de orden con respaldo del cliente; conteo por zona, detalles y reasignación. Excluye cerrado/cancelado. No reúne por sí solo las solicitudes tentativas y mantenimientos del calendario.
- El mapa agrupa recorridos por nombre de técnico, incluso con varios días seleccionados. Propuesta: mostrar concentración en rangos largos y permitir rutas únicamente de un día; agrupación por ID de técnico y fecha local.
- `src/components/clientes/MapaClientes.tsx`: agrupaciones de marcadores, mapa de calor y colores por zona. El calor se pondera por total de servicios históricos del cliente, con saturación en diez. Ese peso no representa la cantidad de citas futuras.
- Clientes cuenta y avisa registros sin coordenadas. Conservar esta transparencia en planificación.

Inspección estática del código local; no equivale a recorrido autenticado ni a verificar que toda esta versión esté desplegada.

## Organización propuesta
Una pantalla «Planificación». Selector de periodo Día / Semana / Mes y selector de presentación Agenda / Mapa. El mapa conserva el periodo elegido; cambiar de presentación no pierde filtros ni selección. Filtros compartidos: equipo, técnico, zona, especialidad y estado. Navegación anterior/siguiente, Hoy y rango personalizado.

### Vista mensual
- Calendario completo: citas confirmadas, por confirmar y horas disponibles por día; marcar no laborables, ausencias y datos de jornada pendientes.
- Resumen del mes por equipo; evitar interpretar un día sin citas como día laboral vacío si no hay jornada conocida.
- Pulsar un día abre sus clientes y carga de técnicos; permite ir a semana o mapa de ese día.
- Nombres de clientes primero en el listado; equipo, técnico, hora y número de orden como datos secundarios.
- No inferir capacidad de cuatro citas diarias: calcular con jornada, duración de visita, comida, ausencias y margen de traslado. Los bloques de 90 minutos/6 horas del preliminar eran ejemplos.

### Mapa de citas
- Capas seleccionables: confirmadas, por confirmar, solicitudes sin asignar y revisitas listas. Mantenimientos previstos se etiquetan como tentativos hasta confirmar.
- Presentaciones: puntos agrupados y concentración. En concentración, cada visita válida pesa uno; leyenda con unidad, periodo y capas incluidas. No usar peso histórico del mapa de clientes.
- Una visita se cuenta una vez aunque su solicitud se haya convertido en orden; reconciliar vínculos de origen. Varias visitas reales del mismo cliente conservan identidades separadas.
- Resumen: total del periodo, visibles en mapa, sin coordenadas válidas, sin zona. Los registros sin GPS siguen en lista y en los totales, con acceso a corregir ubicación; no inventar puntos.
- Ranking por zona: citas confirmadas, tentativas, solicitudes sin asignar y carga estimada. Los totales deben coincidir con agenda bajo los mismos filtros. Si el ranking permite explorar otras zonas, indicar expresamente ese alcance.
- Pulsar zona o agrupación muestra clientes → visita/orden → ficha del técnico. Al volver se conserva fecha, filtros y posición.
- En día: mostrar recorrido por técnico con horarios. En mes/semana: concentración; no dibujar una ruta que una visitas de diferentes días.
- GPS en vivo es una capa separada; no hace falta para medir concentración de citas.

### Completar espacios con criterio de zona
Al seleccionar un espacio disponible, proponer solicitudes compatibles por especialidad, disponibilidad del cliente, zona y antigüedad. Incluir revisitas cuando la pieza esté recibida y lista. Mostrar el motivo de la sugerencia y posibles choques. La operaria confirma antes de asignar. Distancia aproximada no debe presentarse como tiempo de tráfico verificado.

Ejemplo ficticio: Diorky tiene dos visitas en Arroyo Hondo y un espacio de tarde. Hay una solicitud compatible en el mismo sector. Se ofrece revisar esa solicitud y confirmar horario; no se reasigna automáticamente por proximidad.

### Pendientes anteriores
La ficha común del técnico conserva pendientes del día y atrasos abiertos, incluidos chequeo y piezas, independientemente del mes elegido. Cada atraso identifica responsable, antigüedad, causa y pieza registrada. Sin datos, mostrar «Pendiente de registrar». No convertir standby sin pieza disponible en visita confirmada.

## Web y móvil
Web: filtros arriba; calendario o mapa grande a la izquierda; panel de zonas, espacios y clientes a la derecha. Seleccionar día/zona actualiza el panel.
Móvil: calendario mensual compacto con contadores; lista del día debajo. En Mapa, mapa amplio y panel inferior desplegable con zonas/clientes; botón visible Lista / Mapa. Filtros en panel, conservados al cambiar vista. Evitar tabla de 10 técnicos comprimida en teléfono.

## Secuencia de entrega propuesta
1. Extender el preliminar con mes, mapa y navegación compartida; datos simulados explícitos; capturas web y móvil para revisión de Jorge.
2. Definir fuente común de visitas y estados, vínculos para evitar duplicados, equipos, jornadas y coordenadas. Reutilizar Leaflet y componentes existentes.
3. Integrar lectura con permisos efectivos; conteos equivalentes entre agenda, mapa y ranking. No ampliar acceso por incorporar filtros.
4. Integrar propuestas y reasignación con controles de solapamiento, especialidad, fecha, auditoría y confirmación del operador.

## Criterios de aceptación
- Mes anterior/siguiente, cambio de año y filtros conservados entre agenda y mapa.
- Mismo rango y capas producen los mismos totales; sin GPS queda explicado y accesible.
- Sin citas, sin jornada, descanso y ocupado son estados distintos.
- Solicitud convertida en orden no se duplica; no asignadas no aparentan pertenecer a un técnico filtrado.
- Rutas limitadas a técnico/día; mapa de calor independiente del historial comercial.
- Cliente → orden → técnico → pendientes anteriores funciona sin perder contexto.
- Web y móvil, teclado, foco y estados vacíos comprobados con datos simulados antes de conectar datos reales.

## Revisión funcional ampliada — 01/10/2026
El plan debe conservar también filtros comerciales, agrupaciones dinámicas/calor/zonas, Reactivación con contactos manuales, historial e inbox, edición/reasignación de órdenes y GPS en vivo. La maqueta actual no representa todavía esas capacidades. Inventario y hallazgos detallados en `2026-10-01-auditoria-funcional-mapas.md`; sustituye la caracterización simplificada anterior como referencia para el próximo preliminar. Prioridad: preservar minutos de citas, detectar solapamientos, corregir apertura de ficha móvil, unificar datos y respetar accesos antes de integrar.
