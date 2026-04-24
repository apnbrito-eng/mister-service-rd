import type { Timestamp } from 'firebase/firestore';

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
  /** Permisos granulares legacy (sólo técnico) — retrocompat */
  permisos?: TecnicoPermisos;
  /** Permisos del nuevo sistema granular (Fase 3B). Si está, se prefiere
   *  sobre `permisos` legacy y los defaults por rol cuando
   *  `permisosPersonalizados === true`. */
  permisosSistema?: PermisosSistema;
  /** Cuando true, usar `permisosSistema` en vez del default por rol */
  permisosPersonalizados?: boolean;
  color?: string;
  /** Habilita el chat flotante del Asistente IA para este usuario. Bloqueado para tecnico/ayudante. */
  iaHabilitada?: boolean;
}

/**
 * Dirección alternativa de un cliente (mamá, oficina, casa de hermana, etc.)
 * El cliente sigue teniendo `direccion` + `lat`/`lng` como dirección principal;
 * `direcciones[]` son las alternativas adicionales.
 */
export interface DireccionCliente {
  id: string;
  etiqueta: string;        // Obligatoria — ej: "Mamá", "Oficina", "Casa hermana en Naco"
  direccion: string;
  lat?: number;
  lng?: number;
  referencia?: string;
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
  zona?: string;
  lat?: number;
  lng?: number;
  /** Direcciones alternativas (familiares, oficina, etc.) */
  direcciones?: DireccionCliente[];
  /** RNC (empresa) — para reporte 607 DGII */
  rnc?: string;
  /** Cédula (persona física) — para reporte 607 DGII */
  cedula?: string;
  createdAt: Date;
  updatedAt?: Date;
}

export const ZONAS_RD = [
  'Distrito Nacional',
  'Santo Domingo Norte',
  'Santo Domingo Este',
  'Santo Domingo Oeste',
  'Santiago',
  'La Vega',
  'Puerto Plata',
  'Punta Cana',
  'Otro',
] as const;
export type ZonaRD = typeof ZONAS_RD[number];

export interface HistorialFase {
  fase: FaseOrden;
  timestamp: Date;
  usuario: string;
  nota?: string;
}

export type AccionAuditoria =
  | 'crear'
  | 'editar'
  | 'eliminar'
  | 'cambio_fase'
  | 'nota_tecnico'
  | 'precio_sugerido'
  | 'cierre'
  | 'marcar_chequeo'
  | 'aprobar_piezas'
  | 'editar_piezas';

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
  clienteEmail?: string;
  clienteDireccion?: string;
  clienteReferencia?: string;
  clienteLat?: number;
  clienteLng?: number;
  equipoTipo: string;
  equipoMarca: string;
  equipoModelo?: string;
  descripcionFalla: string;
  fotoEquipoUrl?: string;
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
  // Soft delete (Fase 3B)
  eliminada?: boolean;
  motivoEliminacion?: string;
  eliminadaPor?: string;
  eliminadaPorId?: string;
  fechaEliminacion?: Date;
  // Cancelación con motivo obligatorio
  motivoCancelacion?: string;
  canceladaPor?: string;
  canceladaPorId?: string;
  fechaCancelacion?: Date;
  // Cierre del día (Fase 3C)
  efectivoEntregado?: boolean;
  efectivoEntregadoPor?: string;
  efectivoEntregadoEn?: Date;
  // Cotización vinculada (Fase 4B)
  cotizacionId?: string;
  // Inicio de chequeo (Fase 8) — registro técnico al llegar al sitio
  inicioChequeo?: InicioChequeo;
  // Pagos y facturación (Fase 7)
  pagos?: PagoOrden[];
  montoPagado?: number;
  estadoPago?: EstadoPagoOrden;
  enviadaAFacturacion?: boolean;
  enviadaAFacturacionAt?: Date;
  enviadaAFacturacionPorId?: string;
  enviadaAFacturacionPorNombre?: string;
  facturada?: boolean;
  facturaId?: string;
  facturaNumero?: string;
  facturadaAt?: Date;
  facturadaPorId?: string;
  facturadaPorNombre?: string;
  // Piezas utilizadas en el cierre (Fase A1)
  costoPiezasTotal?: number;       // suma de PiezaUsada.costoTotal
  cantidadPiezasUsadas?: number;   // suma de PiezaUsada.cantidad
  createdAt: Date;
  updatedAt: Date;
}

export interface ComisionRegistro {
  id: string;
  tecnicoId: string;
  tecnicoNombre: string;
  ordenId: string;
  ordenNumero: string;
  clienteNombre: string;
  fechaCobro: Date;
  precioFinal: number;
  costoPiezas: number;
  basePendienteComision: number;   // ganancia neta (subtotal sin ITBIS - piezas)
  comisionPorcentaje: number;
  comisionMonto: number;
  // Desglose fiscal (se llena cuando se genera comisión desde factura)
  subtotal?: number;
  itbisMonto?: number;
  facturaId?: string;
  facturaNumero?: string;
  estadoLiquidacion: 'pendiente' | 'liquidada';
  quincenaAsignada?: string;
  liquidadaEn?: Date;
  liquidadaPor?: string;
  notas?: string;
  createdAt: Date;
}

export interface LiquidacionEmpleado {
  personalId: string;
  personalNombre: string;
  rol: Rol;
  sueldoBase: number;
  // Técnico
  comisionesIds: string[];
  totalComisiones: number;
  cantidadOrdenesConComision: number;
  // Operaria/Coordinadora
  desempenoPorcentaje?: number;
  ordenesCompletadas?: number;
  ordenesAtendidas?: number;
  ordenesChequeo?: number;
  bono?: number;
  // Secretaria (bono mensual por citas agendadas)
  citasAgendadasMes?: number;
  citasCompletadasMes?: number;
  // Totales
  totalDevengado: number;
  // Avances descontados (Fase 8)
  avancesIds?: string[];
  totalAvances?: number;
  totalNeto?: number;              // totalDevengado - totalAvances
  notas?: string;
  // Pago
  metodoPago?: 'efectivo' | 'transferencia' | 'cheque';
  bancoDestino?: string;
  fechaPagoEfectivo?: Date;
  pagadoPor?: string;
  pagado: boolean;
}

export interface LiquidacionNomina {
  id: string;
  quincena: string;
  periodoInicio: Date;
  periodoFin: Date;
  generadaPor: string;
  generadaPorId: string;
  fechaGeneracion: Date;
  estado: 'abierta' | 'cerrada';
  totalNomina: number;
  empleados: LiquidacionEmpleado[];
  notas?: string;
  cerradaPor?: string;
  cerradaPorId?: string;
  fechaCierre?: Date;
}

/**
 * Adelanto / préstamo otorgado a un empleado. Se descuenta automáticamente
 * de la siguiente liquidación de nómina para la quincena correspondiente.
 */
export interface AvanceEmpleado {
  id: string;
  personalId: string;
  personalNombre: string;
  personalRol?: Rol;
  monto: number;
  fecha: Date;
  motivo: string;
  metodoPago?: 'efectivo' | 'transferencia' | 'tarjeta';
  bancoDestino?: string;
  quincenaAsignada: string;      // Quincena en la que se descontará
  descontado: boolean;            // true cuando ya se aplicó a una liquidación
  liquidacionId?: string;         // id de la LiquidacionNomina donde se descontó
  liquidacionFechaDescuento?: Date;
  creadoPorId: string;
  creadoPorNombre: string;
  notas?: string;
  createdAt: Date;
  updatedAt?: Date;
}

export interface DesempenoOperaria {
  operariaId: string;
  operariaNombre: string;
  periodoInicio: Date;
  periodoFin: Date;
  ordenesAtendidas: number;
  ordenesCompletadas: number;
  ordenesChequeo: number;
  porcentajeDesempeno: number;
  bonoCalculado: number;
  bonoPagado: boolean;
}

export interface ServicioPrecio {
  id: string;
  marca: string;
  categoria: string;
  equipoTipo: string;
  nombre: string;
  precio: number;
  activo: boolean;
  createdAt: Date;
  updatedAt?: Date;
  notas?: string;
}

export interface PiezaInventario {
  id: string;
  nombre: string;
  codigo?: string;
  descripcion?: string;
  precioCompra?: number;
  precioVenta: number;
  stockActual: number;
  stockMinimo?: number;
  proveedorSugerido?: string;
  categoria?: string;
  activo: boolean;
  createdAt: Date;
  updatedAt?: Date;
}

export interface MovimientoInventario {
  id: string;
  piezaId: string;
  piezaNombre: string;
  tipo: 'entrada' | 'salida' | 'ajuste';
  cantidad: number;
  motivo: string;
  ordenId?: string;
  ordenNumero?: string;
  usuario: string;
  fecha: Date;
  notas?: string;
}

export interface CierreDia {
  id: string;
  fecha: Date;                     // Día cerrado (00:00 del día)
  cerradoPor: string;
  cerradoPorId: string;
  fechaCierre: Date;               // Timestamp del cierre
  totalOrdenesCerradas: number;
  totalChequeos: number;
  totalIngresos: number;
  efectivoTotal: number;
  transferenciasTotal: Record<string, number>;  // banco -> monto
  ordenesActivasAlCierre: string[];             // IDs
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
  /** Origen del item: catálogo de servicios, pieza del inventario, o entrada manual */
  tipoItem?: 'servicio' | 'pieza' | 'manual';
  /** Referencia al doc de precios_servicios si vino del catálogo */
  servicioPrecioId?: string;
  /** Referencia al doc de piezas_inventario si vino del inventario */
  piezaInventarioId?: string;
  /** Costo de compra capturado al agregar (para análisis de margen) */
  costoCompra?: number;
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
  convertida?: boolean;
  facturaId?: string;
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
  cotizacionId?: string;
  // Desglose fiscal (el total ya incluye ITBIS, se desglosa al facturar)
  subtotal?: number;            // total sin ITBIS = total / 1.18
  itbisPorcentaje?: number;     // 18 por default
  itbisMonto?: number;          // total - subtotal
  costoPiezas?: number;         // suma de costoCompra de items tipo pieza
  gananciaNeta?: number;        // subtotal - costoPiezas
  // Comisión del técnico asociada (denormalizado para reportes)
  comisionTecnicoId?: string;
  comisionTecnicoNombre?: string;
  comisionTecnicoPorcentaje?: number;
  comisionTecnicoMonto?: number;
  comisionRegistroId?: string;  // id del doc en colección `comisiones`
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

/**
 * Sistema de permisos granulares por usuario (Fase 3B).
 * Reemplaza/complementa al rol como mecanismo principal de gating.
 * El admin puede sobrescribir por usuario individual; si no, se usan
 * los defaults por rol vía `obtenerPermisos`.
 */
export interface PermisosSistema {
  // Órdenes
  ordenesVer: boolean;
  ordenesCrear: boolean;
  ordenesModificar: boolean;
  ordenesModificarFueraGrupo: boolean;
  ordenesEliminar: boolean;
  ordenesVerEliminadas: boolean;
  // Cotizaciones
  cotizacionesVer: boolean;
  cotizacionesCrear: boolean;
  cotizacionesModificar: boolean;
  cotizacionesAprobarPrecio: boolean;
  // Facturas
  facturasVer: boolean;
  facturasCrear: boolean;
  facturasModificar: boolean;
  facturasEliminar: boolean;
  // Clientes
  clientesVer: boolean;
  clientesCrear: boolean;
  clientesModificar: boolean;
  clientesEliminar: boolean;
  // Personal
  personalVer: boolean;
  personalCrear: boolean;
  personalModificar: boolean;
  personalEliminar: boolean;
  // Gastos
  gastosVer: boolean;
  gastosCrear: boolean;
  gastosEliminar: boolean;
  // Rendimiento
  rendimientoVer: boolean;
  // Configuración
  configuracionVer: boolean;
  configuracionModificar: boolean;
  // Cierre del día
  cierreDiaEjecutar: boolean;
  // Pagos y facturación (Fase 7)
  pagosRegistrar: boolean;
  ordenesEnviarAFacturacion: boolean;
  facturasCerrar: boolean;
  bancosGestionar: boolean;
  // Avances a empleados (Fase 8)
  avancesGestionar: boolean;
  // Técnico (opcional, solo para rol técnico)
  tecnicoVistaAgenda?: 'dia' | 'semana' | 'mes';
  tecnicoSoloPropiasCitas?: boolean;
  tecnicoVerTelefonoCliente?: boolean;
  tecnicoVerEmailCliente?: boolean;
  tecnicoVerDireccionCliente?: boolean;
  tecnicoVerUbicacionGPS?: boolean;
  tecnicoPuedeMarcarCompletado?: boolean;
  tecnicoPuedeAgregarNotas?: boolean;
  tecnicoPuedeVerHistorial?: boolean;
  tecnicoPuedeContactarCliente?: boolean;
  tecnicoPuedeVerCotizaciones?: boolean;
  tecnicoRecibeNotificacionNuevaCita?: boolean;
}

const TODO_FALSE: PermisosSistema = {
  ordenesVer: false, ordenesCrear: false, ordenesModificar: false,
  ordenesModificarFueraGrupo: false, ordenesEliminar: false, ordenesVerEliminadas: false,
  cotizacionesVer: false, cotizacionesCrear: false, cotizacionesModificar: false, cotizacionesAprobarPrecio: false,
  facturasVer: false, facturasCrear: false, facturasModificar: false, facturasEliminar: false,
  clientesVer: false, clientesCrear: false, clientesModificar: false, clientesEliminar: false,
  personalVer: false, personalCrear: false, personalModificar: false, personalEliminar: false,
  gastosVer: false, gastosCrear: false, gastosEliminar: false,
  rendimientoVer: false,
  configuracionVer: false, configuracionModificar: false,
  cierreDiaEjecutar: false,
  pagosRegistrar: false, ordenesEnviarAFacturacion: false,
  facturasCerrar: false, bancosGestionar: false,
  avancesGestionar: false,
};

const TODO_TRUE: PermisosSistema = {
  ordenesVer: true, ordenesCrear: true, ordenesModificar: true,
  ordenesModificarFueraGrupo: true, ordenesEliminar: true, ordenesVerEliminadas: true,
  cotizacionesVer: true, cotizacionesCrear: true, cotizacionesModificar: true, cotizacionesAprobarPrecio: true,
  facturasVer: true, facturasCrear: true, facturasModificar: true, facturasEliminar: true,
  clientesVer: true, clientesCrear: true, clientesModificar: true, clientesEliminar: true,
  personalVer: true, personalCrear: true, personalModificar: true, personalEliminar: true,
  gastosVer: true, gastosCrear: true, gastosEliminar: true,
  rendimientoVer: true,
  configuracionVer: true, configuracionModificar: true,
  cierreDiaEjecutar: true,
  pagosRegistrar: true, ordenesEnviarAFacturacion: true,
  facturasCerrar: true, bancosGestionar: true,
  avancesGestionar: true,
};

export const PERMISOS_TODO_FALSE: PermisosSistema = { ...TODO_FALSE };

export const PERMISOS_DEFAULT_ADMINISTRADOR: PermisosSistema = { ...TODO_TRUE };

export const PERMISOS_DEFAULT_COORDINADORA: PermisosSistema = {
  ...TODO_TRUE,
  configuracionModificar: false,
  personalEliminar: false,
};

export const PERMISOS_DEFAULT_OPERARIA: PermisosSistema = {
  ...TODO_FALSE,
  ordenesVer: true, ordenesCrear: true, ordenesModificar: true, ordenesModificarFueraGrupo: true,
  cotizacionesVer: true, cotizacionesCrear: true, cotizacionesModificar: true, cotizacionesAprobarPrecio: true,
  clientesVer: true, clientesCrear: true, clientesModificar: true,
  personalVer: true,
  rendimientoVer: true,
  pagosRegistrar: true, ordenesEnviarAFacturacion: true,
  facturasVer: true,
};

export const PERMISOS_DEFAULT_SECRETARIA: PermisosSistema = {
  ...TODO_FALSE,
  ordenesVer: true, ordenesCrear: true, ordenesModificar: true,
  clientesVer: true, clientesCrear: true, clientesModificar: true,
  personalVer: true,
  pagosRegistrar: true,
};

export const PERMISOS_DEFAULT_TECNICO_SISTEMA: PermisosSistema = {
  ...TODO_FALSE,
  ordenesVer: true,
  // Permisos granulares de técnico (mismo default que el legacy TecnicoPermisos)
  tecnicoVistaAgenda: 'dia',
  tecnicoSoloPropiasCitas: true,
  tecnicoVerTelefonoCliente: false,
  tecnicoVerEmailCliente: false,
  tecnicoVerDireccionCliente: true,
  tecnicoVerUbicacionGPS: true,
  tecnicoPuedeMarcarCompletado: true,
  tecnicoPuedeAgregarNotas: true,
  tecnicoPuedeVerHistorial: false,
  tecnicoPuedeContactarCliente: false,
  tecnicoPuedeVerCotizaciones: false,
  tecnicoRecibeNotificacionNuevaCita: true,
};

export const PERMISOS_DEFAULT_AYUDANTE: PermisosSistema = { ...TODO_FALSE };

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
  permisosSistema?: PermisosSistema;
  permisosPersonalizados?: boolean;
  nivel?: 'junior' | 'senior';
  comisionPorcentaje?: number;
  sueldoBase?: number;
  operariaId?: string;
  operariaNombre?: string;
  /** Habilita el chat flotante del Asistente IA para este miembro del personal. Bloqueado para tecnico/ayudante. */
  iaHabilitada?: boolean;
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

/** Banco configurable por admin (destino de transferencias). */
export interface Banco {
  id: string;
  nombre: string;
  activo: boolean;
  orden?: number;
  /** Número de cuenta */
  numeroCuenta?: string;
  /** Tipo de cuenta */
  tipoCuenta?: 'ahorro' | 'corriente';
  /** Titular de la cuenta */
  titular?: string;
  /** RNC (cuando el titular es una empresa) */
  rnc?: string;
  /** Cédula (cuando el titular es persona física) */
  cedula?: string;
  /** Email para comprobantes (opcional) */
  emailComprobante?: string;
  createdAt: Date;
  updatedAt?: Date;
}

/** Datos de seed para los bancos reales de Mister Service RD. */
export interface BancoSeed {
  nombre: string;
  numeroCuenta: string;
  tipoCuenta: 'ahorro' | 'corriente';
  titular: string;
  rnc?: string;
  cedula?: string;
  emailComprobante?: string;
}

export const BANCOS_RD_SEED: BancoSeed[] = [
  {
    nombre: 'Banco Popular',
    numeroCuenta: '843776782',
    tipoCuenta: 'corriente',
    titular: 'Fixman SRL',
    rnc: '133-118191',
    emailComprobante: 'misterservicerd@gmail.com',
  },
  {
    nombre: 'BHD',
    numeroCuenta: '27792170018',
    tipoCuenta: 'ahorro',
    titular: 'Jorge L. Brito',
    cedula: '229-0015616-1',
    emailComprobante: 'misterservicerd@gmail.com',
  },
  {
    nombre: 'Banreservas',
    numeroCuenta: '9600374955',
    tipoCuenta: 'ahorro',
    titular: 'Jorge L. Brito',
    cedula: '229-0015616-1',
    emailComprobante: 'misterservicerd@gmail.com',
  },
  {
    nombre: 'Banco Santa Cruz',
    numeroCuenta: '11342010005405',
    tipoCuenta: 'ahorro',
    titular: 'Jorge L. Brito',
    cedula: '229-0015616-1',
    emailComprobante: 'misterservicerd@gmail.com',
  },
  {
    nombre: 'Scotiabank',
    numeroCuenta: '86209610981',
    tipoCuenta: 'ahorro',
    titular: 'Jorge L. Brito',
    cedula: '229-0015616-1',
    emailComprobante: 'misterservicerd@gmail.com',
  },
];

/**
 * Pago registrado sobre una orden. Una orden puede tener varios pagos
 * (abonos parciales) que se suman en `montoPagado` a nivel de la orden.
 */
export interface PagoOrden {
  id: string;
  metodo: 'efectivo' | 'transferencia' | 'tarjeta';
  monto: number;
  fecha: Date;
  // Si efectivo
  recibidoPorId?: string;
  recibidoPorNombre?: string;
  // Si transferencia o tarjeta
  bancoId?: string;
  bancoNombre?: string;
  referencia?: string;
  notas?: string;
  // Quién registró el pago (operaria/admin)
  registradoPorId: string;
  registradoPorNombre: string;
}

export type EstadoPagoOrden = 'pendiente' | 'parcial' | 'completo';

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

/**
 * Registro de inicio de chequeo por parte del técnico al llegar al sitio.
 * Se genera con una foto + GPS desde la vista del técnico.
 */
export interface InicioChequeo {
  fechaInicio: Date;
  tecnicoId: string;
  tecnicoNombre: string;
  fotoUrl: string;
  lat?: number;
  lng?: number;
  distanciaClienteMetros?: number;
  gpsVerificado?: boolean;
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
  // Piezas utilizadas en el servicio (Fase A1 — captura técnico)
  piezasUsadas?: PiezaUsada[];
  piezasValidadasPorAdmin?: boolean;
  piezasValidadasEn?: Timestamp | Date;
  piezasValidadasPor?: string;
  // Wizard completo (legacy — para órdenes cerradas con el formato anterior)
  piezasRetiradas?: PiezaRetirada[];
  piezasInstaladas?: PiezaInstalada[];
  checklist?: ChecklistItem[];
  descripcionTrabajo?: string;
  trabajoPendiente?: string;
  satisfaccionCliente?: number;
}

export type CondicionPieza = 'nueva' | 'usada';

export type OrigenPieza =
  | 'inventario_taller'          // del almacén general
  | 'inventario_vehiculo'         // de lo que el técnico lleva en su vehículo
  | 'comprada_externamente';      // comprada en la calle/ferretería sin registro en inventario

/**
 * Pieza utilizada por el técnico en una orden de servicio. Se captura al
 * cerrar la orden y queda pendiente de validación por admin (Fase A2).
 */
export interface PiezaUsada {
  id: string;                     // generado al crear (crypto.randomUUID)
  nombre: string;                 // requerido
  marca?: string;
  modelo?: string;
  condicion: CondicionPieza;      // requerido
  origen: OrigenPieza;            // requerido
  cantidad: number;               // requerido, default 1
  costoUnitario: number;          // requerido, RD$, puede ser 0
  costoTotal: number;              // computed: cantidad × costoUnitario
  proveedor?: string;              // útil si origen = comprada_externamente
  fotoUrl?: string;                // subida a Firebase Storage
  notas?: string;
  registradaPor: string;           // uid del técnico
  registradaPorNombre: string;     // snapshot
  /** Persistido como Timestamp; leído como Date tras parseOrden. Acepta
   *  ambos para permitir escrituras directas (Timestamp) y lecturas
   *  ya hidratadas (Date). */
  registradaEn: Timestamp | Date;
  aprobadaPorAdmin?: boolean;      // default false — lo llena admin en Fase A2
  aprobadaEn?: Timestamp | Date;
  aprobadaPor?: string;
  /** Si el admin edita piezas registradas por el técnico (Fase A2) se
   *  conserva el registradaPor/registradaPorNombre/registradaEn originales,
   *  y se anotan estos campos para trazabilidad. */
  editadaPor?: string;
  editadaEn?: Timestamp | Date;
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

export type TipoNotificacion =
  | 'precio_aprobado'
  | 'nueva_cita'
  | 'recordatorio'
  | 'pieza_llego'
  | 'orden_asignada'
  | 'orden_enviada_a_facturacion'
  | 'chequeo_iniciado'
  | 'otro';

export interface Notificacion {
  id: string;
  destinatarioId: string;
  destinatarioNombre?: string;
  tipo: TipoNotificacion;
  titulo: string;
  mensaje: string;
  ordenId?: string;
  ordenNumero?: string;
  leida: boolean;
  createdAt: Date;
  leidaEn?: Date;
}

export type TipoRecordatorio = 'ruta_manana' | 'horarios_clientes';

export interface ItemAviso {
  ordenId: string;
  ordenNumero: string;
  clienteNombre: string;
  clienteTelefono?: string;
  horaEstimada?: string;
  avisado: boolean;
  avisadoEn?: Date;
}

export interface RecordatorioDiario {
  id: string;
  fecha: string; // 'YYYY-MM-DD'
  operariaId: string;
  operariaNombre: string;
  tipo: TipoRecordatorio;
  completado: boolean;
  completadoEn?: Date;
  items?: ItemAviso[];
  notificadoAAdmin?: boolean;
  createdAt: Date;
}
