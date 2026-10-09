# IA — sesión canónica y permisos de herramientas

✅ Verificado: `api/ai/chat.ts` verifica token Firebase con revocación (`verifyIdToken(token,true)`), responde 401 por expirado/revocado/usuario deshabilitado y lee únicamente `usuarios/{uid}`. Perfiles inexistentes, inactivos o eliminados quedan bloqueados sin recuperarse desde Personal por email. App Check mantiene su verificación estricta anterior.

✅ Verificado: `permisosToolsIA.ts` aplica roles existentes y permisos personalizados tanto al catálogo (`toolsParaRol`) como a ejecución (`ejecutarTool`). Equivalencias existentes: query_gastos→gastosVer; query_avances_empleados→avancesGestionar; query_personal→personalVer; query_facturacion→facturasVer; query_piezas_inventario→configuracionVer (Inventario usa ese permiso en navegación). La ausencia de perfil confiable bloquea esas herramientas en llamada directa. Contexto opcional preserva llamadas antiguas no sensibles de precios, único consumidor adicional encontrado en tests.

✅ Verificado: no se añadieron roles financieros ni permisos nuevos para nómina/comisiones, que conservan autorización actual por rol. Operaria con IA habilitada y flags financieros true sigue sin poder usar esas herramientas. El endpoint envía perfil canónico completo al catálogo y a cada ejecución.

✅ Verificado: 32 pruebas dirigidas (6 autenticación, 20 permisos y 6 precios existentes) pasan. Typecheck API pasa. ESLint --no-ignore de chat/helper/tests nuevos pasa sin advertencias. iaTools mantiene dos avisos any anteriores en su contrato heterogéneo de herramientas; no se introdujeron avisos nuevos.

⏳ Pendiente, dueño coordinador: revisión y publicación. El payload mixto de get_orden_detallada conserva su rol administrador-only y ahora exige ambas lecturas existentes ordenesVer y facturasVer; revocar cualquiera bloquea catálogo y ejecución directa, evitando el acceso indirecto al conduce. Inventario continúa ligado a configuracionVer, permiso real existente del menú. No se añadieron flags ni filtros financieros nuevos.

No cambios a datos, permisos guardados, reglas financieras, credenciales ni entorno. Sin commit/despliegue.

✅ Verificado: resolución de permisos por defaults reales importados desde constantes puras de `src/types/index.ts`, sin duplicarlos; override activo exige true y omite campos false/ausentes. Se añaden equivalencias operativas claras: query_ordenes/count_ordenes/get_orden/agenda_dia/query_standby_piezas/query_mantenimiento→ordenesVer; query_clientes→clientesVer; query_cotizaciones→cotizacionesVer. Mantenimiento usa ordenesVer en el menú existente. Ponches no recibe flag sustituto: su reporte permanece protegido por roles previos.

✅ Verificado: los defaults ACTUALES de operaria/secretaria tienen personalVer=true para Mapa/Centro, por lo que consulta de personal sin sueldo conserva su acceso previo. No se afirma que ese permiso sea false. El módulo Personal sigue cerrado por rol; query_personal ya omite sueldo para esos roles. Default financiero gastosVer=false sí se respeta. No se cambia ninguna constante de permisos.

✅ Verificado: cierre del bypass financiero por `get_orden`: administrador/coordinadora con facturasVer revocado reciben la misma proyección operativa explícita que secretaria/operaria, manteniendo acceso a órdenes. Omite pagos, conduce, costos, notas libres y campos anidados desconocidos. `query_ordenes` omite montoAprobado y nota libre si no hay lectura financiera efectiva. Agenda ya proyecta únicamente campos operativos y no necesita recorte adicional.

✅ Verificado: suite ampliada 38/38 (6 pruebas nuevas ia-orden-permisos-financieros), typecheck API pasa y lint test nuevo 0 warnings. Defaults administrativos autorizados conservan payload financiero, secretaria conserva proyección incluso si override facturasVer=true. No se alteran roles ni precios operativos.
