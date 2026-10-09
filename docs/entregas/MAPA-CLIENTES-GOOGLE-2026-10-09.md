# Mapa de clientes migrado al motor Google compartido — 09/10/2026

Encargo: §3 del plan integral `CLAUDE-PLAN-INTEGRAL-2026-10-08.md` ("Mapa clientes: reusar infraestructura Google del mapa NUEVO de operaciones…"). Trabajo nocturno Claude, directorio aislado `/tmp/mister-mapa-clientes-claude-20261009` (snapshot `a66d017`).

## Ownership de esta entrega

Esta pasada tocó únicamente los archivos autorizados por el encargo:

- `src/components/clientes/MapaClientes.tsx` — reescrito completo.
- `tests/integraciones/mapa-clientes-google-ui.test.ts` — nuevo.
- `docs/entregas/MAPA-CLIENTES-GOOGLE-2026-10-09.md` — nuevo (este archivo).

No se modificaron el motor compartido ni el loader (`src/components/mapa/MapaGoogle.tsx`, `src/utils/cargarGoogleMaps.ts`), ni los helpers reutilizados (`src/utils/clusterPantalla.ts`, `src/utils/geo.ts`, `src/components/mapa/marcadores.ts`, `src/components/shared/BotonChatCliente.tsx`), ni `src/pages/Clientes.tsx` (consumidor), ni `src/pages/Mapa.tsx` (operaciones). Tampoco Firestore Rules.

## Qué se hizo

1. **Reutilización de la infraestructura compartida.** `MapaClientes` ahora monta `MapaGoogle` directamente — mismo motor que `/admin/mapa` (operaciones). No carga Leaflet/OSM ni `leaflet.markercluster` ni `leaflet.heat`. El loader `cargarGoogleMaps` garantiza una única `<script>` por sesión, así que no se duplica el SDK aunque un usuario navegue entre /admin/mapa (operaciones) y /admin/clientes (clientes) en la misma pestaña.
2. **Cluster por pantalla con `agruparEnPantalla`.** El cluster se calcula en el cliente cada vez que el motor dispara `onCambioVista` (idle), con tope duro de ~300 marcadores. Con 9.000 clientes jamás se crean 9.000 AdvancedMarkerElement; la prueba `con 9.000 clientes jamás se envían 9.000 marcadores al motor` lo exige.
3. **Marcadores desde `components/mapa/marcadores.ts` (patrón ya probado en operaciones).** Pines individuales con `puntoCliente(color, titulo)` y grupos con `grupoClientes(total, mezcla, etiqueta)`. Esos helpers usan `textContent` y `document.createElement` — nunca `innerHTML`, nunca interpolan texto del cliente en strings HTML.
4. **Tarjeta del cliente y lista fallback en React puro.** La ficha flotante y la lista accesible se renderizan como JSX; los datos del cliente nunca entran en `innerHTML`. Las tarjetas son `aside` con `aria-label` propio.
5. **Selección vía callback.** El consumidor (`pages/Clientes.tsx`) sigue recibiendo `onSelectCliente(id)` tal como antes. Dentro del mapa se abre una tarjeta flotante con dos acciones: "Ver expediente" (dispara el callback) y "WhatsApp empresa" (vía `BotonChatCliente`).
6. **WhatsApp empresarial.** Se usa el `BotonChatCliente` existente con `clienteId`, `nombre`, `telefono`. El botón hereda la lógica de inbox empresarial (rutea a `/admin/inbox/:waId`), no abre `wa.me` ni la app externa. La prueba `la tarjeta usa BotonChatCliente … y nunca enlaces wa.me` lo verifica.
7. **Capas útiles por zona/antigüedad.** Se conservan dos vistas:
   - **Antigüedad** (default): color por rango de meses desde el último servicio (`antiguedadDe` + paleta `ANTIGUEDAD`).
   - **Zonas**: color por zona (`colorZonaPin`) alineado con la paleta ya establecida.
8. **Fallback accesible cuando Google falla.** `MapaGoogle` renderiza su propio bloque de "sin mapa"; `MapaClientes` le pasa como `sinMapa` una lista accesible (`<button>` por cliente con `aria-label="Abrir expediente de X"`) con tope visual de 200 entradas para no reventar el DOM; el padre tiene los filtros de la cartera para refinar. El reintento de red es el que ya expone `MapaGoogle` (botón "Reintentar" cuando `estadoGoogleMaps() === 'sin_conexion'`).
9. **Estados vacíos y "sin ubicación".**
   - `clientes.length === 0 && totalSinCoords === 0` → mensaje "No hay clientes para mostrar con los filtros actuales." dentro de la lista fallback.
   - `totalSinCoords > 0` → banner inferior tipo `role="status"` con el total, igual que la versión anterior.
   - La selección individual (`seleccionCliente`) se descarta cuando el prop `clientes` cambia (`useEffect` dependiente de `clientes`), para que un cliente filtrado fuera no quede fantaseado en pantalla. La prueba `la selección individual se descarta cuando cambia el dataset` lo cubre.
10. **Sin coordenadas inventadas, sin información financiera.** No se sintetiza `(lat, lng)` para clientes sin coords (se cuentan en el banner y se exponen en la lista fallback, pero no se les asigna una posición). La tarjeta no muestra montos ni facturación histórica. Las métricas que se muestran son: zona, sector y etiqueta de antigüedad.

## Diferencia explícita con la versión Leaflet anterior

**Se eliminó la vista "heatmap".** El motor compartido (Google Maps JS) no expone una capa de calor; agregarla implicaría cargar un SDK secundario (p. ej. `google.maps.visualization`), que es exactamente lo que el encargo prohíbe ("Modos compatibles existentes, no SDK secundario"). Las dos vistas conservadas (antigüedad y zonas) cumplen el requerimiento de "capas útiles por zona/antigüedad" sin inventar una capacidad que el motor no provee. No se renombra ni se simula heatmap con un color de pin.

**Si en el futuro se quiere heatmap real**, el contrato pendiente para el motor compartido sería:
- Exponer en `MapaGoogle` una prop `heatmap?: { puntos: Array<{ lat; lng; peso?: number }>; opciones?: HeatmapOptions }`.
- Agregar `visualization` al parámetro `libraries` de `cargarGoogleMaps` (hoy carga `places,marker,geometry`).
- Mantener el fallback accesible cuando Google falla.

Ese cambio NO se hizo en esta pasada porque toca archivos fuera del ownership autorizado.

## Pruebas automatizadas

Archivo: `tests/integraciones/mapa-clientes-google-ui.test.ts`.

Casos cubiertos:
- **Arranque sin marcadores.** El componente no agrupa hasta que el motor reporta su primera `Vista`.
- **Fallback accesible.** La lista `sinMapa` renderiza los clientes y su `onClick` dispara `onSelectCliente(id)` con el id correcto.
- **Identidad del callback individual.** Click en pin → tarjeta → "Ver expediente" dispara `onSelectCliente('a')` (no 'b', no undefined).
- **Botón WhatsApp empresarial.** La tarjeta renderiza `BotonChatCliente` con `clienteId/nombre/telefono` correctos; el árbol no contiene `wa.me` ni `whatsapp://`.
- **Selección descartada al cambiar dataset.** Al reemplazar `clientes` con otro arreglo que no contiene al seleccionado, el `aside` desaparece.
- **Click en grupo.** Dos clientes pegados agrupan a zoom bajo; el panel lateral lista a ambos y permite abrir uno de ellos.
- **9.000 clientes ≤ 300 marcadores.** Dispersión determinista sobre Santo Domingo; tras `onCambioVista(VISTA_ANCHA)` se verifica `marcadores.length ≤ 300`.
- **Vacío sin banner.** `clientes: [], totalSinCoords: 0` muestra el mensaje de fallback y NO el banner de "sin ubicación".
- **Banner "sin ubicación".** `totalSinCoords: 25` muestra "25" y el texto "no aparece".
- **Toggle cluster/zonas no reemplaza el motor.** El conteo de marcadores se mantiene y la `clave` cambia a la familia `*|zonas`.

Las pruebas mockean `MapaGoogle` (para exponer la propiedad `marcadores` que recibe) y `BotonChatCliente` (para evitar su contexto de router/atencion). El motor en sí y el loader siguen cubiertos por `codex-mapa-google.test.ts` y `google-maps-loader.test.ts`. El agrupador por pantalla sigue cubierto por `clusterPantalla.test.ts`.

### Lo que NO se ejecutó

- No se corrió `npm run test:integraciones` ni ningún otro `npm run …` desde este snapshot: el entorno aislado no tiene `node_modules` instalado y el encargo prohíbe ejecutar instalaciones o Bash fuera del scope de archivos. La corrida real queda a cargo del root que trabaja el repo principal.
- No se corrió `npm run lint`, `npm run typecheck:api`, ni `npm run build`.
- No se ejecutaron pruebas en navegador ni validación visual real; no se afirma publicación ni experiencia física.
- No se tocaron variables de entorno (`VITE_GOOGLE_MAPS_KEY`, `VITE_GOOGLE_MAPS_MAP_ID`), credenciales, ni cuentas.
- No se ejecutó despliegue a Vercel ni mensajes/campañas reales.

## Archivos entregados

1. `src/components/clientes/MapaClientes.tsx` — reescritura completa; mantiene las props (`clientes`, `totalSinCoords`, `onSelectCliente`) para no romper al consumidor (`pages/Clientes.tsx:473`).
2. `tests/integraciones/mapa-clientes-google-ui.test.ts` — nuevo archivo con los 10 casos descritos.
3. `docs/entregas/MAPA-CLIENTES-GOOGLE-2026-10-09.md` — este documento.

## Contrato con el motor compartido

Props de `MapaGoogle` consumidas por `MapaClientes` (vigentes en `src/components/mapa/MapaGoogle.tsx` del snapshot):
- `marcadores: MarcadorMapa[]` — pins y grupos.
- `lineas: LineaMapa[]` — vacío; `MapaClientes` no dibuja rutas.
- `tipo: 'mapa'`, `trafico: false` — vista cartográfica estándar sin tráfico.
- `encuadre: Encuadre | null` — se envía la caja min/max de todos los puntos; el motor solo encuadra cuando cambia la `clave`.
- `relleno: { top: 56, right: 24, bottom: 72, left: 24 }` — deja espacio para la leyenda inferior y el banner "sin ubicación".
- `onClickMarcador(m)` — individual (`capa==='cliente'`) abre tarjeta; grupo (`capa==='grupo'`) abre panel lateral.
- `onClickMapa()` — cierra tarjeta/grupo abiertos.
- `onCambioVista(v)` — guarda la vista para recomputar grupos.
- `sinMapa` — lista accesible de clientes del filtro.

## Riesgos y pendientes conocidos

- **Falta QA manual en Chrome** con `VITE_GOOGLE_MAPS_KEY` real. No se validó visualmente que el motor compartido se vea idéntico cuando se abre primero `/admin/mapa` y luego `/admin/clientes` (y viceversa). El loader está diseñado para evitar la doble carga, pero merece verificación humana.
- **Heatmap retirado**. Si el equipo lo quería mantener como UI (aun entendiendo que es solo pines coloreados), la decisión queda escalada a Jorge; no se asume. Alternativa real descrita arriba.
- **Lista fallback con tope visual de 200**. Carteras completas (9k+ clientes) no se exponen enteras en el fallback; se pide al usuario afinar filtros. Si Jorge prefiere virtual-scroll real sobre la cartera completa en fallback, es un contrato nuevo para el componente (`virtualizar?: boolean`).
- **Marcador individual con una única ubicación por punto**. Si un cliente tiene varias direcciones (`direcciones[]`), cada ubicación recibe un pin separado; la tarjeta de cliente que se abre siempre refiere al cliente padre (no distingue "principal" vs "alterna"). El flujo del expediente, que es responsabilidad del padre, puede refinar esto.

## Resumen (hecho / no probado)

- **Hecho**: migración completa del componente al motor Google compartido con las garantías de rendimiento (clustering), seguridad (sin `innerHTML`, sin wa.me), accesibilidad (ARIA en lista, pines con `role="button"` desde `marcadores.ts`), y props públicas intactas. Pruebas automatizadas nuevas que cubren identidad del callback, fallback, empty state, descarte de selección al cambiar dataset, 9k → ≤300 marcadores, toggle cluster/zonas, y botón empresarial.
- **No probado**: ejecución real de la suite de tests (sin `node_modules` en el snapshot aislado), lint, typecheck, build, QA manual en Chrome, carga concurrente con `/admin/mapa` abierto, comportamiento con `VITE_GOOGLE_MAPS_KEY` ausente/rechazada en navegador real.

— Claude Code (snapshot `a66d017`, 09/10/2026)

## Revisión Codex e integración
- Corregido contador: clientes únicos, no cantidad de domicilios.
- Corregido filtro del padre Clientes: reconoce dirección alternativa válida.
- Listado de grupos permite Mostrar más, sin ocultar definitivamente clientes después de los primeros 30.
- Reparadas pruebas que serializaban objetos React circulares.
- Heatmap sigue pendiente de equivalencia y revisión visual; antigüedad no se considera sustitución idéntica. Esta entrega no se publica automáticamente.
