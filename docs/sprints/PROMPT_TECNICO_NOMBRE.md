# Fix: Filtro tecnicoNombre en tools de órdenes

Usa el subagente coordinator.

## Problema

Cuando el admin pregunta a la IA "¿cuántas órdenes hizo Aury Mon este mes?", la IA responde pidiendo el ID técnico porque las tools solo filtran por `tecnicoId` (interno). Las órdenes guardan `tecnicoNombre` como snapshot string, así que agregar filtro por nombre es trivial.

## Tareas

### 1. Modificar tools en `api/_lib/iaTools.ts`

Tools afectadas:
- `query_ordenes`
- `count_ordenes`
- `agenda_dia`
- `query_comisiones`

Para cada una:

**a. Agregar al input_schema:**

```typescript
tecnicoNombre: {
  type: 'string',
  description: 'Filtro por nombre parcial del técnico (case-insensitive). Ej: "Aury" matchea "Aury Mon García".',
},
```

**b. Actualizar la descripción de la tool** mencionando el nuevo filtro:

```
"... Filtra por fase, técnico (por ID o por nombre parcial), cliente, rango de fechas..."
```

**c. En la función `ejecutar`**, después del query server-side con filtros Firestore, agregar filtro client-side:

```typescript
if (input.tecnicoNombre) {
  const busq = input.tecnicoNombre.toLowerCase().trim();
  resultados = resultados.filter(o =>
    (o.tecnicoNombre || '').toLowerCase().includes(busq)
  );
}
```

En `query_comisiones` el campo puede llamarse distinto (verificar: puede ser `tecnicoNombre`, `personalNombre`, o similar). Usar el correcto según el schema real.

### 2. Actualizar system prompt

En `api/ai/chat.ts`, al final del SYSTEM_BASE o en la parte específica del rol administrador, agregar:

```
"Cuando el usuario pregunte por órdenes, comisiones, agenda o facturación de un técnico específico, usa el parámetro tecnicoNombre con match parcial (no necesitas el ID exacto). Ej: '¿cuántas órdenes hizo Aury este mes?' → count_ordenes({ tecnicoNombre: 'Aury', fechaDesde: ..., fechaHasta: ... }). No pidas al usuario IDs internos del sistema — siempre intenta primero con el nombre."
```

### 3. Verificación

- Typecheck.
- Tester: invocar query_ordenes con `tecnicoNombre: 'Aury'` y verificar que matchea "Aury Mon".
- Reviewer: verificar que el filtro es case-insensitive y respeta espacios.

### 4. Commit

```
feat(ia): filtro tecnicoNombre en tools de órdenes y comisiones

Bug UX: la IA pedía ID técnico exacto cuando el admin preguntaba por
nombre. Ahora query_ordenes, count_ordenes, agenda_dia y query_comisiones
aceptan tecnicoNombre como filtro de match parcial client-side
(case-insensitive).

El system prompt guía al LLM a usar tecnicoNombre cuando la pregunta
menciona el nombre del técnico, en vez de pedir IDs internos.

Resuelve: "¿cuántas órdenes hizo Aury este mes?" ahora responde con el
dato real en vez de pedir el ID.
```
