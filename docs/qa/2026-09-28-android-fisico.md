# Prueba física inicial — Samsung S24 Ultra — 28/09/2026

## Entorno
Teléfono real conectado por USB y autorizado por Jorge. Android 16, APK 1.0.16/code17. Mobile Next MCP instalado en carpeta temporal externa al proyecto; control por conexión local, sin reservar dispositivos en la nube. Sin cambios al código de la aplicación.

## Comprobado
- El MCP reconoce el teléfono real y abre Mister Service.
- Capturas del dispositivo confirman bandeja WhatsApp y navegación inferior.
- Botón IA: arrastre vertical cambia su posición sin abrir el panel. Toque posterior abre. Teclado Samsung aparece y el campo queda encima. Atrás oculta teclado y minimizar vuelve a la bandeja. No se escribieron ni enviaron consultas.
- Navegación Atención → Clientes → ficha: mapa con mosaicos y marcador visible.
- Cambio horizontal/vertical: ficha y botón IA permanecen visibles. Se devolvió a vertical.
- Atención → Solicitudes: aparecen búsqueda, estado y empresa tras terminar la carga. Contexto de cliente visible; Ver todos vuelve al área sin selección.

## Observaciones y límites
- Al abrir Inbox se observó parte de su título bajo la cabecera; falta comprobar si es desplazamiento conservado o un problema de posición inicial.
- La lista de clientes cambió entre la primera captura y el toque: la ficha abierta tenía un nombre distinto al de la primera fila observada. No se concluye asociación incorrecta: debe reproducirse esperando la carga completa y sin intervención simultánea del usuario.
- El árbol de accesibilidad devolvió el WebView sin sus controles internos; se usaron capturas para dirigir los toques.
- Persistencia tras reiniciar la APK, cámara, GPS real y segundo plano, ponche y permisos por rol NO comprobados en esta pasada. Mostrar el mapa no comprueba adquisición de GPS.
- No se guardaron datos, pagos, ponches, mensajes o cambios de clientes.
- El botón IA quedó desplazado hacia arriba durante la prueba; se conserva como preferencia local.

## Aclaraciones nuevas de Jorge (definición, no implementadas aquí)
- Contadores y pendientes discretos dentro de cada acceso del software, junto al nombre. Sin avisos invasivos. Definir qué cuenta cada módulo.
- Ubicación del técnico durante su jornada, entrada a salida, incluso en segundo plano, con permiso e indicador visible. Falta contrastar conexión existente con ponche y pruebas con cuenta/técnico apropiados.

Evidencia: `evidencias-android-20260928/atencion-samsung.jpg`.
Fuente: chat 01a0e013-8ae2-7ed0-be3e-23142f7e2ae3.

## Repetición dirigida
- Inbox abierto desde el área: título completo. El recorte inicial no se reproduce en entrada nueva; podría ser desplazamiento conservado.
- Clientes después de carga completa: primera fila Miguel Rosario, toque abre ficha Miguel Rosario. No se reproduce asociación incorrecta; el cambio inicial ocurrió durante carga de lista.
- Opciones de conversación: abre el diálogo y tocar fuera lo cierra sin elegir ninguna acción.
- Sesión actual administrativa. Para seguimiento de jornada hace falta un escenario de técnico controlado que no altere asistencia/nómina real.

## Sesión técnica y GPS — continuación física
Jorge eligió QA Técnica sidepanel y autorizó su uso. Introdujo personalmente la contraseña e inició sesión. No se leyó ni guardó esa contraseña.

Resultados:
- Inicio de sesión técnico confirmado visualmente; vista sin órdenes asignadas.
- Iniciar jornada solicitó permiso de ubicación precisa; concedido para probar el seguimiento autorizado por Jorge.
- Primera ubicación recibida por el servidor de la cuenta QA, precisión aproximada 25 m. Lectura administrativa limitada a estado y marcas temporales; no se exportaron coordenadas.
- Al pasar a Inicio de Android (segundo plano), no hubo nueva recepción en la ventana observada: última recepción llegó a tener 133 segundos. Al volver, la app mostraba ubicación retrasada y error de sincronización. NO aprobado el segundo plano.
- Finalizar jornada desde la app volvió a estado detenido.
- Repetición con permisos concedidos: el servidor creó una nueva jornada activa, pero la pantalla volvió a «Jornada detenida» sin última ubicación recibida en esa sesión. Discrepancia confirmada entre UI y servidor. Causa raíz aún no demostrada; no atribuirla únicamente a permisos, red o GPS.
- Limpieza: se cerró únicamente la segunda jornada QA creada durante esta prueba, mediante transacción administrativa condicionada a su instante de inicio, y se dejó `jornadaActiva:false` en su ubicación. Lectura posterior confirmó `activa:false`. No se borraron registros ni se creó asistencia/nómina.
- Código actual: `src/mobile/jornada.ts` y `api/movil/estado.ts` administran jornadas separadas; `Ponche.tsx` no llama a iniciar/detener esa jornada. La vinculación automática al ponche acordada hoy sigue pendiente.

Evidencias: `jornada-gps.jpg`, `jornada-detenida-segundo-intento.jpg`. Pendientes: corregir/reprobar sincronización y coherencia de estado, vincular ponche, pruebas de cámara en un flujo QA con datos controlados. La cuenta no tenía órdenes para probar evidencias de servicio sin crear una orden.

## Orden ficticia y cámara — segunda pasada
Jorge autorizó crear una orden de prueba y dejar el Samsung conectado para continuar. Se creó OS-0011, cliente existente QA Test, equipo Samsung TEST, modelo QA-ANDROID-20260928, asignada a QA Técnica sidepanel, cita 28/09/2026 12:00. Descripción explícita de prueba sin reparación ni cobro.

- La orden aparece en el Samsung con la cuenta QA.
- Iniciar chequeo pidió permiso de cámara; se concedió mientras se usa la app. Se abrió la cámara nativa, se capturó una imagen desenfocada de prueba y se aceptó. No representa un equipo reparado.
- Resultado visible: Chequeo iniciado y fase En diagnóstico.
- Lectura posterior del registro confirmó inicioChequeo, fotoUrl, origen camara_nativa y coordenadas presentes; no se exportan coordenadas ni URL de almacenamiento.
- Agregar nota técnica permitió escribir con teclado Samsung y guardar diagnóstico simulado, sin precio. El detalle mostró la nota completa y el servidor confirmó su persistencia.
- Tras terminar y relanzar la APK, la sesión y la orden En diagnóstico permanecen. Jornada detenida visible y servidor con activa:false.
- No se enviaron WhatsApp ni avisos manuales a oficina, no se registraron pagos ni ponches, no se aprobaron presupuestos. La creación/asignación y el avance de fase pueden generar notificaciones internas normales.
- El cierre está condicionado a presupuesto aprobado por oficina; cotización, aprobación, cierre, cobro y comisión no se certifican con esta prueba. OS-0011 queda abierta en diagnóstico para reproducir y continuar.

### Hallazgo visual confirmado
La cabecera técnica en vertical comprime el nombre a «Q…» y divide «1 cita hoy» en varias líneas mientras Conocimientos y tres botones ocupan el ancho. Se repite tras reiniciar. Referencia: src/pages/TecnicoVista.tsx:805 y :814. Criterio de corrección: nombre legible y acciones accesibles sin aplastar la identidad en 375 px y en el Samsung real, también al rotar.

Evidencias: evidencias-android-20260928/orden-qa-chequeo.jpg y orden-qa-nota.jpg. Esta sección actualiza los límites de la pasada inicial: cámara, persistencia y ubicación puntual sí fueron comprobadas; el seguimiento continuo sigue fallando.

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
