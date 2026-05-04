import { collection, query, where, getDocs, doc, setDoc, updateDoc, getDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Cliente, CitaPorConfirmar, DireccionCliente } from '../types';
import { inferirZona } from '../utils/zonas';

/** Normaliza teléfono a 10 dígitos locales de RD */
export function normalizarTelefono(tel: string): string {
  const soloDigitos = tel.replace(/\D/g, '');
  if (soloDigitos.length === 11 && soloDigitos.startsWith('1')) {
    return soloDigitos.substring(1);
  }
  return soloDigitos.slice(-10);
}

/** Formatea para mostrar: (809) 555-1234 */
export function formatearTelefono(tel: string): string {
  const norm = normalizarTelefono(tel);
  if (norm.length === 10) {
    return `(${norm.slice(0, 3)}) ${norm.slice(3, 6)}-${norm.slice(6)}`;
  }
  return tel;
}

/** Busca cliente por teléfono normalizado. Retorna id si existe, null si no. */
export async function buscarClientePorTelefono(telefono: string): Promise<{ id: string; data: Cliente } | null> {
  const telNorm = normalizarTelefono(telefono);
  if (telNorm.length < 7) return null;

  const q = query(
    collection(db, 'clientes'),
    where('telefonoNormalizado', '==', telNorm)
  );
  const snap = await getDocs(q);

  if (!snap.empty) {
    const d = snap.docs[0];
    return {
      id: d.id,
      data: { id: d.id, ...d.data() } as Cliente,
    };
  }
  return null;
}

/** Busca o crea cliente. NUNCA duplica por teléfono. Retorna clienteId. */
export async function buscarOCrearCliente(
  telefono: string,
  datos: {
    nombre: string;
    email?: string;
    direccion?: string;
    referenciaDireccion?: string;
    lat?: number;
    lng?: number;
  }
): Promise<string> {
  const telNorm = normalizarTelefono(telefono);

  // Buscar existente
  const existente = await buscarClientePorTelefono(telefono);
  if (existente) {
    // Actualizar datos que vengan nuevos (sin sobreescribir vacíos)
    const updates: Record<string, unknown> = { updatedAt: Timestamp.now() };
    if (datos.nombre) updates.nombre = datos.nombre;
    if (datos.email) updates.email = datos.email;
    if (datos.direccion) updates.direccion = datos.direccion;
    if (datos.referenciaDireccion) updates.referenciaDireccion = datos.referenciaDireccion;
    if (datos.lat) updates.lat = datos.lat;
    if (datos.lng) updates.lng = datos.lng;
    // Auto-inferir zona si no la tenía y ahora hay coords (o vienen nuevas).
    if (!existente.data.zona) {
      const latFinal = typeof datos.lat === 'number' ? datos.lat : existente.data.lat;
      const lngFinal = typeof datos.lng === 'number' ? datos.lng : existente.data.lng;
      const zonaInferida = inferirZona(latFinal, lngFinal);
      if (zonaInferida) updates.zona = zonaInferida;
    }
    await updateDoc(doc(db, 'clientes', existente.id), updates);
    return existente.id;
  }

  // Crear nuevo con teléfono normalizado como ID
  const clienteId = telNorm;
  const payload: Record<string, unknown> = {
    nombre: datos.nombre,
    telefono: telefono,
    telefonoNormalizado: telNorm,
    email: datos.email || '',
    direccion: datos.direccion || '',
    referenciaDireccion: datos.referenciaDireccion || '',
    lat: datos.lat || null,
    lng: datos.lng || null,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };
  const zonaInferidaNuevo = inferirZona(datos.lat, datos.lng);
  if (zonaInferidaNuevo) payload.zona = zonaInferidaNuevo;
  await setDoc(doc(db, 'clientes', clienteId), payload);
  return clienteId;
}

/** Valida que el teléfono no esté usado por otro cliente */
export async function validarClienteUnico(
  telefono: string,
  clienteIdActual?: string
): Promise<boolean> {
  const existente = await buscarClientePorTelefono(telefono);
  if (!existente) return true;
  return existente.id === clienteIdActual;
}

/**
 * Actualiza datos básicos del cliente (ficha global). Strip de undefined para Firestore.
 *
 * Auto-zona: si el caller NO especifica `zona` (i.e. `cambios.zona === undefined`)
 * y el cliente no tiene zona persistida, intenta inferirla desde lat/lng (los del
 * cambio si vienen, o los actuales del doc). Si el caller pasa `zona: ''` o
 * `zona: null` (borrado explícito) NO se auto-rellena — se respeta la decisión.
 */
export async function actualizarCliente(
  clienteId: string,
  cambios: Partial<Pick<Cliente, 'nombre' | 'email' | 'direccion' | 'referenciaDireccion' | 'lat' | 'lng' | 'sector' | 'ciudad' | 'zona' | 'rnc' | 'razonSocial' | 'cedula' | 'tipo'>>,
): Promise<void> {
  const updates: Record<string, unknown> = { updatedAt: Timestamp.now() };
  Object.entries(cambios).forEach(([k, v]) => {
    if (v === undefined) return;
    updates[k] = typeof v === 'string' ? v.trim() : v;
  });

  // Auto-inferir zona solo cuando el caller no la especifica y el cliente no la tiene.
  // Si vino zona explícita (incluido '' o null), respetamos la decisión del caller.
  if (!('zona' in cambios) || cambios.zona === undefined) {
    const snap = await getDoc(doc(db, 'clientes', clienteId));
    const actual = snap.data() as Partial<Cliente> | undefined;
    if (actual && !actual.zona) {
      const latFinal = typeof cambios.lat === 'number' ? cambios.lat : actual.lat;
      const lngFinal = typeof cambios.lng === 'number' ? cambios.lng : actual.lng;
      const zonaInferida = inferirZona(latFinal, lngFinal);
      if (zonaInferida) updates.zona = zonaInferida;
    }
  }

  await updateDoc(doc(db, 'clientes', clienteId), updates);
}

function genDireccionId(): string {
  return `dir_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

/** Agrega una dirección alternativa al cliente. Retorna el id de la nueva dirección. */
export async function agregarDireccionCliente(
  clienteId: string,
  data: Omit<DireccionCliente, 'id'>,
): Promise<string> {
  const ref = doc(db, 'clientes', clienteId);
  const snap = await getDoc(ref);
  const cliente = snap.data() as Partial<Cliente> | undefined;
  const direcciones: DireccionCliente[] = Array.isArray(cliente?.direcciones)
    ? (cliente!.direcciones as DireccionCliente[])
    : [];
  const nueva: DireccionCliente = { id: genDireccionId(), ...data };
  // Strip undefined
  const nuevaLimpia = Object.fromEntries(Object.entries(nueva).filter(([, v]) => v !== undefined)) as DireccionCliente;
  await updateDoc(ref, {
    direcciones: [...direcciones, nuevaLimpia],
    updatedAt: Timestamp.now(),
  });
  return nueva.id;
}

/** Actualiza una dirección alternativa del cliente. */
export async function actualizarDireccionCliente(
  clienteId: string,
  direccionId: string,
  cambios: Partial<Omit<DireccionCliente, 'id'>>,
): Promise<void> {
  const ref = doc(db, 'clientes', clienteId);
  const snap = await getDoc(ref);
  const cliente = snap.data() as Partial<Cliente> | undefined;
  const direcciones: DireccionCliente[] = Array.isArray(cliente?.direcciones)
    ? (cliente!.direcciones as DireccionCliente[])
    : [];
  const actualizadas = direcciones.map(d => {
    if (d.id !== direccionId) return d;
    const merged: Record<string, unknown> = { ...d };
    Object.entries(cambios).forEach(([k, v]) => {
      if (v === undefined) return;
      merged[k] = typeof v === 'string' ? v.trim() : v;
    });
    return merged as unknown as DireccionCliente;
  });
  await updateDoc(ref, {
    direcciones: actualizadas,
    updatedAt: Timestamp.now(),
  });
}

/**
 * Crea o actualiza un cliente a partir de una `CitaPorConfirmar` que se está
 * confirmando desde /admin/citas. Centraliza el lookup por teléfono normalizado:
 *
 *   - Si el cliente NO existe → lo crea con los datos de la cita y, si hay
 *     dirección, la guarda como `direccion`/`lat`/`lng` principal del cliente.
 *   - Si el cliente YA existe y la cita trae una dirección que NO es duplicada
 *     contra `cliente.direccion` ni contra ningún elemento de `direcciones[]`
 *     → la agrega al array `direcciones[]` con etiqueta "Captada del formulario público".
 *   - Si la cita no trae dirección, no agrega nada al cliente existente.
 *
 * El sector y la referencia de dirección (cuando los manda el form público) se
 * concatenan en `referencia` de `DireccionCliente` para no perderlos sin tener
 * que extender el tipo.
 *
 * Retorna `{ clienteId, creado, direccionAgregada }` para que el caller pueda
 * informar al usuario si se creó algo nuevo o si simplemente se enlazó al
 * cliente existente.
 */
export async function crearOActualizarClienteDesdeCita(
  cita: CitaPorConfirmar,
  usuarioActual: { uid?: string; nombre: string },
): Promise<{ clienteId: string; creado: boolean; direccionAgregada: boolean }> {
  // NOTA: aceptamos race condition tolerable aquí. Si dos confirmaciones
  // simultáneas (dos coords presionando "Confirmar" sobre la misma cita en
  // el mismo segundo) crean duplicado, se detecta visualmente en
  // /admin/clientes (mismo telefonoNormalizado) y se mergea manualmente.
  // La probabilidad real es baja porque el flujo natural impide que dos
  // coords confirmen la misma cita al mismo tiempo (la cita desaparece de
  // /admin/citas en cuanto la primera la confirma). Un fix robusto requiere
  // setDoc(merge:true) con ID = telefonoNormalizado, pero eso choca con
  // clientes preexistentes que tienen IDs auto-generados.
  const dirNueva = (cita.clienteDireccion || '').trim();
  const referenciaCompleta = [
    cita.clienteSector ? `Sector: ${cita.clienteSector}` : null,
    cita.clienteReferencia || null,
  ]
    .filter(Boolean)
    .join('. ') || undefined;

  const existente = await buscarClientePorTelefono(cita.telefono);

  if (existente) {
    // Cliente ya existe. Solo agregamos dirección si:
    //   1. La cita trae dirección no vacía.
    //   2. No coincide con la dirección principal del cliente.
    //   3. No coincide con ninguna dirección alternativa ya guardada.
    if (!dirNueva) {
      return { clienteId: existente.id, creado: false, direccionAgregada: false };
    }

    const direccionesActuales = Array.isArray(existente.data.direcciones)
      ? (existente.data.direcciones as DireccionCliente[])
      : [];

    const dirPrincipal = (existente.data.direccion || '').toLowerCase().trim();
    const dirNuevaLower = dirNueva.toLowerCase();
    const yaExiste =
      dirPrincipal === dirNuevaLower ||
      direccionesActuales.some(
        d => (d.direccion || '').toLowerCase().trim() === dirNuevaLower,
      );

    if (yaExiste) {
      return { clienteId: existente.id, creado: false, direccionAgregada: false };
    }

    // Construir DireccionCliente sin undefineds (Firestore los rechaza).
    // El id se genera con el helper compartido `genDireccionId()` para
    // mantener un solo formato en todo el módulo de clientes.
    const nuevaDir: DireccionCliente = {
      id: genDireccionId(),
      etiqueta: 'Captada del formulario público',
      direccion: dirNueva,
    };
    if (typeof cita.clienteLat === 'number') nuevaDir.lat = cita.clienteLat;
    if (typeof cita.clienteLng === 'number') nuevaDir.lng = cita.clienteLng;
    if (referenciaCompleta) nuevaDir.referencia = referenciaCompleta;

    const nuevaLimpia = Object.fromEntries(
      Object.entries(nuevaDir).filter(([, v]) => v !== undefined),
    ) as DireccionCliente;

    const updatesExistente: Record<string, unknown> = {
      direcciones: [...direccionesActuales, nuevaLimpia],
      updatedAt: Timestamp.now(),
      actualizadoPor: usuarioActual.nombre,
    };
    // Si el cliente existente no tenía zona y la nueva dirección trae coords,
    // inferimos zona desde esas coords. No tocamos zona si ya estaba seteada.
    if (!existente.data.zona) {
      const zonaInferida = inferirZona(
        typeof cita.clienteLat === 'number' ? cita.clienteLat : existente.data.lat,
        typeof cita.clienteLng === 'number' ? cita.clienteLng : existente.data.lng,
      );
      if (zonaInferida) updatesExistente.zona = zonaInferida;
    }
    await updateDoc(doc(db, 'clientes', existente.id), updatesExistente);

    return { clienteId: existente.id, creado: false, direccionAgregada: true };
  }

  // Cliente NO existe → crear con los datos de la cita.
  // Reusamos la convención de `buscarOCrearCliente`: ID = teléfono normalizado.
  const telNorm = normalizarTelefono(cita.telefono);
  const clienteId = telNorm;
  const payload: Record<string, unknown> = {
    nombre: cita.clienteNombre,
    telefono: cita.telefono,
    telefonoNormalizado: telNorm,
    email: cita.clienteEmail || '',
    direccion: dirNueva,
    referenciaDireccion: referenciaCompleta || '',
    sector: cita.clienteSector || '',
    origen: 'cita_publica',
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    creadoPor: usuarioActual.nombre,
  };
  if (typeof cita.clienteLat === 'number') payload.lat = cita.clienteLat;
  if (typeof cita.clienteLng === 'number') payload.lng = cita.clienteLng;
  const zonaInferidaCita = inferirZona(cita.clienteLat, cita.clienteLng);
  if (zonaInferidaCita) payload.zona = zonaInferidaCita;

  // Strip undefined defensivo (Firestore los rechaza)
  const payloadLimpio = Object.fromEntries(
    Object.entries(payload).filter(([, v]) => v !== undefined),
  );

  await setDoc(doc(db, 'clientes', clienteId), payloadLimpio);
  return { clienteId, creado: true, direccionAgregada: false };
}

/** Elimina una dirección alternativa del cliente. */
export async function eliminarDireccionCliente(
  clienteId: string,
  direccionId: string,
): Promise<void> {
  const ref = doc(db, 'clientes', clienteId);
  const snap = await getDoc(ref);
  const cliente = snap.data() as Partial<Cliente> | undefined;
  const direcciones: DireccionCliente[] = Array.isArray(cliente?.direcciones)
    ? (cliente!.direcciones as DireccionCliente[])
    : [];
  const filtradas = direcciones.filter(d => d.id !== direccionId);
  await updateDoc(ref, {
    direcciones: filtradas,
    updatedAt: Timestamp.now(),
  });
}
