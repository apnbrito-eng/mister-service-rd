# Clientes e Inbox — verificación independiente

29/09/2026. Tester: motion_prechange. Alcance frontend local; no despliegue ni datos de producción. Informe en curso hasta cierre de animación de salida.

## Evidencias ejecutadas

- TypeScript app y API: PASS (`/tmp/clientes-ts-app-final.log`, `/tmp/clientes-ts-api-final.log`).
- Suite global ejecutada una vez: 99 archivos, 421 pruebas pasaron y 3 fallaron en clientes-compactos por fixture/entorno de ventana. No presentar esa ejecución como íntegramente verde.
- Correcciones posteriores: guard window/matchMedia y fixture de eventos currentTarget. Repetición dirigida: 8/8 Clientes PASS (compactos, canales, editor); 16/16 Inbox PASS (panel y alta independiente). No sumar duplicados a la cifra global.
- Lint dirigido: cero errores, un aviso en Clientes por dependencia selectedCliente del efecto de historial; mismo patrón ya presente en HEAD:197. Aviso nuevo en Inbox corregido con dependencias escalares.
- Cazadores: sólo dos hits, P005/P013 por reglas Firestore/Storage modificadas sin lock de despliegue actualizado, anteriores a esta unidad. Continúan abiertos; no hubo bypass ni silenciamiento.

## Navegador local

Fixture de componentes reales de Clientes: http://127.0.0.1:5221/tests/manual/clientes-qa.html. Firebase y servicios se sustituyen por memoria local; formularios ajenos al alcance son marcadores. El destino Inbox muestra ruta para verificar asociación, no envía mensajes ni representa el chat conectado.

En 375 y 1440 px: seleccionar ficha, editar latitud/longitud a cero, guardar, conservar dirección escrita, validar enlace WhatsApp externo y ruta Inbox con clienteId correcto. Sin desbordamiento horizontal del documento. Capturas /tmp/clientes-375-final.png y /tmp/clientes-1440-final.png; log /tmp/clientes-browser-qa.log. Con reduced-motion los paneles observados tienen transform none. Los transforms propios de Leaflet no se consideran certificación de reducción de movimiento del mapa completo.

## Pendientes antes del dictamen final

- Congelación y comprobación de salida animada lista/detalle que solicitó el reviewer root.
- Revisión independiente final de otro agente; tester no sustituye reviewer.
- Prueba física de esta compilación en Android por root después de construirla.
