# Seguimiento Marketing — revisión de cobros y fechas

Corrección sobre entrega nueva aún no publicada. Ownership: helper, servicio y componente de SeguimientoMarketing; sin API, envíos ni cambios de reglas.

- Cobros se calculan con `proyectarCobrosCaja` sobre documentos RAW con ID. Pagos sin fecha/ID/método válido o con ID duplicado se excluyen igual que Caja y sus incidencias se muestran. Se conserva la política canónica de banco: Caja general admite métodos bancarios sin banco registrado; cambiarla exige revisión común, no una excepción de Marketing.
- Cohorte explícita: órdenes creadas en rango RD y pagos de esas órdenes cuya fecha también cae dentro del rango. No equivale a toda la caja del negocio. Origen y anuncios son vistas del mismo conjunto y no deben sumarse entre sí.
- Órdenes compatibles con varias consultas de anuncios quedan como ambiguas, excluidas de atribución en todos los anuncios. No se inventa una regla first/last touch; se evita duplicar cobros. La asociación por cliente ID sigue sin demostrar causalidad publicitaria.
- Lectura puntual completa de órdenes/conversaciones/campañas conserva fechas legacy y ausentes. Filtrado local admite campañas `creadaEn`. Incidencias sin fecha no se convierten en cero invisible. Límite: descarga completa por cálculo; a mayor volumen debe diseñarse paginación con cobertura explícita de incidencias.
- Fechas imposibles (p. ej. 2026-02-31) rechazadas por comparación de día RD después de parsear; años bisiestos válidos admitidos.
- Gate admin/coordinadora antes de calcular, enlaces existentes conservados. Campos de fecha deshabilitados durante carga; cambiar selección retira resultados anteriores.

Verificación: 12/12 tests en seguimiento-marketing.test.ts y seguimiento-marketing-lecturas.test.ts; ESLint de los tres archivos productivos y TypeScript global pasan. Incluye paridad Caja, cobro fuera de rango RD, doble ID, fechas ausentes, cohorte, ambigüedad entre anuncios y lectura legacy.
