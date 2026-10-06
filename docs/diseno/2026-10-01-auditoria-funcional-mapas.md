# Revisión funcional: Clientes, Mapa de clientes y Mapa de rutas

01/10/2026 · Solicitud de Jorge · Chat 01a0f833-70e2-7e63-b204-027995df6176.

## Alcance y evidencia
Lectura completa de Clientes.tsx (980 líneas), MapaRutas.tsx (1291), MapaClientes.tsx (341), FiltrosSidebarClientes.tsx (282), utilidades de filtros/zonas/rutas; lectura de Reactivación, tabla, plantillas, modal de links, servicio GPS, componentes de ubicación/navegación y comprobaciones dirigidas de permisos, reglas y atribución de campañas. Hallazgos de código local. No se ejercieron escrituras, envíos ni cambios de permisos; no se certifica el despliegue ni funcionamiento real de cada integración. Componentes secundarios grandes como EditarClienteModal y OrdenEditForm se revisaron en las conexiones pertinentes, no como auditoría exhaustiva independiente.

La versión anterior del preliminar representa solo una fracción del producto. Cuatro grupos fijos sobre un mapa no reproducen el clustering real, los filtros comerciales ni el flujo operativo existente.

## 1. Clientes: base e interconexiones
- Suscripción a clientes ordenada por creación; normaliza datos importados con parseCliente. Lista y mapa excluyen clientes consolidados/eliminados.
- Lista busca nombre/teléfono; muestra 50 y permite cargar más. Esta búsqueda no se aplica al mapa: tiene filtros propios.
- Ficha con teléfono, email, datos fiscales/identificación cuando existen, dirección escrita, GPS y mini mapa; zona manual o inferida; edición de cliente y ubicación. Editor de cliente contempla direcciones alternativas.
- Diferencia historial importado de Google Calendar (servicios, último servicio, monto, equipos, marcas, bancos) del historial de órdenes del sistema. La interfaz indica que el histórico importado no se actualiza automáticamente.
- Historial consulta órdenes por clienteId, excluye eliminadas y abre la orden real. Acceso desde inbox por parámetro id y contexto de atención.
- WhatsApp externo con saludo, WhatsApp empresa hacia conversación interna y «Cómo llegar» con Google Maps. Abrir un enlace no confirma envío.
- Alta valida teléfono RD y busca duplicados; delega al servicio canónico. Exportación CSV existente.

## 2. Mapa de clientes: herramientas que hay que conservar
Tres modos reales:
1. Agrupaciones dinámicas (Cluster): combina puntos según proximidad y zoom; separa puntos superpuestos al ampliar. Cada cliente mantiene sus coordenadas.
2. Calor (Heatmap): densidad ponderada por cantidad de servicios históricos, saturada a 10, peso mínimo de respaldo 0.2. No mide citas futuras.
3. Zonas: puntos individuales coloreados por zona con leyenda.

En agrupaciones, colores según antigüedad del último servicio: gris sin registro, verde <3 meses, amarillo 3–6, naranja 6–12, rojo >=12. Reencuadre automático tras cambiar filtros. Sin resultados centra Santo Domingo.

Filtros combinados: múltiples zonas; último servicio (incluye >24 meses y sin registro); particular/B2B; total de servicios (1,2–5,6–10,11+); equipos atendidos; teléfono con formato compatible con WhatsApp. La comprobación telefónica NO consulta a WhatsApp para saber si existe cuenta.

Popup: nombre, teléfono, zona, último servicio, total de servicios y hasta tres equipos; botón Ver detalle. Contadores de coincidencias, clientes en mapa y sin coordenadas. Escritorio con sidebar, móvil con panel de filtros.

## 3. Reactivación conectada al módulo Clientes
- Comparte tipos de filtros, pero usa su propio estado: seleccionar una zona en Mapa no la transfiere automáticamente a Reactivación.
- Tabla seleccionable, ordenable y paginada; selección de visibles o de todos los resultados.
- Plantillas activas, vista previa personalizada y aviso de variables sin datos.
- Periodo entre contactos: 30 días por defecto, configurable; excepción de administrador registrada en auditoría.
- Crear campaña guarda destinatarios y filtros; genera enlaces manuales. El agente abre WhatsApp y marca enviado explícitamente.
- Marcar enviado actualiza campaña, último contacto del cliente, historial limitado a 50 contactos y auditoría en transacción; operación idempotente.
- Existe atribución de orden a campaña reciente (ventana 60 días), invocada desde useOrdenCreateForm, que incrementa reactivados. Es atribución temporal al último contacto, no prueba causal ni garantía de cobertura de todos los caminos de creación de órdenes.

Oportunidad principal: espacio libre del técnico → zona/especialidad → clientes por reactivar o mantenimiento → contacto → cita confirmada → orden. Aprovechar este flujo sin convertir una oportunidad comercial en una cita automáticamente.

## 4. Mapa de rutas: operación existente
- Lee órdenes en tiempo real; clientes y personal se cargan al montar. Rangos Hoy/Esta semana/Este mes/Últimos30 y fechas manuales, técnico y zona.
- Selecciona órdenes con fecha, excluye eliminadas/cerradas/canceladas. Muestra tanto órdenes filtradas como marcadores disponibles.
- Ubicación de la orden primero; respaldo en cliente. Zona manual del cliente tiene prioridad sobre inferencia por coordenadas.
- Pines numerados por recorrido y colores del técnico. Líneas y kilómetros; alterna orden cronológico y proximidad.
- Popup: cliente/número, dirección, equipo/marca/modelo, fase, técnico, zona, fecha; teléfono, recordatorio prellenado de WhatsApp, Cómo llegar, editar y eliminar según acceso.
- Lista lateral de visitas, distancias por técnico, conteos de técnicos activos incluso con cero citas, zonas con conteos y filtro.
- Reasignación implementada mediante arrastrar pin hacia técnico en escritorio. Devuelve el pin a su ubicación: el gesto cambia responsable, no dirección. Pide confirmación, motivo opcional y muestra aviso de conflicto.
- Reasignación actualiza UID/nombre del técnico, operaria asociada y auditoría.
- Editor de orden desde mapa: cliente/contacto, dirección/referencia/GPS, equipo, configuración y modelo fabricante, falla, foto, técnico, duración, fecha/hora y notas. Autocomplete, coordenadas en enlaces y ubicación del dispositivo. Aviso cuando operaria edita grupo ajeno. Cambios auditados.
- GPS en vivo: suscripción a ubicaciones de vehículos, técnico, velocidad, movimiento/detenido, última actualización y orden activa. Aviso sin señal después de cinco minutos. Es otra función, distinta del mapa de visitas.

## 5. Límites y hallazgos para resolver antes de integrar
Hallazgos estáticos; algunos necesitan reproducción en navegador/emulador. No se corrigieron en esta revisión.

1. **Minutos de citas:** abrirEditarDesdePin carga hora con HH:00; guardar recompone fecha con ese valor. Una cita 08:30 puede quedar 08:00 al guardar otro dato. Preservar minutos y probar antes de reutilizar editor.
2. **Conflictos:** drag detecta igualdad exacta de fecha/hora y permite continuar; editor bloquea bloques HH:00. Ninguno de esos cálculos contempla solapamiento por duracionMin y viaje.
3. **Optimización:** vecino más cercano con Haversine, parte del primer punto recibido; kilómetros en línea recta. No usa carreteras, tráfico, punto de salida ni ventanas horarias. Nombre/leyenda deben explicarlo.
4. **Rangos amplios:** agrupa por nombre de técnico y une días distintos. Separar ID y fecha; concentración para mes/semana, rutas por día. La lista mezcla posiciones de rutas diferentes al ordenar solo por número.
5. **Detalle móvil desde mapa de clientes:** handleSelectClienteDesdeMapa cambia seleccionado y pestaña, pero no activa detalleVisible ni contexto seleccionar. Con detalleVisible=false la ficha móvil queda oculta/inert. Reproducir y unificar el mecanismo de apertura.
6. **Histórico desactualizado:** antigüedad, equipos y ponderación usan legacyMetricas importadas. Un servicio reciente del sistema puede no reflejarse allí. Definir resumen combinado sin duplicar importaciones; mostrar procedencia/fecha de actualización.
7. **Sin GPS:** en Rutas los registros sin coordenadas desaparecen del listado de marcadores, aunque el total de órdenes los incluye; falta bandeja accionable. Además, algunos filtros de coords aceptan infinito/fuera de rango porque solo verifican tipo/NaN/cero.
8. **Zona y dirección:** zonaDeOrden prioriza zona del cliente aun si visita otra dirección; inferirZona usa rectángulos amplios, no límites de barrios. No equiparar Naco/Arroyo Hondo con las zonas administrativas existentes. Conservar zona de la visita y distinguir sector.
9. **Técnico UID/documento:** selector de rutas usa uid, pero fallback de nombre busca personal.id igual al filtro. La compatibilidad de registros antiguos requiere un resolver único por uid/id, sin agrupar por nombre.
10. **Reactivación y eliminados:** recibe clientes completos y aplicaFiltros no excluye eliminado; podría incluir consolidados que lista/mapa ocultan. Debe usar la misma base visible antes de proponer contactos.
11. **Filtros/exportación:** CSV recorre clientes completos, no resultados filtrados; mapa no hereda búsqueda de lista; Reactivación tampoco hereda selección geográfica. Aclarar alcance y transferir contexto explícitamente.
12. **Datos actuales:** Rutas toma clientes/personal una vez; editar ubicación del cliente en otra pantalla puede no refrescar hasta remontar. Definir sincronización coherente.
13. **Accesos distintos:** Clientes oculta mapa a operaria/técnico; Reactivación tiene permiso y guard adicional admin/coordinadora; Rutas edita por rol fijo pero arrastrar/eliminar usan permisos específicos. No prometer a Wila/Yohana herramientas hasta alinear política efectiva con gerencia/supervisión/equipos.
14. **Regla GPS local:** ubicaciones_vehiculos permite lectura pública y escritura a staff. Es evidencia del archivo local, no verificación de reglas desplegadas. Resolver antes de ampliar GPS; no copiar esta exposición al nuevo diseño.
15. **Interacción drag pendiente de prueba:** destino se deriva de originalEvent en dragend; debe probarse realmente antes de marcarla funcional. Alternativa accesible/móvil: selector de técnico con confirmación.

## 6. Plan corregido
La pantalla nueva debe conservar tres contextos conectados:
- **Clientes y oportunidades:** agrupaciones/calor/zonas, filtros comerciales, ficha/historial, Reactivación y contactos.
- **Agenda y rutas:** día/semana/mes, citas por técnico/equipo, capacidad, pines individuales, orden/edición, reasignación y navegación.
- **GPS en vivo:** vehículos y señal actual, con permisos y frescura de información visibles.

Compartir ficha cliente y técnico, IDs, selección de zona y enlaces a órdenes. Mantener filtros propios donde las unidades difieren: clientes históricos frente a visitas en fechas específicas. No reemplazar funcionalidades por puntos fijos ni reconstruir lógica de edición en el HTML de demostración.

### Próximo preliminar
Web: controles de contexto y periodo; mapa con agrupaciones/calor/zonas; filtros; lista conectada; ficha de cliente/técnico y acciones existentes representadas. Móvil: mismas funciones mediante panel inferior y filtros plegables, sin depender de arrastrar.

Primero representar el flujo completo con datos simulados y misma fuente para todas las vistas. Después resolver hallazgos funcionales y permisos, reutilizar componentes reales y probar lectura/navegación antes de cualquier escritura. Esta revisión no autoriza envíos ni activa GPS.

## Segunda pasada: conexiones y evidencia adicional

Petición reiterada de Jorge: profundizar antes de continuar la maqueta. Se leyeron completos EditarClienteModal, OrdenEditForm, clientes.service y BotonRederivarOperaria; se inspeccionaron el emisor GPS de TecnicoVista, las pruebas relevantes y el evento real de Leaflet instalado.

### Direcciones: tres representaciones distintas
1. Cliente tiene dirección principal y GPS: es el punto que MapaClientes dibuja.
2. Cliente puede guardar direcciones alternativas con etiqueta/referencia/GPS. El mapa no dibuja automáticamente todas. El editor permite agregar, cambiar etiqueta y eliminar; no ofrece edición completa de cada dirección alternativa desde ese botón.
3. Orden guarda una copia propia de nombre/teléfono/dirección/GPS. MapaRutas la usa primero. Guardar desde el editor de rutas actualiza ordenes_servicio, no el documento clientes. Cambiar datos de la ficha no actualiza automáticamente todas sus órdenes.

Al confirmar una solicitud pública, si el cliente existe y la dirección difiere, el servicio puede agregarla como alternativa «Captada del formulario público» sin sustituir la principal. Por eso un mismo cliente puede aparecer en lugares diferentes en ambos mapas sin que sea necesariamente un error. El nuevo diseño debe mostrar «Ubicación de esta visita» y «Dirección principal del cliente» y permitir elegir explícitamente cuando haga falta.

### Grupos y operarias
OrdenEditForm avisa a qué grupo pasará la orden al seleccionar otro técnico. Incluye Re-sincronizar operaria: compara la asignación guardada con la del técnico y ofrece actualizarla con confirmación. Esta acción usa la orden guardada, no el borrador. No debe quedar escondida ni confundirse con guardar una reasignación pendiente. El mapa trabaja hoy con relación técnico→operaria; un selector visual A/B por sí solo no implementa esa estructura.

### GPS: fuente y límites comprobados en código
TecnicoVista web comparte geolocalización cuando encuentra una orden propia con tracking habilitado y fase activa; limita escrituras a una cada 30 segundos. El efecto excluye la app nativa, cuyo comportamiento no queda certificado por este análisis. El panel de rutas lee ubicaciones ya almacenadas; no garantiza que todas estén transmitiendo ahora. La etiqueta sin señal a los cinco minutos y fecha de actualización son indispensables. El cruce de orden activa por tecnicoId debe conciliar auth.uid y personal.id, porque la escritura GPS web usa personal.id mientras las órdenes modernas usan UID.

### Corrección a la valoración anterior de drag
Confirmación por dependencia instalada: `node_modules/leaflet/src/dom/Draggable.js:213` emite dragend con `noInertia` y `distance`; Marker.Drag lo retransmite. El handler de MapaRutas solo encuentra técnico destino si recibe `originalEvent`. En este camino estándar ese campo no se entrega, por lo que el destino queda nulo y se abandona la reasignación. Es evidencia por lectura de ambas implementaciones, no una prueba física de arrastre. La función está diseñada en la app, pero no debe anunciarse como verificada. Usar selector accesible y corregir/pruebar el gesto antes de preservarlo.

### Reproducción local sin datos reales
Se extrajo el formato de hora del propio archivo y se ejecutó con date-fns instalado: cita ficticia 05/10/2026 08:30 → campo HH:00 → fecha recompuesta 08:00. Confirma la transformación; no se guardó ninguna orden. Se verificó también que el payload dragend del Leaflet instalado no contiene originalEvent y que el handler depende de él.

### Pruebas ejecutadas
`npx vitest run --config vitest.integraciones.config.ts tests/integraciones/clientes-ubicacion-editor.test.ts tests/integraciones/clientes-canal.test.ts tests/integraciones/clientes-compactos.test.ts tests/integraciones/gps-credencial-privada.test.ts`
Resultado: 4 archivos, 11 pruebas PASS. Cubren guardado GPS sin cambiar dirección, validación/réintento, canales, lista compacta y protección de credenciales del proxy. No prueban drag, clustering, rutas completas ni visitas reales. La configuración manual clientes-qa sustituye MapaClientes/TabReactivacion/EditarClienteModal por stubs: sus capturas de lista no certifican esas funciones.

### Otros detalles de persistencia
- `actualizarCliente` omite valores undefined. El editor envía undefined al vaciar email/RNC/otros opcionales; no equivale a borrarlos en Firestore. Diferenciar borrar de conservar al integrar.
- Cambiar texto de dirección sin resolver nueva coordenada conserva lat/lng anterior en varios editores: pueden quedar texto y pin discordantes. Ofrecer confirmación visual de la ubicación de la visita.
- El botón «Mi ubicación» toma el dispositivo del operador; no obtiene mágicamente la casa del cliente. Debe decirlo y no confundirse con ubicación recibida por WhatsApp.
- Las funciones de direcciones alternativas hacen lectura/modificación/escritura del array; no usan transacción en ese flujo y pueden perder cambios concurrentes. Registrar para implementación, no alterar datos ahora.

### Modelo funcional que debe guiar la próxima vista
Mapa de clientes responde «dónde está nuestra base y a quién podemos volver a atender».
Reactivación responde «a quién contactamos, con qué mensaje y cuándo».
Planificación responde «qué visitas caben, para qué equipo/técnico y en qué fecha».
Mapa de rutas responde «en qué dirección concreta es cada visita y cómo se reparte el recorrido».
GPS responde «qué ubicación reciente reporta el técnico».

Conectarlos por cliente/visita/orden/técnico y conservar los contextos; no reducirlos a un mapa único de círculos. La concentración histórica, las citas futuras y la señal actual son medidas diferentes.
