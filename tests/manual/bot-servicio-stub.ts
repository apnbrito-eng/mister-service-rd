import { CONFIG_BOT_INICIAL, evaluarBot } from '../../api/_lib/politicaBotServicio';
let config = structuredClone(CONFIG_BOT_INICIAL);
let runtime = { habilitado: false, version: 0, phoneNumberId: '', permitirHorarioLaboral: false, equipos: [] as { id: string; operariaUid: string; secretariaUid: string }[] };
const presupuestoReal = { dia: { periodo: '2026-09-28', comprometido: 0, limite: 5_000_000 }, mes: { periodo: '2026-09', comprometido: 0, limite: 50_000_000 } };
const presupuesto = { dia: { periodo: '2026-09-28', comprometido: 4_000_000, limite: 5_000_000 }, mes: { periodo: '2026-09', comprometido: 8_000_000, limite: 50_000_000 } };
export async function equipoApi(_ruta: string, body?: Record<string, any>) {
  if (!body) return { servidorPreparado: false, runtime: structuredClone(runtime), presupuestoReal: structuredClone(presupuestoReal), config: structuredClone(config), presupuesto: structuredClone(presupuesto), envioDisponible: false, personas: [
    { uid: 'qa-op1', nombre: 'Operaria de prueba 1', rol: 'operaria' }, { uid: 'qa-op2', nombre: 'Operaria de prueba 2', rol: 'operaria' },
    { uid: 'qa-sec1', nombre: 'Secretaria de prueba 1', rol: 'secretaria' }, { uid: 'qa-sec2', nombre: 'Secretaria de prueba 2', rol: 'secretaria' },
  ] };
  if (body.accion === 'estado') runtime = { ...runtime, habilitado: body.habilitado, version: runtime.version + 1 };
  if (body.accion === 'guardar') config = structuredClone(body.config);
  if (body.accion === 'ampliar') (body.destino === 'produccion' ? presupuestoReal : presupuesto)[body.periodo as 'dia' | 'mes'].limite = body.limiteMicroUsd;
  if (body.accion === 'preparar') runtime = { habilitado: false, version: runtime.version + 1, phoneNumberId: '123', permitirHorarioLaboral: body.permitirHorarioLaboral, equipos: structuredClone(body.equipos) };
  if (body.accion === 'simular') return { resultado: evaluarBot(config, { ahora: Date.now(), pideHumano: body.pideHumano, baja: body.baja, ventanaAbierta: body.ventanaAbierta, datos: body.datos }) };
  return { ok: true, envioDisponible: false };
}
