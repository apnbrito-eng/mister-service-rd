# Personal y Avances — lote 2 revisado por Codex

Fuente Claude 06630c2, basada en f61b1f0 del mapa unificado. Revisión Codex: únicamente Personal.tsx, Avances.tsx y bamboo.css cambiaron. Servicios financieros y reglas conservados. Fichas históricas sin uid agrupadas en desplegable por equipo; no hay borrado ni reactivación. Avances conserva handlers de creación/eliminación, filtros y totales previos.

Pruebas: 186 archivos/1266 integraciones PASS; TypeScript frontend/API, build web, mobile-production, lint de archivos tocados e invariantes P001–P025 PASS. Evidencias /tmp/bamboo-lote2-*.log. No se crearon ni eliminaron avances reales para probar.

APK oficial 1.0.27/code28 desde fuente 06630c2, identidad com.misterservicerd.app y firma oficial fuera del repo. Metadatos version.json del bundle móvil establecidos a ese SHA antes del empaquetado. Ver manifiesto public/descargas/android-1.0.27.json. Publicación, descarga e instalación se registran al completar.

Siguiente lote Claude: Préstamos y Rendimiento, manteniendo lógica actual y privacidad. Nuevas reglas de comisión/garantía/bono siguen pendientes de especificación; no automatizarlas por inferencia. Carga directa de documentos privados sigue pendiente.


### Cierre verificado lote 2 — Codex 07/10/2026
- ✅ **Verificado:** Vercel Production 6qMhwewgHBgU4i5JLxyujk6NEsuJ READY; www.misterservicerd.com/version.json commit aa801b2. APK1.0.27 publicada y descarga SHA256 coincide con manifiesto; Samsung instalado code28/name1.0.27. Fuente funcional Claude06630c2.
- ✅ **Verificado en Chrome:** Avances muestra nuevo diseño, filtros y formulario (abrir/cancelar sin guardar). Personal muestra Dirección2+A7+B7 vinculados, desplegables sin acceso1+6. No se modificaron datos reales. Evidencia /tmp/bamboo-lote2-avances-produccion.png y lectura AX del dominio oficial.
- **Pruebas y resultado:** 1266 integraciones PASS, TypeScript/API/build web y móvil/lint/invariantes PASS; instalación PASS. Flujo físico Samsung **NO PROBADO**, bloqueado showing=true. Operaciones financieras reales **NO PROBADAS**, sin crear ni borrar movimientos.
- **Siguiente paso — Claude:** integrar origin/codex/bamboo-lote2-publicacion; leer docs/entregas/BAMBOO-LOTE2-2026-10-07.md; continuar diseño Préstamos y Rendimiento. Reglas financieras nuevas y carga directa de documentos siguen pendientes.
— Codex
