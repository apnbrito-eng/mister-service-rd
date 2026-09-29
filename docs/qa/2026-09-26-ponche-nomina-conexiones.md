# Ponche → Nómina → Contabilidad: implementación del 26/09/2026

## Estado vigente: implementado, probado y publicado en web/APK1.0.10

Publicación confirmada en el informe `2026-09-26-entrega-modulos-android.md`. Lectura autenticada del servicio de asistencia comprobada en producción sin escrituras.

Esta actualización reemplaza el estado «solo definido» del historial inferior. Jorge autorizó implementar todos los módulos y desplegar web + APK en el chat `01a0e013-8ae2-7ed0-be3e-23142f7e2ae3`.

- Revisión disponible en Ponches administrativos y en la nómina seleccionada para administrador/coordinadora. Propuestas: RD$100 tras 08:10 y antes de09:00; RD$200 desde09:00; RD$618 por ausencia completa confirmada. Minutos desde08:00. La tolerancia se evalúa por minutos completos.
- Ningún ponche faltante genera un descuento automático. Para aprobar ausencia hay que confirmar que correspondía trabajar y que no fue error de registro. Se bloquean días futuros, día sin entrada todavía en curso, domingos, feriados y fechas anteriores al registro del empleado.
- Motivo obligatorio; importe editable antes de aplicar; excusar o descartar deja importe0. Ponches originales intactos. Historial por versión e identidad de la sesión, con control de concurrencia.
- Evidencia opcional JPG/PNG/WebP hasta500KB, guardada en colección privada de servidor. Solo el endpoint autenticado admin/coordinadora la sirve; los clientes Firestore directos no pueden leer ni escribir revisiones/evidencias. Los motivos/imágenes no se copian al desglose salarial.
- Aplicación explícita de aprobados a una nómina abierta, transaccional e idempotente. No altera empleados pagados, nóminas cerradas ni en cierre. No duplica una incidencia en otra nómina. Informa revisiones omitidas si el empleado no aparece en una nómina antigua.
- Ayudantes incluidos con sueldo individual dividido entre dos, sin comisiones. Técnicos conservan sueldo más comisiones existentes; no se cambiaron porcentajes ni salarios. Ajustes manuales preservan descuentos de asistencia. Cierre congela incorporación de asistencia.
- Estado de resultados incluye ayudantes y reduce gasto salarial por asistencia aplicada en nóminas cerradas del mes. Avances y préstamos conservan su tratamiento existente.
- Feriados2026 según [Ministerio de Trabajo / Presidencia](https://www.presidencia.gob.do/noticias/ministerio-de-trabajo-informa-dias-feriados-correspondientes-al-ano-2026). Otros años quedan bloqueados para aprobación hasta agregar calendario verificado.

## Evidencia

- 295 pruebas de integración, incluidas política, sueldo de ayudante/técnico y conservación de descuento al editar ajustes manuales.
- 63 pruebas de reglas y API en emulador Firestore: permisos, privacidad de evidencias, feriados, motivo obligatorio, versión obsoleta, aplicación repetida y nómina cerrada.
- Navegador local con el componente real y datos ficticios: aprobar deshabilitado sin motivo/confirmación, excusar dejaRD$0. Móvil390px sin desbordamiento horizontal tras corregir selector de archivos. Capturas en `evidencias-inbox-20260926/asistencia-*`.
- Compilación web/API y móvil verificadas. No se generó nómina, aprobó descuento ni subió imagen médica real.

## Límites

No se añadieron sanciones por salida temprana ni seguimiento de pausa por hora. El horario confirmado se muestra como política; no se descuentan horas de almuerzo automáticamente del sueldo mensual. Los ponches mantienen su captura actual basada en hora del dispositivo y requieren revisión humana. Correcciones después de aplicar se bloquean, no existe reversión de incidencias aplicadas en esta entrega. El cierre antiguo de comisiones/préstamos tiene riesgos parciales documentados en el servicio; no se certifica contabilidad completa ni pagos bancarios. La prueba física Android sigue pendiente.

---
## Historial de definición anterior (no representa el estado vigente)

# Revisión de conexiones: Ponche → Nómina → Contabilidad

26/09/2026. Revisión del código local del Escritorio, sin registrar asistencias, generar nóminas ni aplicar descuentos reales.

## Resultado

La integración de asistencia con nómina no existe en el cálculo actual. Ponche registra entradas/salidas; la nómina no consulta esa colección. La conexión contable es parcial.

## Evidencias

| Punto | Código observado | Consecuencia |
|---|---|---|
| Registro de asistencia | `src/services/ponches.service.ts:110`: crea ponche con uid, fechaRD, tipo, foto y hora del dispositivo | Existe evidencia de entrada/salida, no un resumen aprobado de incidencias salariales |
| Nómina | `src/services/nomina.service.ts:144`: sueldo mensual / 2; líneas204–230 agregan comisiones y bonos y restan avances/préstamos | No descuenta ausencias, tardanzas o salidas anticipadas a partir de ponches |
| Descuento manual | `agregarDescuentoAdHoc`, mismo servicio: monto y motivo, dentro de liquidación abierta | Permite ajuste manual, sin vínculo a días/ponches ni cálculo de asistencia |
| Ausentes | `src/pages/AdminPonches.tsx:216`: personal activo sin ponche, solo consulta de un día; laborable = excepto domingo; excluye ayudantes | No contempla calendario individual, permisos, feriados, vacaciones ni incidencias justificadas; no certifica una falta descontable |
| Identidad/registro | Rules de ponche validan uid propio al crear; no validan hora, unicidad diaria o secuencia entrada/salida. El servicio usa addDoc y Timestamp.now del cliente | Se requiere robustecer la integridad antes de usar registros automáticamente para dinero |
| Error de consulta | Ponche y AdminPonches registran errores en consola y terminan carga, sin un estado bloqueante de datos no disponibles | Puede confundirse fallo de lectura con falta de registro; no usar como fundamento automático de descuento |
| Estado de resultados | `src/pages/EstadoResultado.tsx:85–125`: sueldo mensual activo + comisiones del mes + bonos de liquidaciones | No reconcilia los ajustes de asistencia con una nómina final. No implica que avances/préstamos deban reducir gasto salarial: son conceptos contables distintos |
| Pago | `marcarEmpleadoPagado`, servicio nómina: actualiza empleado con pagado/método/fecha/banco | Esta función no genera movimiento bancario ni salida de caja; no se ha auditado un sistema contable externo |
| Ayudantes | `generarLiquidacion` excluye expresamente rol ayudante | Confirmar alcance de empleados sujetos a nómina; acceso limitado al sistema no determina por sí solo su tratamiento salarial |

## Horario confirmado por Jorge

- Lunes a viernes: 08:00–18:00.
- Sábado: 08:00–16:00.
- Tolerancia de entrada confirmada: diez minutos después de las08:00. Si se supera el margen, se computa todo el tiempo desde08:00: llegada08:15 = quince minutos, según confirmación de Jorge. No confundir cómputo de tardanza con fórmula monetaria o autorización de descuento automático.
- Trabajan de lunes a sábado. No se ha definido una regla de turnos excepcionales.
- Pausa de almuerzo: una hora flexible según trabajo en la calle; normalmente12:00–13:00 o13:00–14:00, sin imponer una franja fija. Jorge confirmó que queda fuera del tiempo remunerado. Aplicación específica al sábado pendiente de confirmación.

Este horario es un dato operativo indicado por Jorge, no una validación legal ni una fórmula de descuento. No se calculó tarifa por día/hora ni porcentaje aplicable.

## Conexión propuesta, pendiente de implementación

1. Registrar ponches confiables con identidad y hora verificadas, prevenir duplicados y señalar consultas fallidas.
2. Conciliar asistencia por persona y día de la quincena: horario esperado, entrada/salida, pausa, permisos y registros incompletos.
3. Revisar incidencias y justificar/corregir antes de calcular ajustes. Falta de ponche no equivale automáticamente a falta laboral.
4. Tardanzas: Jorge aprobó generar propuestas de descuento sujetas a revisión y aprobación de administración antes de aplicarlas a nómina. Mostrar minutos, base de cálculo, motivo y aprobación. Jorge pide poder aumentar o reducir el importe propuesto, o descartar la propuesta, antes de aprobar. Conservar la asistencia original separada de la decisión monetaria. Registrar importe sugerido, importe aprobado, motivo de ajuste y quién aprobó como diseño de trazabilidad. La fórmula monetaria sigue pendiente; no aplicar descuentos automáticamente.
5. Guardar en la nómina una copia de las incidencias aprobadas y su cálculo, con referencias a los registros originales. Evitar duplicados al regenerar y preservar liquidaciones cerradas.
6. Conciliar nómina, gasto salarial y pago de caja/banco por separado, respetando avances y préstamos como conceptos diferentes.

## Definiciones pendientes

Aplicación de la pausa al sábado; criterios para ausencias justificadas, tardanzas y salidas; alcance por empleado/ayudantes; persona o rol administrativo habilitado para aprobar; fórmula autorizada de cálculo. El requisito de revisión administrativa previa de tardanzas ya está confirmado. La petición actual es revisar conexiones: no se modificó código financiero ni se implementaron descuentos.


## Condiciones salariales confirmadas por Jorge

- Usar el sueldo base individual guardado al dar de alta al empleado y sus condiciones de trabajo. RD$16,000 es un importe habitual mencionado, no un valor obligatorio para todos ni un cambio autorizado de salarios.
- Técnico: sueldo base más comisión del10% después de deducir costes, según la condición descrita por Jorge. El código permite porcentaje por empleado; no se reemplazaron porcentajes existentes ni se validó todavía que todos los conceptos de costes coincidan con su definición.
- Ayudante/asistente del técnico: sueldo base, sin comisión. Esto contradice la exclusión actual de ayudantes en generarLiquidacion y EstadoResultado; debe corregirse al implementar la integración.
- Los días festivos del país son remunerados y no deben generar descuentos por falta de asistencia. No se encontró configuración de feriados en la búsqueda dirigida de src/api/config; falta calendario verificado y excepciones.
- No quedó definida una condición salarial específica para secretaria en esta intervención.
- La fórmula para convertir el sueldo mensual en valor por hora/minuto sigue pendiente. El sueldo y el horario no determinan por sí solos qué divisor se debe aplicar.

Lectura adicional: PersonalPage persiste sueldoBase, comisionPorcentaje y horario. El horario es texto libre; todavía no constituye un calendario estructurado para evaluar asistencia.

## Importe de tardanza comunicado — 26/09/2026
Jorge indica cien pesos por tardanza cuando la llegada es antes de las09:00. Combinado con la tolerancia ya confirmada, la propuesta corresponde a llegada posterior a08:10 y anterior a09:00. Se conserva el cómputo de minutos desde08:00, pero este tramo tiene importe fijo, no tarifa por minuto. Mantiene edición y aprobación administrativa antes de aplicarse. Pendiente qué ocurre exactamente a09:00 y después. Es regla empresarial comunicada; no se ha validado su aplicación legal ni aplicado descuentos reales.

## Excusar día solicitado por Jorge
Añadir en administración un botón «Excusar día» para técnico o ayudante con justificación válida. La decisión humana debe excluir ese día de propuestas de descuento por asistencia, sin borrar los ponches originales. Diseño propuesto de registro: persona, fecha, motivo, quién aprobó y cuándo; mostrar «Día excusado» y conservar trazabilidad de propuesta descartada/ajustada. No interpretar esta solicitud como condonar préstamos, avances u otros descuentos ni alterar nóminas ya cerradas. Definición recibida, todavía no implementada; tratamiento de excusas posteriores al cierre y alcance parcial de una excusa pendientes si se necesitan.

## Coordinadora, evidencia y segundo tramo — 26/09/2026
Jorge confirma que administrador o coordinadora pueden excusar al empleado, con motivo obligatorio, y pide poder adjuntar imagen de respaldo (por ejemplo justificación médica). La imagen se plantea como adjunto de la justificación, no como sustitución silenciosa del motivo; su obligatoriedad no fue establecida. Requisito técnico propuesto: almacenamiento privado y acceso autorizado de revisión, sin enlaces públicos ni copia del contenido médico al desglose de nómina. No se recibió, leyó ni subió evidencia médica real.
Jorge estableceRD$200 si llega después de09:00. Mantiene propuestas editables/revisión y posibilidad de excusar; frontera exactamente09:00 aún por confirmar. No inferir regla de ausencia completa, salida anticipada ni tarifa proporcional a partir de esos dos tramos. Sigue pendiente implementación.

## Frontera09:00 confirmada — 26/09/2026
Jorge confirmaRD$200 desde09:00 inclusive. Tramos vigentes: hasta08:10 inclusive, sin propuesta por tardanza; después de08:10 y antes de09:00, RD$100; desde09:00, RD$200. Mantener cómputo de minutos desde08:00 al superar tolerancia, importes propuestos editables y aprobación administrativa/coordinadora con excusas justificadas. Esta definición reemplaza las dudas anteriores sobre exactamente09:00. No implementado ni aplicado; no es validación jurídica de sanciones.

## Falta de día completo — 26/09/2026
Ante pregunta específica por ausencia de día completo confirmada y sin justificar, Jorge fijaRD$600. Mantener propuesta revisable antes de aplicar y distinguir ausencia confirmada de simple falta de ponche o error de consulta. Feriados remunerados y días excusados no generan propuesta por ausencia. No inferir acumulación con tardanza del mismo día, ni reglas de media jornada o salida anticipada. Definido/no implementado, sin aplicación real ni validación jurídica.

## Cierre de definición y corrección final — 26/09/2026
Jorge corrige el importe por falta completa sin justificar aRD$618 (reemplazaRD$600 indicado antes) y declara terminada la revisión de este módulo. No seguir entrevistando sobre Ponche salvo nueva indicación. La definición está cerrada; integración Ponche/Nómina, excusas con adjuntos y pruebas de esas funciones siguen sin implementar. No presentar este cierre como desarrollo o publicación completados. No inventar respuestas a detalles no definidos; resolverlos explícitamente cuando sean necesarios para implementar. Fuente: delegación por voz del chat01a0e013-8ae2-7ed0-be3e-23142f7e2ae3.
