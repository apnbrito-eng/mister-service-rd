import { describe, expect, it } from 'vitest';
import { coincideBusquedaOrden } from '../../src/utils/buscarOrden';

const orden = {
  numero: 'OS-0011', clienteNombre: 'José  Ramírez', clienteTelefono: '+1 (809) 555-1001',
  equipoTipo: 'Lavadora', equipoMarca: 'Samsung', equipoModelo: 'Carga frontal',
  equipoModeloFabricante: 'WF45R6100AW', descripcionFalla: 'No centrifuga y hace ruido',
};

describe('búsqueda de órdenes', () => {
  it.each(['', '  ', 'JOSÉ', 'jose ramirez', 'ramí', '0011', 'OS-0011', 'os0011', '#OS 0011',
    '8095551001', '18095551001', '(809) 555-1001', '5551001', 'lavadora', 'sams', 'frontal',
    'WF45', 'centrifuga', 'hace   ruido'])('encuentra %s', consulta => {
    expect(coincideBusquedaOrden(orden, consulta)).toBe(true);
  });
  it.each(['9999999', 'Pedro', 'nevera', 'lavadora 809', '---', 'OS-0012'])('descarta %s', consulta => {
    expect(coincideBusquedaOrden(orden, consulta)).toBe(false);
  });
  it('tolera registros antiguos con campos ausentes', () => {
    expect(coincideBusquedaOrden({}, 'jose')).toBe(false);
    expect(coincideBusquedaOrden({}, ' ')).toBe(true);
  });
  it('admite prefijo 1 en la consulta cuando el teléfono guardado es local', () => {
    expect(coincideBusquedaOrden({ clienteTelefono: '8095551001' }, '+1 (809) 555-1001')).toBe(true);
  });
  it('no elimina un 1 de teléfonos que no tienen once dígitos', () => {
    expect(coincideBusquedaOrden({ clienteTelefono: '1809555100' }, '8095551001')).toBe(false);
  });
});
