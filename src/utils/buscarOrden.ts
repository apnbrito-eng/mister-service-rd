import type { OrdenServicio } from '../types';

type OrdenBuscable = Partial<Pick<OrdenServicio,
  'numero' | 'clienteNombre' | 'clienteTelefono' | 'equipoTipo' | 'equipoMarca' |
  'equipoModelo' | 'equipoModeloFabricante' | 'descripcionFalla'
>>;

function normalizarTexto(valor: unknown): string {
  return typeof valor === 'string'
    ? valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
    : '';
}

function normalizarTelefono(valor: string): string {
  const digitos = valor.replace(/\D/g, '');
  return digitos.length === 11 && digitos.startsWith('1') ? digitos.slice(1) : digitos;
}

/** Busca únicamente sobre la orden recibida; permisos y filtros pertenecen a la lista. */
export function coincideBusquedaOrden(orden: OrdenBuscable, consulta: string): boolean {
  const texto = normalizarTexto(consulta);
  if (!texto) return true;
  const campos = [orden.numero, orden.clienteNombre, orden.clienteTelefono, orden.equipoTipo,
    orden.equipoMarca, orden.equipoModelo, orden.equipoModeloFabricante, orden.descripcionFalla];
  if (campos.some(campo => normalizarTexto(campo).includes(texto))) return true;

  // No extraer números de una consulta textual: «lavadora 809» no es un teléfono.
  if (/^[+\d\s().-]+$/.test(texto)) {
    const telefono = normalizarTelefono(texto);
    if (telefono && normalizarTelefono(normalizarTexto(orden.clienteTelefono)).includes(telefono)) return true;
  }
  // Mantener la búsqueda parcial del número, aceptando OS 0011, OS0011 y #OS-0011.
  const numero = normalizarTexto(orden.numero).replace(/[#\s-]/g, '');
  const consultaNumero = texto.replace(/[#\s-]/g, '');
  return /^os\d+$/.test(consultaNumero) && numero.includes(consultaNumero);
}
