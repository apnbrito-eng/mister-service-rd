# Mapa de dependencias entre módulos

> **⚠️ Fuente única del mapa estructural:** `docs/mapa/MAPA_MENTAL.yaml` (mantenido por el agente `cartografo`, regenerable con `npm run mapa`). Este doc dejó de ser la fuente de "qué módulo depende de cuál" — ahora es **lector** del YAML y conserva las **notas humanas sobre patrones de consumo cross-archivo** (quién importa qué helper, qué tabla hace qué query, etc.) que el YAML no captura. Si encontrás contradicción entre este doc y el YAML, **gana el YAML** y se reporta al `cartografo`.
>
> **Propósito:** prevenir que una modificación rompa silenciosamente otro módulo. Antes de tocar un campo, función o componente compartido, identificar quién lo consume.
>
> **Cuándo consultar este doc:**
>
> 1. Al escribir un sprint que modifica una colección de Firestore, un type/interface, o un helper compartido.
> 2. Al hacer un fix puntual sobre un archivo "grande" (Ordenes.tsx, AgendaDia.tsx, etc.).
> 3. Antes de renombrar o eliminar un campo del modelo.
> 4. Antes de cambiar la firma de una función exportada.
>
> **Origen:** SPRINT-147 (2026-05-12) post-auditoría SPRINT-145. La auditoría reveló que sin un mapa, los sprints quedan con cambios faltantes (caso AgendaDia: 4 cambios mapeados, 2 críticos faltantes).
>
> **Cómo mantenerlo vivo:** cada sprint que toca un módulo aquí listado debe actualizar la sección correspondiente con la fecha + sprint que disparó el cambio. Si una sección queda desactualizada >30 días, sospechar.

---

## Cómo regenerar las listas (un comando)

En lugar de mantener listas exhaustivas a mano (que envejecen mal), corré estos `grep` para regenerar al momento. Resultados son fiel reflejo del estado actual del codebase.

```bash
cd ~/Desktop/mister-service-rd

# Archivos que LEEN una colección
grep -rl "collection(db, ['\"]<COLECCION>['\"])" src/

# Archivos que ESCRIBEN una colección (suma exhaustiva)
grep -rEl "(updateDoc|setDoc|addDoc|deleteDoc|writeBatch|runTransaction)\(.{0,100}<COLECCION>" src/

# Quién usa un campo específico
grep -rn "\.<CAMPO>" src/ --include="*.ts" --include="*.tsx"

# Quién importa un helper
grep -rn "from.*'.*<NOMBRE_FILE_SIN_EXT>'" src/

# Quién recibe un type como param o retorno
grep -rn ": <TYPE>" src/ --include="*.ts" --include="*.tsx"
```

---

## Modelos core

### `ordenes_servicio` — el corazón del sistema

**Estado del mapa:** 2026-05-12 (SPRINT-147).

**Lectores (50 archivos):**
Demasiados para listar; el grep arriba los devuelve. **Puntos críticos** de lectura:
- `src/pages/AgendaDia.tsx` — agrupa por técnico, filtra por fecha de cita
- `src/pages/Ordenes.tsx` — listado principal con filtros y kanban
- `src/pages/Dashboard.tsx` — KPIs y alertas
- `src/pages/MapaRutas.tsx` — visualización geográfica
- `src/pages/TecnicoVista.tsx` — vista mobile del técnico
- `src/pages/Rendimiento.tsx` — métricas por persona
- `src/pages/Comisiones.tsx` — cálculo de comisiones
- `src/services/nomina.service.ts` — agregaciones para nómina
- `src/services/gps.service.ts` — tracking GPS por orden

**Escritores (29 archivos) — auditados 2026-05-12:**

| Archivo | Campos que escribe | Disparado por |
|---|---|---|
| `src/hooks/useOrdenCreateForm.ts` | crear orden completa, deriva operariaId desde técnico | Cliente público o operaria |
| `src/components/ordenes/ModalEditarOrdenAdmin.tsx` | edita campos del cliente, equipo, agendamiento, precios | Admin |
| `src/components/ordenes/OrdenCard.tsx` | acción rápida desde la card | Admin/Coord/Oper |
| `src/components/ordenes/FaseStepper.tsx` | `fase`, `historialFases`, `auditoria` | Admin/Coord |
| `src/components/ordenes/OrdenesTablero.tsx` | `fase` (drag&drop kanban) | Admin/Coord |
| `src/components/ordenes/IniciarChequeoButton.tsx` | `inicioChequeo`, `fase: 'en_diagnostico'` | Técnico |
| `src/components/CierreServicioWizard.tsx` | `cierreServicio`, `fase: 'trabajo_realizado'`, `periodoGarantiaDias`, `garantiaVencimiento` | Técnico |
| `src/components/ordenes/EnviarFacturacionButton.tsx` | `enviadaAFacturacion`, `enviadaAFacturacionPorId` | Admin/Coord/Oper |
| `src/components/facturacion-pendiente/ProcesarFacturacionModal.tsx` | `facturada`, `facturaId`, `facturaNumero` + crea doc en `facturas/` | Admin/Coord |
| `src/components/ordenes/RegistrarPagoModal.tsx` | `pagos[]`, `montoPagado`, `estadoPago` | Admin/Coord/Oper |
| `src/components/ordenes/CancelarOrdenModal.tsx` | `fase: 'cancelado'`, `motivoCancelacion` | Admin |
| `src/components/ordenes/EliminarOrdenModal.tsx` | `eliminada: true` (soft delete) | Admin |
| `src/components/ordenes/ReagendarModal.tsx` | `fechaCita`, `reagendada: true`, `propuestasReprogramacion[]` | Admin/Coord/Oper |
| `src/components/ordenes/EnviarPortalButton.tsx` | `tokenPortalCliente`, `portalClienteEnviado` | Admin/Coord |
| `src/components/cierre/ModalEditarPiezasOrden.tsx` | `cierreServicio.piezasUsadas`, `costoPiezasTotal` | Admin |
| `src/pages/OrdenDetalle.tsx` | "marcar solo chequeo" → `soloChequeo`, `fase: 'cerrado'` directo | Admin (atajo) |
| `src/pages/AgendaDia.tsx` | "marcar solo chequeo" + "aprobar precio inline" | Admin desde agenda |
| `src/pages/MapaRutas.tsx` | drag&drop reasigna `tecnicoId`, `operariaId` | Admin |
| `src/pages/Standby.tsx` | `enStandby`, `standbyMotivo`, `standbyHasta` | Admin/Coord |
| `src/pages/TecnicoVista.tsx` | acciones de técnico sobre sus órdenes | Técnico |
| `src/pages/CierreDia.tsx` | `efectivoEntregado`, `efectivoEntregadoPor` | Admin |
| `src/pages/Mantenimiento.tsx` | crea orden desde mantenimiento vencido (`addDoc`) | Sistema |
| `src/pages/Cotizaciones.tsx` | vincula `cotizacionId` a orden | Admin/Coord |
| `src/pages/Configuracion.tsx` | configuración bulk (raro) | Admin |
| `src/pages/HistorialAnuladas.tsx` | restaurar orden eliminada | Admin |
| `src/services/ordenes.service.ts` | helper `resincronizarOperariaEnOrden` (SPRINT-130) | Admin desde edit |
| `src/services/piezas.service.ts` | piezas usadas en cierre | Sistema |
| `src/services/solicitudes.service.ts` | convertir solicitud pública a orden | Sistema desde form público |
| `src/utils/comisiones.ts` | flags de comisión calculada | Sistema |
| `src/utils/cleanFirestore.ts` | utility de limpieza (NO usar en prod) | Dev |
| `src/firebase/seedData.ts` | seed de desarrollo (NO ejecutar en prod) | Dev |

**Campos críticos del modelo y sus reglas:**
Ver `docs/CAMPOS_CROSS_COLLECTION.md` para los campos que apuntan a otras colecciones (tecnicoId, operariaId, clienteId, facturaId, etc.).

**Antes de tocar `ordenes_servicio`:**
1. Identificá si el cambio toca un campo cross-collection → consultar `CAMPOS_CROSS_COLLECTION.md`.
2. Si afecta lectura: revisar al menos los 5 puntos críticos arriba.
3. Si afecta escritura: revisar TODOS los escritores que tocan el mismo campo.
4. Si afecta `fase`: revisar la tabla de transiciones de fase en `CAMPOS_CROSS_COLLECTION.md`.

---

### `personal` — empleados con o sin acceso al sistema

**Estado del mapa:** 2026-05-12 (SPRINT-147).

**Puntos críticos de lectura:**
- `src/pages/PersonalPage.tsx` — CRUD principal (1122 líneas post-SPRINT-142)
- `src/pages/Ordenes.tsx`, `AgendaDia.tsx`, `MapaRutas.tsx` — dropdowns de asignación
- `src/services/nomina.service.ts` — lookups para nómina
- `src/services/recordatorios.service.ts` — recordatorios por operaria

**Puntos críticos de escritura:**
- `src/pages/PersonalPage.tsx` — alta, edición, eliminación con transferencia atómica de órdenes (SPRINT-133)
- `src/components/personal/FormAltaEditarEmpleado.tsx` — formulario alta/edición

**Invariante crítico (P-004):** Toda alta de empleado con acceso al sistema crea AMBOS docs:
- `personal/{auto-id}` con campo `uid` que apunta al auth.uid
- `usuarios/{uid}` espejo

Romper este invariante = permission-denied silencioso. Ver `docs/PATRONES_REGRESION.md` P-004 y cazador en `scripts/invariantes/check-alta-empleado-doble-doc.ts`.

---

### `usuarios` — espejo de personal para roles con auth

**Estado del mapa:** 2026-05-12.

**Lectores:**
- `src/context/AppContext.tsx` — cascade de carga del userProfile (PRIMARIO)
- Fallback: si `usuarios/{uid}` no existe, carga `personal where email==`

**Escritores:**
- `src/pages/PersonalPage.tsx` y `FormAltaEditarEmpleado.tsx` — alta + dar acceso a existente

**Invariante:** `usuarios.id === auth.uid` siempre. NO se permite auto-id. Si el espejo falla en alta, la operación se aborta antes de crear `personal/`. Ver SPRINT-105 (commit que estableció el patrón).

---

### `facturas` — conduces de garantía (CG-#####)

**Estado del mapa:** 2026-05-12.

**Puntos críticos de lectura:**
- `src/pages/Facturas.tsx` — listado
- `src/pages/FacturacionPendiente.tsx` — bandeja de conduces pendientes
- `src/pages/Comisiones.tsx` — cálculo por factura
- `api/garantia/[token].ts` — endpoint público del countdown
- `src/services/nomina.service.ts` — totales mensuales

**Puntos críticos de escritura:**
- `src/components/facturacion-pendiente/ProcesarFacturacionModal.tsx` — único punto donde se crea `facturas/{id}` (lo único que escribe en producción)
- `src/components/facturas/FacturaCrearModal.tsx` — flow alternativo (revisar si vivo o legacy)

**Campos relacionados con garantía:**
- Modelo viejo: `factura.garantia.{token, tiempoDias, finFecha, inicioFecha, estado}` — sigue en uso.
- Modelo nuevo (SPRINT-135a): `orden.periodoGarantiaDias`, `orden.garantiaVencimiento` — coexiste, el endpoint público prefiere el nuevo si está poblado.

---

### `clientes`

**Estado del mapa:** 2026-05-12.

**Puntos críticos:**
- `src/pages/Clientes.tsx` — CRUD
- `src/services/clientes.service.ts` — wrapper con normalización de teléfono
- `src/hooks/useOrdenCreateForm.ts` — autocomplete + crea cliente si no existe

**Invariante:** teléfono se normaliza con helper `normalizarTelefono` (10 dígitos sin 1 leading). NO escribir teléfono crudo. Ver `src/utils/index.ts`.

---

## Componentes "grandes" con muchas dependencias

Estos archivos son intencionalmente monolíticos. Modificarlos requiere extra cuidado por la cantidad de cosas que tocan.

| Archivo | Líneas | Toca |
|---|---|---|
| `src/pages/Ordenes.tsx` | ~1600 | listado, filtros, kanban, modales internos. NO refactorizar oportunistamente (sub-regla CLAUDE.md). |
| `src/pages/PersonalPage.tsx` | ~1122 | post-SPRINT-142 ya está limpio. Mantenerlo así. |
| `src/pages/MapaRutas.tsx` | ~1267 | mapa, drag&drop, GPS, asignación. Cuidado con bugs P-006. |
| `src/pages/Configuracion.tsx` | ~1102 | configuración global. Cambios deben respaldarse con rollback claro. |
| `src/pages/Dashboard.tsx` | grande | ~6 onSnapshot concurrentes (gotcha CLAUDE.md). Evitar agregar más listeners. |
| `src/pages/OrdenDetalle.tsx` | grande | render de la orden con todas sus acciones. Path crítico — modificar con tests visuales. |

---

## Hooks y helpers compartidos

| Helper | Importadores típicos | Ojo con |
|---|---|---|
| `src/utils/index.ts` (`parseOrden`, `faseLabel`, `crearRegistroAuditoria`, etc.) | Casi todo el código | Cambiar firmas requiere barrido completo de imports |
| `src/utils/permisos.ts` (`puede`) | Todas las páginas admin + Sidebar | Si cambia una key de permiso, romper el barrido |
| `src/services/notificaciones.service.ts` (`crearNotificacion`) | ~15 callers | Field `userId` (NO `destinatarioId`) — gotcha CLAUDE.md, cazador P-007 |
| `src/services/contadores.service.ts` | Cualquier flow que genere OS/QT/FAC# | TRANSACCIONAL — no replicar la lógica fuera |
| `src/context/AppContext.tsx` | Toda la app | Cualquier cambio en cascade de carga rompe permisos. Ver gotcha "userProfile.id NO siempre es auth.uid" |

---

## Checklist mínimo antes de escribir un sprint

Antes de redactar un sprint que toca código, completar esto:

- [ ] **Símbolos/campos/funciones afectadas:** listar concretamente (ej: `tecnicoId`, `crearNotificacion`, `<option value=...>`).
- [ ] **Grep de consumidores:** correr `grep -rn "<SIMBOLO>" src/` y listar archivos resultantes.
- [ ] **Categorizar consumidores:** lectores vs escritores. Lectores afectados por cambios de shape; escritores por cambios de regla.
- [ ] **Identificar hallazgos laterales:** bugs latentes descubiertos en el grep pero fuera de scope del sprint actual. Documentarlos como deuda para sprint futuro.
- [ ] **Decidir si el alcance es viable:** si la auditoría revela >5 consumidores con cambios concretos, dividir en fases.
- [ ] **Touch-list expandido en el sprint:** declarar archivos a modificar + consumidores verificados (read-only check).

Esto NO reemplaza al archivist PRE-CHANGE (histórico) — es complementario (actual).
