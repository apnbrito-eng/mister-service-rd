# Sprint: Sistema de descuentos en nómina (avances + ad-hoc + préstamos programados)

Usa el subagente coordinator.

## Objetivo

Hoy el sistema de avances (`avances` collection) descuenta solo de UNA quincena específica. La vista de liquidación además **no muestra los avances aunque el backend ya los calcula** — el admin liquida sin visibilidad de qué se está descontando.

Necesitamos un sistema completo de descuentos en nómina con 3 capas:

1. **Mostrar avances existentes** en la liquidación (bug fix UI).
2. **Descuentos ad-hoc durante liquidación**: admin agrega un descuento puntual a un empleado mientras la liquidación está abierta. Útil cuando hay un anticipo del día que no se registró como avance previo.
3. **Préstamos programados con cuotas**: admin registra que el empleado debe RD$X total en N cuotas — cada quincena se descuenta automáticamente la cuota hasta saldar. El sistema lleva el saldo pendiente.

## Pre-investigación

1. **`src/services/nomina.service.ts`**: ya calcula `emp.totalAvances`, `emp.totalNeto`, `emp.avancesIds` en líneas 192-220. NO tocar — está bien.
2. **`src/services/avances.service.ts`**: lógica actual de avances. Va a coexistir con el sistema nuevo.
3. **`src/pages/Nomina.tsx`**: vista actual. Solo tiene columnas Personal | Rol | Sueldo base | Comisiones | Bono | Total devengado | Pago. No renderiza avances ni netos.
4. **`src/types/index.ts`**: schema de `LiquidacionEmpleado` y `AvanceEmpleado`.

## Schema

### Nuevo: `prestamos_empleados` collection

```typescript
interface PrestamoEmpleado {
  id: string;
  personalId: string;
  personalNombre: string;
  personalRol: Rol;

  montoTotal: number;          // RD$ original del préstamo
  montoCuota: number;          // RD$ a descontar por quincena
  cuotasTotales: number;       // ej: 4
  cuotasPagadas: number;       // ej: 0 al inicio
  saldoPendiente: number;      // = montoTotal - (cuotasPagadas * montoCuota)

  motivo: string;              // libre, ej: "Préstamo para reparación de carro"
  fechaInicio: Timestamp;      // primera quincena en que aplica

  estado: 'activo' | 'pagado' | 'cancelado';

  // Historial de cuotas aplicadas
  cuotasHistorial: CuotaPrestamo[];

  creadoPorId: string;
  creadoPorNombre: string;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

interface CuotaPrestamo {
  numero: number;              // 1, 2, 3, ...
  monto: number;               // monto descontado (puede diferir si es la última)
  liquidacionId: string;       // a qué liquidación se aplicó
  quincena: string;            // formato YYYY-Q1 / YYYY-Q2
  fechaAplicacion: Timestamp;
  saldoRestante: number;       // saldo después de esta cuota
}
```

### Extender `LiquidacionEmpleado`

```typescript
interface LiquidacionEmpleado {
  // ... campos existentes ...

  // Avances pendientes (ya existe)
  avancesIds?: string[];
  totalAvances?: number;

  // NUEVO: descuentos ad-hoc agregados durante esta liquidación abierta
  descuentosAdHoc?: DescuentoAdHoc[];
  totalDescuentosAdHoc?: number;

  // NUEVO: cuotas de préstamos aplicadas a esta quincena
  cuotasPrestamos?: CuotaPrestamoAplicada[];
  totalCuotasPrestamos?: number;

  // RECALCULADO
  totalDescuentos: number;     // = totalAvances + totalDescuentosAdHoc + totalCuotasPrestamos
  totalNeto: number;           // = max(0, totalDevengado - totalDescuentos)
}

interface DescuentoAdHoc {
  id: string;                  // uuid local
  monto: number;
  motivo: string;
  agregadoPorId: string;
  agregadoPorNombre: string;
  agregadoEn: Timestamp;
}

interface CuotaPrestamoAplicada {
  prestamoId: string;
  numeroCuota: number;
  monto: number;
  motivo: string;              // copiado del préstamo para mostrar
}
```

### Helpers nuevos en `src/services/prestamos.service.ts` (NUEVO)

- `crearPrestamo(data)` — crea préstamo activo con cuotas calculadas
- `obtenerPrestamosActivosDePersonal(personalId)` — para mostrar en panel
- `obtenerPrestamosActivosDeQuincena()` — para incluir en liquidación
- `aplicarCuota(prestamoId, liquidacionId, quincena, monto)` — al cerrar liquidación, marca cuota pagada y actualiza saldo
- `cancelarPrestamo(prestamoId, motivo)` — admin solo; marca cancelado, sin afectar liquidaciones pasadas

### Helpers nuevos en `src/services/nomina.service.ts`

- `agregarDescuentoAdHoc(liquidacionId, personalId, descuento)` — solo si liquidación abierta
- `removerDescuentoAdHoc(liquidacionId, personalId, descuentoId)` — solo si liquidación abierta
- `recalcularNetoEmpleado(liquidacion, personalId)` — re-suma todos los descuentos

## Cambios

### 1. Vista `src/pages/Nomina.tsx` — rediseño tabla

Nueva estructura de columnas:

| Personal | Rol | Sueldo base | Comisiones | Bono | **Avances** | **Descuentos** | Total devengado | **Total neto** | Pago | Acción |

- **Avances**: si `emp.totalAvances > 0`, mostrar `-RD$XXX` en rojo + sub-texto "(N avance(s))" gris
- **Descuentos**: combina `totalDescuentosAdHoc + totalCuotasPrestamos`. Si > 0, mostrar `-RD$XXX` en rojo + sub-texto del tipo (ad-hoc, cuota préstamo)
- **Total devengado**: igual que hoy (sueldo + comisiones + bono)
- **Total neto**: si hay descuentos, mostrar en negrita azul. Si no hay, mostrar igual al devengado.

Si hay descuentos ad-hoc en la fila, agregar **botón ➕ junto al monto de Descuentos** que abre un dropdown con los descuentos actuales y opción "Quitar". Solo si liquidación está abierta.

### 2. Modal "Agregar descuento" en cada fila

Nuevo modal `src/components/nomina/AgregarDescuentoModal.tsx`:

- Botón `+ Descuento` en cada fila junto al nombre del empleado (solo si liquidación abierta y rol admin/coord).
- Modal pregunta:
  - **Tipo**: Ad-hoc (puntual de esta quincena) | Préstamo programado (cuotas)
  - Si Ad-hoc: monto, motivo
  - Si Préstamo: monto total, monto por cuota o # cuotas, motivo, fecha inicio (default: quincena actual)
- Submit:
  - Ad-hoc: llama a `agregarDescuentoAdHoc()` → actualiza la liquidación inmediatamente.
  - Préstamo: llama a `crearPrestamo()` → la primera cuota se aplica automáticamente al recalcular la liquidación.

### 3. Nueva vista `/admin/prestamos`

Página `src/pages/Prestamos.tsx` — solo admin/coord:

- Lista de préstamos activos por empleado
- Cards con: empleado, monto total, cuota, # cuotas pagadas, saldo pendiente, próxima fecha de descuento
- Botón "Cancelar préstamo" (admin only) con motivo
- Botón "Ver historial" expande timeline de cuotas aplicadas

Sidebar: agregar entrada "💰 Préstamos a empleados".

### 4. Integración con generación de liquidación

En `nomina.service.ts`, `generarLiquidacion()`:

```typescript
// Después de calcular avances:
const prestamosActivos = await obtenerPrestamosActivosDeQuincena();

// Por cada empleado:
const cuotasEmp = prestamosActivos
  .filter(p => p.personalId === p.id && p.estado === 'activo' && p.cuotasPagadas < p.cuotasTotales)
  .map(p => ({
    prestamoId: p.id,
    numeroCuota: p.cuotasPagadas + 1,
    monto: Math.min(p.montoCuota, p.saldoPendiente),  // última cuota puede ser menor
    motivo: p.motivo,
  }));

const totalCuotasPrestamos = cuotasEmp.reduce((s, c) => s + c.monto, 0);
const totalDescuentos = (totalAvances ?? 0) + totalCuotasPrestamos;
const totalNeto = Math.max(0, totalDevengado - totalDescuentos);

emp.cuotasPrestamos = cuotasEmp;
emp.totalCuotasPrestamos = totalCuotasPrestamos;
emp.totalDescuentos = totalDescuentos;
emp.totalNeto = totalNeto;
```

### 5. Cierre de liquidación

En `cerrarLiquidacion()`:

- Marcar avances como `descontado: true` (ya existe).
- Para cada cuota de préstamo aplicada: llamar a `aplicarCuota()` que incrementa `cuotasPagadas`, agrega entrada a `cuotasHistorial`, actualiza `saldoPendiente`. Si `cuotasPagadas === cuotasTotales`, marcar préstamo como `pagado`.
- Los descuentos ad-hoc no requieren acción en otra colección — viven solo en la liquidación.

### 6. Botón "Marcar pagado" en cada fila

Cambiar:
```typescript
{!emp.pagado && emp.totalDevengado > 0 && (...)}
```

A:
```typescript
{!emp.pagado && (emp.totalNeto ?? emp.totalDevengado) > 0 && (...)}
```

Y al abrir el modal de pago, pasar `montoAPagar = emp.totalNeto ?? emp.totalDevengado` para que se vea el monto correcto.

### 7. Header de liquidación

Cambiar:
```
Liquidación abierta · RD$159,000
```

A:
```
Liquidación abierta · Devengado: RD$159,000 · Neto: RD$143,500
                                                ↑ con tooltip que explica los descuentos
```

Solo mostrar "Neto" si total de descuentos > 0; si no, mostrar solo "RD$X" como hoy.

### 8. CSV export

Línea 150 actualizar:

```typescript
const headers = 'Personal,Rol,Sueldo Base,Comisiones,Bono,Total Devengado,Avances,Descuentos AdHoc,Cuotas Préstamos,Total Descuentos,Total Neto,Pagado,Método de Pago\n';
```

Y completar las filas con los nuevos campos.

### 9. Permisos

- **Admin**: todo (crear/cancelar préstamos, agregar/quitar descuentos ad-hoc, marcar pagado).
- **Coordinadora**: agregar descuentos ad-hoc + crear préstamos. NO cancelar préstamos.
- **Otros roles**: vista read-only de su propia nómina (técnico ve sus avances/cuotas/préstamos pendientes en vista técnico — opcional, agregar si tiempo permite).

### 10. Rules en `firestore.rules`

Agregar nueva colección:

```
match /prestamos_empleados/{docId} {
  allow read: if esStaff();
  allow create, update: if esAdminOCoord();
  allow delete: if esAdmin();
}
```

## Verificación

- **Tester:**
  - Crear avance pendiente para técnico → generar liquidación → verificar que columna Avances muestra el monto en rojo y Total neto = devengado - avance.
  - Liquidación abierta → click "+ descuento" en una fila → agregar ad-hoc RD$200 motivo "anticipo hoy" → verificar que aparece en columna Descuentos y se descuenta del neto.
  - Crear préstamo programado RD$10,000 en 4 cuotas para Aury Mon → verificar que en la próxima liquidación aparece RD$2,500 en Descuentos con motivo del préstamo.
  - Cerrar liquidación → verificar que `cuotasPagadas` del préstamo pasa a 1 y `saldoPendiente` baja a RD$7,500.
  - Generar próxima liquidación → verificar que cuota 2 aparece automáticamente.
  - Liquidar 4 quincenas hasta que préstamo se marque como `pagado` → verificar que en la 5ta liquidación NO aparece más cuota.
  - Cancelar préstamo activo → siguientes liquidaciones no aplican más cuotas.
  - Marcar pagado a un empleado con descuentos → modal muestra el neto, no el devengado. Verificar que pago se registra con el monto correcto.
  - CSV export incluye todas las nuevas columnas.

- **Reviewer:**
  - `recalcularNetoEmpleado` se llama después de cada cambio (agregar/quitar descuento ad-hoc, generar liquidación).
  - Imposible aplicar la misma cuota dos veces (idempotencia: `cuotasHistorial` verifica que no haya entrada con mismo `liquidacionId`).
  - Strip undefined antes de Firestore writes.
  - Si liquidación está cerrada, agregar/quitar descuento ad-hoc devuelve error claro al UI.
  - Cancelar préstamo NO afecta cuotas ya aplicadas en liquidaciones cerradas (solo previene futuras).

## Commit

```
feat(nomina): sistema de descuentos completo (avances + ad-hoc + préstamos programados)

Antes la vista de liquidación no mostraba los avances aunque el backend
los calculaba. Ahora hay un sistema completo de descuentos en 3 capas:

1. Avances pendientes (ya existían): visible en columna nueva "Avances"
   con monto en rojo + total neto recalculado.

2. Descuentos ad-hoc: admin agrega descuento puntual durante la
   liquidación abierta (anticipos del día, ajustes manuales). Botón
   "+ descuento" en cada fila. Vive solo en la liquidación, no en
   colección aparte.

3. Préstamos programados: admin registra deuda total + N cuotas. Cada
   quincena descuenta una cuota automáticamente hasta saldar. Nueva
   colección `prestamos_empleados` con historial de cuotas aplicadas.
   Panel /admin/prestamos para gestión.

Cambios principales:
- Nuevas columnas Avances / Descuentos / Total neto en Nomina.tsx
- Modal AgregarDescuentoModal (ad-hoc o préstamo)
- Página Prestamos.tsx con cards de préstamos activos
- Header de liquidación muestra Devengado y Neto
- Botón "Marcar pagado" valida y muestra monto neto, no devengado
- CSV export incluye todas las nuevas columnas

Schema:
- `prestamos_empleados/*`: nueva colección
- `LiquidacionEmpleado.descuentosAdHoc[]`, `cuotasPrestamos[]`,
  `totalDescuentos`, `totalNeto` (rehidratados defensivamente)

Rules: agregada rule para prestamos_empleados (read=staff, write=
adminOCoord, delete=admin).

Backwards compat: liquidaciones viejas siguen renderizando bien
porque las columnas nuevas usan defaults (`?? 0`).
```

## Ante cualquier ambigüedad

- Si un empleado tiene tanto avance pendiente como cuota de préstamo en la misma quincena, descontar primero los avances, después las cuotas. Si el devengado no alcanza, total neto = 0 y el saldo restante se ve en la próxima quincena (avances quedan pendientes, cuota se aplica parcial con el monto disponible).
- Si admin intenta crear un préstamo cuando ya hay otro activo del mismo empleado, permitirlo (puede tener varios préstamos en paralelo, cada uno con su cuota).
- Si admin elimina un avance que ya está en una liquidación abierta, recalcular el neto de esa liquidación.
- Si una cuota se calcula automáticamente pero el devengado del empleado es 0 esa quincena (ej: técnico inactivo), saltearse esa cuota — NO descontarle nada y NO incrementar `cuotasPagadas`. Mostrar al admin alerta "Préstamo de X tiene cuota pendiente sin aplicar (empleado sin devengado este periodo)".
