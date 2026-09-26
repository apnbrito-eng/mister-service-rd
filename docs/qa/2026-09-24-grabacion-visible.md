# Estado visible de grabación

Solicitud: contador, animación y confirmación clara durante la captura de voz.

Implementado: «Grabando audio», punto rojo, contador mm:ss, barra de duración respecto al máximo de120s, historial de32 niveles del micrófono, cancelar y detener/escuchar. Preview separado de envío; indicador giratorio «Enviando…» hasta respuesta. Respeta movimiento reducido en transiciones/indicador. Las barras no son números aleatorios: Android lee MediaRecorder.getMaxAmplitude y web lee RMS con Web Audio. Silencio mantiene las barras bajas y contador activo.

Verificación:228 pruebas/49archivos, incluyendo estado grabando, avance0:02, lectura de nivel y cancelación. TypeScript/lint dirigidos correctos. Compilaciones debug/release correctas. EmuladorAndroid: nivel active=true durante grabación silenciosa/amplitude0; tras cancelar active=false. No envío WhatsApp ni pruebaSamsungfísico. Actualización1.0.4/code5 mismafirma; publicaciónpendientealcrear esta nota.

Referencia oficial revisada: https://about.fb.com/news/2022/03/new-voice-message-features-on-whatsapp/ . Esta entrega no añade pausa/reanudación; detener abre escucha previa y cancelar descarta.

Publicación completada en producción: APK1.0.4/code5,30.988.837bytes, SHA2568617b1980ad77354825434878f232635693a93b3a0475995d332911ba65d31ec. Verificado que paquete contiene textos del nuevo estado. Pendiente optimización de empaquetado: excluir public/descargas de futuras compilaciones móviles para evitar incluir instaladores anteriores como recursos.
