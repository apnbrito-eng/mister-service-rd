# Ensayo aislado del CRM

Entorno exclusivamente local: Firebase Auth, Firestore y Storage en emuladores con proyecto `demo-mister-ensayo`. Usa las reglas del repositorio; no sustituye la autenticación. No carga archivos `.env` ni credenciales de producción.

Desde la raíz, en procesos separados:

```sh
firebase emulators:start --only auth,firestore,storage --project demo-mister-ensayo --config firebase.ensayo.json
npx tsx tests/ensayo/seed.ts
npx tsx tests/ensayo/server.ts
```

Abrir `http://127.0.0.1:5190`. Las cinco cuentas ficticias por rol están definidas en `seed.ts`; solo funcionan en el emulador. No reutilizar esas credenciales fuera del ensayo.

```sh
npx tsx tests/ensayo/flujo-api.ts
```

Este último recorrido crea una orden API separada y prueba notas, traspaso, presupuesto, anticipo por transferencia, confirmación manual, saldo en efectivo y rendición parcial. Usa sesiones del emulador y las rutas HTTP reales. No sustituye la prueba visible de la orden registrada en el navegador.

## Aislamiento y límites

- Solo se montan las rutas CRM de orden y cartera. Las otras rutas API responden bloqueo de ensayo.
- CSP restringe conexiones del navegador a loopback; no es un bloqueo de navegación a enlaces externos. No usar enlaces de teléfono/WhatsApp externos.
- GPS se simula no disponible exclusivamente mediante transformación del servidor de ensayo. Producción conserva su servicio GPS.
- WhatsApp, Meta, bancos y modelos IA no se invocan. La conversación ficticia es una semilla local, no un mensaje recibido por WhatsApp.
- Fotos de propuesta admiten Storage local solo para el proyecto demo y el host exacto del emulador; producción mantiene la validación HTTPS de Storage.
- No hay persistencia/exportación automática al apagar los emuladores.

## Resultado 17/09/2026

En navegador: creada cita ficticia, asignado técnico, confirmada cita, guardada nota interna, enviado y aceptado traspaso con la operaria. Técnico ve la visita. Selección de foto bloqueó la pestaña del navegador integrado; no se verificaron firma, cierre técnico ni facturación de punta a punta.

API con autenticación del emulador: pasó presupuesto, separación de abonos pendientes/confirmados, saldo 8000→5000→0, dos recibos, rendición de efectivo 3000+2000 sin duplicar ingreso. Bloqueó autoaprobación del técnico, confirmación de pago por operaria, recepción por usuario incorrecto, exceso de rendición y revisión previa al cierre.

Corregido en código el inicio: cancelar selector restaura botón; confirmación GPS dentro del sistema; historial identifica GPS no verificado. Tres pruebas de componente pasan. Suite previa de 127 también pasó; TypeScript correcto. No desplegado.

## Actualización: recorrido visible completado el 17/09/2026

Chrome, cuentas ficticias, sin conexiones externas: OS-0001 llegó a cierre técnico con foto, firma ficticia, pieza Bomba ficticia de 3000 y excepción GPS no verificado. Propuesta aprobada por 8000, transferencia 3000 confirmada por coordinadora, efectivo 5000 recibido por técnico y entregado a oficina. Se emitió CG-00001 desde Documentos del chat. Resumen final: cerrado, confirmados 8000, pendientes 0, saldo 0, revisión de supervisión registrada.

**Resultado: recorrido ejecutado, NO aprobado para producción.** Comisiones mostró una comisión pendiente de 1355.93, costo de piezas 0 y base 8000 aunque el cierre tiene pieza por 3000. Causa localizada: sin cotización vinculada, ProcesarFacturacionModal carga un único defaultItem de servicio por todo el total; calcularCostoPiezasDeItems solo resta líneas de tipo pieza. No se corrigió ni liquidó esa comisión ficticia. Hace falta preservar/reconciliar las piezas aprobadas al preparar el documento y probar de nuevo la comisión.

Otro hallazgo: la revisión de supervisión separada se pudo registrar después de emitir; actualmente no es un requisito de emisión. La responsable/etapa siguió en operaria tras cierre. La revisión de comisión se encuentra en otra pantalla.

Suite fresca: 25 archivos, 130 pruebas aprobadas. Esto no cubre el fallo de transferencia de piezas a factura. WhatsApp y Meta reales siguen sin probar; no se enviaron eventos ni mensajes.

### 17/09/2026 - Correccion posterior y repeticion
El fallo anterior de costo de piezas fue corregido. Facturacion consulta la propuesta por API autenticada, exige aprobacion y conserva piezas/costos y total. Desglose inicial: piezas a costo y servicio como diferencia; oficina revisa antes de emitir. Total inferior a costo de piezas queda bloqueado. Legacy sin propuesta conserva su fallback.
OS-ENSAYO-PIEZAS, copia ficticia local: CG-00002 emitido con pieza3000 + servicio5000; Comisiones muestra costo3000 y comision755.93 con formula vigente. Primer caso conservado como evidencia, sin liquidaciones.
Suite133/133 antes del ultimo ajuste de tipos API. Pendientes: revision como condicion de emision, etapa final y etiqueta Base (muestra8000 aunque calculo descuenta costo); WhatsApp/Meta reales no probados. Sin despliegue.

Verificacion final: TypeScript frontend y API correctos; suite fresca 26 archivos / 133 pruebas aprobadas despues de la correccion.

## 18/09/2026 00:28 - Continuacion nocturna
Corregido en checkout y copia runtime: emision CRM requiere supervision revisada y pago completo en preflight del modal; reglas Firestore exigen snapshot de revision vigente (precio, pagos, cierre y tecnico), estadoPago completo y total de documento igual a precioFinal. Revision guarda snapshot y asigna supervisora como responsable; cambios de pagos invalidan revision. GET deriva etapa supervision al terminar tecnico y cerrada al facturar; muestra supervision pendiente de asignar si aun no hay revision.
Base de comisiones proporcionales corregida: ganancia neta por proporcion (antes devolvia importe bruto de lineas). Lectura de Comisiones calcula base compatible para registros proporcionales antiguos sin modificar datos.
Verificado: 136/136 tests, TypeScript frontend/API; tests/ensayo/revision-reglas.ts con SDK cliente y autenticacion del emulador rechaza factura sin revision, facturada directa, cambio de precio y saldo pendiente, acepta revision valida. Solo local, reglas NO desplegadas.
Pendiente siguiente heartbeat: repetir UI con servidor ensayo actualizado (API requiere reiniciar proceso por import estatico) y caso nuevo revisado antes de emitir; revisar etiqueta/responsable y actualizar captura/documentacion. Tests de reglas por ampliar: total diferente, tecnico distinto, pagos/cierre modificados, intento operaria. Revisar riesgos preexistentes: helpers de comision escriben antes de transaccion de factura; cambios posteriores a factura no cubiertos por nueva regla create. No afirmar endurecimiento integral. WhatsApp y Meta reales siguen pendientes de destinatario autorizado/configuracion de pruebas. No pausar seguimiento aun; queda trabajo local verificable.

## 18/09/2026 01:28 - Verificacion ampliada y bloqueo visual
Pruebas de reglas ampliadas pasan con autenticacion real del emulador: importe distinto, tecnico cambiado, cierre modificado, pago modificado y operaria rechazados. Caso valido aceptado. IDs de ensayo unicos para no confundir create/update en repeticiones. Flujo API autenticado volvio a pasar.
Preflight ahora consulta revisionVigente calculada en API con igualdad profunda del snapshot para detener cambios obsoletos antes de numero/comision; reglas mantienen defensa persistente. Suite final136/136 y ambos typechecks correctos. API local reiniciada despues del cambio.
Validacion visual bloqueada: navegador2 desaparecio; inventario muestra Chrome3 pero Mac bloqueado, intento de retomar pestaña local expiro y reinicio kernelCUA. No desactivar bloqueo ni pedir despertar durante noche. Falta repetir UI de revision->emision con cambios nocturnos.
No enviar WhatsApp/Meta ni desplegar. ComprasMeta sigue solo helper de elegibilidad, no emisor integrado. Queda deuda preexistente de comisiones antes de transaccion de factura y revisiones de facturas ya emitidas; no afirmar todo software seguro/terminado. Seguimiento se pausa esperando desbloqueo para terminar recorrido visual y preparar pruebas externas controladas.


## 19/09/2026 — Repetición visible de revisión y emisión
Ensayo local 5190, cuenta coordinadora ficticia. Copia explícita OS-ENSAYO-REVISION (ensayo-supervision-20260919), sin alterar casos previos ni producción. Antes de revisión, la emisión fue rechazada; se detectó mensaje genérico y se corrigieron las tres validaciones previas para mostrar la acción necesaria (revisión, total, pagos) sin exponer errores internos. Repetido en pantalla: muestra “Supervisión debe confirmar la revisión en Responsables antes de emitir”.
Luego se confirmó revisión desde Responsables; responsable pasó a coordinadora de prueba. Emisión CG-00003 exitosa, etapa cerrada. Comisiones muestra total8000, piezas3000, base3779.66,20%,comisión755.93 pendiente. No liquidada ni enviada por WhatsApp. Suite136/136 y TypeScript frontend pasan tras ajuste. Sigue pendiente integración externa real WhatsApp/Meta y deuda de atomicidad comisiones/factura, sin despliegue. Fuente tarea01a09b59-84f9-7543-bf2a-ff5256165bbc.
