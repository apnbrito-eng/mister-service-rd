import { createHash } from 'node:crypto';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';

const normalizar = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\btore\b/g, 'torre');
/** Solo etiquetas de un vocabulario cerrado: nunca copia nombres, teléfonos ni mensajes. */
export function temaPregunta(texto: string): { id: string; titulo: string } | null {
  const t = normalizar(texto);
  const equipo = ['lavadora', 'nevera', 'secadora', 'estufa', 'aire acondicionado'].find(x => t.includes(x));
  if (!equipo) return null;
  const tipo = /\btorre\b/.test(t) ? 'torre' : /\bindividual\b/.test(t) ? 'individual' : '';
  const marca = ['whirlpool', 'mabe', 'samsung', 'lg', 'frigidaire', 'general electric'].find(x => new RegExp('\\b' + x + '\\b').test(t)) || '';
  const servicio = /mantenimiento/.test(t) ? 'mantenimiento' : /instalacion/.test(t) ? 'instalación' : /repar|arregl|falla|no enciende|no lava|no centrifuga|no desagua/.test(t) ? 'reparación y diagnóstico' : '';
  if (!servicio) return null;
  const titulo = [servicio, equipo, tipo, marca].filter(Boolean).join(' · ');
  return { id: createHash('sha256').update(titulo).digest('hex').slice(0, 32), titulo };
}
export async function registrarTemaPregunta(db: Firestore, texto: string, conversacionId: string) {
  const tema = temaPregunta(texto);
  if (!tema) return;
  const ref = db.collection('ia_preguntas_frecuentes').doc(tema.id);
  // Una conversación cuenta una vez por tema, aunque se reintente o se aclare la pregunta.
  const evento = db.collection('ia_memoria_eventos').doc(createHash('sha256').update(conversacionId + ':' + tema.id).digest('hex'));
  await db.runTransaction(async tx => {
    if ((await tx.get(evento)).exists) return;
    tx.set(ref, { titulo: tema.titulo, conversaciones: FieldValue.increment(1), actualizadoEn: FieldValue.serverTimestamp() }, { merge: true });
    tx.create(evento, { temaId: tema.id });
  });
}
export function seleccionarReferencias<T extends { titulo: string; contenido: string }>(items: T[], pregunta: string): T[] {
  const palabras = [...new Set(normalizar(pregunta).match(/[a-z]{4,}/g) || [])].filter(p => !['cuanto', 'cuesta', 'para', 'como', 'esta', 'tiene', 'precio'].includes(p));
  return items.map(item => ({ item, puntos: palabras.reduce((n, p) => n + (normalizar(item.titulo + ' ' + item.contenido).includes(p) ? 1 : 0), 0) }))
    .filter(x => x.puntos > 0).sort((a,b) => b.puntos - a.puntos).slice(0, 8).map(x => x.item);
}
