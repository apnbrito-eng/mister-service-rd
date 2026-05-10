# Matriz de permisos granulares vs módulos del sidebar

> **Sprint:** SPRINT-124 (procesado autónomo, 2026-05-10).
> **Modo:** auditoría read-only. NO modifica código, modal, ni rules.
> **Pregunta que responde:** ¿el modelo declarado por Jorge — "los permisos vienen del módulo de usuarios" — cubre todos los módulos del sidebar, o hay módulos cuyo gating depende solo del rol?
> **Output:** tabla principal módulo → fuente de gating, hallazgos clave, lista de gaps, recomendaciones.

---

## 1) Inventario fuente

**Permisos granulares disponibles en TypeScript** (`src/types/index.ts:1158-1221`, interfaz `PermisosSistema`):

35 keys booleanas (required) — 29 expuestas en el modal "Editar Usuario" (`src/pages/GestionUsuarios.tsx:985-991`), **6 keys definidas pero NO expuestas en el modal**. Aparte hay 12 keys opcionales legacy de técnico (`tecnico*`, prefijadas), que viven en el editor de overrides técnico aparte y no se renderizan en este modal de checkboxes.
- `pagosRegistrar`
- `ordenesEnviarAFacturacion`
- `facturasCerrar`
- `bancosGestionar`
- `avancesGestionar`
- `clientesReactivacionGestionar`

Esto es relevante porque tienen defaults por rol pero NO se pueden personalizar persona-por-persona desde el modal.

**Roles del sistema** (`src/types/index.ts:1259-1304`):

| Rol | Default | Notas |
|---|---|---|
| `administrador` | TODO_TRUE | Sin restricciones. |
| `coordinadora` | TODO_TRUE menos `configuracionModificar` y `personalEliminar` | Casi-admin. |
| `operaria` | Subset operacional (órdenes/cotis/clientes/personal-ver/rendimiento/pagosRegistrar/ordenesEnviarAFacturacion/facturasVer) | |
| `secretaria` | Subset reducido (ordenes/clientes/personal-ver/pagosRegistrar) | |
| `tecnico` | Solo `ordenesVer` + flags legacy técnico | |
| `ayudante` | TODO_FALSE | |

**Helpers de gating en el código:**
- `puede(userProfile, accion)` (`src/utils/permisos.ts:58`) — chequea el permiso granular.
- `esAdminOCoord(userProfile)` (`src/utils/permisos.ts:87`) — rol-only (admin OR coord).
- Constantes locales en Sidebar.tsx:166-168: `esAdminOCoord`, `isOperaria` (operaria OR admin/coord), `isSecretaria` (secretaria OR admin/coord).

---

## 2) Tabla principal — módulo del sidebar → fuente de gating

> Una fila por ítem visible del sidebar. Fuente: `src/components/Sidebar.tsx:173-360`.
> Columna "Cobertura":
> - **granular** = el `show:` usa `puede('xxx')` con un permiso del modal.
> - **rol-only** = el `show:` usa rol (`esAdminOCoord`, `userProfile?.rol === '...'`) — NO controlable desde el modal.
> - **mixto** = el `show:` combina granular + rol con OR (basta cumplir uno).
> - **granular-no-modal** = usa `puede('xxx')` pero el permiso NO está expuesto en el modal.

| # | Módulo (label sidebar) | Ruta | Permiso granular del modal | Gate real en Sidebar.tsx (línea) | Gate en App.tsx (route) | Cobertura |
|---|---|---|---|---|---|---|
| 1 | Ponche | `/ponche` | (ninguno) | `show: true` (177) | `ProtectedRoute` solo | rol-only (todos) |
| 2 | Dashboard | `/admin/dashboard` | (ninguno) | `show: true` (182) | auth | rol-only (todos no-tec) |
| 3 | Citas por Confirmar | `/admin/citas` | `ordenesVer` | `p('ordenesVer')` (196) | auth | **granular** |
| 4 | Reprogramaciones | `/admin/reprogramaciones` | (ninguno aplicable) | `esAdminOCoord` (197) | `rol in [admin, coord]` (RolRoute) | **rol-only** |
| 5 | Sugerencias chequeo | `/admin/sugerencias-chequeo` | (ninguno aplicable) | `esAdminOCoord` (198) | `rol in [admin, coord]` | **rol-only** |
| 6 | Agenda del Día | `/admin/agenda-dia` | `ordenesVer` | `p('ordenesVer')` (211) | `PermisoRoute ordenesVer` | **granular** |
| 7 | Órdenes | `/admin/ordenes` | `ordenesVer` | `p('ordenesVer')` (212) | auth | **granular** |
| 8 | Calendario | `/admin/calendario` | `ordenesVer` | `p('ordenesVer')` (213) | auth | **granular** |
| 9 | Calendarios públicos (Calendly) | `/admin/calendarios` | (ninguno aplicable) | `esAdminOCoord OR isOperaria OR isSecretaria` (214) | auth | **rol-only** (cualquier no-tec) |
| 10 | Pendiente de piezas | `/admin/standby` | `ordenesVer` | `p('ordenesVer')` (215) | auth | **granular** |
| 11 | Mapa de Rutas | `/admin/mapa` | `ordenesVer` | `p('ordenesVer')` (216) | auth | **granular** |
| 12 | Cierre del Día | `/admin/cierre-dia` | `cierreDiaEjecutar` | `p('cierreDiaEjecutar')` (217) | `PermisoRoute cierreDiaEjecutar` | **granular** |
| 13 | Feedback NPS | `/admin/feedback` | (ninguno aplicable) | `esAdminOCoord` (218) | `rol in [admin, coord]` | **rol-only** |
| 14 | Historial Anuladas | `/admin/historial-anuladas` | `ordenesVerEliminadas` | `esAdminOCoord OR p('ordenesVerEliminadas')` (219) | `PermisoRoute ordenesVerEliminadas` | **mixto** (rol-only baipasea) |
| 15 | Mantenimiento | `/admin/mantenimiento` | `ordenesVer` | `p('ordenesVer')` (224) | auth | **granular** |
| 16 | Clientes | `/admin/clientes` | `clientesVer` | `p('clientesVer')` (231) | auth | **granular** |
| 16b | (tab) Reactivación de clientes | `/admin/clientes` tab interno | `clientesReactivacionGestionar` (key existe pero NO expuesta en modal) | `puede(userProfile, 'clientesReactivacionGestionar')` (Clientes.tsx:42) | tab interno | **granular-no-modal** |
| 17 | Cotizaciones | `/admin/cotizaciones` | `cotizacionesVer` | `p('cotizacionesVer')` (248) | `PermisoRoute cotizacionesVer` | **granular** |
| 18 | Conduces Pendientes | `/admin/facturacion-pendiente` | (`ordenesEnviarAFacturacion` existe pero NO en modal; sidebar gate por rol) | `esAdminOCoord` (249) | `rol in [admin, coord]` | **rol-only** (key granular no-modal disponible pero NO se usa) |
| 19 | Conduces de Garantía | `/admin/facturas` | `facturasVer` | `p('facturasVer')` (250) | `PermisoRoute facturasVer` | **granular** |
| 20 | Catálogo (legacy) | `/admin/productos` | (ninguno) | `show: false` HARDCODE (266) | auth (sigue accesible por URL) | **oculto en sidebar** (SPRINT-117c1, ruta pendiente eliminar — eso es SPRINT-121) |
| 21 | Inventario | `/admin/inventario` | `configuracionModificar` (parcial) | `p('configuracionModificar') OR rol=operaria OR esAdminOCoord` (267) | `PermisoRoute configuracionVer` | **mixto** |
| 22 | Equipos Taller | `/admin/taller` | `ordenesVer` | `p('ordenesVer')` (268) | auth | **granular** |
| 23 | Precios de Servicios | `/admin/precios` | `configuracionModificar` (parcial) | `esAdminOCoord OR p('configuracionModificar')` (269) | `PermisoRoute configuracionVer` | **mixto** |
| 24 | Gastos e Ingresos | `/admin/gastos` | `gastosVer` | `p('gastosVer')` (282) | `PermisoRoute gastosVer` | **granular** |
| 25 | Bancos | `/admin/bancos` | (`bancosGestionar` existe pero NO en modal) | `p('bancosGestionar')` (283) | `PermisoRoute bancosGestionar` | **granular-no-modal** |
| 26 | Nómina | `/admin/nomina` | (ninguno aplicable) | `esAdminOCoord` (284) | `rol in [admin, coord]` | **rol-only** |
| 27 | Avances a Empleados | `/admin/avances` | (`avancesGestionar` existe pero NO en modal) | `p('avancesGestionar')` (285) | `PermisoRoute avancesGestionar` | **granular-no-modal** |
| 28 | Préstamos a Empleados | `/admin/prestamos` | (ninguno aplicable) | `esAdminOCoord` (286) | `rol in [admin, coord]` | **rol-only** |
| 29 | Comisiones | `/admin/comisiones` | `configuracionVer` (parcial) | `esAdminOCoord OR p('configuracionVer')` (287) | `rol in [admin, coord]` (App.tsx) | **mixto** (rol-only en routing efectiva) |
| 30 | Estado de Resultado | `/admin/estado-resultado` | (ninguno aplicable) | `esAdminOCoord` (288) | `rol in [admin, coord]` | **rol-only** |
| 31 | Rendimiento / Mi rendimiento | `/admin/rendimiento` | `rendimientoVer` | `p('rendimientoVer')` (291) | `PermisoRoute rendimientoVer` | **granular** |
| 32 | Métricas del Mes | `/admin/metricas-mensuales` | `rendimientoVer` (parcial) | `p('rendimientoVer') OR esAdminOCoord` (292) | `PermisoRoute rendimientoVer` | **mixto** |
| 33 | Página Web | `/admin/web` | (ninguno aplicable) | `esAdminOCoord` (305) | `rol=admin` (RolRoute) | **rol-only** (sidebar admin+coord, ruta solo admin → coord ve link roto) |
| 34 | Empresas Aliadas | `/admin/empresas-aliadas` | (ninguno aplicable) | `esAdminOCoord` (306) | `rol=admin` | **rol-only** (mismo gap admin vs coord) |
| 35 | Formularios | `/admin/formularios` | (ninguno aplicable) | `esAdminOCoord` (307) | `rol=admin` | **rol-only** (mismo gap) |
| 36 | Solicitudes | `/admin/solicitudes` | (ninguno aplicable) | `esAdminOCoord` (308) | `rol=admin` | **rol-only** (mismo gap) |
| 37 | Chat IA (pantalla completa) | `/admin/asistente` | (ninguno aplicable) | `rol === 'administrador'` (321) | `rol=admin` | **rol-only** (solo admin) |
| 38 | Historial IA | `/admin/asistente/historial` | (ninguno aplicable) | `rol === 'administrador'` (322) | `rol=admin` | **rol-only** (solo admin) |
| 39 | Personal | `/admin/personal` | `personalVer` | `p('personalVer')` (339) | `PermisoRoute personalVer` | **granular** |
| 40 | Usuarios & Permisos | `/admin/usuarios` | `personalModificar` (semánticamente reusado) | `p('personalModificar')` (340) | `rol in [admin, coord]` (RolRoute) | **mixto** (gate sidebar granular, gate ruta rol-only — routing manda) |
| 41 | Reporte de Ponches | `/admin/ponches` | (ninguno aplicable) | `esAdminOCoord` (341) | `rol in [admin, coord]` | **rol-only** |
| 42 | Configuración | `/admin/configuracion` | `configuracionVer` | `p('configuracionVer')` (355) | `PermisoRoute configuracionVer` | **granular** |
| 43 | Plantillas Marketing | `/admin/configuracion-marketing` | (ninguno aplicable) | `rol === 'administrador'` (356) | `rol=admin` | **rol-only** (solo admin) |

Notas sobre ítems que el sprint pidió revisar:
- **"Marketing/Campañas"** mencionado en notas del sprint — no existe como ítem standalone del sidebar. Lo más cercano es **Plantillas Marketing** (`/admin/configuracion-marketing`, fila 43, solo admin) + tab **Reactivación** dentro de Clientes (fila 16b).

---

## 3) Hallazgos clave (conteos)

**De 43 filas mapeadas en la tabla** (los 42 ítems "vivos" del sidebar + el tab Reactivación dentro de Clientes; el #20 Catálogo está oculto):

| Cobertura | Conteo | Lista |
|---|---|---|
| **granular** (controlable desde el modal hoy) | 16 | Citas, Agenda del Día, Órdenes, Calendario, Pendiente de piezas, Mapa, Cierre del Día, Mantenimiento, Clientes, Cotizaciones, Conduces de Garantía, Equipos Taller, Gastos, Personal, Rendimiento, Configuración |
| **mixto** (granular + rol con OR) | 6 | Historial Anuladas, Inventario, Precios, Comisiones, Métricas del Mes, Usuarios & Permisos |
| **rol-only** (NO controlable desde el modal) | 18 | Ponche, Dashboard, Reprogramaciones, Sugerencias chequeo, Calendarios públicos, Feedback NPS, Conduces Pendientes, Nómina, Préstamos, Estado de Resultado, Página Web, Empresas Aliadas, Formularios, Solicitudes, Chat IA, Historial IA, Reporte de Ponches, Plantillas Marketing |
| **granular-no-modal** (key TypeScript existe pero modal no la expone) | 3 | Reactivación de clientes (`clientesReactivacionGestionar`), Bancos (`bancosGestionar`), Avances (`avancesGestionar`) |
| **oculto / legacy** | 1 | Catálogo (`/admin/productos`) |

> Nota: 16 granular + 6 mixto + 18 rol-only + 3 granular-no-modal + 1 oculto/legacy = 44, suma >43 porque el tab Reactivación de Clientes aparece tanto bajo "Clientes" (granular) como bajo su propia entrada granular-no-modal (16b). Resta uno por solapamiento → 43.

**Resumen ejecutivo:**

- **16 módulos están bajo el control granular del modal.** Son la mayoría del flujo operacional (órdenes, cotizaciones, facturas, clientes, personal, configuración).
- **18 módulos dependen 100% del rol** — para quitarle el acceso a uno de ellos a una operaria específica, hoy hay que cambiarle el rol o tocar código. NO se puede desde el modal.
- **3 módulos están en limbo:** tienen permiso granular definido en TypeScript con su default por rol, pero el modal no los expone. Resultado: los defaults SÍ funcionan (operaria no ve Avances porque default es false), pero Jorge no puede excepcionalmente dárselo a una operaria sin cambiar código.
- **6 módulos tienen gating mixto** — el sidebar muestra el ítem por OR (granular OR rol). En la práctica, el rol "gana" cuando se cumple porque baipasea el granular. El modal solo puede *agregar* acceso, no *quitarlo* a admin/coord.

---

## 4) Gaps entre regla declarada y realidad

**Regla declarada:** "los permisos se dan desde el módulo de usuarios donde se debe quitar o dar permisos a cada módulo dependiendo de su función".

**Realidad observable:**

### 4.1 Módulos rol-only con sensibilidad real (Jorge podría querer controlar persona-por-persona)

Ordenados por probabilidad estimada de que Jorge quiera control granular:

| Módulo | Quién lo ve hoy | Por qué podría querer control granular |
|---|---|---|
| **Reprogramaciones** | admin + coord | Manejar propuestas del cliente afecta agenda — una coord junior podría no estar lista para decidir. |
| **Sugerencias chequeo** | admin + coord | Aprobar/rechazar sugerencias del técnico tiene impacto en comisión + relación con cliente. Mismo caso anterior. |
| **Feedback NPS** | admin + coord | Lectura de feedback expuesto a operarias podría ayudar a aprender; restringir solo a coord es elección. |
| **Conduces Pendientes** | admin + coord | Decidir qué se factura en DGII es sensible — admin podría querer dejar solo a UNA coord específica. |
| **Nómina** | admin + coord | Ver lo que gana cada empleado es PII sensible; coord nueva o de prueba podría no ver. |
| **Préstamos** | admin + coord | Decisión financiera personal con empleados. |
| **Estado de Resultado** | admin + coord | P&L mensual. Pública para coord podría no ser deseable. |
| **Reporte de Ponches** | admin + coord | Audit de asistencia — coord junior podría no necesitarlo. |
| **Página Web / Empresas Aliadas / Formularios / Solicitudes / Plantillas Marketing** | solo admin (ruta), admin + coord (sidebar muestra link roto a coord) | Sin uso operativo cotidiano, restringido a admin tiene sentido. **Bug menor:** sidebar muestra link a coord pero la ruta lo rechaza con `RolRoute roles={['administrador']}` → coord ve item, hace click, navega a `/login` o `/admin` por el RolRoute. |
| **Chat IA / Historial IA** | solo admin | Consistente — el toggle `habilitarAsistenteIA` del modal NO impacta esta visibilidad del sidebar (solo rol). |

### 4.2 Módulos en "granular-no-modal" — keys existen pero no se pueden tocar desde el modal

Son los más fáciles de "arreglar" si Jorge quiere control granular: ya están las keys, solo falta exponerlas en el modal de `GestionUsuarios.tsx:985-991`.

| Módulo | Key TypeScript | Default por rol |
|---|---|---|
| **Reactivación de clientes** (tab dentro de Clientes) | `clientesReactivacionGestionar` | admin true, coord true, resto false |
| **Bancos** | `bancosGestionar` | admin true, coord true, resto false |
| **Avances a Empleados** | `avancesGestionar` | admin true, coord true, resto false |

Hay además **3 keys más** definidas en TypeScript que el modal NO expone y que NO tienen módulo dedicado en el sidebar (son flags de acción dentro de otras páginas):

| Key | Uso |
|---|---|
| `pagosRegistrar` | Permite registrar un pago en una factura desde Conduces. |
| `ordenesEnviarAFacturacion` | Permite mover una orden cerrada al inbox de facturación. |
| `facturasCerrar` | Permite cerrar (emitir/imprimir) un conduce. |

Son granulares dentro del flujo Cobranza → expandirlos sería más complejo (requiere granularidad finer en Facturas/Conduces).

### 4.3 Bugs / inconsistencias menores cazados como vector colateral

> **NO arreglar en este sprint** (es read-only). Lista para futuros sprints follow-up acotados.

1. **Coord ve links rotos en sidebar para Web / Empresas Aliadas / Formularios / Solicitudes.** El sidebar usa `esAdminOCoord` (admin+coord), pero la ruta usa `RolRoute roles={['administrador']}`. Una coord que hace click recibe redirect. Patrón en 4 ítems consecutivos. Fix: o gatear el sidebar a admin only (alinear con la ruta), o expandir RolRoute a `[admin, coord]` (alinear con sidebar).
2. **Comisiones tiene gating doble inconsistente.** Sidebar: `esAdminOCoord OR p('configuracionVer')` (operaria con configuracionVer custom vería el item). Ruta: `rol in [admin, coord]` (operaria con configuracionVer custom recibe redirect al hacer click). El gate del sidebar miente.
3. **Usuarios & Permisos tiene gating doble inconsistente.** Sidebar: `p('personalModificar')` (operaria con `personalModificar=true` vería el item). Ruta: `RolRoute roles={['admin, coord]}` (la rechazaría). El gate del sidebar miente.

---

## 5) Recomendaciones (NO decisiones — Jorge decide)

> El builder NO modifica el modal. Estas son opciones a poner sobre la mesa.

### Opción A — minimal: exponer las 3 keys "granular-no-modal" con módulo

Esfuerzo: muy bajo (3 líneas en `GestionUsuarios.tsx:985-991`).
Cubre: Bancos, Avances, Reactivación de clientes.
Pega: Jorge gana control persona-por-persona de 3 módulos sensibles sin tocar otra arquitectura.

Concretamente: agregar a la sección "Otros" del modal:
```ts
{ titulo: 'Otros', keys: [..., 'clientesReactivacionGestionar', 'bancosGestionar', 'avancesGestionar'] },
```
o crear una nueva sección "Finanzas y Marketing".

### Opción B — moderado: agregar keys nuevas para los rol-only sensibles

Esfuerzo: medio. Toca `PermisosSistema`, defaults de los 6 roles, el modal, y el `show:` de cada ítem en el sidebar + sus `RolRoute` en `App.tsx`.

Buenos candidatos por sensibilidad:
- `reprogramacionesGestionar`
- `sugerenciasChequeoGestionar`
- `nominaVer`
- `prestamosGestionar`
- `estadoResultadoVer`
- `ponchesVer`

Cada key nueva implica decisión consciente sobre los defaults de los 6 roles. Riesgo: si default es laxo, se abre acceso a quien no debería. Si default es restrictivo, hay que recordar habilitárselo a la coord existente caso a caso.

### Opción C — refactor más profundo: `modulosHabilitados: string[]` por usuario

Esfuerzo: alto. Reemplaza el flag-por-flag con una lista declarativa de módulos que el usuario ve. Pega: mucho más limpio conceptualmente, escala bien con módulos nuevos. Contra: migración de datos sobre todos los usuarios existentes (>500 docs probable → BLOQUEO).

NO recomendada hoy salvo que Jorge quiera invertir 2-3 sprints en arquitectura de permisos.

### Opción D — no hacer nada, dejar la realidad como está

Esfuerzo: cero.
Argumento: los 17 módulos rol-only son funcionalmente "para admin/coord siempre", y para los granular-no-modal los defaults por rol cubren el 99% de los casos. Jorge cambia de rol al empleado si quiere bloquear.
Contra: si en el futuro hay 2 coords y solo una debe ver Nómina (ejemplo), la única forma es cambiar el rol de la otra a "secretaria" o equivalente, perdiendo otros permisos por el camino.

---

## 6) Conclusión

La regla declarada de Jorge **se cumple parcialmente, no totalmente**. Hoy, sobre 43 filas mapeadas:

- **37%** (16/43) son controlables persona-por-persona desde el modal (granular puro).
- **51%** (22/43) son controlables si contamos los 6 "mixtos" donde la operaria/secretaria SÍ puede recibir acceso vía granular (aunque admin/coord siempre lo tengan por rol).
- **42%** (18/43) son **NO controlables** desde el modal — solo cambiando el rol del empleado.
- **7%** (3/43) tienen key TypeScript lista pero el modal no las expone — son los "gaps low-hanging" de la Opción A.

Esto NO es un bug — es una decisión arquitectural histórica. La pregunta para Jorge es:

> **¿Querés que los 3 módulos "granular-no-modal" (Bancos, Avances, Reactivación) sean controlables desde el modal con un sprint chiquito (Opción A)?**

Si la respuesta es sí → SPRINT-125 (riesgo bajo, ~5 líneas de código). Si la respuesta es no → cerrar el ciclo acá y avanzar con la cola.

**El resto de los módulos rol-only requieren decisiones de granularidad caso por caso** (Opción B), o un refactor mayor (Opción C). NO recomendado hacerlo sin pedido explícito de Jorge.

---

## Apéndice — Archivos consultados (trazabilidad)

- `src/components/Sidebar.tsx` (estructura completa del menú, líneas 173-360).
- `src/App.tsx` (gating de rutas, líneas 132-273; `PermisoRoute` y `RolRoute`).
- `src/utils/permisos.ts` (helper `puede()`, `esAdminOCoord()`).
- `src/types/index.ts:1158-1304` (interfaz `PermisosSistema` + 6 defaults por rol).
- `src/pages/GestionUsuarios.tsx:985-991` (lista de checkboxes del modal).
- `src/pages/Clientes.tsx:42,212-213,376-381` (gating tab Reactivación).
- `docs/sprints/AUDITORIA_IA_2026-05-08.md` (inventario previo de rutas + sidebar por rol).
- Commits relevantes recientes: `759a76b` (117c1), `9f71883` (117c2), `9c262c9` (117c3), `480532f` (117c4), `9b5aee2` (117c6).

