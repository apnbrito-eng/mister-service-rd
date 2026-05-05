import { Cliente } from '../types';
import { mesesDesdeUltimoServicio } from './clientesFiltros';

/**
 * Variables soportadas en plantillas WhatsApp del módulo de Reactivación.
 * Las plantillas usan `{nombre}`, `{telefono}`, `{ultimoServicio}`,
 * `{mesesUltimoServicio}`, `{equipoTipo}`, `{zona}`. Variables no
 * reconocidas se dejan tal cual (defensa contra typos del admin).
 */
export const VARIABLES_PLANTILLA = [
  'nombre',
  'telefono',
  'ultimoServicio',
  'mesesUltimoServicio',
  'equipoTipo',
  'zona',
] as const;

export type VariablePlantilla = typeof VARIABLES_PLANTILLA[number];

/** Devuelve solo el primer nombre del cliente (antes del primer espacio). */
function primerNombre(nombreCompleto: string): string {
  return nombreCompleto.trim().split(/\s+/)[0] || '';
}

/**
 * Mapea cada variable a su valor para un cliente. Los fallbacks están
 * pensados para que el mensaje renderizado siempre suene natural en
 * español aunque el cliente no tenga el dato:
 *  - nombre → primer nombre o "cliente"
 *  - telefono → teléfono raw o ""
 *  - ultimoServicio → "hace X meses" o "hace tiempo"
 *  - mesesUltimoServicio → string entero de meses o "varios"
 *  - equipoTipo → primer equipo del CSV o "tu equipo"
 *  - zona → cliente.zona o ""
 *
 * No se reusan fallbacks de otros campos (ej: si zona vacía, queda vacío
 * literal y el mensaje renderiza con doble espacio si el admin no lo
 * cuidó — la UI muestra warning si el preview detecta variables faltantes).
 */
export function valoresVariablesCliente(cliente: Cliente): Record<VariablePlantilla, string> {
  const meses = mesesDesdeUltimoServicio(cliente);
  const mesesEntero = meses === null ? null : Math.max(0, Math.round(meses));

  let equipoTipo = 'tu equipo';
  const equiposCsv = cliente.legacyMetricas?.equiposAtendidos;
  if (typeof equiposCsv === 'string' && equiposCsv.trim()) {
    const primero = equiposCsv.split(',').map(s => s.trim()).filter(Boolean)[0];
    if (primero) equipoTipo = primero;
  }

  const ultimoServicio = mesesEntero === null
    ? 'hace tiempo'
    : (mesesEntero <= 0 ? 'recientemente' : `hace ${mesesEntero} ${mesesEntero === 1 ? 'mes' : 'meses'}`);

  return {
    nombre: primerNombre(cliente.nombre || '') || 'cliente',
    telefono: cliente.telefono || '',
    ultimoServicio,
    mesesUltimoServicio: mesesEntero === null ? 'varios' : String(mesesEntero),
    equipoTipo,
    zona: cliente.zona || '',
  };
}

/**
 * Renderiza una plantilla reemplazando `{variable}` con el valor del
 * cliente. Las variables no reconocidas se dejan literales (no se
 * borran) para que el admin detecte typos en el preview.
 */
export function renderizarPlantilla(plantilla: string, cliente: Cliente): string {
  if (!plantilla) return '';
  const valores = valoresVariablesCliente(cliente);
  return plantilla.replace(/\{(\w+)\}/g, (match, varName: string) => {
    if ((VARIABLES_PLANTILLA as readonly string[]).includes(varName)) {
      return valores[varName as VariablePlantilla];
    }
    return match; // dejá la variable literal — el admin verá el typo en preview
  });
}

/**
 * Devuelve la lista de variables presentes en la plantilla que no
 * resolvieron a un valor "real" para el cliente. Se usa para mostrar
 * un warning en el preview ("Variable {equipoTipo} usará fallback 'tu equipo'").
 *
 * Considera fallback los strings que mapeo defensivamente arriba: si la
 * plantilla pide `{equipoTipo}` y el cliente no tiene `legacyMetricas`,
 * el render saldrá "tu equipo" — el warning lo señala como fallback.
 */
export function variablesEnFallback(plantilla: string, cliente: Cliente): VariablePlantilla[] {
  if (!plantilla) return [];
  const usadas = new Set<VariablePlantilla>();
  const re = /\{(\w+)\}/g;
  let match;
  while ((match = re.exec(plantilla)) !== null) {
    const varName = match[1];
    if ((VARIABLES_PLANTILLA as readonly string[]).includes(varName)) {
      usadas.add(varName as VariablePlantilla);
    }
  }

  const enFallback: VariablePlantilla[] = [];
  for (const v of usadas) {
    switch (v) {
      case 'nombre':
        if (!cliente.nombre || !cliente.nombre.trim()) enFallback.push(v);
        break;
      case 'telefono':
        if (!cliente.telefono) enFallback.push(v);
        break;
      case 'ultimoServicio':
      case 'mesesUltimoServicio':
        if (mesesDesdeUltimoServicio(cliente) === null) enFallback.push(v);
        break;
      case 'equipoTipo':
        if (!cliente.legacyMetricas?.equiposAtendidos) enFallback.push(v);
        break;
      case 'zona':
        if (!cliente.zona) enFallback.push(v);
        break;
    }
  }
  return enFallback;
}
