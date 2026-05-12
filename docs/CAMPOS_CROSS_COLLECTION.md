# Campos cross-collection — reglas de los identificadores que conectan colecciones

> **Propósito:** evitar el patrón de bugs P-006 (escribir doc id donde la rule espera auth.uid, o viceversa). Cada campo de un doc Firestore que apunta a otro doc tiene una regla estricta sobre qué tipo de id guarda. **Antes de escribir o leer cualquiera de estos campos, consultar esta tabla.**
>
> **Origen:** SPRINT-147 (2026-05-12) post-auditoría SPRINT-145.
>
> **Cómo mantenerlo:** cada sprint que clarifica o cambia la regla de un campo debe actualizar la fila correspondiente + agregar al sprint referenciado en la columna "Sprint origen". Si un campo no tiene regla clara en el catálogo, el siguiente sprint que lo toque DEBE clarificarlo antes de modificarlo.

---

## Glosario

- **auth.uid** = el UID de Firebase Auth del usuario (28 chars alfanuméricos, ej: `3m5bk3uhKqQCaSphuRFjEdHNOs82`). Es el identificador que aparece en `request.auth.uid` dentro de `firestore.rules`.
- **personalDocId / doc id** = identificador autogenerado del documento en la colección `personal/` (20 chars, ej: `HGkVoY3jK9LmN2pQrSt5`). NO es auth.uid.
- **clienteDocId** = doc id de `clientes/`. Cliente NO tiene auth.uid (no inicia sesión).
- **ordenDocId** = doc id de `ordenes_servicio/`. NO confundir con `numero` (OS-####).

---

## Tabla maestra de campos

### Colección `ordenes_servicio`

| Campo | Vive en | Apunta a | Tipo de id | Regla | Sprint origen |
|---|---|---|---|---|---|
| `clienteId` | ordenes_servicio | clientes | clienteDocId | Doc id de `clientes/`. Cliente NO tiene auth. | (histórico) |
| `tecnicoId` | ordenes_servicio | personal/usuarios | **auth.uid** | SIEMPRE auth.uid post-c4be345. NO usar `personal.id`. Dropdowns deben emitir `value={t.uid}`. Lookups `(t.uid \|\| t.id) === orden.tecnicoId`. | c4be345 / SPRINT-132 |
| `ayudanteId` | ordenes_servicio | personal/usuarios | **auth.uid** | Idéntico a `tecnicoId`. | c4be345 / SPRINT-132 |
| `operariaId` | ordenes_servicio | personal/usuarios | ⚠ **por confirmar** | El alta en `useOrdenCreateForm.ts` deriva desde `personal[tecnicoId].operariaId`. Tres callers comparan `o.operariaId === p.id` (`nomina.service:172`, `Ordenes.tsx:635`, `Rendimiento.tsx:297`). Hipótesis: guarda `personalDocId`, no uid. **SPRINT-146 aclara** y SPRINT-147 actualiza esta fila. | SPRINT-146 (pendiente) |
| `responsableId` | ordenes_servicio | personal/usuarios | **auth.uid** | Migrado en SPRINT-114. | SPRINT-114 |
| `enviadaAFacturacionPorId` | ordenes_servicio | personal/usuarios | **auth.uid** | Quien envió a facturación. Migrado en SPRINT-114. **Deuda**: `AgendaDia.tsx:191` y `:144` aún escriben `userProfile.id` aquí — SPRINT-148 los migra. | SPRINT-114 / deuda SPRINT-148 |
| `facturadaPorId` | ordenes_servicio | personal/usuarios | **auth.uid** | Quien emitió el conduce. Migrado en SPRINT-114. | SPRINT-114 |
| `emisorFacturaId` | ordenes_servicio | personal/usuarios | **auth.uid** | Idéntico al anterior, alias legacy. Migrado en SPRINT-114. | SPRINT-114 |
| `registradoPorId` (dentro de `pagos[]`) | ordenes_servicio.pagos | personal/usuarios | **auth.uid** | Migrado parcialmente. **Deuda**: `AgendaDia.tsx:144` y otros paths alternativos siguen escribiendo `userProfile.id` — SPRINT-148 los migra. | SPRINT-114 / deuda SPRINT-148 |
| `eliminadaPorId`, `canceladaPorId` | ordenes_servicio | personal/usuarios | **auth.uid** | Auditoría de soft-delete y cancelación. | SPRINT-114 |
| `efectivoEntregadoPor` | ordenes_servicio | personal/usuarios | ⚠ **revisar** | Cierre del día — verificar si guarda uid o nombre. Si guarda nombre, OK; si guarda id, debe ser uid. | (sin sprint, abrir cuando se toque) |
| `cotizacionId` | ordenes_servicio | cotizaciones | doc id | Doc id de `cotizaciones/`. | (histórico) |
| `facturaId` | ordenes_servicio | facturas | doc id | Doc id de `facturas/`. | (histórico) |
| `aprobadoPor` | ordenes_servicio | personal/usuarios | nombre (string) | Guarda el NOMBRE, no un id. NO usar para comparaciones de auth. | (histórico) |
| `creadoPor` | ordenes_servicio | personal/usuarios | nombre (string) | Idem `aprobadoPor`. | (histórico) |
| `reactivadaPostChequeoPor`, `enviadaAFacturacionPorNombre`, `facturadaPorNombre` | varios | personal/usuarios | nombre (string) | Campos de display, no de comparación. | (histórico) |

### Colección `notificaciones`

| Campo | Vive en | Apunta a | Tipo de id | Regla | Sprint origen |
|---|---|---|---|---|---|
| `userId` | notificaciones | personal/usuarios | **auth.uid** | Destinatario de la notificación. `firestore.rules` filtra por `userId == auth.uid`. NO usar `destinatarioId` (legacy, deprecated en SPRINT-127, cazador P-007 lo bloquea). | SPRINT-118 / SPRINT-127 |
| `ordenId` | notificaciones | ordenes_servicio | doc id | Doc id de la orden referenciada. | (histórico) |

### Colección `personal`

| Campo | Vive en | Apunta a | Tipo de id | Regla | Sprint origen |
|---|---|---|---|---|---|
| `uid` | personal | (es auth.uid del empleado) | **auth.uid** | El doc `personal/{auto-id}` tiene un campo `uid` adentro = auth.uid. Es la "puerta" para resolver ambos lados. | SPRINT-105 |
| `operariaId` (en doc de técnico) | personal | personal (otra fila) | **personalDocId** | Apunta al doc id de la operaria a cargo del técnico. ⚠ Confirmado por análisis de `useOrdenCreateForm.ts` que lee `tecnicoElegido?.operariaId`. NO es auth.uid. **Pendiente: SPRINT-146 valida y actualiza si distinto.** | SPRINT-146 (en curso) |

### Colección `usuarios`

| Campo | Vive en | Apunta a | Tipo de id | Regla | Sprint origen |
|---|---|---|---|---|---|
| `id` (doc id) | usuarios | (es auth.uid) | **auth.uid** | `usuarios/{uid}` siempre — `doc.id === auth.uid`. NO permitir auto-id. | SPRINT-105 |

### Colección `facturas`

| Campo | Vive en | Apunta a | Tipo de id | Regla | Sprint origen |
|---|---|---|---|---|---|
| `ordenId` | facturas | ordenes_servicio | doc id | Doc id de la orden de la que se emitió el conduce. | (histórico) |
| `clienteId` | facturas | clientes | clienteDocId | Idéntico al de orden. | (histórico) |
| `garantia.token` | facturas | (token público) | hex/uuid | Token único para `/garantia/{token}`. Se genera al emitir el conduce desde `ProcesarFacturacionModal`. Hoy 0/9 facturas lo tienen — feature poco usada. | (histórico) |
| `comisionTecnicoId` | facturas | personal/usuarios | **auth.uid** | Quien recibe la comisión del conduce. Migrado en SPRINT-114. | SPRINT-114 |

### Colección `comisiones`

| Campo | Vive en | Apunta a | Tipo de id | Regla | Sprint origen |
|---|---|---|---|---|---|
| `tecnicoId` (en doc comisión) | comisiones | personal/usuarios | **auth.uid** | Migrado en SPRINT-114. Lookups de nómina deben usar `(p.uid \|\| p.id) === comision.tecnicoId`. | SPRINT-114 |
| `ordenId` | comisiones | ordenes_servicio | doc id | Doc id de la orden que generó la comisión. | (histórico) |
| `facturaId` | comisiones | facturas | doc id | Doc id de la factura, si aplica. | (histórico) |

### Colección `campanas_marketing`

| Campo | Vive en | Apunta a | Tipo de id | Regla | Sprint origen |
|---|---|---|---|---|---|
| `creadaPor` | campanas_marketing | personal/usuarios | **auth.uid** | Migrado en SPRINT-114 + sprints relacionados Reactivación. | SPRINT-114 |
| `clientesIds[]` | campanas_marketing | clientes | clienteDocId | Array de doc ids de clientes. | (histórico) |

### Colección `solicitudes` (formularios públicos)

| Campo | Vive en | Apunta a | Tipo de id | Regla | Sprint origen |
|---|---|---|---|---|---|
| `solicitanteUid` | solicitudes | personal/usuarios | **auth.uid** | Si el formulario lo llenó staff logueado. Cliente público lo deja vacío. Migrado en SPRINT-114. | SPRINT-114 |
| `formularioId` | solicitudes | formularios | doc id | Doc id del template. | (histórico) |

### Colección `auditoria_admin` (logs de actores admin)

| Campo | Vive en | Apunta a | Tipo de id | Regla | Sprint origen |
|---|---|---|---|---|---|
| `actorUid` | auditoria_admin | personal/usuarios | **auth.uid** | Rule lo gatea explícitamente. Usar `currentUser.uid` (gotcha CLAUDE.md). | (histórico) |

---

## Transiciones de `fase` en `ordenes_servicio`

`fase` es un campo de estado complejo. Su transición no está formalizada en código pero sí en convención. Las transiciones legítimas son:

```
nuevo_lead
    ↓ (oficina agenda)
en_gestion
    ↓ (técnico inicia chequeo o oficina agenda visita)
agendado ⇌ en_diagnostico
    ↓ (técnico sugiere precio)
en_cotizacion
    ↓ (oficina aprueba precio)
aprobado
    ↓ (técnico hace el trabajo, cierra wizard)
trabajo_realizado
    ↓ (alguien arrastra en kanban o marca solo chequeo)
cerrado

Atajos:
- desde cualquier fase → cancelado (motivo obligatorio)
- desde aprobado/agendado → en oficina aprueba "solo chequeo" → cerrado directo (atajo)
- desde cerrado → garantia_reclamada (SPRINT-135b, futuro)
- desde standby ⇌ cualquier fase (no cambia fase, solo flag enStandby)
```

**Gotcha vivo (2026-05-12):** La fase NUNCA pasa a `'cerrado'` automáticamente cuando una orden se paga + envía a facturación + factura emitida. Solo pasa si alguien arrastra en kanban o ejecuta "Solo chequeo". Esto explica por qué órdenes terminadas siguen visualmente en "Trabajo Realizado". **Es un problema de diseño identificado en SPRINT-148 (propuesta)** — ver `docs/sprints/COLA_AUTONOMA.md`.

---

## Cómo verificar la regla de un campo en producción

Ante duda, usar Admin SDK con `service-account.json` desde tu Mac:

```typescript
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) initializeApp({ credential: cert(require('./service-account.json')) });
const db = getFirestore();

// Tomar una muestra de docs y ver qué guarda el campo
const snap = await db.collection('ordenes_servicio').limit(5).get();
for (const d of snap.docs) {
  const x = d.data();
  console.log(d.id, 'tecnicoId:', x.tecnicoId, 'operariaId:', x.operariaId);
}

// Cross-check: ¿el tecnicoId existe en personal con uid match?
const persSnap = await db.collection('personal').where('uid', '==', x.tecnicoId).get();
console.log('match en personal:', persSnap.size);
```

Si retorna 0, el campo guarda doc id, no uid. Si retorna 1, guarda uid.

---

## Sub-regla derivada

**Cualquier nuevo campo que apunte a otra colección debe documentarse en esta tabla al introducirse.** Si un sprint introduce un campo nuevo y NO lo documenta acá, el sprint NO se considera completo. Aplica retroactivamente: si encontrás un campo cross-collection no documentado, abrir mini-sprint para catalogarlo.
