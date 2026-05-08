/**
 * Diagnóstico: cuántas órdenes tienen tecnicoId que NO coincide con
 * el auth.uid del técnico (causa permission-denied en cualquier write
 * gateado por la rule `tecnicoId == request.auth.uid`).
 *
 * Lee:
 *  - personal/* (mapa personal.id → personal.uid)
 *  - usuarios/* (mapa usuarios.uid → rol)
 *  - ordenes_servicio/* (filtra por tecnicoId no vacío)
 *
 * Reporta:
 *  - Cuántas órdenes tienen tecnicoId = personal.id (mal — el bug).
 *  - Cuántas tienen tecnicoId = personal.uid (correcto).
 *  - Cuántas tienen tecnicoId que no matchea NADA (huérfano).
 *  - Para cada técnico activo: cuántas órdenes suyas están mal.
 *
 * Solo lectura. No modifica nada.
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

async function main() {
  console.log('[INFO] Leyendo personal...');
  const personalSnap = await db.collection('personal').get();
  const personalById = new Map<string, { id: string; uid?: string; rol?: string; nombre?: string; activo?: boolean; email?: string }>();
  const personalByUid = new Map<string, string>(); // uid → personal.id
  for (const doc of personalSnap.docs) {
    const d = doc.data();
    personalById.set(doc.id, { id: doc.id, uid: d.uid, rol: d.rol, nombre: d.nombre, activo: d.activo, email: d.email });
    if (d.uid) personalByUid.set(d.uid, doc.id);
  }
  console.log(`[INFO] personal: ${personalSnap.size} docs (${personalByUid.size} con uid)`);

  console.log('[INFO] Leyendo usuarios...');
  const usuariosSnap = await db.collection('usuarios').get();
  const usuariosByUid = new Map<string, { rol?: string; nombre?: string; email?: string }>();
  for (const doc of usuariosSnap.docs) {
    const d = doc.data();
    usuariosByUid.set(doc.id, { rol: d.rol, nombre: d.nombre, email: d.email });
  }
  console.log(`[INFO] usuarios: ${usuariosSnap.size} docs`);

  console.log('[INFO] Leyendo ordenes_servicio (puede tardar)...');
  const ordenesSnap = await db.collection('ordenes_servicio').get();
  console.log(`[INFO] ordenes_servicio: ${ordenesSnap.size} docs total`);

  const stats = {
    sinTecnico: 0,
    eliminadas: 0,
    cerradas: 0,
    activasConTecnico: 0,
    tecnicoIdEsAuthUid: 0, // tecnicoId == personal.uid (correcto)
    tecnicoIdEsPersonalId: 0, // tecnicoId == personal.id (BUG)
    tecnicoIdHuerfano: 0, // no matchea ni personal.id ni personal.uid
  };

  // Por técnico: cuántas mal vs bien
  const porTecnico = new Map<string, { nombre: string; uid: string; mal: number; bien: number; huerfanas: number; ejemplos: string[] }>();

  for (const ordenDoc of ordenesSnap.docs) {
    const orden = ordenDoc.data();
    if (orden.eliminada === true) {
      stats.eliminadas++;
      continue;
    }
    if (orden.fase === 'cerrado' || orden.fase === 'cancelado') {
      stats.cerradas++;
      continue;
    }
    const tid: string | undefined = orden.tecnicoId;
    if (!tid) {
      stats.sinTecnico++;
      continue;
    }
    stats.activasConTecnico++;

    // Caso A: tecnicoId coincide con un personal.uid (correcto, auth.uid)
    const personalConEseUid = personalByUid.get(tid);
    if (personalConEseUid) {
      stats.tecnicoIdEsAuthUid++;
      const p = personalById.get(personalConEseUid)!;
      const key = p.uid!;
      if (!porTecnico.has(key)) porTecnico.set(key, { nombre: p.nombre || '?', uid: tid, mal: 0, bien: 0, huerfanas: 0, ejemplos: [] });
      porTecnico.get(key)!.bien++;
      continue;
    }
    // Caso B: tecnicoId coincide con un personal.id (BUG — debería ser personal.uid)
    const personalConEseId = personalById.get(tid);
    if (personalConEseId && personalConEseId.uid) {
      stats.tecnicoIdEsPersonalId++;
      const key = personalConEseId.uid;
      if (!porTecnico.has(key)) porTecnico.set(key, { nombre: personalConEseId.nombre || '?', uid: personalConEseId.uid, mal: 0, bien: 0, huerfanas: 0, ejemplos: [] });
      const t = porTecnico.get(key)!;
      t.mal++;
      if (t.ejemplos.length < 3) t.ejemplos.push(`${orden.numero || ordenDoc.id} (${orden.clienteNombre || '?'})`);
      continue;
    }
    // Caso C: tecnicoId huérfano
    stats.tecnicoIdHuerfano++;
    if (!porTecnico.has(tid)) porTecnico.set(tid, { nombre: 'huérfano: ' + tid.substring(0, 12), uid: tid, mal: 0, bien: 0, huerfanas: 0, ejemplos: [] });
    porTecnico.get(tid)!.huerfanas++;
  }

  console.log('\n─── Resumen general ───');
  console.log(`Eliminadas:                          ${stats.eliminadas}`);
  console.log(`Cerradas/canceladas:                 ${stats.cerradas}`);
  console.log(`Sin técnico asignado:                ${stats.sinTecnico}`);
  console.log(`Activas con técnico:                 ${stats.activasConTecnico}`);
  console.log(`  ✓ tecnicoId == auth.uid:           ${stats.tecnicoIdEsAuthUid} (rule pasa)`);
  console.log(`  ✗ tecnicoId == personal.id (BUG):  ${stats.tecnicoIdEsPersonalId} (rule rechaza)`);
  console.log(`  ✗ tecnicoId huérfano:              ${stats.tecnicoIdHuerfano} (rule rechaza)`);

  console.log('\n─── Por técnico ───');
  const filas = [...porTecnico.values()].sort((a, b) => b.mal + b.huerfanas - (a.mal + a.huerfanas));
  for (const t of filas) {
    if (t.mal === 0 && t.huerfanas === 0 && t.bien === 0) continue;
    console.log(`\n  ${t.nombre} (uid=${t.uid.substring(0, 12)}...)`);
    console.log(`    Bien (rule pasa):   ${t.bien}`);
    console.log(`    Mal (BUG):          ${t.mal}`);
    if (t.huerfanas > 0) console.log(`    Huérfanas:          ${t.huerfanas}`);
    if (t.ejemplos.length > 0) {
      console.log(`    Ejemplos:`);
      for (const ej of t.ejemplos) console.log(`      - ${ej}`);
    }
  }

  console.log('\n─── Diagnóstico final ───');
  if (stats.tecnicoIdEsPersonalId === 0 && stats.tecnicoIdHuerfano === 0) {
    console.log('Todas las órdenes activas con técnico tienen tecnicoId == auth.uid.');
    console.log('La rule debería pasar. Si hay permission-denied, el problema es OTRO');
    console.log('(probablemente App Check o usuarios/{uid} faltante).');
  } else {
    console.log(`Confirmado el bug: ${stats.tecnicoIdEsPersonalId + stats.tecnicoIdHuerfano} órdenes activas`);
    console.log('tienen un tecnicoId que la rule rechaza.');
    console.log('');
    console.log('Fix: script de migración que update tecnicoId de personal.id → personal.uid');
    console.log('en bulk, junto con cambio de código en OrdenCreateModal.tsx para que el');
    console.log('dropdown guarde uid en lugar de id.');
  }
}

main().catch(err => {
  console.error('[ERROR]', err);
  process.exit(1);
});
