import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { getAdminAuth, getAdminFirestore } from '../_lib/firebaseAdmin.js';

/**
 * POST /api/ai/chat
 * Body: { mensajes: Array<{ role: 'user' | 'assistant', content: string }> }
 * Headers: Authorization: Bearer <Firebase ID token>
 *
 * Valida que el usuario tenga iaHabilitada === true y que su rol NO sea
 * tecnico/ayudante (fase beta). Llama a Claude Sonnet con un system prompt
 * role-aware. No persiste nada en Firestore (el logging de uso llega en Sprint 5).
 * Sin tools ni streaming (Sprints 3/4).
 */

type Rol = 'administrador' | 'coordinadora' | 'operaria' | 'secretaria' | 'tecnico' | 'ayudante';

interface Mensaje {
  role: 'user' | 'assistant';
  content: string;
}

const SYSTEM_BASE = `Eres el asistente IA interno de Mister Service RD, un negocio de reparación de electrodomésticos en República Dominicana. Hablas español dominicano, conciso y profesional.

Contexto del negocio:
- Sistema operativo interno, paralelo a la facturación DGII (que se hace en otro software autorizado).
- Documentos llamados Conduces de Garantía (CG-####), NO facturas fiscales.
- ITBIS 18% es referencia interna para calcular ganancia neta y comisión del técnico.
- Quincenas RD: Q1 va del día 30 al 14, paga día 15. Q2 va del día 15 al 29, paga día 30.
- Sueldo base es MENSUAL, se divide entre 2 por quincena en la nómina.

En esta fase inicial NO TIENES acceso a la base de datos en tiempo real. Solo puedes responder preguntas generales sobre cómo funciona el sistema, conceptos del negocio, o ayudar a interpretar conceptos. En las próximas fases tendrás acceso a consultar órdenes, inventario, etc. Si te piden datos específicos, di amablemente que en esta versión todavía no puedes consultarlos pero en la siguiente sí.

Eres educado pero directo. No alargues respuestas innecesariamente.`;

const SYSTEM_POR_ROL: Record<string, string> = {
  administrador: `Eres asistente del ADMINISTRADOR. Tienes acceso completo a todos los temas del negocio: órdenes, clientes, comisiones, nómina, gastos, ganancias, configuración fiscal.`,
  coordinadora: `Eres asistente de la COORDINADORA. Puedes hablar de órdenes, clientes, agenda, inventario, comisiones de técnicos. NO discutes temas de nómina del personal administrativo ni gastos generales del negocio. Si el usuario pregunta esos temas, redirige a hablar con el administrador.`,
  operaria: `Eres asistente de la OPERARIA. Puedes hablar de órdenes, citas, agenda del día, inventario, productos, clientes. NO discutes comisiones, nómina, ganancias, ni temas financieros del negocio. Si te preguntan, redirige al administrador.`,
  secretaria: `Eres asistente de la SECRETARIA. Puedes hablar de citas, agenda, productos, órdenes activas y cómo gestionar nuevos leads. NO discutes información financiera de ningún tipo. Si te preguntan, redirige al administrador.`,
};

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

    // 6. Validar iaHabilitada
    if (perfil.iaHabilitada !== true) {
      return res.status(403).json({ error: 'Tu usuario no tiene el Asistente IA habilitado. Pedí acceso al administrador.' });
    }

    // 7. Validar rol (fase beta: sin tecnico/ayudante)
    const rol = perfil.rol;
    if (!rol || rol === 'tecnico' || rol === 'ayudante') {
      return res.status(403).json({ error: 'El Asistente IA está en fase beta. Tu rol todavía no tiene acceso.' });
    }

    // 8. Construir system prompt
    const bloqueRol = SYSTEM_POR_ROL[rol] || '';
    const systemPrompt = `${SYSTEM_BASE}\n\n${bloqueRol}`;

    // 9. Llamar a Claude
    const anthropic = new Anthropic({ apiKey });
    let response;
    try {
      response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: [
          {
            type: 'text',
            text: systemPrompt,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: (mensajes as Mensaje[]).map((m) => ({ role: m.role, content: m.content })),
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

    // 10. Extraer texto y uso
    const textChunks: string[] = [];
    for (const block of response.content) {
      if (block.type === 'text') {
        textChunks.push(block.text);
      }
    }
    const respuesta = textChunks.join('');

    const usage = response.usage;
    const inputBase = typeof usage.input_tokens === 'number' ? usage.input_tokens : 0;
    const cacheCreation = typeof usage.cache_creation_input_tokens === 'number' ? usage.cache_creation_input_tokens : 0;
    const cacheRead = typeof usage.cache_read_input_tokens === 'number' ? usage.cache_read_input_tokens : 0;
    const tokensInput = inputBase + cacheCreation + cacheRead;
    const tokensOutput = usage.output_tokens || 0;

    // Pricing Sonnet 4: $3/M input, $15/M output (referencia, redondeado a 6 decimales)
    const costoEstimadoUSDraw = (tokensInput / 1_000_000) * 3 + (tokensOutput / 1_000_000) * 15;
    const costoEstimadoUSD = Math.round(costoEstimadoUSDraw * 1_000_000) / 1_000_000;

    return res.status(200).json({
      respuesta,
      tokensInput,
      tokensOutput,
      costoEstimadoUSD,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    console.error('ai/chat error:', err);
    return res.status(500).json({ error: `Error ${message.substring(0, 300)}` });
  }
}
