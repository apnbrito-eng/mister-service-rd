import { beforeAll, afterAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  addDoc,
} from 'firebase/firestore';
import {
  iniciarEntorno,
  entorno,
  resetearConPerfiles,
  sembrar,
  como,
  anonimo,
  UID,
} from './helpers';

/**
 * SPRINT-DISENO-BAMBOO-LOTE-4 (plan integral §1, 2026-10-08, revisión Codex).
 *
 * El lote 4 restringe la matriz base de secretaria/operaria para no heredar
 * acceso financiero/administrativo. Como las rules del repo son rol-based
 * (y no permiso-based) la autorización server-side depende de que la rule
 * de cada colección exija admin/coord para las operaciones sensibles.
 *
 * Este archivo prueba:
 *
 *  1. OPERATIVO permitido — operaria/secretaria siguen pudiendo trabajar en
 *     su día normal: crear/leer órdenes y cotizaciones, crear/modificar
 *     clientes.
 *
 *  2. DENEGADO VERIFICADO — rules ya bien gateadas. Operaria/secretaria no
 *     escriben comisiones, préstamos ni bancos; no eliminan clientes; no
 *     ven comisión ajena; no entran a `personal_privado`.
 *
 *  3. DENEGADO PENDIENTE — huecos encontrados en la auditoría cuyas rules
 *     se endurecerán en el próximo lote (coordinado con Codex para evitar
 *     romper flujos operativos vigentes). Se dejan como `it.todo` para que
 *     el reporte de tests los liste como pendientes sin tirar la suite.
 *     Los flujos afectados ESTÁN gateados hoy desde la UI (sidebar + ruta)
 *     con los defaults nuevos, pero una llamada directa (consola/API) sigue
 *     pasando contra Firestore sin bloqueo de rule — ese endurecimiento
 *     requiere adaptar primero quién emite cada escritura (p. ej. operaria
 *     emite el conduce de garantía hoy mismo: endurecer `facturas` write
 *     a admin/coord quiebra el flujo si no se mueve el emisor).
 */

beforeAll(async () => {
  await iniciarEntorno();
});
afterAll(async () => {
  await entorno().cleanup();
});
beforeEach(async () => {
  await resetearConPerfiles();
});

// ────────────────────────────────────────────────────────────────────────
// 1 · Operativo permitido para secretaria/operaria
// ────────────────────────────────────────────────────────────────────────

describe('lote 4 · operativo permitido para operaria/secretaria', () => {
  for (const [etiqueta, uid] of [
    ['operaria', UID.operaria],
    ['secretaria', UID.secretaria],
  ] as const) {
    describe(etiqueta, () => {
      it('crea una orden propia (sin flags financieros ni efectivo)', async () => {
        const ref = doc(como(uid), 'ordenes_servicio/OS-nueva');
        await assertSucceeds(
          setDoc(ref, {
            numero: 'OS-nueva',
            fase: 'nuevo_lead',
            clienteId: 'cliente-x',
            responsableId: uid,
            operariaId: uid,
            tecnicoId: '',
            presupuestoEstado: '',
          }),
        );
      });

      it('crea un cliente nuevo', async () => {
        const ref = doc(como(uid), 'clientes/cli-nuevo');
        await assertSucceeds(
          setDoc(ref, {
            nombre: 'Pedro Nuevo',
            telefono: '8095551010',
          }),
        );
      });

      it('modifica un cliente existente', async () => {
        await sembrar('clientes/cli-existente', {
          nombre: 'Ana Existente',
          telefono: '8095551212',
        });
        const ref = doc(como(uid), 'clientes/cli-existente');
        await assertSucceeds(updateDoc(ref, { direccion: 'Calle 10' }));
      });

      it('NO elimina un cliente (clientesEliminar no está en defaults)', async () => {
        await sembrar('clientes/cli-para-borrar', { nombre: 'X' });
        const ref = doc(como(uid), 'clientes/cli-para-borrar');
        await assertFails(deleteDoc(ref));
      });

      it('crea una cotización asociada a una orden', async () => {
        // La rule exige esStaffOficina() o técnico-propio.
        const ref = doc(como(uid), 'cotizaciones/QT-nueva');
        await assertSucceeds(
          setDoc(ref, {
            numero: 'QT-nueva',
            ordenId: 'OS-xyz',
            total: 2500,
          }),
        );
      });
    });
  }
});

// ────────────────────────────────────────────────────────────────────────
// 2 · Denegado verificado (rules ya bien gateadas)
// ────────────────────────────────────────────────────────────────────────

describe('lote 4 · financieras y administrativas denegadas a operaria/secretaria', () => {
  for (const [etiqueta, uid] of [
    ['operaria', UID.operaria],
    ['secretaria', UID.secretaria],
  ] as const) {
    describe(etiqueta, () => {
      it('NO crea una comisión', async () => {
        const ref = doc(como(uid), 'comisiones/com-forjada');
        await assertFails(
          setDoc(ref, {
            tecnicoId: UID.tecnico,
            comisionMonto: 9999,
            estadoLiquidacion: 'pendiente',
          }),
        );
      });

      it('NO modifica una comisión ajena', async () => {
        await sembrar('comisiones/com-tecnico', {
          tecnicoId: UID.tecnico,
          comisionMonto: 1200,
          estadoLiquidacion: 'pendiente',
        });
        const ref = doc(como(uid), 'comisiones/com-tecnico');
        await assertFails(updateDoc(ref, { comisionMonto: 9999 }));
      });

      it('NO lee la comisión de un técnico', async () => {
        await sembrar('comisiones/com-ajena', {
          tecnicoId: UID.tecnico,
          comisionMonto: 500,
          estadoLiquidacion: 'pendiente',
        });
        const ref = doc(como(uid), 'comisiones/com-ajena');
        await assertFails(getDoc(ref));
      });

      it('NO crea un préstamo a un empleado', async () => {
        const ref = doc(como(uid), 'prestamos_empleados/prest-forjado');
        await assertFails(
          setDoc(ref, {
            personalId: UID.tecnico,
            personalNombre: 'Técnico',
            montoTotal: 10000,
            montoCuota: 1000,
            cuotasTotales: 10,
            cuotasPagadas: 0,
            saldoPendiente: 10000,
            estado: 'activo',
            cuotasHistorial: [],
          }),
        );
      });

      it('NO cancela un préstamo activo', async () => {
        await sembrar('prestamos_empleados/prest-activo', {
          personalId: UID.tecnico,
          montoTotal: 5000,
          saldoPendiente: 5000,
          estado: 'activo',
          cuotasHistorial: [],
        });
        const ref = doc(como(uid), 'prestamos_empleados/prest-activo');
        await assertFails(
          updateDoc(ref, {
            estado: 'cancelado',
            motivoCancelacion: 'Prueba de permisos',
          }),
        );
      });

      it('NO modifica un banco', async () => {
        await sembrar('bancos/banco-1', {
          nombre: 'Banco Popular',
          numeroCuenta: '843776782',
          activo: true,
        });
        const ref = doc(como(uid), 'bancos/banco-1');
        await assertFails(updateDoc(ref, { numeroCuenta: '0000000' }));
      });

      it('NO crea un banco nuevo', async () => {
        const ref = doc(como(uid), 'bancos/banco-fantasma');
        await assertFails(
          setDoc(ref, {
            nombre: 'Banco Fantasma',
            numeroCuenta: '12345',
            activo: true,
          }),
        );
      });

      it('NO lee ni escribe personal_privado (datos sensibles)', async () => {
        await sembrar('personal_privado/alguien', {
          cedula: '001-0000000-0',
          direccion: 'Calle 5',
        });
        const ref = doc(como(uid), 'personal_privado/alguien');
        await assertFails(getDoc(ref));
        await assertFails(updateDoc(ref, { cedula: '999' }));
      });

      it('NO modifica una liquidación de nómina', async () => {
        await sembrar('liquidaciones_nomina/liq-01', {
          tecnicoId: UID.tecnico,
          quincena: '2026-Q20',
          totalNeto: 25000,
          estado: 'abierta',
        });
        const ref = doc(como(uid), 'liquidaciones_nomina/liq-01');
        await assertFails(updateDoc(ref, { estado: 'cerrada' }));
      });
    });
  }
});

// ────────────────────────────────────────────────────────────────────────
// 3 · Rol técnico y ayudante — denegados por default (sin cambio en este lote)
// ────────────────────────────────────────────────────────────────────────

describe('lote 4 · roles de campo no acceden a módulos de oficina', () => {
  for (const [etiqueta, uid] of [
    ['técnico', UID.tecnico],
    ['ayudante', UID.ayudante],
  ] as const) {
    describe(etiqueta, () => {
      it('NO crea un cliente', async () => {
        const ref = doc(como(uid), 'clientes/cli-tecnico');
        await assertFails(setDoc(ref, { nombre: 'Y', telefono: '8095550000' }));
      });

      it('NO escribe en comisiones ni liquidaciones', async () => {
        await assertFails(
          setDoc(doc(como(uid), 'comisiones/mia'), {
            tecnicoId: uid,
            comisionMonto: 1,
            estadoLiquidacion: 'pendiente',
          }),
        );
        await assertFails(
          setDoc(doc(como(uid), 'liquidaciones_nomina/mia'), {
            tecnicoId: uid,
            quincena: '2026-Q20',
          }),
        );
      });

      it('NO lee personal_privado', async () => {
        await sembrar('personal_privado/dato', { cedula: '001' });
        await assertFails(getDoc(doc(como(uid), 'personal_privado/dato')));
      });
    });
  }
});

// ────────────────────────────────────────────────────────────────────────
// 4 · Visitante anónimo — bloqueo general
// ────────────────────────────────────────────────────────────────────────

describe('lote 4 · visitante anónimo no toca nada autenticado', () => {
  it('no lee órdenes', async () => {
    await sembrar('ordenes_servicio/OS-0001', { numero: 'OS-0001' });
    await assertFails(getDoc(doc(anonimo(), 'ordenes_servicio/OS-0001')));
  });

  it('no crea un cliente', async () => {
    await assertFails(
      addDoc(collection(anonimo(), 'clientes'), { nombre: 'anon' }),
    );
  });

  it('no lee personal_privado', async () => {
    await sembrar('personal_privado/dato', { cedula: '001' });
    await assertFails(getDoc(doc(anonimo(), 'personal_privado/dato')));
  });
});

// ────────────────────────────────────────────────────────────────────────
// 5 · Admin y coordinadora — operaciones permitidas (regresión)
// ────────────────────────────────────────────────────────────────────────

describe('lote 4 · admin y coord conservan sus permisos', () => {
  for (const [etiqueta, uid] of [
    ['administrador', UID.admin],
    ['coordinadora', UID.coordinadora],
  ] as const) {
    describe(etiqueta, () => {
      it('crea una comisión', async () => {
        const ref = doc(como(uid), 'comisiones/com-nueva');
        await assertSucceeds(
          setDoc(ref, {
            tecnicoId: UID.tecnico,
            comisionMonto: 1500,
            estadoLiquidacion: 'pendiente',
          }),
        );
      });

      it('actualiza un préstamo activo', async () => {
        await sembrar('prestamos_empleados/prest-x', {
          personalId: UID.tecnico,
          saldoPendiente: 3000,
          montoTotal: 3000,
          estado: 'activo',
          cuotasHistorial: [],
        });
        const ref = doc(como(uid), 'prestamos_empleados/prest-x');
        await assertSucceeds(
          updateDoc(ref, {
            estado: 'cancelado',
            motivoCancelacion: 'Decidido por admin',
          }),
        );
      });

      it('lee personal_privado', async () => {
        await sembrar('personal_privado/alguien', { cedula: '001-0000000-0' });
        await assertSucceeds(getDoc(doc(como(uid), 'personal_privado/alguien')));
      });
    });
  }

  it('solo admin crea/modifica bancos', async () => {
    await sembrar('bancos/banco-xx', {
      nombre: 'Banco X',
      numeroCuenta: '1',
      activo: true,
    });
    await assertSucceeds(
      updateDoc(doc(como(UID.admin), 'bancos/banco-xx'), { activo: false }),
    );
    // La coordinadora NO modifica bancos (rule es admin estricto).
    await assertFails(
      updateDoc(doc(como(UID.coordinadora), 'bancos/banco-xx'), {
        activo: true,
      }),
    );
  });
});

// ────────────────────────────────────────────────────────────────────────
// 6 · Huecos documentados — pendientes de endurecer en próximo lote
// ────────────────────────────────────────────────────────────────────────
//
// Las siguientes rules otorgan hoy acceso de escritura a operaria/secretaria
// aunque los nuevos defaults de `PERMISOS_DEFAULT_OPERARIA` ya quitaron el
// permiso correspondiente del cliente. El gate client-side (sidebar + ruta)
// las bloquea, pero una llamada directa (p. ej. consola del navegador o
// endpoint API custom) sigue siendo aceptada por Firestore.
//
// NO se endurecen en este commit porque la emisión real HOY la hace la
// operaria desde el flujo de orden (OrdenDetalle), y endurecer la rule sin
// mover primero el emisor rompe la operación diaria. Codex revisa y aplica
// el endurecimiento con el flujo adaptado en el próximo lote.
//
// Al implementar el endurecimiento, estos `.todo` se convierten en tests
// reales con `assertFails(...)`.

describe.todo(
  'HUECO · operaria/secretaria NO deberían crear/actualizar avances (rule actual: esStaffOficina)',
);
describe.todo(
  'HUECO · operaria/secretaria NO deberían ejecutar cierre_dia (rule actual: esStaffOficina write)',
);
describe.todo(
  'HUECO · operaria/secretaria NO deberían leer gastos administrativos (rule actual: esStaffOficina read)',
);
describe.todo(
  'HUECO · operaria/secretaria NO deberían crear/actualizar facturas directamente — hoy lo hacen desde emisión de conduce; adaptar flujo antes de endurecer',
);
describe.todo(
  'HUECO · operaria/secretaria NO deberían tocar campos de aprobación de precio en cotizaciones (cotizacionesAprobarPrecio) — requiere rule granular por affectedKeys',
);
describe.todo(
  'HUECO · operaria/secretaria NO deberían escribir `verificado=true` dentro del array `orden.pagos[]` — requiere rule granular por elemento del array',
);
