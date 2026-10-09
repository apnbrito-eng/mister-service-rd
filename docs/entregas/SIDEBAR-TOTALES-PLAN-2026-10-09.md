# Totales pendientes del menú — plan auditado 09/10/2026

💡 Propuesta técnica, no implementada. Responsable Codex/Claude; fuente auditoría read-only agente carteras.

- Clientes/Clientes y responsables: colección clientes, excluir eliminado===true y `mergedaCon` no vacío; misma base canónica, documentos legacy sin flags incluidos.
- Empresas aliadas: empresas_aliadas activas, activa:false baja lógica; legacy sin campo incluido.
- Conversaciones: separar total de conversaciones de conversaciones sin leer. Visibilidad depende de ocultaciones globales/personales y actividad; count colección no equivale al inbox visible.
- Órdenes: no eliminadas, incluyendo completadas.
- Agenda día: no eliminadas con fechaCita en día Santo Domingo, incluyendo completadas.
- Centro: activas del día, excluir canceladas/cerradas. No reutilizar indiscriminadamente conteo hoy de bandeja para Agenda.

💡 Endpoint api/sidebar/conteos.ts con helper api/_lib/conteosSidebar.ts, count() baratos, respuesta parcial con fechaRD/consultado; consultar cada 60s solo sesión visible mediante hook, sin listeners completos nuevos. Cache breve por UID/permisos y alcance.

⏳ Antes de implementar: comprobar permisos personalizados desde usuarios/{uid}; accesoEquipo no los devuelve. No basta ocultar UI. Conservar permisos actuales, no ampliarlos. Tipos/índices para descontar fusiones sin doble descuento deben verificarse. Nunca usar folios de config/contadores ni páginas visibles como total.

Pruebas necesarias: legacy sin flags, bajas y fusiones sin doble descuento, permiso revocado, límites RD, diferencia Agenda/Centro, errores parciales y respuestas de sesión anterior descartadas. No tocar datos, migraciones ni mensajes reales.
