/**
 * Diagnóstico: notificaciones de un usuario específico (Yohana o cualquier
 * operaria/secretaria/técnico). Identifica si los docs legacy están en
 * shapes problemáticos que la rule de Firestore o las queries del service
 * no pueden ver/actualizar.
 *
 * Disparado por SPRINT-115 (QA fallido SPRINT-100 el 2026-05-08): Yohana
 * reportó "no hay nada en la campanita" después del fix b93625d.
 *
 * Lee:
 *  - personal/* (busca por email para mapear personal.id ↔ personal.uid)
 *  - usuarios/{uid} (verifica que exista y devuelve rol)
 *  - notificaciones/* filtradas por userId/destinatarioId == auth.uid o
 *    personalDocId (matriz completa para clasificar Caso A/B/C).
 *
 * Reporta:
 *  - email + auth.uid + personalDocId del usuario.
 *  - Cantidad de docs en cada cuadrante de la matriz {userId, destinatarioId}
 *    × {auth.uid, personalDocId, otro/missing}.
 *  - Para cada doc problemático: id, campos presentes, fecha, leida sí/no,
 *    clasificación (Caso A / B / C).
 *
 * Solo lectura. NO modifica nada. La re-migración (write) está en
 * BLOQUEOS pendiente de OK Jorge.
 *
 * Uso:
 *   npx tsx scripts/diagnostico-notificaciones-yohana.ts <email>
 *
 * Ejemplo:
 *   npx tsx scripts/diagnostico-notificaciones-yohana.ts yohana@misterservice.do
 *
 * Requiere `service-account.json` en la raíz del repo (mismo patrón que
 * `scripts/diagnostico-tecnicoid-auth-uid.ts`).
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

const SERVICE_ACCOUNT_PATH = path.resolve('service-account.json');

if (!getApps().length) {
  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    console.error('[ERROR] No existe service-account.json en la raíz del repo.');
    process.exit(1);
  }
  const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf-8'));
  initializeApp({ credential: cert(serviceAccount) });
}

const db = getFirestore();

type ShapeDoc = {
  id: string;
  userId: string | null;
  destinatarioId: string | null;
  tipo?: string;
  titulo?: string;
  leida?: boolean;
  createdAt?: Date | null;
};

type Caso = 'OK' | 'A' | 'B' | 'C' | 'OTRO';

function clasificar(d: ShapeDoc, authUid: string, personalDocId: string | null): Caso {
  const u = d.userId;
  const dst = d.destinatarioId;

  // OK: userId == auth.uid (rule pasa, queries dual lo ven, marcado como leída funciona).
  if (u === authUid) return 'OK';

  // Caso C: doc post-migración correcto pero sin destinatarioId — aún OK funcional.
  // (cubierto por OK arriba, no entra acá).

  // Caso B: destinatarioId == auth.uid pero userId != auth.uid (típicamente
  // userId == null o == personalDocId). El query legacy del service la trae,
  // pero la rule de update rechaza con permission-denied.
  if (dst === authUid) return 'B';

  // Caso A: ni userId ni destinatarioId == auth.uid. Si destinatarioId o userId
  // matchea personalDocId, el doc existe pero ningún query del service llega a él.
  if (personalDocId && (u === personalDocId || dst === personalDocId)) return 'A';

  // OTRO: doc que mapea a otro usuario (no tendría que aparecer en la query del usuario).
  return 'OTRO';
}

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('[ERROR] Uso: npx tsx scripts/diagnostico-notificaciones-yohana.ts <email>');
    process.exit(1);
  }

  console.log(`[INFO] Buscando usuario por email: ${email}`);

  // 1. Buscar en personal por email.
  const personalSnap = await db.collection('personal').where('email', '==', email).get();
  if (personalSnap.empty) {
    console.error(`[ERROR] No se encontró ningún personal con email == "${email}".`);
    console.error('        Verificá el email exacto. Termina sin tocar Firestore.');
    process.exit(1);
  }
  if (personalSnap.size > 1) {
    console.warn(`[WARN] ${personalSnap.size} docs en personal con ese email. Usando el primero.`);
  }
  const personalDoc = personalSnap.docs[0];
  const personalData = personalDoc.data();
  const personalDocId = personalDoc.id;
  const authUidFromPersonal: string | undefined = personalData.uid;

  console.log(`\n─── Usuario encontrado ───`);
  console.log(`  Nombre:          ${personalData.nombre || '?'}`);
  console.log(`  Email:           ${personalData.email}`);
  console.log(`  Rol:             ${personalData.rol || '?'}`);
  console.log(`  personal.id:     ${personalDocId}`);
  console.log(`  personal.uid:    ${authUidFromPersonal || '(no seteado — sospechoso)'}`);

  if (!authUidFromPersonal) {
    console.error('\n[ERROR] El doc en personal/ no tiene campo `uid`. Sin auth.uid no se puede');
    console.error('        diagnosticar. Verificá que el alta de empleado se haya hecho con');
    console.error('        ambos docs (personal + usuarios). Ver gotcha CLAUDE.md "Alta de empleado".');
    process.exit(1);
  }

  // 2. Verificar que exista usuarios/{uid}.
  const usuarioDoc = await db.collection('usuarios').doc(authUidFromPersonal).get();
  if (!usuarioDoc.exists) {
    console.warn(`\n[WARN] No existe usuarios/{${authUidFromPersonal}}.`);
    console.warn('       Si el usuario carga via cascada personal/, el bug puede ser otro');
    console.warn('       (ver gotcha CLAUDE.md "userProfile.id NO siempre es auth.uid").');
  } else {
    const u = usuarioDoc.data();
    console.log(`  usuarios/{uid}:  rol=${u?.rol}, nombre=${u?.nombre}`);
  }

  const authUid = authUidFromPersonal;

  // 3. Cuatro queries paralelas para cubrir la matriz.
  console.log(`\n[INFO] Leyendo notificaciones (4 queries: userId/destinatarioId × authUid/personalDocId)...`);
  const [snapUserAuth, snapDstAuth, snapUserPersonal, snapDstPersonal] = await Promise.all([
    db.collection('notificaciones').where('userId', '==', authUid).get(),
    db.collection('notificaciones').where('destinatarioId', '==', authUid).get(),
    db.collection('notificaciones').where('userId', '==', personalDocId).get(),
    db.collection('notificaciones').where('destinatarioId', '==', personalDocId).get(),
  ]);

  // Dedup por id.
  const dedup = new Map<string, ShapeDoc>();
  const ingest = (snap: FirebaseFirestore.QuerySnapshot) => {
    for (const d of snap.docs) {
      if (dedup.has(d.id)) continue;
      const data = d.data();
      dedup.set(d.id, {
        id: d.id,
        userId: typeof data.userId === 'string' ? data.userId : null,
        destinatarioId: typeof data.destinatarioId === 'string' ? data.destinatarioId : null,
        tipo: data.tipo,
        titulo: data.titulo,
        leida: data.leida,
        createdAt: data.createdAt?.toDate?.() ?? null,
      });
    }
  };
  ingest(snapUserAuth);
  ingest(snapDstAuth);
  ingest(snapUserPersonal);
  ingest(snapDstPersonal);

  console.log(`\n─── Conteo bruto por query ───`);
  console.log(`  userId == auth.uid:           ${snapUserAuth.size}`);
  console.log(`  destinatarioId == auth.uid:   ${snapDstAuth.size}`);
  console.log(`  userId == personalDocId:      ${snapUserPersonal.size}`);
  console.log(`  destinatarioId == personalDocId: ${snapDstPersonal.size}`);
  console.log(`  Total dedupeado:              ${dedup.size}`);

  // 4. Clasificar cada doc.
  const porCaso: Record<Caso, ShapeDoc[]> = { OK: [], A: [], B: [], C: [], OTRO: [] };
  for (const d of dedup.values()) {
    const c = clasificar(d, authUid, personalDocId);
    porCaso[c].push(d);
  }

  console.log(`\n─── Clasificación ───`);
  console.log(`  OK    (userId == auth.uid):                     ${porCaso.OK.length}`);
  console.log(`  Caso A (ni userId ni dst == auth.uid;            ${porCaso.A.length}`);
  console.log(`         pero alguno == personalDocId):`);
  console.log(`  Caso B (dst == auth.uid pero userId no):         ${porCaso.B.length}`);
  console.log(`  OTRO  (no mapea a este usuario):                 ${porCaso.OTRO.length}`);

  if (porCaso.A.length > 0) {
    console.log(`\n─── Caso A (Yohana NO los ve, query del service no los matchea) ───`);
    for (const d of porCaso.A.slice(0, 20)) {
      const fecha = d.createdAt ? d.createdAt.toISOString().substring(0, 19) : '(sin fecha)';
      console.log(`  - ${d.id}`);
      console.log(`      userId=${d.userId} destinatarioId=${d.destinatarioId}`);
      console.log(`      tipo=${d.tipo} leida=${d.leida} fecha=${fecha}`);
      if (d.titulo) console.log(`      titulo="${d.titulo.substring(0, 80)}"`);
    }
    if (porCaso.A.length > 20) console.log(`  ... y ${porCaso.A.length - 20} más`);
  }

  if (porCaso.B.length > 0) {
    console.log(`\n─── Caso B (Yohana los ve pero NO puede marcar leído — rule rechaza) ───`);
    for (const d of porCaso.B.slice(0, 20)) {
      const fecha = d.createdAt ? d.createdAt.toISOString().substring(0, 19) : '(sin fecha)';
      console.log(`  - ${d.id}`);
      console.log(`      userId=${d.userId} destinatarioId=${d.destinatarioId}`);
      console.log(`      tipo=${d.tipo} leida=${d.leida} fecha=${fecha}`);
      if (d.titulo) console.log(`      titulo="${d.titulo.substring(0, 80)}"`);
    }
    if (porCaso.B.length > 20) console.log(`  ... y ${porCaso.B.length - 20} más`);
  }

  if (porCaso.OTRO.length > 0) {
    console.log(`\n[WARN] ${porCaso.OTRO.length} docs no mapean ni a auth.uid ni a personalDocId.`);
    console.log('       Probablemente el query trajo docs cuyo userId/destinatarioId coincide');
    console.log('       accidentalmente con un valor del usuario por shape mixto. Inspeccionar.');
  }

  console.log(`\n─── Diagnóstico final ───`);
  if (porCaso.A.length === 0 && porCaso.B.length === 0 && porCaso.OK.length > 0) {
    console.log('  [OK] Todos los docs visibles del usuario están en shape correcto.');
    console.log('       Si Yohana sigue sin ver notificaciones, el problema NO es de datos.');
    console.log('       Hipótesis siguientes: caché del browser, App Check, otro vector.');
  } else if (porCaso.A.length === 0 && porCaso.B.length === 0 && porCaso.OK.length === 0) {
    console.log('  [INFO] No hay notificaciones para este usuario en ninguna shape.');
    console.log('         Yohana literalmente no tiene notifs (no es bug — está vacío).');
    console.log('         Verificá que efectivamente DEBERIA tener notifs (operaria recibe');
    console.log('         por reportes de técnico, etc.).');
  } else if (porCaso.A.length > 0) {
    console.log(`  [BUG-A confirmado] ${porCaso.A.length} docs con userId/destinatarioId == personalDocId.`);
    console.log('         Esto explica "no hay nada en la campanita": el query');
    console.log('         del service filtra por auth.uid y no llega a estos docs.');
    console.log('         Fix: re-migración write que set userId = auth.uid en estos docs.');
    console.log('         Re-migración requiere OK Jorge en BLOQUEOS.md (sub-regla CLAUDE.md).');
  } else if (porCaso.B.length > 0) {
    console.log(`  [BUG-B confirmado] ${porCaso.B.length} docs con destinatarioId == auth.uid pero userId distinto.`);
    console.log('         Yohana SÍ los ve (query legacy los trae) pero al marcar leído,');
    console.log('         la rule rechaza con permission-denied silencioso.');
    console.log('         Fix: re-migración write que set userId = auth.uid en estos docs.');
    console.log('         Re-migración requiere OK Jorge en BLOQUEOS.md (sub-regla CLAUDE.md).');
  }
}

main().catch((err) => {
  console.error('[ERROR]', err);
  process.exit(1);
});
