# Lote 2 — historial de cobros por cuenta

## Entrega local

- `src/utils/movimientosCobros.ts`: proyección derivada sólo lectura de `ordenes_servicio.pagos[]`, sin sumar subcolección espejo ni `montoPagado`. Reutiliza `fechaFinanciera` del lote financiero.
- `src/components/bancos/MovimientosBanco.tsx`: selección por bancoId, historial completo por defecto, Desde/Hasta inclusivos día RD, totales confirmados/pendientes, incidencias y enlace `/admin/ordenes/:id`.
- `src/pages/Bancos.tsx`: integra historial y retira llamada automática de migración al montar. Catálogo y CRUD existentes conservados; no se ejecutó ninguna migración.
- `tests/integraciones/movimientos-cobros.test.ts`: 26 casos.
- `tests/manual/bancos-movimientos.html` y `bancos-movimientos-preview.tsx`: fixture con cuentas/pagos ficticios, renderiza solamente presentación; no monta suscripción de órdenes, catálogo ni migración.

## Semántica

Identidad por ordenId+pagoId. Todas las copias de un ID repetido dentro de una orden se excluyen aunque coincidan; dos IDs diferentes con monto/fecha iguales sí cuentan. No se deduplica por nombre, importe ni fecha. Cuentas del mismo nombre quedan separadas por ID.

Fecha válida cruda requerida; sin fecha se muestra incidencia sin asignar período. Se muestran dichas incidencias incluso al filtrar, con aviso. Montos requieren número finito positivo; verificado true suma confirmado, false suma pendiente, ausencia es incidencia. Efectivo y pagos sin banco u otras cuentas quedan fuera. Orden eliminada con pago queda como incidencia, excluida de totales y sin inventar reverso.

Comparación: suma de registros del array verificados, con fecha/método/monto válidos sin deduplicar, frente a total validado del mismo banco/período. Ambas excluyen órdenes eliminadas. No afirma corresponder al reporte legado completo, saldo bancario real ni conciliación final.

## Acceso

Suscripción amplia sólo para administrador/coordinadora con bancosGestionar. Cleanup al desmontar/revocar; guarda identidad propietaria del estado y oculta datos anteriores al cambiar perfil. Error explícito limpia datos y evita presentar total parcial como válido. No cambios de reglas ni permisos.

## Pruebas

- Vitest dirigido: 26/26.
- ESLint helper, componente, Bancos, test y fixture: limpio.
- TypeScript tras integración y repetición final después de fixture/cazador: limpio.
- `npm run check:regression`: ejecuta sin error runtime; P-033/P-032 y demás nuevos pasan, únicamente P-005/P-013 previos bloquean por despliegue pendiente de reglas.
- Cazador P-033 conserva datos crudos, impide writes en historial y migración automática al abrir; registrado sin alterar otros cazadores.
- Mapa: nueva entrada Bancos → órdenes y regeneración `npm run mapa` aprobada; artefactos mapa.mmd, explorador.html, PROMPT_SISTEMA.md, mapa.svg y snapshot histórico.

Para QA local: `npx vite --host 127.0.0.1 --port 5238` y abrir `/tests/manual/bancos-movimientos.html`. Seleccionar cuenta001: RD$1500 confirmado, RD$1500 pendiente, 3 incidencias (2 duplicados y una sin fecha). Cuenta002: RD$1500 confirmado y cero incidencias. Enlace a orden es navegación de fixture, no carga una orden real.

Pendientes: QA visual independiente y conexión real bajo cuenta autorizada sin mutaciones. No publicación, APK, cambios de datos, envío ni Git. Esta proyección no crea libro contable ni sustituye conciliación; lectura completa de órdenes puede requerir paginación/agregación posterior por volumen.
