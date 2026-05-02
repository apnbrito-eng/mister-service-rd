# Sprint: filtro de rango de fechas en módulos financieros

Usa el subagente coordinator.

## Objetivo

Hoy `/admin/facturas` (Conduces de Garantía) tiene buscador por cliente + tabs por estado, pero **no permite filtrar por rango de fechas**. Cuando hay muchos conduces emitidos, encontrar uno específico de un mes pasado es lento.

Agregar filtro **"Desde / Hasta"** que filtra por `fechaEmision` (default) con opción de cambiar a `fechaPago`.

Aplicar el mismo patrón a otros módulos financieros donde también es útil:

1. `/admin/facturas` (Conduces de Garantía) — **prioridad alta** (este es el que pidió Jorge).
2. `/admin/facturacion-pendiente` — útil para auditar pagos del mes.
3. `/admin/cotizaciones` — buscar cotizaciones por fecha.
4. `/admin/gastos` — si existe.
5. `/admin/comisiones` — buscar comisiones de una quincena específica.

Fase 1 (este sprint): solo el #1. Si tiempo permite, extender. Sino, sprint separado para los demás.

## Pre-investigación

1. **`src/pages/Facturas.tsx`**: identificar el bloque de filtros actual (tabs + buscador). Ver dónde insertar el nuevo filtro.
2. **`src/utils/index.ts`**: hay un helper `parseFactura()` que ya rehidrata `fechaEmision` y `fechaPago` defensivamente. Reusar.
3. **Ya hay un patrón similar en otra parte del repo?** Buscar `from`, `to`, `fechaDesde`, `fechaHasta` en src/pages/. Si Reportes DGII o Estado de Resultado ya tienen este patrón, reusar componente.

## Schema

No requiere schema nuevo. Usa los campos existentes `fechaEmision` y `fechaPago` de `Factura`.

## Cambios en `src/pages/Facturas.tsx`

### 1. Estado nuevo

```typescript
const [fechaDesde, setFechaDesde] = useState<string>('');  // YYYY-MM-DD
const [fechaHasta, setFechaHasta] = useState<string>('');
const [campoFecha, setCampoFecha] = useState<'emision' | 'pago'>('emision');
```

Default: `fechaDesde = primer día del mes corriente`, `fechaHasta = hoy`. Al montar, calcular en es-DO. Al limpiar (botón "Limpiar filtros"), poner ambos en `''` y mostrar todas.

### 2. UI nueva — segundo bloque de filtros bajo los tabs

```tsx
<div className="flex flex-wrap items-center gap-3 mt-3 pb-4 border-b border-gray-100">
  <span className="text-xs font-medium text-gray-500 uppercase">Rango de fechas:</span>

  <select value={campoFecha} onChange={...} className="text-sm border rounded-lg px-2 py-1.5">
    <option value="emision">Por emisión</option>
    <option value="pago">Por pago</option>
  </select>

  <input type="date" value={fechaDesde} onChange={...} className="text-sm border rounded-lg px-2 py-1.5" />
  <span className="text-sm text-gray-500">→</span>
  <input type="date" value={fechaHasta} onChange={...} className="text-sm border rounded-lg px-2 py-1.5" />

  {(fechaDesde || fechaHasta) && (
    <button type="button" onClick={limpiarFiltros} className="text-sm text-gray-500 hover:text-gray-900">
      Limpiar
    </button>
  )}

  <span className="ml-auto text-xs text-gray-500">
    Mostrando {facturasFiltradas.length} de {facturas.length}
  </span>
</div>
```

Mobile responsive: en pantallas chicas, los inputs se apilan vertical. `flex-wrap` ya lo cubre.

### 3. Lógica de filtrado

Extender el filtro existente para incluir el rango:

```typescript
const facturasFiltradas = facturas.filter(f => {
  // Filtros existentes (estado, cliente, búsqueda) siguen igual.
  // ...

  // NUEVO: filtro de rango de fechas
  if (fechaDesde || fechaHasta) {
    const campo = campoFecha === 'emision' ? f.fechaEmision : f.fechaPago;
    if (!campo) return false;  // Si no tiene fecha del campo elegido, fuera.

    const fechaDoc = new Date(campo);
    if (fechaDesde) {
      const desde = new Date(fechaDesde + 'T00:00:00');
      if (fechaDoc < desde) return false;
    }
    if (fechaHasta) {
      const hasta = new Date(fechaHasta + 'T23:59:59');
      if (fechaDoc > hasta) return false;
    }
  }

  return true;
});
```

### 4. Defaults inteligentes

Al montar el componente, setear:

```typescript
useEffect(() => {
  const hoy = new Date();
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  setFechaDesde(formatYYYYMMDD(inicioMes));
  setFechaHasta(formatYYYYMMDD(hoy));
}, []);

function formatYYYYMMDD(d: Date) {
  return d.toISOString().slice(0, 10);
}
```

Default: mes corriente. Usuario puede cambiar manual o limpiar.

### 5. Header de la tabla

Si fechaDesde/Hasta están seteados, el contador "9 facturas" arriba del título debería decir algo como "9 facturas en abril 2026" o "Mostrando 9 de 27" para dar contexto.

### 6. CSV export

Si export incluye un botón, respetar el filtro: exportar solo `facturasFiltradas`, no `facturas`.

## Verificación

**Tester:**

- Cargar `/admin/facturas` → default debería ser mes corriente. Lista filtrada.
- Click "Limpiar" → muestra todas las facturas históricas.
- Cambiar "Por emisión" a "Por pago" → resultado cambia coherentemente.
- Setear desde=`2026-01-01`, hasta=`2026-03-31` → solo facturas de Q1.
- Setear desde=`2026-04-30`, hasta=`2026-04-30` (un solo día) → solo de hoy.
- Input desde > input hasta → la lista queda vacía, sin error.
- Input vacío en desde y completo en hasta → filtro solo por hasta.
- Combinación con filtro de estado (tab "Pagada") → ambos filtros aplican (AND).
- Combinación con buscador de cliente → triple AND.

**Reviewer:**

- Default mes corriente respeta zona horaria es-DO (`Intl.DateTimeFormat` o equivalente).
- `parseFactura` ya devuelve fechas correctamente — no re-parseear desde el doc.
- No agrega listeners ni reads adicionales — todo el filtrado es client-side.
- Mobile responsive: en iPhone SE 320px, los inputs no se cortan.
- Performance: si hay 1000 facturas, el filtro debe ser instantáneo (filter es O(n), aceptable). No agregar memo a menos que reviewer detecte lag.

## Commit

```
feat(facturas): filtro de rango de fechas en /admin/facturas

Agrega filtro "Desde / Hasta" sobre fechaEmision (default) o fechaPago
para encontrar conduces específicos en el módulo Conduces de Garantía.

Default al montar: primer día del mes corriente hasta hoy. Botón
"Limpiar" resetea los inputs y muestra todo el histórico.

Combina (AND) con filtros existentes: tabs de estado + buscador de
cliente.

Contador en header se actualiza con N filtradas / M total para dar
contexto.

CSV export respeta el filtro activo.

Sin tocar schema, rules, ni listeners. Filtrado 100% client-side.

Mobile responsive con flex-wrap.
```

## Ante cualquier ambigüedad

- Si hay >1000 facturas y el filtro siente lag, agregar `useMemo` al cálculo de `facturasFiltradas`. Sino dejarlo simple.
- Si Jorge prefiere que el default sea "últimos 30 días" en vez de "mes corriente", ajustar (es 1 línea).
- Si quiere que el filtro extienda a `/admin/cotizaciones` y `/admin/facturacion-pendiente` en este mismo sprint, builder agarra los 3 archivos y aplica el mismo patrón. +30 min al sprint.
- Si el componente del filtro queda complejo (>30 líneas), extraer a `src/components/admin/FiltroRangoFechas.tsx` reusable.
