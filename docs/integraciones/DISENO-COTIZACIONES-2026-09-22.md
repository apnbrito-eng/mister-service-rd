# Organización visual de Cotizaciones — 22/09/2026

Primera aplicación del diseño acordado, no rediseño completo de todos los módulos.

- Cabecera adaptable: acción separada en móvil, alineada a la derecha en escritorio.
- Filtros financieros en superficie clara con bordes y espaciado comunes.
- Estados en selector horizontal, estado activo accesible mediante aria-pressed.
- Búsqueda y tipo de equipo adaptables; búsqueda con nombre accesible.
- Período desplegable; fechas con etiquetas y columnas iguales, atajos y acciones separados.
- Acciones de 44px mínimo y foco visible. Se conserva la navegación translúcida existente.
- Cotizaciones reserva espacio inferior para poder desplazar el contenido más allá del asistente flotante; el asistente no fue rediseñado.
- El filtro compartido también se utiliza en Conduces Pendientes y Conduces emitidos.

Validación: build web/API correcto. Navegador con sesión de administrador ficticio: 360 y 414px sin overflow horizontal y fechas alineadas; 768px sin overflow al abrir Nueva Cotización; captura escritorio 1440px. Se probaron selección Borrador, Hoy, Aplicar, Limpiar, desplegar período, abrir y cancelar formulario. No se crearon documentos. Conduces Pendientes abre con filtros compartidos. No prueba física nueva de iPhone ni reconstrucción nativa.

Referencias revisadas: https://github.com/anthropics/skills/tree/main/skills/frontend-design y https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass. No se instaló paquete de efectos ni skill externa.
