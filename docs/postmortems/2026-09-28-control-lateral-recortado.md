# Control del menú lateral recortado

Fecha: 28 de septiembre de 2026.

## Evidencia y alcance

Jorge señaló en la captura de Solicitudes que la flecha azul para reducir o expandir el lateral aparecía cortada. El código previo colocaba el botón fuera del borde mediante `absolute -right-3` y declaraba `w-6 h-6`; el contenedor del layout tiene `overflow-hidden`.

No se obtuvo un hash verificable del origen durante esta pasada. No se atribuye el defecto a un commit supuesto. La corrección permanece local al redactar este informe.

## Causa

El control dependía de espacio exterior al lateral y de reglas globales para alcanzar un tamaño táctil adecuado. Un ancestro con recorte podía ocultar parte de su superficie; el cambio de anchura colapsada agravaba la dependencia del desbordamiento.

## Corrección

`src/components/Sidebar.tsx`: control dentro del lateral (`right-2`), caja explícita de 44 × 44 px, espacio superior para evitar solaparlo con el logo. Conserva la acción de reducir/expandir.

## Prevención y verificación

- Un control esencial debe caber completo en el contenedor que lo recorta, tanto abierto como reducido.
- La prueba unitaria `tests/integraciones/sidebar-movimiento.test.ts` comprueba enlace accesible y declaración de tamaño; **no prueba la geometría real del navegador**.
- Fixture local: `tests/manual/sidebar-movimiento.html`, servido exclusivamente mediante `tests/manual/sidebar-movimiento.vite.config.ts`. Utiliza Sidebar real con servicios sustituidos, sin datos ni conexiones Firebase.
- Comprobar a 375 px y 1440 px, expandido y reducido: rectángulo del botón contenido en rectángulo del lateral, caja mínima 44 × 44 y puntos interiores alcanzables por `elementFromPoint`.
- La evidencia geométrica de navegador debe quedar en el informe de QA. Está pendiente de la verificación del coordinador al redactar este documento.

No se presenta una búsqueda de clases como sustituto de una comprobación visual ni se afirma que un detector de texto pueda garantizar ausencia de recorte.

## Verificación de geometría — 28/09/2026, cierre del piloto

Se midió el botón real en el fixture aislado de Sidebar con navegador a 375×812 y 1440×1000. En ambos tamaños: abierto x=203,y=9,44×44; reducido x=11,y=9,44×44. `elementFromPoint` en el centro devuelve el botón o uno de sus descendientes en los cuatro casos. El grupo activo se pudo plegar (aria-expanded=false). Captura: `docs/qa/evidencias-mejoras-20260927/sidebar-motion-web.png`. Esto verifica el componente aislado, no sustituye el recorrido del Layout en Android físico.
