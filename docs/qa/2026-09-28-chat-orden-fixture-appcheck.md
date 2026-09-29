# Chat por orden: fixture independiente y App Check

Fecha: 28/09/2026. Alcance: pruebas locales; sin cambios de producción.

## Corrección

- `tests/ensayo/chat-orden-emulador.test.ts` conserva la función real `exigirAppMovil`. Solo se controla la respuesta de `verifyToken` de Firebase Admin; las cabeceras y la lista de apps permitidas siguen pasando por la validación real.
- Cada caso crea su técnico, teléfono y órdenes, con estado y autenticación propios. Las pruebas de cierre y pausa ya no dependen de que otra prueba haya cerrado la orden.
- Al finalizar cada caso se restablecen autenticación y variables de entorno, y se eliminan sus documentos y eventos del emulador.
- Se añadieron rechazos por token ausente, token inválido, app no autorizada y configuración de apps permitidas ausente.

## Resultado

**10 pruebas aprobadas, 1 archivo, salida 0.** Ejecución iniciada a las 21:32:13; Vitest 3.2.7, duración total 5,86 s.

Se comprobó que el puerto 8299 estaba libre antes de iniciar el emulador aislado. Firebase inició y detuvo sus propios procesos al terminar. El puerto volvió a quedar libre; no se detuvieron otros procesos.

```sh
JAVA_HOME=/Users/jorgeluisbritogarcia/.codex/deps/mister-mobile/jdk-21.0.12.1+1/Contents/Home npx firebase-tools emulators:exec --project demo-mister-ensayo --config firebase.movil-tests.json --only firestore 'npx vitest run --config vitest.movil-ensayo.config.ts tests/ensayo/chat-orden-emulador.test.ts'
```

## Límites

Firestore es un emulador real; la verificación criptográfica de App Check está simulada con tokens ficticios. Este resultado comprueba el comportamiento del servidor ante la respuesta del verificador, no Play Integrity en un Android físico ni las reglas de Firestore, porque el acceso usa Admin SDK. Tampoco valida GPS, cámara, publicación o instalación de APK. Las pruebas físicas pendientes de jornada y GPS conservan su estado anterior.
