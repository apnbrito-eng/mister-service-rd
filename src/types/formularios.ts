import { Timestamp } from 'firebase/firestore';

// === Empresas Aliadas ===
export interface EmpresaAliada {
  id: string;
  nombre: string;
  logoUrl: string;
  contactoNombre: string;
  contactoTelefono: string;
  contactoEmail: string;
  activa: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// === Campos del Formulario ===
export type TipoCampo =
  | 'texto'
  | 'numero'
  | 'email'
  | 'telefono'
  | 'textarea'
  | 'seleccion'
  | 'seleccion_multiple'
  | 'checkbox'
  | 'fecha'
  | 'direccion'
  | 'foto'
  | 'archivo'
  | 'firma'
  | 'ubicacion';

export interface CampoFormulario {
  id: string;
  tipo: TipoCampo;
  etiqueta: string;
  placeholder: string;
  requerido: boolean;
  opciones: string[];
  orden: number;
}

export const CAMPOS_ESTANDAR: CampoFormulario[] = [
  { id: 'nombre', tipo: 'texto', etiqueta: 'Nombre completo', placeholder: 'Ej: Juan Pérez', requerido: true, opciones: [], orden: 0 },
  { id: 'telefono', tipo: 'telefono', etiqueta: 'Teléfono', placeholder: 'Ej: 829-555-1234', requerido: true, opciones: [], orden: 1 },
  { id: 'email', tipo: 'email', etiqueta: 'Correo electrónico', placeholder: 'Ej: correo@ejemplo.com', requerido: false, opciones: [], orden: 2 },
];

// === Formulario ===
export interface FormularioServicio {
  id: string;
  empresaId: string;
  empresaNombre: string;
  nombre: string;
  slug: string;
  descripcion: string;
  tipoServicio: 'reparacion' | 'instalacion' | 'mantenimiento' | 'otro';
  camposEstandar: CampoFormulario[];
  camposPersonalizados: CampoFormulario[];
  activo: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// === Solicitud ===
export type EstadoSolicitud = 'pendiente' | 'revisada' | 'aprobada' | 'rechazada' | 'convertida';

export interface ArchivoSolicitud {
  campoId: string;
  url: string;
  nombre: string;
}

export interface SolicitudServicio {
  id: string;
  formularioId: string;
  formularioNombre: string;
  empresaId: string;
  empresaNombre: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  datos: Record<string, any>;
  archivos: ArchivoSolicitud[];
  estado: EstadoSolicitud;
  ordenId?: string;
  notas: string;
  ubicacion?: { lat: number; lng: number };
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
