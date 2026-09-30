import { useState } from 'react';
import { prepararDuplicadosComision, resolverDuplicadosComision, type GrupoDuplicado } from '../services/conciliarDuplicadosComision.service';
import { formatMoneda } from '../utils';
export default function ConciliarDuplicadosComision({ grupos, administrador }: { grupos: { ordenId: string; personalId: string; nombre: string }[]; administrador: boolean }) {
  const [grupo, setGrupo] = useState<GrupoDuplicado | null>(null), [elegida, setElegida] = useState(''), [motivo, setMotivo] = useState(''), [aviso, setAviso] = useState(''), [ocupado, setOcupado] = useState(false);
  if (!grupos.length && !grupo) return null;
  return <section className="border border-amber-300 rounded-xl p-4 space-y-3">
    <h2 className="font-semibold">Comisiones duplicadas: revisión administrativa</h2>
    <p>Compara importes, costos y ajustes de garantía. Ningún registro se elige automáticamente; si hay una comisión liquidada, sólo podrás conservar esa comisión y se verificará su nómina cerrada. Dos liquidadas requieren revisión del historial.</p>
    {grupos.map(g => <button key={`${g.ordenId}:${g.personalId}`} disabled={!administrador || ocupado} className="border rounded p-2 mr-2" onClick={async () => { setOcupado(true); setAviso(''); try { setGrupo(await prepararDuplicadosComision(g.ordenId, g.personalId)); setElegida(''); setMotivo(''); } catch(e) { setAviso((e as Error).message); } finally { setOcupado(false); } }}>Revisar {g.nombre} · orden {g.ordenId}</button>)}
    {grupo && <div>
      {grupo.registros.map(c => <label key={c.id} className="block border p-3 my-2"><input type="radio" name="comision-valida" checked={elegida === c.id} disabled={ocupado} onChange={() => setElegida(c.id)} /> Conservar {c.id} · comisión {formatMoneda(Number(c.datos.comisionMonto))} · costo piezas {formatMoneda(Number(c.datos.costoPiezas || 0))} · ajuste garantía {formatMoneda(Number((c.datos.descuentoPorGarantia as {monto?: number} | undefined)?.monto || 0))} · {String(c.datos.estadoLiquidacion || 'pendiente')}</label>)}
      <label>Evidencia y motivo<textarea className="block border p-2 w-full" value={motivo} maxLength={1000} disabled={ocupado} onChange={e => setMotivo(e.target.value)} /></label>
      <p className="text-sm">Al confirmar se conservará el elegido y se marcarán los demás como anulados por duplicidad. Después actualiza las comisiones del empleado en Nómina.</p>
      <button disabled={ocupado} onClick={() => setGrupo(null)} className="border p-2">Cancelar</button>
      <button disabled={!administrador || ocupado || !elegida || motivo.trim().length < 10} className="border p-2" onClick={async () => { setOcupado(true); try { await resolverDuplicadosComision(grupo, elegida, motivo); setGrupo(null); setAviso('Conciliación auditada. Actualiza las comisiones del empleado en Nómina.'); } catch(e) { setAviso((e as Error).message); } finally { setOcupado(false); } }}>Confirmar selección y anular duplicados</button>
    </div>}
    {aviso && <p role="status">{aviso}</p>}
  </section>;
}
