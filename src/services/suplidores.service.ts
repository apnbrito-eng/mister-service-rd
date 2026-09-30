import { collection, doc, getDoc, onSnapshot, runTransaction, serverTimestamp, type Unsubscribe } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { validarSuplidor, type EstadoChatEmpresa, type Suplidor, type SuplidorEntrada } from '../utils/consultaSuplidor';

/**
 * Directorio compartido de suplidores (colección `suplidores`).
 * La colección necesita la regla propuesta en docs/qa/propuesta-suplidores/;
 * mientras no se publique, Firestore la bloquea por default-deny y aquí se
 * devuelve un mensaje claro en vez de fallar en silencio.
 */
const COL = 'suplidores';
const MENSAJE_REGLA = 'El directorio de suplidores todavía no está habilitado en el servidor (falta publicar su regla). No se guardó nada.';

const esPermiso = (e: unknown) => typeof e === 'object' && e !== null && (e as { code?: string }).code === 'permission-denied';

export function parsearSuplidor(id: string, d: Record<string, unknown>): Suplidor {
  const texto = (v: unknown) => (typeof v === 'string' ? v : '');
  return {
    id,
    nombre: texto(d.nombre),
    telefono: texto(d.telefono),
    telefonoNormalizado: texto(d.telefonoNormalizado),
    especialidad: texto(d.especialidad),
    notas: texto(d.notas),
    activo: d.activo !== false,
  };
}

export function suscribirSuplidores(onDatos: (lista: Suplidor[]) => void, onError: (mensaje: string) => void): Unsubscribe {
  return onSnapshot(collection(db, COL),
    snap => onDatos(snap.docs.map(d => parsearSuplidor(d.id, d.data()))),
    err => onError(esPermiso(err) ? 'El directorio de suplidores todavía no está habilitado en el servidor (falta publicar su regla).' : 'No se pudo cargar el directorio de suplidores.'));
}

function actor(): string {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Inicia sesión para modificar el directorio.');
  return uid;
}

/**
 * Crea o actualiza. El ID del documento es el teléfono normalizado: un mismo
 * número no puede quedar registrado dos veces (dos usuarios a la vez tampoco).
 */
export async function guardarSuplidor(entrada: SuplidorEntrada, idActual?: string): Promise<string> {
  const uid = actor();
  const v = validarSuplidor(entrada);
  if (!v.ok) throw new Error(v.error);
  const id = v.datos.telefonoNormalizado;
  if (idActual && idActual !== id) throw new Error('Para cambiar el teléfono, desactiva este suplidor y registra uno nuevo. Así se conserva el historial.');
  const ref = doc(db, COL, id);
  const ahora = serverTimestamp();
  try {
    await runTransaction(db, async tx => {
      const actual = await tx.get(ref);
      if (actual.exists()) {
        if (!idActual) throw new Error(`Ese teléfono ya está registrado como "${String(actual.data().nombre || '')}".`);
        tx.update(ref, { ...v.datos, activo: true, actualizadoPor: uid, updatedAt: ahora });
      } else {
        if (idActual) throw new Error('El suplidor ya no existe. Recarga la pantalla.');
        tx.set(ref, { ...v.datos, activo: true, creadoPor: uid, actualizadoPor: uid, createdAt: ahora, updatedAt: ahora });
      }
    });
  } catch (e) {
    if (esPermiso(e)) throw new Error(MENSAJE_REGLA);
    throw e;
  }
  return id;
}

/** Baja lógica: nunca se borra, para conservar el historial. */
export async function cambiarActivoSuplidor(id: string, activo: boolean): Promise<void> {
  const uid = actor();
  const ref = doc(db, COL, id);
  try {
    await runTransaction(db, async tx => {
      const actual = await tx.get(ref);
      if (!actual.exists()) throw new Error('El suplidor ya no existe.');
      tx.update(ref, { activo, actualizadoPor: uid, updatedAt: serverTimestamp() });
    });
  } catch (e) {
    if (esPermiso(e)) throw new Error(MENSAJE_REGLA);
    throw e;
  }
}

/** Solo lectura: nunca crea ni modifica la conversación. */
export async function leerEstadoChatEmpresa(numero: string): Promise<EstadoChatEmpresa> {
  const snap = await getDoc(doc(db, 'whatsapp_conversaciones', numero));
  if (!snap.exists()) return { existe: false, ventanaAbierta: false };
  const d = snap.data();
  const v = d.ventana24h as { abierta?: boolean; cierraEn?: { toMillis?: () => number } | Date } | undefined;
  const cierra = v?.cierraEn instanceof Date ? v.cierraEn.getTime() : v?.cierraEn?.toMillis?.() ?? 0;
  return {
    existe: true,
    clienteId: typeof d.clienteId === 'string' && d.clienteId ? d.clienteId : undefined,
    ventanaAbierta: v?.abierta === true && cierra > Date.now(),
  };
}
