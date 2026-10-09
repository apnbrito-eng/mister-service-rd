# Modelo "comisión por trabajo" — fundamento puro — 2026-10-09

Responsable: Claude, bajo autorización explícita de Jorge. Base de trabajo: /private/tmp/mister-personal-claude-20261009 (HEAD a5495b8 más cambios concurrentes de la sesión). Entrada auditada: `docs/entregas/FINANZAS-PORTAL-NOCTURNO-2026-10-09.md` (Codex, mismo día). Codex integrará y ejecutará las pruebas de este fundamento en una pasada posterior.

Este cambio **no activa pagos, no modifica el flujo productivo y no toca comisiones históricas**. Es la cimentación tipada que el adaptador transaccional usará más adelante.

## Alcance de este lote

Nuevo módulo puro `src/utils/comisionPorTrabajo.ts` y su suite `tests/unit/comisionPorTrabajo.test.ts` (node:test). No se tocó ningún archivo existente, no se corrieron migraciones, no se escribieron reglas ni se activaron endpoints.

Lo que fija este fundamento, en respuesta a §Comisión por trabajo del audit de Codex (hallazgos ❓ y ⏳):

- **Contrato Trabajo con ID estable e inmutable.** `TrabajoSnapshot` guarda `ordenId`, `trabajoId`, `tecnicoUid` (Firebase Auth uid, consistente con la convención P-006 del repo), `porcentajeComision` (0..100, 2 decimales), `importeCobrado`, `costoMateriales`, `finalizado` y `creadoEn`. Todos los campos son `readonly` a nivel de tipo y el objeto se devuelve con `Object.freeze` a nivel de runtime. Mutar el snapshot original dispara TypeError en ESM estricto.
- **Snapshot congela el porcentaje al alta.** `crearSnapshotTrabajo` toma el porcentaje de la ficha del técnico en el momento del alta y lo normaliza a centésimas de punto porcentual. Un cambio posterior en la ficha **no afecta** al snapshot ya creado. Prueba cubierta: `snapshot congela porcentaje de ficha y no se altera por cambios posteriores`.
- **Base de comisión por trabajo = max(0, importeCobrado − costoMateriales).** No se aplica ITBIS adicional, no se inventan gastos compartidos, no se redistribuyen descuentos. El piso cero cubre la pérdida material explícitamente (`piso cero: si materiales superan importe, base y comisión son 0`).
- **Validación aritmética en centavos.** Toda normalización se hace vía `Math.round(valor * 100)` con tolerancia `1e-6` sobre la aritmética flotante y revalidación defensiva al momento de liquidar. Se rechazan NaN, Infinity, negativos y valores con más de 2 decimales (importes/costos) o más de 2 decimales en porcentaje.
- **Liquidación pura "todo o nada".** `calcularLiquidacionOrden` devuelve `{ estado: 'liquidable', devengos }` **solo si** se cumplen todas estas condiciones: la orden no está marcada eliminada ni soloChequeo, tiene al menos un trabajo, **todos** los trabajos están finalizados y **la suma de pagos verificados cubre el total de importes de los trabajos**. Si falta cualquier condición, devuelve `{ estado: 'pendiente', motivo, devengos: [] }` con cero devengos: no se emiten abonos parciales. Esto cierra la observación "cada trabajo terminado independientemente" del audit sin romper la invariante de cobro total ya protegida en `src/utils/comisionCobro.ts`.
- **Varios técnicos por orden en trabajos distintos.** Cada trabajo lleva su propio `tecnicoUid` y su propio devengo. Un solo cálculo de orden emite N devengos, uno por trabajo. Prueba `varios técnicos por orden`.
- **IDs deterministas (idempotencia futura).** `idDevengoDeterminista(ordenId, trabajoId)` emite `trabajo_${encodeURIComponent(ordenId)}_${encodeURIComponent(trabajoId)}`. Se prohíben `_`, `/` y espacios en los identificadores de entrada para evitar colisiones ambiguas (ordenId y trabajoId auto-generados por Firestore son alfanuméricos). El prefijo `trabajo_` namespacea respecto a los IDs existentes `orden_<id>` y `manual_<facturaId>_<tecnicoId>`.
- **Rechazo de IDs duplicados y conflictos.** `calcularLiquidacionOrden` rechaza con `throw` cualquier orden que contenga dos trabajos con el mismo `trabajoId` o un trabajo cuyo `ordenId` no coincide con el de la orden recibida. También rechaza pagos con `id` vacío, `id` repetido, `monto` no finito, no positivo, con más de centavos, o `verificado` no boolean.

## Lo que explícitamente queda fuera de alcance

El audit lo enumeró; este fundamento **no implementa ni intenta inferir** estos escenarios, que quedan bloqueados para decisión y sprint futuro:

- Redistribución de descuentos entre trabajos de una misma orden.
- Devolución parcial de un trabajo.
- Cancelación posterior de un trabajo o de una orden ya liquidada.
- Garantías repetidas o garantía sobre garantía (regla antigua del 10 % sobre piezas permanece inalterada en `src/utils/comisiones.ts:842–893`, protegida por P-024).
- Comisión por venta independiente del técnico (no definida).
- Momento de abono al técnico sustituto. Jorge ya decidió usar la comisión original completa; falta implementar el ajuste auditado.
- Adaptador de ajustes de quincena: Jorge ya decidió descontar la comisión original pagada en la próxima quincena.

El módulo no acepta campos para ninguno de estos conceptos. Agregarlos sin decisión documentada romperá el tipado y la suite.

## Pendientes de la fase siguiente (NO cubiertos por este lote)

El propio brief lo pide y aquí se registra para trazabilidad:

1. **Adaptador transaccional** sobre Firestore que ingeste el modelo `TrabajoSnapshot` y persista devengos usando `idDevengoDeterminista` como clave idempotente del doc en `comisiones`. Debe envolver lecturas + escrituras en `runTransaction` según el patrón ya consolidado del repo (CLAUDE.md: "Mutaciones cross-collection deben ir en un solo `runTransaction`"). Pendiente.
2. **Modelo de trabajos en producción**: colección o subcolección que persista `TrabajoSnapshot` por orden. Pendiente de diseño técnico compatible con las decisiones registradas.
3. **UI** para registrar, finalizar y auditar trabajos individuales dentro de una orden. Pendiente.
4. **Integración a nómina**: una vez el adaptador exista, `nomina.service.ts` deberá consumir devengos por trabajo en lugar de la comisión canónica única por orden. Hoy no se toca.

## Pruebas incluidas

Suite `tests/unit/comisionPorTrabajo.test.ts` ejecutable con `node --import tsx --test tests/unit/comisionPorTrabajo.test.ts`. Cubre los casos exigidos:

| Prueba | Verifica |
| --- | --- |
| `snapshot congela porcentaje de ficha...` | Porcentaje al alta queda frozen; mutar fuente o snapshot no retroactivo |
| `finalizarTrabajo produce nuevo snapshot inmutable` | Transición de estado respeta inmutabilidad e idempotencia |
| `varios técnicos por orden` | Devengo por trabajo con tecnicoUid propio |
| `cierre parcial de servicios bloquea devengos` | Un servicio sin finalizar bloquea toda la orden |
| `cobro parcial bloquea devengos` | Pagos no verificados o suma insuficiente bloquean todo |
| `cálculo individual` | Base y monto correctos para un trabajo canónico |
| `piso cero` | Pérdida material no produce comisión negativa |
| `IDs de trabajo repetidos` | Duplicado dentro de orden lanza |
| `trabajos que apuntan a otra orden` | Mismatch de `ordenId` lanza |
| `valores inválidos en el snapshot` | Negativos, NaN, Infinity, >2 decimales, ids vacíos o con caracteres prohibidos lanzan |
| `pagos inválidos` | Validaciones de shape, id, monto, precisión, verificado |
| `estabilidad del ID determinista` | Mismo input → mismo id; distinto input → distinto id; prefijo `trabajo_` |
| `precisión centavos` | Redondeo a centavos exacto para fracciones típicas |
| `ordenes marcadas eliminada/soloChequeo` | Pendientes con cero devengos y motivo explícito |
| `resultado liquidable y sus devengos quedan congelados` | Mutabilidad bloqueada a nivel runtime |

Sin dependencias de Firestore, React, ni helpers legacy. No usa `any` ni suppressiones de ESLint; tipos `unknown` donde la entrada es ajena y validación explícita antes de retornar.

## Impacto productivo

Ninguno. El fundamento es puro, no se importa desde el bundle de producción en este lote, no se añadió a `src/App.tsx`, no toca `firestore.rules`, no modifica datos reales, no activa pagos ni comisiones. El flujo actual de comisiones (`src/utils/comisiones.ts`, `src/utils/comisionCobro.ts`, `nomina.service.ts`) sigue tal cual.

Codex integrará, revisará el diff y correrá la suite antes de cualquier adopción.

— Claude Code

## Revisión de Codex — 02:22 RD
✅ Revisado independientemente por review_centro. Corregidos estados truthy, UID vacío y porcentaje raw inválido, límites de centavos seguros y producto exacto BigInt. La liquidación requiere `totalOrden` canónico adicional: cobrar los trabajos listados no prueba cobrar toda la orden. Total inferior a los trabajos bloquea por inconsistencia. El futuro adaptador debe cargar la lista completa y total canónico desde servidor; el helper no autentica ni prueba integridad de una lista proporcionada por el llamador.
✅ 17 pruebas node:test pasan. Este fundamento sigue sin importarse en producción, sin persistencia ni nómina activada. El snapshot congela datos en memoria, no acredita inmutabilidad de Firestore.
⏳ El importe del trabajo debe provenir de distribución canónica comprobada al cierre; el porcentaje se fija al alta. No congelar anticipadamente cobros/materiales aún desconocidos sin diseñar su ciclo de vida.
— Codex
