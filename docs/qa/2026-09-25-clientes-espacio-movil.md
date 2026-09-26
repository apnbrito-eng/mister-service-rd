# Clientes y espacio útil en móvil — 25/09/2026

## Entrega
- Clientes: título y contador compactos, Nuevo como acción principal, exportación en Más; vistas Lista/Mapa/Reactivación con estado accesible.
- Ficha móvil oculta las acciones generales de la lista y ofrece regreso explícito. Al regresar limpia el deep-link de la ficha.
- Navegación entre módulos en selector accesible dentro de la barra superior del móvil. Navegación de escritorio conservada. Aplicado a espacios Atención/Servicios/Cobro/Equipo y respeta permisos existentes.
- Menos separación vertical global; elimina 80px de relleno inferior redundante con la navegación que ya ocupa espacio en flex.
- Una sola zona de desplazamiento en lista móvil; desktop conserva lista independiente. Filas mínimas68px y controles44px.
- Lista renderiza50 registros inicialmente y permite ampliar; búsqueda diferida/memoizada incluye todos los registros cargados.
- Mapa y Reactivación se importan bajo demanda. Esto no equivale a eliminar todo código cartográfico del paquete ni reducir lecturas de Firestore.
- Historial de cliente descarta respuestas tardías de fichas anteriores, muestra carga/error y no confunde fallo con historial vacío.

## Verificación
- TypeScript frontend/API sin errores.
- Suite de259 pruebas/57 archivos pasa; después pasan2 pruebas adicionales de navegación compacta (261 en total comprobadas). Incluye: búsqueda de cliente fuera de las primeras50 filas y descarte del historial anterior cuando llegan respuestas fuera de orden.
- ESLint dirigido:0 errores,2 advertencias (export compartido Fast Refresh y dependencia de efecto por ID).
- Compilación Androidrelease y verificación firma completadas. Misma identidad de producción, versión1.0.9 código10.
- Actualización instalada en emuladorAndroid5554. No Samsung físico conectado; no certificación funcional del dispositivo físico.
- Vista de prueba generada a partir del componente Clientes con datos ficticios, envoltura de navegación simplificada. Navegación/botones de esa captura NO constituyen prueba E2E.
- DOM en320/768/1440: scrollWidth coincide con viewport, sin desbordamiento horizontal. Captura adicional390px; primera fila top231 en móvil, controles44px. No se midió ganancia contra captura anterior comparable.
- Login local producción rechazado por verificación; no se desactivaron controles ni se cambió contraseña para probar.

## Límites y pendientes
- La consulta todavía descarga todos los clientes: el límite es de renderizado, no de red. Paginación de servidor/búsqueda indexada es siguiente optimización para carteras grandes.
- No se certificaron todos los módulos ni LCP/INP/CLS ni navegación física iPhone/iPad en esta entrega.
- Revisión de permisos/reglas de creación pública/GPS, antispam y restantes20criterios sigue pendiente. No se modificaron reglas, datos, citas ni mensajes aquí.
- Sin nuevos paquetes. Cambios acotados sobre árbol previamente modificado, sin commit global ni descarte de trabajo previo.

Publicación completada: https://mister-service-8pglol32w-mister-service-rd-team.vercel.app, alias www.misterservicerd.com.
APK /descargas/mister-service-rd-1.0.9.apk: HTTP200 MIMEAndroid,15968699bytes SHA2563288edf9a7c15af2bbffebfda227a36db87e917eeed20850210dc4d4e521f954 idéntico al local. Guía android.html apunta1.0.9.
Verificación adicional en PRODUCCIÓN, solo lectura: cartera9112 clientes; DOM50 filas; toolbar y selector presentes. A390x844 scrollWidth390, primera fila233px, barra54px. Abrir primera ficha oculta cabecera general, no desborda; regresar a Clientes recupera toolbar y50filas. Vista dejada abierta, viewport restaurado. No se editaron datos.
Primer deploy sin scope devolvió Not authorized; identidad y proyecto correctos; reintento con scope explícito mister-service-rd-team completó sin modificar permisos.
