# Referencia integrada — permisos + carteras + alertas · 2026-10-08

Documento único para que Codex revise el estado conjunto de los tres lotes abiertos en paralelo y prepare la publicación web/APK del mismo código. Autor: Claude Code.

Esta referencia NO redefine decisiones; agrupa SHAs, estado por hallazgo y pendientes. Cuando una decisión esté marcada 🟦 significa que ya la tomó Jorge; ⏳ requiere acción; ❓ sin verificar en esta pasada.

## Ramas vivas

| Rama | Último SHA | Base | Propósito |
|---|---|---|---|
| `rediseno-bamboohr-lote4` | `eb4d093` | `4f8a85d` (lote 3) | Permisos + preparación de carteras |
| `rediseno-bamboohr-alertas` | `afe7523` | `eb4d093` (lote 4) | Catálogo alertas + fix burbuja + toaster accesible + hallazgos 2/3/6/7 |

`afe7523` INCLUYE todos los cambios del lote 4 como ancestros (`4f8a85d → edb01aa → a07506c → 965c72d → eb4d093 → 3c71f47 → 6f802fc → afe7523`). Codex puede publicar directamente la rama `rediseno-bamboohr-alertas` para traerse ambos lotes en una sola corrida, o mantenerlos separados.

## Lote 4 · Permisos (plan integral §1)

### Entregado
- `a07506c` — `PERMISOS_DEFAULT_OPERARIA` y `_SECRETARIA` restringidos: sin `cotizacionesAprobarPrecio`, sin `facturasVer`, sin `rendimientoVer`. `personalVer` preservado SOLO como gate de lecturas operativas (Mapa + Centro de operaciones); la entrada al módulo `/admin/personal` ahora es `RolRoute admin/coord` en `src/App.tsx` + sidebar oculta la entrada para no-admin/coord.
- `965c72d` — `tests/rules/permisos-lote4.rules.test.ts` con pruebas rol-based: permitido para operaria/secretaria (órdenes/clientes/cotizaciones ver-crear-modificar), denegado (comisiones, préstamos, bancos, `personal_privado`, liquidaciones nómina), técnico/ayudante fuera de módulos oficina, anónimo bloqueado total, admin/coord regresión positiva.

### Decisiones NO automatizadas
- 🟦 Jorge aprobó: separar entrada al módulo de la lectura operativa sin inventar permiso nuevo.
- ⏳ 6 huecos en `firestore.rules` documentados como `describe.todo` en el test file (avances write, cierre_dia write, gastos read, facturas write, `cotizacionesAprobarPrecio` granular, `pago.verificado` en array). Endurecerlos requiere adaptar quién escribe en cada flujo. Pendiente de lote dedicado.

## Lote 4 · Preparación carteras A/B (plan integral §2)

### Entregado
- `eb4d093` — Schema de `Cliente` extendido con `carteraEquipo?`, `carteraAsignadaEn?`, `carteraAsignadaPor?`, `carteraOrigen?` (todos opcionales). Tipos `CarteraEquipo`, `CarteraOrigen`, `CarteraHistorialEntry` para la subcolección `clientes/{id}/cartera_historial`. `parseCliente` rehidrata los nuevos campos defensivamente (evita hit P-009).
- `scripts/migraciones/repartir-cartera.ts` con tres modos:
  - **DRY-RUN** (default) → paginación completa canónica + inventario (total, canónicos activos, soft-deleted, mergedaCon, ya con cartera, duplicados por teléfono) + propuesta A/B determinística + `informe-cartera-dry-run-<ts>.json`.
  - **APPLY** (`--apply --ok-codex`) → `runTransaction` por cliente, idempotente, reanudable, audit log en `auditoria_admin`.
  - **REVERTIR** (`--revertir --ok-codex`) → sólo asignaciones `origen=migracion`; preserva traslados posteriores.
- Determinístico: ordenar por `id` ASC estable, par→A impar→B, arrancando por el equipo con menos distribución actual (compensa asignaciones previas). Diferencia máxima final de 1 cuando total impar.
- NO elimina ni fusiona duplicados (ese trabajo lo hace `scripts/dedup-clientes-por-telefono.ts` aparte).

### Pendientes antes del `--apply`
- ⏳ Rules sobre `clientes` que bloqueen escritura directa de `carteraEquipo`/`carteraAsignadaEn`/`carteraAsignadaPor`/`carteraOrigen` desde el cliente (`!request.resource.data.diff(resource.data).affectedKeys().hasAny([...])`).
- ⏳ Rule `clientes/{id}/cartera_historial` `allow write: if false` — sólo admin SDK vía endpoint.
- ⏳ Endpoint `/api/clientes/cartera/trasladar.ts` con motivo obligatorio (mín. 5 car + validación semántica), auditoría atómica, identidad servidor.
- ⏳ Alternancia transaccional server-side en flujo de alta (`config/cartera_alternador = { proximo }` con `runTransaction`; dedup por `telefonoNormalizado` para que reintento de webhook no consuma otro turno).
- ⏳ UI columnas A/B en `/admin/clientes` + traslado desde ficha.

### Decisiones NO automatizadas
- 🟦 Reparto total mitad A/B aprobado, diferencia máxima 1 si total impar.
- 🟦 Historial en subcolección, no array creciente.
- 🟦 Traslados por API con motivo + auditoría atómica; rules impiden write directo.
- 🟦 Reintento del mismo cliente no consume otro turno (dedup existente).
- ⏳ Codex revisa el informe dry-run antes de autorizar `--apply`.

## Alertas · Catálogo + hallazgos (addendum plan §5bis)

### Entregado
- `3c71f47` + `6f802fc` + `afe7523` — catálogo semántico de 5 severidades (`exito/atencion/fallo/info/neutro`) en `tokens.css` + componente `Alerta.tsx` + helper `claseAlerta.ts` + Toaster con duración por severidad.
- Botón "Cerrar aviso" accesible en todos los toasts no-loading (`<ToastBar>` nativo + lucide `X` ≥32px con `aria-label` y `title`).
- `loading` persiste hasta reemplazarse (duración `Infinity`); patrón canónico `avisoCargando` → `avisoExito/Error` por mismo `id`.
- `src/utils/avisos.ts` nuevo con `avisoExito/Error/Cargando/descartarAviso` aceptando `operacionId` estable para deduplicar errores repetidos de reintentos automáticos.

### Hallazgos de la auditoría
| # | Hallazgo | Severidad | Estado |
|---|---|---|---|
| 1 | `InboxConversacion.tsx:766` burbuja fallo en verde | Alta | ✅ `3c71f47` |
| 2 | `NotificacionesPanel` punto/badge rojo sin discriminar gravedad | Media | ✅ `afe7523` (azul para no-leído) |
| 3 | `NotificacionesPanel` fallo `marcarLeida` silencioso | Media | ✅ `afe7523` (`avisoError` dedupado) |
| 4 | Toaster duración global 3000ms | Media | ✅ `afe7523` (duración por severidad + botón Cerrar + loading persistente) |
| 5 | Colores semánticos repartidos | Media | ✅ `3c71f47` (tokens unificados; migración incremental de consumidores) |
| 6 | `IndicadorVentana24h` vs `InboxConversacion:771-775` avisos duplicados | Media | ✅ `afe7523` (chip ámbar en header + bloque composer sólo con acción) |
| 7 | `Feedback.tsx:180,196` `alert()` nativo | Media | ✅ `afe7523` (`avisoError` con `operacionId`) |
| 8 | `chipEstado` garantía siempre rojo | Decisión | 🟦 Preservado hasta OK para separar etiqueta de tipo de alerta urgente |

### Decisiones NO automatizadas
- ⏳ Umbrales de atraso / escalado a rojo.
- 🟦 Chip rojo de garantía intacto.
- ⏳ Sonidos opcionales; destinatarios/coberturas.

## Validación visual pendiente (Jorge · post-preview Codex)

Antes de declarar los lotes terminados, debe comprobarse en el preview Vercel + Samsung:

### Permisos
- Entrar como secretaria con defaults: sidebar NO muestra Personal/Rendimiento/Facturas; Mapa + Centro de operaciones siguen funcionando.
- Ir manualmente a `/admin/personal` → redirect/404 (no admin/coord).

### Carteras
- Ejecutar `node --import tsx scripts/migraciones/repartir-cartera.ts` sin `--apply` → se escribe el informe JSON con inventario + propuesta determinística.
- Revisar el informe antes de autorizar `--apply --ok-codex`.

### Alertas
- Toast de error (fallo guardado) → aparece, NO desaparece a los 3s, muestra botón "Cerrar aviso" accesible (≥32px, con teclado), se cierra al pulsar.
- Repetir operación con reintento automático → NO se apilan toasts si usan el mismo `operacionId`.
- `avisoCargando` + guardado exitoso → el toast loading SE REEMPLAZA por el success del mismo `id`, no se queda flotando.
- InboxConversacion: burbuja pendiente (gris con reloj) vs burbuja fallo (roja con AlertCircle + botón "Volver a editar"). Lector de pantalla anuncia "Error:" en fallo.
- NotificacionesPanel: punto y badge en AZUL, no rojo.
- IndicadorVentana24h cerrada en ÁMBAR, no rojo. `InboxConversacion` sin aviso duplicado; `SelectorPlantillas` sigue a la mano.
- Feedback: pulsar WhatsApp sin teléfono → toast rojo con botón "Cerrar aviso", NO modal nativo del navegador.

### Móvil (Samsung tras APK de Codex)
- Mismos criterios anteriores con viewport 412×915.
- Botón "Cerrar aviso" ≥44px efectivo con zoom del sistema al 150%.
- Toast persistente no bloquea scroll ni se pisa con teclado nativo.
- Modo oscuro: tokens siguen con contraste AA (prefers-contrast: more respeta bordes 2px).

## Preguntas abiertas para Jorge

1. **Umbrales de atraso / escalado a rojo** (plan §alertas, decisión pendiente). Minutos para prioridad/alarma en respuesta a clientes, cita no confirmada y retraso. Sin esto no se activan reglas de "clientes de hoy" / "atrasados activos" del Centro de operaciones (plan §6).
2. **Garantía rojo global** (hallazgo 8). ¿Separar la etiqueta `garantía` del "tipo de alerta urgente" o seguir asumiendo que toda garantía es rojo?
3. **Sonidos opcionales / destinatarios de alertas** — qué eventos escalan a notificación empujada vs sólo visual.
4. **Rules firestore** del hueco de permisos — adaptar los flujos (quién emite factura/avance/cierre día) antes de endurecer rules o endurecer primero y adaptar después (riesgo controlado con sentinel release).

## Secuencia de publicación sugerida para Codex

1. Compilar APK productiva desde `afe7523`.
2. Promover preview Vercel de `rediseno-bamboohr-alertas` a producción.
3. Verificar las 3 áreas (permisos, carteras, alertas) con los criterios de arriba.
4. Si todo OK → ejecutar `scripts/migraciones/repartir-cartera.ts` sin `--apply` para generar el informe de inventario.
5. Revisar informe conmigo + Jorge.
6. Autorizar `--apply --ok-codex` cuando el informe esté validado.

— Claude Code (2026-10-08).
