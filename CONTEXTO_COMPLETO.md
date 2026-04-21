# Contexto Completo — Mister Service RD

> Documento maestro para reconstruir contexto si la sesión se cae. Actualizar cada vez que haya cambios arquitectónicos. **No es documentación para usuarios finales.**

---

## 1. Identidad del proyecto

**Mister Service RD** es un sistema operativo interno para una empresa de **reparación de electrodomésticos** en República Dominicana. Propietario operativo: **Jorge Luis Brito García** (`apnbrito@gmail.com`, `misterservicerd@gmail.com`).

**Empresa legal:** Fixman SRL — RNC `133-118191`.

El sistema es **paralelo a la facturación fiscal** — la empresa ya tiene otro software autorizado por DGII para facturas reales. Este sistema administra operaciones: órdenes de servicio, agenda técnica, pagos, comisiones, nómina. Los documentos internos se llaman **"Conduces de Garantía"** (prefijo `CG-`), NO facturas fiscales.

**URL producción:** `https://www.misterservicerd.com`
**Repositorio:** `github.com/apnbrito-eng/mister-service-rd` (privado, rama `main`).

---

## 2. Stack técnico

- **Frontend:** Vite + React 18 + TypeScript + Tailwind CSS
- **Routing:** react-router-dom
- **Mapas:** Leaflet + react-leaflet + OpenStreetMap (nominatim para reverse geocoding)
- **Autocomplete direcciones:** Google Places API
- **Backend:** Firebase
  - **Firestore** (base de datos, tiempo real vía `onSnapshot`)
  - **Firebase Auth** (emails + passwords, role-linked a docs en `personal`)
  - **Firebase Storage** (fotos de cierre, fotos de chequeo)
  - Proyecto Firebase: `mister-service-app-cloude`
- **Hosting:** Vercel (proyecto `mister-service-rd`, org `misterservicerd-8290s-projects`)
- **Serverless functions:** en `api/` (solo 2: `api/gps/ubicacion.ts` para proxy GPS y `api/admin/reset-password.ts` para Firebase Admin SDK)
- **UI:** lucide-react (iconos), react-hot-toast, date-fns/locale/es
- **Moneda:** `RD$` (formatMoneda en `utils/index.ts`)
- **Idioma UI:** Español (Dominicano). Identificadores en código también español (`clienteNombre`, `fechaCita`, `fase`, `tecnicoId`).

**Deploy Hook Vercel** (por si webhook GitHub falla):
`https://api.vercel.com/v1/integrations/deploy/prj_VdEXPPBC19wLvHN495VzrYTQmLgi/RlN747BZpS` (POST sin body)

**Env vars requeridas en Vercel:**
- `FIREBASE_PROJECT_ID=mister-service-app-cloude`
- `FIREBASE_CLIENT_EMAIL=firebase-adminsdk-fbsvc@mister-service-app-cloude.iam.gserviceaccount.com`
- `FIREBASE_PRIVATE_KEY` (con `\n` literales, no newlines reales)
- `VITE_GOOGLE_MAPS_KEY` (para Places autocomplete)
- Otras `VITE_FIREBASE_*` para la app cliente

---

## 3. Routing y audiencias

`src/App.tsx` sirve 3 audiencias bajo una única SPA:

### 3.1 Sitio público (marketing) — bajo `PublicLayout`
- `/` — Home
- `/servicios` — Catálogo de servicios
- `/agendar` — Formulario público de cita

### 3.2 Flujos públicos standalone (sin chrome)
- `/cita/:calendarId` — Agendar cita con calendario específico
- `/tracking/:token` — Cliente ve GPS del técnico en camino
- `/f/:slug` — Formulario dinámico público (sistema de empresas aliadas)

### 3.3 Admin interno `/admin/*`
Auth-gated con `ProtectedRoute`. Rol `tecnico` se redirige a `/tecnico`. Los demás roles usan `Layout + Sidebar`.

**Rutas admin principales:**
- `/admin/dashboard` — KPIs + alertas
- `/admin/agenda-dia` — Columnas por técnico para el día
- `/admin/ordenes` — CRUD de órdenes de servicio
- `/admin/ordenes/:id` — Detalle de orden
- `/admin/citas` — Citas por confirmar (pipeline inicial)
- `/admin/calendario` — Vista calendario mensual
- `/admin/calendarios` — Gestión de calendarios públicos
- `/admin/standby` — Piezas en espera
- `/admin/mapa` — Mapa de rutas con pines de órdenes
- `/admin/clientes` — CRUD clientes + modal de edición + direcciones alternativas
- `/admin/cotizaciones` — Cotizaciones formales
- `/admin/facturas` — Conduces de Garantía (título: "Conduces de Garantía")
- `/admin/facturacion-pendiente` — Bandeja: órdenes enviadas listas para emitir conduce
- `/admin/taller` — Equipos en taller
- `/admin/productos` — Catálogo
- `/admin/rendimiento` — Rendimiento técnico/operaria
- `/admin/metricas-mensuales` — KPIs del mes
- `/admin/mantenimiento` — Programa de mantenimientos
- `/admin/gastos` — Gastos e ingresos
- `/admin/personal` — Personal
- `/admin/usuarios` — Gestión de accesos Firebase Auth + reset password directo
- `/admin/precios` — 139 servicios pre-cargados
- `/admin/inventario` — Piezas inventario
- `/admin/bancos` — 5 bancos reales configurables
- `/admin/comisiones` — Reporte comisiones técnicos (rango libre + CSV)
- `/admin/nomina` — Liquidaciones quincenales
- `/admin/avances` — Adelantos/préstamos a empleados
- `/admin/estado-resultado` — P&L mensual
- `/admin/historial-anuladas` — Papelera con restore
- `/admin/cierre-dia` — Cierre del día
- `/admin/configuracion` — Datos empresa + ITBIS config + GPS provider
- `/admin/web` — Configuración sitio público
- `/admin/empresas-aliadas` — Empresas que usan el sistema
- `/admin/formularios` — Builder de formularios públicos
- `/admin/formularios/:id` — Editor específico
- `/admin/solicitudes` — Submissions de formularios públicos

### 3.4 Vista técnico `/tecnico`
Móvil-first. Muestra:
- Card de ganancias acumuladas en la quincena actual (expandible con detalle)
- Citas del día con ruta optimizada (nearest neighbor)
- Mapa con pines numerados (tap → detalle + botón "Ir" a Google Maps)
- Botón "Iniciar chequeo" (foto + GPS + cambia fase a `en_diagnostico`)
- Botón "Marcar Realizado" (abre wizard de cierre: foto + 3 preguntas + GPS)
- Botón "Agregar nota" con precio sugerido
- Notificaciones in-app (campana)

---

## 4. Firestore — colecciones

```
ordenes_servicio           # Órdenes de servicio (tipo OrdenServicio en types)
clientes                   # Clientes con direcciones alternativas, RNC, cédula
personal                   # Staff con sueldoBase (MENSUAL), comisionPorcentaje
usuarios                   # Profiles opcionales (fallback: personal por email)
citas_por_confirmar        # Leads del formulario público, pendientes
cotizaciones               # Cotizaciones formales (prefijo QT-#####)
facturas                   # Conduces de Garantía (prefijo CG-#####, legacy FAC- existen)
equipos_taller             # Equipos dejados en el taller
productos                  # Catálogo
precios_servicios          # 139 servicios pre-cargados (seedPrecios.ts)
standby_piezas             # Piezas pendientes de llegada
gastos                     # Gastos con categoría
mantenimientos             # Mantenimientos recurrentes
comisiones                 # ComisionRegistro por orden facturada
liquidaciones_nomina       # Nómina quincenal cerrada
avances                    # Adelantos/préstamos a empleados
calendarios                # Calendarios públicos
ubicaciones_vehiculos      # GPS de técnicos en camino
bancos                     # 5 bancos con datos de cuenta
notificaciones             # Notificaciones in-app
recordatorios_diarios      # 9AM ruta + 11AM avisos clientes
formularios                # Formularios dinámicos públicos
solicitudes_servicio       # Submissions de formularios
empresas_aliadas           # Empresas asociadas
config                     # ├ config/contadores (OS, QT, FAC/CG)
                           # ├ config/fiscal (itbisPorcentaje, rnc, razonSocial)
                           # ├ config/empresa (datos básicos)
                           # └ config_gps/sistema (proveedor GPS)
config_web                 # Configuración sitio público
```

---

## 5. Roles y permisos (PermisosSistema)

**6 roles** definidos en `src/types/index.ts`:

| Rol | Propósito |
|---|---|
| `administrador` | Todo. Jorge. |
| `coordinadora` | Casi todo menos modificar configuración crítica y eliminar personal. |
| `secretaria` | Citas, órdenes, clientes. Bono mensual por citas agendadas/completadas. |
| `operaria` | Gestiona órdenes asignadas a su grupo + cotización + registro de pagos + envío a conduce. Bono mensual por desempeño (≥70%). |
| `tecnico` | Vista móvil. Solo sus citas del día. Chequeo, nota, cierre. Recibe comisiones. |
| `ayudante` | Rol sin permisos (staff sin acceso al sistema). |

**Permisos granulares** en `PermisosSistema` interface (ver `src/types/index.ts`): `ordenesVer`, `ordenesCrear`, `ordenesModificar`, `ordenesModificarFueraGrupo`, `ordenesEliminar`, `cotizacionesVer/Crear/Modificar/AprobarPrecio`, `facturasVer/Crear/Modificar/Eliminar/Cerrar`, `clientesVer/Crear/Modificar/Eliminar`, `personalVer/Crear/Modificar/Eliminar`, `gastosVer/Crear/Eliminar`, `rendimientoVer`, `configuracionVer/Modificar`, `cierreDiaEjecutar`, `pagosRegistrar`, `ordenesEnviarAFacturacion`, `bancosGestionar`, `avancesGestionar`.

Defaults por rol en constantes `PERMISOS_DEFAULT_*`. Cada persona puede tener overrides via `permisosPersonalizados: true` + `permisosSistema: {...}`.

**Gating**: `puede(userProfile, 'permisoKey')` → boolean. Componentes admin usan `<PermisoRoute permiso="..."><Pagina/></PermisoRoute>` o `<RolRoute roles={['administrador','coordinadora']}>...</RolRoute>`.

---

## 6. Flujo de negocio — ciclo de vida de una orden

```
nuevo_lead
  ↓ (operaria asigna técnico y fecha)
en_gestion
  ↓ (cliente confirma / operaria agenda)
agendado
  ↓ (técnico llega al sitio → Iniciar chequeo con foto + GPS)
en_diagnostico
  ↓ (técnico cotiza → sugiere precio)
en_cotizacion
  ↓ (admin/coord/operaria aprueba precio)
aprobado
  ↓ (técnico hace el trabajo → Marcar Realizado → cierre con foto + GPS)
trabajo_realizado
  ↓ (operaria registra pago → botón Enviar a conduce)
  ↓ (admin/coord procesa en /admin/facturacion-pendiente)
cerrado   (con conduce CG-##### generado, comisión del técnico registrada)
```

Transición de estado en `FASES_ORDENADAS` (`src/utils/index.ts`). Lateral: `cancelado` (con motivo obligatorio) y `eliminada` (soft delete con motivo).

**Historial:** cada cambio se guarda en `historialFases[]` (append-only via `arrayUnion`) y en `auditoria[]` (registros detallados).

---

## 7. Decisiones de negocio importantes (no cambiar sin confirmar)

### 7.1 Quincenas RD
- Q1: del día **30 del mes anterior al día 14** del mes actual → se paga el día **15**.
- Q2: del día **15 al 29** → se paga el día **30**.
- Lógica en `src/utils/comisiones.ts`: `calcularQuincenaActual`, `rangoQuincena`.

### 7.2 Sueldo base MENSUAL
- `personal.sueldoBase` se registra como MONTO MENSUAL.
- En la nómina se **divide entre 2** por quincena.
- No confundir con "sueldo quincenal" — el sistema ya hace la división.

### 7.3 ITBIS 18% — referencia interna
- Se desglosa en cada conduce: `subtotal = total / 1.18`, `itbis = total - subtotal`.
- **NO es declaración fiscal.** Solo se usa para:
  - Calcular `gananciaNeta = subtotal - costoPiezas` (base de comisión).
  - Comisión del técnico = `gananciaNeta * comisionPorcentaje / 100`.
- Configurable en `/admin/configuracion` (colección `config/fiscal.itbisPorcentaje`).

### 7.4 Conduce de Garantía, NO factura fiscal
- Todos los documentos "Factura" en UI dicen "Conduce de Garantía".
- Contador `CG-#####` (antes era `FAC-#####`, los históricos FAC quedan intactos).
- La facturación DGII formal se hace en OTRO software externo autorizado.
- **Por eso se eliminó el módulo "Reportes DGII 607"** que se había construido — no aplica aquí.

### 7.5 Comisiones
- Se disparan al **generar el conduce** (en `FacturacionPendiente`), no al cerrar la orden.
- Idempotentes por `ordenId`: si ya existe una comisión para la orden, se actualiza con los nuevos valores.
- Estado `pendiente` hasta que la liquidación de esa quincena se cierra, luego pasa a `liquidada`.
- Default: senior 10%, junior 8%, fallback 10%.

### 7.6 Bancos reales (Fixman SRL + Jorge)
1. **Banco Popular** — 843776782 — cuenta corriente — Fixman SRL — RNC 133-118191
2. **BHD** — 27792170018 — ahorro — Jorge L. Brito — Cédula 229-0015616-1
3. **Banreservas** — 9600374955 — ahorro — Jorge L. Brito
4. **Santa Cruz** — 11342010005405 — ahorro — Jorge L. Brito
5. **Scotiabank** — 86209610981 — ahorro — Jorge L. Brito

Correo comprobantes: `misterservicerd@gmail.com`.

### 7.7 Política de pago (va en mensaje WhatsApp automático)
> "La transferencia debe realizarse después de que el técnico culmine el servicio y **antes** de que se retire de la residencia (política de empresa)."

### 7.8 Bonos mensuales
- **Operaria/Coordinadora**: bono RD$5,000 si desempeño ≥ 70% (órdenes completadas / atendidas) en el mes.
- **Secretaria**: bono por tiers de citas completadas en el mes: 200=RD$2k, 300=RD$3.5k, 400+=RD$5k.
- Solo se pagan en la quincena Q2 (el 30 de cada mes) porque son mensuales.

---

## 8. Convenciones de código (no negociables)

1. **Firestore undefined-stripping**: nunca enviar `undefined` a Firestore. Usar `if (value !== undefined) payload.field = value` o `Object.fromEntries(...filter(...))`.

2. **Contadores transaccionales**: siempre via `src/services/contadores.service.ts` (`siguienteNumeroOrden`, `siguienteNumeroCotizacion`, `siguienteNumeroFactura`). Nunca client-side.

3. **parseOrden / parseFactura coverage**: cuando se agrega un field a `OrdenServicio`, `Factura`, `ComisionRegistro`, SIEMPRE actualizar la función parser correspondiente en `src/utils/index.ts`. Bugs históricos por olvidar esto: #57, #61.

4. **arrayUnion para listas append-only**: `historialFases`, `auditoria`, `pagos`. Nunca reemplazar, siempre append.

5. **Idempotencia en comisiones**: verificar que no exista `ComisionRegistro` por `ordenId` antes de crear.

6. **Spanish identifiers**: nombrar fields como el patrón existente (`clienteNombre`, `precioFinal`, `comisionMonto`). Nunca traducir.

7. **Sidebar + Routes registration**: toda nueva página `/admin/*` debe:
   - Agregarse en `src/App.tsx` bajo `<Route path="..." element={<PermisoRoute|RolRoute>...</...>}>`.
   - Agregarse en `src/components/Sidebar.tsx` con gate `show: p('permisoX')` o similar.

8. **No hardcode de valores fiscales**: ITBIS%, comisión%, etc. leen de config docs, no de constantes en código.

9. **No emojis en URLs/keys**: ok en UI text de toasts y labels. NO en URL params (`encodeURIComponent` los rompe) ni identifiers.

10. **Build verification**: después de cambios grandes, correr `npx tsc --noEmit` en la raíz para detectar type errors antes de commit.

---

## 9. Flujo del equipo multi-agente

`.claude/agents/`:
- `coordinator.md` — único interfaz con Jorge, descompone y delega
- `builder.md` — implementa código siguiendo convenciones
- `tester.md` — typecheck + lint + grep de regresiones antes del commit
- `reviewer.md` — review independiente con ojos frescos
- `devops.md` — monitorea Vercel y dispara Deploy Hook si webhook se atora

`.claude/commands/equipo.md` — slash command `/equipo` (puede no funcionar sin reiniciar Claude Code; si falla, pegar el prompt directo).

**Flujo típico:**
1. Jorge describe un pedido en español conversacional.
2. Coordinator aclara con `AskUserQuestion` si hay ambigüedad.
3. Coordinator delega: `builder` → `tester` → `reviewer` → loop si CHANGES_NEEDED.
4. Coordinator entrega a Jorge el bloque `git add + commit + push`.
5. Jorge ejecuta en su Mac con Claude Code.
6. Devops confirma deploy Ready en Vercel.

---

## 10. Features implementadas (orden cronológico aproximado)

### Fase 1: Cliente + orden básica
Normalización teléfono RD (10 dígitos, strip +1), detección de duplicados, advertencia de órdenes activas al crear, botón "Crear nuevo cliente" siempre visible.

### Fase 2: Mapa + rutas
Leaflet, pines numerados, ruta optimizada nearest-neighbor, zonas RD con colores, reverse geocoding Nominatim para URLs de Maps.

### Fase 3: Personal + roles + permisos granulares
PersonalPage con Firebase Auth linking (pattern: secondary app para crear user sin cerrar admin), roles coordinadora/operaria/ayudante, PermisosSistema granular con overrides.

### Fase 4: Inventario + cotizaciones + conduces
139 servicios pre-cargados en `seedPrecios.ts`, catálogo PiezaInventario, ItemCotizacion con tipoItem (servicio/pieza/manual), generación de conduce desde cotización.

### Fase 5: Comisiones automáticas
`ComisionRegistro` colección, se genera al emitir conduce, base = ganancia neta × % técnico.

### Fase 6: Nómina quincenal
`LiquidacionNomina` con empleados[], totalDevengado, avances descontados, cierre marca comisiones como liquidadas.

### Fase 7: Facturación interna (ahora Conduce)
Desglose ITBIS (subtotal/ITBIS/costo/gananciaNeta), pagos[] append-only, flujo "Enviar a conduce" → bandeja admin → "Emitir conduce de garantía".

### Fase 8: Extras recientes
- Inicio de chequeo técnico (foto + GPS, cambia fase)
- Card ganancias quincena en vista técnico
- Módulo Avances a Empleados con descuento automático en nómina
- Estado de Resultado mensual (P&L con comparativa vs mes anterior)
- Banco configurable con datos de cuenta + WhatsApp pre-armado
- Múltiples direcciones por cliente + RNC/cédula
- Pin del mapa abre detalle de orden + botón Ir a Maps
- Reset password directo desde admin (Firebase Admin SDK)
- Refactor Factura → Conduce de Garantía

---

## 11. Bugs conocidos / tareas abiertas

| Estado | Tema |
|---|---|
| Abierto | GPS en Chrome a veces no responde (bug actual, reporte de técnico). Posibles causas: permiso denegado sin prompt visible, getCurrentPosition hang. Ver commit `7882bcd`. |
| Pendiente | Actualizar manual PDF con módulos nuevos (último manual es de antes de los últimos 20+ commits). |
| Pendiente | QA end-to-end del flujo completo con datos reales. |
| Opcional | Módulo Facturas de Gastos (habilitaría 606 si algún día se decide unificar con DGII). |

---

## 12. Credenciales y datos operacionales

- **Email general:** misterservicerd@gmail.com
- **Admin Firebase Auth:** misterservicerd@gmail.com (rol administrador)
- **Teléfono empresa (público):** (829) 389-7474
- **Horario público:** Lun-Sáb 8:00 AM - 6:00 PM
- **Dirección fiscal:** Santo Domingo, República Dominicana

**Cédula propietario:** 229-0015616-1 (Jorge L. Brito)
**RNC empresa:** 133-118191 (Fixman SRL)

---

## 13. Comandos útiles

```bash
# Dev local
npm run dev      # http://localhost:5173

# Build (verifica typecheck + vite build)
npm run build

# Solo typecheck (rápido, no emite)
npx tsc --noEmit

# Lint (max-warnings 0 en CI)
npm run lint

# Forzar deploy Vercel si webhook falla
curl -X POST https://api.vercel.com/v1/integrations/deploy/prj_VdEXPPBC19wLvHN495VzrYTQmLgi/RlN747BZpS
```

---

## 14. Últimos commits importantes (referencia rápida)

```
7882bcd fix: iOS Safari — cámara no abría al iniciar chequeo (user gesture perdido)
bf0da77 fix: GPS con timeout de 12s + escape manual (no se queda colgado)
5f68057 fix: GPS para iniciar chequeo — 2 pasos + pedir antes de cámara
0ca9b1b feat: pin del mapa abre detalle de la orden + botón 'Ir' en Google Maps
95ad0cd feat: botón 'Editar cliente' en /admin/clientes integra EditarClienteModal
2d3e7d5 feat: campos RNC y cédula en EditarClienteModal
7367245 feat: team multi-agente (coordinator + builder + tester + reviewer + devops)
d0b5bad refactor: Factura → Conduce de Garantía (sistema interno paralelo a DGII)
66c6984 feat: Estado de Resultado mensual con comparativa mes anterior
fe8f8d0 feat: módulo Avances a Empleados con descuento automático en nómina
44cc4f9 feat: reporte Comisiones con filtro rango libre + toggle costo + exportar CSV
5eaeed8 feat: tasa ITBIS configurable desde Configuración
69e2150 feat: facturación con desglose ITBIS + ganancia neta + comisión al facturar
a7fab70 feat: fila expandible en Facturas con desglose fiscal y comisión
2440c88 feat: card ganancias técnico con rango fechas + detalle expandible
5f96cf7 fix: parseOrden no leía pagos/facturación
4f3fc85 fix: enviar a facturación con cualquier precio + Agenda Día con detalle completo
5bf9cc5 feat: Places + URL parser + mini-mapa en modales de dirección
57d79a9 feat: bancos con datos completos de cuenta + compartir por WhatsApp
6f0de88 feat: flujo pagos + envío a facturación + bandeja facturación pendiente
d3246ca fix: usar subpath imports de firebase-admin v12
82b2d8d feat: cambio directo de contraseña desde admin via Firebase Admin SDK
```

---

**Este archivo es la fuente de verdad para reconstruir contexto. Mantenerlo actualizado al cerrar cada sesión grande.**
