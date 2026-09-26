/** Prueba de integración local: Auth real del emulador y API HTTP, sin suplantar verifyIdToken. */
import assert from 'node:assert/strict';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8289';
const db = getFirestore(initializeApp({projectId:'demo-mister-ensayo'}));
const base='http://127.0.0.1:5190/api/crm/orden';
const ordenId=`ensayo_api_${Date.now()}`;
const tokens:Record<string,string>={};
for(const rol of ['administrador','secretaria','operaria','coordinadora','tecnico']) {
 const r=await fetch('http://127.0.0.1:9198/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-local-only',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:`${rol}@ensayo.invalid`,password:'EnsayoLocal-2026!',returnSecureToken:true})});
 const v=await r.json(); assert.equal(r.status,200,`Inicio de sesión ${rol}`); tokens[rol]=v.idToken;
}
await db.doc(`ordenes_servicio/${ordenId}`).set({numero:'ENSAYO-API',clienteId:ordenId,clienteNombre:'Cliente ficticio API',clienteTelefono:'2025550101',tecnicoId:'ensayo_tecnico',tecnicoNombre:'tecnico de prueba',operariaId:'ensayo_operaria',responsableId:'ensayo_secretaria',responsableNombre:'secretaria de prueba',fase:'en_diagnostico',inicioChequeo:{fechaInicio:Timestamp.now(),sinGPS:true},pagos:[]});
let version=0; const comprobaciones:string[]=[];
async function get(rol='administrador') {const r=await fetch(`${base}?ordenId=${ordenId}`,{headers:{Authorization:`Bearer ${tokens[rol]}`}}); assert.equal(r.status,200);return r.json();}
async function post(rol:string,accion:string,extra:Record<string,unknown>={},expected=200) {
 const body={ordenId,version,accion,operacionId:crypto.randomUUID(),...extra};
 const r=await fetch(base,{method:'POST',headers:{Authorization:`Bearer ${tokens[rol]}`,'Content-Type':'application/json'},body:JSON.stringify(body)}); const result=await r.json();
 assert.equal(r.status,expected,`${accion}: ${JSON.stringify(result)}`); if(r.status===200&&!result.duplicado)version++;
 comprobaciones.push(`${rol}: ${accion} → ${expected}`);return {body,result};
}
try {
 await post('secretaria','nota',{texto:'Nota privada de oficina',visibilidad:'oficina'});
 await post('secretaria','nota',{texto:'Llamar al llegar',visibilidad:'tecnico'});
 await post('secretaria','traspasar',{destinoId:'ensayo_operaria',etapa:'operaria',motivo:'Coordinar visita ficticia'});
 await post('administrador','recibir',{},403);
 await post('operaria','recibir');
 await post('tecnico','propuesta',{diagnostico:'Servicio ficticio de limpieza de drenaje, sin piezas',piezas:[],manoObraSugerida:8000});
 await post('tecnico','aprobar_propuesta',{revision:1,precioFinal:8000,motivo:'Intento no autorizado'},403);
 await post('operaria','aprobar_propuesta',{revision:1,precioFinal:8000,motivo:'Cliente ficticio acepta RD$8000'});
 await post('coordinadora','revision',{conforme:true,motivo:'Intento antes del cierre'},400);
 const anticipo=await post('operaria','pago',{monto:3000,metodo:'transferencia',referencia:'ENSAYO-ANTICIPO'});
 assert.equal((await get()).balance.confirmados,0);
 await post('operaria','confirmar_pago',{pagoId:anticipo.body.operacionId,referencia:'ENSAYO-BANCO-ANTICIPO'},403);
 await post('coordinadora','confirmar_pago',{pagoId:anticipo.body.operacionId,referencia:'ENSAYO-BANCO-ANTICIPO'});
 assert.equal((await get()).balance.saldo,5000);
 const final=await post('operaria','pago',{monto:5000,metodo:'efectivo',receptorId:'ensayo_tecnico'});
 assert.equal((await get()).balance.saldo,5000);
 await post('coordinadora','confirmar_pago',{pagoId:final.body.operacionId});
 const pagada=await get(); assert.equal(pagada.balance.saldo,0);assert.equal(pagada.recibos.length,2);
 await post('coordinadora','entrega_efectivo',{pagoId:final.body.operacionId,monto:3000,motivo:'Primera entrega ficticia'});
 await post('coordinadora','entrega_efectivo',{pagoId:final.body.operacionId,monto:2001,motivo:'Exceso de entrega ficticio'},400);
 await post('coordinadora','entrega_efectivo',{pagoId:final.body.operacionId,monto:2000,motivo:'Segunda entrega ficticia'});
 const finalEstado=await get(); assert.equal(finalEstado.orden.pagos[1].entregadoOficina,5000); assert.equal(finalEstado.balance.confirmados,8000);
 const tecnico=await get('tecnico');assert.equal(tecnico.notas.length,1);assert.equal(tecnico.orden.pagos,undefined);
 console.log(JSON.stringify({resultado:'OK',comprobaciones,assertsAdicionales:8,limite:'No valida cámara, firma, cierre técnico ni emisión de factura. No envía WhatsApp/Meta.'},null,2));
} finally {await db.terminate();}
