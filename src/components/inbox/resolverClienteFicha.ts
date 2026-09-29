import {getDoc,doc} from 'firebase/firestore';
import {db} from '../../firebase/config';
import {buscarClientePorTelefono,normalizarTelefono} from '../../services/clientes.service';
import type {Cliente} from '../../types';
/** Una referencia de ruta nunca permite mostrar la ficha de otro teléfono. */
export async function resolverClienteFicha(waId: string, clienteId?: string) {
  if (!clienteId) return buscarClientePorTelefono(waId);
  if (!/^[\w.-]{1,160}$/.test(clienteId)) throw new Error('Referencia de cliente inválida');
  const snap=await getDoc(doc(db,'clientes',clienteId));
  if(!snap.exists()||snap.data().eliminado===true) throw new Error('Cliente no disponible');
  const data=snap.data() as Cliente;
  const a=normalizarTelefono(waId)||waId.replace(/\D/g,''),b=normalizarTelefono(data.telefono)||String(data.telefono??'').replace(/\D/g,'');
  if(!a||a!==b)throw new Error('El cliente no corresponde al chat');
  return {id:snap.id,data:{...data,id:snap.id}};
}

