# Pendientes de piezas — auditoría y arquitectura propuesta

29/09/2026. Solo lectura de producción; ninguna transición implementada.

## Situación comprobada

- `Standby.tsx:50/61/73` consulta tres fuentes: standby_piezas, movimientos_piezas y órdenes con enStandby. No son un flujo único.
- Registro manual `Standby.tsx:110` no guarda ordenId. `EquiposTaller.tsx:100` crea equipo/standby atómicamente, pero tampoco guarda ordenId ni equipoId en el registro de pieza. No presumir vínculos por nombre.
- `StandbyPieza` (`types/index.ts:1134`) permite ordenId opcional; no tiene foto, proveedor ni autorización.
- Estados actuales: buscando, importada, dificil, llego. Llegada actual escribe estado y después notifica: dos pasos susceptibles a aviso perdido; doble operación concurrente puede duplicar aviso.
- `Standby.tsx:130` notifica únicamente si hay ordenId y tecnicoId. No avisa a coordinación ni responsable de seguimiento. `notificaciones.service.ts:9` exige auth.uid, pero ese caller usa tecnicoId directamente, sin resolver un posible personal.id legado.
- Inventario tiene proveedorSugerido de texto; PiezaUsada tiene proveedor de texto. No se encontró catálogo compartido de suplidores en las fuentes inspeccionadas.
- Fotos de piezas usadas existen en `piezas.service.ts`; no equivalen a solicitud de pieza. `aprobarPiezasDeOrden` valida piezas ya registradas en cierre, no autoriza compra anticipada.
- Firestore `standby_piezas` permite leer a staff y escribir a oficina (`firestore.rules:579`). Fotos-piezas cae actualmente en comodín autenticado de Storage, sin regla específica de tamaño/MIME.

## Propuesta por etapas

1. **Vínculo fiable:** registro de pieza vinculado a orden seleccionada por ID, descripción y foto. No enlazar registros viejos por nombre. Mostrar filas legadas sin vínculo para corrección humana. La misma acción que marca pendiente debe guardar pieza y bloqueo asociado atómicamente.
2. **Autorización y llegada:** autorización separada del estado logístico para conservar los cuatro estados existentes. Guardar actor, fecha y motivo. Llegada crea aviso idempotente y tarea de coordinación; no agenda instalación ni elimina stand-by automáticamente.
3. **Coordinar instalación:** persona responsable acuerda fecha; usar flujo de reagendar existente. Resolver bloqueos por pieza, sin reactivar orden mientras queden otras pendientes. Historial por evento, sin alterar fase financiera.
4. **Suplidores:** catálogo propio con nombre/contactos activos y selector. Preparar mensaje con pieza/foto/orden de referencia, revisión humana antes de compartir. El número empresarial emisor está pendiente de confirmar: wa.me abre la cuenta del dispositivo, no garantiza enviar desde una línea empresarial concreta. API WhatsApp exige selección de línea autorizada y política de ventana/plantilla; no asumir que una conversación nueva permite texto libre.

## Touch-list propuesto y consumidores

Primera unidad: `src/pages/Standby.tsx`, `src/types/index.ts`, nuevo servicio de pendientes y formulario aislado; pruebas. Agregar punto de creación en componente de detalle específico sólo tras identificar dueño del botón de stand-by; excluir Ordenes.tsx y no ampliar páginas críticas sin QA declarada. Adaptación de reglas/Storage sólo si requiere nuevo contrato protegido; índices según query final. Segunda unidad catálogo separado de proveedores y permisos, sin core contable.

Consumidores a preservar: Sidebar:89, Dashboard:131, TecnicoVista:182, OrdenDetalle:276, Ordenes:784 y api/_lib/iaTools:1282/1459. Al superar cinco consumidores, mantener campos opcionales y dividir las fases; probar estados legacy sin cambiar cada pantalla de una vez.

## Historial y patrones

- Standby: 2bd5a01 (19/04 reagendar por pieza y avisar llegada), 3733237 (05/05 destinatarioId→userId), 1b75ca6 (07/05 renombre Pendiente de piezas).
- EquiposTaller: dc72250 (12/05 atomicidad cross-collection P003).
- Piezas.service: 48a775b (23/04 piezas usadas), 14b7419 y 5dc4281 (24/04 validación admin/conduces).
- Notificaciones: 305a9e5 (10/05 guard contra destinatarioId legado).
- P003 transacción para estado+evento+aviso; P006/P007 UID real de destinatario; P009 parsers; P011 estados terminales intactos; P020 preservar timestamps/FieldValue; P005/P013 despliegue de reglas si cambian.
- Compras, costos, inventario y comisiones sólo se afectan con autorización explícita de una etapa contable posterior; autorización logística no genera gasto, pago ni deducción por sí sola.

## Pruebas mínimas antes de construir

Orden con dos piezas, llegada parcial, autorización rechazada, aviso repetido/concurrente, técnico legado sin UID válido, destinatarios desactivados, registro antiguo sin ordenId, foto inválida y fallo de subida, permisos oficina/técnico, cancelar mensaje sin envío, no cambio automático de agenda/finanzas.

Pendiente de definición: roles que autorizan, catálogo definitivo y línea WhatsApp empresarial. No se enviaron mensajes ni se modificaron datos.
