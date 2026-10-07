# Corrección de expediente y ubicación desde Inbox

Objetivo: atender el reporte de Jorge del 06/10/2026. Responsable: Codex.

Al seleccionar «Guardar en expediente del cliente», el panel abre directamente el formulario de expediente. Si el cliente no existe, ofrece «Crear expediente del cliente» y conserva el mensaje seleccionado durante el registro. Al guardar la nota, el expediente permanece abierto.

El registro de cliente desde chat permite pegar una ubicación o enlace de mapas, muestra el punto y guarda latitud/longitud automáticamente. Los enlaces cortos de Google Maps se resuelven tras 400 ms. Una respuesta antigua no reemplaza una ubicación nueva; un enlace inválido o pendiente bloquea el guardado. El editor de clientes existentes también resuelve automáticamente los enlaces cortos.

El endpoint de ubicación admite perfiles de oficina con permiso de crear o modificar clientes; conserva la restricción de rol y el resolver seguro. No se cambian reglas Firestore ni se crean módulos de expedientes nuevos.

✅ Verificación: 1257 pruebas de integración en 183 archivos PASS, incluyendo diez casos nuevos de permisos, creación, conservación del mensaje y ubicación automática. Evidencia: /tmp/inbox-fix-all-tests.log. Build frontend/API PASS (/tmp/inbox-fix-build.log), lint dirigido PASS (/tmp/inbox-fix-final-lint.log), cazadores de regresión PASS (/tmp/inbox-fix-regression.log).

Las pruebas utilizan datos ficticios; no se registraron clientes ni pagos reales para QA. La publicación y la instalación física se documentarán al verificarlas.

✅ Publicación verificada: commit a3d553f8efe311832c7058397821e0cbbebe5cc1; deployment dpl_HFwhBmY7r83GvxnyXZWQh8sYyHkN promovido al dominio oficial. HTTP /version.json devuelve a3d553f, builtAt 2026-10-07T00:21:10.835Z. Evidencia: /tmp/inbox-candidate-version.json, /tmp/inbox-vercel-promote.log, /tmp/inbox-official-version.json.

✅ APK oficial 1.0.22/code23 instalada mediante adb install -r (Success), sin desinstalación. SHA256 local y descargado del dominio oficial coinciden: 7d371a3c99f2a852cee9baba06f3ed0b4140bfbc7e20e51666b298a2c5dedabf. Firma oficial y 257 recursos verificados por scripts/mobile/build-oficial.mjs; evidencia /tmp/mister-service-inbox-1.0.22-candidata/verification.txt y /tmp/inbox-native-build.log.

⏳ Recorrido físico pendiente: Samsung bloqueado al comprobar apertura. No se certifica la sesión visible ni el guardado real en el dispositivo. Los casos funcionales están cubiertos por pruebas con datos ficticios. Rama productiva respaldada en GitHub; main pendiente de consolidación.
