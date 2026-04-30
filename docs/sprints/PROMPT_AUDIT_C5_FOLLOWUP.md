# Sprint follow-up: C5 — handleEliminarPago con runTransaction

## Contexto

C5 del audit cerró la race condition al **registrar** un pago en
`src/components/ordenes/RegistrarPagoModal.tsx` (commit `736cc70` —
`fix(audit C5)`). Quedó pendiente el bug del mismo class al **eliminar**
un pago.

## Bug

`handleEliminarPago` en `src/components/ordenes/RegistrarPagoModal.tsx`
(líneas ~229-263) tiene la misma vulnerabilidad de last-write-wins:

1. Lee `pagosPrevios` del state local del componente (stale).
2. Filtra el pago eliminado en memoria.
3. Recalcula `montoPagado` y `estadoPago` localmente.
4. Hace `updateDoc` plano sobre la orden con el array filtrado.

Si entre el momento del último `onSnapshot` y el click de eliminar
otro usuario registra un pago nuevo, el `updateDoc` sobrescribe el
array `pagos[]` con la versión vieja sin ese pago — perdiendo writes.

## Fix

Aplicar el mismo patrón que se usó en `handleConfirmarPago` después
de C5:

```ts
await runTransaction(db, async (tx) => {
  const snap = await tx.get(ordenRef);
  if (!snap.exists()) throw new Error('Orden no encontrada');

  const data = snap.data();
  const pagosActuales = (data.pagos || []) as PagoOrden[];

  // Idempotencia: si ya no está, no-op
  if (!pagosActuales.some(p => p.id === pagoIdAEliminar)) {
    return { yaEliminado: true };
  }

  const pagosNuevos = pagosActuales.filter(p => p.id !== pagoIdAEliminar);
  const montoPagado = pagosNuevos.reduce(
    (acc, p) => acc + (Number(p.monto) || 0), 0
  );
  const estadoPago = calcularEstadoFromTotal(montoPagado, data.totalOrden);

  const updates = stripUndefined({
    pagos: pagosNuevos,
    montoPagado,
    estadoPago,
    auditoria: arrayUnion(registroAuditoria),
    updatedAt: Timestamp.now(),
  });

  tx.update(ordenRef, updates);
  return { yaEliminado: false };
});
```

`pagoIdAEliminar` viene de `pago.id` del pago que se está eliminando
(ya existe en el array). No requiere generar id nuevo.

## Verificación

Tester:
- Abrir modal de pagos en 2 tabs sobre la misma orden.
- Tab A: eliminar pago X.
- Tab B (al mismo segundo): registrar pago Y.
- Resultado esperado: pago X desaparece y pago Y queda. Ningún write se pierde.
- Idempotencia: re-correr la transacción (Firestore retry) no causa error
  ni vuelve a "eliminar" un pago ya removido.

Reviewer:
- Confirmar que `runTransaction` callback es puro (sin `setState`,
  toast, console.log con pago.id, etc).
- Confirmar que `pagoIdAEliminar` se captura UNA vez antes de la
  transacción (estable entre reintentos).
- `arrayUnion(auditoria)` dentro de la transacción es válido (FieldValue
  serializable).
- El recálculo de `montoPagado` usa el read fresco del server, no el
  state local.

## Alcance

Un solo archivo: `src/components/ordenes/RegistrarPagoModal.tsx`.
~10-15 líneas de cambio. Sin cambios al backend ni a otros archivos.

## Commit message sugerido

```
fix(audit C5 followup): eliminar pago con runTransaction para evitar perdida concurrente

Mismo patron que el fix de registrar pago (commit 736cc70). El
handleEliminarPago hacia updateDoc plano leyendo pagosPrevios del
state local. Si entre el ultimo onSnapshot y el click otro usuario
registraba un pago, el updateDoc sobrescribia el array con la version
vieja perdiendo el write nuevo.

Ahora la eliminacion va dentro de runTransaction:
- tx.get fresco del doc.
- Idempotencia: si el pago ya no esta, no-op.
- Recalculo de montoPagado y estadoPago desde el array filtrado real.
- arrayUnion(auditoria) dentro de la transaccion.
- Strip undefined defensivo.
```
