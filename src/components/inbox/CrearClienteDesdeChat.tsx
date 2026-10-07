import UbicacionPegada, {type EstadoUbicacionPegada} from '../clientes/UbicacionPegada';
import {useRef,useState} from 'react';
import {buscarClientePorTelefono,buscarOCrearCliente,normalizarTelefono} from '../../services/clientes.service';
import type {Cliente} from '../../types';
export default function CrearClienteDesdeChat({waId,onGuardar,onCancelar,ubicacionesRecibidas=[],paraExpediente=false}:{ubicacionesRecibidas?:{id:string;lat:number;lng:number;etiqueta:string}[];paraExpediente?:boolean;waId:string;onGuardar:(cliente:Cliente)=>void;onCancelar:()=>void}){
 const [nombre,setNombre]=useState(''),[email,setEmail]=useState(''),[direccion,setDireccion]=useState('');
 const [ubicacion,setUbicacion]=useState<EstadoUbicacionPegada>({coords:null,pendiente:false,invalida:false});
 const [guardando,setGuardando]=useState(false),[error,setError]=useState('');const ejecutando=useRef(false);
 async function guardar(e:React.FormEvent){e.preventDefault();if(ejecutando.current)return;if(ubicacion.pendiente||ubicacion.invalida){setError('Espera una ubicación válida antes de guardar.');return;}if(!nombre.trim()){setError('Escribe el nombre del cliente.');return;}
  if(!normalizarTelefono(waId)){setError('Este número internacional se conserva completo. El registro de clientes aún no admite este formato de teléfono.');return;}
  ejecutando.current=true;setGuardando(true);setError('');
  try{
   // Si ya existe, abrir el canónico sin sobrescribir su ficha desde un formulario de alta.
   let existente=await buscarClientePorTelefono(waId);
   if(!existente){await buscarOCrearCliente(waId,{nombre:nombre.trim(),email:email.trim(),direccion:direccion.trim(),...(ubicacion.coords||{})});existente=await buscarClientePorTelefono(waId);}
   if(!existente)throw new Error('El cliente se guardó, pero no pudimos cargar su ficha. Reintenta para recuperarla.');
   onGuardar({...existente.data,id:existente.id});
  }catch(e){setError(e instanceof Error?e.message:'No se pudo guardar el cliente. Tus datos siguen aquí.');}
  finally{ejecutando.current=false;setGuardando(false);}
 }
 return <form onSubmit={guardar} aria-label="Registrar cliente sin orden" className="space-y-3 rounded-xl border bg-white p-3">
  <p className="text-sm">{paraExpediente?'Se creará el cliente y se abrirá su expediente con el mensaje seleccionado.':'Se guardará el cliente. Puedes crear una orden después.'}</p>
  <p className="break-words text-sm">Teléfono: {waId}</p>
  <fieldset disabled={guardando} className="space-y-3">
   <label className="block text-sm">Nombre<input required name="nombreNuevoCliente" value={nombre} onChange={e=>setNombre(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border p-2 text-base"/></label>
   <label className="block text-sm">Correo<input type="email" name="correoNuevoCliente" value={email} onChange={e=>setEmail(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border p-2 text-base"/></label>
   <label className="block text-sm">Dirección<input name="direccionNuevoCliente" value={direccion} onChange={e=>setDireccion(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border p-2 text-base"/></label>
   <UbicacionPegada onCambio={setUbicacion} direccion={direccion} recibidas={ubicacionesRecibidas}/>
  </fieldset>
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
  <div className="flex flex-wrap gap-2"><button type="submit" disabled={guardando||ubicacion.pendiente||ubicacion.invalida} className="min-h-11 rounded-lg bg-primary px-3 text-white">{guardando?'Guardando…':paraExpediente?'Crear cliente y abrir expediente':'Guardar cliente'}</button><button type="button" disabled={guardando} onClick={onCancelar} className="min-h-11 rounded-lg border px-3">Cancelar</button></div>
 </form>;
}
