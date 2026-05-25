# Propuesta — IA Coordinadora de Citas (intake por WhatsApp)

> **Estado:** IDEA / FUTURO. **NO procesar aún** — requiere una sesión de diseño antes de convertirse en sprint(s). Capturado por Cowork el 2026-05-22 a pedido de Jorge.
> **No está en la cola activa** (`COLA_AUTONOMA.md`) a propósito, para que el coordinator no la agarre sin diseño previo.

---

## La visión (en palabras de Jorge)

Activar una **IA solo en un número** (el secundario / de reserva) que:

1. Interactúa con el cliente por WhatsApp.
2. **Captura los datos** que pide el formulario: cliente, falla, día del servicio, foto del equipo, etc.
3. Deja la **orden pre-agendada** con esos datos.
4. Dirige al cliente hacia el **número principal** una vez capturada la info.
5. Con el tiempo se vuelve **la mejor coordinadora de citas del negocio**, afinándose con las conversaciones reales.
6. Luego se **despliega a los demás números**: todas las secretarias pasan a ser coordinadoras de servicio (operarias), y la IA absorbe parte de la **entrada** del proceso.
7. La IA **asigna la operaria** a través del embudo definido en el flujo.

**Enfoque acordado:** arrancar como **piloto en 1 número**, iterar, y recién después escalar a los demás.

---

## Qué ya existe (reusar, no reinventar)

- Toggle de bot por conversación (`whatsapp_conversaciones.bot.habilitado`).
- Chat con IA: `api/ai/chat.ts` + `api/_lib/iaTools.ts`.
- Inbox CRM completo (`/admin/inbox`, `InboxConversacion`, `PanelCliente360`).
- Formulario de orden + creación en contexto (`useOrdenCreateForm`, `OrdenCreateModal`).
- Captura de fotos del chat → orden (`api/whatsapp/media-proxy.ts`, INBOX-9).
- Webhook entrante + envío saliente con ventana 24h (`api/whatsapp/webhook.ts`, `send.ts`).
- Flujo de cita pre-agendada existente (`citas_por_confirmar`, `/admin/citas`).

## Qué faltaría construir

- Lógica de **conversación guiada** (slot-filling): que la IA pida y valide falla / día / foto / dirección, etc.
- Crear la **orden/cita pre-agendada** desde la conversación de la IA.
- **Hand-off**: cuándo y cómo deriva al número principal / asigna operaria según el embudo.
- Activar el bot solo en el número piloto (sin afectar el resto).

---

## Realidad del "auto-aprende" (aterrizar expectativa)

La IA **no aprende sola** solo por conversar. Lo que sí funciona, y mucho, es un **ciclo guiado**:

1. Buen prompt + sus herramientas (tools).
2. **Ejemplos curados** de las mejores conversaciones reales.
3. **Revisión humana** que corrige los errores de la IA.
4. Esas correcciones retroalimentan el prompt / los ejemplos (y, más adelante, fine-tuning si se justifica).

Con ese ciclo, con el tiempo, se vuelve la mejor coordinadora. Es aprendizaje **guiado**, no mágico.

---

## Guardrails (no negociables)

- La IA **captura y pre-agenda**, pero **una persona confirma** antes de cerrar o cobrar.
- **Nada irreversible** sin humano de por medio.
- Respetar ventana 24h de WhatsApp (la IA responde libre dentro de la ventana; fuera, plantillas).
- Bot activado **solo en el número piloto** hasta validar.

---

## Preguntas de diseño a resolver ANTES del sprint

1. ¿Qué datos exactos pide la IA y en qué orden? (mapa al formulario actual)
2. ¿Cómo es el **embudo**? (fases, cuándo deriva al número principal, cuándo asigna operaria y con qué criterio)
3. ¿La IA crea `cita_por_confirmar`, una orden borrador, o ambos?
4. ¿Cómo confirma el humano? (pantalla / paso)
5. ¿Qué pasa si la IA no entiende o el cliente se sale del guion? (escalado a humano)
6. Métricas de éxito del piloto (citas captadas, % completadas, errores).

---

## Próximo paso

Sesión de diseño (recomendado: usar la skill **entrevistador-procesos** para definir el flujo y el embudo con claridad). De ahí salen 1 o varios sprints limpios para la cola. **No construir antes de tener el flujo definido.**

---

## Adiciones 2026-05-23 (pedidos de Jorge tras revisar el inbox)

Estos 3 ítems son parte del proyecto IA y van con diseño (NO a la cola todavía):

1. **Que el agente de IA responda de verdad.** Hoy el toggle "Bot IA: ON" existe pero la lógica de auto-respuesta no está implementada (era SPRINT-WA-6). El agente debe conversar, capturar datos (falla, día, foto, dirección) y dejar la orden pre-agendada. Es el núcleo del piloto.

2. **Transcribir y entender audios del cliente.** Si el cliente manda nota de voz, bajar el audio (ya existe `api/whatsapp/media-proxy.ts` para media), pasarlo por un transcriptor (STT tipo Whisper/OpenAI — integración nueva, con costo por minuto) y que la IA entienda el contenido. Decisión pendiente: qué proveedor de STT + costo.

3. **Buzón de seguimiento (nurture) — REGLA ANTI-BLOQUEO de Jorge (2026-05-23):**
   - Si el cliente NO quiere agendar, se le envía **UN solo recordatorio automático** (y nada más automático). Esto es deliberado para **NO disparar bloqueos de Meta** (mandar muchos mensajes no solicitados descalifica el número).
   - Después de ese único recordatorio, **todo es MANUAL**: el admin/coordinador selecciona **lotes/cantidades** de clientes y les envía ofertas masivas (con plantillas aprobadas).
   - La conversación se mantiene "viva" sutilmente; se ofrece descuento/asesoría para cerrar la venta — pero el envío masivo siempre es decisión humana, por lotes.
   - **WhatsApp Flows** para capturar datos esenciales del cliente (lo que la IA o el equipo necesiten): se enviarán **solo en momentos esenciales**, no siempre. Cómo se programan los Flows = se ve **más adelante** (fuera del alcance inicial).

**Implicación de diseño:** el motor de envío masivo manual por lotes + el límite de 1 recordatorio automático son requisitos duros para proteger los números de Meta. El diseño debe respetar esto antes de construir.
