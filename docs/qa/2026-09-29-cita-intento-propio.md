# Confirmación de cita: propiedad del intento y recuperación

## Corrección

El bloqueo se adquiere mediante transacción con usuario y token único por envío. Una cita con `procesando=true` no se toma aunque tenga `ordenIdCreada`. No se añadió vencimiento automático.

La transacción que crea orden y vínculo valida propietario, token y una huella de los datos de la cita capturada al adquirir el bloqueo. Una cita editada/cancelada durante el procesamiento rechaza el commit. Los datos del bloqueo y del vínculo se excluyen de esa huella porque pertenecen al protocolo.

La liberación relee cita y compara usuario+token. Una respuesta atrasada no libera el intento siguiente. Si falla el callback de garantía, se conserva `ordenIdCreada`; el próximo envío recupera esa orden sin crear otra.

Antes de reutilizarla se validan en transacción cita, bloqueo, vínculo, `metadatosCita.citaOrigenId`, cliente y estado activo. El cliente se comprueba con `clienteIdVinculado` persistido atómicamente; vínculos anteriores sin ese campo requieren teléfono concordante normalizado. No se comparan nombres. Órdenes sin evidencia suficiente requieren revisión del vínculo.

El hook conserva los callbacks, garantías y la reserva del contador existente. El cliente sigue siendo un contacto independiente que puede existir aunque falle la creación de orden; la atomicidad obligatoria es orden+cita, delegada al helper (anotación P003 explícita).

## Archivos

- `src/utils/vinculoOrdenCita.ts`
- `src/hooks/useOrdenCreateForm.ts`
- `tests/integraciones/vinculo-orden-cita-atomico.test.ts`
- `tests/ensayo/cita-intento-emulador.test.ts`
- Cazador `scripts/invariantes/check-cita-intento-propio.ts`, P042 y registro.

## Verificación

- 16 pruebas unitarias: rollback, vínculo ausente/ajeno/inactivo, bloqueo ocupado con orden creada, liberación antigua, recuperación de vínculo y cambio de datos.
- 2 pruebas con Firestore Emulator: dos coordinadoras simultáneas, un único ganador/orden; fallo posterior simulado, recuperación y liberación tardía; cita editada tras lock.
- El ensayo carga **firestore.rules del checkout** con RulesTestEnvironment y usuarios ficticios coordinadora. Las reglas actuales de citas permiten update a staff y no restringen estos nuevos campos. No se modificaron reglas.
- TypeScript y ESLint de archivos productivos/cazador limpios.
- P042 pasa. Regression completo corre sin errores de runtime; P005/P013 siguen señalando reglas pendientes de publicación del proyecto.

Limitación: callbacks externos no se vuelven transaccionales con este cambio. El bloqueo evita ejecutarlos simultáneamente por estos writers; su idempotencia propia sigue siendo necesaria para recuperación tras un fallo parcial. Clientes antiguos que no respeten el token no están protegidos por reglas nuevas. No se publicaron cambios ni se tocaron datos reales.

## Revisión final: callback fallido

Se extrajo `finalizarConfirmacionCita`, usado por creación y recuperación. El éxito y reset del formulario sólo se ejecutan tras completar el callback; su fallo muestra «Orden creada, confirmación pendiente», libera el intento y conserva el formulario. Sin callback también se libera. Dos pruebas ejecutan ese mismo extractor y comprueban fallo, ausencia de éxito/reset, reintento con el mismo ID y ausencia de callback. Total focal: 18 pruebas aprobadas; TypeScript limpio.
