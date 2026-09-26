import { beforeAll, afterAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import {
  iniciarEntorno, entorno, resetearConPerfiles, sembrar, como, anonimo, UID,
} from './helpers';

/**
 * Módulos de dinero. La regla que más importa acá es que un técnico solo
 * pueda ver SU comisión: la rule usa `resource.data.tecnicoId == auth.uid`,
 * que es exactamente el patrón que el cazador P-012 vigila del lado del
 * cliente (una query sin `where` contra esta colección da permission-denied
 * para técnicos — el bug del postmortem 2026-05-18).
 */

beforeAll(async () => { await iniciarEntorno(); });
afterAll(async () => { await entorno().cleanup(); });
beforeEach(async () => { await resetearConPerfiles(); });

const COMISION_PROPIA = 'comisiones/com-propia';
const COMISION_AJENA = 'comisiones/com-ajena';

async function sembrarComisiones() {
  await sembrar(COMISION_PROPIA, {
    tecnicoId: UID.tecnico, comisionMonto: 1500, estadoLiquidacion: 'pendiente',
  });
  await sembrar(COMISION_AJENA, {
    tecnicoId: UID.tecnicoOtro, comisionMonto: 9000, estadoLiquidacion: 'pendiente',
  });
}

describe('comisiones', () => {
  beforeEach(sembrarComisiones);

  it('el técnico lee su propia comisión', async () => {
    await assertSucceeds(getDoc(doc(como(UID.tecnico), COMISION_PROPIA)));
  });

  it('el técnico NO puede leer la comisión de otro técnico', async () => {
    await assertFails(getDoc(doc(como(UID.tecnico), COMISION_AJENA)));
  });

  it('el técnico NO puede escribir su comisión (subirse el monto)', async () => {
    await assertFails(
      updateDoc(doc(como(UID.tecnico), COMISION_PROPIA), { comisionMonto: 99999 }),
    );
  });

  it('admin y coordinadora leen y escriben', async () => {
    for (const uid of [UID.admin, UID.coordinadora]) {
      await assertSucceeds(getDoc(doc(como(uid), COMISION_AJENA)));
      await assertSucceeds(
        updateDoc(doc(como(uid), COMISION_PROPIA), { estadoLiquidacion: 'liquidada' }),
      );
    }
  });

  it('operaria y secretaria NO acceden a comisiones', async () => {
    // La rule exige esAdminOCoord(). Operaria cobra pagos pero no ve
    // cuánto gana cada técnico.
    for (const uid of [UID.operaria, UID.secretaria]) {
      await assertFails(getDoc(doc(como(uid), COMISION_PROPIA)));
    }
  });

  it('un anónimo no ve nada', async () => {
    await assertFails(getDoc(doc(anonimo(), COMISION_PROPIA)));
  });
});

describe('facturas y cotizaciones', () => {
  it('un anónimo no puede leer una factura', async () => {
    await sembrar('facturas/FAC-0001', { numero: 'FAC-0001', total: 5000 });
    await assertFails(getDoc(doc(anonimo(), 'facturas/FAC-0001')));
  });

  it('un anónimo no puede crear una factura', async () => {
    await assertFails(
      setDoc(doc(anonimo(), 'facturas/FAC-falsa'), { numero: 'FAC-falsa', total: 1 }),
    );
  });

  it('el staff de oficina sí lee facturas', async () => {
    await sembrar('facturas/FAC-0002', { numero: 'FAC-0002', total: 5000 });
    await assertSucceeds(getDoc(doc(como(UID.operaria), 'facturas/FAC-0002')));
  });
});

describe('liquidaciones_nomina', () => {
  it('un técnico no puede leer la nómina de la empresa', async () => {
    await sembrar('liquidaciones_nomina/liq-1', { periodo: 'Q1', total: 120000 });
    await assertFails(getDoc(doc(como(UID.tecnico), 'liquidaciones_nomina/liq-1')));
  });
});
