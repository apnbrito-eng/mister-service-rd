import { useEffect, useRef, useState } from "react";
import { equipoApi } from "../services/equipoApi";
import { efectivoPendiente, type CrmPago } from "../utils/crm";
import { faseLabel, formatMoneda } from "../utils";
import GestionOrden from "../components/crm/GestionOrden";
import { useApp } from "../context/AppContext";
type Fila = {
  responsableId: string;
  tecnicoId: string;
  operariaId: string;
  cartera?: { responsableId: string; responsableNombre: string };
  participantes: Record<string, string>;
  id: string;
  clienteId: string;
  clienteNombre: string;
  numero: string;
  equipo: string;
  tecnicoNombre: string;
  responsableNombre: string;
  operariaNombre: string;
  fase: string;
  etapa: string;
  traspaso?: { destinoNombre: string };
  pagos: CrmPago[];
};
export default function ClientesResponsables() {
  const { userProfile } = useApp();
  const [items, setItems] = useState<Fila[]>([]),
    [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [filtro, setFiltro] = useState(""),
    [soloSin, setSoloSin] = useState(false);
  const [empleado, setEmpleado] = useState(""),
    [alcance, setAlcance] = useState("actual");
  const [seleccion, setSeleccion] = useState(""),
    [vista, setVista] = useState("cartera");
  const [tecnico, setTecnico] = useState("");
  const [operaria, setOperaria] = useState("");
  const [responsable, setResponsable] = useState("");
  const peticion = useRef(0);
  const lista = useRef<HTMLDivElement>(null);
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const permitido = ["administrador", "coordinadora"].includes(userProfile?.rol || "");
  async function cargar(next?: string) {
    const version = ++peticion.current;
    setLoading(true);
    setError("");
    try {
      const d = await equipoApi<{ items: Fila[]; cursor: string | null }>(
        `/api/crm/cartera${next ? `?cursor=${encodeURIComponent(next)}` : ""}`,
      );
      if (version !== peticion.current) return;
      setItems((v) =>
        next
          ? [...new Map([...v, ...d.items].map((x) => [x.id, x])).values()]
          : d.items,
      );
      setCursor(d.cursor);
    } catch (e) {
      if (version === peticion.current) setError((e as Error).message);
    } finally {
      if (version === peticion.current) setLoading(false);
    }
  }
  useEffect(() => {
    if (permitido) void cargar();
    return () => { peticion.current++; };
  }, [permitido]);
  if (!["administrador", "coordinadora"].includes(userProfile?.rol || ""))
    return <p>Esta consulta corresponde a administración y coordinación.</p>;
  const tecnicos = new Map<string, string>();
  const operarias = new Map<string, string>();
  const responsables = new Map<string, string>();
  const personas = new Map<string, string>();
  for (const x of items) {
    if (x.tecnicoId) tecnicos.set(x.tecnicoId, x.tecnicoNombre);
    if (x.operariaId) operarias.set(x.operariaId, x.operariaNombre);
    if (x.responsableId) responsables.set(x.responsableId, x.responsableNombre);
    if (x.responsableId) personas.set(x.responsableId, x.responsableNombre);
    if (x.cartera?.responsableId)
      personas.set(x.cartera.responsableId, x.cartera.responsableNombre);
    if (x.tecnicoId) personas.set(x.tecnicoId, x.tecnicoNombre);
    if (x.operariaId) personas.set(x.operariaId, x.operariaNombre);
    for (const [uid, nombre] of Object.entries(x.participantes))
      personas.set(uid, nombre);
  }
  const visibles = items.filter(
    (x) =>
      (!tecnico || x.tecnicoId === tecnico) &&
      (!operaria || x.operariaId === operaria) &&
      (!responsable || x.responsableId === responsable) &&
      (!empleado ||
        (alcance === "actual"
          ? [
              x.responsableId,
              x.cartera?.responsableId,
              x.tecnicoId,
              x.operariaId,
            ].includes(empleado)
          : !!x.participantes[empleado])) &&
      (!soloSin || !x.responsableId) &&
      (vista !== "efectivo" || x.pagos.some((p) => efectivoPendiente(p) > 0)) &&
      [
        x.clienteNombre,
        x.numero,
        x.id,
        x.tecnicoNombre,
        x.responsableNombre,
        x.operariaNombre,
        x.cartera?.responsableNombre || "",
        ...Object.values(x.participantes),
      ]
        .join(" ")
        .toLowerCase()
        .includes(filtro.toLowerCase()),
  );
  const grupos = new Map<string, Fila[]>();
  for (const fila of visibles) {
    const clave = fila.clienteId ? `cliente:${fila.clienteId}` : `orden:${fila.id}`;
    grupos.set(clave, [...(grupos.get(clave) || []), fila]);
  }
  const filtrosActivos = Number(!!empleado) + Number(soloSin) + Number(!!tecnico) + Number(!!operaria) + Number(!!responsable);
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-3 sm:p-6 text-slate-800">
      <div ref={lista} hidden={!!seleccion}>
        <header className="mb-4 flex items-start justify-between gap-3">
          <div><h1 className="text-xl font-bold sm:text-2xl">Clientes y responsables</h1>
            <p className="mt-1 text-sm text-slate-500">La cartera y las órdenes de cada cliente.</p></div>
          <button className="min-h-11 shrink-0 rounded-xl border bg-white px-3 text-sm disabled:opacity-50" disabled={loading} onClick={() => void cargar()}>Actualizar</button>
        </header>
        <div className="mb-4 space-y-3">
          <input aria-label="Buscar cliente, empleado u orden" className="min-h-11 w-full rounded-xl border bg-white px-4" placeholder="Cliente, empleado, número o ID de orden…" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
          <div className="flex gap-2">
            <select aria-label="Vista" className="min-h-11 min-w-0 flex-1 rounded-xl border bg-white px-3 text-sm" value={vista} onChange={(e) => setVista(e.target.value)}>
              <option value="cartera">Cartera y órdenes</option><option value="efectivo">Efectivo pendiente de entrega</option>
            </select>
            <button aria-expanded={filtrosAbiertos} aria-controls="filtros-cartera" className="min-h-11 rounded-xl border bg-white px-3 text-sm" onClick={() => setFiltrosAbiertos(!filtrosAbiertos)}>Filtros{filtrosActivos ? ` (${filtrosActivos})` : ""}</button>
          </div>
          <div id="filtros-cartera" hidden={!filtrosAbiertos} className="rounded-xl border bg-slate-50 p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                {label: "Técnico", value: tecnico, opciones: tecnicos, cambiar: setTecnico, todos: "Todos los técnicos"},
                {label: "Operaria", value: operaria, opciones: operarias, cambiar: setOperaria, todos: "Todas las operarias"},
                {label: "Responsable de la orden", value: responsable, opciones: responsables, cambiar: (valor: string) => {setResponsable(valor); if (valor) setSoloSin(false);}, todos: "Todos los responsables"},
              ].map(({label,value,opciones,cambiar,todos}) => <label key={label} className="text-sm">{label}<select aria-label={label} className="mt-1 min-h-11 w-full rounded-lg border bg-white px-2" value={value} onChange={e => cambiar(e.target.value)}><option value="">{todos}</option>{[...opciones].sort((a,b) => a[1].localeCompare(b[1])).map(([id,nombre]) => <option key={id} value={id}>{nombre || "Sin nombre registrado"}</option>)}</select></label>)}
              <p className="text-xs text-slate-500 sm:col-span-2">Puedes combinar técnico, operaria y responsable. Se muestran las órdenes que cumplen todos los filtros elegidos.</p>
              <details className="sm:col-span-2"><summary className="cursor-pointer py-2 text-sm">Otras asignaciones e historial</summary><div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">Persona<select className="mt-1 min-h-11 w-full rounded-lg border bg-white px-2" value={empleado} onChange={(e) => setEmpleado(e.target.value)}><option value="">Todos</option>{[...personas].sort((a,b) => a[1].localeCompare(b[1])).map(([uid,nombre]) => <option key={uid} value={uid}>{nombre || "Empleado sin nombre"}</option>)}</select></label>
              <label className="text-sm">Relación<select className="mt-1 min-h-11 w-full rounded-lg border bg-white px-2" value={alcance} onChange={(e) => setAlcance(e.target.value)}><option value="actual">Asignado actualmente</option><option value="historial">Participó en el seguimiento</option></select></label>
              </div></details>
              <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={soloSin} onChange={(e) => {setSoloSin(e.target.checked); if(e.target.checked) setResponsable("");}} />Órdenes sin responsable</label>
              <button className="min-h-11 text-sm text-blue-700" onClick={() => {setTecnico(""); setOperaria(""); setResponsable(""); setEmpleado(""); setSoloSin(false); setAlcance("actual"); setFiltro("");}}>Limpiar filtros</button>
            </div>
          </div>
        </div>
        {error && <p role="alert" className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error} Puedes volver a intentar con Actualizar.</p>}
        <p className="mb-3 text-sm text-slate-500">{new Set(visibles.filter(x => x.clienteId).map(x => x.clienteId)).size} clientes identificados · {visibles.length} órdenes cargadas</p>
        {cursor && <p className="mb-3 text-sm text-amber-800">Consulta parcial. Carga más órdenes para completar los resultados y sus responsables.</p>}
        {!loading && !error && !visibles.length && <p className="rounded-xl border bg-white p-6 text-center text-slate-500">No hay órdenes que coincidan con esta consulta.</p>}
        <div className="grid items-start gap-4 lg:grid-cols-2">
          {[...grupos].map(([clave, ordenes]) => {
            const cliente = ordenes[0];
            return <article key={clave} className="min-w-0 overflow-hidden rounded-2xl border bg-white shadow-sm">
              <header className="border-b bg-slate-50 px-4 py-3">
                <h2 className="break-words font-semibold">{cliente.clienteNombre || "Cliente sin nombre"}</h2>
                <p className="mt-1 text-sm text-slate-600">Cartera: <span className="font-medium">{cliente.cartera?.responsableNombre || "Sin asignar"}</span></p>
                <p className="mt-1 text-xs text-slate-500">{ordenes.length} {ordenes.length === 1 ? "orden en esta consulta" : "órdenes en esta consulta"}{!cliente.clienteId && " · Cliente sin identificar"}</p>
              </header>
              <div className="divide-y">{ordenes.map(x => <section key={x.id} className="space-y-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-semibold">{x.numero || "Orden sin número"}</span><span className="rounded-full bg-blue-50 px-2 py-1 text-xs text-blue-800">{faseLabel(x.fase as Parameters<typeof faseLabel>[0]) || x.fase || "Sin fase"}</span></div>
                <p className="break-words text-sm text-slate-600">{x.equipo || "Equipo sin especificar"}</p>
                {vista === "efectivo" ? <div className="space-y-2 rounded-lg bg-amber-50 p-3 text-sm">{x.pagos.filter(p => efectivoPendiente(p) > 0).map(p => <p key={p.id}>{p.recibidoPorNombre || "Receptor sin identificar"}: <strong>{formatMoneda(efectivoPendiente(p))}</strong>{!p.crm && " (histórico por conciliar)"}</p>)}</div> : <dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-slate-500">Responsable de orden</dt><dd className="mt-1 break-words">{x.responsableNombre || "Sin asignar"}</dd></div><div><dt className="text-xs text-slate-500">Técnico</dt><dd className="mt-1 break-words">{x.tecnicoNombre || "Sin asignar"}</dd></div></dl>}
                {x.traspaso && <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-900">Pendiente de recibir: {x.traspaso.destinoNombre}</p>}
                <details className="text-sm"><summary className="min-h-11 cursor-pointer py-3 text-slate-600">Equipo y seguimiento</summary><div className="space-y-2 pb-2 text-slate-600"><p>Operaria: {x.operariaNombre || "Sin asignar"}</p>{vista === "efectivo" && <><p>Responsable de orden: {x.responsableNombre || "Sin asignar"}</p><p>Técnico: {x.tecnicoNombre || "Sin asignar"}</p></>}<p>Etapa CRM: {x.etapa.replace(/_/g, " ") || "Sin etapa registrada"}</p><p>Intervinieron en CRM: {Object.values(x.participantes).join(", ") || "Sin registro todavía"}</p></div></details>
                <button className="min-h-11 w-full rounded-xl bg-blue-700 px-3 text-sm font-semibold text-white" onClick={() => {setSeleccion(x.id); lista.current?.parentElement?.scrollIntoView({block:"start"});}}>Abrir orden {x.numero}</button>
              </section>)}</div>
            </article>;
          })}
        </div>
        {loading && <p role="status" className="py-4 text-center text-sm">Cargando órdenes…</p>}
        {cursor && <button disabled={loading} className="mt-4 min-h-11 w-full rounded-xl border bg-white px-4 disabled:opacity-50" onClick={() => void cargar(cursor)}>Cargar más órdenes</button>}
      </div>
      {seleccion && <section className="rounded-2xl border bg-white p-3 sm:p-5"><button className="mb-4 min-h-11 rounded-xl border px-3 text-sm" onClick={() => setSeleccion("")}>← Volver a clientes</button><GestionOrden key={seleccion} ordenId={seleccion} /></section>}
    </div>
  );
}
