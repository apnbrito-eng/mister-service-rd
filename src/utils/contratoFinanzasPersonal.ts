/** Pure preparation contract. It does not read/write Firestore or authorize access. */
export const VERSION_FINANZAS_PERSONAL = 1 as const;
export const CAMPOS_FINANZAS_PERSONAL = ['sueldoBase', 'comisionPorcentaje'] as const;
export type CampoFinanzasPersonal = typeof CAMPOS_FINANZAS_PERSONAL[number];
export type IdentidadFinanzasPersonal = { personalId: string; uid: string };
export type ContratoFinanzasPersonal = {
  versionFinanzas: typeof VERSION_FINANZAS_PERSONAL;
  personalId: string;
  uid: string;
  sueldoBase?: number;
  comisionPorcentaje?: number;
};
export class ErrorContratoFinanzasPersonal extends Error {}
function validarIdentidad(identidad: IdentidadFinanzasPersonal): void {
  for (const [campo, valor] of Object.entries(identidad)) {
    if (typeof valor !== 'string' || !valor || valor.trim() !== valor || valor.length > 128 || (valor.includes('/') || [...valor].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127))) throw new ErrorContratoFinanzasPersonal(`Identidad canónica inválida: ${campo}.`);
  }
  if (!identidad.personalId || !identidad.uid) throw new ErrorContratoFinanzasPersonal('Faltan Personal ID o UID canónico.');
}
function validarNumero(campo: CampoFinanzasPersonal, valor: unknown): number {
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor < 0 || (campo === 'comisionPorcentaje' && valor > 100)) throw new ErrorContratoFinanzasPersonal(`Valor inválido: ${campo}.`);
  return valor;
}
export function crearContratoFinanzasPersonal(identidad: IdentidadFinanzasPersonal, datos: Record<string, unknown>): ContratoFinanzasPersonal {
  validarIdentidad(identidad);
  const contrato: ContratoFinanzasPersonal = { versionFinanzas: VERSION_FINANZAS_PERSONAL, personalId: identidad.personalId, uid: identidad.uid };
  for (const campo of CAMPOS_FINANZAS_PERSONAL) {
    if (Object.prototype.hasOwnProperty.call(datos, campo)) contrato[campo] = validarNumero(campo, datos[campo]);
  }
  return contrato;
}
/** Explicitly rejects legacy/missing/mismatched contracts. No public fallback. */
export function leerContratoFinanzasPersonal(identidad: IdentidadFinanzasPersonal, privado: Record<string, unknown> | null | undefined): ContratoFinanzasPersonal {
  validarIdentidad(identidad);
  if (!privado || privado.versionFinanzas !== VERSION_FINANZAS_PERSONAL || privado.personalId !== identidad.personalId || privado.uid !== identidad.uid) throw new ErrorContratoFinanzasPersonal('Contrato financiero privado ausente o identidad incompatible.');
  return crearContratoFinanzasPersonal(identidad, privado);
}
/** Missing is not zero; callers must explicitly require the field they calculate. */
export function exigirValorFinanzasPersonal(contrato: ContratoFinanzasPersonal, campo: CampoFinanzasPersonal): number {
  validarIdentidad({ personalId: contrato.personalId, uid: contrato.uid });
  if (contrato.versionFinanzas !== VERSION_FINANZAS_PERSONAL) throw new ErrorContratoFinanzasPersonal('Versión financiera incompatible.');
  if (!Object.prototype.hasOwnProperty.call(contrato, campo)) throw new ErrorContratoFinanzasPersonal(`Falta configurar ${campo}.`);
  return validarNumero(campo, contrato[campo]);
}
/** Only partitions financial fields. Existing domicile/document partition stays required. */
export function particionarFinanzasPersonalNuevo(identidad: IdentidadFinanzasPersonal, datos: Record<string, unknown>): { publico: Record<string, unknown>; privado: ContratoFinanzasPersonal } {
  const privado = crearContratoFinanzasPersonal(identidad, datos);
  const publico = Object.fromEntries(Object.entries(datos).filter(([campo]) => !CAMPOS_FINANZAS_PERSONAL.includes(campo as CampoFinanzasPersonal)));
  return { publico, privado };
}
