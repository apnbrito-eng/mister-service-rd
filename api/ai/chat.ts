import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore } from '../_lib/firebaseAdmin.js';
import { toolsParaRol, ejecutarTool, contextoFechaRD, tieneAccesoAsistenteIA, type Rol as RolTool } from '../_lib/iaTools.js';

/**
 * POST /api/ai/chat
 * Body: { mensajes: Array<{ role: 'user' | 'assistant', content: string }>, conversacionId?: string }
 * Headers: Authorization: Bearer <Firebase ID token>
 *
 * Valida que el usuario tenga iaHabilitada === true y que su rol NO sea
 * tecnico/ayudante (fase beta). Llama a Claude Sonnet con un system prompt
 * role-aware + tools READ-only de Firestore. Tool use loop con max 5 iteraciones.
 * Token tracking acumula todas las iteraciones para reportar costo real.
 *
 * Sprint 5: persiste conversaciones exitosas en la colección `conversaciones_ia`.
 * Si el body trae `conversacionId`, valida que pertenezca al mismo uid (403 si
 * no). Conversaciones con error NO se persisten. El system prompt y los
 * tool_use/tool_result internos tampoco se guardan — solo user/assistant texto.
 */

type Rol = 'administrador' | 'coordinadora' | 'operaria' | 'secretaria' | 'tecnico' | 'ayudante';

interface Mensaje {
  role: 'user' | 'assistant';
  content: string;
}

const SYSTEM_BASE_SIN_FECHA = `Eres el asistente IA interno de Mister Service RD, un negocio de reparación de electrodomésticos en República Dominicana. Hablas español dominicano, conciso y profesional.

Contexto del negocio:
- Sistema operativo interno, paralelo a la facturación DGII (que se hace en otro software autorizado).
- Documentos llamados Conduces de Garantía (CG-####), NO facturas fiscales.
- ITBIS 18% es referencia interna para calcular ganancia neta y comisión del técnico.
- Quincenas RD: Q1 va del día 30 al 14, paga día 15. Q2 va del día 15 al 29, paga día 30.
- Sueldo base es MENSUAL, se divide entre 2 por quincena en la nómina.

Tienes acceso a herramientas para consultar la base de datos del sistema en tiempo real. Cuando el usuario pregunte algo sobre datos concretos (órdenes, inventario, comisiones, agenda, clientes, gastos, tarifario, etc.), USA las herramientas disponibles antes de decir que no sabes. Si no encuentras una herramienta apropiada para la pregunta, di amablemente que esa información específica todavía no la puedes consultar. Cuando uses una herramienta, primero entiende bien qué te están preguntando, después ejecuta la(s) herramienta(s) que necesites, y finalmente responde con los datos en lenguaje natural — no muestres JSON crudo al usuario.

Eres educado pero directo. No alargues respuestas innecesariamente.`;

const SYSTEM_POR_ROL: Record<string, string> = {
  administrador: `Eres asistente del ADMINISTRADOR. Tienes acceso completo a todos los temas del negocio: órdenes, clientes, comisiones, nómina, gastos, ganancias, configuración fiscal.`,
  coordinadora: `Eres asistente de la COORDINADORA. Puedes hablar de órdenes, clientes, agenda, inventario, comisiones de técnicos. NO discutes temas de nómina del personal administrativo ni gastos generales del negocio. Si el usuario pregunta esos temas, redirige a hablar con el administrador.`,
  operaria: `Eres asistente de la OPERARIA. Puedes hablar de órdenes, citas, agenda del día, inventario, productos, clientes. NO discutes comisiones, nómina, ganancias, ni temas financieros del negocio. Si te preguntan, redirige al administrador.`,
  secretaria: `Eres asistente de la SECRETARIA. Puedes hablar de citas, agenda, productos, órdenes activas y cómo gestionar nuevos leads. NO discutes información financiera de ningún tipo. Si te preguntan, redirige al administrador.`,
};

const MAX_TOOL_USE_ITERACIONES = 5;
const MAX_TOKENS_POR_ITERACION = 2048;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 1. Validar body
  const body = req.body || {};
  const mensajes: unknown = body.mensajes;
  if (!Array.isArray(mensajes) || mensajes.length === 0) {
    return res.status(400).json({ error: 'Body debe incluir mensajes como array no vacío' });
  }
  const valid = mensajes.every(
    (m) =>
      m &&
      typeof m === 'object' &&
      (m as Mensaje).role &&
      ((m as Mensaje).role === 'user' || (m as Mensaje).role === 'assistant') &&
      typeof (m as Mensaje).content === 'string'
  );
  if (!valid) {
    return res.status(400).json({ error: 'Cada mensaje debe tener { role: user|assistant, content: string }' });
  }
  const lastMensaje = mensajes[mensajes.length - 1] as Mensaje;
  if (lastMensaje.role !== 'user') {
    return res.status(400).json({ error: 'El último mensaje debe ser del usuario' });
  }
  const conversacionIdBody: unknown = body.conversacionId;
  if (
    conversacionIdBody !== undefined &&
    conversacionIdBody !== null &&
    typeof conversacionIdBody !== 'string'
  ) {
    return res.status(400).json({ error: 'conversacionId, si se envía, debe ser string' });
  }

  // 2. Extraer ID token
  const authHeader = req.headers.authorization || req.headers.Authorization;
  const rawAuth = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  if (!rawAuth || typeof rawAuth !== 'string' || !rawAuth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Falta header Authorization: Bearer <token>' });
  }
  const idToken = rawAuth.slice(7).trim();
  if (!idToken) {
    return res.status(401).json({ error: 'Token vacío' });
  }

  // 3. Validar API key de Anthropic
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Falta ANTHROPIC_API_KEY en el entorno del servidor' });
  }

  try {
    // 4. Verificar token Firebase
    const auth = getAdminAuth();
    let decoded;
    try {
      decoded = await auth.verifyIdToken(idToken);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'auth/id-token-expired' || code === 'auth/argument-error') {
        return res.status(401).json({ error: 'Token de sesión inválido o expirado. Vuelve a iniciar sesión.' });
      }
      throw err;
    }

    const uid = decoded.uid;
    const userEmail = (decoded.email || '').toLowerCase();

    // 5. Cargar perfil: usuarios/{uid} → fallback personal where email == userEmail
    const db = getAdminFirestore();
    let perfil: { rol?: Rol; iaHabilitada?: boolean; nombre?: string } | null = null;

    const usuarioSnap = await db.collection('usuarios').doc(uid).get();
    if (usuarioSnap.exists) {
      const data = usuarioSnap.data() as { rol?: Rol; iaHabilitada?: boolean; nombre?: string };
      if (data && (data.rol !== undefined || data.iaHabilitada !== undefined)) {
        perfil = data;
      }
    }

    if (!perfil && userEmail) {
      const byEmail = await db
        .collection('personal')
        .where('email', '==', userEmail)
        .limit(1)
        .get();
      if (!byEmail.empty) {
        const data = byEmail.docs[0].data() as { rol?: Rol; iaHabilitada?: boolean; nombre?: string };
        perfil = data;
      }
    }

    if (!perfil) {
      return res.status(403).json({ error: 'No se encontró tu perfil en el sistema. Contacta al administrador.' });
    }

    // 6. Validar iaHabilitada (undefined se trata como default por rol — usuarios
    // existentes pre-Sprint 1 no tienen el campo seteado).
    if (!tieneAccesoAsistenteIA(perfil)) {
      return res.status(403).json({ error: 'Tu usuario no tiene el Asistente IA habilitado. Pedí acceso al administrador.' });
    }

    // 7. Validar rol (fase beta: sin tecnico/ayudante)
    const rol = perfil.rol;
    if (!rol || rol === 'tecnico' || rol === 'ayudante') {
      return res.status(403).json({ error: 'El Asistente IA está en fase beta. Tu rol todavía no tiene acceso.' });
    }

    // 7.5. Si viene conversacionId, validar que exista y pertenezca al uid.
    // No propagamos el doc existente — solo guardamos la ref para el update
    // posterior y rechazamos si no es del usuario actual.
    const conversacionIdInput: string | null =
      typeof conversacionIdBody === 'string' && conversacionIdBody.length > 0
        ? conversacionIdBody
        : null;
    let docRefExistente: FirebaseFirestore.DocumentReference | null = null;
    if (conversacionIdInput !== null) {
      const ref = db.collection('conversaciones_ia').doc(conversacionIdInput);
      const snap = await ref.get();
      if (!snap.exists || snap.data()?.usuarioId !== uid) {
        return res.status(403).json({ error: 'Conversación inválida o no autorizada.' });
      }
      docRefExistente = ref;
    }

    // 8. Construir system prompt + tools habilitadas para el rol
    const bloqueRol = SYSTEM_POR_ROL[rol] || '';
    const bloqueEstatico = `${SYSTEM_BASE_SIN_FECHA}\n\n${bloqueRol}`;

    // Bloque dinámico de fecha/hora RD — se regenera en CADA request para que
    // el modelo sepa qué día es "hoy", qué rango cubre "esta semana"/"esta
    // quincena", etc. Va PRIMERO para que tenga peso al interpretar la pregunta.
    const ctx = contextoFechaRD();
    const bloqueFecha = `FECHA Y HORA ACTUAL (zona horaria República Dominicana, GMT-4):
- Hoy: ${ctx.diaSemanaEspanol}, ${ctx.fechaLargaEspanol} (${ctx.hoy})
- Ayer: ${ctx.ayer} | Mañana: ${ctx.manana}
- Semana actual (lunes a domingo): ${ctx.semanaActual.inicio} a ${ctx.semanaActual.fin}
- Mes actual: ${ctx.mesActual.inicio} a ${ctx.mesActual.fin}
- Quincena actual (${ctx.quincenaActual.etiqueta}): ${ctx.quincenaActual.inicio} a ${ctx.quincenaActual.fin}, paga ${ctx.quincenaActual.diaPago}
- Hora actual: ${ctx.fechaHoraIso}

Cuando el usuario diga 'hoy', 'esta semana', 'esta quincena', etc., usa estas fechas exactas para llamar las tools. Nunca asumas otra fecha — siempre estos valores de arriba.`;

    const rolTool = rol as RolTool; // ya descartamos tecnico/ayudante
    const toolsDisponibles = toolsParaRol(rolTool);
    const anthropicTools = toolsDisponibles.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema,
    }));

    // 9. Tool use loop (max MAX_TOOL_USE_ITERACIONES iteraciones)
    const anthropic = new Anthropic({ apiKey });
    // System en dos bloques: (1) fecha dinámica SIN cache_control (cambia en
    // cada request, invalidaría el cache si se marcara), (2) base estática +
    // rol CON cache_control ephemeral para aprovechar prompt caching.
    const systemParam = [
      {
        type: 'text' as const,
        text: bloqueFecha,
      },
      {
        type: 'text' as const,
        text: bloqueEstatico,
        cache_control: { type: 'ephemeral' as const },
      },
    ];

    // messages va acumulando la conversación completa (turno inicial + ida-vuelta de tools)
    const messagesLoop: Anthropic.MessageParam[] = (mensajes as Mensaje[]).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    let totalTokensInput = 0;
    let totalTokensOutput = 0;
    let respuestaFinal: Anthropic.Message | null = null;
    let iteraciones = 0;

    while (iteraciones < MAX_TOOL_USE_ITERACIONES) {
      iteraciones += 1;
      let response: Anthropic.Message;
      try {
        response = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: MAX_TOKENS_POR_ITERACION,
          system: systemParam,
          tools: anthropicTools.length > 0 ? anthropicTools : undefined,
          messages: messagesLoop,
        });
      } catch (err: unknown) {
        const status = (err as { status?: number })?.status;
        const message = err instanceof Error ? err.message : 'Error desconocido';
        if (status === 401) {
          console.error('ai/chat anthropic 401:', err);
          return res.status(500).json({ error: 'Credenciales de Anthropic inválidas (revisar ANTHROPIC_API_KEY)' });
        }
        if (status === 429) {
          return res.status(429).json({ error: 'Anthropic rate limit alcanzado. Intenta de nuevo en unos segundos.' });
        }
        if (status === 400) {
          return res.status(400).json({ error: `Petición rechazada por Anthropic: ${message.substring(0, 300)}` });
        }
        throw err;
      }

      // Acumular tokens de ESTA iteración
      const usage = response.usage;
      const inputBase = typeof usage.input_tokens === 'number' ? usage.input_tokens : 0;
      const cacheCreation = typeof usage.cache_creation_input_tokens === 'number' ? usage.cache_creation_input_tokens : 0;
      const cacheRead = typeof usage.cache_read_input_tokens === 'number' ? usage.cache_read_input_tokens : 0;
      totalTokensInput += inputBase + cacheCreation + cacheRead;
      totalTokensOutput += usage.output_tokens || 0;

      respuestaFinal = response;

      if (response.stop_reason !== 'tool_use') {
        break;
      }

      // Ejecutar todas las tools llamadas en esta respuesta
      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
      );
      if (toolUseBlocks.length === 0) {
        // stop_reason=tool_use sin bloques → defensa: salimos
        break;
      }

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of toolUseBlocks) {
        const resultado = await ejecutarTool(block.name, block.input, { rol: rolTool, uid });
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(resultado.ok ? resultado.result : { error: resultado.error }),
          is_error: !resultado.ok,
        });
      }

      // Agregar assistant turn (con tool_use blocks) y user turn (con tool_results)
      messagesLoop.push({ role: 'assistant', content: response.content });
      messagesLoop.push({ role: 'user', content: toolResults });
    }

    if (!respuestaFinal) {
      return res.status(500).json({ error: 'No se obtuvo respuesta del modelo' });
    }

    if (respuestaFinal.stop_reason === 'tool_use') {
      // Se terminaron las iteraciones sin que Claude cierre con end_turn
      return res.status(500).json({
        error: `El asistente necesitó más de ${MAX_TOOL_USE_ITERACIONES} pasos para responder. Reformulá la pregunta más específica.`,
      });
    }

    // 10. Extraer texto final
    const textChunks: string[] = [];
    for (const block of respuestaFinal.content) {
      if (block.type === 'text') {
        textChunks.push(block.text);
      }
    }
    const respuesta = textChunks.join('');

    // Pricing Sonnet 4: $3/M input, $15/M output (referencia, redondeado a 6 decimales)
    const costoEstimadoUSDraw = (totalTokensInput / 1_000_000) * 3 + (totalTokensOutput / 1_000_000) * 15;
    const costoEstimadoUSD = Math.round(costoEstimadoUSDraw * 1_000_000) / 1_000_000;

    // 11. Persistir conversación en Firestore (solo si hubo respuesta exitosa).
    // Guardamos únicamente los mensajes visibles al usuario (role user/assistant
    // con content string). NO guardamos system prompts, tool_use ni tool_result
    // (privacy + ruido). Timestamps usan Timestamp.now() porque serverTimestamp
    // no funciona dentro de arrayUnion y aquí escribimos el array completo.
    const ahoraTs = Timestamp.now();
    const mensajesPersistibles = [
      ...(mensajes as Mensaje[]).map((m) => ({
        role: m.role,
        content: m.content,
        timestamp: ahoraTs,
      })),
      {
        role: 'assistant' as const,
        content: respuesta,
        timestamp: ahoraTs,
      },
    ];

    let conversacionIdOut: string | null = conversacionIdInput;
    try {
      if (docRefExistente) {
        // Update: sobrescribimos mensajes con el array completo + acumulamos
        // tokens/costo con FieldValue.increment.
        await docRefExistente.update({
          mensajes: mensajesPersistibles,
          ultimoMensajeAt: ahoraTs,
          tokensInputTotal: FieldValue.increment(totalTokensInput),
          tokensOutputTotal: FieldValue.increment(totalTokensOutput),
          costoTotalUSD: FieldValue.increment(costoEstimadoUSD),
          cantidadMensajes: mensajesPersistibles.length,
        });
      } else {
        // Nueva conversación: stripear undefined en el payload (convención
        // del proyecto). Todos los campos requeridos están presentes; los
        // opcionales (usuarioEmail, usuarioNombre) solo se incluyen si hay
        // valor concreto.
        const payload: Record<string, unknown> = {
          usuarioId: uid,
          usuarioRol: rol,
          iniciadaAt: ahoraTs,
          ultimoMensajeAt: ahoraTs,
          mensajes: mensajesPersistibles,
          tokensInputTotal: totalTokensInput,
          tokensOutputTotal: totalTokensOutput,
          costoTotalUSD: costoEstimadoUSD,
          cantidadMensajes: mensajesPersistibles.length,
        };
        if (perfil.nombre) payload.usuarioNombre = perfil.nombre;
        if (userEmail) payload.usuarioEmail = userEmail;
        const nuevoDoc = await db.collection('conversaciones_ia').add(payload);
        conversacionIdOut = nuevoDoc.id;
      }
    } catch (err: unknown) {
      // Persistencia es best-effort: si falla, logueamos pero no rompemos la
      // respuesta al usuario. El audit log puede quedar incompleto, pero el
      // asistente sigue funcionando.
      console.error('ai/chat persistencia falló:', err);
    }

    return res.status(200).json({
      respuesta,
      tokensInput: totalTokensInput,
      tokensOutput: totalTokensOutput,
      costoEstimadoUSD,
      iteraciones,
      conversacionId: conversacionIdOut,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    console.error('ai/chat error:', err);
    return res.status(500).json({ error: `Error ${message.substring(0, 300)}` });
  }
}
