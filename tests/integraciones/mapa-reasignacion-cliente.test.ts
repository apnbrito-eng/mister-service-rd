// Pruebas del cliente `src/services/reasignacion.service.ts`.
//
// Mockeamos `firebase/config` (auth.currentUser.getIdToken) y `fetch` para
// validar que el service:
//   - Adjunta el ID token Firebase como Bearer.
//   - Hace POST a `/api/mapa/reasignar` con `action` y payload serializables.
//   - NO envía la bandera `forzarConflicto` (no existe en el contrato final).
//   - Propaga `codigo` + `status` cuando el servidor devuelve !ok.
//   - Reintenta con token fresco en 401.
//   - Falla con `ErrorReasignacion` cuando no hay sesión.
//   - Para origen=deshacer, acepta esperado.updateSeconds/updateNanos y los pasa.

import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';

const m = vi.hoisted(() => ({
  getIdToken: vi.fn(async () => 'id-token-ficticio'),
  fetch: vi.fn(),
}));

vi.mock('../../src/firebase/config', () => ({
  auth: { currentUser: { uid: 'uid-caller', getIdToken: m.getIdToken } },
}));

import { previewReasignacion, confirmarReasignacion, ErrorReasignacion } from '../../src/services/reasignacion.service';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', m.fetch);
  m.getIdToken.mockImplementation(async () => 'id-token-ficticio');
});

afterEach(() => { vi.unstubAllGlobals(); });

function okJson(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}
function errJson(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('reasignacion.service — previewReasignacion', () => {
  it('envía action=preview con bearer y payload bien formado', async () => {
    m.fetch.mockResolvedValue(okJson({
      ok: true, previewId: 'p1', ttlMs: 600000, emitidoEnMs: Date.now(),
      orden: { ordenId: 'o1', fase: 'agendado', fechaCitaMs: 1, duracionMin: 60, version: { seconds: 1, nanos: 2 }, tecnicoAnterior: null, operariaAnterior: null },
      destino: { uid: 't1', nombre: 'T', operariaUid: 'op', operariaNombre: 'O' },
      conflictos: [], cambioDeGrupo: false, requiereMotivoCambioGrupo: false,
    }));
    const res = await previewReasignacion({
      ordenId: 'o1',
      esperado: { tecnicoId: null, fase: 'agendado', fechaCitaMs: 1 },
      destinoUid: 't1',
      origen: 'mapa',
    });
    expect(res.ok).toBe(true);
    expect(res.orden.version).toMatchObject({ seconds: 1, nanos: 2 });
    const [url, init] = m.fetch.mock.calls[0];
    expect(url).toBe('/api/mapa/reasignar');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer id-token-ficticio');
    const body = JSON.parse(init.body);
    expect(body.action).toBe('preview');
    expect(body.ordenId).toBe('o1');
    expect(body.destinoUid).toBe('t1');
  });

  it('propaga esperado.updateSeconds/updateNanos para origen=deshacer', async () => {
    m.fetch.mockResolvedValue(okJson({
      ok: true, previewId: 'p1', ttlMs: 1, emitidoEnMs: 1,
      orden: { ordenId: 'o1', fase: 'agendado', fechaCitaMs: null, duracionMin: 60, version: { seconds: 1, nanos: 1 }, tecnicoAnterior: null, operariaAnterior: null },
      destino: null, conflictos: [], cambioDeGrupo: false, requiereMotivoCambioGrupo: false,
    }));
    await previewReasignacion({
      ordenId: 'o1',
      esperado: { tecnicoId: 'destino-prev', fase: 'agendado', fechaCitaMs: 123, updateSeconds: 999, updateNanos: 100_000_000 },
      destinoUid: 'anterior',
      origen: 'deshacer',
    });
    const body = JSON.parse(m.fetch.mock.calls[0][1].body);
    expect(body.origen).toBe('deshacer');
    expect(body.esperado.updateSeconds).toBe(999);
    expect(body.esperado.updateNanos).toBe(100_000_000);
  });

  it('mapea codigo + mensaje del backend a ErrorReasignacion', async () => {
    m.fetch.mockResolvedValue(errJson({ ok: false, error: 'La orden cambió', codigo: 'cambio' }, 409));
    await expect(previewReasignacion({
      ordenId: 'o1',
      esperado: { tecnicoId: null, fase: 'agendado', fechaCitaMs: null },
      destinoUid: 't1',
      origen: 'mapa',
    })).rejects.toSatisfy((e: unknown) => {
      return e instanceof ErrorReasignacion && e.codigo === 'cambio' && e.status === 409;
    });
  });

  it('reintenta con token fresco cuando el servidor responde 401', async () => {
    m.fetch
      .mockResolvedValueOnce(errJson({ ok: false, error: 'Sesión', codigo: 'permiso' }, 401))
      .mockResolvedValueOnce(okJson({
        ok: true, previewId: 'p2', ttlMs: 1, emitidoEnMs: 1,
        orden: { ordenId: 'o1', fase: 'agendado', fechaCitaMs: null, duracionMin: 60, version: { seconds: 1, nanos: 1 }, tecnicoAnterior: null, operariaAnterior: null },
        destino: null, conflictos: [], cambioDeGrupo: false, requiereMotivoCambioGrupo: false,
      }));
    const res = await previewReasignacion({
      ordenId: 'o1',
      esperado: { tecnicoId: null, fase: 'agendado', fechaCitaMs: null },
      destinoUid: null,
      origen: 'mapa',
    });
    expect(res.previewId).toBe('p2');
    expect(m.getIdToken).toHaveBeenCalledTimes(2);
    expect(m.getIdToken.mock.calls[1][0]).toBe(true);
  });

  it('falla con permiso si no hay sesión', async () => {
    const original = (await import('../../src/firebase/config')).auth;
    // @ts-expect-error forzamos null para la prueba
    original.currentUser = null;
    await expect(previewReasignacion({
      ordenId: 'o1',
      esperado: { tecnicoId: null, fase: 'agendado', fechaCitaMs: null },
      destinoUid: null,
      origen: 'mapa',
    })).rejects.toSatisfy((e: unknown) => e instanceof ErrorReasignacion && e.codigo === 'permiso');
    // Restaurar para los demás tests
    // @ts-expect-error restore
    original.currentUser = { uid: 'uid-caller', getIdToken: m.getIdToken };
  });
});

describe('reasignacion.service — confirmarReasignacion', () => {
  it('envía action=confirmar + motivo; NO envía forzarConflicto', async () => {
    m.fetch.mockResolvedValue(okJson({
      ok: true, aplicadoMs: 1, commit: { seconds: 2, nanos: 3 }, undoDisponible: true,
      deshacer: { ordenId: 'o1', esperado: { tecnicoId: 't1', fase: 'agendado', fechaCitaMs: 1, updateSeconds: 2, updateNanos: 3 }, destinoUid: null, origen: 'deshacer' },
    }));
    const res = await confirmarReasignacion('abcd0000-ab12-ab12-ab12-abcdef012345', { motivo: 'ok' });
    expect(res.ok).toBe(true);
    expect(res.undoDisponible).toBe(true);
    const body = JSON.parse(m.fetch.mock.calls[0][1].body);
    expect(body).toMatchObject({ action: 'confirmar', previewId: 'abcd0000-ab12-ab12-ab12-abcdef012345', motivo: 'ok' });
    expect('forzarConflicto' in body).toBe(false);
  });

  it('propaga undoDisponible=false con motivo', async () => {
    m.fetch.mockResolvedValue(okJson({
      ok: true, aplicadoMs: 1, commit: null, undoDisponible: false,
      motivoUndoNoDisponible: 'orden_cambio_despues', deshacer: null,
    }));
    const res = await confirmarReasignacion('abcd0000-ab12-ab12-ab12-abcdef012345');
    expect(res.undoDisponible).toBe(false);
    expect(res.deshacer).toBeNull();
    expect(res.motivoUndoNoDisponible).toBe('orden_cambio_despues');
  });

  it('propaga preview_vencido cuando el backend responde 409', async () => {
    m.fetch.mockResolvedValue(errJson({ ok: false, error: 'TTL vencido', codigo: 'preview_vencido' }, 409));
    await expect(confirmarReasignacion('abcd0000-ab12-ab12-ab12-abcdef012345', { motivo: 'x' })).rejects.toSatisfy((e: unknown) => {
      return e instanceof ErrorReasignacion && e.codigo === 'preview_vencido';
    });
  });

  it('convierte respuesta HTTP 200 sin JSON en ErrorReasignacion("red") (dev server devuelve HTML)', async () => {
    m.fetch.mockResolvedValue(new Response('<!DOCTYPE html><html>index</html>', { status: 200, headers: { 'content-type': 'text/html' } }));
    await expect(confirmarReasignacion('abcd0000-ab12-ab12-ab12-abcdef012345', { motivo: 'x' })).rejects.toSatisfy((e: unknown) => {
      return e instanceof ErrorReasignacion && e.codigo === 'red' && e.status === 200;
    });
  });

  it('propaga tecnico_anterior_legacy_sin_uid como motivoUndoNoDisponible válido', async () => {
    m.fetch.mockResolvedValue(okJson({
      ok: true, aplicadoMs: 1, commit: { seconds: 2, nanos: 3 }, undoDisponible: false,
      motivoUndoNoDisponible: 'tecnico_anterior_legacy_sin_uid', deshacer: null,
    }));
    const res = await confirmarReasignacion('abcd0000-ab12-ab12-ab12-abcdef012345');
    expect(res.undoDisponible).toBe(false);
    expect(res.motivoUndoNoDisponible).toBe('tecnico_anterior_legacy_sin_uid');
    expect(res.deshacer).toBeNull();
  });
});
