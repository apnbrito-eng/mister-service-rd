/** Datos exclusivamente locales para QA visual. No importa Firebase. */
export const useEmpresas = () => ({ loading: false, empresas: [
  { id: 'qa-empresa-activa', nombre: 'Empresa QA con nombre extenso para verificar ajuste en pantalla móvil', contactoNombre: 'Contacto de prueba visual', contactoTelefono: '8090000000', contactoEmail: 'contacto.extenso.para.comprobar.ajuste@example.test', logoUrl: '', activa: true },
  { id: 'qa-empresa-inactiva', nombre: 'Empresa QA inactiva', contactoNombre: '', contactoTelefono: '', contactoEmail: '', logoUrl: '', activa: false },
] });
const bloquear = async (): Promise<never> => { throw new Error('Escritura bloqueada en ensayo local de empresas.'); };
export const crearEmpresa = bloquear;
export const actualizarEmpresa = bloquear;
export const eliminarEmpresa = bloquear;
export const subirLogoEmpresa = bloquear;
