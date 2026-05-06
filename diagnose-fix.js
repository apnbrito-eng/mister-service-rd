const admin = require('firebase-admin');
const fs = require('fs');

const serviceAccountPath = './service-account.json';
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf-8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'mister-service-app-cloude'
});

const db = admin.firestore();
const auth = admin.auth();

async function main() {
  console.log('=== DIAGNÓSTICO: Bug de Creación de Campañas ===\n');

  // 1. Buscar doc en personal/ por email
  console.log('1. Buscando doc en personal/ con email: apnbrito@gmail.com');
  const personalSnap = await db.collection('personal')
    .where('email', '==', 'apnbrito@gmail.com')
    .limit(1)
    .get();

  let personalDoc = null;
  let personalId = null;
  let Jorge_uid = null;
  let jorgeNombre = null;

  if (!personalSnap.empty) {
    personalId = personalSnap.docs[0].id;
    personalDoc = personalSnap.docs[0].data();
    Jorge_uid = personalDoc.uid;
    jorgeNombre = personalDoc.nombre;
    console.log(`   ✓ Encontrado: personal/${personalId}`);
    console.log(`   - nombre: ${personalDoc.nombre}`);
    console.log(`   - email: ${personalDoc.email}`);
    console.log(`   - rol: ${personalDoc.rol}`);
    console.log(`   - uid: ${Jorge_uid}`);
  } else {
    console.log('   ✗ No encontrado por email. Listando personal/');
    const all = await db.collection('personal').get();
    if (all.empty) {
      console.log('   ✗ personal/ está vacío');
      process.exit(1);
    }
    all.docs.forEach(d => {
      console.log(`     - ${d.id}: ${d.data().nombre || 'sin nombre'} (${d.data().email})`);
    });
    return;
  }

  console.log();

  // 2. Si no tenemos uid del doc, obtenerlo de Firebase Auth
  if (!Jorge_uid) {
    console.log('2. Buscando Firebase Auth UID para apnbrito@gmail.com...');
    try {
      const userRecord = await auth.getUserByEmail('apnbrito@gmail.com');
      Jorge_uid = userRecord.uid;
      console.log(`   ✓ Firebase Auth UID: ${Jorge_uid}`);
    } catch (e) {
      console.log(`   ✗ Error: ${e.message}`);
      process.exit(1);
    }
  } else {
    console.log(`2. Firebase Auth UID obtenido del doc personal/: ${Jorge_uid}`);
  }

  console.log();

  // 3. Verificar si existe usuarios/{Jorge_uid}
  console.log(`3. Verificando si existe usuarios/${Jorge_uid}...`);
  const usuarioSnap = await db.collection('usuarios').doc(Jorge_uid).get();

  if (usuarioSnap.exists) {
    const usuarioDoc = usuarioSnap.data();
    console.log(`   ✓ Doc EXISTE`);
    console.log(`   - nombre: ${usuarioDoc.nombre}`);
    console.log(`   - email: ${usuarioDoc.email}`);
    console.log(`   - rol: ${usuarioDoc.rol}`);
    console.log(`   - activo: ${usuarioDoc.activo}`);
    console.log('\n✅ No hay problema — el doc en usuarios/{uid} ya existe.');
  } else {
    console.log(`   ✗ Doc NO EXISTE`);
    console.log('\n🔧 Creando doc en usuarios/${Jorge_uid}...');

    const nuevoDoc = {
      nombre: jorgeNombre || 'Jorge Brito',
      email: 'apnbrito@gmail.com',
      rol: 'administrador',
      activo: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      migradoDesdePersonal: true,
      migradoEn: admin.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection('usuarios').doc(Jorge_uid).set(nuevoDoc);
    console.log(`   ✓ Doc creado: usuarios/${Jorge_uid}`);

    // Verificar que se creó
    const verifySnap = await db.collection('usuarios').doc(Jorge_uid).get();
    if (verifySnap.exists) {
      const createdDoc = verifySnap.data();
      console.log(`\n✅ VERIFICACIÓN POST-CREATE:`);
      console.log(`   - nombre: ${createdDoc.nombre}`);
      console.log(`   - email: ${createdDoc.email}`);
      console.log(`   - rol: ${createdDoc.rol}`);
      console.log(`   - activo: ${createdDoc.activo}`);
      console.log('\n✅ FIX APLICADO — Jorge debería poder logout/login y crear campaña ahora');
    } else {
      console.log('   ✗ ERROR: Doc no se creó correctamente');
    }
  }

  process.exit(0);
}

main().catch(err => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
