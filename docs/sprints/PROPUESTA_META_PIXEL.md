# Propuesta — Meta Pixel + API de Conversiones (Mister Service)

> **Estado:** IDEA / FUTURO. **NO procesar aún** — Jorge lo quiere para hacerlo más adelante. Guardado por Cowork el 2026-05-24 a pedido de Jorge.
> **No está en la cola activa** (`COLA_AUTONOMA.md`) a propósito.

---

## Notas de Cowork (para arrancar más rápido cuando llegue el momento)

El prompt está pensado como si no supiéramos nada del sitio. Pero **ya conocemos el stack**, así que varios pasos del "diagnóstico" se saltan:

- **La web NO es WordPress/Shopify/Wix.** Es una **app a medida en React + Vite, hosteada en Vercel** (la misma de este repo). Implicación: la medición se instala **por código** (en el SPA + opcional un endpoint en `api/`), no con un plugin. Google Tag Manager es opcional, pero para este caso el código directo es más limpio.
- **Eventos `Lead`** = (1) clic en el botón de **WhatsApp** (`utils/whatsapp.ts` arma los `wa.me/...`), y (2) envío del **formulario de cita** (`/agendar` → `FormularioAgendarPublico`, y los formularios dinámicos `/f/:slug`).
- **Evento `Purchase`** = orden completada / facturada (cierre + conduce). Ojo: la venta se **cierra por WhatsApp/oficina, NO hay checkout en la web** — así que el `Purchase` probablemente conviene mandarlo **del lado servidor (API de Conversiones)** cuando se marca la orden como facturada, no desde el navegador del cliente. `value` = monto, `currency` = DOP (o USD según el caso).
- **API de Conversiones (lado servidor):** encaja con un endpoint nuevo en `api/` (Vercel ya corre serverless). Necesita un **token de acceso de Meta** + manejar **deduplicación** (mismo `event_id` en navegador y servidor).
- **Consentimiento de cookies:** el pixel es rastreo de terceros; conviene un aviso/*consent* mínimo antes de dispararlo (privacidad).

### Guardas (importante para cuando se ejecute)

- Esto es una **integración con un tercero (Meta) + endpoint público nuevo + token** → según las reglas del proyecto, **NO es autónomo**: requiere tu OK y la parte de servidor va por `BLOQUEOS.md`.
- El **token de Meta** lo cargás vos en Vercel (Cowork no maneja credenciales).
- Se conecta con el candidato futuro "atribución UTM del lead" que ya estaba anotado — conviene pensarlos juntos.

### Cómo retomarlo

Cuando quieras hacerlo, decime "vamos con el pixel" y seguimos el prompt de abajo, pero saltando el diagnóstico de plataforma (ya lo sabemos) y arrancando por: crear el pixel/conjunto de datos en Meta → instalar el lado navegador (Lead en WhatsApp + formulario) → endpoint de Conversiones para Purchase al facturar → pruebas con Test Events + Pixel Helper.

---

## Prompt original (de Jorge) — guardado tal cual

Cuenta publicitaria Meta: **180693964677323**. Eventos objetivo: `Lead` (clic WhatsApp + envío formulario de cita) y `Purchase` (orden completada, con `value` + `currency`).

El prompt completo, paso a paso (diagnóstico → plan → crear pixel → instalar navegador + API de Conversiones → eventos estándar + deduplicación → verificar con Test Events/Pixel Helper → dejar listo para campañas), está guardado en el archivo original que Jorge subió. Resumen de su intención:

1. Diagnóstico primero (URL, cómo se cierra la venta, formulario, botón WhatsApp, accesos).
2. Explicar el plan simple + recomendar la opción más fácil.
3. Crear y configurar el pixel/conjunto de datos en el Administrador de Eventos y vincularlo a la cuenta `180693964677323`.
4. Instalar medición: pixel (navegador) + API de Conversiones (servidor) para fiabilidad.
5. Eventos estándar: `Lead` (WhatsApp + formulario), `Purchase` (con value/currency) + deduplicación.
6. Verificar con Test Events + Meta Pixel Helper antes de dar por terminado.
7. Dejar listo para campañas de Ventas / Clientes potenciales + ventana de atribución.

Reglas de trabajo de Jorge: lenguaje claro sin tecnicismos, paso a paso esperando confirmación, una cosa a la vez, él hace el clic final en lo sensible, avisar de costos/riesgos antes.
