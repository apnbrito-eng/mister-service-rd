# Permisos candidatos locales — 29/09/2026

## Suplidores integrado localmente

Se contrastó `src/services/suplidores.service.ts` con la propuesta de `docs/qa/propuesta-suplidores/`. El servicio crea por teléfono normalizado, usa auth.uid y serverTimestamp, conserva creador/fecha en actualización y desactiva sin borrar. La regla añadida reproduce ese contrato.

- Lectura/creación/actualización: `esStaffOficina()` existente (administración, coordinación, secretaria y operaria). No amplía otras colecciones ni modifica helpers.
- Documento identificado por teléfono normalizado de diez dígitos. Campos cerrados, tamaños y tipos, actor igual a auth.uid y updatedAt igual a request.time.
- creadoPor/createdAt inmutables; delete denegado incluso a administrador. Cambio de teléfono exige alta nueva y desactivación del anterior, como explica el servicio.
- Se conserva la semántica existente del helper por rol; no introduce una nueva política general de revocación de cuentas. Una revisión futura de actividad debe contemplar todas las colecciones y acceso Auth.

`tests/rules/suplidores.rules.test.ts`: **12/12** en Firestore Emulator demo, reglas locales reales y datos ficticios. Incluye cuatro roles de oficina, técnico/ayudante/sin perfil, anónimo, actor falso, creador/fecha alterados, campos adicionales, tipos inválidos, teléfono mutable y prohibición de borrado. Log `/tmp/suplidores-reglas-emulador.log`. La propuesta original se conserva como antecedente, la prueba ejecutable vive ahora en tests/rules.

## P005/P013 pendientes

No se cambiaron locks ni se desplegaron reglas. A las 23:09 RD se consultó producción en modo lectura usando la sesión existente de Firebase CLI.

| Archivo | Hash candidato local | Hash registrado en lock | Fecha registrada |
|---|---|---|---|
| firestore.rules | `6247be7ebefd36515c5e1a88793f911c17983c37717b2c20d081d4eae0f3f9eb` | `1c69d44db29c945d12d29e6360759a5e6c195b026ab86e50085bed5f183911a8` | 2026-09-27T03:43:53.390Z |
| storage.rules | `7741e9031ddfafae7bcbf85e0671441927050af6f2c7298d0a53906301438f51` | `fd605585f7ed45cedb6a618f769b8127fd8c2216f2460b66429491b74485b289` | 2026-09-25T01:06:14.378Z |

Se recuperaron los contenidos actuales mediante Firebase Rules API. Ambos hashes coinciden exactamente con los locks. Copias y manifiesto están en `~/.codex/artifacts/mister-service/2026-09-29/reglas-produccion-lectura/`. El diff completo verificado contiene únicamente los siguientes cambios:

1. Firestore `citas_por_confirmar`: creación directa exige staff y validación de campos. Visitantes usan `/api/publico/cita`, con contrato/controles del servidor.
2. Firestore `solicitudes_servicio`: creación directa exige staff; formularios públicos pasan por `/api/publico/solicitud` con App Check y cuota.
3. Firestore `suplidores`: nuevo bloque local de esta revisión. Hasta publicarlo no se certifica que el directorio esté disponible en producción.
4. Storage `fotos-equipos-publico` y `solicitudes-publico`: visitante no sube mediante SDK directo; endpoints preparan PUT firmado. El comodín autenticado se conserva, así que no se afirma prohibición absoluta de escrituras de staff sobre esas rutas.
5. Storage conserva exclusión `crm-private` del comodín autenticado. No se alteró aquí. El comodín de otros archivos autenticados continúa siendo deuda conocida de endurecimiento.

## Validación previa a publicación (pendiente, no ejecutada aquí)

- Baseline y diff completo recuperados/revisados: Firestore ruleset `f606b508-5d56-49d6-a59c-854770dd0ee2`, Storage `8ffc3a84-ebf3-487a-9a1f-5ffd2a27bd66`. Revalidar que no cambien antes de publicar.
- Suite Firestore final: 167 pruebas aprobadas; Storage: 3 aprobadas en corrida separada previa, reglas sin cambios posteriores. Las pruebas de API y subidas firmadas tienen adaptadores y no reemplazan infraestructura real.
- Confirmar endpoints y frontend coordinados. Probar una subida autorizada controlada, CORS y firma real, MIME/tamaño inválidos y rechazo de segunda escritura, descarga posterior desde oficina. Evitar cerrar vías antiguas antes de verificar el reemplazo.
- Verificar flujo real de crear/editar/desactivar suplidor con oficina y denegación de técnico. Hacerlo sólo bajo la autorización de publicación/prueba que corresponda.
- Actualizar locks únicamente como resultado del procedimiento de despliegue real exitoso. P005/P013 deben seguir visibles hasta entonces.

Referencias: `docs/qa/2026-09-29-formularios-publicos-seguros.md`, `docs/qa/2026-09-29-suplidores-claude.md`. La validación de esta entrega se limita a reglas locales de suplidores, no certifica los demás módulos en producción.
