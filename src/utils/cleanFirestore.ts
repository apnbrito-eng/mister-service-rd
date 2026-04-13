import { collection, getDocs, deleteDoc, doc, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';

const COLECCIONES = [
  'clientes',
  'ordenes_servicio',
  'personal',
  'cotizaciones',
  'facturas',
  'productos',
  'standby_piezas',
  'equipos_taller',
  'gastos',
  'citas_por_confirmar',
  'mantenimiento',
  'config'
];

export async function limpiarFirestore() {
  console.log('🧹 Iniciando limpieza de Firestore...');
  for (const coleccion of COLECCIONES) {
    const snap = await getDocs(collection(db, coleccion));
    console.log(`Eliminando ${snap.size} docs de "${coleccion}"...`);
    for (const documento of snap.docs) {
      await deleteDoc(doc(db, coleccion, documento.id));
    }
    console.log(`✅ ${coleccion} limpia`);
  }
  console.log('🎉 Firestore limpio. Recarga la página para reinicializar.');
}

/** Borra la orden OS-0001 duplicada creada manualmente desde pruebas */
export async function limpiarOrdenDuplicada() {
  console.log('🔍 Buscando duplicados de OS-0001...');
  const q = query(
    collection(db, 'ordenes_servicio'),
    where('numero', '==', 'OS-0001')
  );
  const snap = await getDocs(q);

  if (snap.empty) {
    console.log('✅ No hay órdenes con número OS-0001.');
    return;
  }

  console.log(`Encontradas ${snap.size} órdenes con número OS-0001:`);
  snap.docs.forEach(d => {
    const data = d.data();
    console.log(`  - id: ${d.id} · creadoPor: "${data.creadoPor || '(sin autor)'}" · cliente: ${data.clienteNombre}`);
  });

  let borrados = 0;
  for (const documento of snap.docs) {
    const data = documento.data();
    const creadoPor = (data.creadoPor || '').toString().toLowerCase();
    // Criterio: borra los que tienen "misterservicerd" en creadoPor (las pruebas manuales)
    if (creadoPor.includes('misterservicerd')) {
      await deleteDoc(doc(db, 'ordenes_servicio', documento.id));
      console.log(`🗑️  Eliminado duplicado: ${documento.id} (creadoPor: "${data.creadoPor}")`);
      borrados++;
    } else {
      console.log(`✓  Conservado original: ${documento.id} (creadoPor: "${data.creadoPor}")`);
    }
  }

  console.log(`🎉 Limpieza completa. ${borrados} duplicados eliminados.`);
}
