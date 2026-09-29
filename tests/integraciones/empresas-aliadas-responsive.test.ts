import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  actualizar: vi.fn(), eliminar: vi.fn(), recargar: vi.fn(),
  empresas: [{ id: 'empresa-qa', nombre: 'Empresa QA', contactoNombre: 'Contacto QA', contactoTelefono: '8090000000', contactoEmail: 'contacto@example.test', logoUrl: '', activa: true }],
}));
vi.mock('../../src/hooks/useFormularios', () => ({ useEmpresas: () => ({ empresas: mocks.empresas, loading: false }) }));
vi.mock('../../src/services/empresasAliadas.service', () => ({ crearEmpresa: vi.fn(), actualizarEmpresa: mocks.actualizar, eliminarEmpresa: mocks.eliminar, subirLogoEmpresa: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../src/components/LoadingSpinner', () => ({ default: () => null }));
vi.mock('../../src/components/Modal', () => ({ default: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) => isOpen ? React.createElement('section', { 'data-modal': true }, children) : null }));
import EmpresasAliadas from '../../src/pages/EmpresasAliadas';
let tree: ReactTestRenderer;
afterEach(() => { act(() => tree?.unmount()); vi.clearAllMocks(); vi.unstubAllGlobals(); mocks.empresas[0].activa = true; });
function abrir() { vi.stubGlobal('window', { location: { reload: mocks.recargar } }); act(() => { tree = create(React.createElement(EmpresasAliadas)); }); }
it('edita desde tarjeta móvil conservando datos y mantiene tabla de escritorio', () => {
  abrir();
  const lista = tree.root.findByType('ul');
  expect(lista.props.className).toContain('lg:hidden');
  expect(tree.root.findByType('table').parent?.props.className).toContain('lg:block');
  act(() => lista.findAllByType('button')[0].props.onClick());
  const inputs = tree.root.findAllByType('input');
  expect(inputs.find(n => n.props.type === 'text')?.props.value).toBe('Empresa QA');
  expect(inputs.find(n => n.props.type === 'email')?.props.value).toBe('contacto@example.test');
  expect(mocks.actualizar).not.toHaveBeenCalled();
});
it('desactiva desde la tarjeta utilizando el mismo identificador y handler existentes', async () => {
  abrir();
  await act(async () => tree.root.findByType('ul').findAllByType('button')[1].props.onClick());
  expect(mocks.eliminar).toHaveBeenCalledExactlyOnceWith('empresa-qa');
  expect(mocks.actualizar).not.toHaveBeenCalled();
  expect(mocks.recargar).toHaveBeenCalledOnce();
});
it('reactiva desde la tarjeta sin eliminar la empresa', async () => {
  mocks.empresas[0].activa = false; abrir();
  await act(async () => tree.root.findByType('ul').findAllByType('button')[1].props.onClick());
  expect(mocks.actualizar).toHaveBeenCalledExactlyOnceWith('empresa-qa', { activa: true });
  expect(mocks.eliminar).not.toHaveBeenCalled();
});
