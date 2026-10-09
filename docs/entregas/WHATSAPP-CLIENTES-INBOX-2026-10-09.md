# Contacto de clientes desde el WhatsApp empresarial — 09/10/2026

Objetivo: cumplir la decisión de Jorge de abrir la conversación completa empresarial desde los botones de contacto de clientes. Responsables: Codex integra; agentes carteras y rutas_whatsapp adaptan páginas; review_centro revisa identidad y borradores. No cambia permisos, reglas financieras ni envía mensajes.

## Implementación

- `useChatClienteEmpresa` y `BotonChatCliente`: resolución de identidad antes de navegar; bloqueo durante operación, error visible y reintento. Roles de oficina vigentes, sin conceder inbox a técnicos.
- `resolverChatContacto`: cliente explícito debe existir y coincidir con teléfono; búsqueda normalizada sin elegir arbitrariamente entre duplicados. Comprueba conversaciones de diez y once dígitos, bloquea vínculos ajenos/huérfanos o duplicados. No crea clientes ni conversaciones.
- Clientes, Citas, Solicitudes, Feedback, Reprogramaciones, OrdenDetalle, OrdenDetailModal, ContactoOrden, RegistrarPagoModal, Facturas y ProcesarFacturacionModal usan inbox. Mapa abre inbox para cliente y conserva WhatsApp personal para ruta del técnico. Reactivación ya estaba integrada en el lote anterior.
- Textos de conduce, banco, GPS, seguimiento y reprogramación llegan como borradores mediante estado del router, sin ponerlos en URL. Nunca se envían al abrir. El composer mantiene controles de ventana/plantillas y envío existentes.
- `useBorradorConversacion`: borrador ligado al waId, no se traslada al cambiar cliente y no sobrescribe texto ya redactado en esa conversación. Límite de texto4096.
- ContactoOrden conserva auditoría antes de navegación y exclusión mutua con la llamada telefónica. La llamada y enlace tel permanecen.
- Reprogramación conserva mutaciones existentes: aprobar/rechazar/contraproponer se registra primero; abrir WhatsApp no cambia la propuesta. Textos no afirman envío automático.

## Verificación

✅ 45 pruebas en siete suites dirigidas PASAN: resolver (8), hook/borrador (6), páginas Feedback/Reprogramación (2), traza de contacto (4), reactivación, mapa y conversión de solicitud. Evidencia `/tmp/chat-empresa-integraciones.log`.
✅ TypeScript frontend y lint del alcance pasan; `/tmp/chat-empresa-typecheck.log`, `/tmp/chat-empresa-lint.log`. Precommit ejecuta API/frontend, regresión y lint staged antes de aceptar el commit.
✅ Suite de conversión adaptada para simular dependencia servidor de cartera incorporada en lote anterior. Prueba nueva demuestra recuperar asignación fallida sin duplicar orden. No se ocultan fallos reales ni se usan datos/clientes productivos.
⏳ Render/navegación real y Samsung NO PROBADOS; Mac bloqueado. Dot no inicia hasta señal. No mensajes, cuentas nuevas, migración ni borrados.

## Hallazgos pendientes de otros lotes

⏳ `Clientes y responsables` todavía deriva de órdenes/CRM y no sustituye la cartera completa A/B; pestaña Carteras de Clientes es otra vista. Corregir modelo sin perder responsabilidades de órdenes.
⏳ MapaClientes continúa Leaflet/OSM, no Google del mapa nuevo. Reusar infraestructura Google en lote separado.
⏳ Menú y permisos visibles secretaria/operaria tienen diferencias; auditar rutas/API/Rules antes de alinear. No ampliar accesos automáticamente durante este lote.
⏳ Sidebar oculta badges cero y carece de algunos totales; implementar conteos agregados con permisos y significado definido.
⏳ Finanzas por trabajo y privacidad de salario/porcentaje heredados siguen pendientes. Bulk marketing requiere plantillas y consentimiento; abrir inbox no constituye campaña enviada.

## Publicación y reversión

No publicado en producción. Construir preview y APK desde el mismo SHA integrado; candidatos anteriores no incluyen este lote. No promover sin pruebas funcionales y validación coordinada. Revertir este commit de interfaz y helpers revierte la navegación, sin migraciones ni movimientos financieros que deshacer.

— Codex
