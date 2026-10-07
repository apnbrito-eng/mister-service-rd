import {
  LayoutDashboard, ClipboardList, Calendar, Map,
  Users, UserCog, FileText, Settings, Wrench,
  TrendingUp, DollarSign, Bell, Clock, 
  Receipt, ShoppingBag, CalendarDays, Globe, Building2, Inbox, ClipboardCheck, Tag, Boxes, Wallet, XCircle,
  CalendarCheck, Sparkles, History, Star, RefreshCw, Banknote,
  MessageSquare, BarChart3, BookOpen,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Usuario } from '../types';
import { puede, type AccionPermiso } from '../utils/permisos';
export type SidebarItem = {
  to: string;
  icon: LucideIcon;
  label: string;
  show: boolean;
  badge?: number;
  active?: boolean;
};

export type SidebarSection = {
  id: string;
  label: string;
  icon: LucideIcon;
  items: SidebarItem[];
  defaultExpanded: boolean;
};

export type SidebarNode =
  | { kind: 'item'; item: SidebarItem }
  | { kind: 'section'; section: SidebarSection };

export function obtenerAreas(userProfile: Usuario | null, counts: Partial<Record<string, number>> = {}): SidebarNode[] {
const standbyCount = counts.standbyCount ?? 0;
const ordenesStandbyCount = counts.ordenesStandbyCount ?? 0;
const citasCount = counts.citasCount ?? 0;
const solicitudesCount = counts.solicitudesCount ?? 0;
const facturacionPendienteCount = counts.facturacionPendienteCount ?? 0;
const sugerenciasChequeoCount = counts.sugerenciasChequeoCount ?? 0;
const reprogramacionesCount = counts.reprogramacionesCount ?? 0;
const whatsappInboxCount = counts.whatsappInboxCount ?? 0;
const pagosPendientesCount = counts.pagosPendientesCount ?? 0;
  const esAdminOCoord = userProfile?.rol === 'administrador' || userProfile?.rol === 'coordinadora';
  const isOperaria = userProfile?.rol === 'operaria' || esAdminOCoord;
  const isSecretaria = userProfile?.rol === 'secretaria' || esAdminOCoord;
  // Permisos granulares
  const p = (acc: AccionPermiso) => puede(userProfile, acc);

  const estructura: SidebarNode[] = [
    { kind: 'section', section: { id: 'v2_mi_dia', label: 'Mi día', icon: LayoutDashboard, defaultExpanded: true, items: [
      { to: '/admin/dashboard', icon: LayoutDashboard, label: 'Resumen de hoy', show: true },
      { to: '/ponche', icon: Clock, label: 'Ponche', show: true },
    ] } },
    { kind: 'section', section: { id: 'v2_atencion', label: 'Atención y clientes', icon: MessageSquare, defaultExpanded: false, items: [
      { to: '/admin/inbox', icon: MessageSquare, label: 'Inbox WhatsApp', badge: whatsappInboxCount, show: esAdminOCoord || isOperaria || isSecretaria },
      { to: '/admin/clientes-responsables', icon: Users, label: 'Clientes y responsables', show: userProfile?.rol === 'administrador' || userProfile?.rol === 'coordinadora' },
      { to: '/admin/clientes', icon: Users, label: 'Clientes', show: p('clientesVer') },
      { to: '/admin/solicitudes', icon: Inbox, label: 'Solicitudes', badge: solicitudesCount, show: userProfile?.rol === 'administrador' },
      { to: '/admin/citas', icon: Bell, label: 'Citas por Confirmar', badge: citasCount, show: p('ordenesVer') },
      { to: '/admin/empresas-aliadas', icon: Building2, label: 'Empresas Aliadas', show: userProfile?.rol === 'administrador' },
    ] } },
    { kind: 'section', section: { id: 'v2_servicios', label: 'Servicios', icon: ClipboardList, defaultExpanded: false, items: [
      { to: '/admin/ordenes', icon: ClipboardList, label: 'Órdenes', show: p('ordenesVer') },
      { to: '/admin/agenda-dia', icon: CalendarCheck, label: 'Agenda del Día', show: p('ordenesVer') },
      { to: '/admin/operaciones', icon: LayoutDashboard, label: 'Centro de operaciones', show: p('ordenesVer') },
      { to: '/admin/calendario', icon: Calendar, label: 'Calendario', show: p('ordenesVer') },
      { to: '/admin/mapa', icon: Map, label: 'Mapa de operaciones', show: p('ordenesVer') },
      { to: '/admin/mapa-rutas-anterior', icon: Map, label: 'Mapa de Rutas (anterior)', show: p('ordenesVer') },
      { to: '/admin/reprogramaciones', icon: RefreshCw, label: 'Reprogramaciones', badge: reprogramacionesCount, show: esAdminOCoord },
      { to: '/admin/sugerencias-chequeo', icon: ClipboardCheck, label: 'Sugerencias chequeo', badge: sugerenciasChequeoCount, show: esAdminOCoord },
      { to: '/admin/standby', icon: Clock, label: 'Pendiente de piezas', badge: standbyCount + ordenesStandbyCount, show: p('ordenesVer') },
      { to: '/admin/taller', icon: Wrench, label: 'Equipos Taller', show: p('ordenesVer') },
      { to: '/admin/mantenimiento', icon: Calendar, label: 'Mantenimiento', show: p('ordenesVer') },
      { to: '/admin/historial-anuladas', icon: XCircle, label: 'Historial Anuladas', show: esAdminOCoord || p('ordenesVerEliminadas') },
      { to: '/admin/calendarios', icon: CalendarDays, label: 'Calendarios públicos (Calendly)', show: esAdminOCoord || isOperaria || isSecretaria },
    ] } },
    { kind: 'section', section: { id: 'v2_caja', label: 'Caja y administración', icon: Receipt, defaultExpanded: false, items: [
      { to: '/admin/cotizaciones', icon: FileText, label: 'Cotizaciones', show: p('cotizacionesVer') },
      { to: '/admin/pagos-pendientes', icon: Banknote, label: 'Pagos pendientes', badge: pagosPendientesCount, show: p('pagosVerificar') },
      { to: '/admin/facturacion-pendiente', icon: Inbox, label: 'Conduces Pendientes', badge: facturacionPendienteCount, show: esAdminOCoord },
      { to: '/admin/facturas', icon: Receipt, label: 'Conduces de Garantía', show: p('facturasVer') },
      { to: '/admin/cierre-dia', icon: ClipboardCheck, label: 'Cierre del Día', show: p('cierreDiaEjecutar') },
      { to: '/admin/gastos', icon: DollarSign, label: 'Gastos e Ingresos', show: p('gastosVer') },
      { to: '/admin/bancos', icon: Building2, label: 'Bancos', show: p('bancosGestionar') },
      { to: '/admin/estado-resultado', icon: TrendingUp, label: 'Estado de Resultado', show: esAdminOCoord },
      { to: '/admin/reporte-avanzado', icon: BarChart3, label: 'Reporte avanzado', show: esAdminOCoord },
    ] } },
    { kind: 'section', section: { id: 'v2_equipo', label: 'Equipo', icon: UserCog, defaultExpanded: false, items: [
      // SPRINT-DISENO-BAMBOO (2026-10-07): Personal + Usuarios & Permisos
      // unificados en una sola página con ficha BambooHR. `/admin/usuarios`
      // redirige acá para preservar bookmarks.
      { to: '/admin/personal', icon: UserCog, label: 'Personal y permisos', show: p('personalVer') || esAdminOCoord },
      { to: '/admin/ponches', icon: ClipboardCheck, label: 'Reporte de Ponches', show: esAdminOCoord },
      { to: '/admin/nomina', icon: Wallet, label: 'Nómina', show: esAdminOCoord },
      { to: '/admin/comisiones', icon: DollarSign, label: 'Comisiones', show: esAdminOCoord },
      { to: '/admin/avances', icon: Wallet, label: 'Avances a Empleados', show: p('avancesGestionar') },
      { to: '/admin/prestamos', icon: Banknote, label: 'Préstamos a Empleados', show: esAdminOCoord },
      { to: '/admin/rendimiento', icon: TrendingUp, label: userProfile?.rol === 'operaria' || userProfile?.rol === 'secretaria' ? 'Mi rendimiento' : 'Rendimiento', show: p('rendimientoVer') },
      { to: '/admin/metricas-mensuales', icon: TrendingUp, label: 'Métricas del Mes', show: p('rendimientoVer') },
    ] } },
    { kind: 'section', section: { id: 'v2_marketing', label: 'Marketing', icon: BarChart3, defaultExpanded: false, items: [
      { to: '/admin/marketing', icon: BarChart3, label: 'Marketing', show: esAdminOCoord },
      { to: '/admin/feedback', icon: Star, label: 'Feedback NPS', show: esAdminOCoord },
      { to: '/admin/web', icon: Globe, label: 'Página Web', show: userProfile?.rol === 'administrador' },
      { to: '/admin/formularios', icon: FileText, label: 'Formularios', show: userProfile?.rol === 'administrador' },
      { to: '/admin/configuracion-marketing', icon: Sparkles, label: 'Plantillas Marketing', show: userProfile?.rol === 'administrador' },
    ] } },
    { kind: 'section', section: { id: 'v2_recursos', label: 'Recursos', icon: BookOpen, defaultExpanded: false, items: [
      { to: '/admin/precios', icon: Tag, label: 'Precios de Servicios', show: p('configuracionVer') },
      { to: '/admin/inventario', icon: Boxes, label: 'Inventario', show: p('configuracionVer') },
      { to: '/admin/conocimiento', icon: BookOpen, label: 'Conocimientos', show: esAdminOCoord || isOperaria || isSecretaria },
      { to: '/admin/productos', icon: ShoppingBag, label: 'Catálogo', show: false },
    ] } },
    { kind: 'item', item: { to: '/admin/asistente', icon: Sparkles, label: 'Chat (pantalla completa)', show: userProfile?.rol === 'administrador' } },
    { kind: 'item', item: { to: '/admin/asistente/historial', icon: History, label: 'Historial IA', show: userProfile?.rol === 'administrador' } },
    { kind: 'item', item: { to: '/admin/configuracion', icon: Settings, label: 'Configuración', show: p('configuracionVer') } },
  ];


  const sections = estructura.filter((n): n is Extract<SidebarNode, {kind:'section'}> => n.kind === 'section');
  const get = (id: string) => sections.find(n => n.section.id === id)!.section;
  const caja = get('v2_caja'); caja.label = 'Contabilidad';
  const equipo = get('v2_equipo');
  const financieros = ['/admin/nomina','/admin/comisiones','/admin/avances','/admin/prestamos'];
  caja.items.push(...equipo.items.filter(i => financieros.includes(i.to)));
  equipo.items = equipo.items.filter(i => !financieros.includes(i.to));
  const marketing = get('v2_marketing'); marketing.label = 'Marketing y recursos';
  marketing.items.push(...get('v2_recursos').items);
  const ia = estructura.filter((n): n is Extract<SidebarNode,{kind:'item'}> => n.kind === 'item' && n.item.to.startsWith('/admin/asistente'));
  return [...sections.filter(n => n.section.id !== 'v2_recursos'),
    {kind:'section',section:{id:'ia',label:'Asistente IA',icon:Sparkles,defaultExpanded:false,items:ia.map(n=>n.item)}},
    ...estructura.filter(n => n.kind === 'item' && !n.item.to.startsWith('/admin/asistente'))];
}
export const areaPath = (id: string) => `/admin/area/${id.replace('v2_', '')}`;
