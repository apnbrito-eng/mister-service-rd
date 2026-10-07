import { describe, it, expect } from 'vitest';
import { deleteField } from 'firebase/firestore';
import { limpiarActualizacion } from '../../src/utils/actualizacionPersonal';

describe('edición de ficha Personal', () => {
  it('elimina valores opcionales al vaciar el formulario en lugar de conservar el anterior', () => {
    expect(limpiarActualizacion({ direccion: undefined, ubicacionCasa: undefined })).toEqual({ direccion: deleteField(), ubicacionCasa: deleteField() });
  });
  it('conserva sueldo cero y permisos deshabilitados', () => {
    expect(limpiarActualizacion({ sueldoBase: 0, iaHabilitada: false, nombre: 'Empleado' })).toEqual({ sueldoBase: 0, iaHabilitada: false, nombre: 'Empleado' });
  });
});
