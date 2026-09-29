# Revisión global y entrega visual — 28/09/2026

**Estado:** web y APK final publicadas y descarga verificada.
**Entrega publicada:** Android 1.0.16/code17 y web. Carpeta fuente: `/Users/jorgeluisbritogarcia/Desktop/mister-service-rd`.

## Resultado
Se aplica una base visual compartida al espacio administrativo, se corrigen las distribuciones de Citas/Precios/filtros de Órdenes y se vuelve movible el acceso de IA. Se conservan las funciones, permisos y cálculos existentes. Esta pasada no equivale a completar todas las fases de DESIGN.md ni a probar cada transacción por rol.

Jorge autorizó continuar con todos los módulos, publicar para Android e incorporar el arrastre del botón de IA. Al cerrar voz pidió continuar hasta terminar y guardar el resultado para mañana. No se programó una automatización.

## Cambios

### Base común
- `src/index.css`: Plus Jakarta Sans, superficies sólidas, azul de acción aprobado #0f3460 en botones azules existentes, texto auxiliar de9–11px (incluido10.5px) elevado a12px, controles comunes de44px y de48px en técnico/diálogos, foco visible y movimiento reducido.
- Los interruptores conservan su pista compacta dentro del área táctil; las casillas/radios se pueden tocar desde toda su etiqueta. No se agranda artificialmente el cuadrado del input.
- Enlaces de retorno al área y accesos de Dashboard/Usuarios/Conocimiento ampliados. Controles de zoom Leaflet con selector específico para no quedar anulados al cargar la hoja de estilos del mapa.
- `src/components/Modal.tsx`: fondo sin desenfoque, márgenes adaptables, jerarquía del título y cierre más fácil de tocar. No se añadió una gestión universal nueva de foco a todos los diálogos.
- `src/pages/TecnicoVista.tsx`: ámbito de controles de48px, conservando lógica de órdenes.

### Pantallas
- `src/pages/Citas.tsx`: información encima de las acciones en móvil; botones que pueden envolverse; nombre accesible de cancelación. Confirmación/cancelación conservan sus funciones.
- `src/pages/PreciosServicios.tsx`: tarjetas móviles con servicio e importes primero; tabla en escritorio. Permisos, valores, edición y activación permanecen iguales.
- `src/components/ordenes/OrdenFilters.tsx`: controles distribuidos según el ancho, sin tamaño mínimo que empuje el selector fuera del panel; nombres accesibles. `Ordenes.tsx` sigue monolítico.
- Etiquetas de controles en Calendario, Cita pública, Gastos, Mantenimiento, Configuración, Configuración web, Cotizaciones, Editor de formularios, detalle de orden, Ponche y revisión de ponches; cierres/interruptores compartidos.

### Botón de IA
- Nuevo `src/components/BotonAsistenteMovil.tsx`, integrado en `AsistenteIAFlotante.tsx` sin cambiar sus permisos ni el envío de mensajes.
- Arrastre con ratón o dedo, umbral de movimiento para distinguir toque de arrastre, límites del área visible y reajuste al cambiar orientación/tamaño.
- Posición proporcional conservada en almacenamiento local del dispositivo. Solo se guardan dos coordenadas; no contenido del chat.
- Flechas para mover con teclado, Inicio para restablecer, Enter/espacio para abrir. Cancelar el gesto no abre el chat.
- Si el almacenamiento está bloqueado, el movimiento continúa funcionando durante la sesión.

## Cobertura de revisión
- 48 rutas del menú a375×812 y1440×900:96 observaciones iniciales sobre la entrega1.0.12, repetidas sobre1.0.13.
- Inventario65 páginas TSX; conteo de utilidades de texto pequeño en todas ellas (43 contienen tamaños9–11px), barrido de estilos de58 páginas raíz y revisión dirigida de componentes compartidos/técnico. No se afirma auditoría semántica completa de65 archivos.
- Sesión de administrador. No se enviaron mensajes, cobraron pagos ni modificaron registros reales durante el recorrido.
- El documento no desbordó horizontalmente y no se detectaron imágenes rotas en las capturas iniciales. Eso no excluye problemas internos: Citas, Precios y Órdenes sí tenían recortes/compresión dentro de contenedores.
- Los conteos dependen de datos cargados. Un control compartido aparece en varias rutas; un input pequeño con una etiqueta grande no es por sí mismo un objetivo táctil pequeño.

| Área | Rutas observadas en ambos tamaños |
|---|---|
| Mi día | dashboard, ponche |
| Atención | inbox, clientes-responsables, clientes, solicitudes, citas, empresas-aliadas |
| Servicios | ordenes, agenda-dia, calendario, mapa, reprogramaciones, sugerencias-chequeo, standby, taller, mantenimiento, historial-anuladas, calendarios |
| Contabilidad | cotizaciones, pagos-pendientes, facturacion-pendiente, facturas, cierre-dia, gastos, bancos, estado-resultado, reporte-avanzado, nomina, comisiones, avances, prestamos |
| Equipo | personal, usuarios, ponches, rendimiento, metricas-mensuales |
| Marketing y recursos | marketing, feedback, web, formularios, configuracion-marketing, precios, inventario, conocimiento |
| Asistente y configuración | asistente, asistente/historial, configuracion |

Prefijo `/admin/`, excepto `/ponche`.

## Pruebas
- **316 pruebas de integración aprobadas**,71 archivos. Incluye siete nuevas del botón de IA: toque breve, arrastre sin apertura accidental, límites, restauración/reajuste de posición, teclado/restablecimiento, almacenamiento bloqueado y cancelación de gesto.
- TypeScript de aplicación/API y recursos móviles aprobados. Android `:app:assembleRelease --offline` aprobado. ESLint del botón y su integración: sin errores ni advertencias. Revisión dirigida anterior: sin errores; una advertencia preexistente por importación no usada en Configuración web.
- Ensayos con componentes reales Citas, Precios y filtros, datos ficticios y escrituras bloqueadas. Citas a375/1440px sin desbordamiento; en móvil acciones debajo del texto.
- Precios a375px: detalleRD$1,500 y mayoreoRD$1,200 visibles en tarjeta; a1440px se conserva la tabla. Editar carga esos valores y Cancelar cierra sin guardar.
- Confirmar cita abre el formulario con nombre/equipo/falla precargados. A375px, diálogo343px y botones de al menos48px; Cancelar no guarda ni elimina la cita.
- Filtros de Órdenes a375px: cuatro controles dentro de pantalla y altura44px.
- Menú de mensaje: dentro de375px, Escape cierra, contador de acciones permanece en cero.
- Botón IA en navegador: arrastre desde esquina inferior derecha hacia la izquierda sin abrir (contador0); recarga conserva posición; toque incrementa a1; giro375×812→812×375 mantiene el botón visible; arrastre al borde y vuelta a vertical lo mantienen dentro del área disponible.
- Recorrido publicado1.0.13:96 vistas, cero desbordamientos del documento, botones sin nombre o imágenes rotas detectados. Se localizaron remates de zoom, enlaces y texto10.5px, corregidos después.
- Ensayos reproducibles: `tests/manual/revision-ui.html` y `tests/manual/asistente-movil.html`; configuración `revision-ui.vite.config.ts`. Se excluyen de publicación.

## Instalador final
- Versión 1.0.16/code17, paquete`com.misterservicerd.app`.
- SHA-256 local: `75ca5923ee1417790cd0c271c29052380178d1f1d92196bb6aa3f8295efac486`.
- Certificado SHA-256: `d65aec5154307ec45f707402ba180d0f9a22746d7e37dda46886f4950e8ca2cd`, mismo que versiones anteriores.
- Publicación desde copia cerrada `/tmp/mister-ui-publicacion-20260928-16`, con componente IA e instalador final incluidos. Un intento intermedio falló por capturar una referencia al componente mientras se estaba creando; no sustituyó la producción. La copia cerrada evita repetir ese cruce de archivos.
- No se hicieron commit ni push. No fue necesario cambiar/desplegar reglas por estos ajustes visuales.

## Verificación final publicada
- Vercel confirmó READY para `mister-service-gwsh3shvq-mister-service-rd-team.vercel.app`. El dominio de producción entrega el recurso `/assets/index-yhvnCWKB.js`.
- [APK Android 1.0.16](https://www.misterservicerd.com/descargas/mister-service-rd-1.0.16.apk): descargada desde producción y SHA-256 idéntico al instalador local firmado. La guía pública enlaza esta versión.
- Clientes con datos cargados: enlaces de WhatsApp de 44×44 px en escritorio; revisión a 1440 y 375 px sin controles pequeños detectados ni desbordamiento del documento. Se corrigió también el ancho mínimo del enlace, que antes quedaba en 36 px.
- Mapa móvil publicado: ambos controles de zoom de 44×44 px; botón IA presente y sin desbordamiento.
- Botón IA probado en producción sobre la entrega anterior con el mismo componente: arrastrar no abrió el panel; recargar conservó la posición; tocar abrió y minimizar cerró. Posición de prueba restablecida, sin enviar consultas.
- El recorrido final dirigido anterior cubrió ocho rutas en ambos tamaños; el último ajuste de ancho se volvió a comprobar en Clientes. No se presenta como una nueva repetición completa de las 96 vistas sobre 1.0.16.
- Se restableció el tamaño del navegador y se cerró la pestaña temporal de revisión.

## Límites pendientes de dispositivo/alcance
- Instalación sobre APK anterior y teclado/cámara/GPS en Android físico; no hay teléfono conectado.
- iPad físico en ambas orientaciones; emular anchos no reproduce todo Safari.
- Las tablas financieras con muchas columnas mantienen desplazamiento interno; no se transformaron indiscriminadamente en tarjetas.
- Falta recorrer todos los estados de error, carga tardía y operaciones por rol. Las fases detalladas de DESIGN.md siguen como guía, especialmente formularios y gestión de foco/hojas inferiores.
- Advertencia existente de paquetes grandes durante compilación; no se realizó una optimización integral de carga.

Criterio adicional consultado: [Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines/blob/main/command.md). Prevalecen las decisiones de Jorge y la conservación de la lógica del negocio.
