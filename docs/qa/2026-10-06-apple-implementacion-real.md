# Apple sobre componentes reales — 06/10/2026

🟦 **Decisión de Jorge:** implementar la parte visual de Claude conservando los cambios funcionales existentes y desplegar. Fuente: petición de esta conversación, 06/10/2026. Responsable: Codex.

## Implementación

✅ **Verificado en fuente:** tokens compartidos, chips de fase por defecto, escala azul del Centro de operaciones, cliente primero en el detalle y la agenda, tarjetas/controles/navegación móvil con presentación Apple, burbujas de chat y búsqueda del menú lateral. Se conservan callbacks, rutas y permisos. Archivos principales: `src/styles/apple.css`, `src/styles/tokens.css`, `src/components/Badge.tsx`, `src/components/Sidebar.tsx`, `src/components/Layout.tsx`, `src/components/progreso/BarraFase.tsx`, componentes de operaciones, `Dashboard.tsx`, `OrdenDetalle.tsx`, `TecnicoVista.tsx` y `main.tsx`.

✅ **Verificado en fuente:** candidata aislada en rama `codex/apple-publicacion-20261006`, basada en la publicación `2301732`. Incorpora el lote recuperado de cierre de órdenes, nómina y ubicación de Inbox; conserva los instaladores públicos existentes. No incorpora la ruta experimental de lavadora 3D. El Escritorio sigue reservado al trabajo concurrente de Claude.

## Pruebas y resultado

- ✅ Compilación frontend/API/web: `npm run build`, PASS; aviso de tamaño de chunks. Log `/tmp/apple-final-build.log`.
- ✅ Integraciones: 182 archivos, **1,247 pruebas PASS**. Log `/tmp/apple-final-tests.log`. La primera ejecución encontró una prueba de lavadora 3D del experimento excluido; se retiró esa prueba de esta candidata y se repitió la suite completa.
- ✅ Reglas Firestore en emulador: 30 archivos PASS, 218 pruebas PASS; un archivo y tres pruebas omitidos. Log `/tmp/apple-release-rules.log`. Esto no prueba reglas desplegadas ni Storage real.
- ✅ ESLint dirigido a componentes cambiados y pruebas de chips: sin errores ni avisos. Log `/tmp/apple-final-lint.log`.
- ✅ Navegador con componentes reales y datos sustituidos: Centro de operaciones a 1440 y 375 px, ficha de técnico y Sidebar. Sin desbordamiento horizontal en la vista móvil comprobada. Búsqueda Nómina visible al administrador y ausente para operaria. Capturas en `evidencias-apple-real-20261006/`.
- ⏳ Cazadores: P-005 detecta reglas locales diferentes del último despliegue. Los demás cazadores pasan. Log `/tmp/apple-release-regression.log`.
- ✅ Intento de despliegue oficial de reglas: Firebase devuelve **403, The caller does not have permission**, al comprobar reglas en `mister-service-app-cloude`. Log `/tmp/apple-official-rules-deploy.log`. El lock no se actualizó.

## Publicación y límites

⏳ Candidata Vercel iniciada con `--prod --skip-domain`, conservando el dominio oficial pendiente de coordinación con Firebase. URL: https://mister-service-b3g2dv3gq-mister-service-rd-team.vercel.app . Consultar la constancia posterior antes de afirmar que está READY. La fuente está sin commit por el bloqueo P-005; el campo commit de version.json no identifica este lote.

⏳ **Pendiente — Jorge:** indicar/iniciar la cuenta Google con acceso al proyecto oficial. La sesión CLI actual solo lista `mister-service-ensayo-260921`.

⏳ **Pendiente — Codex:** desplegar reglas oficiales, comprobar cazadores y hooks, registrar commit, publicar/promover la candidata compatible y verificar el dominio. Para APK nueva hace falta recuperar el JSON Android oficial; la configuración nativa presente es de ensayo, por lo que no se generó un instalador productivo.

❓ **Sin verificar:** recorrido con sesión/datos reales, Samsung físico, aceptación visual de todos los módulos al píxel y funciones de servidor en producción. Las pruebas de navegador usan fixtures; no son operaciones financieras reales.

— Codex

## Constancia final de candidata

✅ **Verificado:** Vercel `dpl_8MazZx9Vbbqc9k1pshXFnHhhX59x` estado READY. Evidencia `/tmp/apple-vercel-inspect-final.log`; candidata protegida por autenticación Vercel. Consulta autenticada de version.json: builtAt2026-10-06T16:46:41.301Z, commit1791305201251 (marca temporal de build sin Git, no commit del lote). Log `/tmp/apple-candidate-version.log`.

✅ **Verificado:** dominio www.misterservicerd.com sigue con commit2301732/builtAt2026-10-01T20:43:49.778Z, consulta HTTP después de preparar la candidata. No se promovió el lote nuevo al dominio oficial. Endpoint nuevo `/api/mapa/ubicacion` responde405 al GET; esto solo comprueba ruta/método, no el resolver autenticado completo.

⏳ **Pendiente:** permiso Firebase oficial, reglas/commit y publicación coordinada. No hay APK nueva ni comprobación Samsung.
— Codex

## Bloqueo resuelto y publicación realizada
✅ Acceso oficial conectado; reglas desplegadas y APK1.0.21 publicada/instalada. Web oficial4788804. Los pendientes de acceso/promoción anteriores quedaron resueltos. Constancia: `2026-10-06-apple-publicacion-oficial.md`.
— Codex
