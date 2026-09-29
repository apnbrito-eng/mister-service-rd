# Portada y canal público — 28/09/2026

## Alcance autorizado y PRE-CHANGE

El archivist pidió conservar CMS, anti-FOUC, catálogo y validaciones de agendamiento. Se conserva la espera del snapshot sin cifras ni títulos de defaults; no se cambian reglas, bot, APIs internas, Órdenes ni datos de producción. No se publicó ni se activó el modo nuevo en Firestore.

## Touch-list expandido

- `src/components/public/PortadaElectrodomesticos.tsx`: modo escena blanco, cuatro equipos del catálogo habilitado intersectado con tipos públicos, reparación/mantenimiento, CTA con selección. Usa tokens Motion y reduced-motion reactivo; solo transform/opacity.
- `src/pages/public/HomePage.tsx`: entrada explícita escena; fija/carrusel y sus imágenes/textos siguen existentes. No duplica portadas.
- `src/services/configWeb.service.ts`: tipo/parser/default escena; documento legacy con imagen y sin modo conserva fija. El helper genérico WhatsApp queda intacto.
- `src/utils/whatsappPublico.ts`: canal central aprobado 18495646767 y query validada.
- `src/components/public/PublicLayout.tsx`, `src/pages/public/ServiciosPage.tsx`, `src/pages/public/ServicioDetalle.tsx`: CTA público central; footer mismo destino.
- `src/components/public/FormularioAgendarPublico.tsx`: equipo preseleccionado validado contra catálogo; intención separada de descripción, visible en resumen. La descripción conserva validación original y empieza vacía. Al enviar se combina `[Reparación/Mantenimiento] descripción` en el campo existente `falla`, también en mensaje WhatsApp. No sobrescribe la descripción escrita ni añade prefijos durante renders.
- `src/services/formularioAgendar.service.ts`: cita pública asigna canal central, no consume contador de rotación. Export heredado conservado por compatibilidad. Notificación, duplicados, honeypot y guardado sin undefined intactos.
- `src/pages/ConfiguracionWeb.tsx`: modo escena y explicación de título; preview central. Configuración antigua de otros canales queda agrupada y claramente rotulada.
- `public/portada/*.webp`: ilustraciones fotográficas generadas de equipos, sin afirmar 3D o video. Imagen CMS tiene prioridad para equipo.
- `tests/integraciones/portada-*.test.ts`, `tests/manual/portada.{html,tsx}`: pruebas aisladas y vista real para QA sin datos reales.

AgendarPage no necesitó cambios: formulario consume la query del router existente. Firestore Rules conserva shape y límite inferior a40claves; intención no agrega campos.

## Comprobaciones y riesgos

Seis pruebas dirigidas pasan: selección equipo/servicio a dos destinos, catálogo apagado, parámetros inválidos, canal central, compatibilidad CMS, actualización del catálogo durante selección y persistencia sin undefined ni contador. Types y lint dirigido sin errores (warning previo ConfigEstadisticas). Build web pasó; revalidar después de cualquier ajuste final de QA.

Pendiente antes de publicar: revisar 375px/1440px, prueba visual reduced-motion, formulario completo sin envío real, y elegir explícitamente modo Equipos y servicio en la configuración del sitio cuando se autorice activarlo. No se ha modificado la configuración publicada. No se afirma una prueba física Android de esta fase.
