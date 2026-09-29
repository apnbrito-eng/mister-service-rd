# Revisión de fallas Android para Claude — 28/09/2026

## Alcance y evidencia
APK 1.0.16 (17), Samsung S24 Ultra Android 16 físico, control local Mobile Next MCP. Informe detallado: [Pruebas físicas](2026-09-28-android-fisico.md). No se modificó código de producción ni se publicó en esta pasada.

## Prioridades
1. **Alta: seguimiento GPS en segundo plano no aprobado.** Primera recepción llegó al servidor; tras enviar la app a segundo plano la muestra envejeció hasta 133 segundos sin nueva recepción. Al volver apareció retraso y error de sincronización. Revisar src/mobile/jornada.ts, servicio nativo y api/movil/estado.ts. La duración observada no prueba todos los escenarios de ahorro de batería, bloqueo o pérdida de red.
2. **Alta: jornada local detenida con servidor activo.** Segundo intento, con permisos ya concedidos, reprodujo divergencia. Se cerró solo esa jornada QA con transacción condicionada a su inicio. Investigar llamadas a detenerJornada(false), especialmente src/mobile/jornada.ts:29 ante 401/403/409. Es una hipótesis de causa, no una causa demostrada. No atribuirlo a Samsung sin trazas.
3. **Función pendiente: conexión con ponche.** Entrada y salida deben controlar seguimiento según decisión de Jorge. Actualmente la jornada tiene botones independientes y Ponche no invoca su inicio/finalización. Diseñar recuperación tras cierre de app y reconciliación con servidor; no ampliar permisos sin necesidad.
4. **Media: cabecera de técnico comprimida.** Nombre reducido a Q… y contador partido en vertical. src/pages/TecnicoVista.tsx:805, :814. Evidencia en orden-qa-chequeo.jpg.

## Lo que sí pasó
Acceso QA, asignación/carga de OS-0011, cámara nativa, subida de foto, ubicación puntual de inicio, cambio a diagnóstico, nota técnica, detalle y persistencia al relanzar. Pasada administrativa: arrastre/toque IA, teclado, mapa de cliente, giro, navegación y cierre contextual al tocar fuera.

## No son fallas confirmadas
Título Inbox inicialmente recortado y cambio de primera fila durante carga de clientes no se reprodujeron esperando carga nueva. Primer llenado de fecha por automatización no actualizó React; corregido por interacción de teclado y guardado verificado. No contarlos como bugs probados.

## Escenario que queda
OS-0011, cliente QA Test, modelo QA-ANDROID-20260928, técnico QA Técnica sidepanel. Conservada en diagnóstico con foto y nota simuladas. Jornada GPS detenida, sin pagos ni ponches nuevos. No borrar evidencias. El cierre requiere aprobación de oficina; cotización, aprobación, cierre, pago/comisión, desconexión prolongada, pantalla bloqueada y denegación/revocación de permisos quedan pendientes de una pasada específica.

## Revisión solicitada
Contrastar hallazgos con código y pruebas en modo lectura. Separar fallas reproducidas, hipótesis y funciones pendientes. Proponer correcciones mínimas y pruebas para cada una; comprobar reconciliación de jornada, tiempos de captura, respuestas 409, recuperación de red y límites de permisos. No modificar registros reales, reglas ni publicar durante la revisión. No incluir credenciales, coordenadas o URLs privadas en el informe.

## Prueba cruzada técnico–administración — 28/09, 16:29–16:35
Solicitud explícita de Jorge: Samsung como técnico y web PC como administración.

1. Web administrativa confirmó foto de inicio, ubicación puntual y nota del Samsung.
2. Administración avanzó OS-0011 a En cotización; Samsung reflejó el cambio sin reinicio.
3. Técnico envió otra nota identificada QA SIMULACION con precio ficticio RD$100. La web recibió nota y propuesta automáticamente.
4. Administración aprobó RD$100. El Samsung mostró precio aprobado y habilitó Marcar realizado.
5. Técnico abrió cierre, capturó segunda foto nativa (oscura, solo evidencia de prueba), respondió checklist simulado y No usé piezas. Cámara ofreció etiquetas de ubicación, se canceló ese ajuste opcional.
6. Sin firma, Cerrar servicio permaneció desactivado. Se dibujó una T de prueba, sin representar firma de cliente real; se habilitó el botón. El cierre técnico guardó foto/checklist/marca y pasó a Trabajo realizado, visibles en web. Se rechazó programar mantenimiento (Ahora no).
7. Administración avanzó a Cerrado; Samsung pasó a 0 citas y dejó de mostrar la orden activa.

### Hallazgo contable a contrastar con la regla de negocio
Al cerrar desde administración se creó comisión RD$10; el Samsung mostró RD$10/1 orden. La web conserva total RD$100, pagado RD$0 y pendiente RD$100. No hubo cobro ni pago de comisión. La auditoría registra la comisión creada por Jorge durante el ensayo. src/utils/comisiones.ts:952 (registrarComisionPorOrden) comprueba precio/aprobación y fase, pero calcula sobre precioFinal y asigna fechaCobro al instante actual; no valida pago recibido en ese recorrido. La existencia de comisión sin cobro está reproducida; decidir si la regla de negocio permite devengarla antes de cobrar.

**Datos QA conservados para revisión:** OS-0011 cerrada, precio ficticio RD$100, saldo ficticio RD$100 y comisión pendiente ficticia RD$10, garantía simulada 60 días y marca T de prueba. Deben excluirse/revertirse antes de liquidar nómina o usar reportes productivos. No se eliminaron registros ni se registraron pagos ficticios para saldar el balance. La prueba de cobro/facturación no está realizada.

Evidencias: orden-qa-realizada.jpg y orden-qa-cerrada.jpg en evidencias-android-20260928/. Sin corrección de código ni despliegue.

## Actualización tras decisión de Jorge y correcciones
Comisión al terminar trabajo confirmada; no exigir cobro previo. Importes ficticios OS-0011 neutralizados a0 con evidencia conservada. Correcciones GPS/ponche/cabecera implementadas y probadas localmente. Ver [informe de cambios y límites](2026-09-28-correcciones-jornada-ponche.md). Las secciones previas son evidencia histórica; sus pendientes monetarios ya están neutralizados. Publicación y prueba física de la nueva versión siguen pendientes.
