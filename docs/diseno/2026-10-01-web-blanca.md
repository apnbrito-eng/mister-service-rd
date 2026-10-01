# Rediseño integral web pública — 01/10/2026

## Objetivo y decisión
Web de servicios domésticos con blanco puro, negro legible, azul de acción, imágenes de equipos con espacio, tipografía limpia. Referencia explícita de Jorge: Samsung. Videos pospuestos por el usuario; usar imágenes existentes y conservar el espacio visual para integrarlos después. Mantener contenido CMS y datos del negocio. Implementar en rutas reales, no otra portada aislada.

## Plan y calidad
1. Base de diseño acotada al layout público y navegación/footers accesibles.
2. Portada y selección de equipos; catálogo y detalle coherentes con configuración.
3. Agenda con nueva presentación, conservando lógica de envío y subidas.
4. Revisar móvil/escritorio, navegación/FAQ/selección/formulario; typecheck, build, pruebas de integración, lint y regresiones. Revisar fallos, vacío, carga y movimiento reducido.
5. Entrega verificable y reporte exacto; videos y validación física del Samsung quedan identificados.

## Touch-list y reparto
Claude Code: HomePage.tsx, PortadaElectrodomesticos.tsx, NUEVO PortadaPublica.css. Puede crear ImagenEquipoPublico.tsx y public/portada/solo imágenes si necesarias, sin nuevas librerías, videos ni escrituras de CMS.
Codex: PublicLayout.tsx, NUEVO PublicWebsite.css, ServiciosPage.tsx, ServicioDetalle.tsx, AgendarPage.tsx. Formularios solo wrappers/classes de presentación si necesario. QA tests y fixture específicos. No tocar App.tsx, servicios, rules ni finanzas salvo ampliar explícitamente este documento con evidencia.

## Consumidores comprobados
App.tsx monta HomePage, ServiciosPage, ServicioDetalle, AgendarPage bajo PublicLayout. PortadaElectrodomesticos se usa en HomePage y pruebas/manuales. ConfigWeb compartido con editor administrativo: no cambia schema. FormularioAgendarPublico conserva endpoint y preselección por query. FormularioPublico /f es independiente: fuera del layout y sus estilos, preservar flujo y datos. Admin/técnico fuera del alcance CSS.

## PRE-CHANGE archivist
Historial 1819dca evita flash de contenido viejo en HomePage; conservar loading. 0b3a0e9 creó slugs/CMS. 01df699 corrigió GPS por campo.id dinámico y subidas. 0491b6e unificó catálogo y b6ebe9c corrigió preselección accidental. Patrón P-026: no volver a escrituras públicas Firestore/Storage desde cliente. Repositorio contiene cambios previos extensos; preservar.

## Herramientas
Emil: transiciones concretas cortas, foco, tacto, reduced-motion. Superpowers: plan/criterios/validación. Impeccable recuperado de pbakaus/impeccable en /tmp/impeccable-web-20261001 y leído SKILL/new-work/craft-floor; contexto ejecutado. Se aplica dirección ya fijada por el usuario, sin torneo visual ni entrevistas repetidas. Sin instalación global ni API de pago.

## Límites ajenos al rediseño
Apple/DUNS depende de documentación/proveedor. Pruebas físicas Samsung y conciliación histórica requieren evidencia distinta. No afirmar terminado todo el ecosistema por cerrar el diseño público.

## Cierre de implementación
Añadidos ImagenServicioPublico.tsx, MedioHeroPublico.tsx y prueba catalogo-publico-redesign.test.ts. FormularioAgendarPublico y FormularioPublico no editados en esta pasada (sus modificaciones actuales preexistían). Home conserva medios CMS mediante presentación opcional manual. Guardia y review aprobados; evidencia docs/qa/2026-10-01-web-blanca.md. Videos pendientes, sin publicación.

## Ampliación autorizada al publicar — 01/10/2026
Jorge reporta error al enviar agenda con hora9:00AM y pide corregirlo para probar. Se incluye api/_lib/citaPublica.ts y tests/rules/cita-publica-backend.test.ts: comprobar bloque horario contra configuración del servidor, compartir horarios predeterminados con frontend y conservar HH:mm legado. Sin cambios de reglas, App Check o datos reales. La ruta de ensayo /prueba-lavadora y sus recursos quedan fuera de esta publicación.
