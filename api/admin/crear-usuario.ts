import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAdminAuth, getAdminFirestore } from '../_lib/firebaseAdmin.js';

/**
 * POST /api/admin/crear-usuario
 * Headers: Authorization: Bearer <idToken>
 * Body: {
 *   email: string,           // requerido si el rol tiene acceso
 *   password: string,        // requerido, mínimo 6 caracteres (Firebase mínimo)
 *   nombre: string,
 *   telefono?: string,
 *   rol: Rol,                // debe estar en ROLES_CON_ACCESO
 *   sueldoBase?: number,
 *   especialidad?: string,
 *   zona?: string,
 *   horario?: string,
 *   color?: string,
 *   iaHabilitada?: boolean,
 *   nivel?: 'junior' | 'senior',
 *   comisionPorcentaje?: number,
 *   operariaId?: string,
 *   operariaNombre?: string,
 *   personalId?: string      // si presente: update del personal existente (transición ayudante→acceso)
 *                            // si ausente: crea un nuevo doc en `personal`
 * }
 *
 * Crea (o completa, en el caso de transición ayudante→acceso) un usuario con
 * acceso al sistema. Usa Admin SDK, por lo que NO desloguea al administrador
 * actual (a diferencia del flujo client-side con createUserWithEmailAndPassword).
 *
 * Rollback: si fallan los writes a Firestore después de crear Auth, se elimina
 * el usuario de Firebase Auth para no dejar cuentas huérfanas.
 */

// Duplicado intencional de src/types/index.ts (no importamos desde src/ en api/).
// Debe mantenerse sincronizado con PERMISOS_DEFAULT_TECNICO en types/index.ts.
const PERMISOS_DEFAULT_TECNICO = {
  vistaAgenda: 'dia' as const,
  soloPropiasCitas: true,
  verTelefonoCliente: false,
  verEmailCliente: false,
  verDireccionCliente: true,
  verUbicacionGPS: true,
  puedeMarcarCompletado: true,
  puedeAgregarNotas: true,
  puedeVerHistorial: false,
  puedeContactarCliente: false,
  puedeVerCotizaciones: false,
  recibeNotificacionNuevaCita: true,
};

const ROLES_CON_ACCESO = [
  'administrador',
  'coordinadora',
  'operaria',
  'secretaria',
  'tecnico',
  'ayudante',
] as const;

type RolConAcceso = (typeof ROLES_CON_ACCESO)[number];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 1) Auth header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido (Authorization: Bearer <idToken>)' });
  }
  const idToken = authHeader.substring(7).trim();
  if (!idToken) {
    return res.status(401).json({ error: 'Token vacío' });
  }

  let auth: ReturnType<typeof getAdminAuth>;
  let db: ReturnType<typeof getAdminFirestore>;
  try {
    auth = getAdminAuth();
    db = getAdminFirestore();
  } catch (err) {
    const m = err instanceof Error ? err.message : 'Error desconocido';
    return res.status(500).json({ error: `Error inicializando Firebase Admin: ${m}` });
  }

  let decodedToken: Awaited<ReturnType<typeof auth.verifyIdToken>>;
  try {
    decodedToken = await auth.verifyIdToken(idToken);
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === 'auth/id-token-expired' || code === 'auth/argument-error') {
      return res.status(401).json({ error: 'Token de sesión inválido o expirado. Vuelve a iniciar sesión.' });
    }
    return res.status(401).json({ error: 'Token inválido' });
  }

  // 2) Verificar que el solicitante es administrador estricto (mismo patrón que cambiar-correo)
  let solicitanteEsAdmin = false;
  try {
    const solicitanteSnap = await db.collection('usuarios').doc(decodedToken.uid).get();
    if (solicitanteSnap.exists && solicitanteSnap.data()?.rol === 'administrador') {
      solicitanteEsAdmin = true;
    }
  } catch (err) {
    console.error('[crear-usuario] Error leyendo usuarios/{uid}:', err);
  }

  if (!solicitanteEsAdmin) {
    try {
      const byUid = await db.collection('personal').where('uid', '==', decodedToken.uid).limit(1).get();
      if (!byUid.empty && byUid.docs[0].data()?.rol === 'administrador') {
        solicitanteEsAdmin = true;
      }
    } catch {
      /* no-op */
    }
  }
  if (!solicitanteEsAdmin && decodedToken.email) {
    try {
      const byEmail = await db
        .collection('personal')
        .where('email', '==', decodedToken.email.toLowerCase())
        .limit(1)
        .get();
      if (!byEmail.empty && byEmail.docs[0].data()?.rol === 'administrador') {
        solicitanteEsAdmin = true;
      }
    } catch {
      /* no-op */
    }
  }

  if (!solicitanteEsAdmin) {
    return res.status(403).json({ error: 'Solo el administrador puede crear usuarios' });
  }

  // 3) Validar body
  const body = (req.body ?? {}) as Record<string, unknown>;

  const nombreRaw = typeof body.nombre === 'string' ? body.nombre.trim() : '';
  const emailRaw = typeof body.email === 'string' ? body.email : '';
  const passwordRaw = typeof body.password === 'string' ? body.password : '';
  const rolRaw = typeof body.rol === 'string' ? body.rol : '';

  if (!nombreRaw) {
    return res.status(400).json({ error: 'Nombre requerido' });
  }
  if (!ROLES_CON_ACCESO.includes(rolRaw as RolConAcceso)) {
    return res.status(400).json({ error: `Rol debe ser uno de: ${ROLES_CON_ACCESO.join(', ')}` });
  }
  const rol = rolRaw as RolConAcceso;

  const emailNorm = emailRaw.toLowerCase().trim();
  if (!emailNorm || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) {
    return res.status(400).json({ error: 'Email inválido' });
  }
  if (!passwordRaw || passwordRaw.length < 6) {
    return res.status(400).json({ error: 'Password mínimo 6 caracteres' });
  }

  const telefono = typeof body.telefono === 'string' ? body.telefono : undefined;
  const especialidad = typeof body.especialidad === 'string' ? body.especialidad : undefined;
  const zona = typeof body.zona === 'string' ? body.zona : undefined;
  const horario = typeof body.horario === 'string' ? body.horario : undefined;
  const color = typeof body.color === 'string' ? body.color : undefined;
  const iaHabilitada = body.iaHabilitada === true;
  const nivel =
    body.nivel === 'junior' || body.nivel === 'senior' ? (body.nivel as 'junior' | 'senior') : undefined;
  const sueldoBase = typeof body.sueldoBase === 'number' ? body.sueldoBase : undefined;
  const comisionPorcentaje =
    typeof body.comisionPorcentaje === 'number' ? body.comisionPorcentaje : undefined;
  const operariaId = typeof body.operariaId === 'string' && body.operariaId ? body.operariaId : undefined;
  const operariaNombre =
    typeof body.operariaNombre === 'string' && body.operariaNombre ? body.operariaNombre : undefined;
  const personalId = typeof body.personalId === 'string' && body.personalId ? body.personalId : undefined;
  // `disponibilidad`: en el modelo actual es boolean (Personal.disponibilidad)
  const disponibilidad = typeof body.disponibilidad === 'boolean' ? body.disponibilidad : true;
  const activoCampo = typeof body.activo === 'boolean' ? body.activo : true;

  // 4) Crear Auth user
  let createdUid: string | undefined;
  try {
    const userRecord = await auth.createUser({
      email: emailNorm,
      password: passwordRaw,
      displayName: nombreRaw,
      emailVerified: false,
    });
    createdUid = userRecord.uid;
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === 'auth/email-already-exists') {
      return res.status(409).json({
        error: 'Este email ya tiene una cuenta. Usa el flujo de "Vincular cuenta existente".',
      });
    }
    if (code === 'auth/invalid-email') {
      return res.status(400).json({ error: 'Email inválido.' });
    }
    if (code === 'auth/invalid-password' || code === 'auth/weak-password') {
      return res.status(400).json({ error: 'Password muy débil. Mínimo 6 caracteres.' });
    }
    console.error('[crear-usuario] Error creando Auth:', err);
    const message = err instanceof Error ? err.message : 'Error desconocido';
    return res.status(500).json({ error: `Error creando cuenta de acceso: ${message.substring(0, 200)}` });
  }

  if (!createdUid) {
    return res.status(500).json({ error: 'No se obtuvo uid de la cuenta creada' });
  }

  // 5) Firestore writes con rollback si fallan
  try {
    const now = new Date();

    // usuarios/{uid}
    const usuarioData: Record<string, unknown> = {
      nombre: nombreRaw,
      email: emailNorm,
      rol,
      activo: activoCampo,
      createdAt: now,
      iaHabilitada,
    };
    if (telefono !== undefined) usuarioData.telefono = telefono;
    if (color !== undefined) usuarioData.color = color;
    if (rol === 'tecnico') usuarioData.permisos = { ...PERMISOS_DEFAULT_TECNICO };
    await db.collection('usuarios').doc(createdUid).set(usuarioData);

    // personal: create o update
    const personalData: Record<string, unknown> = {
      nombre: nombreRaw,
      email: emailNorm,
      rol,
      uid: createdUid,
      activo: activoCampo,
      disponibilidad,
      iaHabilitada,
    };
    if (telefono !== undefined) personalData.telefono = telefono;
    if (especialidad !== undefined) personalData.especialidad = especialidad;
    if (zona !== undefined) personalData.zona = zona;
    if (horario !== undefined) personalData.horario = horario;
    if (color !== undefined) personalData.color = color;
    if (sueldoBase !== undefined) personalData.sueldoBase = sueldoBase;
    if (nivel !== undefined) personalData.nivel = nivel;
    if (comisionPorcentaje !== undefined) personalData.comisionPorcentaje = comisionPorcentaje;
    if (operariaId !== undefined) personalData.operariaId = operariaId;
    if (operariaNombre !== undefined) personalData.operariaNombre = operariaNombre;
    if (rol === 'tecnico') personalData.permisos = { ...PERMISOS_DEFAULT_TECNICO };

    let personalRefId: string;
    if (personalId) {
      // Transición ayudante → rol con acceso: update sobre el doc existente
      personalData.updatedAt = now;
      await db.collection('personal').doc(personalId).set(personalData, { merge: true });
      personalRefId = personalId;
    } else {
      // Crear nuevo doc
      personalData.createdAt = now;
      const newDoc = await db.collection('personal').add(personalData);
      personalRefId = newDoc.id;
    }

    // Audit log (best-effort; no bloquea la respuesta)
    try {
      await db.collection('auditoria_admin').add({
        accion: 'crear_personal_con_acceso',
        solicitanteUid: decodedToken.uid,
        solicitanteEmail: decodedToken.email ?? null,
        objetivoUid: createdUid,
        objetivoEmail: emailNorm,
        objetivoTipo: 'usuario',
        rol,
        personalId: personalRefId,
        modo: personalId ? 'transicion_ayudante' : 'crear_nuevo',
        timestamp: now,
      });
    } catch (auditErr) {
      console.warn('[crear-usuario] Audit log falló (no bloquea):', auditErr);
    }

    return res.status(200).json({ uid: createdUid, personalId: personalRefId });
  } catch (err: unknown) {
    // ROLLBACK: borrar Auth user si Firestore falla
    console.error('[crear-usuario] Error en Firestore, rollback Auth:', err);
    try {
      await auth.deleteUser(createdUid);
    } catch (rollbackErr) {
      console.error('[crear-usuario] Rollback Auth también falló:', rollbackErr);
    }
    const message = err instanceof Error ? err.message : 'Error desconocido';
    return res.status(500).json({
      error: `Error guardando el usuario. La cuenta se revirtió. Detalle: ${message.substring(0, 200)}`,
    });
  }
}
