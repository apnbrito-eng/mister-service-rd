import { describe, it, expect } from 'vitest';
import { Workbook } from 'exceljs';
import { extraerDocumento, fragmentarDocumento } from '../../src/services/documentosConocimiento';
import { validarDocumentoConocimiento } from '../../api/_lib/conocimiento';
describe('Documentos revisados para la IA', () => {
 it('conserva texto completo y limita fragmentos', () => {
  const t='Una fila de prueba con datos\n'.repeat(400);
  const f=fragmentarDocumento('Tarifario',t);
  expect(f.every(x=>x.contenido.length<=3500)).toBe(true);
  expect(f.map(x=>x.contenido).join('\n')).toBe(t.trim());
 });
 it('extrae un Excel real con fuente y sin hojas ocultas', async () => {
  const wb=new Workbook(); const ws=wb.addWorksheet('Servicios');ws.addRow(['Servicio','Precio']);ws.addRow(['Mantenimiento Mabe',4500]);
  const oculta=wb.addWorksheet('Privada',{state:'hidden'});oculta.addRow(['No importar']);
  const buffer=await wb.xlsx.writeBuffer();
  const file={name:'precios.xlsx',size:buffer.byteLength,arrayBuffer:async()=>buffer} as File;
  const r=await extraerDocumento(file);
  expect(r.fragmentos).toHaveLength(1);expect(r.fragmentos[0].contenido).toContain('4500');expect(r.fragmentos[0].contenido).not.toContain('No importar');expect(r.fragmentos[0].titulo).toContain('Servicios');
 });
 it('rechaza tamaño y formatos incompatibles antes de leer', async () => {
  await expect(extraerDocumento({name:'lista.xls',size:100} as File)).rejects.toThrow('.xlsx');
  await expect(extraerDocumento({name:'lista.pdf',size:6000000} as File)).rejects.toThrow('5 MB');
 });
 it('el servidor limita cantidad y tamaño independientemente del navegador', () => {
  expect(()=>validarDocumentoConocimiento({nombre:'a.xlsx',fragmentos:Array(31).fill({titulo:'Prueba',contenido:'a'})})).toThrow();
  expect(()=>validarDocumentoConocimiento({nombre:'a.xlsx',fragmentos:[{titulo:'Prueba',contenido:'a'.repeat(4001)}]})).toThrow();
  expect(validarDocumentoConocimiento({nombre:'a.xlsx',fragmentos:[{titulo:'Prueba',contenido:'Texto'}]}).fragmentos).toHaveLength(1);
 });
});
