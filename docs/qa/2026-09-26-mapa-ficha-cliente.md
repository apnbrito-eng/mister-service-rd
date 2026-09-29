# Corrección de previsualización GPS en ficha — 26/09/2026

Jorge reportó que la ficha no previsualiza la ubicación guardada después de publicar1.0.10. Causa confirmada: FichaClienteCabecera (Inbox) y ficha del móduloClientes solo renderizaban enlaces y coordenadas, sin el componente de mapa.

## Cambio
Ambas fichas ahora usan MiniMapaCliente existente con lat/lng del cliente. No se geocodifica la dirección ni se sustituye por ubicación del operador. Sin coordenadas no se inventa un punto; el mini mapa rechaza coordenadas no finitas/fuera de rango. ResizeObserver reajusta Leaflet al cambiar tamaño o volver visible el panel, y el mapa queda dentro del contexto visual de la tarjeta.

## Pruebas
297 pruebas de integración pasan, incluidas dos comprobaciones nuevas de presencia del mapa y ausencia cuando faltan coordenadas en Inbox y Clientes. Build app/API y móvil pasan. Navegador con cliente ficticio y mapa real: cuatro tiles cargados en escritorio; al abrir ficha móvil390px el mapa mide349px, seis tiles cargados y sin salida horizontal. Evidencias mapa-ficha-corregido.png y mapa-ficha-movil.png en evidencias-inbox-20260926. No se modificó ubicación de clientes reales.

## Entrega
APK1.0.11/code12 preparada con identidad y firma de producción; publicación en curso. Reglas/API sin cambios, no requieren redeploy Firebase. Prueba física Android pendiente.

## Pausa y continuación
Jorge pidió guardar y retomar mañana. Deploy68qKxBAxt86WAG3Kbk5pdyommeGR ya enviado y compilando al cerrar; no se canceló y podría finalizar automáticamente. URL https://mister-service-bxfqp17a4-mister-service-rd-team.vercel.app, log /tmp/ms-map-deploy.log. APK1.0.11 SHA256cb25a1a130a24de9c2635deae912021df351f95718bc17874edceae0f37d7333. Primero comprobar ese despliegue y descarga pública, luego mapa web y prueba física Android. No declarar publicada1.0.11 sin comprobarla; última entrega confirmada1.0.10.

## Publicación verificada — 27/09/2026
Deploy Ready en Vercel, dominio y guíaAndroid1.0.11 activos. APK pública idéntica a la local según SHA256 documentado. Identidad/code12 correctos. Mapa y marcador comprobados en ficha del móduloClientes en producción autenticada,10tiles cargados. Captura evidencias-inbox-20260926/mapa-publicado-20260927.png. Sin modificar clientes. Prueba físicaAndroid sigue pendiente.
