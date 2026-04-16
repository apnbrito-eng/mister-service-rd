import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { CONFIG_WEB_DEFAULTS } from './configWeb.service';

/**
 * Crea config_web/sitio con los valores por defecto si no existe.
 * Se llama junto con seedDatabase() en App.tsx.
 */
export async function seedWebConfig(): Promise<void> {
  const ref = doc(db, 'config_web', 'sitio');
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) return; // Ya existe — no sobreescribir

    console.log('Creando configuración web por defecto...');
    await setDoc(ref, {
      ...CONFIG_WEB_DEFAULTS,
      updatedAt: Timestamp.now(),
    });
    console.log('✅ config_web/sitio creado con valores por defecto');
  } catch (err) {
    console.error('Error al crear config_web:', err);
  }
}
