# Totales sidebar — servidor, sin integración visual

✅ Verificado contra `api/sidebar/conteos.ts` y `api/_lib/conteosSidebar.ts`: endpoint GET con sesión revocable, perfil activo releído en cada petición y App Check siguiendo `exigirAppCheck` (su exigencia depende de APPCHECK_ENFORCE existente). Sólo administrador/coordinadora; `clientesVer` y `ordenesVer` personalizados revocados omiten sus datos. Empresas aliadas sólo administrador, igual al acceso actual del menú. No nuevos permisos ni roles.

✅ Verificado: respuesta `{fechaRD,consultadoEn,conteos}`. Cada contador retorna `{estado:'disponible',total}` o `{estado:'error'}`. Omitido significa sin permiso, nunca cero. Clientes es la cartera completa canónica sin eliminados/fusionados, reutilizable para Clientes y responsables. Órdenes globales incluye terminadas no eliminadas. Empresas excluye activa false e incluye legacy sin bandera. Agenda del día incluye terminadas; operaciones del día excluye cerrado/cancelado. No cuenta conversaciones por faltar resolver sus ocultaciones.

✅ Verificado: los totales globales usan `count()` y consultas de exclusiones con proyección. Unión de IDs evita descontar doble los clientes eliminados y fusionados, o las órdenes con ambos flags. No se usa where flag=false, que perdería legacy. `mergedaCon` válido es string no vacío; metadata malformada encontrada devuelve error, no total inventado. Fecha del día calculada en America/Santo_Domingo; proyección de órdenes sólo dentro de ese rango, sin nuevos índices compuestos.

✅ Verificado: 6 pruebas (4 helper + 2 endpoint) cubren roles/activo/customdeny, legacy, bajas/fusiones, límites RD, agenda versus abiertas, errores parciales y AppCheck/sesión/relectura por petición. `npm run typecheck:api` pasa; ESLint --no-ignore en 4 archivos pasa sin advertencias. No commit/despliegue ni cambios a datos.

⏳ Pendiente, dueño Codex: conectar hook/sidebar sólo tras revisión. Mantener «—» ante error/no carga; no sustituir no leídos del inbox por total. Este lote no está visible en producción.

⏳ Límite de escala: exclusiones proyectadas crecen con bajas/fusiones y órdenes del día, aunque no leen la colección completa. Los agregados y exclusiones se leen en llamadas independientes: cambios concurrentes pueden producir desfase breve; valores negativos se rechazan. No hay cache ni contadores materializados; éstos requerirían un plan de escritura/consistencia aparte. Ninguna migración fue ejecutada.

✅ Revisión Codex/review_centro: Centro excluye cerradas/canceladas por fase Y estado legacy; añadido caso regresión. Empresas mide ACTIVAS, no total de registros históricos. Lecturas separadas no prometen fotografía atómica.
