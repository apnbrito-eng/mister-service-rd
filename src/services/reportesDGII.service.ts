import { collection, getDocs, query, where, Timestamp, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Factura, Cliente } from '../types';

/**
 * Formato 607 (Ventas) — DGII República Dominicana
 *
 * Campos (separados por pipe `|`):
 * 1.  RNC o Cédula
 * 2.  Tipo de Identificación (1=RNC, 2=Cédula, 3=Pasaporte)
 * 3.  Número de Comprobante Fiscal (NCF) — si no, vacío
 * 4.  Número NCF Modificado — vacío
 * 5.  Tipo de Ingreso (01=Ingresos Operacionales)
 * 6.  Fecha del Comprobante (AAAAMMDD)
 * 7.  Fecha de Retención (AAAAMMDD o vacío)
 * 8.  Monto Facturado
 * 9.  ITBIS Facturado
 * 10. ITBIS Retenido por Terceros
 * 11. ITBIS Percibido
 * 12. Retención de Renta por Terceros
 * 13. ISR Percibido
 * 14. Impuesto Selectivo al Consumo
 * 15. Otros Impuestos/Tasas
 * 16. Monto Propina Legal
 * 17. Forma de Pago (1=Efectivo, 2=Cheque/Transferencia, 3=Tarjeta, 4=Venta Crédito, 5=Bonos/Regalo, 6=Permuta, 7=Otras)
 */

interface Linea607 {
  rncCedula: string;
  tipoId: '1' | '2' | '3' | '';
  ncf: string;
  tipoIngreso: string;
  fechaComprobante: string;
  fechaRetencion: string;
  montoFacturado: string;
  itbisFacturado: string;
  formaPago: string;
}

function formatFechaDGII(fecha: Date): string {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function normalizarRncCedula(valor: string | undefined): string {
  if (!valor) return '';
  return valor.replace(/[-\s]/g, '').trim();
}

function mapearFormaPago(metodo: string | undefined): string {
  switch (metodo) {
    case 'efectivo': return '01';
    case 'transferencia': return '02';
    case 'tarjeta': return '03';
    default: return '01';
  }
}

/**
 * Lee las facturas del mes/año indicados y arma las líneas del formato 607.
 * Devuelve también un resumen para mostrar en UI antes de descargar.
 */
export async function generarFormato607(
  year: number,
  month: number,   // 1-12
): Promise<{
  lineas: Linea607[];
  totalFacturas: number;
  totalMonto: number;
  totalITBIS: number;
  sinIdentificacion: number;
}> {
  const inicio = new Date(year, month - 1, 1, 0, 0, 0);
  const fin = new Date(year, month, 0, 23, 59, 59);

  const snap = await getDocs(query(
    collection(db, 'facturas'),
    where('fechaEmision', '>=', Timestamp.fromDate(inicio)),
    where('fechaEmision', '<=', Timestamp.fromDate(fin)),
  ));

  // Cargar clientes para resolver rnc/cedula
  const clienteIds = new Set<string>();
  snap.docs.forEach(d => {
    const c = d.data().clienteId as string | undefined;
    if (c) clienteIds.add(c);
  });
  const clientes: Record<string, Cliente> = {};
  await Promise.all(Array.from(clienteIds).map(async id => {
    try {
      const cSnap = await getDoc(doc(db, 'clientes', id));
      if (cSnap.exists()) {
        clientes[id] = { id: cSnap.id, ...cSnap.data() } as Cliente;
      }
    } catch (err) {
      console.warn('No se pudo leer cliente', id, err);
    }
  }));

  const lineas: Linea607[] = [];
  let totalMonto = 0;
  let totalITBIS = 0;
  let sinIdentificacion = 0;

  snap.docs.forEach(d => {
    const raw = d.data() as Factura;
    // Saltar facturas anuladas
    if (raw.estado === 'anulada') return;

    const cliente = raw.clienteId ? clientes[raw.clienteId] : undefined;
    const rnc = normalizarRncCedula(cliente?.rnc);
    const cedula = normalizarRncCedula(cliente?.cedula);

    let rncCedula = '';
    let tipoId: '1' | '2' | '3' | '' = '';
    if (rnc) {
      rncCedula = rnc;
      tipoId = '1';
    } else if (cedula) {
      rncCedula = cedula;
      tipoId = '2';
    } else {
      sinIdentificacion++;
    }

    const fechaEmision = (raw.fechaEmision as unknown as { toDate?: () => Date }).toDate?.() || new Date();
    const total = Number(raw.total) || 0;
    const itbis = Number(raw.itbisMonto) || 0;

    lineas.push({
      rncCedula,
      tipoId,
      ncf: raw.numero || '',
      tipoIngreso: '01',
      fechaComprobante: formatFechaDGII(fechaEmision),
      fechaRetencion: '',
      montoFacturado: total.toFixed(2),
      itbisFacturado: itbis.toFixed(2),
      formaPago: mapearFormaPago(raw.metodoPago),
    });

    totalMonto += total;
    totalITBIS += itbis;
  });

  return {
    lineas,
    totalFacturas: lineas.length,
    totalMonto,
    totalITBIS,
    sinIdentificacion,
  };
}

/**
 * Convierte las líneas a texto TXT pipe-delimited que se sube a la DGII.
 */
export function lineas607ATexto(lineas: Linea607[]): string {
  return lineas
    .map(l => [
      l.rncCedula,
      l.tipoId,
      l.ncf,
      '', // NCF modificado
      l.tipoIngreso,
      l.fechaComprobante,
      l.fechaRetencion,
      l.montoFacturado,
      l.itbisFacturado,
      '0.00', // ITBIS Retenido por Terceros
      '0.00', // ITBIS Percibido
      '0.00', // Retención Renta por Terceros
      '0.00', // ISR Percibido
      '0.00', // ISC
      '0.00', // Otros impuestos/tasas
      '0.00', // Propina legal
      l.formaPago,
    ].join('|'))
    .join('\n');
}

/**
 * Descarga el archivo TXT 607 en el navegador con el nombre estándar
 * DGII_607_AAAAMM.txt
 */
export function descargarFormato607(year: number, month: number, texto: string): void {
  const ym = `${year}${String(month).padStart(2, '0')}`;
  const rncEmpresa = '';  // se puede parametrizar desde configFiscal después
  const filename = rncEmpresa
    ? `DGII_F_607_${rncEmpresa}_${ym}.txt`
    : `DGII_F_607_${ym}.txt`;
  const blob = new Blob([texto], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
