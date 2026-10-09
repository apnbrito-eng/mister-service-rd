# Clientes y responsables — cartera canónica A/B

✅ Verificado contra `src/pages/ClientesResponsables.tsx`: la vista inicial lee clientes mediante `useClientesEnVivo`, no los deduce de órdenes. Reutiliza las columnas A/B, búsqueda, traslado e historial de `CarterasClientes`. Abrir una tarjeta lleva a la ficha de Clientes mediante su ID.

✅ Verificado: las vistas «Responsables y seguimiento de órdenes» y «Efectivo pendiente de entrega» conservan la consulta `/api/crm/cartera`, filtros, paginación y detalle. Esa API solo se solicita al seleccionar esas vistas. El acceso sigue limitado a administración/coordinación; trasladar respeta `clientesModificar`. No se añadieron permisos, API, migraciones ni mensajes.

✅ Verificado: 6 pruebas dirigidas (5 UI y 1 hook) de `tests/integraciones/clientes-responsables-carteras.test.ts` pasan: clientes sin órdenes visibles A/B y navegación, consulta anterior preservada, roles no autorizados sin suscripción ni consulta. ESLint de los dos archivos: 0 advertencias. El typecheck conjunto corresponde al coordinador.

⏳ Pendiente: dueño coordinador. La suscripción existente lee la colección completa (no pagina en servidor); las columnas muestran hasta 100 filas por equipo y búsqueda permite localizar el resto. La ampliación de alcance incorpora error y reintento en el hook: finaliza loading ante fallo, conserva datos previos sin exhibirlos como actuales en esta vista y descarta callbacks de listeners cancelados.

❓ Sin verificar: distribución real inicial A/B; esta entrega no reparte ni modifica clientes reales. Los clientes sin cartera se cuentan aparte; la vista reutilizada no muestra fichas en ese grupo.

✅ Verificado: revocar individualmente `clientesVer` oculta la cartera e impide montar su listener, sin impedir las vistas anteriores de órdenes autorizadas. La interfaz de error muestra Reintentar y oculta las columnas mientras no haya lectura válida. ESLint de los 4 archivos fuente/test pasa sin advertencias.
