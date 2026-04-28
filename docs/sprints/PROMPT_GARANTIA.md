# Sprint: Sistema de Garantía completo

Usa el subagente coordinator.

## Objetivo

Sistema end-to-end de garantía que:
1. Coordinadora configura tiempo de garantía al emitir conduce (presets: 30/60/90 días, 6 meses, 1 año)
2. Cliente recibe link único en el WhatsApp de la factura
3. Cliente puede ver tiempo regresivo y reclamar la garantía remotamente
4. Reclamo entra al sistema como "Cita por Confirmar" con tipo `garantia`
5. Secretaria asigna técnico — si cambia del original, advertencia roja + descuento 100% comisión
6. Técnico original ve el descuento en su vista
7. Botón admin "Marcar como garantía" para crear flujos manuales
8. Audit completo

## Decisiones tomadas

- **Descuento:** 100% de la comisión del técnico original cuando se cambia de técnico
- **Tiempos:** Presets fijos (30, 60, 90 días, 180 días = 6 meses, 365 días = 1 año)
- **Reclamo del cliente:** Solo descripción del problema (textarea)
- **Entrega:** sprint completo en 1 commit

## Pre-investigación

Antes de codear, leer y reportar:
- Schema actual de `facturas` (la colección del Conduce de Garantía) en `src/types/index.ts`
- Cómo se emite el Conduce hoy (componente que abre el modal de "Generar Conduce")
- Cómo se asignan técnicos a citas en `Citas.tsx` o similar
- Schema de `comisiones` y cómo se calcula/almacena
- Cómo `utils/whatsapp.ts` arma el mensaje de envío al cliente
- Si ya hay endpoint público de tracking (`/api/...`) que pueda servir de modelo

## Pasos

### 1. Tipos en `src/types/index.ts`

```typescript
export type GarantiaEstado = 'vigente' | 'reclamada' | 'atendida' | 'expirada';
export type GarantiaOrigen = 'reclamo_cliente' | 'manual_admin';

export interface GarantiaInfo {
  tiempoDias: number;          // 30, 60, 90, 180, 365
  inicioFecha: Timestamp | Date;  // fecha emisión del conduce
  finFecha: Timestamp | Date;     // computed: inicio + días
  token: string;                  // UUID para link público
  estado: GarantiaEstado;
  // Cuando se reclama:
  reclamadaEn?: Timestamp | Date;
  problemaDescripcion?: string;
  origen?: GarantiaOrigen;
  // Referencia a la nueva orden creada:
  ordenGarantiaId?: string;
  // Snapshot del técnico original (si se cambia):
  tecnicoOriginalUid?: string;
  tecnicoOriginalNombre?: string;
}
```

Extender `Factura` (Conduce) con:
```typescript
garantia?: GarantiaInfo;
```

Extender `Comision` con:
```typescript
descuentoPorGarantia?: {
  monto: number;            // negativo (siempre 100% del montoComision)
  facturaIdReasignada: string;
  conduceNumero: string;
  ordenIdReasignada: string;
  motivo: string;
  notas?: string;
  aplicadoEn: Timestamp | Date;
  aplicadoPor: string;       // uid del que hizo el cambio
  aplicadoPorNombre: string;
};
estaAnulada?: boolean;       // computed: tiene descuentoPorGarantia con monto = -montoComision
```

### 2. UI Coordinadora — emitir Conduce con tiempo de garantía

En el modal de "Generar Conduce de Garantía" (probablemente en `src/pages/Cotizaciones.tsx` o `Facturas.tsx` o donde sea que ya exista):

Agregar nuevo paso/sección **"⏱ Tiempo de Garantía"**:

- Solo visible si `userProfile.rol === 'coordinadora' || userProfile.rol === 'administrador'`
- 5 botones grandes radio:
  - 📅 30 días
  - 📅 60 días
  - 📅 90 días
  - 📅 6 meses
  - 📅 1 año
- Requerido seleccionar uno antes de poder emitir el conduce
- Al guardar el Conduce:
  - Generar `garantiaToken` con `crypto.randomUUID()` o similar
  - Setear `garantia: { tiempoDias, inicioFecha: now, finFecha: now + días, token, estado: 'vigente' }`

### 3. WhatsApp con link de garantía

En `src/utils/whatsapp.ts`, en el helper que arma el mensaje de envío de Conduce al cliente, agregar al final:

```typescript
if (factura.garantia?.token) {
  mensaje += `\n\n🛡️ Tu garantía:\nhttps://www.misterservicerd.com/garantia/${factura.garantia.token}\nVigente hasta el ${formatearFecha(factura.garantia.finFecha)}.`;
}
```

### 4. Backend endpoint público `/api/garantia/[token]`

**Archivo:** `api/garantia/[token].ts`

```typescript
// GET /api/garantia/:token → info pública de la garantía
// POST /api/garantia/:token/reclamar → reclama la garantía
```

**GET — devuelve info pública:**
- Lee factura donde `garantia.token === token` usando Admin SDK
- Si no existe → 404
- Si existe → devuelve solo campos públicos:
  ```json
  {
    "conduceNumero": "CG-00012",
    "clienteNombre": "Brito",
    "equipoTipo": "Lavadora",
    "equipoMarca": "LG",
    "fechaServicio": "2026-04-21",
    "tecnicoNombre": "Aury Mon",
    "garantia": {
      "tiempoDias": 30,
      "inicioFecha": "...",
      "finFecha": "...",
      "estado": "vigente" | "reclamada" | "atendida" | "expirada",
      "diasRestantes": 12,
      "reclamadaEn": null | "...",
    }
  }
  ```
- Calcular `estado` y `diasRestantes` server-side considerando hora RD:
  - Si `finFecha < now` → `expirada`
  - Si `garantia.estado === 'reclamada'` y aún no atendida → `reclamada`
  - Si tiene `ordenGarantiaId` y esa orden está cerrada → `atendida`
  - Sino → `vigente`

**POST — reclamar:**
- Body: `{ problemaDescripcion: string }`
- Validaciones:
  - `problemaDescripcion` requerido, mínimo 10 caracteres
  - Garantía debe estar en estado `vigente` (no expirada, no ya reclamada)
- Acciones:
  - Update factura: `garantia.estado = 'reclamada'`, `reclamadaEn = now`, `problemaDescripcion`, `origen = 'reclamo_cliente'`
  - Crear doc en `citas_por_confirmar`:
    ```typescript
    {
      tipo: 'garantia',
      esGarantia: true,
      referenciaFacturaId: factura.id,
      referenciaConduce: factura.numero,
      referenciaOrdenId: factura.ordenId,  // orden original
      clienteId, clienteNombre, clienteTelefono, clienteDireccion,
      equipoTipo, equipoMarca, equipoModelo,
      descripcionProblema: problemaDescripcion,
      tecnicoOriginalUid: factura.tecnicoUid,
      tecnicoOriginalNombre: factura.tecnicoNombre,
      origen: 'reclamo_garantia',
      createdAt: Timestamp.now(),
      estado: 'pendiente',
    }
    ```
  - Crear notificación a coordinadora/secretaria/admin: "🛡️ Reclamo de garantía recibido — Cliente [Nombre] · Conduce CG-####"
  - Audit log en `auditoria_admin`: `accion: 'reclamo_garantia_cliente'`
- Respuesta: `{ ok: true, mensaje: "Recibimos tu reclamo. Te contactaremos pronto." }`

### 5. Página pública `/garantia/:token`

**Archivo:** `src/pages/public/GarantiaCliente.tsx`

Sin auth. Llama al endpoint `/api/garantia/:token`. UI:

**Estado VIGENTE:**
```
┌───────────────────────────────┐
│  🛡️ Garantía de tu servicio    │
│                                 │
│  Conduce: CG-00012              │
│  Equipo: Lavadora LG            │
│  Atendido por: Aury Mon         │
│  Fecha de servicio: 21 abr 2026 │
│                                 │
│  ┌──────────────────────────┐  │
│  │ Tiempo de garantía:      │  │
│  │      18 días restantes    │  │
│  │   ████████░░░░░░ 60%      │  │
│  │  Vigente hasta: 21 may    │  │
│  └──────────────────────────┘  │
│                                 │
│  ¿Tienes problemas con tu      │
│  equipo? Reclama tu garantía:  │
│                                 │
│  [🛡️ Reclamar Garantía]         │
└───────────────────────────────┘
```

Al tocar "Reclamar Garantía" → modal:
```
Describe el problema que estás teniendo
[textarea — mínimo 10 caracteres]

[Cancelar]  [Enviar Reclamo]
```

**Estado RECLAMADA:**
```
✅ Tu reclamo fue recibido
Reclamaste tu garantía el DD/MM/YYYY.
Pronto un técnico te contactará para coordinar la visita.

[Sin botones]
```

**Estado ATENDIDA:**
```
✓ Tu garantía fue atendida
Servicio de garantía completado el DD/MM/YYYY.
```

**Estado EXPIRADA:**
```
⏰ Tu garantía expiró
La garantía de este servicio expiró el DD/MM/YYYY.
Si necesitas un nuevo servicio, contáctanos:
[Botón WhatsApp directo a 829-389-7474]
```

### 6. Citas por Confirmar — badge y advertencia para garantías

En `src/pages/Citas.tsx`:

- En la lista de citas, las que tengan `tipo: 'garantia'` o `esGarantia: true`:
  - Badge destacado: **"🛡️ GARANTÍA"** con fondo `bg-amber-100 text-amber-800` o similar
  - Card con borde sutil amarillo/rojo claro
  - Mostrar info extra: "Técnico original: [Nombre]" + "Conduce ref: CG-####"

### 7. Modal de Asignación de Técnico (con advertencia para garantías)

Cuando se asigna técnico a una cita de tipo `garantia`:

- Selector de técnico normal
- Si seleccionado === `tecnicoOriginalUid` → proceder normal (mismo técnico cubre su propia garantía, no hay descuento)
- Si seleccionado !== `tecnicoOriginalUid` → mostrar advertencia ROJA prominente ANTES de poder confirmar:

```
┌─────────────────────────────────────────────────┐
│ ⚠️ ADVERTENCIA: Cambio de técnico                │
│                                                  │
│ Técnico original: Aury Mon                       │
│ Técnico nuevo: Pedro Ramírez                     │
│                                                  │
│ Esto descontará el 100% de la comisión que      │
│ recibió Aury Mon por el trabajo original:        │
│ -RD$466.10                                        │
│                                                  │
│ Motivo del cambio (requerido):                   │
│ ○ Técnico original no disponible                │
│ ○ Técnico ya no trabaja aquí                    │
│ ○ Cliente prefiere otro técnico                 │
│ ○ Otro                                           │
│                                                  │
│ Notas adicionales (opcional):                    │
│ [textarea]                                       │
│                                                  │
│   [Cancelar]      [Confirmar y Aplicar]         │
└─────────────────────────────────────────────────┘
```

Al confirmar:
1. Crear orden nueva (igual que cualquier cita confirmada) con `esGarantia: true`, `tecnicoUid: nuevo_uid`, `tecnicoOriginalUid` (snapshot)
2. **Buscar la comisión del técnico original** en `comisiones` donde `ordenId === referenciaOrdenId` y `tecnicoUid === tecnicoOriginalUid`
3. **Update esa comisión** con el campo `descuentoPorGarantia`:
   ```typescript
   descuentoPorGarantia: {
     monto: -comision.montoComision,  // negativo, 100%
     facturaIdReasignada: factura.id,
     conduceNumero: factura.numero,
     ordenIdReasignada: nuevaOrdenId,
     motivo: motivoSeleccionado,
     notas: notasOpcional,
     aplicadoEn: Timestamp.now(),
     aplicadoPor: usuario.uid,
     aplicadoPorNombre: usuario.nombre,
   },
   estaAnulada: true,
   ```
4. Update factura: `garantia.tecnicoOriginalUid` y `tecnicoOriginalNombre` para snapshot, `ordenGarantiaId: nuevaOrdenId`, `estado: 'reclamada'` (sigue vigente hasta que se atienda)
5. Audit log: `accion: 'cambio_tecnico_garantia'` con metadata completa

### 8. Vista técnico — ver descuentos

En `src/pages/TecnicoVista.tsx`, en la sección de "Mis ganancias" (o crear nueva sección si es necesario):

- Listar comisiones donde `descuentoPorGarantia` está presente:
  ```
  ⚠️ Comisiones descontadas por garantía
  
  Conduce CG-00012 · Orden OS-0035 (reasignada como OS-0042)
  -RD$466.10 · 24 abr 2026
  Motivo: Cliente prefiere otro técnico
  ```
- Total descontado del período visible en summary
- Estos descuentos deben restarse del cálculo de ganancia neta de la quincena

### 9. Botón "Marcar como garantía" en Conduce final (admin/coord)

En el modal o página de detalle del Conduce de Garantía emitido:

- Botón visible solo si `factura.garantia?.estado === 'vigente'` y rol = admin/coord:
  - **"🛡️ Marcar como garantía manual"**
- Click → modal:
  ```
  ¿Estás iniciando un trabajo de garantía sin reclamo del cliente?
  
  Esto creará una nueva entrada en Citas por Confirmar referenciando
  esta factura. La garantía pasará a estado "reclamada" sin necesidad
  de que el cliente la reclame remotamente.
  
  Razón: [textarea — requerido, mínimo 10 caracteres]
  
  [Cancelar]  [Crear cita de garantía]
  ```
- Al confirmar: misma lógica que el reclamo del cliente, pero `origen: 'manual_admin'` y `problemaDescripcion: razon` ingresada por el admin
- Audit log: `accion: 'marcar_garantia_admin'`

### 10. Auto-expiración de garantías

En el endpoint `/api/garantia/[token]` GET, calcular dinámicamente si está expirada (no necesita scheduler — se evalúa al leer).

Si quieres ser más proactivo: agregar un scheduled task (Cloud Function o Vercel Cron) que cada día marque las garantías expiradas en Firestore. **No incluir en este sprint** — calcular dinámicamente es suficiente.

### 11. Routing

En `App.tsx`, agregar la nueva ruta pública:
```tsx
<Route path="/garantia/:token" element={<GarantiaCliente />} />
```

Esta ruta NO va dentro del Layout admin ni de PublicLayout — debe ser standalone (sin nav, sin sidebar) para que la experiencia del cliente sea limpia.

### 12. Firestore rules (actualizar)

Agregar al ruleset:

```
match /facturas/{docId} {
  // Lectura especial pública via API serverless (admin SDK bypassa esto)
  // Las queries cliente normales siguen requiriendo auth
  allow read: if request.auth != null;
  allow write: if request.auth != null;
}

// citas_por_confirmar ya tiene allow create: if true; OK
```

No es necesario cambiar nada drástico — el endpoint serverless usa Admin SDK que bypassa rules.

### 13. Verificación

- Typecheck + lint.
- Tester:
  - Coord emite Conduce con tiempo 30 días → factura tiene `garantia.token` + `finFecha` correcta.
  - Cliente entra a `/garantia/[token]` → ve info correcta + tiempo regresivo.
  - Cliente reclama → se crea entry en `citas_por_confirmar` con `tipo: 'garantia'`.
  - Secretaria ve el badge GARANTÍA en Citas por Confirmar.
  - Asigna mismo técnico → procede sin advertencia.
  - Asigna otro técnico → advertencia roja + motivo requerido + descuento aplicado a la comisión del original.
  - Vista técnico del original → ve el descuento listado.
  - Botón admin "Marcar como garantía" → crea entrada manual.
- Reviewer:
  - El token en la URL es realmente único e impredecible (no secuencial).
  - El cliente NO puede ver datos sensibles via API (solo nombre cliente, equipo, fecha — NO precios, NO detalles internos).
  - Los snapshots de técnico original se preservan correctamente.
  - parseOrden / parseFactura actualizados para rehidratar los nuevos campos (CRÍTICO según CLAUDE.md).
  - Audit log se escribe en TODOS los puntos de cambio.
  - Strip undefined antes de addDoc/setDoc en TODO el flujo (CLAUDE.md).

### 14. Commit + push

```
feat(garantia): sistema completo de garantía con reclamo remoto

- Coordinadora configura tiempo de garantía al emitir Conduce (presets:
  30/60/90 días, 6 meses, 1 año). Solo coord/admin pueden hacerlo.
- Cliente recibe link único en el WhatsApp de la factura
  (misterservicerd.com/garantia/[token]).
- Página pública sin auth muestra: equipo, técnico, fecha, tiempo
  regresivo de garantía, estado (vigente/reclamada/atendida/expirada).
- Cliente reclama desde el link describiendo el problema. Se crea
  entrada en Citas por Confirmar con tipo 'garantia'.
- Secretaria ve badge GARANTÍA y asigna técnico. Si cambia del
  original, advertencia roja prominente con motivo requerido.
- Cambio de técnico descuenta 100% de la comisión del técnico original
  (registrado en comision.descuentoPorGarantia con monto negativo +
  metadata completa).
- Vista técnico muestra descuentos por garantía con conduce y razón.
- Botón admin/coord "Marcar como garantía manual" desde el detalle
  del Conduce — flujo paralelo al reclamo del cliente.
- Audit log completo en auditoria_admin: emitir_garantia,
  reclamo_garantia_cliente, marcar_garantia_admin,
  cambio_tecnico_garantia, descuento_garantia_tecnico.
- Endpoint serverless /api/garantia/[token] (GET para info pública,
  POST para reclamar). Admin SDK bypassa rules. Datos sensibles
  filtrados — el cliente NO ve precios ni detalles internos.

Tiempo regresivo y estado calculados dinámicamente al leer (sin
scheduler). parseOrden/parseFactura rehidratan los nuevos campos.

Cambio mayor de UX para los técnicos: ahora la calidad de su trabajo
tiene consecuencia económica directa si la garantía se reasigna.
```

## Ante cualquier ambigüedad

Pregunta con AskUserQuestion antes de tocar código. Especialmente:
- Si el flow de emitir Conduce hoy NO está en un solo lugar (puede estar fragmentado en Cotizaciones + Facturas).
- Si `Comision` actualmente NO tiene un identificador claro de la `ordenId` referenciada.
- Si la página pública ya tiene un patrón de routing distinto al esperado (ej: layout aparte).
- Si el helper de WhatsApp arma el mensaje en un solo sitio o varios (necesitamos parchear todos).

NO inventes campos ni colecciones que no existen — leé el schema real primero y reportá si difiere.
