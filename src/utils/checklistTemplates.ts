import { ChecklistItem } from '../types';

type Template = Omit<ChecklistItem, 'respuesta' | 'explicacion'>;

const LAVADORA: Template[] = [
  { id: 'mangueras', pregunta: '¿Verificaste que las mangueras de agua (entrada y salida) están correctamente conectadas y sin fugas?', critica: true },
  { id: 'desague', pregunta: '¿La manguera de desagüe está colocada a la altura correcta (no está tirada en el suelo)?', critica: true },
  { id: 'ciclo', pregunta: '¿Realizaste una prueba de ciclo completo (lavado y centrifugado)?' },
  { id: 'nivel', pregunta: '¿El equipo quedó nivelado en su posición final?' },
  { id: 'area', pregunta: '¿Hiciste una revisión de 360° del área de trabajo (no dejaste herramientas ni piezas sueltas)?' },
  { id: 'cliente', pregunta: '¿El cliente presenció la prueba de funcionamiento?' },
];

const NEVERA: Template[] = [
  { id: 'enfria', pregunta: '¿Verificaste que el equipo enfría correctamente después del servicio?', critica: true },
  { id: 'temperatura', pregunta: '¿La temperatura está dentro del rango normal?' },
  { id: 'juntas', pregunta: '¿Las juntas de la puerta cierran herméticamente?' },
  { id: 'area', pregunta: '¿Hiciste una revisión de 360° del área de trabajo?' },
  { id: 'cliente', pregunta: '¿El cliente presenció la prueba de funcionamiento?' },
];

const AIRE_ACONDICIONADO: Template[] = [
  { id: 'enfria', pregunta: '¿Verificaste que el equipo enfría y el compresor está funcionando correctamente?', critica: true },
  { id: 'filtros', pregunta: '¿Limpiaste o revisaste los filtros?' },
  { id: 'drenajes', pregunta: '¿Los drenajes están destapados y funcionando?' },
  { id: 'cables', pregunta: '¿No quedaron cables expuestos o conexiones sueltas?', critica: true },
  { id: 'area', pregunta: '¿Hiciste una revisión de 360° del área de trabajo?' },
  { id: 'cliente', pregunta: '¿El cliente presenció la prueba de funcionamiento?' },
];

const ESTUFA: Template[] = [
  { id: 'quemadores', pregunta: '¿Verificaste que todos los quemadores encienden correctamente?', critica: true },
  { id: 'gas', pregunta: '¿No hay fugas de gas (si aplica)?', critica: true },
  { id: 'horno', pregunta: '¿El horno funciona a temperatura correcta?' },
  { id: 'area', pregunta: '¿Hiciste una revisión de 360° del área de trabajo?' },
  { id: 'cliente', pregunta: '¿El cliente presenció la prueba de funcionamiento?' },
];

const SECADORA: Template[] = [
  { id: 'calienta', pregunta: '¿Verificaste que el equipo calienta correctamente?', critica: true },
  { id: 'ducto', pregunta: '¿El ducto de ventilación está conectado y sin obstrucciones?', critica: true },
  { id: 'ciclo', pregunta: '¿Realizaste una prueba de ciclo completo?' },
  { id: 'area', pregunta: '¿Hiciste una revisión de 360° del área de trabajo?' },
  { id: 'cliente', pregunta: '¿El cliente presenció la prueba de funcionamiento?' },
];

const OTRO: Template[] = [
  { id: 'funciona', pregunta: '¿El equipo funciona correctamente después del servicio?', critica: true },
  { id: 'prueba', pregunta: '¿Realizaste prueba de funcionamiento?' },
  { id: 'area', pregunta: '¿Hiciste una revisión de 360° del área de trabajo?' },
  { id: 'cliente', pregunta: '¿El cliente presenció la prueba de funcionamiento?' },
];

export function getChecklistTemplate(equipoTipo: string): ChecklistItem[] {
  const tipo = equipoTipo.toLowerCase();
  let template: Template[] = OTRO;

  if (tipo.includes('lavadora')) template = LAVADORA;
  else if (tipo.includes('secadora')) template = SECADORA;
  else if (tipo.includes('nevera') || tipo.includes('refrigerador')) template = NEVERA;
  else if (tipo.includes('aire') || tipo.includes('a/c') || tipo.includes('ac')) template = AIRE_ACONDICIONADO;
  else if (tipo.includes('estufa') || tipo.includes('cocina')) template = ESTUFA;

  return template.map(t => ({ ...t, respuesta: null, explicacion: '' }));
}
