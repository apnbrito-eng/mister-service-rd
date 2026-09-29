/** Fecha histórica verificable; nunca sustituye un dato ausente por hoy. */
export function fechaFinanciera(valor: unknown): Date | null {
  try {
    let fecha: Date;
    if (valor instanceof Date) fecha = new Date(valor.getTime());
    else if (valor && typeof valor === 'object' && 'toDate' in valor && typeof valor.toDate === 'function') {
      const convertida: unknown = valor.toDate();
      if (!(convertida instanceof Date)) return null;
      fecha = new Date(convertida.getTime());
    } else if (typeof valor === 'string') {
      // Solo ISO inequívoco. Rechazar días imposibles, no normalizar 30 de febrero.
      const partes = /^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.exec(valor);
      if (!partes) return null;
      const [anio, mes, dia] = partes.slice(1, 4).map(Number);
      if (mes < 1 || mes > 12 || dia < 1 || dia > new Date(Date.UTC(anio, mes, 0)).getUTCDate()) return null;
      if (valor.length > 10 && (Number(valor.slice(11, 13)) > 23 || Number(valor.slice(14, 16)) > 59 || Number(valor.slice(17, 19)) > 59)) return null;
      fecha = new Date(valor.length === 10 ? `${valor}T00:00:00-04:00` : valor);
    } else return null;
    return Number.isFinite(fecha.getTime()) ? fecha : null;
  } catch { return null; }
}
