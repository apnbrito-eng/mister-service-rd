# Sprint: filtro avanzado en módulos financieros con drilldown desde KPI cards

Usa el subagente coordinator.

## Objetivo

Hoy `/admin/facturas` (y sus hermanas `/admin/facturacion-pendiente`, `/admin/cotizaciones`) tienen un filtro de rango de fechas básico que se aplica automáticamente al cambiar inputs (commit `aebf689`). Funciona pero la UX es limitada:

- El filtro se aplica a cada keystroke del date picker.
- El buscador solo busca por nombre de cliente.
- No hay filtro por tipo de equipo.
- Las 4 KPI cards de arriba (Cobrado Anual, Emitidas Hoy, Emitidas Mes, Pagadas Mes) son **decorativas** — no responden al click.
- No hay persistencia entre sesiones — cada vez que volvés tenés que setear el filtro.

Este sprint extiende todo eso con un filtro avanzado completo, drilldown desde KPI cards, persistencia, filtros guardados y URL sync.

## Pre-investigación

1. **`src/components/admin/FiltroRangoFechas.tsx`** (commit `aebf689`) — el componente existente. Decisión: extenderlo o reescribirlo como `FiltroAvanzadoFinanzas.tsx`. **Recomendado: reescribir** porque el alcance crece mucho. El componente viejo se borra al final.
2. **`src/pages/Facturas.tsx`** — tiene 4 KPI cards arriba. Identificar dónde están definidas y los datos que muestran (Cobrado Anual con selector de año, Emitidas Hoy, Emitidas Mes, Pagadas Mes).
3. **`src/pages/FacturacionPendiente.tsx`** y **`src/pages/Cotizaciones.tsx`** — páginas hermanas que también necesitan el filtro extendido. Verificar si tienen KPI cards similares o solo lista.
4. **`src/utils/fecha.ts`** — verificar si existe (item d del cleanup ticket). Si no existe, este sprint NO lo crea (depende del cleanup). Si existe, reusar `formatYYYYMMDDLocal`.
5. **`src/services/configWeb.service.ts`** — para guardar "filtros guardados" del usuario podemos usar config_web/filtros_guardados o localStorage. Decisión: localStorage por simplicidad (no requiere Firestore writes ni rules nuevas).

## Decisiones tomadas con Jorge

- **Búsqueda**: match parcial simple (no fuzzy). Más predecible.
- **Filtros guardados**: SÍ, en localStorage por usuario. Alto valor, poco costo.
- **URL sync**: SÍ. Mejora UX para compartir links con coordinadora.
- **KPI cards**: las 4 son clickeables y aplican filtros específicos.
- **Botón Aplicar**: el filtro NO se aplica automáticamente. Solo cuando das click en "Aplicar" o atajo. Excepción: tabs y buscador siguen siendo en vivo (live filter).
- **Reescribir el componente**: nuevo nombre `FiltroAvanzadoFinanzas.tsx`. Reemplaza al `FiltroRangoFechas.tsx` (que se borra).

## Schema (sin cambios en Firestore)

Solo localStorage:

```typescript
// localStorage key: 'filtros-finanzas-v1'
interface FiltrosFinanzasGuardados {
  ultimoFiltro?: {
    pagina: 'facturas' | 'facturacion-pendiente' | 'cotizaciones';
    estado: string;        // tab activo
    busqueda: string;
    tipoEquipo: string;
    fechaDesde: string;    // YYYY-MM-DD o ''
    fechaHasta: string;
    campoFecha: 'emision' | 'pago';
  };
  guardados?: {
    id: string;            // uuid local
    nombre: string;        // ej "Pagos del mes pasado"
    pagina: string;
    filtros: Omit<UltimoFiltro, 'pagina'>;
    creadoEn: string;      // ISO timestamp
  }[];
}
```

URL query params:

```
?desde=2026-04-01&hasta=2026-04-30&campo=emision&q=brito&tipo=Lavadora&estado=Pagada
```

Al montar el componente, leer URL primero. Si hay params, usarlos. Sino, leer `ultimoFiltro` de localStorage. Sino, usar defaults (mes corriente).

## Cambios

### 1. Nuevo componente `src/components/admin/FiltroAvanzadoFinanzas.tsx`

```typescript
interface Props {
  pagina: 'facturas' | 'facturacion-pendiente' | 'cotizaciones';
  // Datos para filtrar
  // ... según el llamador, items que la página tenga
  items: any[];              // facturas, conduces o cotizaciones
  // Callback con los items filtrados
  onChange: (filtrados: any[], filtroActivo: FiltroActivo) => void;
  // Si la página tiene tabs de estado
  estados?: string[];        // ['Todas', 'Emitida', 'Pagada', ...]
  // Si tiene toggle emisión/pago
  permiteCampoFecha?: boolean;
  // Si querés mostrar el contador de "N filtros activos"
  mostrarIndicador?: boolean;
  // Si querés botón de filtros guardados
  permiteFiltrosGuardados?: boolean;
}

interface FiltroActivo {
  estado: string;
  busqueda: string;
  tipoEquipo: string;
  fechaDesde: string;
  fechaHasta: string;
  campoFecha: 'emision' | 'pago';
  filtrosActivosCount: number;
}
```

**Layout (mobile-first, ~380px y desktop):**

```
┌─ Tabs (Todas / Emitida / Pagada / Vencida / Anulada) ─────────────────────┐

┌─ Línea 2: Buscador + Tipo Equipo ─────────────────────────────────────────┐
│ [🔍 Nombre, # orden, # conduce, teléfono...]   [Tipo: Todos ▼]            │

┌─ Línea 3: Rango de fechas ────────────────────────────────────────────────┐
│ Por emisión ▼  [01/05/2026]  →  [02/05/2026]                              │
│ [Hoy] [Semana] [Mes] [Trimestre] [Año]              [Aplicar] [Limpiar]   │

┌─ Línea 4: Indicador + filtros guardados ──────────────────────────────────┐
│ 3 filtros activos · Mostrando 5 de 9     [💾 Guardar] [📂 Cargar]        │
```

Mobile (< 640px): cada bloque se apila vertical.

### 2. Lógica de filtrado

```typescript
// Filtro en memoria, instantáneo.
const filtrados = items.filter(item => {
  // 1. Estado (tab)
  if (estado !== 'Todas' && item.estado !== estado.toLowerCase()) return false;

  // 2. Búsqueda parcial
  if (busqueda) {
    const q = busqueda.toLowerCase();
    const matches = (
      item.clienteNombre?.toLowerCase().includes(q) ||
      item.numero?.toLowerCase().includes(q) ||           // CG-00015
      item.ordenNumero?.toLowerCase().includes(q) ||       // OS-0042
      item.clienteTelefono?.includes(busqueda) ||          // 8090000000
      item.equipoTipo?.toLowerCase().includes(q) ||         // Lavadora
      item.equipoMarca?.toLowerCase().includes(q)
    );
    if (!matches) return false;
  }

  // 3. Tipo equipo
  if (tipoEquipo !== 'Todos' && item.equipoTipo !== tipoEquipo) return false;

  // 4. Rango de fechas
  if (fechaDesde || fechaHasta) {
    const campo = campoFecha === 'emision' ? item.fechaEmision : item.fechaPago;
    if (!campo) return false;

    const fecha = new Date(campo);
    if (fechaDesde) {
      const desde = new Date(fechaDesde + 'T00:00:00');
      if (fecha < desde) return false;
    }
    if (fechaHasta) {
      const hasta = new Date(fechaHasta + 'T23:59:59');
      if (fecha > hasta) return false;
    }
  }

  return true;
});
```

### 3. Atajos de fechas rápidas

```typescript
function aplicarAtajo(atajo: 'hoy' | 'semana' | 'mes' | 'trimestre' | 'año') {
  const hoy = new Date();
  let desde: Date, hasta: Date;

  switch (atajo) {
    case 'hoy':
      desde = hasta = hoy;
      break;
    case 'semana':
      desde = new Date(hoy);
      desde.setDate(hoy.getDate() - hoy.getDay()); // domingo
      hasta = hoy;
      break;
    case 'mes':
      desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      hasta = hoy;
      break;
    case 'trimestre':
      const q = Math.floor(hoy.getMonth() / 3);
      desde = new Date(hoy.getFullYear(), q * 3, 1);
      hasta = hoy;
      break;
    case 'año':
      desde = new Date(hoy.getFullYear(), 0, 1);
      hasta = hoy;
      break;
  }

  setFechaDesde(formatYYYYMMDDLocal(desde));
  setFechaHasta(formatYYYYMMDDLocal(hasta));
  aplicar();  // dispara onChange con los nuevos valores
}
```

### 4. Botón "Aplicar" — comportamiento

- Inputs de fecha solo actualizan estado local (`fechaDesdeLocal`, `fechaHastaLocal`).
- Al click "Aplicar", copia los valores locales a los aplicados (`fechaDesde`, `fechaHasta`) y dispara `onChange`.
- Tabs y buscador siguen aplicando en vivo (live filter) — esos no necesitan botón.
- Si el usuario cambia atajo de fecha, también dispara aplicar inmediatamente.
- Botón "Limpiar" resetea TODO (estado, busqueda, tipo equipo, fechas) y aplica.

### 5. Botón "Guardar este filtro"

```typescript
function guardarFiltro() {
  const nombre = prompt('Nombre del filtro guardado:');
  if (!nombre) return;
  const guardados = leerLocalStorage('guardados') ?? [];
  guardados.push({
    id: crypto.randomUUID(),
    nombre: nombre.slice(0, 50),
    pagina,
    filtros: filtroActivo,
    creadoEn: new Date().toISOString(),
  });
  escribirLocalStorage('guardados', guardados);
  toast.success(`Filtro "${nombre}" guardado`);
}
```

Click en "Cargar" abre dropdown con la lista de guardados. Click en uno aplica todos los filtros + dispara aplicar.

Botón "🗑️" al lado de cada guardado para borrarlo.

### 6. Persistencia localStorage

Al ejecutar `aplicar()`:

```typescript
escribirLocalStorage('ultimoFiltro', {
  pagina,
  estado, busqueda, tipoEquipo,
  fechaDesde, fechaHasta, campoFecha,
});
```

Al montar:

```typescript
useEffect(() => {
  // Prioridad: URL > localStorage > defaults
  const params = new URLSearchParams(window.location.search);
  if (params.has('desde')) {
    // Usar URL
    setFechaDesde(params.get('desde') ?? '');
    setFechaHasta(params.get('hasta') ?? '');
    setBusqueda(params.get('q') ?? '');
    setTipoEquipo(params.get('tipo') ?? 'Todos');
    setEstado(params.get('estado') ?? 'Todas');
    setCampoFecha((params.get('campo') as any) ?? 'emision');
    setTimeout(aplicar, 0); // aplicar tras setear estado
  } else {
    const ultimo = leerLocalStorage('ultimoFiltro');
    if (ultimo?.pagina === pagina) {
      // Restaurar
      setFechaDesde(ultimo.fechaDesde);
      // ... etc
      setTimeout(aplicar, 0);
    } else {
      // Defaults: mes corriente
      aplicarAtajo('mes');
    }
  }
}, []);
```

### 7. URL sync

Al ejecutar `aplicar()`, también:

```typescript
const params = new URLSearchParams();
if (fechaDesde) params.set('desde', fechaDesde);
if (fechaHasta) params.set('hasta', fechaHasta);
if (busqueda) params.set('q', busqueda);
if (tipoEquipo !== 'Todos') params.set('tipo', tipoEquipo);
if (estado !== 'Todas') params.set('estado', estado);
if (campoFecha !== 'emision') params.set('campo', campoFecha);

const newUrl = `${window.location.pathname}?${params.toString()}`;
window.history.replaceState({}, '', newUrl);
```

### 8. KPI cards clickeables en `src/pages/Facturas.tsx`

Las 4 cards arriba del listado:

| Card | Click aplica |
|---|---|
| **Cobrado Anual {año}** | tab=Pagada, fechaDesde=`{año}-01-01`, fechaHasta=`{año}-12-31`, campoFecha=pago |
| **Emitidas Hoy** | tab=Emitida, fechaDesde=hoy, fechaHasta=hoy, campoFecha=emision |
| **Emitidas Mes** | tab=Emitida, fechaDesde=1ro mes, fechaHasta=hoy, campoFecha=emision |
| **Pagadas Mes** | tab=Pagada, fechaDesde=1ro mes, fechaHasta=hoy, campoFecha=pago |

Implementación:

```typescript
// En Facturas.tsx
const filtroRef = useRef<FiltroAvanzadoFinanzasRef>(null);

function aplicarFiltroDesdeKPI(preset: 'cobradoAnual' | 'emitidasHoy' | 'emitidasMes' | 'pagadasMes') {
  filtroRef.current?.aplicarPreset(preset);
}

// En cada Card, agregar onClick={() => aplicarFiltroDesdeKPI('emitidasHoy')}
```

El componente expone una API imperativa via `forwardRef` con métodos públicos: `aplicarPreset(name)`, `limpiar()`, `aplicarAtajo(name)`.

Cards visualmente: agregar `cursor-pointer hover:border-primary` y un pequeño tooltip "Click para filtrar".

### 9. Filtro tipo equipo

```typescript
// Lista de tipos: lee de useTiposEquipo() (commit anterior)
const tipos = useTiposEquipo();
// ['Todos', 'Lavadora', 'Nevera', 'Estufa', 'Secadora', 'Aire Acondicionado', 'Otro']
```

Reusa el hook existente.

Para **Cotizaciones**, el campo es directamente `equipoTipo` en el doc.
Para **Facturas** y **FacturacionPendiente**, hay que cruzar con la orden vinculada (cada conduce tiene `ordenId`). Cargar la orden con `parseOrden()` o usar un map indexado al montar.

### 10. Indicador "N filtros activos"

```typescript
const filtrosActivosCount = [
  estado !== 'Todas',
  busqueda.trim().length > 0,
  tipoEquipo !== 'Todos',
  fechaDesde,
  fechaHasta,
].filter(Boolean).length;
```

Render: `<span>{filtrosActivosCount} filtros activos · Mostrando {filtrados.length} de {items.length}</span>`.

### 11. Aplicación a las 3 páginas

- **`/admin/facturas`**: full feature (KPI cards drillable, todos los filtros).
- **`/admin/facturacion-pendiente`**: filtros básicos + buscador unificado + tipo equipo. KPI cards si las tiene (verificar).
- **`/admin/cotizaciones`**: filtros básicos + buscador unificado + tipo equipo. KPI cards si las tiene.

Reusan el mismo componente `FiltroAvanzadoFinanzas.tsx` con props distintas.

### 12. Borrar `FiltroRangoFechas.tsx` viejo

Una vez que las 3 páginas usen el componente nuevo, eliminar el archivo viejo y todos sus imports.

## Verificación

**Tester:**

- Click en cada KPI card → aplica el preset correcto + cambia URL.
- Cambiar inputs de fecha NO aplica auto. Solo "Aplicar" o atajo.
- Atajos (Hoy/Semana/Mes/Trimestre/Año) setean fechas y aplican.
- Buscar "Brito" → matches por nombre cliente.
- Buscar "OS-0042" → matches por número de orden.
- Buscar "CG-0015" → matches por número de conduce.
- Buscar "8090000000" → matches por teléfono.
- Filtro tipo equipo "Lavadora" → solo conduces de lavadoras.
- Combinaciones (AND): tab Pagada + tipo Lavadora + búsqueda "Brito" + rango mes → todos aplican.
- Botón "Limpiar" resetea TODO y muestra histórico completo.
- Botón "Guardar" pide nombre, almacena en localStorage. "Cargar" lo lista.
- Refrescar página → filtros se restauran de localStorage.
- Pegar URL con `?desde=2026-04-01&hasta=2026-04-30` → aplica esos filtros.
- Indicador "N filtros activos" actualiza en vivo.
- iPhone SE 320px: filtros se apilan vertical sin cortes.
- Tester debe probar las 3 páginas (Facturas, FacturacionPendiente, Cotizaciones).

**Reviewer:**

- `aplicar()` se llama solo cuando se debe — no en cada keystroke.
- localStorage no crece sin límite (cap de 50 filtros guardados, FIFO).
- URL params codifican correctamente caracteres especiales (encodeURIComponent).
- Búsqueda case-insensitive.
- Performance: si hay 1000 facturas, filtrado < 100ms (filter + 5 condiciones es O(n) trivial).
- KPI cards: el ref pattern con `forwardRef` y `useImperativeHandle` está bien implementado.
- No hay listeners onSnapshot adicionales — todo el filtrado es client-side sobre los datos ya cargados.
- Mobile responsive verificado.
- Defaults inteligentes: si la página se abre por primera vez (sin localStorage), arranca con mes corriente.
- `formatYYYYMMDDLocal` reusa el helper existente — NO duplicar.
- Si `useTiposEquipo()` retorna fallback (carga lenta de config_web), el filtro de tipo equipo sigue funcionando.

## Commit message sugerido

```
feat(filtros): filtro avanzado en modulos financieros con drilldown desde KPI cards

Reemplaza FiltroRangoFechas (commit aebf689) con FiltroAvanzadoFinanzas
en /admin/facturas, /admin/facturacion-pendiente y /admin/cotizaciones.

Caracteristicas nuevas:

1. Boton "Aplicar" - filtros NO se aplican automaticamente al cambiar
   inputs de fecha. Tabs y buscador siguen siendo live.
2. Atajos rapidos - Hoy / Semana / Mes / Trimestre / Año setean fechas
   y aplican.
3. Buscador unificado - match parcial por nombre cliente, numero de
   orden (OS-XXXX), numero de conduce (CG-XXXXX), telefono y tipo de
   equipo.
4. Filtro por tipo de equipo - dropdown que reusa useTiposEquipo().
5. KPI cards de Facturas son clickeables con drilldown:
   - Cobrado Anual: tab Pagada + año seleccionado por fecha pago
   - Emitidas Hoy: tab Emitida + hoy por fecha emision
   - Emitidas Mes: tab Emitida + mes corriente por fecha emision
   - Pagadas Mes: tab Pagada + mes corriente por fecha pago
6. Persistencia localStorage del ultimo filtro aplicado por pagina.
7. URL sync via query params (?desde=...&hasta=...&q=...) - permite
   compartir links con filtros pre-aplicados.
8. Filtros guardados nombrados - admin guarda combinaciones frecuentes
   (ej "Pagos del mes pasado") y las carga con un click.
9. Indicador visible "N filtros activos · Mostrando X de Y".

Componente FiltroRangoFechas.tsx eliminado, todos sus consumers
migrados al nuevo FiltroAvanzadoFinanzas.tsx.

API imperativa via forwardRef expone aplicarPreset(name), limpiar() y
aplicarAtajo(name) - usado por las KPI cards.

Sin cambios de schema en Firestore. Sin nuevos listeners. Filtrado
100% client-side sobre datos ya cargados.

Mobile responsive con flex-wrap. Tested en iPhone SE 320px.
```

## Ante cualquier ambigüedad

- Si las KPI cards de FacturacionPendiente o Cotizaciones no existen visualmente, no agregar drilldown ahí. Solo Facturas tiene cards arriba según el screenshot.
- Si un filtro guardado tiene fechas absolutas (`2026-04-01`), al cargarlo dentro de un mes diferente las fechas siguen siendo las del momento de guardado. Si se quisieran filtros relativos ("últimos 30 días"), agregarlo después como feature separada.
- Si el localStorage está corrupto (JSON parse falla), limpiarlo silenciosamente y arrancar con defaults.
- Si el componente queda muy grande (>400 líneas), extraer subcomponentes: `<BuscadorUnificado />`, `<FiltroFechas />`, `<FiltrosGuardados />`, `<IndicadorFiltrosActivos />`.
- Si el reviewer detecta que el patrón `forwardRef` + `useImperativeHandle` es over-engineering, alternativa más simple: pasar funciones de aplicar como prop callback desde Facturas.tsx hacia el filtro. Decidir según legibilidad final.
- Si los items no tienen `equipoTipo` directamente (caso Facturas), cargar las órdenes vinculadas en un Map al montar y enriquecer cada item con su `equipoTipoOrden`. NO hacer un read por click.
- URL sync con `replaceState` (no `pushState`) para no llenar el history del browser con cada cambio de filtro.
