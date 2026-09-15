import ImportarConocimiento from '../components/ImportarConocimiento';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useCallback, useEffect, useState } from 'react';
import { BookOpen, Plus, Search, Check, Archive, RefreshCw } from 'lucide-react';
import { equipoApi } from '../services/equipoApi';
interface Aporte { id: string; titulo: string; contenido: string; estado: string; version: number }
export default function ConocimientoEquipo() {
  const { userProfile } = useApp();
  const [items, setItems] = useState<Aporte[]>([]);
  const [frecuentes, setFrecuentes] = useState<Array<{id: string; titulo: string; conversaciones: number}>>([]);
  const [revisar, setRevisar] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [titulo, setTitulo] = useState('');
  const [contenido, setContenido] = useState('');
  const [guardando, setGuardando] = useState(false);
  const cargar = useCallback(async () => {
    setCargando(true); setError('');
    try { const data = await equipoApi<{ items: Aporte[]; puedeAprobar: boolean; frecuentes: Array<{id: string; titulo: string; conversaciones: number}> }>('/api/ai/conocimiento'); setItems(data.items); setFrecuentes(data.frecuentes || []); setRevisar(data.puedeAprobar); }
    catch (e) { setError((e as Error).message); } finally { setCargando(false); }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);
  async function guardar(body: object) {
    setGuardando(true); setError(''); setAviso('');
    try { await equipoApi('/api/ai/conocimiento', body); setAviso('Cambio guardado. La IA consulta únicamente conocimientos aprobados.'); await cargar(); return true; }
    catch (e) { setError((e as Error).message); return false; } finally { setGuardando(false); }
  }
  const visibles = items.filter(i => i.estado !== 'archivado' && (i.titulo + ' ' + i.contenido).toLowerCase().includes(busqueda.toLowerCase()));
  return <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-6">
    <Link to={userProfile?.rol === 'tecnico' ? '/tecnico' : '/admin/dashboard'} className="inline-block text-sm text-primary underline py-2">Volver a mi trabajo</Link>
    <header><div className="flex items-center gap-3 text-primary"><BookOpen size={28} /><h1 className="text-2xl font-bold">Conocimiento del equipo</h1></div><p className="text-gray-600 mt-2">Lo que aprendemos trabajando, disponible para la próxima persona que lo necesite.</p></header>
    {error && <div role="alert" className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-800">{error}<button onClick={cargar} className="ml-3 underline">Reintentar</button></div>}
    {aviso && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-emerald-800">{aviso}</p>}
    {revisar && <ImportarConocimiento onGuardado={() => { void cargar(); }} />}
    {revisar && <section className="rounded-2xl border bg-white p-5 space-y-3"><h2 className="text-lg font-semibold">Lo que más pregunta el equipo</h2><p className="text-sm text-gray-600">Temas de nuevas consultas, agrupados por equipo y servicio. Cada conversación cuenta una vez por tema. No se guardan aquí mensajes ni datos personales. Una pregunta frecuente no se convierte sola en una respuesta aprobada.</p>{frecuentes.length === 0 ? <p className="text-gray-500">Los temas aparecerán al consultar mantenimiento, instalación o reparación de equipos.</p> : frecuentes.map(f => <div key={f.id} className="flex flex-wrap items-center justify-between gap-3 border-t pt-3"><div><p className="font-medium">{f.titulo}</p><p className="text-sm text-gray-500">{f.conversaciones} conversaciones</p></div><button type="button" className="text-primary underline" onClick={() => {setTitulo(f.titulo); setContenido(''); document.getElementById('aporte-titulo')?.focus();}}>Preparar respuesta revisada</button></div>)}</section>}
    <div className="grid lg:grid-cols-[1fr_360px] gap-6">
      <section className="space-y-4"><label className="flex gap-2 items-center rounded-xl bg-white border p-3"><Search size={20} /><input aria-label="Buscar conocimiento" className="w-full outline-none" placeholder="Buscar procedimiento, equipo o solución" value={busqueda} onChange={e => setBusqueda(e.target.value)} /></label>
        {cargando ? <p role="status">Cargando conocimientos…</p> : visibles.length === 0 ? <div className="bg-white border rounded-2xl p-8"><h2 className="font-semibold">Todavía no hay conocimientos para mostrar</h2><p className="text-gray-500 mt-2">Aporta una solución o cambia la búsqueda. Cada aporte se revisa antes de usarlo en la IA.</p></div> : visibles.map(i => <article key={i.id} className="rounded-2xl border bg-white p-5 shadow-sm"><span className={'text-xs font-medium rounded-full px-3 py-1 ' + (i.estado === 'aprobado' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800')}>{i.estado === 'aprobado' ? 'Disponible para la IA' : 'Pendiente de revisión'}</span><h2 className="font-semibold text-lg mt-3">{i.titulo}</h2><p className="text-gray-600 whitespace-pre-wrap mt-2">{i.contenido}</p>{revisar && <div className="flex gap-3 mt-4">{i.estado === 'pendiente' && <button disabled={guardando} onClick={() => guardar({ accion: 'aprobar', id: i.id, version: i.version })} className="inline-flex gap-2 items-center rounded-lg bg-primary text-white px-4 py-3"><Check size={16} />Aprobar</button>}<button disabled={guardando} onClick={() => guardar({ accion: 'archivar', id: i.id, version: i.version })} className="inline-flex gap-2 items-center rounded-lg border px-4 py-3"><Archive size={16} />Retirar</button></div>}</article>)}
        <p className="text-xs text-gray-500">Se muestran hasta 60 aprobados y 60 aportes en revisión. Solo guarda procedimientos generales; evita nombres, teléfonos, contraseñas y datos privados de clientes.</p>
      </section>
      <form className="rounded-2xl bg-white border p-5 h-fit space-y-4" onSubmit={async e => { e.preventDefault(); if (await guardar({ accion: 'crear', titulo, contenido })) { setTitulo(''); setContenido(''); } }}><h2 className="font-semibold text-lg">Comparte lo que aprendiste</h2><label className="block text-sm font-medium">Título<input id="aporte-titulo" required minLength={5} maxLength={120} value={titulo} onChange={e => setTitulo(e.target.value)} className="mt-2 border rounded-lg w-full p-3" placeholder="Ej.: Preparar una visita técnica" /></label><label className="block text-sm font-medium">Procedimiento y cuándo aplica<textarea required minLength={20} maxLength={4000} rows={8} value={contenido} onChange={e => setContenido(e.target.value)} className="mt-2 border rounded-lg w-full p-3" placeholder="Describe los pasos, lo que funcionó y las excepciones." /></label><p className="text-sm text-gray-500">Administración o coordinación revisará el aporte antes de que la IA lo use. No cambia automáticamente las reglas del negocio.</p><button disabled={guardando} className="w-full rounded-xl bg-primary text-white px-4 py-3 flex gap-2 justify-center items-center disabled:opacity-50">{guardando ? <RefreshCw size={18} className="animate-spin" /> : <Plus size={18} />}Enviar a revisión</button></form>
    </div>
  </div>;
}
