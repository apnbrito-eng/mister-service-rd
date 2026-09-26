# Android real — 24/09/2026

El usuario autorizó expresamente publicar la web real y pidió APK conectado a producción, no ensayo. Aplicación nueva `com.misterservicerd.app`, nombre Mister Service RD, versión 1.0.0 (código 1). Ensayo conserva otro identificador.

## Preparación
- Firebase real `mister-service-app-cloude`; app Android `1:342961599729:android:f656156d29ece85719a550`.
- API `https://www.misterservicerd.com`; build `vite --mode mobile-production --config vite.mobile.config.ts`. `.env.mobile-production.local` excluido de Git. Solo configuración pública frontend, sin credenciales de servidor.
- Guard de compilación exige proyecto/origen real y debug App Check false; ensayo mantiene validación separada.
- Firma release RSA3072 guardada fuera del repo, en carpeta privada del perfil Codex `mister-service-android-produccion`. Mantener copia segura de firma para futuras actualizaciones. Nunca subir clave ni contraseña al repositorio o a Vercel.
- App Check Play Integrity configurado para APK fuera de Play, requiere MEETS_DEVICE_INTEGRITY. SHA256 de firma registrado. No se añadieron tokens debug productivos ni se desactivó enforcement.
- Variable MOBILE_FIREBASE_APP_IDS añadida a Vercel producción con ID de Android real.
- Reglas Firestore/Storage e índices publicados explícitamente en proyecto real; se conservó un índice remoto adicional. Locks actualizados después del éxito. No migraciones ni modificación de órdenes.

## Compilación realizada
- Fuentes nativas copiadas a `/tmp/mister-android-produccion/android`, excluyendo build/.gradle y duplicados `config N.xml` (reaparecen en Documents; causa aún pendiente).
- applicationId, nombre, google-services y capacitor.config del snapshot se sustituyeron por valores reales; namespace Java original conservado. Assets vienen de dist-mobile production.
- Release firmado sin debug, `assembleRelease` pasó y `apksigner verify` pasó. APK persistente en Downloads/Mister-Service-RD-1.0.0.apk.
- Instalador se publica como `/descargas/mister-service-rd-1.0.0.apk`, guía `/descargas/android.html`.
- Build nativo posterior requiere repetir preparación del snapshot con misma firma, incrementar versionCode/versionName y recompilar assets. No ejecutar cap sync por defecto para producción: el proyecto raíz sigue siendo ensayo para iOS.

## Límites
Publicación solicitada para probar, no certificación completa: revisión de módulos parcial. Samsung S24 Ultra todavía no probado. App Check, login, cámara, ubicación en segundo plano, push y mensajería deben verificarse físicamente. Cola/cron de push y conexión de compras Meta no quedan garantizados por publicar. No se enviaron mensajes o eventos reales de prueba.

## Publicación comprobada
- Vercel producción READY: dpl_BVQXmYjKw9WyDNxhDdubVbkp3AEG, https://mister-service-3bk0xdxhi-mister-service-rd-team.vercel.app.
- https://www.misterservicerd.com/login y /descargas/android.html responden 200.
- APK público responde 200, application/vnd.android.package-archive, 18.911.934 bytes; descarga idéntica al release firmado local. SHA256: 54ac1d787626dcb6e5ba90f95ccd401f0d05ba1011a429db430a44ab846c5d51.
- API marketing/resumen y ai/conocimiento rechazan sesión ausente con 401. Esto no sustituye pruebas autenticadas en Samsung.
- Firebase confirma certificado SHA256 registrado. Ensayo se publica por separado; no confundir los instaladores.
