# Organización del personal y recuperación tras limpieza

Objetivo: corregir el error reportado por Jorge al aplicar plantilla tras retirar todos los accesos excepto dirección. Responsable: Codex.

Causa verificada en AltaEquipos y api/admin/accesos.ts: guardar alias/equipo y cambiar clave de una operaria existente no la reactivaba. Registrar asistentes requiere exactamente una operaria activa y fallaba con 409. Un lote parcial anterior puede dejar alias asignados sin activar.

Cambio e2cc81a: preflight de todas las identidades/roles y responsables externas activas antes de mutaciones; dirección primero, ambas operarias después y luego integrantes. Para cuentas existentes del personal, clave y restauración si están inactivas antes de pasar a la siguiente fila. Dirección conserva claves. No se reactivan extras fuera de plantilla. La pantalla muestra Dirección, Equipo A/B, cargo, alias, cuenta nueva/reactivación y avance por persona. Reintento consulta versiones actuales y reutiliza identidades; no es una transacción global, puede haber avance parcial documentado si falla.

✅ Suite 1258 integraciones/183 archivos PASS antes del caso adicional; 4 pruebas dirigidas finales PASS, incluyendo reactivación de11cuentas, responsables antes de asistentes, extras excluidos y bloqueo de responsable externa antes de cambios. Build frontend/API, lint y cazadores PASS. Evidencias /tmp/equipos-tests.log, /tmp/equipos-tests-dirigidas.log, /tmp/equipos-build.log, /tmp/equipos-lint.log y /tmp/equipos-regression.log; precommit repite tsc/API/lint/cazadores PASS.

✅ Android1.0.23/code24 firmado oficialmente,257recursos contrastados, instalación adb -r Success; /tmp/equipos-native.log, /tmp/equipos-install.log, /tmp/mister-service-equipos-1.0.23/verification.txt.

⏳ Aplicación real de plantilla requiere Jorge introducir la clave y pulsar el formulario. No se capturó ni recuperó su contraseña. No afirmar16accesos activados hasta verificar después de aplicar.

✅ Publicación web: e2cc81a, deployment dpl_3FaTHAzU3mxDMg3h9Gra67NT6EvX READY/promovido, /version.json oficial confirma builtAt2026-10-07T01:11:00.698Z. Chrome oficial muestra Dirección/Equipo A/B y estados de cuenta. Evidencias /tmp/equipos-oficial.json, /tmp/equipos-promote.log, /tmp/equipos-organizacion-produccion.png. Primer intento Not authorized; reintento con scope oficial aceptado, esperó cola y completó.
