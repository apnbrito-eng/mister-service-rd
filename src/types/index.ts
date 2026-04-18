export type Rol = 'administrador' | 'coordinadora' | 'operaria' | 'secretaria' | 'tecnico' | 'ayudante';

/** Roles que pueden iniciar sesión en el sistema (tienen cuenta en Firebase Auth) */
export const ROLES_CON_ACCESO: Rol[] = ['administrador', 'coordinadora', 'operaria', 'secretaria', 'tecnico'];

export type FaseOrden =
  | 'nuevo_lead'
  | 'en_gestion'
  | 'en_diagnostico'
  | 'en_cotizacion'
  | 'aprobado'
  | 'agendado'
  | 'trabajo_realizado'
  | 'cerrado'
  | 'cancelado';

export type EstadoOrdenSimple = 'pendiente' | 'en_proceso' | 'completado' | 'cancelado';
export type EstadoCita = 'pendiente' | 'confirmada' | 'cancelada';
export type EstadoStandby = 'buscando' | 'importada' | 'dificil' | 'llego';
export type EstadoCotizacion = 'borrador' | 'enviada' | 'aceptada' | 'rechazada';
export type EstadoEquipo = 'recibido' | 'en_diagnostico' | 'en_reparacion' | 'en_standby' | 'listo' | 'entregado';
export type EstadoFactura = 'emitida' | 'pagada' | 'vencida' | 'anulada';

export interface Usuario {
  id: string;
  nombre: string;
  email: string;
  rol: Rol;
  telefono: string;
  activo: boolean;
  createdAt: Date;
  permisos?: TecnicoPermisos;
  color?: string;
}

export interface Cliente {
  id: string;
  nombre: string;
  telefono: string;
  telefonoNormalizado?: string;
  email?: string;
  direccion: string;
  referenciaDireccion?: string;
  sector?: string;
  ciudad?: string;
  lat?: number;
  lng?: number;
  createdAt: Date;
  updatedAt?: Date;
}

export interface HistorialFase {
  fase: FaseOrden;
  timestamp: Date;
  usuario: string;
  nota?: string;
}

export type AccionAuditoria = 'crear' | 'editar' | 'eliminar' | 'cambio_fase' | 'nota_tecnico' | 'precio_sugerido' | 'cierre' | 'marcar_chequeo';

export type MetodoPago = 'efectivo' | 'transferencia' | 'tarjeta' | 'link' | 'otro';

export interface RegistroAuditoria {
  fecha: Date;
  usuario: string;
  accion: AccionAuditoria;
  campo?: string;
  valorAnterior?: string;
  valorNuevo?: string;
  detalle?: string;
}

export interface OrdenServicio {
  id: string;
  numero: string;
  clienteId: string;
  clienteNombre: string;
  clienteTelefono?: string;
  clienteDireccion?: string;
  clienteReferencia?: string;
  clienteLat?: number;
  clienteLng?: number;
  equipoTipo: string;
  equipoMarca: string;
  equipoModelo?: string;
  descripcionFalla: string;
  tecnicoId?: string;
  tecnicoNombre?: string;
  operariaId?: string;
  operariaNombre?: string;
  responsableId?: string;
  responsableNombre?: string;
  fase: FaseOrden;
  estadoSimple: EstadoOrdenSimple;
  estado: 'activo' | 'cerrado' | 'cancelado';
  fechaCita?: Date;
  duracionMin?: number;
  reagendada?: boolean;
  notas?: string;
  notasTecnico?: string;
  precioSugerido?: number;
  precioAprobado?: number;
  precioFinal?: number;
  estadoAprobacion?: 'pendiente' | 'aprobado';
  aprobadoPor?: string;
  fechaAprobacion?: Date;
  historialFases: HistorialFase[];
  auditoria?: RegistroAuditoria[];
  creadoPor?: string;
  cierreServicio?: CierreServicio;
  trackingGPS?: TrackingGPS;
  metodoPagoCierre?: MetodoPago;
  bancoDestinoCierre?: string;
  soloChequeo?: boolean;
  precioChequeo?: number;
  motivoChequeo?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CitaPorConfirmar {
  id: string;
  clienteNombre: string;
  telefono: string;
  servicio: string;
  falla?: string;
  horarioSolicitado?: string;
  origen?: string;
  ordenNumero?: string;
  fotoEquipoUrl?: string;
  clienteEmail?: string;
  clienteDireccion?: string;
  clienteReferencia?: string;
  clienteLat?: number;
  clienteLng?: number;
  equipoTipo?: string;
  equipoMarca?: string;
  equipoModelo?: string;
  calendarioId?: string;
  calendarioNombre?: string;
  fechaSolicitada?: Date;
  horaSolicitada?: string;
  createdAt: Date;
}

export interface StandbyPieza {
  id: string;
  ordenId?: string;
  clienteNombre: string;
  equipoTipo: string;
  equipoMarca: string;
  piezaFaltante: string;
  tecnicoNombre?: string;
  fechaInicio: Date;
  estado: EstadoStandby;
  notas?: string;
  createdAt: Date;
}

export interface ItemCotizacion {
  descripcion: string;
  cantidad: number;
  precio: number;
}

export interface Cotizacion {
  id: string;
  numero: string;
  clienteId?: string;
  clienteNombre: string;
  items: ItemCotizacion[];
  total: number;
  tecnicoId?: string;
  tecnicoNombre?: string;
  estado: EstadoCotizacion;
  notas?: string;
  ordenId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Factura {
  id: string;
  numero: string;
  clienteId?: string;
  clienteNombre: string;
  ordenId?: string;
  ordenNumero?: string;
  items: ItemCotizacion[];
  total: number;
  estado: EstadoFactura;
  fechaEmision: Date;
  fechaVencimiento?: Date;
  fechaPago?: Date;
  notas?: string;
  metodoPago?: MetodoPago;
  bancoDestino?: string;
  createdAt: Date;
}

export interface EquipoTaller {
  id: string;
  clienteId?: string;
  clienteNombre: string;
  clienteTelefono?: string;
  equipoTipo: string;
  equipoMarca: string;
  numeroSerie: string;
  fallaReportada: string;
  diagnostico?: string;
  tecnicoId?: string;
  tecnicoNombre?: string;
  estado: EstadoEquipo;
  fechaRecibido: Date;
  fechaPrometida?: Date;
  costoReparacion?: number;
  createdAt: Date;
}

export interface TecnicoPermisos {
  vistaAgenda: 'dia' | 'semana' | 'mes';
  soloPropiasCitas: boolean;
  verTelefonoCliente: boolean;
  verEmailCliente: boolean;
  verDireccionCliente: boolean;
  verUbicacionGPS: boolean;
  puedeMarcarCompletado: boolean;
  puedeAgregarNotas: boolean;
  puedeVerHistorial: boolean;
  puedeContactarCliente: boolean;
  puedeVerCotizaciones: boolean;
  recibeNotificacionNuevaCita: boolean;
}

export const PERMISOS_DEFAULT_TECNICO: TecnicoPermisos = {
  vistaAgenda: 'dia',
  soloPropiasCitas: true,
  verTelefonoCliente: false,
  verEmailCliente: false,
  verDireccionCliente: true,
  verUbicacionGPS: true,
  puedeMarcarCompletado: true,
  puedeAgregarNotas: true,
  puedeVerHistorial: false,
  puedeContactarCliente: false,
  puedeVerCotizaciones: false,
  recibeNotificacionNuevaCita: true,
};

export interface Personal {
  id: string;
  nombre: string;
  rol: Rol;
  telefono?: string;
  email?: string;
  uid?: string;
  especialidad?: string;
  zona?: string;
  horario?: string;
  color?: string;
  disponibilidad: boolean;
  activo: boolean;
  permisos?: TecnicoPermisos;
  nivel?: 'junior' | 'senior';
  comisionPorcentaje?: number;
  sueldoBase?: number;
  operariaId?: string;
  operariaNombre?: string;
}

export interface Producto {
  id: string;
  nombre: string;
  descripcion?: string;
  precio: number;
  categoria: 'servicio' | 'repuesto' | 'accesorio';
  activo: boolean;
  createdAt: Date;
}

export interface Gasto {
  id: string;
  fecha: Date;
  categoria: 'repuestos' | 'transporte' | 'herramientas' | 'servicios' | 'otros';
  descripcion: string;
  monto: number;
  metodoPago: 'efectivo' | 'transferencia' | 'tarjeta';
  createdAt: Date;
}

export interface Mantenimiento {
  id: string;
  clienteId: string;
  clienteNombre: string;
  equipoTipo: string;
  frecuencia: 'mensual' | 'trimestral' | 'semestral' | 'anual';
  frecuenciaMeses?: number;
  proximaFecha: Date;
  tecnicoId?: string;
  activo: boolean;
}

export interface PiezaRetirada {
  descripcion: string;
  motivo: 'defectuosa' | 'desgaste' | 'otro';
  motivoDetalle?: string;
  destino: 'cliente' | 'taller' | 'descartada';
}

export interface PiezaInstalada {
  descripcion: string;
  numeroParte: string;
  procedencia: 'inventario' | 'cliente' | 'comprada';
}

export interface ChecklistItem {
  id: string;
  pregunta: string;
  respuesta: 'si' | 'no' | null;
  explicacion?: string;
  critica?: boolean;
}

export interface FotoCierre {
  url: string;
  lat: number;
  lng: number;
  timestamp: Date;
  gpsVerificado: boolean;
  distanciaCliente?: number;
}

export interface CierreServicio {
  fechaCierre: Date;
  tecnicoId: string;
  tecnicoNombre: string;
  // Wizard simplificado (nuevo)
  equipoFunciona?: boolean;
  clienteSatisfecho?: boolean;
  revisoConexiones?: boolean;
  fotoCierre?: FotoCierre;
  // Wizard completo (legacy — para órdenes cerradas con el formato anterior)
  piezasRetiradas?: PiezaRetirada[];
  piezasInstaladas?: PiezaInstalada[];
  checklist?: ChecklistItem[];
  descripcionTrabajo?: string;
  trabajoPendiente?: string;
  satisfaccionCliente?: number;
}

export interface TrackingGPS {
  habilitado: boolean;
  token: string;
  vehiculoId: string;
  tecnicoId: string;
  activadoPor: string;
  activadoEn: Date;
  enlace: string;
  expiresAt: Date;
}

export interface UbicacionVehiculo {
  vehiculoId: string;
  tecnicoId: string;
  tecnicoNombre?: string;
  lat: number;
  lng: number;
  velocidad: number;
  rumbo: number;
  timestamp: Date;
  enMovimiento: boolean;
  direccionAproximada?: string;
}

export type ProveedorGPS = 'Wialon' | 'Samsara' | 'Traccar' | 'Fleet Complete' | 'API Personalizada' | 'Dispositivo del técnico';

export interface VehiculoGPS {
  id: string;
  nombre: string;
  placa?: string;
  tecnicoId: string;
  tecnicoNombre: string;
}

export interface ConfigGPS {
  proveedor: ProveedorGPS;
  apiUrl: string;
  apiKey: string;
  activo: boolean;
  vehiculos: VehiculoGPS[];
}

export interface MovimientoPieza {
  id: string;
  ordenId: string;
  ordenNumero: string;
  clienteNombre: string;
  tecnicoId: string;
  tecnicoNombre: string;
  tipo: 'retirada' | 'instalada';
  descripcion: string;
  numeroParte?: string;
  destino?: string;
  procedencia?: string;
  motivo?: string;
  fecha: Date;
}

export type DiaSemana = 'Lunes' | 'Martes' | 'Miércoles' | 'Jueves' | 'Viernes' | 'Sábado' | 'Domingo';

export interface Calendario {
  id: string;
  nombre: string;
  asignadoId?: string;
  asignadoNombre?: string;
  color: string;
  activo: boolean;
  dias: DiaSemana[];
  horas: string[]; // Ej: ['9:00 AM', '10:00 AM', ...]
  createdAt: Date;
}

export interface AlertaItem {
  id: string;
  tipo: 'roja' | 'naranja';
  mensaje: string;
  ordenId?: string;
  createdAt: Date;
}
