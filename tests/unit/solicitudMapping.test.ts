import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  inferirMappingSolicitud, extraerCoordenadasSolicitud, normalizarEtiqueta,
  resumirSolicitudDatos, valoresTextoSolicitud,
} from '../../src/utils/solicitudMapping';
import type { CampoFormulario, SolicitudServicio } from '../../src/types/formularios';
import { Timestamp } from 'firebase/firestore';

function campo(id: string, tipo: CampoFormulario['tipo'], etiqueta: string, orden = 0): CampoFormulario {
  return { id, tipo, etiqueta, placeholder: '', requerido: false, opciones: [], orden };
}

test('normalizarEtiqueta remueve acentos + minúsculas + colapsa separadores', () => {
  assert.equal(normalizarEtiqueta('Descripción de la Falla'), 'descripcion de la falla');
  assert.equal(normalizarEtiqueta('Tipo de Equipo!'), 'tipo de equipo');
});

test('mapea por tipo (alta confianza) — telefono/email/direccion ganan sobre etiqueta', () => {
  const campos = [
    campo('c1', 'telefono', 'Móvil de contacto'),
    campo('c2', 'email', 'Correo'),
    campo('c3', 'direccion', 'Dónde vive'),
  ];
  const datos = { c1: '8091234567', c2: 'a@b.com', c3: 'Calle 5' };
  const m = inferirMappingSolicitud(campos, datos);
  assert.equal(m.clienteTelefono.valor, '8091234567');
  assert.equal(m.clienteTelefono.confianza, 'alta');
  assert.equal(m.clienteEmail.valor, 'a@b.com');
  assert.equal(m.clienteEmail.confianza, 'alta');
  assert.equal(m.clienteDireccion.valor, 'Calle 5');
  assert.equal(m.clienteDireccion.confianza, 'alta');
});

test('mapea por etiqueta (media confianza) cuando el tipo no lo dice', () => {
  const campos = [
    campo('nombre-abc123', 'texto', 'Nombre completo'),
    campo('marca-xyz', 'texto', 'Marca del equipo'),
    campo('falla-uuu', 'textarea', 'Descripción del problema'),
  ];
  const datos = { 'nombre-abc123': 'María', 'marca-xyz': 'LG', 'falla-uuu': 'No enciende' };
  const m = inferirMappingSolicitud(campos, datos);
  assert.equal(m.clienteNombre.valor, 'María');
  assert.equal(m.clienteNombre.confianza, 'media');
  assert.equal(m.equipoMarca.valor, 'LG');
  assert.equal(m.descripcionFalla.valor, 'No enciende');
});

test('respeta datos con ids auto-generados (no requiere claves fijas nombre/telefono)', () => {
  // El bug original: `Solicitudes.tsx` asumía `datos.nombre`, `datos.telefono`,
  // etc. Pero el editor da ids arbitrarios. Este test replica el caso real.
  const campos = [
    campo('field-6f2a1', 'texto', 'Nombre'),
    campo('field-9b4c', 'telefono', 'WhatsApp'),
    campo('field-3d8e', 'texto', 'Tipo de equipo'),
    campo('field-11ab', 'textarea', 'Qué le pasa al equipo'),
  ];
  const datos = {
    'field-6f2a1': 'Pedro López',
    'field-9b4c': '8095550101',
    'field-3d8e': 'Nevera',
    'field-11ab': 'No enfría',
  };
  const m = inferirMappingSolicitud(campos, datos);
  assert.equal(m.clienteNombre.valor, 'Pedro López');
  assert.equal(m.clienteTelefono.valor, '8095550101');
  assert.equal(m.equipoTipo.valor, 'Nevera');
  assert.equal(m.descripcionFalla.valor, 'No enfría');
});

test('fallback baja confianza cuando el id literal existe pero no la etiqueta', () => {
  const campos = [
    campo('tipo_equipo', 'texto', 'Aparato'),  // etiqueta genérica
  ];
  // 'aparato' matchea patrón equipoTipo → media confianza (no baja).
  const m = inferirMappingSolicitud(campos, { tipo_equipo: 'Aire Acondicionado' });
  assert.equal(m.equipoTipo.valor, 'Aire Acondicionado');
  assert.notEqual(m.equipoTipo.confianza, 'ninguna');
});

test('no inventa datos: si un campo no matchea nada, queda "ninguna"', () => {
  const campos = [
    campo('random-1', 'texto', 'Color favorito'),
  ];
  const m = inferirMappingSolicitud(campos, { 'random-1': 'Azul' });
  assert.equal(m.equipoTipo.confianza, 'ninguna');
  assert.equal(m.equipoTipo.valor, '');
});

test('trim de espacios extra en los valores', () => {
  const campos = [campo('c', 'telefono', 'Tel')];
  const m = inferirMappingSolicitud(campos, { c: '  8091234567  ' });
  assert.equal(m.clienteTelefono.valor, '8091234567');
});

// ─── extraerCoordenadasSolicitud ─────────────────────────────────────────

function solicitud(overrides: Partial<SolicitudServicio>): SolicitudServicio {
  return {
    id: 'sol-1',
    formularioId: 'form-1',
    formularioNombre: 'F',
    empresaId: 'e',
    empresaNombre: 'E',
    datos: {},
    archivos: [],
    estado: 'pendiente',
    notas: '',
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    ...overrides,
  };
}

test('extraerCoordenadas prioriza solicitud.ubicacion top-level', () => {
  const sol = solicitud({ ubicacion: { lat: 18.5, lng: -69.9 } });
  const coords = extraerCoordenadasSolicitud(sol, []);
  assert.deepEqual(coords, { lat: 18.5, lng: -69.9 });
});

test('extraerCoordenadas cae al campo tipo=ubicacion cuando ubicacion top no está', () => {
  const campos = [campo('c-ubic', 'ubicacion', 'GPS')];
  const sol = solicitud({ datos: { 'c-ubic': { lat: 18.4, lng: -69.8 } } });
  const coords = extraerCoordenadasSolicitud(sol, campos);
  assert.deepEqual(coords, { lat: 18.4, lng: -69.8 });
});

test('extraerCoordenadas rechaza coordenadas inválidas (NaN, fuera de rango)', () => {
  const sol1 = solicitud({ ubicacion: { lat: NaN, lng: -69.9 } as { lat: number; lng: number } });
  assert.equal(extraerCoordenadasSolicitud(sol1, []), null);
  const sol2 = solicitud({ ubicacion: { lat: 200, lng: -69.9 } });
  assert.equal(extraerCoordenadasSolicitud(sol2, []), null);
  const sol3 = solicitud({ ubicacion: { lat: 18.5, lng: 500 } });
  assert.equal(extraerCoordenadasSolicitud(sol3, []), null);
});

test('extraerCoordenadas retorna null si no hay ninguna fuente', () => {
  assert.equal(extraerCoordenadasSolicitud(solicitud({}), []), null);
});

// ─── resumirSolicitudDatos ─────────────────────────────────────────────────

test('resumen: usa claves fijas nombre/telefono cuando existen (compat)', () => {
  const r = resumirSolicitudDatos({ nombre: 'Ana', telefono: '8091234567' });
  assert.equal(r.nombre, 'Ana');
  assert.equal(r.telefono, '8091234567');
});

test('resumen: soporta formularios dinámicos sin claves fijas (ids auto-generados)', () => {
  const r = resumirSolicitudDatos({
    'field-abc': 'Pedro López',
    'field-def': '8095550101',
    'field-xyz': 'Nevera LG',
  });
  assert.equal(r.telefono, '8095550101');
  assert.equal(r.nombre, 'Pedro López');
});

test('resumen: ignora URLs / archivos / emails al elegir el nombre', () => {
  const r = resumirSolicitudDatos({
    'field-1': 'https://example.com/foto.jpg',
    'field-2': '[archivo pendiente]',
    'field-3': 'ana@example.com',
    'field-4': 'Ana Perez',
    'field-5': '8091234567',
  });
  assert.equal(r.nombre, 'Ana Perez');
  assert.equal(r.telefono, '8091234567');
});

test('resumen: acepta teléfono con formato +1 y lo normaliza para detección', () => {
  const r = resumirSolicitudDatos({
    'x': '  ',
    'y': '+1-809-555-0101',
    'z': 'María',
  });
  assert.equal(r.nombre, 'María');
  // Retorna el valor original (con formato), no el normalizado —
  // el consumo típico es display, no persistencia.
  assert.ok(r.telefono.includes('809'));
});

test('resumen: no inventa (retorna vacíos si nada matchea)', () => {
  const r = resumirSolicitudDatos({});
  assert.equal(r.nombre, '');
  assert.equal(r.telefono, '');
});

// ─── valoresTextoSolicitud ─────────────────────────────────────────────────

test('valoresTexto: retorna solo strings/números planos no vacíos', () => {
  const vals = valoresTextoSolicitud({
    a: 'Ana',
    b: '8091234567',
    c: null,
    d: undefined,
    e: '',
    f: { lat: 1, lng: 2 },
    g: [1, 2],
    h: '[archivo]',
    i: 42,
  });
  assert.deepEqual(vals.sort(), ['42', '8091234567', 'Ana'].sort());
});

