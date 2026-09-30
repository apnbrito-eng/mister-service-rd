# Fixture final local — 29/09/2026

Inicio: `npx vite --config tests/manual/qa-final.vite.config.ts`.
Puerto estricto5292, host127.0.0.1.

- http://127.0.0.1:5292/qa/piezas — Standby real: buscando/llegó; pestaña Suplidores con activo/inactivo y consulta.
- http://127.0.0.1:5292/qa/resultado — informe real, datos ficticios del mes actual, nóminas cerradas14/29 según generador, gasto y conduce coherente.
- http://127.0.0.1:5292/qa/resultado?incompleto=1 — recargar añade conduce y comisión sin fecha; resultado debe señalar incompleto.
- http://127.0.0.1:5292/qa/personal — página real, personal con docID/uid distintos, empleado legado sin cuenta e inactivo.

Todos los datos pertenecen al fixture `qa-final-fixture.ts`; no conecta Firebase. Escrituras y autenticación mutativa arrojan error local. `fetch` y apertura externa bloqueados; CSP limita conexiones e imágenes. Rutas /admin/* muestran marcador, incluidos Inbox, órdenes y nómina. No se envía WhatsApp ni se crean empleados.

No incluye foto remota: para probar preparación de consulta puede elegirse archivo ficticio local en el modal. Guardar/subir está bloqueado. La cobertura no certifica permisos de producción, consultas/indexes reales, transacciones, App Check, firma, cámara o acciones del servidor. Los filtros Firestore del mock sólo interpretan igualdad; es una prueba de UI, no de semántica completa del backend.

Verificación: Vite build PASS (2637 módulos); servidor responde HTML del fixture incluso al recargar /qa/resultado. Prueba visual interactiva corresponde al coordinador. Los archivos de producción no se modificaron.

## Ajuste tras QA móvil

El fixture completo elimina el pago heredado sin fecha de OS-ENSAYO-3; ese pago permanece únicamente al recargar con `?incompleto=1`. Con mes actual completo se espera resultado registrado RD$4,300 (10,000 − 2,500 − 800 − 2,400). Con `?perdida=1` se incrementa el costo ficticio de piezas a12,000 y se espera pérdida RD$−5,200. El período anterior no tiene nóminas ficticias: su cobertura sigue incompleta y no habilita comparación de resultado.

La pantalla de informe ahora oculta Año/Mes en modo Desde/Hasta y conserva su selección al volver a Mes. Prueba focal cubre alternancia y conservación de selección.
