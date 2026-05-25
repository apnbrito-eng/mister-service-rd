# 🧠 MEMORIA MAESTRA — Mister Service RD

> **Qué es esto:** la foto SIEMPRE actual de en qué andamos. Pendiente, en curso, hecho reciente, y las decisiones de Jorge que no se olvidan. **Es lo PRIMERO que se lee al abrir cualquier conversación** (Cowork o Claude Code) y lo ÚLTIMO que se actualiza al cerrar.
>
> **Cómo usarlo (Jorge):** al abrir una conversación nueva, escribí **"ponte al día"**. Claude lee este archivo y queda cargado con todo. Vos podés abrirlo cuando quieras para ver el estado: está en `docs/sprints/MEMORIA_MAESTRA.md`.
>
> **Quién lo mantiene:** el agente **`memoria`** (`.claude/agents/memoria.md`). El coordinator lo actualiza al cerrar cada pasada; Cowork lo actualiza al cerrar cada conversación. Este archivo es un ÍNDICE corto — el detalle vive en los archivos enlazados abajo.

**Última actualización:** 2026-05-24 por coordinator (pasada 47, `trabaja`).

---

## ⏳ PENDIENTE AHORA

### En la cola autónoma (Jorge corre `trabaja` en Claude Code) — en orden

1. **SPRINT-GARANTIA-FLUJO-COMPLETO** — completar el flujo de garantía (ya medio hecho en SPRINT-135a) con las reglas de Jorge. Toca dinero → reviewer + auditor_contable + guardian_logica + QA de Jorge. Es el siguiente sprint en la cola.
2. **SPRINT-PAGOS-FIX-COTIZACIONES-NUMERO-TRANSACCIONAL** (follow-up nuevo, NO en cola formal aún) — migrar `Cotizaciones.tsx:314` de `generateNumeroCotizacion(count)` deprecated a `siguienteNumeroCotizacion()` atomic. Severidad ALTA, riesgo BAJO, autónomo. Documentado en `AUDITORIA_CONTABLE_2026-05-24.md`. Cowork puede agregarlo a la cola cuando quiera.

### En BLOQUEOS esperando OK de Jorge

- **SPRINT-PAGOS-CONFIRMA-MARIA-FASE-B-2** — ESCALADO 2026-05-24 pasada 47 por ambigüedad técnica (qué hacer con los 4 escritores del array `pagos[]` durante la migración). 3 opciones documentadas (A dual-write / B lectores prefieren array / C solo migración). Jorge elige opción + corre `procesa bloqueos`.

### Esperando acción manual de Jorge (Cowork NO puede hacerlas)

### Esperando acción manual de Jorge (Cowork NO puede hacerlas)

- **`npm run deploy:storage-rules`** (SPRINT-138) — sin esto las fotos del chat→orden no andan 100% en producción; el cazador P-013 queda en WARN (no bloquea).
- **Smoke test en producción** — selector de número con números reales, trazabilidad (quién envió + nombre del agente), respuestas rápidas con "/", y el inbox (fotos, ficha cliente, form a la izquierda).
- **Crear 2da/3ra WABA en Meta** + cargar `phone_number_id` + token en Vercel env + allowlist → desbloquea `SPRINT-WA-NUMERO-RESPALDO-MANUAL-FASE-2`.

---

## 🔧 EN CURSO

Nada activo en construcción ahora mismo. La cola tiene B-2 esperando que Jorge corra `trabaja`.

---

## ✅ HECHO RECIENTE (últimos hitos)

- **2026-05-24 (pasada 47, `trabaja`)** — Bloque AGENTES procesado completo: (a) `SPRINT-AGENTES-1-AUDITORIA-CONTABLE` commit `d938135` — agente `auditor_contable` + 3 cazadores P-021/P-022/P-023 (subió de 20→23) + informe `AUDITORIA_CONTABLE_2026-05-24.md` con 1 hallazgo crítico (Cotizaciones.tsx número no-transaccional, sprint follow-up). (b) `SPRINT-AGENTES-2-MEMORIA-DIRIGE` commit `df68a42` — `MAPA_RIESGOS_MODULOS.md` (11 módulos) + modo MANTENER-MAPA en agente memoria + sub-regla CLAUDE.md. (c) `SPRINT-AGENTES-3-PARALELIZAR` commit `30abe53` — coordinator paraleliza verificación + auditorías de módulos disjuntos. SPRINT-PAGOS-FASE-B-2 escalado a BLOQUEOS por ambigüedad técnica (NO se tocó código de pagos).
- **2026-05-24** — Auditoría de software completa (Cowork): informe en `docs/sprints/AUDITORIA_SOFTWARE_2026-05-24.md` (1 crítico, 6 altos, varios medios). Se creó el sistema de **memoria viva** (`MEMORIA_MAESTRA.md` + agente `memoria`, commit `dad8ca8`), el bloque **AGENTES** en la cola, el agente **`guardian_logica`**, y el sprint de **garantía**.
- **2026-05-24** — `SPRINT-WA-SEGURIDAD-CONFIG-RULES` COMPLETADO (commit `e9aa3ef`). Se cerró un hueco de permisos: los 3 docs de config de WhatsApp (`whatsapp_envio`, `whatsapp_numeros`, `whatsapp_respuestas_rapidas`) ahora son escribibles SOLO por admin. Verificado con emulator (Java Temurin 25, 22 tests OK) + rules deployadas. 20 cazadores OK.
- **2026-05-24** — **QA de PAGOS-FASE-B-1 aprobada** (Jorge + Cowork verificaron en producción): se confirmó el pago de prueba de OS-0059 → salió de pendientes → desbloquea la emisión del conduce. Por eso B-2 ya está en la cola.
- **2026-05-23** — `SPRINT-WA-TRAZABILIDAD-Y-RESPUESTAS-RAPIDAS` (commit `d7b320b`): trazabilidad de quién envía cada mensaje + nombre del agente al cliente + respuestas rápidas tipo WhatsApp Business.
- **2026-05-23** — `SPRINT-WA-INBOX-UX-QUICKWINS` (commit `3eff5eb`): número real + código en el selector, último servicio en el panel del cliente, botones de copiar, plantillas accesibles con la ventana abierta.
- **2026-05-22** — `SPRINT-WA-NUMERO-RESPALDO-MANUAL` Fase 1 + arreglo del bug `stripUndefinedDeep` (mensajes de WhatsApp que no se reflejaban en el CRM) + arreglo del script `deploy:storage-rules`.

> El detalle completo de cada día está en `docs/sprints/DIARIO_<fecha>.md`.

---

## 📌 DECISIONES DE JORGE QUE NO SE OLVIDAN

- **Garantía (reglas confirmadas en entrevista 2026-05-24):** cuando un trabajo falla y se cubre la garantía, se reabre la orden (hoy crea una orden ligada; base ya existe de SPRINT-135a). Reglas: (1) al **técnico original** se le descuenta el **10% del costo de las PIEZAS** de la re-reparación, siempre que haya gasto en piezas; (2) el original **conserva su comisión** (el 10% reemplaza el viejo "pierde toda la comisión"); (3) si **otro** técnico cubre la garantía de un compañero, ese **sí gana comisión**; si el **mismo** técnico la cubre, **no gana** comisión por la garantía; (4) el **cliente paga según el caso** (gratis o parcial, lo decide quien reabre); (5) **reabren: secretaria, operaria, coordinadora, admin — los técnicos NO**; (6) el plazo sale del **conduce de garantía** (60 días por defecto). Detalle técnico en `SPRINT-GARANTIA-FLUJO-COMPLETO` (cola) + informe `AUDITORIA_SOFTWARE_2026-05-24.md`.
- **Buzón de seguimiento (nurture) — regla anti-bloqueo:** a un cliente que NO quiere agendar se le manda **UN solo recordatorio automático**, nada más automático. Después, todo es **manual por lotes** que selecciona el admin/coordinador (para no disparar bloqueos de Meta). WhatsApp Flows se ven más adelante.
- **PAGOS por fases con QA entre cada una.** B-1 ya pasó QA → B-2 habilitada. B-3 (toca reglas) espera nueva QA de Jorge antes de procesarse.
- **Cowork NO hace solo:** crear WABA / cuentas, pagos, OAuth, integraciones nuevas, migraciones >500 docs, ni tocar reglas de Firestore sin OK. Eso se escala a `BLOQUEOS.md`.
- **Comunicación:** español latino/dominicano, breve, sin jerga. Decir siempre si un comando va en la **Terminal de la Mac** o en **Claude Code**.
- **Números WhatsApp:** `1226992440486630` = +1 829-471-6265 (Principal) · `1151997541323577` = +1 849-564-6767 (Respaldo).

---

## 🔮 PROYECTOS FUTUROS (necesitan diseño antes de cola)

- **IA Coordinadora de Citas** — agente de WhatsApp que agende solo, transcriba audios del cliente, y el buzón de seguimiento con la regla anti-bloqueo. Visión + preguntas de diseño en `docs/sprints/PROPUESTA_IA_COORDINADORA_CITAS.md`. **No construir sin sesión de diseño.**
- **Meta Pixel + API de Conversiones** — medir `Lead` (clic WhatsApp + formulario de cita) y `Purchase` (orden facturada) para que las campañas de Meta optimicen. Cuenta `180693964677323`. Detalle + notas en `docs/sprints/PROPUESTA_META_PIXEL.md`. **Jorge lo quiere para más adelante.** NO autónomo (integración con tercero + endpoint + token → tu OK + BLOQUEOS). Gatillo: "vamos con el pixel".

---

## 🗂️ DÓNDE VIVE TODO (índice de la fuente viva)

| Si querés saber… | Mirá aquí |
|---|---|
| Qué hay pendiente en la cola | `docs/sprints/COLA_AUTONOMA.md` (el tope) |
| Qué espera OK de Jorge | `docs/sprints/BLOQUEOS.md` |
| Qué hizo el coordinator cada día | `docs/sprints/DIARIO_<fecha>.md` |
| Log detallado de ejecución autónoma | `docs/sprints/EJECUCION_AUTONOMA.md` |
| Reglas del proyecto + gotchas | `CLAUDE.md` |
| Contexto general para Cowork | `COWORK_CONTEXTO.md` |
| Bugs catalogados (cazadores) | `docs/PATRONES_REGRESION.md` |
| Análisis de bugs de producción | `docs/postmortems/*.md` |

---

> **Recordatorio para quien edite este archivo:** mantenelo CORTO. Esto es un índice del estado, no una copia de todo. Si una sección crece mucho, movela al archivo fuente que corresponde y dejá solo el enlace. Tachar (`~~...~~`) en vez de borrar cuando algo se completa y querés preservar el rastro por unos días.
