# Mapa de operaciones: integración y comprobaciones

Estado: trabajo local en revisión conjunta con Claude Code y Codex. Este documento no acredita publicación ni funcionamiento en producción.

## Fuentes y fechas

Las citas provienen de `ordenes_servicio.fechaCita`. Desde/Hasta incluyen ambos días en Santo Domingo (UTC−4), con límite superior exclusivo a medianoche del día siguiente. Las rutas se agrupan por técnico y día; un rango mensual no se convierte en una ruta de treinta días.

El cliente encabeza cada cita. La ficha del técnico debe combinar el día elegido con órdenes abiertas anteriores, incluso si quedan fuera del rango. Los pendientes de piezas se contrastan con la colección real de standby. Las ubicaciones de clientes y sus direcciones alternativas son datos históricos: su cantidad no representa citas dentro del rango.

GPS fresco, última posición recibida y planificación futura son conceptos distintos. Una ubicación sin fecha válida no demuestra presencia actual. Una jornada finalizada deja de mostrarse en vivo. El código conserva el vínculo entre UID y registro de personal para datos anteriores.

## Cartografía y tiempos

- `src/utils/cargarGoogleMaps.ts` centraliza Maps y Places. Los consumidores anteriores comparten su carga y sus errores.
- `VITE_GOOGLE_MAPS_KEY` es la clave de navegador. Verificar proyecto, API habilitada y restricciones de sitios antes de publicarla. Su presencia en un archivo local no confirma que Google la acepte.
- `VITE_GOOGLE_MAPS_MAP_ID` permite configurar el mapa; mientras no se configure se usa `DEMO_MAP_ID` para el desarrollo de marcadores avanzados.
- Sin cartografía disponible, la lista conserva el trabajo operativo.
- `POST /api/mapa/tiempos` solicita distancias, tiempos y geometría por calles. Requiere sesión de oficina y permiso de lectura de órdenes. La UI consulta una ruta concreta, con su técnico y día.
- La clave de Routes vive solo en `GOOGLE_ROUTES_KEY` del servidor. La función permanece desactivada salvo `GOOGLE_ROUTES_ENABLED=true` y `GOOGLE_ROUTES_LIMITE_MENSUAL` entero positivo.
- El límite está expresado en **solicitudes**, no en dólares ni en gratuidad garantizada. Se reserva de manera transaccional antes de llamar a Google; los errores y timeouts también cuentan como intentos. La cuota del código no reemplaza la facturación de Google.
- No se persisten tiempos ni geometrías de Routes en Firestore o localStorage. El cliente deduplica solicitudes simultáneas; el resultado pertenece a la vista actual. Los resultados vencidos no se presentan como tiempos actuales de Google.
- Sin Routes, distancia y tiempo son estimados; las líneas directas se distinguen de la geometría vial.

Fuentes oficiales consultadas: [políticas de Routes](https://developers.google.com/maps/documentation/routes/policies) y [geometría de rutas](https://developers.google.com/maps/documentation/routes/traffic_on_polylines). Los resultados de Google requieren su atribución y, cuando se representan sobre un mapa, cartografía Google.

## Reasignación

El navegador pide un resumen actualizado antes de confirmar. El servidor obtiene los nombres y responsables reales, comprueba permisos, actividad, versión de la orden y cruces por duración. Una transacción coordina movimientos simultáneos del mapa hacia el mismo técnico y día. El cambio afecta técnico, responsable, auditoría y fecha de actualización; conserva fase, cita y montos.

Deshacer vuelve a validar la versión exacta. Si hubo otra edición, no debe sobreescribirla. Las otras pantallas con escrituras directas que no participan del mismo protocolo siguen requiriendo revisión; el lock del mapa no garantiza exclusión universal para toda la aplicación.

`config_mapa` guarda cuotas, confirmaciones y control de concurrencia solo para el servidor. Las reglas por defecto deniegan acceso directo desde clientes. Un campo de expiración valida la solicitud en el código, pero no configura por sí mismo una política TTL de Firestore.

## Pruebas locales sin datos reales

Vista aislada:

```sh
npx vite --config tests/manual/codex-mapa-aislado.vite.config.ts
```

Abre `http://127.0.0.1:5174/mapa.html`. Usa perfil QA, fixtures señalados, Firebase de demostración conectado a puertos locales y clave Maps vacía. El comparador en `docs/qa/2026-10-02-mapa-comparar.html` monta esa pantalla en 1440 y 375 píxeles. No debe usarse una cuenta real para preparar la maqueta.

Verificación:

```sh
npm run test:integraciones
npm run test:rules
npm run build
npm run check:regression
```

El control P-005 avisará mientras las reglas locales difieran de las publicadas. No modificar el archivo de constancia de publicación para ocultar ese aviso. El trabajo de esta noche no incluye publicar reglas ni desplegar.

Resultados finales y límites: `docs/qa/2026-10-02-mapa-cierre-local.md`. UI, recorridos web/móvil y revisiones de Claude completados localmente; queda la comprobación de configuración real de Google y publicación coordinada de reglas/API/web.
