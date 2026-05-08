# Auditoría focalizada de menús, rutas y módulos — 2026-05-08

> **Sprint:** SPRINT-117a (procesado autónomo).
> **Modo:** read-only, sin tocar código de la app, rules ni servicios.
> **Alcance:** routing (`src/App.tsx`), entry (`src/main.tsx`), sidebar (`src/components/Sidebar.tsx`), layouts (`src/components/Layout.tsx`, `src/components/public/PublicLayout.tsx`), permisos (`src/utils/permisos.ts` + `PERMISOS_DEFAULT_*` en `src/types/index.ts:1257-1304`), index de `src/pages/` y `src/components/`.
> **Objetivo:** documentar la realidad — no proponer cambios. La propuesta vive en SPRINT-117b.

---

## 1) Inventario de rutas

Fuente: `src/App.tsx` (líneas 169-273). Las páginas cuyo único gate es `ProtectedRoute + TecnicoRoute + AyudanteRoute + Layout` (sin `PermisoRoute` ni `RolRoute`) se marcan como **"auth"** — visibles para cualquier rol distinto de técnico y ayudante. El resto declara explícitamente qué permiso o rol se exige.

### 1.1 Públicas (sin auth)

| Ruta | Layout | Componente | Rol gate | Propósito (1 línea) |
|---|---|---|---|---|
| `/` | `PublicLayout` | `HomePage` | público | Landing del sitio comercial — hero, servicios destacados, CTA. |
| `/servicios` | `PublicLayout` | `ServiciosPage` | público | Listado de servicios ofrecidos (lavadora/secadora/nevera/estufa/AC). |
| `/servicios/:slug` | `PublicLayout` | `ServicioDetalle` | público | Detalle de un servicio + CTA agendar/WhatsApp. |
| `/agendar` | `PublicLayout` | `AgendarPage` | público | Formulario público de cita (alternativa a `/cita/:calendarId`). |
| `/cita/:calendarId` | (standalone) | `CitaPublica` | público | Formulario de cita atado a un calendario específico (link compartible). |
| `/tracking/:token` | (standalone) | `TrackingCliente` | público | Tracking GPS en vivo para el cliente con feedback NPS al cierre. |
| `/f/:slug` | (standalone) | `FormularioPublico` | público | Renderer dinámico de formularios (B2B con empresas aliadas). |
| `/garantia/:token` | (standalone) | `GarantiaCliente` | público | Portal de garantía del cliente (ver estado del Conduce). |
| `/cliente/:token` | (standalone) | `PortalCliente` | público | Portal del cliente — historial, reprogramaciones, NPS. |

### 1.2 Auth pero sin Layout admin

| Ruta | Layout | Componente | Rol gate | Propósito |
|---|---|---|---|---|
| `/login` | (standalone) | `Login` | sólo no-autenticado | Form de login con redirección por rol al éxito. |
| `/tecnico` | (standalone) | `TecnicoVista` | `ProtectedRoute` (técnico aterriza acá por TecnicoRoute) | Vista mobile del técnico — sus citas, iniciar chequeo, cerrar servicio. |
| `/ponche` | (standalone) | `Ponche` | `ProtectedRoute` (TODOS los roles incluyendo ayudante) | Marcaje de entrada/salida con foto + GPS. |

### 1.3 Admin (`/admin/*` — `Layout` + `Sidebar`)

Gating común: `ProtectedRoute + TecnicoRoute + AyudanteRoute + Layout`. La columna **"gate"** muestra el wrapper extra cuando aplica.

| Ruta | Componente | Gate específico | Propósito |
|---|---|---|---|
| `/admin` | `<Navigate to="/admin/dashboard" />` | — | Redirect al dashboard. |
| `/admin/dashboard` | `Dashboard` | auth | Resumen del día — alertas, KPIs, ~6 listeners en vivo. |
| `/admin/ordenes` | `Ordenes` | auth | Vista principal de órdenes de servicio (lista + tablero). |
| `/admin/ordenes/:id` | `OrdenDetalle` | auth | Detalle de una orden con timeline, fases, notas. |
| `/admin/citas` | `Citas` | auth | Citas por confirmar (origen formulario público/manual). |
| `/admin/calendario` | `Calendario` | auth | Calendario mes/semana/día de las órdenes/citas. |
| `/admin/agenda-dia` | `AgendaDia` | `permiso=ordenesVer` | Vista del día por técnico — secuencia de paradas. |
| `/admin/calendarios` | `Calendarios` | auth | Catálogo de calendarios públicos (links compartibles tipo Calendly). |
| `/admin/standby` | `Standby` | auth | Piezas en standby + órdenes pausadas esperando piezas. |
| `/admin/mapa` | `MapaRutas` | auth | Mapa de rutas + GPS en vivo de vehículos. |
| `/admin/clientes` | `Clientes` | auth | Maestro de clientes + reactivación. |
| `/admin/cotizaciones` | `Cotizaciones` | `permiso=cotizacionesVer` | Cotizaciones (`QT-#####`). |
| `/admin/facturas` | `Facturas` | `permiso=facturasVer` | Conduces de Garantía (`CG-#####`, prefijo legacy `FAC-`). |
| `/admin/taller` | `EquiposTaller` | auth | Equipos en el taller (no en domicilio). |
| `/admin/productos` | `Productos` | auth | Catálogo de productos/servicios (legacy, conviven con `/admin/precios`). |
| `/admin/rendimiento` | `Rendimiento` | `permiso=rendimientoVer` | Dashboard de rendimiento por técnico/coordinadora. |
| `/admin/metricas-mensuales` | `MetricasMensuales` | `permiso=rendimientoVer` | Métricas + bonos secretaria/operaria mensuales. |
| `/admin/mantenimiento` | `Mantenimiento` | auth | Mantenimientos preventivos programados (recurrentes). |
| `/admin/gastos` | `Gastos` | `permiso=gastosVer` | Gastos e ingresos por categoría. |
| `/admin/personal` | `PersonalPage` | `permiso=personalVer` | Maestro de personal (no necesariamente con login). |
| `/admin/usuarios` | `GestionUsuarios` | `rol in [admin, coord]` | Cuentas de usuario, permisos y resets de contraseña. |
| `/admin/configuracion/usuarios` | `GestionUsuarios` | `rol in [admin, coord]` | **Duplicado** — misma página que `/admin/usuarios`. |
| `/admin/web` | `ConfiguracionWeb` | `rol=admin` | Configuración del sitio público (hero, contacto, NPS). |
| `/admin/empresas-aliadas` | `EmpresasAliadas` | `rol=admin` | Empresas B2B que reciben formularios dinámicos. |
| `/admin/formularios` | `Formularios` | `rol=admin` | Editor/lista de formularios dinámicos (`/f/:slug`). |
| `/admin/formularios/:id` | `FormularioEditor` | `rol=admin` | Builder de un formulario individual. |
| `/admin/solicitudes` | `Solicitudes` | `rol=admin` | Inbox de submissions de formularios públicos. |
| `/admin/asistente` | `AsistenteIA` | `rol=admin` | Chat con asistente IA (pantalla completa). |
| `/admin/asistente/historial` | `AsistenteIAHistorial` | `rol=admin` | Historial de conversaciones IA. |
| `/admin/configuracion` | `Configuracion` | `permiso=configuracionVer` | Config GPS / fiscal / empresa / tipos de equipo. |
| `/admin/cierre-dia` | `CierreDia` | `permiso=cierreDiaEjecutar` | Cierre operativo del día (validar entregas/cobros). |
| `/admin/precios` | `PreciosServicios` | `permiso=configuracionVer` | Catálogo de precios de servicios (mayoreo/detalle). |
| `/admin/inventario` | `Inventario` | `permiso=configuracionVer` | Inventario de piezas con stock + movimientos. |
| `/admin/comisiones` | `Comisiones` | `rol in [admin, coord]` | Comisiones registradas por quincena. |
| `/admin/nomina` | `Nomina` | `rol in [admin, coord]` | Liquidaciones quincenales con descuentos/avances. |
| `/admin/historial-anuladas` | `HistorialAnuladas` | `permiso=ordenesVerEliminadas` | Órdenes eliminadas/canceladas con auditoría. |
| `/admin/bancos` | `Bancos` | `permiso=bancosGestionar` | Cuentas bancarias para cobranza. |
| `/admin/facturacion-pendiente` | `FacturacionPendiente` | `rol in [admin, coord]` | Conduces pendientes de emitir post-cierre. |
| `/admin/avances` | `Avances` | `permiso=avancesGestionar` | Avances de quincena a empleados. |
| `/admin/prestamos` | `Prestamos` | `rol in [admin, coord]` | Préstamos a empleados con cuotas. |
| `/admin/estado-resultado` | `EstadoResultado` | `rol in [admin, coord]` | P&L mensual (ventas/costos/gastos/utilidad). |
| `/admin/ponches` | `AdminPonches` | `rol in [admin, coord]` | Reporte de ponches del personal. |
| `/admin/feedback` | `Feedback` | `rol in [admin, coord]` | NPS y feedback de clientes. |
| `/admin/sugerencias-chequeo` | `SugerenciasChequeo` | `rol in [admin, coord]` | Sugerencias de "solo chequeo" del técnico (R4). |
| `/admin/reprogramaciones` | `Reprogramaciones` | `rol in [admin, coord]` | Propuestas de reprogramación del cliente. |
| `/admin/configuracion-marketing` | `ConfiguracionMarketing` | `rol=admin` | Plantillas y campañas de reactivación. |

### 1.4 Legacy redirects

`/dashboard`, `/ordenes`, `/citas`, `/calendario`, `/clientes`, `/configuracion` → `/admin/<misma>`. Mantenidos por bookmarks viejos y links de WhatsApp.

`*` → `/` (fallback público).

---

## 2) Items del Sidebar por rol

Fuente: `src/components/Sidebar.tsx`. La estructura está organizada en secciones colapsables + items sueltos. Las secciones aparecen sólo si tienen al menos un item visible para el rol. Visibilidad calculada con `puede(userProfile, accion)` (`src/utils/permisos.ts`) más checks ad-hoc por rol (`isAdmin`, `esAdminOCoord`, `isOperaria`, `isSecretaria`, etc.).

### 2.1 Administrador

Defaults: `PERMISOS_DEFAULT_ADMINISTRADOR = TODO_TRUE` (`src/types/index.ts:1259`).

- **Ponche** → `/ponche`
- **Dashboard** → `/admin/dashboard`
- **Operaciones** (sección expandida)
  - Agenda del Día → `/admin/agenda-dia`
  - Órdenes → `/admin/ordenes`
  - Citas por Confirmar (badge) → `/admin/citas`
  - Calendario → `/admin/calendario`
  - Calendarios → `/admin/calendarios`
  - Pendiente de piezas (badge) → `/admin/standby`
  - Mapa de Rutas → `/admin/mapa`
  - Cierre del Día → `/admin/cierre-dia`
  - Feedback NPS → `/admin/feedback`
  - Sugerencias chequeo (badge) → `/admin/sugerencias-chequeo`
  - Reprogramaciones (badge) → `/admin/reprogramaciones`
  - Historial Anuladas → `/admin/historial-anuladas`
- **Clientes** → `/admin/clientes`
- **Documentos** (sección expandida)
  - Cotizaciones → `/admin/cotizaciones`
  - Conduces de Garantía → `/admin/facturas`
  - Conduces Pendientes (badge) → `/admin/facturacion-pendiente`
- **Catálogo e Inventario** (colapsada por default)
  - Catálogo → `/admin/productos`
  - Inventario → `/admin/inventario`
  - Equipos Taller → `/admin/taller`
  - Precios de Servicios → `/admin/precios`
- **Finanzas** (sección expandida)
  - Gastos e Ingresos → `/admin/gastos`
  - Bancos → `/admin/bancos`
  - Nómina → `/admin/nomina`
  - Avances a Empleados → `/admin/avances`
  - Préstamos a Empleados → `/admin/prestamos`
  - Comisiones → `/admin/comisiones`
  - Estado de Resultado → `/admin/estado-resultado`
  - Rendimiento → `/admin/rendimiento`
  - Métricas del Mes → `/admin/metricas-mensuales`
- **Mantenimiento** → `/admin/mantenimiento`
- **Web y Solicitudes** (colapsada por default)
  - Página Web → `/admin/web`
  - Empresas Aliadas → `/admin/empresas-aliadas`
  - Formularios → `/admin/formularios`
  - Solicitudes (badge) → `/admin/solicitudes`
- **Asistente IA** (colapsada por default)
  - Chat (pantalla completa) → `/admin/asistente`
  - Historial IA → `/admin/asistente/historial`
- **Sistema** (colapsada por default)
  - Personal → `/admin/personal`
  - Usuarios & Permisos → `/admin/usuarios`
  - Reporte de Ponches → `/admin/ponches`
  - Configuración → `/admin/configuracion`
  - Plantillas Marketing → `/admin/configuracion-marketing`

**Total visible admin: 38 items** + 2 items sueltos top-level + Ponche + Dashboard. **42 items en total**.

### 2.2 Coordinadora

Defaults: `PERMISOS_DEFAULT_COORDINADORA = TODO_TRUE` salvo `configuracionModificar=false` y `personalEliminar=false`. En el sidebar `isAdmin` está aliasado a `esAdminOCoord` (línea 164), entonces **ve casi todo lo del admin**.

Diferencias respecto a admin:
- **Asistente IA** y **Plantillas Marketing**: ocultas (gateadas por `userProfile.rol === 'administrador'` literal).
- **Página Web / Empresas Aliadas / Formularios / Solicitudes**: ocultas (sección "Web y Solicitudes" gateada por `isAdmin === esAdminOCoord` SÍ las muestra) — **revisar**: en realidad las items están gateadas con `show: isAdmin` y `isAdmin` es alias de `esAdminOCoord` → coordinadora SÍ las ve. (Posible inconsistencia con la intención original, ver §5.)

**Resultado efectivo:** coordinadora ve ~36 items (todo lo de admin menos Asistente IA y Plantillas Marketing).

### 2.3 Operaria

Defaults: `PERMISOS_DEFAULT_OPERARIA` (`src/types/index.ts:1267`) — `ordenesVer/Crear/Modificar/ModificarFueraGrupo`, `cotizaciones*`, `clientesVer/Crear/Modificar`, `personalVer`, `rendimientoVer`, `pagosRegistrar`, `ordenesEnviarAFacturacion`, `facturasVer`. El resto en `false`.

- **Ponche** → `/ponche`
- **Dashboard** → `/admin/dashboard`
- **Operaciones**
  - Agenda del Día (`ordenesVer`)
  - Órdenes
  - Citas por Confirmar
  - Calendario
  - Calendarios (mostrado por `isOperaria` literal)
  - Pendiente de piezas
  - Mapa de Rutas
  - (Sin Cierre del Día, Feedback NPS, Sugerencias chequeo, Reprogramaciones, Historial Anuladas)
- **Clientes**
- **Documentos**
  - Cotizaciones
  - Conduces de Garantía (`facturasVer=true`)
  - (Sin Conduces Pendientes — gate `isAdmin || coord`)
- **Catálogo e Inventario**
  - Catálogo (`ordenesVer`)
  - Inventario (`isOperaria` rule explícita)
  - Equipos Taller (`ordenesVer`)
  - (Sin Precios de Servicios)
- **Finanzas**
  - Rendimiento (`rendimientoVer=true`)
  - Métricas del Mes (idem)
  - (Sin Gastos, Bancos, Nómina, Avances, Préstamos, Comisiones, Estado de Resultado)
- **Mantenimiento** (`ordenesVer`)
- **Sistema**
  - Personal (`personalVer=true`, sólo lectura)
  - (Sin el resto)

**Total visible operaria: ~17 items** (Ponche + Dashboard + Mantenimiento + 14 dentro de secciones).

### 2.4 Secretaria

Defaults: `PERMISOS_DEFAULT_SECRETARIA` (`src/types/index.ts:1278`) — `ordenesVer/Crear/Modificar`, `clientesVer/Crear/Modificar`, `personalVer`, `pagosRegistrar`. Resto en `false`.

- **Ponche**
- **Dashboard**
- **Operaciones**
  - Agenda del Día
  - Órdenes
  - Citas por Confirmar
  - Calendario
  - Calendarios (mostrado por `isSecretaria` literal)
  - Pendiente de piezas
  - Mapa de Rutas
- **Clientes**
- **Documentos**
  - (Sin Cotizaciones — `cotizacionesVer=false`)
  - (Sin Conduces de Garantía — `facturasVer=false`)
  - (Sin Conduces Pendientes)
- **Catálogo e Inventario**
  - Catálogo (`ordenesVer`)
  - Equipos Taller (`ordenesVer`)
  - (Sin Inventario, Precios)
- **Mantenimiento**
- **Sistema**
  - Personal

**Total visible secretaria: ~13 items.**

### 2.5 Técnico

Sale del Layout admin por `TecnicoRoute` → `/tecnico`. **No ve el sidebar admin**. Su UI completa es `TecnicoVista.tsx`. Sigue accediendo a `/ponche`.

Defaults: `PERMISOS_DEFAULT_TECNICO_SISTEMA` — `ordenesVer=true` + flags granulares (vistaAgenda='dia', soloPropiasCitas, verDireccion/UbicacionGPS, marcarCompletado, agregarNotas, recibeNotificacionNuevaCita).

**Sidebar técnico: N/A.** Acciones expuestas dentro de `TecnicoVista`: lista de citas del día, banner siguiente paso, iniciar chequeo, ver direcciones/GPS, cerrar servicio (wizard), notificaciones.

### 2.6 Ayudante

Sale del Layout admin por `AyudanteRoute` → `/ponche`. Defaults: `PERMISOS_DEFAULT_AYUDANTE = TODO_FALSE`.

**Sidebar ayudante: N/A.** Sólo Ponche.

---

## 3) Tabla módulo × rol

Convención: `✓` = ítem visible en sidebar (o ruta accesible); `✗` = oculto/ruta bloqueada; `cond.` = condicional (ver nota). Los técnicos no ven el sidebar admin pero pueden tener acceso programático a `/admin/...` si la URL se escribe directo (en algunos casos no; por TecnicoRoute siempre redirige). Por simplicidad la columna técnico marca `—` salvo Ponche y la app del técnico.

| Módulo | Admin | Coord | Operaria | Secretaria | Técnico | Ayudante |
|---|---|---|---|---|---|---|
| Ponche | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Dashboard | ✓ | ✓ | ✓ | ✓ | — | ✗ |
| Agenda del Día | ✓ | ✓ | ✓ | ✓ | — | ✗ |
| Órdenes | ✓ | ✓ | ✓ | ✓ | — | ✗ |
| Citas por Confirmar | ✓ | ✓ | ✓ | ✓ | — | ✗ |
| Calendario | ✓ | ✓ | ✓ | ✓ | — | ✗ |
| Calendarios (links) | ✓ | ✓ | ✓ | ✓ | — | ✗ |
| Pendiente de piezas | ✓ | ✓ | ✓ | ✓ | — | ✗ |
| Mapa de Rutas | ✓ | ✓ | ✓ | ✓ | — | ✗ |
| Cierre del Día | ✓ | ✓ | ✗ | ✗ | — | ✗ |
| Feedback NPS | ✓ | ✓ | ✗ | ✗ | — | ✗ |
| Sugerencias chequeo | ✓ | ✓ | ✗ | ✗ | — | ✗ |
| Reprogramaciones | ✓ | ✓ | ✗ | ✗ | — | ✗ |
| Historial Anuladas | ✓ | ✓ | cond. (`ordenesVerEliminadas`) | ✗ | — | ✗ |
| Clientes | ✓ | ✓ | ✓ | ✓ | — | ✗ |
| Cotizaciones | ✓ | ✓ | ✓ | ✗ | — | ✗ |
| Conduces de Garantía (Facturas) | ✓ | ✓ | ✓ | ✗ | — | ✗ |
| Conduces Pendientes | ✓ | ✓ | ✗ | ✗ | — | ✗ |
| Catálogo (Productos) | ✓ | ✓ | ✓ | ✓ | — | ✗ |
| Inventario | ✓ | ✓ | ✓ | ✗ | — | ✗ |
| Equipos Taller | ✓ | ✓ | ✓ | ✓ | — | ✗ |
| Precios de Servicios | ✓ | ✓ | ✗ | ✗ | — | ✗ |
| Gastos e Ingresos | ✓ | ✓ | ✗ | ✗ | — | ✗ |
| Bancos | ✓ | ✓ | ✗ | ✗ | — | ✗ |
| Nómina | ✓ | ✓ | ✗ | ✗ | — | ✗ |
| Avances a Empleados | ✓ | ✓ | ✗ | ✗ | — | ✗ |
| Préstamos a Empleados | ✓ | ✓ | ✗ | ✗ | — | ✗ |
| Comisiones | ✓ | ✓ | ✗ | ✗ | — | ✗ |
| Estado de Resultado | ✓ | ✓ | ✗ | ✗ | — | ✗ |
| Rendimiento | ✓ | ✓ | ✓ | ✗ | — | ✗ |
| Métricas del Mes | ✓ | ✓ | ✓ | ✗ | — | ✗ |
| Mantenimiento | ✓ | ✓ | ✓ | ✓ | — | ✗ |
| Página Web | ✓ | cond. (alias `isAdmin`) | ✗ | ✗ | — | ✗ |
| Empresas Aliadas | ✓ | cond. (alias `isAdmin`) | ✗ | ✗ | — | ✗ |
| Formularios dinámicos | ✓ | cond. (alias `isAdmin`) | ✗ | ✗ | — | ✗ |
| Solicitudes (inbox) | ✓ | cond. (alias `isAdmin`) | ✗ | ✗ | — | ✗ |
| Asistente IA (chat) | ✓ | ✗ | ✗ | ✗ | — | ✗ |
| Historial IA | ✓ | ✗ | ✗ | ✗ | — | ✗ |
| Personal | ✓ | ✓ | ✓ (lectura) | ✓ (lectura) | — | ✗ |
| Usuarios & Permisos | ✓ | ✓ | ✗ | ✗ | — | ✗ |
| Reporte de Ponches | ✓ | ✓ | ✗ | ✗ | — | ✗ |
| Configuración | ✓ | ✓ | ✗ | ✗ | — | ✗ |
| Plantillas Marketing | ✓ | ✗ | ✗ | ✗ | — | ✗ |
| Vista Técnico (`/tecnico`) | — | — | — | — | ✓ | ✗ |

**Total módulos del sidebar admin: 44** (sin contar Vista Técnico ni Ponche). Operaria toca ~17. Secretaria ~13. Coord ~36. Admin todos.

---

## 4) Top 5 redundancias detectadas

Pares de módulos con datos solapados. Foco en ítems de sidebar; las redundancias internas de un módulo (tabla vs tablero) no se cuentan.

### 4.1 Calendario × Calendarios — nombres casi idénticos, propósitos diferentes

- `/admin/calendario` (`Calendario.tsx`) → vista mes/semana/día de las **órdenes** y citas existentes. Equivalente a "agenda visual".
- `/admin/calendarios` (`Calendarios.tsx`) → catálogo de **calendarios públicos compartibles** (estilo Calendly), con un link `/cita/:calendarId` para que clientes agenden. Cada doc en `calendarios` define horarios disponibles, días laborales, color, técnico asignado.
- Síntoma: usuarios que buscan "agenda" se confunden entre los dos. La diferencia conceptual (uno consume datos, el otro genera links) no es obvia desde la etiqueta.

### 4.2 Dashboard × Agenda del Día × Órdenes × Calendario — cuatro vistas de las mismas órdenes

- `Dashboard.tsx` muestra órdenes del día como sección destacada + alertas + KPIs.
- `AgendaDia.tsx` lista secuencial por técnico para hoy.
- `Ordenes.tsx` (~1600 líneas, monolítica) tiene tablero kanban + lista filtrada con opción "hoy".
- `Calendario.tsx` mes/semana/día.

**Solapamiento concreto:** la coordinadora abre Dashboard para ver alertas, salta a Agenda del Día para ver la secuencia, vuelve a Órdenes para editar fase, y Calendario para chequear si hay choques. Cuatro paradas mentales para una misma decisión operativa.

### 4.3 Productos × Precios de Servicios × Inventario — tres catálogos coexistiendo

- `Productos.tsx` — catálogo legacy (servicio/repuesto/accesorio con `precio` único).
- `PreciosServicios.tsx` — catálogo nuevo de servicios con `precioMayoreo` y `precioDetalle` (estructura post-migración).
- `Inventario.tsx` — piezas con stock + precio de compra/venta + movimientos. Es el más rico.

**Solapamiento concreto:** una pieza de motor para nevera puede aparecer en los tres. Productos no se referencia desde Cotizaciones/Conduces nuevos (esos usan `ServicioPrecio` + `PiezaInventario`). Productos parece deuda histórica que sobrevive en sidebar (gate `ordenesVer` → operaria, secretaria también lo ven).

### 4.4 Citas por Confirmar × Solicitudes × Reprogramaciones — tres inboxes paralelos

- `Citas.tsx` → `citas_por_confirmar` (origen formulario público `AgendarPage`/`CitaPublica`).
- `Solicitudes.tsx` → `solicitudes` (origen formularios dinámicos B2B `/f/:slug`).
- `Reprogramaciones.tsx` → array `propuestasReprogramacion` dentro de `ordenes_servicio`.

Tres bandejas de entrada distintas con flujos similares (revisar → aprobar/convertir/rechazar). Visibilidad: Citas la ven todos, Solicitudes solo admin, Reprogramaciones solo admin/coord. Los items se procesan con UIs diferentes pero conceptualmente todos son "algo entrante esperando decisión".

### 4.5 Conduces de Garantía × Conduces Pendientes × Cotizaciones — pipeline fragmentado

- `Cotizaciones.tsx` → cotizaciones aprobadas o no (`QT-#####`).
- `FacturacionPendiente.tsx` → órdenes con `enviadaAFacturacion=true` y `facturada=false`. Es un pre-step antes del Conduce.
- `Facturas.tsx` → Conduces de Garantía finales (`CG-#####`/`FAC-#####`).

**Solapamiento concreto:** una orden cerrada pasa por las tres pantallas para terminar facturada. El usuario tiene que recordar qué módulo abre para qué etapa. Ninguno tiene un "siguiente paso" visible que conecte con el siguiente módulo del pipeline (excepto el botón "Procesar facturación" en Conduces Pendientes).

---

## 5) Top 5 áreas potencialmente confusas

### 5.1 Sidebar de admin con 44 ítems en 7 secciones

44 destinos clickeables visibles para admin. Aunque las secciones colapsables ayudan, sigue siendo un panel "muro" — el patrón observado en RETROs anteriores es que admin/coord saltan entre módulos sin saber dónde está el dato, y tienden a abrir múltiples pestañas para no perder contexto.

### 5.2 Etiqueta "Pendiente de piezas" UI vs identificadores `Standby`/`enStandby`/`standby_piezas`

La pantalla muestra "Pendiente de piezas" en el sidebar (por decisión de UX), pero internamente todo es `Standby` (página `Standby.tsx`, ruta `/admin/standby`, colección `standby_piezas`, flag de orden `enStandby`). Para usuarios técnicos que escuchen "standby" en una conversación con Jorge la búsqueda en el menú falla. La redundancia inversa también: el badge cuenta tanto `standby_piezas` como `ordenes_servicio.enStandby=true`, sumando dos cosas distintas en el mismo número.

### 5.3 "Conduces de Garantía" vs "Conduces Pendientes" vs "Facturas" (en código)

El sidebar dice "Conduces de Garantía" pero el componente se llama `Facturas.tsx`, la colección es `facturas`, los servicios son `factura.service` y los hooks `useFactura*`. La distinción interna entre `Factura` (entidad fiscal real, manejada por el otro software DGII) y `Conduce de Garantía` (este sistema) sólo está clara en CLAUDE.md/docs. El usuario nuevo que oye al jefe decir "fíjate en facturas" termina confundido.

### 5.4 Coordinadora vs Administrador — mismo sidebar pero con 2 ítems escondidos

Coord ve casi todos los ítems de admin, salvo Asistente IA y Plantillas Marketing. La razón histórica (admin maneja IA y campañas) es razonable, pero da la sensación de "permisos rotos" porque otros ítems aparentemente "más sensibles" (Bancos, Estado de Resultado, Préstamos) sí los ve. Además, items del bloque "Web y Solicitudes" están gateados con `isAdmin = esAdminOCoord` cuando la intención (según el comment de línea 277-280) parecería ser `rol=admin` literal. Esto requiere validación manual con Jorge antes de decidir si es bug o feature.

### 5.5 `/admin/usuarios` y `/admin/configuracion/usuarios` apuntan al mismo componente

Línea 235 y 255 de `App.tsx` ambas montan `<GestionUsuarios />`. El sidebar sólo expone `/admin/usuarios` ("Usuarios & Permisos"), pero la ruta `/admin/configuracion/usuarios` queda viva. Esto puede ser un redirect olvidado de un refactor previo, o una entrada de menú futura. Confunde al lector del routing y al motor de breadcrumbs si lo hubiera.

---

## 6) Apéndice — decisiones técnicas observadas

### 6.1 Por qué Standby es módulo aparte y no fase de orden

Existe el flag `OrdenServicio.enStandby` que sí actúa como "fase" lógica (orden pausada esperando piezas). Pero el módulo `/admin/standby` lista la **colección `standby_piezas`** — un registro independiente por pieza buscada (con su proveedor sugerido, fecha esperada, estado `buscando|importada|dificil|llego`). Una orden puede tener N piezas en standby. La separación tiene sentido cuando la búsqueda de piezas es paralela (varios proveedores, varias fechas), pero el badge del sidebar suma ambas vistas, y eso es lo que confunde.

### 6.2 Por qué Conduces y Facturas están separados (en realidad no lo están)

En este repo todo lo que se llama "factura" en código es lo que el negocio llama "Conduce de Garantía". La separación con la "factura DGII real" sucede en otro software autorizado (fuera del sistema), no acá. CLAUDE.md aclara esto. La etiqueta del sidebar "Conduces de Garantía" intenta puentear la confusión, pero el namespace interno (`facturas/`, `Factura`, `FacturaCrearModal`) sigue diciendo "factura" — coexistencia legacy.

### 6.3 Por qué Operaria/Secretaria ven Calendarios públicos

`Calendarios` (links Calendly) está gateado por `isAdmin || isOperaria || isSecretaria` — visible para los tres roles administrativos. La razón implícita: cualquiera de ellos puede generar un link rápido para un cliente. No es deuda; es feature.

### 6.4 Por qué Inventario no es una pestaña dentro de Productos

`Inventario.tsx` y `Productos.tsx` viven con propósitos diferentes pese al solapamiento conceptual (§4.3). Inventario maneja stock real con movimientos (`MovimientoInventario`), Productos era el catálogo simple original. La migración a `ServicioPrecio` (Precios) + `PiezaInventario` (Inventario) dejó Productos como deuda. No fue removido por riesgo de romper imports y referencias en flujos viejos (cotizaciones legacy podrían estar leyendo de ahí).

### 6.5 Por qué hay tres bandejas (Citas, Solicitudes, Reprogramaciones)

- **Citas** atienden el flujo original "público pide cita" (más volumen, más urgente).
- **Solicitudes** atienden formularios B2B con empresas aliadas (volumen bajo, requiere conversión a orden).
- **Reprogramaciones** son acciones del cliente sobre una orden existente (no son "nuevo trabajo", son "cambio de fecha de trabajo ya creado").

Conceptualmente diferentes, en práctica el operador que las procesa hace acciones similares. La separación es por origen de datos / colección.

### 6.6 Por qué Dashboard abre 6 listeners concurrentes

Trade-off explícito documentado en CLAUDE.md: el dashboard prioriza tiempo real (alertas, KPIs vivos) sobre eficiencia de lecturas. Cada onSnapshot apunta a una colección distinta (ordenes, citas, standby, facturas, gastos, personal). Es un costo aceptado por la naturaleza "centro de operaciones" de la pantalla.

### 6.7 Por qué Ponche no está bajo `/admin`

`/ponche` es la única página post-login accesible para `ayudante`. Si viviera bajo `/admin`, el `AyudanteRoute` lo bloquearía. Está aparte intencionalmente. Lo mismo con `/tecnico`: aterriza ahí cualquier usuario con rol `tecnico` y no entra al Layout admin.

### 6.8 Por qué hay rutas legacy redirigidas (`/dashboard` → `/admin/dashboard`)

Empleados podían tener bookmarks o links de WhatsApp con URLs viejas. Mantener los redirects evita 404s en el caso "envié el link el mes pasado por WhatsApp y todavía está vigente". Costo: 5 rutas extra en App.tsx con `<Navigate replace />`, sin riesgo.

---

## Cierre

- **44 ítems** en sidebar admin, **17** operaria, **13** secretaria, **0** técnico/ayudante.
- **5 redundancias detectadas** (Calendario×Calendarios, Dashboard/Agenda/Ordenes/Calendario, Productos/Precios/Inventario, 3 inboxes, pipeline factura).
- **5 áreas confusas** (volumen sidebar admin, Pendiente de piezas vs Standby, Conduces vs Facturas en código, Coord vs Admin con gating ambiguo en "Web y Solicitudes", `/admin/usuarios` duplicado).
- **2 inconsistencias menores que ameritan validar con Jorge antes de tocar:** (a) ¿"Web y Solicitudes" debería ser admin-only o admin+coord? Línea 277-280 vs gate de los items, (b) ¿`/admin/configuracion/usuarios` se quita o se redirige?

**Próximo paso (SPRINT-117b):** tomar este inventario como insumo y proponer mockup de sidebar reorganizado por rol, priorizando reducción de fricción en operaria/secretaria.
