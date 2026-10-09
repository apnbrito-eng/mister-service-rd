import { beforeAll, afterAll, beforeEach, it } from 'vitest';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { iniciarEntorno, entorno, resetearConPerfiles, sembrar, como, anonimo, UID } from './helpers';
beforeAll(async () => { await iniciarEntorno(); });
afterAll(async () => { await entorno().cleanup(); });
beforeEach(async () => { await resetearConPerfiles(); });

it('oficina conserva edición normal pero cartera e historial son solo servidor', async () => {
  await sembrar('clientes/c', { nombre: 'Ejemplo', carteraEquipo: 'A' });
  await sembrar('clientes/c/cartera_historial/e', { motivo: 'Ejemplo' });
  for (const uid of [UID.admin, UID.secretaria, UID.operaria]) {
    await assertSucceeds(updateDoc(doc(como(uid), 'clientes/c'), { nombre: 'Actualizado' }));
    await assertFails(updateDoc(doc(como(uid), 'clientes/c'), { carteraEquipo: 'B' }));
    await assertFails(setDoc(doc(como(uid), 'clientes/nuevo'), { nombre: 'Nuevo', carteraEquipo: 'A' }));
    await assertSucceeds(getDoc(doc(como(uid), 'clientes/c/cartera_historial/e')));
    await assertFails(setDoc(doc(como(uid), 'clientes/c/cartera_historial/falso'), { motivo: 'Falso' }));
    await assertFails(setDoc(doc(como(uid), 'config/reparto_carteras'), { siguiente: 'A' }));
  }
  await assertFails(getDoc(doc(anonimo(), 'clientes/c/cartera_historial/e')));
});

it('no se falsifican horarios, confirmaciones ni solicitudes desde SDK, tampoco al crear', async () => {
  await sembrar('ordenes_servicio/o', { fase: 'agendado' });
  const campos = { franjaLlegada: { inicio: '09:00', fin: '11:00' }, horarioAvisoVersion: 'falsa', respuestaHorario: { estado: 'confirmado' }, solicitudHorario: { estado: 'pendiente' } };
  for (const [campo, valor] of Object.entries(campos)) {
    for (const uid of [UID.admin, UID.operaria, UID.secretaria]) {
      await assertFails(updateDoc(doc(como(uid), 'ordenes_servicio/o'), { [campo]: valor }));
      await assertFails(setDoc(doc(como(uid), `ordenes_servicio/nueva-${campo}`), { fase: 'agendado', [campo]: valor }));
    }
  }
});

it('registro de envío/respuesta admite lectura de oficina y nunca escritura de cliente', async () => {
  for (const ruta of ['citas_horarios_envios/e', 'citas_horarios_respuestas/r']) {
    await sembrar(ruta, { estado: 'enviado' });
    await assertSucceeds(getDoc(doc(como(UID.secretaria), ruta)));
    await assertFails(setDoc(doc(como(UID.admin), ruta), { estado: 'enviado' }));
    await assertFails(getDoc(doc(como(UID.tecnico), ruta)));
    await assertFails(getDoc(doc(anonimo(), ruta)));
  }
});
