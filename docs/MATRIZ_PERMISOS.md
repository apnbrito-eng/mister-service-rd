# Matriz de permisos por flujo crítico × rol

> **Sprint:** SPRINT-112 fase documental (procesado autónomo, 2026-05-10).
> **Modo:** auditoría doc-only. NO modifica código, modal, ni rules.
> **Pregunta que responde:** ¿qué puede hacer cada rol en cada flujo crítico de negocio? ¿Lo que el código permite coincide con lo que la matriz declara?
> **Output:** tabla `flujo crítico × 6 roles` con ✓ / ✗ / cond + cita exacta de gate de UI y de rule de Firestore.
> **Componente humano (NO procesado):** QA manual de cada celda con un usuario real de cada rol → BLOQUEOS.md.

---

## Doc complementario

Este documento es **por flujo de negocio** (vertical: "crear orden", "facturar", etc.).

El documento de SPRINT-124 (`docs/MATRIZ_PERMISOS_VS_MODULOS.md`) es **por módulo del sidebar** (vertical: "Dashboard", "Reactivación", etc.).

Ambos miran el mismo sistema desde dos ángulos. Si los dos coinciden en su columna del rol X, el sistema es consistente. Si difieren para algún flujo, hay un gap entre lo que la UI muestra y lo que la rule deja hacer.

---

## Convenciones de la matriz

| Símbolo | Significado |
|---|---|
| ✓ | El rol puede ejecutar el flujo (UI lo deja Y rule lo permite, ambos confirmados). |
| ✗ | El rol NO puede ejecutar el flujo (la UI lo oculta O la rule lo rechaza, alguno bloquea). |
| cond | Condicional. Funciona solo si se cumple un predicado documentado en la celda. |
| ? | No verificado en este sprint. Requiere QA humano. |

**Roles del sistema** (def. en `src/types/index.ts`, `src/utils/permisos.ts`, `firestore.rules:60-103`):

- `administrador` — TODO_TRUE (sin restricciones).
- `coordinadora` — TODO_TRUE menos `configuracionModificar` y `personalEliminar`.
- `operaria` — Subset operacional (oficina sin facturación cerrada).
- `secretaria` — Subset reducido (recepción + clientes + pagos básicos).
- `tecnico` — Solo `ordenesVer` + flags legacy técnico.
- `ayudante` — TODO_FALSE.

---

## Tabla principal — flujo crítico × rol

> Una fila por flujo de negocio observable en la app. Columna de cada rol con ✓/✗/cond.
> Notas al pie con la cita exacta del gate (ruta archivo:línea) cuando hay matiz.

| # | Flujo crítico | Admin | Coord | Operaria | Secretaria | Técnico | Ayudante | Notas |
|---|---|---|---|---|---|---|---|---|
| 1 | **Crear orden de servicio** | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | UI: `puede('ordenesCrear')` (Ordenes.tsx:753). Rule: `esStaffOficina()` — admin/coord/secretaria/operaria. Técnico/ayudante bloqueados en UI Y en rule. |
| 2 | **Modificar orden propia (técnico)** | ✓ | ✓ | ✓ | ✓ | cond | cond | Rule: `esStaffOficina()` (oficina abierta) O bien `tecnicoId == request.auth.uid && noTocaCamposAprobacion && noTocaAsignacion && noTocaSoloChequeo && respetaSugerenciaSoloChequeo` (firestore.rules:351-365). cond = solo si la orden le está asignada. |
| 3 | **Iniciar chequeo (técnico)** | n/a | n/a | n/a | n/a | cond | cond | Es flujo de campo. `IniciarChequeoButton.tsx`. Rule pasa por #2 (modificar orden propia). cond = orden asignada al técnico/ayudante autenticado. P-006 cubierto: `tecnicoId` ahora guarda `auth.uid`. |
| 4 | **Sugerir solo chequeo (técnico)** | n/a | n/a | n/a | n/a | cond | ✗ | Solo técnico desde `ModalSugerirSoloChequeo.tsx`. Rule `respetaSugerenciaSoloChequeo()` (firestore.rules:178-200): puede agregar al array, NO modificar/quitar entries existentes. Ayudante: el componente solo se renderiza si rol técnico (verificar — actualmente abierto a ayudante también, pendiente confirmar). |
| 5 | **Aprobar/rechazar sugerencia solo chequeo** | ✓ | ✓ | ✓ | cond | ✗ | ✗ | UI: `esAdminOCoord` o página de oficina. Rule: `esStaffOficina()` cubre el campo `soloChequeo` (oficina lo setea al aprobar). Operaria también puede. Secretaria: condicional (depende de si la página la deja entrar). |
| 6 | **Cotizar (crear cotización)** | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | UI: `puede('cotizacionesCrear')`. Rule cotizaciones: `esStaffOficina() & cotizacionesCrear` (firestore.rules:403-410). Secretaria default false. Técnico/ayudante false en defaults. |
| 7 | **Aprobar precio de cotización** | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | UI: `puede('cotizacionesAprobarPrecio')`. Default operaria true; secretaria/tec/ay false. |
| 8 | **Marcar trabajo realizado (cerrar técnico)** | ✓ | ✓ | ✓ | ✓ | cond | cond | Rule: `intentaTrabajoRealizado()` requiere `ordenAprobada()` previa para técnico/ayudante (firestore.rules:351-365). cond = solo si orden ya está `estadoAprobacion=aprobado`. Oficina sin restricción. |
| 9 | **Cerrar servicio con foto + checklist** | ✓ | ✓ | ✓ | cond | cond | cond | UI: wizard `CierreServicio*`. Rule: pasa por #8. cond para oficina-secretaria depende de la página (verificar). |
| 10 | **Crear conduce (factura interna CG-####)** | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | UI: `puede('facturasCrear')`. Rule facturas: `esStaffOficina() & create` (firestore.rules:396-402). Secretaria default false. |
| 11 | **Cerrar facturación pendiente** | ✓ | ✓ | cond | ✗ | ✗ | ✗ | UI: `puede('facturasCerrar')` O `puede('facturasCrear')` O `esAdminOCoord` (FacturacionPendiente.tsx:48-50). Operaria condicional: defaults la dejan via `facturasCrear` aunque el granular `facturasCerrar` esté en false. **Granular-no-modal** (no editable persona-por-persona). |
| 12 | **Registrar pago** | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | UI: `puede('pagosRegistrar')` (OrdenDetailModal.tsx:55, OrdenDetalle.tsx:1116). Default secretaria true (único permiso "monetario" que tiene). **Granular-no-modal**. |
| 13 | **Enviar orden a facturación** | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | UI: `puede('ordenesEnviarAFacturacion')` (OrdenDetalle.tsx:1108). Default operaria true; secretaria false. **Granular-no-modal**. |
| 14 | **Eliminar orden** | ✓ | ✓ | cond | ✗ | ✗ | ✗ | UI: `puede('ordenesEliminar')` (Ordenes.tsx:536, EliminarOrdenButton.tsx:24). Rule: `esAdminOCoord()` (firestore.rules:369). Operaria por **default** `ordenesEliminar=false` (heredado de TODO_FALSE, src/types/index.ts:1267 `PERMISOS_DEFAULT_OPERARIA`) → NO ve botón por default. Si Jorge le activa el granular persona-por-persona desde el modal, **sí** ve botón pero rule rechaza con `permission-denied`. **Inconsistencia UI vs rule latente** — activable solo si admin marca el checkbox individualmente. SPRINT-128 (BLOQUEADO 2026-05-10) propone R2 (ampliar rule a `puede('ordenesEliminar')`) para alinear con el sistema de granulares. |
| 15 | **Ver órdenes eliminadas (papelera)** | ✓ | ✓ | cond | ✗ | ✗ | ✗ | UI: `puede('ordenesVerEliminadas')`. Operaria: default true; en práctica `eliminada == true` filter — verificar en QA si rule deja read. |
| 16 | **Gestionar bancos** | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | UI: `puede('bancosGestionar')` (Bancos.tsx:48). Default solo admin/coord. **Granular-no-modal**. |
| 17 | **Gestionar avances/préstamos a empleados** | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | UI: `puede('avancesGestionar')` O `esAdminOCoord` (Avances.tsx:17). Default solo admin/coord. **Granular-no-modal**. |
| 18 | **Ver/gestionar Reactivación de clientes** | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | UI: `puede('clientesReactivacionGestionar')` (Clientes.tsx:42). Default solo admin/coord. **Granular-no-modal**. |
| 19 | **Ver clientes** | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | UI: `puede('clientesVer')`. Rule: `esStaff()` (firestore.rules:374). Default tec/ay false. |
| 20 | **Eliminar cliente** | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | UI: `puede('clientesEliminar')`. Rule: `esAdminOCoord()` (firestore.rules:376). |
| 21 | **Ver personal (lista de empleados)** | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | UI: `puede('personalVer')`. Rule: `esStaff()` (firestore.rules:382). |
| 22 | **Crear/modificar empleado** | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | UI: `puede('personalCrear/Modificar')`. Rule: `esAdminOCoord()` (firestore.rules:383). |
| 23 | **Eliminar empleado** | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | UI: `puede('personalEliminar')` — coord default false. Rule: `esAdminOCoord()` cubre coord pero defaults TS la bloquean. |
| 24 | **Modificar configuración del sistema** | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | UI: `puede('configuracionModificar')` — coord default false. |
| 25 | **Ejecutar cierre del día** | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | UI: `puede('cierreDiaEjecutar')`. Rule cierres_dia: `esStaffOficina()` (firestore.rules:539-544). |
| 26 | **Ver gastos** | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | UI: `puede('gastosVer')`. Rule: `esStaff()` para read (verificar). |
| 27 | **Ver/usar Asistente IA** | ✓ | ✓ | cond | cond | ✗ | ✗ | UI: rol === administrador para `/admin/asistente` (Sidebar.tsx:321-322). Toggle por usuario `iaHabilitada` (permisos.ts:72). cond = si admin habilita el toggle individualmente. |

---

## Sección 2 — Hallazgos clave (cuantitativos)

### A. Flujos cubiertos por permiso granular del modal

De los 27 flujos auditados:

- **Granular puro** (cubierto por checkbox del modal "Editar Usuario"): **16** flujos.
- **Granular-no-modal** (existe key TS pero NO está en el modal): **6** flujos: Facturas cerrar (#11), Pagos registrar (#12), Enviar a facturación (#13), Bancos (#16), Avances (#17), Reactivación (#18). Coinciden con las 6 keys identificadas en SPRINT-124.
- **Rol-only** (gate solo por rol o página rol-restricted, sin checkbox granular): **5** flujos: Iniciar chequeo (#3, técnico-only por flujo), Sugerir solo chequeo (#4, técnico-only por flujo), Aprobar sugerencia (#5, oficina-only via rol), Cerrar servicio con foto + checklist (#9, mismo gate que #8 pero sin granular adicional), Asistente IA (#27, admin-only en sidebar + toggle individual `iaHabilitada`).

> Total: 16 + 6 + 5 = 27 flujos. Cuadra con la tabla.

### B. Inconsistencias UI ↔ Rule detectadas (no QAeadas, requieren verificación humana)

1. **Eliminar orden (#14):** UI deja a operaria cuando `ordenesEliminar=true` (default es `false` heredado de TODO_FALSE — corrección 2026-05-10 SPRINT-128: la versión anterior de este doc decía erróneamente "default `=true`"), rule la rechaza con `esAdminOCoord` solamente. Síntoma latente: solo se manifiesta si admin activa el granular para una operaria específica. → Sprint propio R2: ampliar rule a `puede('ordenesEliminar')` para alinear con el sistema de granulares. **BLOQUEADO 2026-05-10 esperando OK de Jorge** (toca `firestore.rules` — sub-regla autonómica).

2. **Ver órdenes eliminadas (#15):** operaria default true en UI, rule de read filtrada por `eliminada==true` no testeada — requiere QA con un usuario operaria real intentando entrar a la papelera.

3. **Marcar trabajo realizado para secretaria (#8):** UI no expone (no aparece en defaults secretaria), rule la deja por `esStaffOficina`. → Probablemente OK (la página no le ofrece la acción), pero requiere validar.

### C. Flujos críticos que requieren QA humano (no procesable autónomo)

Los 27 flujos de la tabla principal × 6 roles = **162 celdas**. Cada celda ≠ ✗ requiere intentar la acción con un usuario real de ese rol y verificar que:

1. La UI deja iniciar la acción (botón visible / página accesible).
2. La acción completa OK (no hay permission-denied silencioso).
3. El estado final en Firestore es el esperado.

**Esfuerzo estimado:** ~2 horas con accesos reales de cada rol y un setup de pruebas controlado.

**Riesgo si NO se hace:** los gaps del tipo #14/#15 quedan latentes. Probabilidad de bug en producción si una operaria intenta eliminar: alta (sin diagnóstico la operaria intenta y ve "no pasa nada").

---

## Sección 3 — Schema drift

> Componente del sprint: detectar si hay campos en docs reales de Firestore que NO están en las interfaces TypeScript (y viceversa).

### Herramienta entregada

Script `scripts/auditoria/schema-drift.ts` (read-only, requiere `service-account.json`):

- Para cada colección en una lista predefinida, samplea hasta N=20 docs.
- Extrae el set de keys observadas en docs reales.
- Compara contra el set de keys declaradas en la interfaz TypeScript correspondiente (whitelist hardcoded en el script — fuente de verdad: `src/types/index.ts`).
- Reporta:
  - `solo_en_firestore`: campos en docs que NO existen en TS (drift positivo — TS desactualizado).
  - `solo_en_typescript`: campos en TS que NO aparecen en NINGÚN doc sampleado (drift negativo — feature TS muerto, o muestreo insuficiente).
  - `compartidos`: campos en ambos (no es drift).

### Comando

```bash
npm run audit:schema-drift
```

### Output (formato)

Stdout legible. Tabla por colección con tres columnas. Salida exit-code 0 siempre (read-only, no falla pre-commit).

### Quién lo corre

**Manual.** Jorge (o Cowork con instrucciones explícitas) lo dispara cuando quiera baseline. NO se ejecuta en pre-commit ni en CI por:

1. Consume cuota Firebase de lectura (1-2 mil reads).
2. Requiere `service-account.json` que solo está en la máquina de Jorge.
3. El output es informativo, no determinístico — no tiene sentido bloquear commit por drift detectado.

### Acción esperada después de correrlo

Si aparecen campos `solo_en_firestore` (drift positivo):

- Revisar manualmente cada uno.
- Si es un campo legítimo nuevo: agregarlo a la interfaz TS (sprint propio).
- Si es legacy: dejarlo opcional en TS o documentarlo.

Si aparecen campos `solo_en_typescript` (drift negativo) con muestreo de 20+:

- Probable feature TS sin uso real en producción. Considerar remover.
- Si el muestreo es N<5 docs en la colección, es ruido.

### Limitaciones documentadas

- Muestreo aleatorio sin orden: 20 docs pueden no cubrir variantes raras (ej: orden cancelada vs orden en gestión).
- No detecta type drift (string vs number en el mismo campo) — solo presence drift.
- No baja la jerarquía de objetos anidados (ej: `auditoria` es objeto con sub-fields; el script lo trata como un solo key).

---

## Sección 4 — Recomendaciones

> El builder propone, NO decide. Jorge prioriza.

### Prioridad alta (alineación con la regla declarada de Jorge)

1. **Validar las 3 inconsistencias UI ↔ rule** (eliminar orden, ver eliminadas, secretaria + trabajo realizado) con QA humano. Sin esto, hay bugs latentes que romperán producción cuando operarias específicas intenten flujos.

2. **Decidir sobre las 6 keys granular-no-modal** (Bancos, Avances, Reactivación, Pagos registrar, Facturas cerrar, Enviar a facturación). Misma decisión que SPRINT-124 propuso como **Opción A** — bloqueada esperando OK de Jorge en BLOQUEOS.md.

### Prioridad media (visibilidad, no urgente)

3. **Correr `npm run audit:schema-drift` por primera vez** y archivar el output como baseline en `docs/sprints/SCHEMA_DRIFT_<fecha>.md`. Sprint chico (~10 minutos manual) → sugerencia para Cowork de cara a la próxima cola.

### Prioridad baja (largo plazo)

4. **QA humano completo de la matriz** (162 celdas). Requiere 1 sesión dedicada con Jorge / Yohana presente y accesos por rol. → **Sub-sprint humano en BLOQUEOS.md**.

5. **Considerar Cypress/Playwright** para automatizar las 162 celdas. Sprint follow-up grande, no inmediato. Mencionado por SPRINT-112 original, sin compromiso.

---

## Apéndice — referencias cruzadas

- `docs/MATRIZ_PERMISOS_VS_MODULOS.md` (SPRINT-124) — vista por módulo del sidebar.
- `docs/PATRONES_REGRESION.md` — catálogo de patrones P-001..P-008 (algunos relacionados con gating).
- `src/utils/permisos.ts` — implementación de `puede(userProfile, accion)`.
- `src/types/index.ts:1158-1304` — interfaz `PermisosSistema` y defaults por rol.
- `firestore.rules:60-103` — helpers `esStaff`, `esStaffOficina`, `esAdminOCoord`, `esTecnicoDe`.
- `firestore.rules:315-370` — rule de `ordenes_servicio` (la más compleja, con R4 de aprobación de precio).
- `scripts/auditoria/schema-drift.ts` — herramienta para auditar drift TS ↔ Firestore.

---

**Última actualización:** 2026-05-10 por coordinator (SPRINT-112 fase documental).
**Pendiente:** QA manual de las 162 celdas con usuarios reales — registrado como sub-sprint humano en `BLOQUEOS.md`.
