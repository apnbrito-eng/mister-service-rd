import { auth } from '../firebase/config';
export async function equipoApi<T>(ruta: string, body?: object): Promise<T> {
  const usuario = auth.currentUser;
  if (!usuario) throw new Error('Inicia sesión para continuar.');
  const response = await fetch(ruta, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${await usuario.getIdToken()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(45000),
  });
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('El servicio aún no está disponible en este entorno.');
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'No se pudo completar la solicitud.');
  return result as T;
}
