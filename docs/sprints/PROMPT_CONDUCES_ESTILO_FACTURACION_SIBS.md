# Sprint: rediseñar Conduces de Garantía estilo facturacion.sibs2.com

## Contexto

Jorge usa hoy un sistema externo de facturación (`facturacion.sibs2.com/inv/index.php`) que tiene un flujo de creación de factura más rápido y completo que el módulo actual de Conduces de Garantía. Le gustaría replicar esa UX en `/admin/facturas` o `/admin/facturacion-pendiente` del sistema Mister Service RD.

Este documento captura el análisis del sistema externo basado en screenshots que Jorge compartió, para tener referencia clara cuando armemos el sprint completo de implementación.

## Análisis del sistema externo (facturacion.sibs2.com)

### Pantalla principal — "Factura"

URL: `facturacion.sibs2.com/inv/index.php`

**Layout en una sola página, sin scroll necesario para el flujo principal:**

Header:
- Título "Factura"

Bloque cliente (izquierda) + Opciones (derecha):

**Información del cliente:**
- Search customer (dropdown autocomplete que busca clientes existentes)
- Botón "Nuevo Cliente" (abre modal o expande inputs)
- Inputs: Nombre, Teléfono, Notas (1), Dirección, Notas (2)

**Opciones:**
- Botón "Agregar Productos" (abre modal de detalles — ver más abajo)
- Numeración: dropdown "Select - Seleccione" (probablemente serie de comprobantes fiscales)
- Condiciones: dropdown "Venta Contado" (con otras opciones tipo "Crédito", etc.)
- Método Pago: dropdown "Efectivo" (con otros métodos)
- Descuento: input numérico (0)
- Orden de Compra: input texto + selector de archivo
- Moneda: dropdown "DOP" (con USD probablemente)

**Detalles** (tabla de items):
- Columnas: Cant. | Descripción | Precio | Total
- Botón "+" a la derecha para agregar nueva línea
- Cada línea agregada vía el modal "Detalles"

**Resumen al fondo:**
- SubTotal, Descuento, Impuestos, Total (todos con valor inicial 0.00)
- Tasa de Cambio (0.00, se llena cuando moneda ≠ DOP)

**Botones acción:**
- Finalizar (verde, izquierda)
- Salir (rojo)

### Modal "Detalles" (al hacer click en "+")

**Campos:**

- **Tipo** (dropdown): `Inventario | Manual`
  - Inventario: elige producto del catálogo, precio se autocompleta
  - Manual: cantidad y precio se ingresan a mano (servicios, mano de obra, etc.)

- **Vendedor** (dropdown): lista de empleados/técnicos. Captura quién hizo la venta para comisión. Lista observada incluye:
  - Ninguno
  - Diorky Mosquea LAVADORA SECADORA
  - Juan Pablo (Suricata) ESTUFA
  - Robinson
  - Aury mon LAVADORA SECADORA
  - Adelin mirabal luciano PINTURA
  - Wilmer Polanco REFRI
  - ALBERT MANUEL BRITO SALVADOR
  - José Alberto YOW
  - Yonli Feliz Jacinto
  - Jesús Goldito Tecnico HJT-02
  - Miguel Martinez Oriental
  - Aljelis Jimenez lavadora
  - Hector Saldaña estufas
  - Yunior Lavadora Secadora
  - Wilfredo estufa lavadora secadora
  - Juan Jiménez Oriental
  - Martín Plomero

- **Cant** (input numérico)

- **Productos** (dropdown autocomplete): lista del catálogo de productos. Solo aplica si `Tipo === 'Inventario'`.

- **Precio 1** (radio + input): precio principal del producto.
- **Precio 2** (radio + input): precio alternativo (mayoreo o lista B).

- **Compra** (input): precio de compra del producto. Visible probablemente solo para admin.

**Botones:**
- Aceptar (azul) — agrega la línea a la tabla principal
- Salir (rojo) — cancela sin agregar

## Lo que se puede replicar / inspirar para Mister Service RD

### Aplica a `/admin/facturas` o `/admin/facturacion-pendiente` (Conduces de Garantía)

**Mejoras al flujo actual de generar conduce:**

1. **Buscador de cliente con autocomplete** al crear conduce, en vez de tener que ir primero a una orden vinculada. Permitiría facturar sin orden previa (caso de venta de producto sin reparación).

2. **Botón "Nuevo Cliente"** inline para crear cliente desde el modal del conduce.

3. **Campo Numeración / Condiciones / Método Pago como dropdowns** en vez de campos libres. Más rápido + menos errores.

4. **Items con tipo Inventario vs Manual:**
   - **Inventario**: jala del catálogo `productos` (ya existe en el sistema). Precio autocompleta de `productos[].precio`.
   - **Manual**: cantidad y precio libres. Útil para "Mano de obra reparación lavadora" o "Diagnóstico".

5. **Vendedor / Técnico por línea de item.** Hoy una orden tiene un solo `tecnicoId`. Si en una factura hay múltiples items (cambio de motor + diagnóstico + venta de pieza), cada uno puede tener un técnico distinto. Eso permite repartir comisiones de forma más granular.

6. **Precio 1 / Precio 2** con radio para elegir cuál aplicar. Útil si tenés precios mayoreo vs detalle.

7. **Campo Orden de Compra opcional + adjunto.** Cliente corporativo puede pedir adjuntar PO.

8. **Tasa de Cambio** cuando moneda es USD. Hoy no soportamos otras monedas pero los clientes corporativos a veces piden facturar en USD.

### Lo que NO copiamos directamente

- **Numeración fiscal (NCF)**: el conduce de garantía es interno (no DGII), no necesita serie fiscal. Eso vive en el módulo separado de DGII si llega a hacer falta.

- **Tasa impuestos automática**: ya tenemos ITBIS configurable en `config_empresa.tasaItbis`. Reusamos.

- **Tabla 100% editable inline**: el flujo de Mister Service tiene la complejidad de que el conduce está vinculado a una orden cerrada. No queremos romper esa relación. La factura puede usar línea inventario + manual pero el cierre del conduce sigue propagando a la orden vinculada (commission, fase, pagos).

## Decisiones de Jorge (cerradas, ejecutar con estos defaults)

### 1. Alcance: ambas páginas con prioridad en `/admin/facturas`

**Decisión:** Aplicar **a `/admin/facturas` con flujo completo** (todo el rediseño estilo SIBS) + **a `FacturacionPendiente.tsx` solo selectos UX** (vendedor por línea, preview de items, modal Detalles).

**Razón:** `/admin/facturas` es el flujo manual donde el rediseño aporta valor máximo. `FacturacionPendiente` recibe órdenes cerradas con flujo automático que no conviene romper — solo se enriquece con vendedor por línea para distribución de comisión correcta.

### 2. Comisión con vendedor por línea: reparto proporcional por monto del item

**Decisión:** Si un conduce tiene 3 items con 3 técnicos distintos, **cada técnico recibe comisión proporcional al monto de su línea**.

**Ejemplo concreto:** Conduce de RD$10,000 con:
- Item 1: $4,000 → técnico A
- Item 2: $3,000 → técnico B
- Item 3: $3,000 → técnico C

La comisión total del conduce (ej: 15% = $1,500) se reparte:
- Técnico A: $600 (40% del $1,500)
- Técnico B: $450 (30%)
- Técnico C: $450 (30%)

**Implementación:**
- `comisiones.service.ts` necesita extender `crearComision()` para aceptar array de items con `{ tecnicoId, monto, descripcion }`.
- Si todos los items tienen el mismo `tecnicoId`, comportamiento idéntico al actual (single tecnico, single comisión).
- Si hay múltiples técnicos, crear N comisiones (una por técnico) con monto proporcional.
- Reportes de comisión por técnico ya filtrados por `tecnicoId`, sin cambios.

### 3. Precio 1 vs Precio 2: Mayoreo vs Detalle

**Decisión:** **Precio 1 = Mayoreo (default)** | **Precio 2 = Detalle (clientes corporativos)**.

**Razón:** patrón típico en RD para distribuidoras. Permite a Mister Service vender piezas al detalle a clientes finales y al por mayor a otros talleres o empresas aliadas.

**Implementación:**
- Schema `Producto`: agregar `precioMayoreo?: number` (= precio actual) y `precioDetalle?: number`.
- Migración: clientes existentes mantienen `precio` actual como `precioMayoreo`. `precioDetalle` queda opcional, se llena cuando admin lo configure.
- Modal de Detalles: radio "Mayoreo / Detalle" por línea.
- Default: Mayoreo en flujo normal.

### 4. Tipo Manual vs Inventario: agregar `Producto.tipoItem`

**Decisión:** **agregar campo `tipoItem: 'producto' | 'servicio'` al schema `Producto`**. Permite que el catálogo `productos` tenga tanto piezas físicas (con stock, costo, etc.) como servicios (mano de obra, diagnóstico, instalación) sin tabla aparte.

**Implementación:**
- `Producto.tipoItem`: nuevo campo enum, default `'producto'` para registros existentes.
- `Producto.tipoItem === 'servicio'` ignora `stock`, `costo`, `precioMayoreo` (solo precio único, costo opcional).
- Modal Detalles del conduce: dropdown "Tipo" filtra el catálogo de productos según corresponda.
- "Manual" (cantidad/precio libres sin catálogo) sigue siendo opción para casos puntuales no catalogados.

### 5. USD + tasa de cambio: NO en V1

**Decisión:** **Solo DOP por ahora**. Sprint separado en el futuro si llega caso real.

**Razón:** ningún cliente está pidiendo USD hoy. Agregar multi-moneda triplica el costo de implementación (tasa configurable, conversiones, reportes en ambas monedas, validaciones). No hay ROI claro hoy.

**Implementación V1:** ignorar el dropdown "Moneda" del SIBS. El conduce queda implícitamente en DOP.

---

## Estimación con decisiones cerradas

**Sprint grande, ~6-8 horas** con builder + tester + reviewer + security (toca schema + comisiones).

Recomendado split en 2 commits para reducir blast radius:

- **Commit 1 (~3-4h):** schema extension (Producto.tipoItem + Producto.precioDetalle), modal Detalles con dropdowns, items inline en Facturas.tsx.
- **Commit 2 (~3-4h):** vendedor por línea + cálculo proporcional de comisión + integración FacturacionPendiente con selectos UX.

## Verificación post-deploy

**Tester:**
1. Abrir `/admin/facturas` → "Nuevo conduce" → seleccionar cliente → modal Detalles → agregar item Inventario "Motor de lavadora" → seleccionar técnico A → precio Mayoreo. Agregar otro item Manual "Diagnóstico" → seleccionar técnico B → precio libre. Finalizar → conduce CG-#### emitido.
2. Verificar que se crearon 2 comisiones (una para A, otra para B) con monto proporcional.
3. `/admin/facturacion-pendiente` → enviar a conduce desde una orden con varios items → modal Detalles muestra preview con vendedor por línea.
4. Reporte de comisiones por técnico → A y B aparecen con el monto correcto.

**Reviewer:**
- `Producto.tipoItem` migración no rompe productos existentes.
- Comisión proporcional respeta el patrón existente (no introduce race conditions).
- Strip undefined antes de Firestore writes.
- Si se omite `tecnicoId` en una línea, no se crea comisión para ese item (solo para los que tienen vendedor asignado).

**Security:** rules de `productos` y `comisiones` siguen igual. Validar que el endpoint que crea conduces no expone datos sensibles entre items.

## Retrospectiva (post-deploy)

Al cierre, `tech_lead` debe hacer retro y `docs` capturar aprendizajes en `docs/mapa-mental.md`. NO saltarse esa fase — sprint mediano-grande con multiples decisiones nuevas.

## Referencias visuales

Screenshots compartidos por Jorge el 2026-05-02:
- Pantalla principal de Factura (sibs2.com)
- Modal Detalles con dropdown Tipo
- Modal Detalles con dropdown Vendedor expandido
- Modal Detalles cerrado

(Si querés volver a ver los screenshots, están en el chat de Cowork de la sesión 2026-05-02.)

## Estado: listo para ejecutar

Decisiones cerradas. Coordinator puede arrancar cuando termine los sprints actuales en cola.
