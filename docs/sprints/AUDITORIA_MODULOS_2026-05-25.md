# 🔍 Auditoría de software — 2ª pasada (módulos no cubiertos) — 2026-05-25

> **Qué es esto.** Segunda revisión de código, enfocada en los módulos que NO se cubrieron en `AUDITORIA_SOFTWARE_2026-05-24.md`: reportes/analítica, GPS/agenda/ponche, configuración/marketing/IA/web pública/RRHH. Hecha por Cowork con 3 auditores en paralelo. **Solo lectura — nada se arregló.** Los arreglos de dinero/reglas NO se aplican sin que Jorge los vea; los que tocan rules/datos van a `BLOQUEOS.md`.
>
> **Pendiente:** la revisión **a nivel de interfaz (visual, en el navegador)** quedó pendiente porque hay 4 Chrome conectados y Cowork no puede elegir cuál usar — se hace apenas Jorge indique el navegador.

---

## 🔴 CRÍTICO

### 0. Plantillas de WhatsApp FALLAN al enviar — los parámetros del app NO coinciden con Meta (descubierto probando en vivo, 2026-05-25)
Probando el envío real de una plantilla a un número (con la sesión admin), Meta rechazó los envíos. Errores exactos del `whatsapp_mensajes_outbox`:

- **`recordatorio_mantenimiento`** → error Meta **#132000**: *"number of localizable_params (2) does not match the expected number of params (3)"*. El app manda **2 variables** (Nombre + Fecha) pero la plantilla aprobada en Meta espera **3**. **Todos los envíos de esta plantilla fallan.**
- **`cita_confirmada`** → mezcla: un envío llegó y se leyó (`read`), pero otros fallaron con **#132012** (*"header: Format mismatch, expected IMAGE, received UNKNOWN"* → la plantilla tiene un encabezado de IMAGEN que el app no rellena) y **#131008** (*"Required parameter is missing"*).

**Causa raíz:** el catálogo del app (`src/config/plantillasWhatsApp.ts`) está desfasado de las plantillas REALES aprobadas en Meta (número de variables + encabezado de imagen). Esto **no se ve en el código solo** — el código "compila bien"; el conteo no cuadra contra Meta.

**Impacto:** ALTO para el negocio. Reabrir conversaciones fuera de la ventana de 24h (recordatorios, garantías, re-enganche de leads) **está fallando** con estas plantillas — justo lo que sostiene el nurture y, más adelante, la medición del pixel.

**Arreglo:** alinear `plantillasWhatsApp.ts` con la estructura exacta de cada plantilla en el WhatsApp Manager de Meta (cuántas variables, orden, y si llevan encabezado de imagen). Requiere mirar la definición real en Meta (Jorge la tiene en el Administrador de WhatsApp). Sprint propio: `SPRINT-WA-FIX-PLANTILLAS-PARAMS`. Cazador candidato: validar nº de params del app vs un snapshot de las plantillas Meta.

### 1. Estado de Resultado infla las ventas netas (y la utilidad) con las facturas manuales
`EstadoResultado.tsx:53` + `FacturaCrearModal.tsx:188-202`
Las facturas/conduces creados a mano guardan solo `total` (con ITBIS), nunca `subtotal`/`itbisMonto`/`costoPiezas`. El reporte hace `ventasNetas += subtotal || total`, así que para cada factura manual suma el **total con ITBIS** como si fuera base imponible → **sobrestima las ventas netas y la utilidad**. Además el costo de piezas de esas facturas queda invisible (utilidad aún más inflada).
*Arreglo:* cuando falte `subtotal`, calcular la base como `total / 1.18` (o el ITBIS configurado); idealmente persistir `subtotal`/`itbisMonto`/`costoPiezas` también en el camino manual.
*Impacto:* los números de tu P&L (ganancia mensual) **no son confiables hoy** si usas facturas manuales.

---

## 🟠 ALTO

### 2. El proxy de GPS expone la API key del proveedor al navegador (seguridad)
`src/services/gps.service.ts:106-111`
La función lee `config_gps/sistema` (que incluye la **apiKey** del proveedor de rastreo) **en el navegador** y la manda en el POST al proxy. Cualquier usuario con acceso (incluido un técnico) puede ver esa clave en la pestaña Network. *Arreglo:* que el proxy `api/gps/ubicacion.ts` lea la apiKey del lado servidor (desde Firestore con Admin SDK), no recibirla del cliente.

### 3. Aprobar una reprogramación puede revivir una orden cerrada/cancelada
`src/services/ordenes.service.ts:589-604` (`resolverPropuestaReprogramacion`)
El único candado es que la propuesta esté "pendiente"; no revisa la **fase** de la orden. Si una orden se cierra/cancela mientras hay una propuesta pendiente, "Aceptar" le sobrescribe la fecha y la revive sin reabrir bien. *(Hermano del hallazgo #5 de la auditoría anterior sobre "Reagendar" — conviene arreglarlos juntos en el sprint de garantía/reagendar.)* *Arreglo:* rechazar la aprobación si la orden está en `cerrado`/`cancelado`.

### 4. Estado de Resultado no resta el descuento por garantía de las comisiones
`EstadoResultado.tsx:80-86`
Suma `comisionMonto` crudo; ignora `descuentoPorGarantia` → **sobrestima la nómina/comisiones** en el reporte. (Mismo patrón que el hallazgo #3 de la auditoría anterior en la página de Comisiones — conecta con el sprint de garantía.)

### 5. Reportes leen colecciones completas (costo/lentitud a futuro)
`EstadoResultado.tsx:78,96` (y varias suscripciones de agenda)
Lee toda la colección `comisiones` y `liquidaciones_nomina` sin filtro de fecha, y filtra en el cliente. Hoy con poco volumen no se nota; con el tiempo se pone lento y caro. *Arreglo:* consultar por rango de fecha, como ya hace con facturas/gastos.

---

## 🟡 MEDIO

- **Nómina proyectada cuenta a la coordinadora como operaria para el bono** — `Dashboard.tsx:463` + `MetricasMensuales.tsx:88`. El bono de RD$5,000 de operaria se aplica también a `coordinadora`. Verificar si es intencional; si no, infla la proyección de nómina.
- **Ponche: no valida salida-sin-entrada ni doble entrada** — `ponches.service.ts:65-126`. Dos taps rápidos o sesiones paralelas crean duplicados; + los lookups usan `limit(1)` sin `orderBy` → la hora mostrada puede variar entre cargas. *Arreglo:* validar en `crearPonche` + agregar `orderBy('timestamp')`.
- **Métricas de plantillas WhatsApp: el % de lectura usa denominadores distintos** — `MetricasPlantillas.tsx:133,167`. La tasa global y la por-fila no cuadran (una incluye `queued`/`failed`, la otra no). *Arreglo:* usar un solo denominador.
- **Función muerta `marcarAvanceDescontado`** — `avances.service.ts:115`. Exportada, sin llamadores; si un futuro builder la usa puede romper la atomicidad. *Arreglo:* borrarla o conectarla al cierre de nómina.
- **Gastos con categoría inesperada se suman al total pero no se muestran** — `EstadoResultado.tsx:73`. Las filas por categoría no cuadran con el total. *Arreglo:* mandar categorías desconocidas a "otros".
- **`AnalisisFunnel` con rango de fechas puede mostrar conversión engañosa** — `AnalisisFunnel.tsx:90,126`. No es un cohort real; el % global lead→cerrado puede pasar de 100%. (Decisión de diseño — revisar si te confunde.)

---

## 🟢 BAJO / cosmético

- Precio "chequeo a domicilio RD$2,000" **hardcodeado en la web pública** (`ServicioDetalle.tsx:363`) — es solo texto de marketing (el precio real sale de config), pero puede desfasarse del configurado. *Arreglo:* leer del config o quitar la cifra fija.
- Ponche que cruza medianoche queda partido en dos filas (entrada un día, salida el siguiente) — la fila de entrada muestra horas "—".
- Lecturas sin límite de fecha en `whatsapp_mensajes_outbox` (crece con el tiempo).
- `getWhatsAppUrl` rota número con `Math.random()` por render (intencional, solo nota).

---

## ✅ Verificado SÓLIDO (buenas noticias — no perder tiempo aquí)

- **El Asistente de IA está limpio y seguro.** Las 19 herramientas son **solo lectura**, todas re-validan rol en el servidor, con App Check + token + rate-limit + filtrado de campos financieros para secretaria. **No hay forma de que la IA escriba datos, filtre secretos, ni que un prompt malicioso la haga mutar nada.**
- **Marketing respeta tu regla anti-bloqueo.** En `campanasMarketing.service.ts` **no hay ningún envío masivo automático**; todo es por lotes manuales con tope (50) + cooldown + auditoría, en transacciones atómicas.
- **La web pública no lee colecciones internas** (no toca `personal`/`facturas`). Bien aislada.
- Servicios de configuración (empresa/fiscal/web) con parsers defensivos + strip de `undefined`; ITBIS leído del config, no hardcodeado en la lógica.
- Préstamos: el residuo de centavos de la última cuota **ya está mitigado** (se hace clamp a 0). Sin bug.
- Bancos, Feedback/NPS, Calendarios, recordatorios: correctos.

---

## Relación con lo que ya está en marcha

- Los hallazgos **#3 (reprogramación)** y **#4 (descuento garantía en reportes)** se conectan con el **sprint de garantía** ya en cola — conviene que ese sprint los incluya o que salgan como follow-up inmediato.
- El **#1 (Estado de Resultado infla ventas)** y el **#2 (apiKey GPS)** son nuevos y merecen sprint propio. El #1 es importante porque afecta tu lectura de ganancias; el #2 es seguridad.

## Revisión a nivel de USUARIO — lado público (hecha con Playwright, 2026-05-25)

Probé el embudo público real (sin login) en producción `www.misterservicerd.com`:

- **Inicio (`/`)** ✅ — carga bien, diseño profesional: servicios, "¿Cómo funciona?", marcas, "¿Por qué elegirnos?", CTAs a Agendar/WhatsApp, botón flotante de WhatsApp. Sin errores de consola.
- **Servicios (`/servicios`)** ✅ — tarjetas por tipo de equipo con "problemas que solucionamos", garantía, CTAs. Completo.
- **Agendar cita (`/agendar`)** ✅ — formulario completo (nombre, teléfono, email, dirección con Google Maps + "Mi ubicación", tipo de equipo, marca, modelo, falla con mínimo 10 caracteres, foto opcional, fecha/hora, RNC). **La validación funciona**: enviar vacío bloquea con "Completa este campo" (no se mandan leads incompletos). La foto de este form va a la ruta pública que SÍ funciona (no es la del bug crítico). No envié el form para no meter un lead de prueba en la cola del equipo.

**Conclusión lado público:** el embudo de captación funciona bien a nivel de usuario. Profesional y claro.

## Revisión a nivel de USUARIO — lado admin (con tu sesión de Chrome, 2026-05-25)

Recorrí los módulos del admin en producción con tu sesión (rol **Administrador**). **Todos cargan y renderean bien, sin pantallas rotas ni errores de consola:**

- **Dashboard** ✅ — banners urgentes de "ruta de mañana" y "avisos a clientes" por operaria, KPIs (4 órdenes activas, RD$28,000 ingresos, conduces, conversaciones sin responder). Muy completo.
- **Órdenes** ✅ — 8 órdenes, stepper de fases por orden, filtros (mes/técnico/estado), Lista/Tablero, crear/ver eliminadas. *Nota: tardó ~7s en cargar* (página grande + varios listeners en vivo).
- **Facturación Pendiente (Conduces)** ✅ — filtros de fecha con presets guardables, estado vacío claro.
- **Nómina Quincenal** ✅ — selector de quincena + "Generar liquidación" + estado vacío.
- **Cotizaciones** ✅ — tabs (Todas/Borrador/Enviada/Aceptada/Rechazada), filtros, "Nueva Cotización".
- (De pasos anteriores) **Estado de Resultado, Comisiones, Inventario, Pagos Pendientes, detalle de Orden** ✅ — todos cargan y los números en pantalla son coherentes.

**Hallazgos de UX a nivel de interfaz (menores):**

1. **El filtro de fecha por defecto puede esconder registros.** Varias páginas (Cotizaciones, Facturación) abren con el rango del mes actual; Cotizaciones mostró "Mostrando 0 de 3" — hay 3 cotizaciones pero ninguna en el rango. Un usuario podría pensar que no tiene datos. *Sugerencia:* avisar "tienes 3 fuera de este rango" o default más amplio.
2. **Órdenes tarda en cargar (~7s).** No está roto, pero se siente lento. *Sugerencia:* spinner ya existe; a futuro, paginar o acotar listeners.

**Conclusión admin:** la app funciona sólida a nivel de usuario — nada roto, UI consistente y profesional. Los problemas reales son los de **lógica/contabilidad** ya listados arriba (no se ven con solo navegar; salen del código).

## Pendiente todavía

- **Vistas por rol** (operaria/secretaria/coordinadora): solo revisé como Administrador (ve todo). Para ver exactamente qué ve cada rol en vivo, habría que abrir sesión con cada cuenta QA. Alternativa: lo deduzco del código de permisos (`utils/permisos.ts`) si querés.
- **Formularios dinámicos `/f/:slug`:** el bug crítico de captura (foto/firma/PDF) — lo está arreglando Claude Code con el sprint FIX-LEADS.
