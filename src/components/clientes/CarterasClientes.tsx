import { useState } from 'react';
import type { Cliente, CarteraEquipo } from '../../types';
import { gestionarCartera, leerHistorialCartera } from '../../services/carteraClientes.service';
import toast from 'react-hot-toast';

export default function CarterasClientes({ clientes, puedeTrasladar, abrir }: { clientes: Cliente[]; puedeTrasladar: boolean; abrir: (cliente: Cliente) => void }) {
  const [historial, setHistorial] = useState<Awaited<ReturnType<typeof leerHistorialCartera>>>([]);
  const [clienteHistorial, setClienteHistorial] = useState<Cliente | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [traslado, setTraslado] = useState<Cliente | null>(null);
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [solicitudId, setSolicitudId] = useState('');
  const filtrados = clientes.filter(c => !c.eliminado && !c.mergedaCon && `${c.nombre} ${c.telefono}`.toLowerCase().includes(busqueda.toLowerCase()));
  async function guardar() {
    if (!traslado || guardando) return;
    setGuardando(true);
    try {
      await gestionarCartera({ clienteId: traslado.id, accion: 'trasladar', destino: traslado.carteraEquipo === 'A' ? 'B' : 'A', motivo, solicitudId });
      toast.success('Cliente trasladado. El motivo quedó registrado.');
      setTraslado(null);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'No se pudo trasladar.'); }
    finally { setGuardando(false); }
  }
  return <section className="space-y-4" aria-label="Carteras de clientes">
    <label className="block">Buscar cliente<input className="input mt-1 w-full" value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Nombre o teléfono" /></label>
    <div className="grid gap-4 lg:grid-cols-2">{(['A', 'B'] as CarteraEquipo[]).map(equipo => {
      const lista = filtrados.filter(c => c.carteraEquipo === equipo);
      return <section key={equipo} className="rounded-xl border bg-white p-4"><h2 className="font-semibold">Equipo {equipo} · {lista.length}</h2>
        <div className="max-h-[65vh] overflow-auto divide-y">{lista.slice(0, 100).map(cliente => <div key={cliente.id} className="py-3 flex justify-between gap-3"><button type="button" className="text-left flex-1" onClick={() => abrir(cliente)}><span className="block font-medium">{cliente.nombre}</span><span className="text-sm text-gray-500">{cliente.telefono}</span></button><button type="button" className="text-sm text-blue-800" onClick={async () => { try { const datos = await leerHistorialCartera(cliente.id); setHistorial(datos); setClienteHistorial(cliente); } catch { toast.error('No se pudo cargar el historial.'); } }}>Historial</button>{puedeTrasladar && <button type="button" className="text-sm text-blue-800" onClick={() => { setTraslado(cliente); setMotivo(''); setSolicitudId(crypto.randomUUID()); }}>Mover a {equipo === 'A' ? 'B' : 'A'}</button>}</div>)}</div>
        {lista.length > 100 && <p className="text-sm mt-3">Se muestran 100 de {lista.length}. Usa la búsqueda para localizar al cliente.</p>}
        {!lista.length && <p className="text-gray-500 py-4">No hay clientes en esta cartera.</p>}
      </section>;
    })}</div>
    <details className="rounded-xl border bg-white p-4"><summary>Sin cartera · {filtrados.filter(c => !c.carteraEquipo).length}</summary><p className="text-sm text-gray-500">La asignación inicial requiere completar el reparto controlado; no modifica órdenes ni técnicos.</p></details>
    {clienteHistorial && <section className="rounded-xl border bg-white p-4"><div className="flex justify-between"><h2>Historial de cartera · {clienteHistorial.nombre}</h2><button type="button" onClick={() => setClienteHistorial(null)}>Cerrar</button></div>{historial.length ? historial.map(entry => <div key={entry.id} className="border-t py-3"><p>{entry.anteriorEquipo || 'Sin cartera'} → {entry.nuevoEquipo} · {entry.actorNombre}</p><p className="text-sm text-gray-500">{entry.motivo}</p></div>) : <p>No hay movimientos registrados.</p>}<p className="text-xs text-gray-500">Últimos 20 movimientos.</p></section>}
    {traslado && <div role="dialog" aria-modal="true" aria-labelledby="titulo-traslado" className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"><div className="bg-white rounded-xl p-6 max-w-lg w-full space-y-4"><h2 id="titulo-traslado" className="font-semibold">Trasladar a {traslado.carteraEquipo === 'A' ? 'B' : 'A'}: {traslado.nombre}</h2><p className="text-sm">Se registra tu identidad y el motivo. Las órdenes existentes conservan sus responsables.</p><label className="block">Motivo del traslado<textarea className="input w-full mt-1" minLength={5} maxLength={500} value={motivo} onChange={e => setMotivo(e.target.value)} /></label><div className="flex justify-end gap-3"><button type="button" disabled={guardando} onClick={() => setTraslado(null)}>Cancelar</button><button type="button" className="btn-primary" disabled={guardando || motivo.trim().length < 5} onClick={() => void guardar()}>{guardando ? 'Guardando…' : 'Guardar traslado'}</button></div></div></div>}
  </section>;
}
