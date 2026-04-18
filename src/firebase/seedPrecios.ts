import { collection, addDoc, doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from './config';

interface SeedItem {
  marca: string;
  categoria: string;
  equipoTipo: string;
  nombre: string;
  precio: number;
}

// ─── WHIRLPOOL ───────────────────────────────────────────────────────────────
const WHIRLPOOL: Omit<SeedItem, 'marca'>[] = [
  // Reparación / Cambios — Lavadora torre o individual
  { categoria: 'Reparación', equipoTipo: 'Lavadora', nombre: 'Cambio de actuador', precio: 8500 },
  { categoria: 'Reparación', equipoTipo: 'Lavadora', nombre: 'Válvula de entrada', precio: 7500 },
  { categoria: 'Reparación', equipoTipo: 'Lavadora', nombre: 'Válvula de salida', precio: 8500 },
  { categoria: 'Reparación', equipoTipo: 'Lavadora', nombre: 'Cambio de bomba de desagüe (individual)', precio: 7500 },
  { categoria: 'Reparación', equipoTipo: 'Lavadora', nombre: 'Cambio de transmisión torre vieja', precio: 14500 },
  { categoria: 'Reparación', equipoTipo: 'Lavadora', nombre: 'Cambio de transmisión torre nueva/moderna', precio: 17500 },
  { categoria: 'Reparación', equipoTipo: 'Lavadora', nombre: 'Cambio de transmisión individual', precio: 10500 },
  { categoria: 'Reparación', equipoTipo: 'Lavadora', nombre: 'Cambio de ramal', precio: 7500 },
  { categoria: 'Reparación', equipoTipo: 'Lavadora', nombre: 'Switch de la puerta', precio: 7500 },
  { categoria: 'Reparación', equipoTipo: 'Lavadora', nombre: 'Timer torre', precio: 12500 },
  { categoria: 'Reparación', equipoTipo: 'Lavadora', nombre: 'Timer individual', precio: 8500 },
  { categoria: 'Reparación', equipoTipo: 'Secadora', nombre: 'Cambio correa de secadora', precio: 5500 },
  { categoria: 'Reparación', equipoTipo: 'Lavadora', nombre: 'Cambio correa de lavadora', precio: 5500 },
  { categoria: 'Reparación', equipoTipo: 'Lavadora', nombre: 'Soportes individual', precio: 8500 },
  { categoria: 'Reparación', equipoTipo: 'Lavadora', nombre: 'Soportes torre', precio: 12500 },
  { categoria: 'Reparación', equipoTipo: 'Lavadora', nombre: 'Cambio de tanque (torre o individual)', precio: 7000 },
  { categoria: 'Conversión', equipoTipo: 'Estufa', nombre: 'Conversión gas natural a GLP', precio: 6500 },
  { categoria: 'Mantenimiento', equipoTipo: 'Lavadora', nombre: 'Mantenimiento lavadora individual', precio: 4500 },
  { categoria: 'Mantenimiento', equipoTipo: 'Lavadora', nombre: 'Mantenimiento completo lavadora torre', precio: 7500 },
  { categoria: 'Reparación', equipoTipo: 'Lavadora', nombre: 'Cambio de presostato', precio: 8500 },
  { categoria: 'Reparación', equipoTipo: 'Lavadora', nombre: 'Cambio sensores del motor del clutch', precio: 8500 },
  { categoria: 'Reparación', equipoTipo: 'Lavadora', nombre: 'Cambio de agitador', precio: 9000 },
  { categoria: 'Reparación', equipoTipo: 'Secadora', nombre: 'Sensor de temperatura de secadora', precio: 7500 },
  { categoria: 'Reparación', equipoTipo: 'Secadora', nombre: 'Servicio de cambio de ducto', precio: 3500 },
  { categoria: 'Reparación', equipoTipo: 'Secadora', nombre: 'Cambio de ducto', precio: 2500 },
  { categoria: 'Reparación', equipoTipo: 'Lavadora', nombre: 'Reparación tarjeta lavadora o secadora', precio: 7500 },
  { categoria: 'Instalación', equipoTipo: 'Lavadora', nombre: 'Instalación de lavadora torre', precio: 6500 },
  { categoria: 'Instalación', equipoTipo: 'Lavadora', nombre: 'Instalación lavadora individual', precio: 3500 },
  { categoria: 'Instalación', equipoTipo: 'Secadora', nombre: 'Instalación secadora individual', precio: 3500 },
  { categoria: 'Reparación', equipoTipo: 'Estufa', nombre: 'Cambio de magneto', precio: 8500 },
  { categoria: 'Reparación', equipoTipo: 'Estufa', nombre: 'Cambio de ignitor', precio: 8500 },
  { categoria: 'Reparación', equipoTipo: 'Lavadora', nombre: 'Cambio de capacitor', precio: 7500 },
  { categoria: 'Reparación', equipoTipo: 'Lavadora', nombre: 'Cambio base lavadora', precio: 5500 },
  { categoria: 'Reparación', equipoTipo: 'Secadora', nombre: 'Cambio válvula de gas a secadora', precio: 8500 },
  { categoria: 'Reparación', equipoTipo: 'Lavadora', nombre: 'Cambio de cajón lavadora o secadora', precio: 8500 },
  { categoria: 'Reparación', equipoTipo: 'Lavadora', nombre: 'Cambio de motor a lavadora', precio: 9500 },
  { categoria: 'Reparación', equipoTipo: 'Lavadora', nombre: 'Cambio de coil kit a lavadora', precio: 6500 },
  { categoria: 'Reparación', equipoTipo: 'Lavadora', nombre: 'Cambio perros del agitador', precio: 3500 },
  { categoria: 'Reparación', equipoTipo: 'Lavadora', nombre: 'Cambio de uñitas', precio: 3500 },
  { categoria: 'Reparación', equipoTipo: 'Secadora', nombre: 'Cambio sensor de flama a secadora', precio: 6500 },
  { categoria: 'Reparación', equipoTipo: 'Lavadora', nombre: 'Cambio de felpa a lavadora', precio: 5500 },
  { categoria: 'Reparación', equipoTipo: 'Lavadora', nombre: 'Cambio nivel de agua lavadora torre', precio: 9500 },
];

// ─── MABE = Whirlpool con 3 overrides ────────────────────────────────────────
const MABE_OVERRIDES: Record<string, number> = {
  'Cambio de transmisión torre vieja': 23500,
  'Cambio de transmisión torre nueva/moderna': 23500,
  'Cambio de ramal': 12500,
  'Timer torre': 14500,
};
const MABE: Omit<SeedItem, 'marca'>[] = WHIRLPOOL.map(item => ({
  ...item,
  precio: MABE_OVERRIDES[item.nombre] ?? item.precio,
}));

// ─── FRIGIDAIRE (subset) ─────────────────────────────────────────────────────
const FRIGIDAIRE: Omit<SeedItem, 'marca'>[] = [
  { categoria: 'Reparación', equipoTipo: 'Lavadora', nombre: 'Cambio de actuador', precio: 8500 },
  { categoria: 'Reparación', equipoTipo: 'Lavadora', nombre: 'Válvula de entrada', precio: 7500 },
  { categoria: 'Reparación', equipoTipo: 'Lavadora', nombre: 'Válvula de salida', precio: 8500 },
  { categoria: 'Reparación', equipoTipo: 'Lavadora', nombre: 'Cambio de bomba de desagüe individual', precio: 8500 },
  { categoria: 'Reparación', equipoTipo: 'Lavadora', nombre: 'Cambio de transmisión torre', precio: 17500 },
  { categoria: 'Reparación', equipoTipo: 'Lavadora', nombre: 'Ramal', precio: 8500 },
  { categoria: 'Reparación', equipoTipo: 'Lavadora', nombre: 'Switch', precio: 7500 },
  { categoria: 'Reparación', equipoTipo: 'Lavadora', nombre: 'Timer', precio: 12500 },
  { categoria: 'Reparación', equipoTipo: 'Lavadora', nombre: 'Cambio correa lavadora', precio: 7500 },
  { categoria: 'Reparación', equipoTipo: 'Secadora', nombre: 'Cambio correa secadora', precio: 5500 },
  { categoria: 'Reparación', equipoTipo: 'Lavadora', nombre: 'Soportes individual', precio: 8500 },
  { categoria: 'Reparación', equipoTipo: 'Lavadora', nombre: 'Cambio de tanque', precio: 7500 },
  { categoria: 'Conversión', equipoTipo: 'Estufa', nombre: 'Conversión gas natural a GLP', precio: 8500 },
  { categoria: 'Reparación', equipoTipo: 'Lavadora', nombre: 'Cambio de presostato', precio: 8500 },
  { categoria: 'Mantenimiento', equipoTipo: 'Lavadora', nombre: 'Mantenimiento completo', precio: 4500 },
  { categoria: 'Reparación', equipoTipo: 'Lavadora', nombre: 'Cambio sensor motor clutch', precio: 8500 },
  { categoria: 'Reparación', equipoTipo: 'Lavadora', nombre: 'Cambio de agitador', precio: 8000 },
  { categoria: 'Reparación', equipoTipo: 'Lavadora', nombre: 'Sensor temperatura lavadora', precio: 3500 },
  { categoria: 'Reparación', equipoTipo: 'Secadora', nombre: 'Servicio cambio de ducto', precio: 2500 },
];

// ─── GENERAL ELECTRIC (subset) ───────────────────────────────────────────────
const GENERAL_ELECTRIC: Omit<SeedItem, 'marca'>[] = [
  { categoria: 'Reparación', equipoTipo: 'Lavadora', nombre: 'Cambio de actuador', precio: 8500 },
  { categoria: 'Reparación', equipoTipo: 'Lavadora', nombre: 'Válvula de entrada', precio: 7500 },
  { categoria: 'Reparación', equipoTipo: 'Lavadora', nombre: 'Válvula de salida', precio: 8500 },
  { categoria: 'Reparación', equipoTipo: 'Lavadora', nombre: 'Cambio bomba desagüe individual', precio: 8500 },
  { categoria: 'Reparación', equipoTipo: 'Lavadora', nombre: 'Cambio transmisión General', precio: 23500 },
  { categoria: 'Reparación', equipoTipo: 'Lavadora', nombre: 'Ramal', precio: 8500 },
  { categoria: 'Reparación', equipoTipo: 'Lavadora', nombre: 'Switch', precio: 7500 },
  { categoria: 'Reparación', equipoTipo: 'Lavadora', nombre: 'Timer', precio: 14500 },
  { categoria: 'Reparación', equipoTipo: 'Lavadora', nombre: 'Cambio correa lavadora', precio: 7500 },
  { categoria: 'Reparación', equipoTipo: 'Secadora', nombre: 'Cambio correa secadora', precio: 5500 },
  { categoria: 'Reparación', equipoTipo: 'Lavadora', nombre: 'Soporte individual', precio: 9500 },
  { categoria: 'Conversión', equipoTipo: 'Estufa', nombre: 'Conversión gas natural a GLP', precio: 6500 },
  { categoria: 'Mantenimiento', equipoTipo: 'Lavadora', nombre: 'Mantenimiento completo', precio: 7500 },
  { categoria: 'Reparación', equipoTipo: 'Lavadora', nombre: 'Cambio presostato', precio: 8500 },
  { categoria: 'Reparación', equipoTipo: 'Lavadora', nombre: 'Cambio sensores motor clutch', precio: 9000 },
  { categoria: 'Reparación', equipoTipo: 'Lavadora', nombre: 'Cambio agitador', precio: 8000 },
  { categoria: 'Reparación', equipoTipo: 'Lavadora', nombre: 'Cambio sensor temperatura', precio: 8500 },
  { categoria: 'Reparación', equipoTipo: 'Secadora', nombre: 'Servicio cambio ducto', precio: 3500 },
  { categoria: 'Reparación', equipoTipo: 'Secadora', nombre: 'Cambio ducto', precio: 2500 },
];

// ─── GENÉRICOS por tipo de equipo ────────────────────────────────────────────
const ESTUFAS: Omit<SeedItem, 'marca'>[] = [
  { categoria: 'Mantenimiento', equipoTipo: 'Estufa', nombre: 'Mantenimiento estufas tradicionales', precio: 3500 },
  { categoria: 'Mantenimiento', equipoTipo: 'Estufa', nombre: 'Mantenimiento estufas empotradas', precio: 2500 },
  { categoria: 'Mantenimiento', equipoTipo: 'Estufa', nombre: 'Mantenimiento hornillas', precio: 2500 },
  { categoria: 'Mantenimiento', equipoTipo: 'Estufa', nombre: 'Mantenimiento estufas industriales', precio: 6500 },
  { categoria: 'Mantenimiento', equipoTipo: 'Estufa', nombre: 'Mantenimiento estufas industriales grandes', precio: 7500 },
];

const AIRES: Omit<SeedItem, 'marca'>[] = [
  { categoria: 'Mantenimiento', equipoTipo: 'Aire', nombre: 'Mantenimiento aires 12,000 BTU', precio: 2000 },
  { categoria: 'Mantenimiento', equipoTipo: 'Aire', nombre: 'Mantenimiento aires 18,000 BTU', precio: 2500 },
  { categoria: 'Mantenimiento', equipoTipo: 'Aire', nombre: 'Mantenimiento aires 24,000 BTU', precio: 3000 },
  { categoria: 'Mantenimiento', equipoTipo: 'Aire', nombre: 'Mantenimiento aires 36,000 BTU', precio: 3500 },
  { categoria: 'Mantenimiento', equipoTipo: 'Aire', nombre: 'Mantenimiento suministros de gas', precio: 2000 },
];

const EXTRACTORES: Omit<SeedItem, 'marca'>[] = [
  { categoria: 'Mantenimiento', equipoTipo: 'Extractor', nombre: 'Mantenimiento extractor industrial', precio: 5500 },
  { categoria: 'Mantenimiento', equipoTipo: 'Extractor', nombre: 'Mantenimiento extractor básico', precio: 3500 },
];

const MANTENIMIENTOS_GENERICOS: Omit<SeedItem, 'marca'>[] = [
  { categoria: 'Mantenimiento', equipoTipo: 'Lavadora', nombre: 'Mantenimiento lavadora individual (genérico)', precio: 4500 },
  { categoria: 'Mantenimiento', equipoTipo: 'Secadora', nombre: 'Mantenimiento secadora individual (genérico)', precio: 3500 },
];

const CHEQUEO: Omit<SeedItem, 'marca'>[] = [
  { categoria: 'Otro', equipoTipo: 'Otro', nombre: 'Chequeo', precio: 2000 },
];

function buildAllItems(): SeedItem[] {
  const items: SeedItem[] = [];
  WHIRLPOOL.forEach(i => items.push({ marca: 'Whirlpool', ...i }));
  MABE.forEach(i => items.push({ marca: 'Mabe', ...i }));
  FRIGIDAIRE.forEach(i => items.push({ marca: 'Frigidaire', ...i }));
  GENERAL_ELECTRIC.forEach(i => items.push({ marca: 'General Electric', ...i }));
  ESTUFAS.forEach(i => items.push({ marca: 'Genérico', ...i }));
  AIRES.forEach(i => items.push({ marca: 'Genérico', ...i }));
  EXTRACTORES.forEach(i => items.push({ marca: 'Genérico', ...i }));
  MANTENIMIENTOS_GENERICOS.forEach(i => items.push({ marca: 'Genérico', ...i }));
  CHEQUEO.forEach(i => items.push({ marca: 'Genérico', ...i }));
  return items;
}

/**
 * Inserta el catálogo inicial de precios de servicios en Firestore.
 * Idempotente vía flag config/sistema.preciosInicializados.
 */
export async function seedPrecios(): Promise<void> {
  const flagRef = doc(db, 'config', 'sistema');
  const flagSnap = await getDoc(flagRef);
  if (flagSnap.exists() && flagSnap.data()?.preciosInicializados === true) {
    return;
  }

  const items = buildAllItems();
  const ahora = Timestamp.now();
  // Insertar en serie para evitar saturar Firestore (no es bloqueante crítico)
  for (const item of items) {
    try {
      await addDoc(collection(db, 'precios_servicios'), {
        marca: item.marca,
        categoria: item.categoria,
        equipoTipo: item.equipoTipo,
        nombre: item.nombre,
        precio: item.precio,
        activo: true,
        createdAt: ahora,
      });
    } catch (err) {
      console.error('Error insertando precio:', item, err);
    }
  }
  await setDoc(flagRef, { preciosInicializados: true }, { merge: true });
}

/** Conteo total de items que se insertarían (útil para validación) */
export const TOTAL_PRECIOS_SEED = buildAllItems().length;
