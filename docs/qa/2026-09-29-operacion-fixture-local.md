# Ensayo visual local — mantenimiento, chequeo y cierre

## Inicio

`npx vite --config tests/manual/operacion-qa.vite.config.ts`

Servidor: `http://127.0.0.1:5291/tests/manual/operacion-qa.html`.
Menú interno abre `/qa/mantenimiento`, `/qa/chequeo`, `/qa/cierre`. Iniciar siempre por HTML; las rutas internas pertenecen al router del fixture.

## Aislamiento

- Renderiza los componentes de producción Mantenimiento, SugerenciasChequeo y CierreDia.
- Firestore, configuración Firebase, Auth/contexto, catálogo equipo y servicios de alta/notificación tienen alias locales.
- Escrituras/transactions/batches arrojan error explícito; no fingen que un pago, cierre o envío se guardó.
- CSP `connect-src self` permite servidor local y HMR; bloquea conexiones externas. Links externos y window.open se bloquean en el fixture.
- Abrir ficha, orden e Inbox muestra marcador de destino local y botón Volver. No carga fichas reales. Subcomponente GestiónOrden CRM sustituido por marcador fuera del alcance.
- Todos los nombres, teléfonos, identificadores, banco e importes son datos ficticios.

## Verificado

- Build del fixture con Vite termina limpio; todos los imports de las tres pantallas resueltos.
- HTTP200 y cabecera CSP comprobados.
- La herramienta CUA no ofreció IAB en la sesión del builder. No se declara revisión visual completada: coordinator hará 390px/1440px.

## Recorrido para coordinator

1. Mantenimiento: verificar Vencidos/Hoy/Próximos y aviso por fecha inválida; Programar, selección cliente y fecha, cancelar. Abrir ficha y volver; abrir WhatsApp y volver. Generar orden debe mostrar error local y no éxito.
2. Chequeo: verificar bloque comercial y aprobación técnica separados. Registrar seguimiento abre modal responsable/fecha/resultado/nota; cancelar. Abrir orden e Inbox y volver. Enviar/guardar deben permanecer bloqueados en este entorno.
3. Cierre: revisar RD$4000 confirmados (1500 efectivo + 2500 transferencia), 700 pendiente y pago500 sin fecha visible como incidencia/excluido según proyección; cambiar fecha vacía vs hoy. Abrir confirmación y cancelar; ninguna operación se persiste.
4. Repetir con ancho390 y1440, revisar textos largos, controles y scroll horizontal. Registrar fallos como hallazgos de UI; el fixture no prueba permisos/DB (cubiertos aparte por emulator).
