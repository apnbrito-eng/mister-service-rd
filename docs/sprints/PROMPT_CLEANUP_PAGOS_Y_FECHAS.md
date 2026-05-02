# Sprint cleanup: pagos transaccionales + helper de fechas locales

Usa el subagente coordinator.

## Objetivo

Consolidar 4 ítems de followup que quedaron como concerns no bloqueantes
en sprints recientes (C5 followup en `RegistrarPagoModal.tsx` + filtro
de rango de fechas en módulos financieros). Sprint corto, ~30-45 min,
sin cambios funcionales visibles al usuario salvo el botón "Eliminar
pago" que pasa a quedar `disabled` mientras corre la transacción.

## Pre-investigación (ya verificada al armar este ticket)

- `src/utils/firestore.ts` ya exporta `stripUndefined<T>(value: T): T` —
  recursivo, preserva `Date`/`Timestamp`/arrays. Listo para reusar.
- `src/utils/fecha.ts` **no existe**.
- `src/components/admin/FiltroRangoFechas.tsx` exporta hoy
  `formatYYYYMMDDLocal(d: Date): string` (basado en `getFullYear` /
  `getMonth` / `getDate`).
- `src/pages/Comisiones.tsx` usa `.toISOString().slice(0, 10)` en
  líneas 26-27 (defaults de `fechaDesde` / `fechaHasta`) y línea 97
  (`c.fechaCobro.toISOString().slice(0, 10)` para display/CSV — el
  Date ya viene del documento, distinto al caso del default).
- `src/pages/HistorialAnuladas.tsx` línea 117 usa
  `new Date().toISOString().slice(0, 10)` para componer el nombre del
  archivo CSV exportado.
- `src/components/ordenes/RegistrarPagoModal.tsx`:
  - Ya tiene `setSaving` (líneas 38, 70, 92, 225) usado en
    `handleGuardar`. `handleEliminarPago` (líneas 229-307) **no** lo
    setea.
  - `crearRegistroAuditoria(...)` se llama dentro del callback de
    `runTransaction` en `handleGuardar` (~línea 185) y
    `handleEliminarPago` (línea 277). Esa función internamente usa
    `Timestamp.now()` para el campo `fecha` del registro de auditoría.

## Items

### a) `stripUndefined` inline → helper compartido

**Archivo**: `src/components/ordenes/RegistrarPagoModal.tsx`.

Hoy `handleGuardar` (~líneas 204-207) y `handleEliminarPago`
(líneas 293-296) hacen el mismo strip-undefined inline:

```ts
const updatesLimpios = Object.fromEntries(
  Object.entries(updates).filter(([, v]) => v !== undefined),
);
```

Reemplazar por:

```ts
import { stripUndefined } from '../../utils/firestore';
// ...
const updatesLimpios = stripUndefined(updates);
```

El helper ya es recursivo y preserva `Timestamp` / `arrayUnion`
sentinel (verificar que `arrayUnion(registro)` siga funcionando — el
`FieldValue` que devuelve `arrayUnion` no es `undefined`, pero hay que
confirmar que `stripUndefined` no lo destruya recursivamente. Si el
helper rompe `FieldValue`, ajustarlo o dejar el inline con un
comentario explicando el por qué).

### b) Botón "Eliminar pago" sin `disabled` durante la transacción

**Archivo**: `src/components/ordenes/RegistrarPagoModal.tsx`.

`handleEliminarPago` no setea `setSaving(true/false)`. Si el usuario
hace doble click o tiene red lenta, dispara dos transacciones —
absorbidas por la idempotencia (la segunda es no-op), pero igual son
dos calls a Firestore.

Cambios:
1. En `handleEliminarPago`, envolver la transacción con
   `setSaving(true)` antes y `setSaving(false)` en `finally`.
2. En el botón de eliminar (línea ~364, `onClick={() =>
   handleEliminarPago(p)}`), agregar `disabled={saving}` y un estilo
   visual coherente con el resto del modal (`opacity-50` /
   `cursor-not-allowed` o lo que ya use el botón de "Guardar pago").

Verificar que `saving` no quede atascado en `true` si la transacción
tira (el `finally` lo cubre). Verificar que el botón de "Guardar pago"
también queda disabled mientras `saving` está en `true` por
`handleEliminarPago` corriendo (debería: comparten el mismo flag,
deseado).

### c) `crearRegistroAuditoria` con `Timestamp.now()` dentro del callback

**Archivo**: `src/components/ordenes/RegistrarPagoModal.tsx`.

`crearRegistroAuditoria(...)` se invoca dentro del callback de
`runTransaction` en `handleGuardar` (~línea 185) y `handleEliminarPago`
(línea 277). La función crea un `fecha: Timestamp.now()` cada vez que
se llama. Si Firestore reintenta el callback internamente (lo hace bajo
contención), `arrayUnion(registro)` deja **dos** entries en
`auditoria` con timestamps distintos — `arrayUnion` solo dedupea por
deep equality.

Fix: capturar el registro UNA vez antes del `runTransaction`:

```ts
// Antes del runTransaction
const usuario = userProfile?.nombre || 'Sistema';
// ...para handleEliminarPago:
const registroAuditoria = crearRegistroAuditoria(
  usuario,
  'editar',
  `Eliminó pago de ${formatearMonto(montoEliminado)} (${metodoEliminado})`,
  'pagos',
  // montoPagadoPrevio / nuevoMontoPagado se calculan adentro,
  // dejarlos vacíos o moverlos también afuera si se conocen.
);

await runTransaction(db, async (tx) => {
  // ...
  const updates = { ..., auditoria: arrayUnion(registroAuditoria) };
  // ...
});
```

**Decisión a tomar en este sprint**: los campos `valorPrevio` y
`valorNuevo` del registro hoy se calculan adentro de la transacción
(porque dependen del read fresco). Hay 2 opciones:

1. **Sacrificar precisión de `valorPrevio` / `valorNuevo`**: capturar
   el registro afuera con los valores del state local (lo que el
   usuario "vio" cuando clickeó). Es lo que la mayoría de auditorías
   muestran. Descartar la idea de mostrar el valor real post-recálculo.

2. **Capturar `Timestamp.now()` afuera, pasarlo al constructor**:
   modificar `crearRegistroAuditoria` para aceptar un `fecha?:
   Timestamp` opcional. Si no se pasa, sigue usando `Timestamp.now()`
   (backward compatible). Adentro de la transacción, llamar
   `crearRegistroAuditoria(..., fechaCapturada)`. Esto preserva el
   recálculo desde read fresco y elimina el non-determinism del retry.

Recomendación: opción 2 (mínimo cambio, sin pérdida de info). Aplicar
también a `handleGuardar`.

### d) Helper `formatYYYYMMDDLocal` reutilizable

**Archivos**:
- Origen actual: `src/components/admin/FiltroRangoFechas.tsx`.
- Nuevos consumidores: `src/pages/Comisiones.tsx` (líneas 26-27),
  `src/pages/HistorialAnuladas.tsx` (línea 117).

**Decisión a tomar**: dónde vive el helper.

- **Opción A**: dejarlo en `FiltroRangoFechas.tsx`, importar desde
  `Comisiones.tsx` (que de hecho ya importa el componente) y
  `HistorialAnuladas.tsx`. Costo: `HistorialAnuladas` se acopla a un
  archivo de componente para usar un helper puro de fecha.
- **Opción B**: mover el helper a un `src/utils/fecha.ts` nuevo y
  hacer que `FiltroRangoFechas.tsx` re-exporte (o importe sin
  re-export) desde ahí. Más limpio semánticamente.

Recomendación: **opción B**. Crear `src/utils/fecha.ts` con
`formatYYYYMMDDLocal`. Actualizar el import en `FiltroRangoFechas.tsx`
y agregarlo en los 3 archivos page-level. Mantener el JSDoc actual
explicando el por qué del helper (zona horaria es-DO).

**Aplicación**:
1. `Comisiones.tsx` líneas 26-27 (defaults `fechaDesde`/`fechaHasta`):
   reemplazar `.toISOString().slice(0, 10)` por
   `formatYYYYMMDDLocal(...)`.
2. `Comisiones.tsx` línea 97 (`c.fechaCobro.toISOString().slice(0, 10)`):
   evaluar caso a caso. Si `fechaCobro` viene de un `Timestamp`
   Firestore convertido a `Date`, el comportamiento varía con TZ.
   Si la columna es display de día, conviene local. Si es CSV
   importado/exportado entre sistemas, UTC puede ser intencional.
   **El reviewer debe decidir** mirando el use case: si es para que
   un humano en RD lea "2026-05-02", aplicar el helper; si es para
   intercambio con DGII/sistema externo, dejar UTC y comentar el por
   qué.
3. `HistorialAnuladas.tsx` línea 117 (nombre del archivo CSV):
   aplicar el helper. El nombre es para humanos.

## Alcance estricto

- 1 archivo nuevo: `src/utils/fecha.ts`.
- 5 archivos modificados:
  - `src/components/admin/FiltroRangoFechas.tsx` (importar de
    `utils/fecha.ts`).
  - `src/components/ordenes/RegistrarPagoModal.tsx` (items a, b, c).
  - `src/pages/Comisiones.tsx` (item d).
  - `src/pages/HistorialAnuladas.tsx` (item d).
  - Posible: `src/utils/index.ts` si `crearRegistroAuditoria` cambia
    firma para aceptar `fecha?` opcional (item c, opción 2).

NO refactores oportunistas. NO toques otros archivos que también usen
`stripUndefined` inline o `.toISOString().slice(0, 10)` en otros
contextos — fuera de scope.

## Verificación

**Tester**:
- `npm run build` y `npm run lint` limpios.
- Grep que confirme:
  - `Object.fromEntries(Object.entries(...).filter(...v !== undefined))`
    ya no aparece en `RegistrarPagoModal.tsx`.
  - `.toISOString().slice(0, 10)` ya no aparece en `Comisiones.tsx`
    líneas 26-27 ni en `HistorialAnuladas.tsx` línea 117.
- Verificar que `crearRegistroAuditoria` se invoca **fuera** del
  callback de `runTransaction` en ambos handlers (capture once before
  the transaction).
- Verificar que `setSaving` se setea/limpia en `handleEliminarPago`
  con `try/finally`.

**Reviewer**:
- Confirmar que `stripUndefined` recursivo NO destruye el
  `FieldValue` de `arrayUnion(...)`. Si lo destruye, revertir el item
  (a) en `auditoria` y dejar el inline con comentario explicativo.
- Confirmar que el botón "Eliminar pago" muestra estado visual
  disabled coherente con el botón "Guardar pago" (mismo `opacity-50`,
  mismo cursor).
- Confirmar que el cambio de firma de `crearRegistroAuditoria`
  (item c, opción 2) es backward compatible — todas las llamadas
  existentes siguen funcionando sin cambios.
- Confirmar que `formatYYYYMMDDLocal` movido a `utils/fecha.ts`
  conserva el JSDoc explicando el por qué del helper (no es un
  helper genérico de fecha — existe específicamente porque
  `<input type="date">` requiere YYYY-MM-DD y `toISOString()`
  introducía off-by-one en TZ es-DO).
- Para `Comisiones.tsx` línea 97: verificar la decisión sobre
  aplicar o no el helper. Si se aplica, validar que el cambio de
  string mostrado sea el deseado (puede afectar reportes que dependan
  de la fecha exacta).

## Commit message sugerido

```
chore(cleanup): consolidar stripUndefined, audit retry y formatYYYYMMDDLocal

Cuatro followups que quedaron como concerns no bloqueantes en los
sprints C5 followup y filtro de rango de fechas:

a) RegistrarPagoModal usa stripUndefined del helper compartido
   (utils/firestore.ts) en lugar del Object.fromEntries inline en
   handleGuardar y handleEliminarPago. Sin cambios de comportamiento.

b) Boton Eliminar pago ahora se deshabilita mientras la transaccion
   esta in-flight (igual que el de Guardar pago). Evita doble-click
   disparando dos transacciones (la idempotencia ya las absorbia,
   pero igual son dos calls innecesarios).

c) crearRegistroAuditoria se invoca UNA vez antes del runTransaction
   y el registro capturado se reusa entre reintentos del callback.
   Antes, si Firestore reintentaba internamente bajo contencion,
   arrayUnion dejaba dos entries en auditoria con Timestamp.now()
   distinto. Aplica a handleGuardar y handleEliminarPago.

d) Helper formatYYYYMMDDLocal movido de FiltroRangoFechas a un
   utils/fecha.ts nuevo. Aplicado a los defaults de Comisiones.tsx
   (fechaDesde/fechaHasta) y al nombre del CSV de HistorialAnuladas.
   Antes usaban toISOString().slice(0,10) que mostraba el dia
   siguiente entre 20:00 y 23:59 hora RD.

Sin cambios funcionales visibles al usuario salvo el disabled del
boton de eliminar pago. Sin tocar schema, rules, listeners ni
servicios.
```

## Ante cualquier ambigüedad

- Si `stripUndefined` destruye `FieldValue` (item a sobre `auditoria`
  con `arrayUnion`): revertir solo ese campo a inline, dejar comentado
  el por qué, y mantener el resto del helper aplicado al resto de
  campos.
- Si el reviewer prefiere la opción 1 del item c (capturar valores
  precisos del state local) sobre la 2 (modificar firma): adelante.
  Documentar la decisión en el commit.
- Si `Comisiones.tsx` línea 97 se decide dejar como UTC (intercambio
  con sistema externo): agregar comentario explicando.
- Si Jorge prefiere mantener `formatYYYYMMDDLocal` en
  `FiltroRangoFechas.tsx` (opción A) en vez de moverlo: ajustar
  imports, sin crear el archivo nuevo.
