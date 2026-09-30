# Candidata Android oficial aislada — 29/09/2026

Script: `scripts/mobile/build-oficial.mjs`. Objetivo fijo: com.misterservicerd.app, 1.0.18, versionCode 19. No instala, publica ni cambia el Android de ensayo del checkout.

## Comandos

Comprobar requisitos sin generar archivos:

```sh
node scripts/mobile/build-oficial.mjs --check --google-services /tmp/mister-android-review-20260928/android/app/google-services.json
```

Cuando las fuentes estén estabilizadas, generar una copia nueva fuera del repo:

```sh
node scripts/mobile/build-oficial.mjs --build --google-services /tmp/mister-android-review-20260928/android/app/google-services.json --output /tmp/mister-service-oficial-1.0.18-candidata
```

El directorio de salida debe no existir. No reutilizar una compilación incompleta como entrega. El JSON explícito se valida contra Firebase `mister-service-app-cloude` y paquete oficial. Si desaparece el snapshot temporal, proporcionar otra copia validada de ese mismo JSON. No usar el JSON de ensayo.

## Aislamiento y comprobaciones

- Copia fuentes actuales, Android y dependencias a salida privada. No enlaza node_modules del checkout: los builds Gradle de plugins permanecen aislados.
- Excluye secretos/env, instaladores, caches y recursos móviles antiguos. Carga únicamente configuración frontend VITE de mobile-production, valida proyecto/origen/App Check sin debug y rechaza nombres de variables sensibles. No copia la configuración env a la candidata.
- Conserva fuentes nativas actuales, incluidos MainActivity y VoiceNote; adapta paquete, nombre, versión y recursos exclusivamente en snapshot.
- Capacitor sync Android regenera registro de plugins desde las dependencias copiadas. No ejecuta hooks iOS del proyecto.
- Ejecuta TypeScript del frontend, Vite productivo, Gradle offline con Java 21, zipalign y apksigner. Requiere dependencias Android presentes en caché.
- Firma mediante archivo privado, sin contraseñas en argumentos. Antes y después valida certificado oficial `d65aec5154307ec45f707402ba180d0f9a22746d7e37dda46886f4950e8ca2cd`.
- Comprueba paquete/versión/código final; compara recursos dist-mobile con APK byte a byte y rechaza instaladores anidados.
- Salida incluye source-manifest.json y verification.txt, APK candidata y proyectos intermedios. El manifiesto refleja snapshot adaptado, no un commit.

## Requisitos locales

Por defecto: SDK en ~/Library/Android/sdk (build-tools35.0.0); Java21 en ~/.codex/deps/mister-mobile/jdk-21.0.12.1+1/Contents/Home; firma en ~/.codex/private/mister-service-android-produccion (release.jks y signing-password.txt, permisos0600). Se pueden indicar ANDROID_HOME, MISTER_JAVA_HOME y MISTER_SIGNING_DIR. Alias oficial mister-service. No almacenar firma en salida, repo o Vercel.

## Evidencia y límites

Validado sintácticamente y con ESLint. Preflight productivo PASS; JSON de ensayo rechazado como se espera. No se ejecutó --build todavía: se espera estabilización de fuentes concurrentes y aviso del coordinador. La compilación completa todavía puede revelar dependencias/copias faltantes; no afirmar que existe APK1.0.18 hasta completar todos los pasos.

El script no despliega API, reglas, índices ni variables de servidor. La candidata requiere backend compatible con solicitudes públicas, IA, pagos y demás flujos nuevos. Las reglas pendientes P005/P013 deben tratarse dentro del orden de publicación acordado, nunca desplegarse como efecto del empaquetado. Firma y compilación no certifican App Check físico, permisos/GPS, cámara, Atrás Android ni funcionamiento de WhatsApp. Prueba Samsung posterior debe preservar sesión y datos.

## Corrección de revisión: ruta de salida

Antes de crear el snapshot se resuelve el ancestro existente mediante realpath y se rechaza cualquier destino real dentro del checkout, aunque llegue por symlink. Prueba controlada con enlace temporal hacia el repo: rechazo correcto, directorio solicitado no creado; enlace temporal retirado. No se compiló APK durante esta prueba.
