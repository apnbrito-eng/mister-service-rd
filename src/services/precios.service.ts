import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { ServicioPrecio } from '../types';

/**
 * Busca un servicio de mantenimiento en el catálogo `precios_servicios`
 * por marca + equipo + categoria='Mantenimiento'. Devuelve el primero que
 * matchee o null si no encuentra.
 *
 * No usa índice compuesto: filtra client-side tras un único `where`.
 */
export async function buscarPrecioMantenimiento(
  marca: string | undefined,
  equipoTipo: string | undefined,
): Promise<ServicioPrecio | null> {
  if (!equipoTipo) return null;
  try {
    const snap = await getDocs(query(
      collection(db, 'precios_servicios'),
      where('categoria', '==', 'Mantenimiento'),
    ));
    const items = snap.docs.map(d => {
      const raw = d.data();
      return {
        id: d.id,
        marca: raw.marca || '',
        categoria: raw.categoria || '',
        equipoTipo: raw.equipoTipo || '',
        nombre: raw.nombre || '',
        precio: raw.precio || 0,
        activo: raw.activo !== false,
        createdAt: raw.createdAt?.toDate?.() || new Date(),
        notas: raw.notas,
      } as ServicioPrecio;
    });

    const eqLower = equipoTipo.toLowerCase().trim();
    const marcaLower = (marca || '').toLowerCase().trim();

    // 1) Match exacto marca + equipo
    if (marcaLower) {
      const exact = items.find(s =>
        s.activo &&
        s.marca.toLowerCase().trim() === marcaLower &&
        s.equipoTipo.toLowerCase().trim() === eqLower
      );
      if (exact) return exact;
    }

    // 2) Match por equipo + marca 'Genérico'
    const generico = items.find(s =>
      s.activo &&
      s.marca.toLowerCase().trim() === 'genérico' &&
      s.equipoTipo.toLowerCase().trim() === eqLower
    );
    if (generico) return generico;

    // 3) Match por equipo solamente (cualquier marca)
    const porEquipo = items.find(s =>
      s.activo && s.equipoTipo.toLowerCase().trim() === eqLower
    );
    return porEquipo || null;
  } catch (err) {
    console.error('Error buscando precio de mantenimiento:', err);
    return null;
  }
}
