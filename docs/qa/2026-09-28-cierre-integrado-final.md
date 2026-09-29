# Cierre de comprobaciones — 28/09/2026, 22:40 RD

## Resultado

Código local construido y comprobado; listo para empaquetar la candidata Android. **No autoriza publicación todavía**: faltan comprobaciones reales de firma de URLs y CORS de Storage y desplegar las reglas e índices que acompañan a los nuevos endpoints. El asistente y el reparto global quedan apagados por defecto, sin integrantes inventados ni llamadas reales al proveedor.

## Verificación final de esta unidad

| Control | Resultado |
|---|---|
| `npm run build` | PASS; TypeScript web/API y Vite web |
| `npx tsc && npx tsc -p tsconfig.api.json && npx vite build --mode mobile-production --config vite.mobile.config.ts` | PASS; dist-mobile producción 1.0.17, guard App Check sin debug |
| `npm run test:integraciones` | 415 pruebas PASS, 96 archivos |
| Runtime Firestore real aislado | 19 pruebas PASS; repetición independiente del reviewer también PASS |
| Presupuesto/configuración/reparto | 24 pruebas PASS |
| Servidor citas públicas | 9 pruebas PASS |
| `npm run lint` | 0 errores, 354 advertencias |
| ESLint `--no-ignore` sobre todos los API cambiados | 0 errores, 7 advertencias |
| `npm run check:regression` | Dos bloqueos reales: P-005 y P-013 por reglas todavía no publicadas |
| `git diff --check` | PASS |

No sumar estas cifras a las de otras unidades como si fueran una única suite sin solapamientos. El reviewer reportó por separado 17 pruebas de backend público y tres de Storage, además de 660 aserciones negativas de permisos; su alcance está en su informe. No se certifica comportamiento de cámara, teclado, permisos GPS o instalación física por estas pruebas.

Vite avisa de bundles mayores de 500 kB (cámara y ExcelJS entre ellos); la compilación termina correctamente. No se agregaron excepciones para ocultarlo.

## Hallazgos resueltos durante el cierre

- Se evita duplicar una propuesta de conocimiento al reintentar después de perder una respuesta: requestId estable, huella y cuota transaccional.
- La recuperación administrativa sigue funcionando sin habilitar proveedores. Cambios de configuración, incluso entre recuperación y claim, dejan atención visible; no cancelan silenciosamente al cliente.
- Una petición inicial de persona deriva sin consultar al modelo. Un WhatsApp completamente nuevo termina en la secretaria del equipo de menor carga sin crear una ficha ficticia.
- El reparto global tiene bandera propia. Solicitudes web reciben asignación interna sin tratar el teléfono declarado como identidad autenticada ni cambiar la cartera existente.
- Citas públicas deduplican solicitudes exactamente iguales, no todas las solicitudes del mismo teléfono. Se admiten equipos diferentes; las cuotas técnicas configurables son cinco nuevas por teléfono/hora y 500 globales/hora.
- El lector de archivos de WhatsApp conserva límite, cancelación y liberación del stream, usando una condición de finalización real.

## Advertencias pendientes, sin ocultarlas

API: cuatro usos de `any` en asistencia (49/54/57/59), dos en el parser de atención (35/36), un tipo `SendBody` sin usar en send (192). Ninguna corresponde a los nuevos runtime/adaptadores.

El log de referencia completo disponible tiene 340 advertencias (`/tmp/final-lint.log`), no 333; no se pudo atribuir con precisión un delta contra un log de 333. Se corrigieron cinco avisos nuevos introducidos por pruebas de esta unidad. Frente al log de 340 hay 18 aumentos y cuatro reducciones, saldo 354. Incrementos identificados:
- `tests/manual/bot-servicio-stub.ts`: 1 avisos adicionales; 1 actuales. 6:70  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
- `tests/rules/bot-servicio-backend.test.ts`: 5 avisos adicionales; 8 actuales. 24:30  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any; 26:50  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any; 26:62  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any; 159:73  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any; 159:90  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any; 240:32  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any; 242:70  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any; 242:82  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
- `tests/rules/cita-publica-backend.test.ts`: 5 avisos adicionales; 5 actuales. 51:29  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any; 53:87  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any; 53:99  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any; 80:72  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any; 80:90  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
- `tests/rules/solicitud-publica-backend.test.ts`: 2 avisos adicionales; 2 actuales. 36:380  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any; 36:397  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
- `tests/rules/subida-publica-backend.test.ts`: 5 avisos adicionales; 5 actuales. 23:25   warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any; 24:122  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any; 24:133  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any; 34:342  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any; 34:352  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any

## Evidencias y cierre operativo

Logs locales: `/tmp/cierre-build-web.log`, `/tmp/cierre-build-mobile.log`, `/tmp/cierre-integraciones.log`, `/tmp/cierre-lint.log`, `/tmp/cierre-api-lint.log`, `/tmp/cierre-regression.log`, `/tmp/bot-runtime-emulador.log`, `/tmp/reparto-global-emulador.log`.

El empaquetado APK y su firma corresponden al coordinador. Esta unidad no instaló APK, no desplegó endpoints/reglas, no habilitó asistentes ni realizó envíos reales de WhatsApp. Emuladores propios cerrados; puertos 8299 libres al finalizar. La compilación usa `.env.mobile-production.local` sin imprimir su contenido.
