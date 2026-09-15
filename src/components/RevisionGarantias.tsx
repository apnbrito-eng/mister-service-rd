import { useState } from 'react';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { db } from '../firebase/config';
import { aplicarDescuentoGarantiaPorPiezas } from '../utils/comisiones';
import { formatMoneda } from '../utils';
import type { OrdenServicio } from '../types';

export default function RevisionGarantias({ uid, nombre }: { uid: string; nombre: string }) {
  const [ordenes, setOrdenes] = useState<OrdenServicio[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [parcial, setParcial] = useState(false);
  const [error, setError] = useState('');
  const [seleccion, setSeleccion] = useState<OrdenServicio | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const costo = (o: OrdenServicio) => (o.cierreServicio?.piezasUsadas || []).reduce((sum,p) => sum + p.cantidad * p.costoUnitario, 0);
  const cargar = async () => {
    setCargando(true); setError(''); setSeleccion(null); setMensaje('');
    try {
      const [os, cs] = await Promise.all([
        getDocs(query(collection(db, 'ordenes_servicio'), where('esGarantia', '==', true), limit(101))),
        getDocs(collection(db, 'comisiones')),
      ]);
      const aplicadas = new Map<string, number>();
      cs.docs.forEach(d => {
        const c = d.data();
        const eventos = Array.isArray(c.ajustesGarantia) ? c.ajustesGarantia : [c.descuentoPorGarantia];
        eventos.forEach((e: { ordenIdReasignada?: string } | undefined) => { if(e?.ordenIdReasignada) aplicadas.set(e.ordenIdReasignada, Number((e as { monto?: number }).monto)); });
      });
      setParcial(os.size > 100);
      setOrdenes(os.docs.slice(0,100).filter(d => !d.data().eliminada)
        .map(d => ({ ...d.data(), id:d.id } as OrdenServicio))
        .filter(o => aplicadas.get(o.id) !== -Math.round(costo(o) * 10) / 100)
        .filter(o => !!o.cierreServicio?.fechaCierre && (o.cierreServicio.piezasUsadas?.length || 0) > 0));
    } catch { setError('No se pudieron revisar las garantías. Intenta cargar de nuevo.'); }
    finally { setCargando(false); }
  };
  const aplicar = async () => {
    if (!seleccion || guardando) return;
    setGuardando(true); setError('');
    try {
      const resultado = await aplicarDescuentoGarantiaPorPiezas({
        ordenGarantiaId:seleccion.id, ordenOriginalId:seleccion.referenciaOrdenId || '',
        tecnicoOriginalUid:seleccion.tecnicoOriginalUid || '', costoPiezasReReparacion:costo(seleccion),
        facturaIdReasignada:seleccion.referenciaFacturaId, conduceNumeroOriginal:seleccion.referenciaConduce,
        solicitanteUid:uid, solicitanteNombre:nombre,
      });
      if (!resultado.aplicado) throw new Error(resultado.razon || 'No se pudo aplicar el ajuste.');
      setOrdenes(prev => prev?.filter(o=>o.id!==seleccion.id) || []);
      setSeleccion(null); setMensaje('Ajuste registrado. Los reintentos no duplican el descuento.');
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo aplicar el ajuste.'); }
    finally { setGuardando(false); }
  };
  return <section className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3" aria-label="Revisión de garantías">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="font-semibold text-gray-900">Ajustes por garantía</h2>
        <p className="text-sm text-gray-600">Revisa el 10% del costo de piezas antes de aplicarlo a la comisión original.</p></div>
      <button type="button" onClick={cargar} disabled={cargando || guardando} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">{cargando ? 'Cargando…' : 'Revisar garantías'}</button>
    </div>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {mensaje && <p role="status" className="text-sm text-green-700">{mensaje}</p>}
    {parcial && <p className="text-sm text-amber-800">Se revisaron solo las primeras 100 garantías. Esta lista no cubre todo el historial.</p>}
    {ordenes?.length === 0 && <p className="text-sm text-gray-600">No hay ajustes pendientes en las garantías revisadas.</p>}
    {ordenes?.map(o => {
      const total = costo(o);
      const lista = o.cierreServicio?.piezasValidadasPorAdmin === true && !!o.referenciaOrdenId && !!o.tecnicoOriginalUid && Number.isFinite(total) && total > 0;
      return <div key={o.id} className="flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-sm">
        <div><Link className="text-primary underline" to={`/admin/ordenes/${o.id}`}>{o.numero || 'Orden de garantía'}</Link>
          <p>Piezas: {Number.isFinite(total) ? formatMoneda(total) : 'Revisar costos'} · Ajuste: {Number.isFinite(total) ? formatMoneda(Math.round(total * 10) / 100) : 'Sin calcular'}</p>
          {!lista && <p className="text-amber-800">Revisa las referencias y valida las piezas en Conduces pendientes.</p>}</div>
        <button type="button" className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed" disabled={!lista || guardando} onClick={()=>{setSeleccion(o);setError('');setMensaje('');}}>Revisar importe</button>
      </div>;
    })}
    {seleccion && <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 space-y-3" role="region" aria-label="Confirmar ajuste de garantía">
      <p className="text-sm">Se descontarán <strong>{formatMoneda(Math.round(costo(seleccion) * 10) / 100)}</strong> de la comisión del técnico original de {seleccion.numero}. Se conservará el historial anterior. Una comisión liquidada o ambigua quedará pendiente de revisión.</p>
      <div className="flex gap-3"><button type="button" className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed" onClick={aplicar} disabled={guardando}>{guardando ? 'Guardando…' : 'Confirmar ajuste'}</button>
        <button type="button" className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed" onClick={()=>setSeleccion(null)} disabled={guardando}>Cancelar</button></div>
    </div>}
  </section>;
}
