export interface FragmentoDocumento { titulo: string; contenido: string }
export interface DocumentoExtraido { nombre: string; fragmentos: FragmentoDocumento[] }
export function fragmentarDocumento(titulo: string, texto: string): FragmentoDocumento[] {
  const limpio = texto.trim();
  if (!limpio) return [];
  const partes: FragmentoDocumento[] = [];
  let resto = limpio;
  while (resto.length) {
    let corte = Math.min(3500, resto.length);
    if (resto.length > corte) { const salto = resto.lastIndexOf('\n', corte); if (salto > 1000) corte = salto; }
    partes.push({ titulo: `${titulo.slice(0, 95)} · parte ${partes.length + 1}`, contenido: resto.slice(0, corte).trim() });
    resto = resto.slice(corte).trim();
  }
  return partes;
}
export async function extraerDocumento(file: File): Promise<DocumentoExtraido> {
  if (file.size > 5 * 1024 * 1024) throw new Error('Máximo 5 MB por documento. Divide el archivo antes de cargarlo.');
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!['pdf', 'xlsx'].includes(extension || '')) throw new Error('Selecciona un PDF con texto o Excel .xlsx. Convierte los archivos .xls a .xlsx.');
  const buffer = await file.arrayBuffer();
  const fragmentos: FragmentoDocumento[] = [];
  if (extension === 'pdf') {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
    const task = pdfjs.getDocument({ data: new Uint8Array(buffer), stopAtErrors: true });
    try {
      const pdf = await task.promise;
      if (pdf.numPages > 40) throw new Error('Máximo 40 páginas. Divide el PDF por temas.');
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const text = await page.getTextContent();
        const contenido = text.items.map(item => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('');
        if (contenido.trim().length < 20) throw new Error(`La página ${i} no tiene suficiente texto legible. Puede ser un escaneo: necesita reconocimiento de texto o revisión manual.`);
        fragmentos.push(...fragmentarDocumento(`${file.name} · pág. ${i}`, contenido));
      }
    } finally { await task.destroy(); }
  } else {
    const { Workbook } = await import('exceljs');
    const wb = new Workbook();
    await wb.xlsx.load(buffer);
    if (wb.worksheets.length > 20) throw new Error('Máximo 20 hojas por archivo. Divide el Excel.');
    for (const hoja of wb.worksheets) {
      if (hoja.state !== 'visible') continue;
      if (hoja.rowCount > 2000 || hoja.columnCount > 50) throw new Error('Máximo 2000 filas y 50 columnas por hoja. Divide el listado.');
      const filas: string[] = [];
      hoja.eachRow((row, numero) => {
        const celdas: string[] = [];
        row.eachCell((cell, col) => celdas.push(`${col}: ${cell.text}`));
        filas.push(`Fila ${numero} | ${celdas.join(' | ')}`);
      });
      fragmentos.push(...fragmentarDocumento(`${file.name} · ${hoja.name}`, filas.join('\n')));
    }
  }
  if (!fragmentos.length) throw new Error('No se encontró texto para incorporar.');
  if (fragmentos.length > 30) throw new Error('El documento supera 30 fragmentos. Divídelo por temas para poder revisarlo completo.');
  return { nombre: file.name.slice(0, 180), fragmentos };
}
