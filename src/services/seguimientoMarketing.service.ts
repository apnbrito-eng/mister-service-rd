import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import type { DocCrudo, Rango } from '../utils/seguimientoMarketing';

/**
 * Lecturas puntuales (sin listeners) para el seguimiento de marketing.
 * Lectura completa para conservar fechas ISO legacy y detectar ausentes; filtra localmente.
 * Límite de escala: descarga colecciones completas por cálculo, no usar como consulta paginada.
 * Respeta las reglas actuales: órdenes y conversaciones (staff de oficina),
 * campañas (administración y coordinación).
 */
const crudo = (d: { id: string; data: () => Record<string, unknown> }): DocCrudo => ({ id: d.id, datos: d.data() });

/** null = no se pudo leer (permiso o red): la UI muestra "sin datos", nunca cero. */
export interface DatosSeguimiento { ordenes: DocCrudo[] | null; conversaciones: DocCrudo[] | null; campanas: DocCrudo[] | null; errores: string[] }

export async function cargarDatosSeguimiento(rango: Rango): Promise<DatosSeguimiento> {
  if (!Number.isFinite(rango.desde.getTime()) || !Number.isFinite(rango.hasta.getTime()) || rango.desde > rango.hasta) throw new Error('Rango inválido.');
  const errores: string[] = [];
  const intentar = async (nombre: string, q: Parameters<typeof getDocs>[0]) => {
    try { return (await getDocs(q)).docs.map(d => crudo(d as unknown as { id: string; data: () => Record<string, unknown> })); }
    catch { errores.push(`No se pudo leer ${nombre}. Esa sección queda sin datos (no se muestra como cero).`); return null; }
  };
  const [ordenes, conversaciones, campanas] = await Promise.all([
    intentar('órdenes', collection(db, 'ordenes_servicio')),
    intentar('consultas desde anuncios', collection(db, 'whatsapp_conversaciones')),
    intentar('campañas de reactivación', collection(db, 'campanas_marketing')),
  ]);
  return { ordenes, conversaciones, campanas, errores };
}
