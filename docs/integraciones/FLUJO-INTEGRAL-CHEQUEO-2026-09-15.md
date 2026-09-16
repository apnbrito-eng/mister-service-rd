# Flujo integral del software y chequeo de RD$2,000

## Alcance y evidencia

Jorge confirma chequeo RD$2,000 utilizable durante 30 días. El sistema aún no está implantado en la operación; agenda actual en Google Calendar y atención en WhatsApp. Se solicita revisar el software completo y simplificar el recorrido.

Inventario estático de todos los archivos TypeScript de src y api: **265 archivos, 93,260 líneas**, 63 páginas, 32 archivos de servicios y 26 archivos bajo api (incluyen helpers; no son 26 endpoints). Archivo reproducible de estructura: INVENTARIO-CODIGO-FLUJO-2026-09-15.json. El inventario enumera imports, funciones exportadas, colecciones literales y operaciones detectadas por patrones. No equivale a leer manualmente cada línea, resolver todas las llamadas dinámicas ni probar cada pantalla.

Revisión profunda de esta etapa: chequeo, reactivación, búsqueda/aplicación del descuento, aprobación de reparación, cierre diario y relaciones con facturación, comisión y garantía. Se contrastó con App.tsx, mapa mental, mapa YAML y dependencias del repositorio. El mapa documental tiene información antigua (por ejemplo GPS descrito como obligatorio cuando el código permite excepción); no se usó como prueba de funcionamiento.

## Recorrido completo que debe guiar la interfaz

WhatsApp/web/llamada → cliente y equipo → cita única → técnico y operaria responsables → inicio de visita → diagnóstico con evidencias → decisión del cliente gestionada por oficina.

Desde ese punto existen tres salidas legítimas:

1. **Repara ahora:** propuesta de piezas y servicio → negociación y autorización → ejecución → evidencias/autorización de cierre → cobro y comprobante → garantía y seguimiento.
2. **Solo chequeo:** técnico propone ese resultado y motivo → oficina autoriza → cierre de chequeo → cobro RD$2,000 y comprobante → beneficio disponible hasta su vencimiento → seguimiento del cliente.
3. **No se pudo realizar:** cliente ausente, falta de acceso, reprogramación, pieza pendiente u otra excepción → motivo y próxima acción. No simular un servicio terminado ni generar beneficio de chequeo por una visita no ejecutada.

Si vuelve para reparar durante la vigencia: localizar el chequeo pagado → mostrar aplicación propuesta → reservar/aplicar según regla confirmada → autorizar reparación → nuevo ciclo operativo vinculado al chequeo → cobrar diferencia → conservar comprobantes y pagos anteriores.

Ejemplo de experiencia propuesto: reparación RD$7,000; chequeo previo RD$2,000; restante RD$5,000. Mostrar esos tres renglones y fecha exacta de vencimiento. No presentar el chequeo como un pago nuevo de RD$2,000 ni volver a cobrarlo.

## Qué hace el código hoy

- `configEmpresa.service.ts`: valor de respaldo RD$2,000, configurable. Esto confirma el default, no la configuración real guardada de producción.
- `ModalSugerirSoloChequeo.tsx` permite proponer monto; `resolverSugerenciaSoloChequeo` en ordenes.service.ts permite a oficina aprobar/rechazar y fija soloChequeo/precio/aprobación. El técnico no debe decidir unilateralmente esa salida.
- `descuentoChequeo.ts`: vigencia 30 días; resta hasta el precio de reparación, nunca por debajo de cero para valores normales positivos.
- `buscarChequeoVigentePorCliente` (ordenes.service.ts:826): busca por clienteId + equipoTipo + tipoCierre=solo_chequeo, limita a 20, descarta reactivadas/eliminadas y ordena los resultados obtenidos por fecha. Toma cierreServicio.fechaCierre, fechaCierre o updatedAt, y precioChequeo/precioFinal/precioAprobado.
- Tres pantallas aprueban precio: Ordenes, OrdenDetalle y AgendaDia. Comparten helpers aritméticos, pero conservan handlers de lectura/aprobación separados.
- `reactivarOrdenPostChequeo`: conserva cierreChequeoHistorico y comprobante anterior, limpia cierre y pagos de la orden activa, cambia tipoCierre y marca reactivadaPostChequeo. No se comprobó una pérdida del comprobante fiscal; sí se comprobó desconexión con la búsqueda del beneficio.
- Facturación copia referencia/importe del descuento a la factura. Nómina y comisiones tienen tratamiento de solo chequeo y lectura de descuentos; requieren validación integral con los dos ciclos de una misma visita/equipo.

## Brechas comprobadas

### Crédito desconectado al reactivar

La búsqueda exige tipoCierre=solo_chequeo y además descarta reactivadaPostChequeo=true. La reactivación cambia precisamente esos campos. Las tres pantallas buscan el beneficio con esa función, sin usar cierreChequeoHistorico como fuente alternativa. Un chequeo puede quedar conservado como historial y no disponible para su aplicación.

### No verifica pago para ofrecer el beneficio

El buscador utiliza precios, sin comprobar montoPagado, confirmación bancaria o un pago confirmado asociado al chequeo. Una orden con precio RD$2,000 y montoPagado=0 se devuelve como chequeo vigente. Debe separarse importe presupuestado de chequeo efectivamente pagado. Pendiente concretar cómo tratar pagos parciales y transferencias por confirmar.

### Vigencia basada en datos modificables o incorrectos

Una fecha futura devuelve días positivos y se considera vigente. El fallback updatedAt puede mover la fecha efectiva del chequeo al editar un registro antiguo; no debe utilizarse como prueba de fecha de servicio o pago. La vigencia se calcula en bloques de 24 horas desde cierre, no como una política explícita de calendario desde pago. Debe confirmarse el inicio del plazo y qué ocurre exactamente el día 30.

### Límite antes de ordenar

La consulta toma 20 documentos sin orden cronológico y solo luego los ordena. El chequeo más reciente puede quedar fuera. Se reprodujo con 21 registros simulados.

### Uso único no modelado

Los campos descuentoChequeoPrevio* se guardan en la reparación destino, pero en el recorrido revisado no hay una reserva/consumo transaccional único del beneficio origen. Si la política es una sola aplicación, dos órdenes pueden proponer el mismo beneficio. Tampoco se vuelve a validar la vigencia contra un estado fresco dentro de una transacción de aprobación; una pantalla abierta puede conservar una elegibilidad antigua.

### Mismo tipo no garantiza mismo equipo

clienteId + equipoTipo puede coincidir con dos lavadoras distintas del mismo cliente. Si el beneficio es para el mismo equipo físico, se necesita una referencia de equipo (identificador interno, serial cuando exista, marca/modelo y evidencia suficiente). No se asumirá que sirve para otro equipo: se preguntó a Jorge.

### Descuento parcial sin saldo explícito

El helper limita el descuento al importe de reparación. No modela un saldo remanente del chequeo. Debe decidirse si el beneficio es de aplicación única sin remanente o si permite consumo parcial. Tampoco inventar devolución en efectivo ni transferencia entre clientes.

### Operación, venta y caja no son lo mismo

CierreDia.tsx:92–110 selecciona órdenes por fecha de cierre y suma precioChequeo/precioFinal/precioAprobado como totalIngresos, no pagos confirmados. EstadoResultado lee facturas y gastos. Reactivar una orden modifica los campos que usa la vista dinámica de cierre. Se necesita reconciliar reportes contra eventos/pagos/comprobantes conservados; no concluir que los cobros históricos desaparecieron sin comprobar cada reporte.

## Modelo más sencillo para trabajar

**Una ficha del cliente y equipo; ciclos de trabajo vinculados; un beneficio de chequeo independiente.** La visita original permanece como chequeo terminado/pagado. La reparación posterior se vincula como continuación visible en la misma ficha. No es obligatorio abrir otra pantalla ni borrar/reutilizar el historial anterior.

Propuesta de beneficio: origen (visita/pago), cliente, equipo, monto reconocido, fecha de origen confirmada, venceEn, estado disponible/reservado/aplicado/vencido/anulado, reparación destino y auditoría. Política pendiente: uso único, mismo equipo, inicio de plazo, cancelación de reserva y tratamiento de saldo. La operación de reservar/aplicar y su vínculo a reparación deben guardarse de forma atómica y admitir reintentos seguros.

El técnico ve la visita actual y el alcance aprobado. La operaria ve además el beneficio disponible, la propuesta y el pendiente de cobro. Caja conserva el pago del chequeo y el cobro posterior sin contar dos veces el mismo dinero. IA consulta esos registros y explica el saldo/vencimiento, pero no crea derechos ni autoriza descuentos por deducción de una conversación.

## Organización funcional propuesta

| Espacio de trabajo | Qué reúne | Qué continúa separado internamente |
|---|---|---|
| Atención | WhatsApp, cliente/equipo, solicitudes, cita y seguimiento | Consentimientos, historial y conversaciones |
| Visita/servicio | Agenda, llegada, diagnóstico, propuesta, aprobación, piezas y cierre | Permisos técnico/oficina, versiones y evidencias |
| Cobro | Chequeo pagado, beneficio, cotización, pagos, comprobantes y garantía | Pago, venta, beneficio y documento no son el mismo registro |
| Equipo | Asignación, asistencia, comisiones y nómina | Supervisión operativa y autorizaciones financieras |
| Recursos | Tarifario, inventario y conocimiento aprobado | Costos, precios comerciales y contenidos de IA |
| Marketing/seguimiento | Campañas, consultas, clientes que no repararon y retorno | Mensajes requieren canal/consentimiento y aprobación aplicables |
| Dirección | Caja, resultados e indicadores | Ventas, efectivo, saldos y trabajo realizado diferenciados |

La agrupación visual anterior ya existe parcialmente. Lo pendiente es unificar las decisiones y transacciones compartidas; juntar enlaces no elimina inconsistencias de datos.

## Pruebas realizadas y límites

Sonda aislada en `tests/auditoria/chequeo-brechas.test.ts`, configuración separada `tests/auditoria/vitest.config.ts`. Comando desde repo: `npx vitest run --config tests/auditoria/vitest.config.ts`.

Resultado: 5 casos, 1 correcto y 4 fallos que reproducen las brechas descritas. Correcto: RD$7,000 menos RD$2,000 = RD$5,000. Fallos: fecha futura, chequeo no pagado, reactivación y límite de 20. Firestore simulado, sin lecturas ni escrituras de datos reales. Los fallos son problemas abiertos, no deben contabilizarse como pruebas aprobadas ni incorporarse silenciosamente a la suite regular de 97 pruebas anteriores. El caso de uso único es revisión de código, no prueba concurrente ejecutada.

## Orden de corrección

1. Confirmar contrato de chequeo y autorización de cierre; mantener RD$2,000/30 días como requisito del usuario, no extenderlo automáticamente.
2. Corregir controles de oficina/técnico identificados en FLUJO-OPERARIA-TECNICO y probar reglas en entorno aislado.
3. Crear aplicación transaccional del beneficio y reemplazar los tres handlers por un servicio común; incluir chequeos históricos identificables sin renovar artificialmente la vigencia.
4. Unificar la ficha de visita y la continuación de reparación, con propuesta versionada y piezas antes de autorización.
5. Reconciliar pagos, comprobantes, caja, comisión y garantía en un caso completo y sus cancelaciones.
6. Validar Calendar/WhatsApp, recordatorios y seguimiento con las integraciones realmente conectadas; no asumir sincronización por tener calendarios internos.
7. Piloto real controlado con una operaria y un técnico antes de adopción general.

Esta etapa aporta mapa global y diagnóstico profundo de un recorrido crítico. No certifica las 93 mil líneas ni todos los módulos. Siguen pendientes pruebas funcionales de extremo a extremo por rol y revisión detallada de los recorridos auxiliares.

Datos adicionales del barrido: 77 archivos contienen operaciones de escritura detectadas y 58 mencionan literalmente la colección ordenes_servicio. Son indicadores de distribución de lógica, no una prueba de que cada archivo escriba esa colección. Refuerzan la necesidad de centralizar aprobación, transición, aplicación de beneficio y cierre en servicios compartidos antes de reorganizar más pantallas.

Verificación posterior: suite normal conserva 97/97 aprobadas. Suite de auditoría separada reproduce 4 fallos y 1 caso correcto. Los problemas nuevos no se consideran resueltos por que la suite anterior siga pasando. Sin cambios funcionales ni publicación en esta etapa.

## Anticipos para piezas — requisito confirmado posteriormente por Jorge

En algunos servicios el cliente paga una parte para gestionar las piezas y paga el restante al entregar. Debe incorporarse como un recorrido normal, sin exigir pago completo para registrar la gestión de piezas ni confundir anticipo con servicio terminado. Esto no cambia por sí mismo la política de autorización de cierre/entrega, aún pendiente de precisar.

Flujo propuesto: propuesta aprobada → anticipo registrado y verificado → gestión de piezas autorizada por oficina → reparación → entrega y cobro del saldo. Importe y propósito del anticipo, método, fecha, referencia, responsable y verificación deben quedar identificados; no equivale automáticamente al costo real de las piezas. Admitir varios abonos conservando cada movimiento.

La ficha debe separar total aprobado, beneficio del chequeo aplicado (si corresponde), pagos de esta reparación, pagos por verificar y saldo. Si precioFinal ya contiene el descuento del chequeo, no volver a restarlo al calcular saldo. Ejemplo conceptual desde precio antes de beneficio: reparación RD$10,000 − chequeo aplicable RD$2,000 − anticipo confirmado RD$3,000 = saldo RD$5,000. El chequeo original no se registra otra vez como entrada nueva de caja.

Código revisado: RegistrarPagoModal ya conserva array de pagos y recalcula estados pendiente/parcial/completo dentro de una transacción. Los pagos nuevos nacen sin verificar y montoPagado suma pagos registrados, sin filtrar verificado. Por ello no debe usarse ese único total como prueba de dinero confirmado disponible para comprar piezas. Integrar esos estados con compras, oficina, comprobante y entrega; no afirmar que el flujo completo ya está implementado.

Pruebas a incluir: anticipo más saldo exacto; varios anticipos; transferencia pendiente; doble envío; cambio autorizado de presupuesto; devolución/cancelación con trazabilidad (política a confirmar); chequeo aplicado una sola vez más anticipo; cierre/entrega y pago con estados distintos. No se modificaron pagos reales ni reglas financieras en esta actualización.
