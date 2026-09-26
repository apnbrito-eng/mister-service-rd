import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9198';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8289';
const app = initializeApp({projectId:'demo-mister-ensayo'});
const auth = getAuth(app), db = getFirestore(app);
const roles = ['administrador','secretaria','operaria','coordinadora','tecnico'] as const;
for (const rol of roles) {
  const uid = `ensayo_${rol}`, email = `${rol}@ensayo.invalid`;
  try { await auth.getUser(uid); }
  catch (e: any) { if(e.code !== 'auth/user-not-found') throw e; await auth.createUser({uid,email,password:'EnsayoLocal-2026!',emailVerified:true}); }
  const perfil = {nombre:`${rol} de prueba`,email,rol,activo:true,telefono:'',iaHabilitada:false,createdAt:Timestamp.now()};
  await db.doc(`usuarios/${uid}`).set(perfil);
  await db.doc(`personal/${uid}`).set({...perfil,uid,especialidad:'Lavadoras',tipoPago:'comision',comisionPorcentaje:20,...(rol === 'tecnico' ? {operariaId:'ensayo_operaria',operariaNombre:'operaria de prueba'} : {})});
}
const clientes = await db.collection('clientes').where('nombre','==','Cliente ficticio recorrido CRM').limit(1).get();
if (!clientes.empty) await db.doc('whatsapp_conversaciones/12025550100').set({wa_id:'12025550100', clienteId:clientes.docs[0].id, ultimoPhoneNumberId:'ensayo-sin-envios', noLeidos:0, asignadaA:'ensayo_operaria', bot:{habilitado:false}, ultimaActividad:Timestamp.now(), updatedAt:Timestamp.now(), ventana24h:{abierta:false,cierraEn:Timestamp.now()}, etiquetas:['ENSAYO'], ultimoMensajeEntrante:{preview:'Conversación ficticia para validar el CRM. Sin WhatsApp real.',timestamp:Timestamp.now()} });
console.log('Cinco cuentas ficticias disponibles exclusivamente en el emulador local.');
await db.terminate();
