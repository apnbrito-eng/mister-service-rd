# Corrección de expediente y ubicación desde Inbox

Objetivo: atender el reporte de Jorge del 06/10/2026. Responsable: Codex.

Al seleccionar «Guardar en expediente del cliente», el panel abre directamente el formulario de expediente. Si el cliente no existe, ofrece «Crear expediente del cliente» y conserva el mensaje seleccionado durante el registro. Al guardar la nota, el expediente permanece abierto.

El registro de cliente desde chat permite pegar una ubicación o enlace de mapas, muestra el punto y guarda latitud/longitud automáticamente. Los enlaces cortos de Google Maps se resuelven tras 400 ms. Una respuesta antigua no reemplaza una ubicación nueva; un enlace inválido o pendiente bloquea el guardado. El editor de clientes existentes también resuelve automáticamente los enlaces cortos.

El endpoint de ubicación admite perfiles de oficina con permiso de crear o modificar clientes; conserva la restricción de rol y el resolver seguro. No se cambian reglas Firestore ni se crean módulos de expedientes nuevos.

✅ Verificación: 1257 pruebas de integración en 183 archivos PASS, incluyendo diez casos nuevos de permisos, creación, conservación del mensaje y ubicación automática. Evidencia: /tmp/inbox-fix-all-tests.log. Build frontend/API PASS (/tmp/inbox-fix-build.log), lint dirigido PASS (/tmp/inbox-fix-final-lint.log), cazadores de regresión PASS (/tmp/inbox-fix-regression.log).

Las pruebas utilizan datos ficticios; no se registraron clientes ni pagos reales para QA. La publicación y la instalación física se documentarán al verificarlas.
