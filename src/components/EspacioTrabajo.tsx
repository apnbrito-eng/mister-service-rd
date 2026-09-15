import { NavLink, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { puede, type AccionPermiso } from '../utils/permisos';

type Vista = { ruta: string; nombre: string; permiso?: AccionPermiso; roles?: string[] };
export const ESPACIOS: Array<{nombre: string; descripcion: string; vistas: Vista[]}> = [
  {nombre:'Atención y clientes',descripcion:'Revisa el contacto, identifica al cliente y continúa con su solicitud.',vistas:[
    {ruta:'inbox',nombre:'Conversaciones',roles:['administrador','coordinadora','secretaria','operaria']},
    {ruta:'clientes',nombre:'Clientes',permiso:'clientesVer'},
    {ruta:'solicitudes',nombre:'Solicitudes',roles:['administrador']},
    {ruta:'citas',nombre:'Citas por confirmar',permiso:'ordenesVer'},
  ]},
  {nombre:'Servicios',descripcion:'Trabaja sobre los servicios desde la lista, la agenda o el mapa. Revisa aquí las excepciones pendientes.',vistas:[
    {ruta:'ordenes',nombre:'Órdenes',permiso:'ordenesVer'},
    {ruta:'agenda-dia',nombre:'Agenda del día',permiso:'ordenesVer'},
    {ruta:'calendario',nombre:'Calendario',permiso:'ordenesVer'},
    {ruta:'mapa',nombre:'Rutas',permiso:'ordenesVer'},
    {ruta:'taller',nombre:'Taller',permiso:'ordenesVer'},
    {ruta:'standby',nombre:'Espera de piezas',permiso:'ordenesVer'},
    {ruta:'reprogramaciones',nombre:'Reprogramaciones',roles:['administrador','coordinadora']},
    {ruta:'sugerencias-chequeo',nombre:'Chequeos por revisar',roles:['administrador','coordinadora']},
    {ruta:'mantenimiento',nombre:'Mantenimientos',permiso:'ordenesVer'},
  ]},
  {nombre:'Cobro y cierre',descripcion:'Cotiza, verifica el pago y completa el conduce y la entrega de efectivo.',vistas:[
    {ruta:'cotizaciones',nombre:'Cotizaciones',permiso:'cotizacionesVer'},
    {ruta:'pagos-pendientes',nombre:'Verificar pagos',permiso:'pagosVerificar'},
    {ruta:'facturacion-pendiente',nombre:'Preparar conduces',roles:['administrador','coordinadora']},
    {ruta:'facturas',nombre:'Conduces emitidos',permiso:'facturasVer'},
    {ruta:'cierre-dia',nombre:'Cierre del día',permiso:'cierreDiaEjecutar'},
  ]},
  {nombre:'Equipo',descripcion:'Consulta el personal y gestiona por separado sus accesos, asistencia y remuneración.',vistas:[
    {ruta:'personal',nombre:'Personal',permiso:'personalVer'},
    {ruta:'usuarios',nombre:'Accesos',roles:['administrador','coordinadora']},
    {ruta:'ponches',nombre:'Asistencia',roles:['administrador','coordinadora']},
    {ruta:'comisiones',nombre:'Comisiones',roles:['administrador','coordinadora']},
    {ruta:'nomina',nombre:'Nómina',roles:['administrador','coordinadora']},
    {ruta:'avances',nombre:'Avances',permiso:'avancesGestionar'},
    {ruta:'prestamos',nombre:'Préstamos',roles:['administrador','coordinadora']},
  ]},
];
export default function EspacioTrabajo() {
  const {pathname}=useLocation(); const {userProfile}=useApp();
  // Solo listas principales: no distraer ni romper los expedientes por ID.
  const espacio=ESPACIOS.find(e=>e.vistas.some(v=>pathname===`/admin/${v.ruta}`));
  if(!espacio||!userProfile) return null;
  const vistas=espacio.vistas.filter(v=>(!v.permiso||puede(userProfile,v.permiso))&&(!v.roles||v.roles.includes(userProfile.rol)));
  if(vistas.length<2) return null;
  return <section aria-label={`Espacio de trabajo: ${espacio.nombre}`} className="bg-white border-b px-4 md:px-6 pt-4">
    <h2 className="font-semibold text-gray-900">{espacio.nombre}</h2><p className="text-sm text-gray-500 mt-1">{espacio.descripcion}</p>
    <nav aria-label={`Vistas de ${espacio.nombre}`} className="flex gap-1 overflow-x-auto mt-3 pb-2">{vistas.map(v=><NavLink key={v.ruta} to={`/admin/${v.ruta}`} end className={({isActive})=>`whitespace-nowrap rounded-lg px-3 py-2 text-sm ${isActive?'bg-primary text-white font-medium':'text-gray-600 hover:bg-gray-100'}`}>{v.nombre}</NavLink>)}</nav>
  </section>;
}
