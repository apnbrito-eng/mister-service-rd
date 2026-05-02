# Sprint cleanup consolidado: pagos, fechas y nómina (post-Descuentos)

Usa el subagente coordinator.

## Objetivo

Consolidar 11 ítems de followup que quedaron como concerns no bloqueantes
en sprints recientes:

- **Items a-d** (originales): C5 followup en `RegistrarPagoModal.tsx` +
  filtro de rango de fechas en módulos financieros.
- **Items e-k** (extensión post-Descuentos Nómina): trazabilidad,
  alertas UI faltantes, atomicidad del cierre de liquidación,
  restricción de rules, mejoras de UX en préstamos, vista técnico.

Sprint mediano, ~1-2h. Cambios funcionales visibles al usuario:
- Botón "Eliminar pago" pasa a quedar `disabled` mientras corre la
  transacción (item b).
- Banner persistente en `/admin/nomina` cuando hay préstamos sin
  aplicar a la liquidación abierta (item i).
- Alerta en `/admin/prestamos` cuando una cuota se saltea por
  empleado sin devengado (item e).
- Modal "Crear préstamo" muestra preview de la primera cuota antes
  del submit (item j).
- Vista técnico (`/tecnico`) muestra card "Mis préstamos activos"
  (item k).

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

### e) Alerta UI: cuota saltada por `totalDevengado === 0`

**Archivos**: `src/services/nomina.service.ts`, `src/pages/Prestamos.tsx`
(o `Nomina.tsx` — decidir).

Hoy `generarLiquidacion` saltea silenciosamente las cuotas de préstamo
de empleados con `totalDevengado === 0` (líneas ~209-220). El admin no
se entera de que una cuota quedó sin aplicar — el préstamo se "atrasa"
una quincena sin trazabilidad.

**Fix**:
1. En `generarLiquidacion`, junto al cálculo actual, acumular en un
   array `cuotasSalteadas: { personalNombre, prestamoId, motivo,
   montoCuota }[]` cada vez que se saltea una cuota por devengado=0.
2. Persistir ese array en el doc de la liquidación como campo
   `cuotasSalteadas?: CuotaSalteada[]` (extender `Liquidacion` schema —
   opcional, rehidratado defensivamente).
3. En `/admin/prestamos`: mostrar banner persistente "X cuotas no se
   aplicaron en la última liquidación (empleado sin devengado)" con
   tabla de detalle al hacer click. Solo si hay cuotas salteadas en la
   última liquidación cerrada.
4. En `/admin/nomina` (liquidación recién generada o abierta):
   indicador visual en la fila del empleado afectado — ej. icono de
   alerta junto al nombre con tooltip "Préstamo activo sin cuota
   aplicada esta quincena (devengado = 0)".

**Decisión a tomar**: ¿persistir en la liquidación o calcular
on-the-fly cruzando `prestamos_empleados` activos vs. liquidaciones
cerradas? Persistir es más simple y trazable. Recomendación:
persistir.

### f) Atomicidad del cierre de liquidación con cuotas

**Archivo**: `src/services/nomina.service.ts` (`cerrarLiquidacion`).

Hoy el flujo es:

```typescript
await Promise.all(cuotas.map(c => aplicarCuota(...).catch(...)))
await updateDoc(liquidacionRef, { estado: 'cerrada' })
```

Si una cuota falla (red, contención), las otras pasan, la liquidación
se marca cerrada igual, y la cuota fallida queda sin aplicar — sin
path de recovery. El reviewer del sprint Descuentos Nómina lo marcó
como concern no bloqueante.

**Fix (opciones)**:

**Opción 1 — fail-fast con rollback manual**: si CUALQUIER cuota
falla, NO cerrar la liquidación. Bubble el error al UI con detalle de
cuál falló. El admin reintenta el cierre — la idempotencia de
`aplicarCuota` cubre las ya aplicadas. Cambio mínimo, riesgo: si una
cuota tiene un bug consistente, el cierre nunca progresa.

**Opción 2 — atomicidad real con `runTransaction` único**: mover toda
la lógica de cierre + aplicarCuota dentro de un solo `runTransaction`.
Lee la liquidación, lee TODOS los préstamos activos involucrados (max
~30 reads), valida idempotencia, escribe todos los updates juntos.
Limitación: Firestore restringe a 500 writes y 100 reads por
transacción — verificar que no se exceda con liquidaciones grandes.

**Opción 3 — log estructurado + UI de reintento manual**: dejar el
flujo actual, pero agregar log a `cuotas_pendientes_aplicacion`
collection cuando una cuota falla. En `/admin/prestamos` mostrar panel
"Cuotas con error pendiente de aplicación" con botón "Reintentar".
Más complejo pero permite cierre parcial seguro.

**Recomendación**: opción 1 (fail-fast) — el cambio más chico, mejora
la consistencia, y el admin puede reintentar en segundos. Opción 3
para un sprint futuro si la opción 1 resulta insuficiente.

**Cambio sugerido**:
```typescript
// Aplicar cuotas — si alguna falla, NO cerrar liquidación
const cuotasParaAplicar = liquidacion.empleados.flatMap(emp =>
  emp.totalDevengado > 0 ? (emp.cuotasPrestamos || []) : []
);
for (const cuota of cuotasParaAplicar) {
  await aplicarCuota(cuota.prestamoId, liquidacionId, quincena, cuota.monto);
  // Si tira, propaga arriba — la liquidación no se marca cerrada
}
await updateDoc(liquidacionRef, { estado: 'cerrada', ... });
```

`Promise.all` cambia a `for...of` secuencial (más lento pero
predecible). El catch individual desaparece — los errores burbujean al
UI.

### g) Trazabilidad de `removerDescuentoAdHoc`

**Archivo**: `src/services/nomina.service.ts` (`removerDescuentoAdHoc`).

Hoy borra el item del array sin dejar registro de quién/cuándo. Para
descuentos disputados, no hay forma de auditar.

**Decisión a tomar**:

**Opción A — soft-delete**: agregar campos `removidoPorId?`,
`removidoEn?`, `motivoRemocion?` al schema `DescuentoAdHoc`. La función
`removerDescuentoAdHoc` setea esos campos en lugar de hacer `filter`.
La UI filtra al renderizar (no mostrar removidos). El total se
recalcula sumando solo los no-removidos.

**Opción B — registro en `auditoria_admin`**: usar
`crearRegistroAuditoria(usuario, 'eliminar', 'Removió descuento
ad-hoc de RD$X (motivo: Y)', 'descuentosAdHoc', valor, '0')` y
escribirlo a la collection `auditoria_admin` (ya existe — usada en
`formularioAgendar.service.ts`). El array `descuentosAdHoc[]` se
reduce normal.

**Opción C — combinada**: `auditoria_admin` registra el evento +
agregar también un breadcrumb mínimo en `LiquidacionEmpleado.auditoria`
si el doc tiene ese campo. Así la trazabilidad vive con la liquidación
y en el log central.

**Recomendación**: opción B — `auditoria_admin` ya es el canal
estándar del repo (usado para órdenes, formularios). No mete deuda
schema nueva. La función pasa a:

```typescript
async function removerDescuentoAdHoc(liquidacionId, personalId, descuentoId, usuario) {
  // ... transacción para remover del array ...
  await addDoc(collection(db, 'auditoria_admin'), crearRegistroAuditoria(
    usuario.nombre,
    'eliminar',
    `Removió descuento ad-hoc de ${formatearMonto(descuento.monto)} de ${empleado.personalNombre}`,
    'descuentosAdHoc',
    formatearMonto(descuento.monto),
    'RD$0'
  ));
}
```

`agregarDescuentoAdHoc` también debería registrar (para simetría) si
hoy no lo hace.

### h) Restricción de `read` en rules de `prestamos_empleados`

**Archivo**: `firestore.rules`.

Hoy:
```
match /prestamos_empleados/{docId} {
  allow read: if esStaff();
  ...
}
```

Cualquier staff (incluso ayudante, técnico, secretaria) puede leer
préstamos de cualquier empleado. Es información sensible.

**Fix**:
```
match /prestamos_empleados/{docId} {
  allow read: if esAdminOCoord() ||
              resource.data.personalId == request.auth.uid;
  allow create, update: if esAdminOCoord();
  allow delete: if esAdmin();
}
```

Verificar:
- El campo `personalId` del doc debe coincidir con el `uid` del
  técnico/empleado autenticado. Verificá que en `crearPrestamo` el
  `personalId` se setee con el `uid` del empleado y no con el id de
  documento de `personal/`. Si hoy se usa el id de `personal/`, hay
  que decidir: o cambiar a `uid` o crear un campo nuevo
  `personalUid` para el matching.
- La página `/admin/prestamos` sigue funcionando para admin/coord
  (la rule lo permite).
- La nueva vista de técnico (item k) usa `query(... where personalId
  == auth.uid)` para obtener solo los suyos.

**Decisión**: confirmar el matching de `personalId` con `uid` antes
de aplicar. Si hoy son distintos, sprint extiende: agregar campo
`personalUid` en `prestamos_empleados`, backfill via script
one-shot, ajustar query.

### i) Banner persistente: préstamos sin aplicar en liquidación abierta

**Archivo**: `src/pages/Nomina.tsx`.

Hoy si el admin crea un préstamo en `/admin/prestamos` mientras hay
una liquidación abierta, aparece un toast pidiendo regenerar — pero
si lo cierra o no lo ve, queda sin saberlo. Risk de UX: el préstamo
"se pierde" para esa quincena.

**Fix**: en `/admin/nomina`, mientras la liquidación está abierta,
mostrar banner persistente al tope si hay préstamos activos cuyo
`fechaInicio` cae en o antes de la quincena actual y NO están
incluidos en `liquidacion.empleados[*].cuotasPrestamos`.

```typescript
const prestamosNoAplicados = useMemo(() => {
  if (liquidacion.estado !== 'abierta') return [];
  const idsAplicados = new Set(
    liquidacion.empleados.flatMap(e =>
      (e.cuotasPrestamos || []).map(c => c.prestamoId)
    )
  );
  return prestamosActivos.filter(p =>
    p.fechaInicio.toDate() <= rangoQuincena.fin &&
    !idsAplicados.has(p.id)
  );
}, [liquidacion, prestamosActivos]);

// Banner si prestamosNoAplicados.length > 0:
// "Hay X préstamo(s) creado(s) que no están en esta liquidación.
//  [Regenerar liquidación]"
```

Botón del banner llama a `generarLiquidacion()` directo (con confirm,
porque sobreescribe la liquidación abierta — verificar que ese flujo
NO pierda los descuentos ad-hoc ya agregados manualmente; si los
pierde, hay un bug pre-existente que conviene resolver acá).

**Decisión**: ¿`generarLiquidacion` en estado abierto preserva
`descuentosAdHoc` o los borra? Verificar leyendo el servicio. Si los
borra, este sprint debería preservarlos (son input manual del admin,
no derivable).

### j) Preview de primera cuota en modal "Crear préstamo"

**Archivo**: `src/components/nomina/AgregarDescuentoModal.tsx`.

Hoy el modal calcula y muestra `montoCuota = montoTotal / cuotasTotales`
en preview (ya existe via `useMemo(() => ...)`). El concern del
reviewer: agregar también un preview claro de "Primera cuota se
aplicará en la próxima liquidación" o "Primera cuota se aplicará en la
liquidación abierta si regeneras".

**Fix (UX)**:
- Si hay liquidación abierta para el empleado: mensaje "La primera
  cuota de RD$X se aplicará al regenerar la liquidación abierta de
  [quincena]. Total a deducir esta quincena: avances + cuota = RD$Y."
- Si no hay liquidación abierta: mensaje "La primera cuota de RD$X se
  aplicará en la próxima liquidación que generes para [quincena
  siguiente]."
- Mostrar tabla de cuotas: "Cuota 1 de N — RD$X — quincena YYYY-Qx",
  "Cuota 2 de N — RD$X — quincena YYYY-Qx+1", etc. Para que el admin
  vea el plan completo antes del submit.

Sin cambios funcionales — solo más información en el modal.

### k) Vista técnico: card "Mis préstamos activos"

**Archivo**: `src/pages/TecnicoVista.tsx` (verificar nombre exacto en
el repo — la ruta es `/tecnico`).

Hoy el técnico no ve sus préstamos pendientes. Fairness UX: el
empleado debería poder ver en su vista mobile el saldo + cuotas
restantes.

**Fix**:
- Agregar card nueva en `/tecnico` con título "Mis préstamos activos".
- Query: `query(collection(db, 'prestamos_empleados'),
  where('personalId', '==', auth.uid), where('estado', '==',
  'activo'))`. Sin índice compuesto — los dos campos pueden ir en una
  query simple **si Firestore lo permite**; si pide índice, filtrar
  `estado` client-side.
- Por cada préstamo activo: mostrar motivo, monto total, cuotas
  pagadas/totales, saldo pendiente, próxima cuota estimada (RD$X en
  quincena YYYY-Qx).
- Solo lectura. Sin botones de cancelar.
- Si no tiene préstamos activos: NO mostrar la card (no agregar ruido
  visual).

**Dependencia con item h**: la rule `read` debe permitir al técnico
leer `prestamos_empleados` filtrados por su `personalId`. Item h
implementa esto. **Item k requiere h aplicado primero** — el
reviewer y tester deben verificar el orden.

## Alcance estricto

**Archivos nuevos**:
- `src/utils/fecha.ts` (item d).

**Archivos modificados**:
- `src/components/admin/FiltroRangoFechas.tsx` (item d, importar de
  `utils/fecha.ts`).
- `src/components/ordenes/RegistrarPagoModal.tsx` (items a, b, c).
- `src/pages/Comisiones.tsx` (item d).
- `src/pages/HistorialAnuladas.tsx` (item d).
- `src/utils/index.ts` (item c opción 2: firma de
  `crearRegistroAuditoria` aceptando `fecha?` opcional).
- `src/services/nomina.service.ts` (items e, f, g — alerta cuotas
  salteadas, atomicidad cierre, registro auditoría en remover
  ad-hoc).
- `src/components/nomina/AgregarDescuentoModal.tsx` (item j — preview
  de plan de cuotas).
- `src/pages/Nomina.tsx` (items e, i — indicador en filas con cuota
  saltada, banner de préstamos sin aplicar).
- `src/pages/Prestamos.tsx` (item e — banner de cuotas salteadas en
  última liquidación).
- `src/pages/TecnicoVista.tsx` (item k — card de préstamos activos).
- `src/types/index.ts` (items e, g — schema `CuotaSalteada`,
  posible `removidoPor*` si se elige opción A en item g).
- `firestore.rules` (item h — restricción de read en
  `prestamos_empleados`).

**Posibles según decisiones**:
- `src/services/prestamos.service.ts` si la query del técnico
  necesita helper específico (item k).
- Script one-shot en `scripts/` si item h requiere backfill de
  `personalUid`.

NO refactores oportunistas. NO toques otros archivos que también usen
`stripUndefined` inline, `.toISOString().slice(0, 10)`, o que tengan
patrones similares en otros contextos — fuera de scope.

## Verificación

**Tester**:
- `npm run build` y `npm run lint` limpios.
- Grep que confirme:
  - `Object.fromEntries(Object.entries(...).filter(...v !== undefined))`
    ya no aparece en `RegistrarPagoModal.tsx` (item a).
  - `.toISOString().slice(0, 10)` ya no aparece en `Comisiones.tsx`
    líneas 26-27 ni en `HistorialAnuladas.tsx` línea 117 (item d).
  - `Promise.all` con `.catch` individual ya no aparece en el flujo
    de `cerrarLiquidacion` — debe ser `for...of` secuencial sin
    catch (item f).
  - `addDoc(collection(db, 'auditoria_admin'), ...)` aparece en
    `agregarDescuentoAdHoc` y `removerDescuentoAdHoc` (item g
    opción B).
- Verificar que `crearRegistroAuditoria` se invoca **fuera** del
  callback de `runTransaction` en ambos handlers de pago (item c).
- Verificar que `setSaving` se setea/limpia en `handleEliminarPago`
  con `try/finally` (item b).
- Verificar que la query de técnico en `/tecnico` filtra por
  `personalId == auth.uid` y que la rule lo permite (item h + k).
- Verificar que `runTransaction` único o secuencial fail-fast en
  `cerrarLiquidacion` no excede límites de Firestore (max 500
  writes, 100 reads) — opción 2 del item f.
- Verificar que regenerar liquidación abierta NO borra
  `descuentosAdHoc` ya agregados (item i — si los borra hoy, es bug
  pre-existente que este sprint debe resolver).

**Reviewer**:
- Confirmar que `stripUndefined` recursivo NO destruye el
  `FieldValue` de `arrayUnion(...)` (item a). Si lo destruye,
  revertir solo ese campo a inline.
- Confirmar que el botón "Eliminar pago" muestra estado visual
  disabled coherente con "Guardar pago" (item b).
- Confirmar que el cambio de firma de `crearRegistroAuditoria`
  (item c, opción 2) es backward compatible — todas las llamadas
  existentes siguen funcionando sin cambios.
- Confirmar que `formatYYYYMMDDLocal` movido a `utils/fecha.ts`
  conserva el JSDoc explicando el por qué del helper (item d).
- Para `Comisiones.tsx` línea 97 (item d): verificar la decisión
  sobre aplicar o no el helper. Si se aplica, validar que el cambio
  de string mostrado sea el deseado.
- Confirmar que `cuotasSalteadas` se persiste en la liquidación con
  todos los campos (`personalNombre`, `prestamoId`, `motivo`,
  `montoCuota`) y que el banner en `/admin/prestamos` solo mira la
  ÚLTIMA liquidación cerrada — no acumula históricamente (item e).
- Confirmar que el flujo fail-fast del cierre (item f) es
  idempotente: si admin reintenta el cierre, las cuotas ya aplicadas
  no se duplican (la transacción de `aplicarCuota` ya cubre esto,
  pero validar con el cambio).
- Confirmar que `auditoria_admin` (item g) recibe entries con
  `tipoEntidad: 'descuentosAdHoc'` y los campos correctos (creador,
  acción, valor, etc.).
- Confirmar que la rule del item h NO rompe `/admin/prestamos` para
  admin/coord, y que un técnico puede leer SOLO sus propios
  préstamos. Verificar que `personalId === auth.uid` matching es
  correcto (si no lo es hoy, sprint debe agregar `personalUid` o
  cambiar `personalId` de id de doc a uid).
- Confirmar que el banner de préstamos sin aplicar (item i) usa
  `useMemo` con deps correctas (`liquidacion`, `prestamosActivos`)
  para no re-calcular en cada render.
- Confirmar que el modal de crear préstamo (item j) muestra preview
  consistente con la lógica de `generarLiquidacion` (mismo cálculo
  de `min(montoCuota, saldoPendiente)` para la última cuota).
- Confirmar que la card del técnico (item k) NO renderiza nada si
  el técnico no tiene préstamos activos (no agrega ruido visual).
- Confirmar que NINGÚN item introduce índice compuesto en Firestore.

## Commit message sugerido

Si Jorge prefiere split en 2 commits (a-d como chore + e-k como
mejoras de nómina), perfecto. Sino, un solo commit grande:

```
chore(cleanup): pagos transaccionales + helper fechas + followups nomina

Once followups consolidados que quedaron como concerns no bloqueantes
en sprints recientes (C5 followup, filtro de rango de fechas y
sistema de descuentos en nomina).

Items a-d (sprint cleanup original):

a) RegistrarPagoModal usa stripUndefined compartido de
   utils/firestore.ts en lugar del Object.fromEntries inline en
   handleGuardar y handleEliminarPago.

b) Boton Eliminar pago ahora se deshabilita durante la transaccion
   (igual patron que Guardar pago, via setSaving en try/finally).

c) crearRegistroAuditoria se invoca UNA vez antes del runTransaction
   y el registro se reusa entre reintentos del callback. Cambio de
   firma backward compatible: nuevo parametro fecha?: Timestamp
   opcional.

d) Helper formatYYYYMMDDLocal movido de FiltroRangoFechas a
   utils/fecha.ts nuevo. Aplicado a Comisiones (defaults) y
   HistorialAnuladas (nombre CSV). Antes mostraban dia UTC siguiente
   entre 20:00 y 23:59 hora RD.

Items e-k (followups post-Sprint Descuentos Nomina):

e) Alerta UI cuando totalDevengado === 0 saltea cuota de prestamo.
   Persiste cuotasSalteadas[] en la liquidacion. Banner en
   /admin/prestamos con tabla detalle al hacer click. Indicador en
   filas de /admin/nomina con tooltip explicando.

f) cerrarLiquidacion ahora aplica cuotas secuencialmente (for...of)
   con fail-fast: si una cuota falla, NO marca la liquidacion como
   cerrada y bubble el error al UI. La idempotencia de aplicarCuota
   permite reintento manual sin duplicacion.

g) removerDescuentoAdHoc registra evento en auditoria_admin via
   crearRegistroAuditoria. agregarDescuentoAdHoc tambien registra
   por simetria. Trazabilidad para descuentos disputados.

h) Rule de read en prestamos_empleados restringida: esAdminOCoord()
   o personalId == request.auth.uid. Antes cualquier staff podia
   leer prestamos sensibles. Tecnicos ahora ven solo los suyos.

i) Banner persistente en /admin/nomina cuando hay prestamos activos
   con fechaInicio en o antes de la quincena actual que NO estan en
   liquidacion.empleados[*].cuotasPrestamos. Boton Regenerar en el
   banner. Verificado que regenerar preserva descuentosAdHoc
   manuales.

j) Modal Crear prestamo muestra preview de plan completo de cuotas
   antes del submit (cuota 1, 2, ..., N con quincenas estimadas) +
   mensaje contextual segun haya o no liquidacion abierta.

k) Vista tecnico (/tecnico) muestra card Mis prestamos activos con
   motivo, montoTotal, cuotasPagadas/totales, saldoPendiente, y
   proxima cuota estimada. Solo lectura. Card no se renderiza si
   no tiene prestamos activos. Depende de item h aplicado primero.

Schema:
- Liquidacion.cuotasSalteadas?: CuotaSalteada[] (item e).
- Posibles campos removidoPor*/motivoRemocion en DescuentoAdHoc si
  se elige opcion A en item g (recomendado: opcion B con
  auditoria_admin).
- Posible personalUid en prestamos_empleados si el matching del
  item h lo requiere.

Rules: read en prestamos_empleados restringida (item h).

Cambios funcionales visibles al usuario:
- Boton Eliminar pago disabled (item b).
- Banner cuotas no aplicadas en /admin/prestamos (item e).
- Banner prestamos sin aplicar en /admin/nomina (item i).
- Preview de plan de cuotas en modal Crear prestamo (item j).
- Card de prestamos en /tecnico (item k).
- Tecnicos NO pueden leer prestamos de otros (item h).
```

## Ante cualquier ambigüedad

**Items a-d**:
- Si `stripUndefined` destruye `FieldValue` (item a sobre `auditoria`
  con `arrayUnion`): revertir solo ese campo a inline, dejar comentado
  el por qué, y mantener el resto del helper aplicado al resto.
- Si el reviewer prefiere la opción 1 del item c (capturar valores
  precisos del state local) sobre la 2 (modificar firma): adelante.
- Si `Comisiones.tsx` línea 97 se decide dejar como UTC (intercambio
  con sistema externo): agregar comentario explicando.
- Si Jorge prefiere mantener `formatYYYYMMDDLocal` en
  `FiltroRangoFechas.tsx` (opción A) en vez de moverlo: ajustar
  imports sin crear archivo nuevo.

**Items e-k**:
- Item e — alerta cuotas salteadas: si persistir `cuotasSalteadas[]`
  en la liquidación inflama el doc, calcular on-the-fly cruzando
  `prestamos_empleados` activos vs. `liquidaciones_nomina` cerradas.
  Persistir es más simple — preferir esa opción.
- Item f — atomicidad cierre: opción 1 (fail-fast secuencial) es la
  recomendada. Si en testing aparece que cierra muy lento por la
  serialización (>5 seg con muchos préstamos), saltar a opción 2
  (`runTransaction` único). Opción 3 (cuotas pendientes collection)
  solo si las dos anteriores fallan.
- Item g — trazabilidad ad-hoc: opción B (`auditoria_admin`) es la
  recomendada por consistencia con el resto del repo. Solo si el
  reviewer detecta que `auditoria_admin` no se renderiza en ninguna
  UI (orphan), considerar opción C (combinada) o A (soft-delete con
  schema extension).
- Item h — restricción read prestamos: si `personalId` en
  `prestamos_empleados` ≠ `auth.uid`, hay 2 opciones:
  - Cambiar `personalId` a `uid` directamente (riesgo: rompe relación
    con `personal/` collection).
  - Agregar campo `personalUid` separado, backfill via script
    one-shot. Más seguro.
  Decidir mirando el shape actual del doc en producción.
- Item i — banner sin aplicar: si `generarLiquidacion` en estado
  abierto borra `descuentosAdHoc` ya agregados, eso es bug
  pre-existente. Ampliar scope para preservarlos: leer la
  liquidación abierta antes de regenerar, capturar
  `descuentosAdHoc[]` por empleado, re-aplicarlos al final.
- Item j — preview cuotas: si la lista de cuotas resulta muy larga
  (préstamos de 12+ cuotas), mostrar las primeras 4 + "...y N
  más". No bloqueante.
- Item k — vista técnico: si la card crece más de ~80 líneas,
  extraer a `src/components/tecnico/CardPrestamosActivos.tsx`. No
  bloqueante, decidir según el tamaño final.

**Order de aplicación**: items a-d son independientes y pueden ir en
cualquier orden. Items e-k tienen dependencias:
- Item k depende de h (rule de read).
- Item i depende de revisar que `generarLiquidacion` preserva
  `descuentosAdHoc` (puede expandir scope).
- Items e/f/g/h/j son independientes entre sí.

**Si el sprint excede 2h**: split en 2 PRs.
- PR 1 (chore): items a-d (cleanup original, ~30-45 min).
- PR 2 (mejoras nómina): items e-k (~1-1.5h).
