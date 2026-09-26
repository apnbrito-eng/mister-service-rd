import { useEffect, useState } from "react";
import { equipoApi } from "../services/equipoApi";
import { efectivoPendiente, type CrmPago } from "../utils/crm";
import { formatMoneda } from "../utils";
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
  async function cargar(next?: string) {
    setLoading(true);
    setError("");
    try {
      const d = await equipoApi<{ items: Fila[]; cursor: string | null }>(
        `/api/crm/cartera${next ? `?cursor=${encodeURIComponent(next)}` : ""}`,
      );
      setItems((v) =>
        next
          ? [...new Map([...v, ...d.items].map((x) => [x.id, x])).values()]
          : d.items,
      );
      setCursor(d.cursor);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void cargar();
  }, []);
  if (!["administrador", "coordinadora"].includes(userProfile?.rol || ""))
    return <p>Esta consulta corresponde a administración y coordinación.</p>;
  const personas = new Map<string, string>();
  for (const x of items) {
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
      (!empleado ||
        (alcance === "actual"
          ? [
              x.responsableId,
              x.cartera?.responsableId,
              x.tecnicoId,
              x.operariaId,
            ].includes(empleado)
          : !!x.participantes[empleado])) &&
      (!soloSin || !x.responsableNombre) &&
      [
        x.clienteNombre,
        x.numero,
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
  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold">Clientes y responsables</h1>
      <p>
        Consulta por cliente o empleado. Cada fila representa una orden; abre la
        ficha para ver sus gestiones.
      </p>
      <div className="flex flex-wrap gap-3">
        <input
          aria-label="Buscar cliente, empleado u orden"
          className="border rounded-lg p-2"
          placeholder="Cliente, empleado u orden"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
        />
        <label>
          Empleado
          <select
            className="border rounded p-2"
            value={empleado}
            onChange={(e) => setEmpleado(e.target.value)}
          >
            <option value="">Todos</option>
            {[...personas].map(([uid, nombre]) => (
              <option key={uid} value={uid}>
                {nombre}
              </option>
            ))}
          </select>
        </label>
        <label>
          Relación
          <select
            className="border rounded p-2"
            value={alcance}
            onChange={(e) => setAlcance(e.target.value)}
          >
            <option value="actual">Asignaciones actuales</option>
            <option value="historial">Intervenciones registradas en CRM</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={soloSin}
            onChange={(e) => setSoloSin(e.target.checked)}
          />{" "}
          Sin responsable
        </label>
        <select
          aria-label="Vista"
          className="border rounded p-2"
          value={vista}
          onChange={(e) => setVista(e.target.value)}
        >
          <option value="cartera">Cartera y órdenes</option>
          <option value="efectivo">Efectivo pendiente de entrega</option>
        </select>
        <button
          className="border rounded p-2"
          disabled={loading}
          onClick={() => void cargar()}
        >
          Actualizar
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      <p>
        {
          new Set(visibles.filter((x) => x.clienteId).map((x) => x.clienteId))
            .size
        }{" "}
        clientes identificados · {visibles.length} órdenes en las páginas
        cargadas.
        {cursor &&
          " Hay más resultados: carga las páginas restantes para completar la consulta."}
      </p>
      <div className="flex flex-col xl:flex-row gap-4">
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left p-2">Cliente / orden</th>
                <th className="text-left p-2">
                  {vista === "cartera"
                    ? "Responsables"
                    : "Efectivo por receptor"}
                </th>
                <th className="text-left p-2">Seguimiento</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((x) => {
                const cash = x.pagos.filter((p) => efectivoPendiente(p) > 0);
                if (vista === "efectivo" && !cash.length) return null;
                return (
                  <tr key={x.id} className="border-t align-top">
                    <td className="p-2">
                      <button
                        className="text-blue-700 underline text-left"
                        onClick={() => setSeleccion(x.id)}
                      >
                        {x.clienteNombre} · {x.numero}
                      </button>
                      <p>{x.equipo}</p>
                    </td>
                    <td className="p-2">
                      {vista === "cartera" ? (
                        <>
                          <p>
                            Cartera:{" "}
                            {x.cartera?.responsableNombre || "Sin asignar"}
                          </p>
                          <p>Actual: {x.responsableNombre || "Sin asignar"}</p>
                          <p>Operaria: {x.operariaNombre || "Sin asignar"}</p>
                          <p>Técnico: {x.tecnicoNombre || "Sin asignar"}</p>
                        </>
                      ) : (
                        cash.map((p) => (
                          <p key={p.id}>
                            {p.recibidoPorNombre || "Receptor sin identificar"}:{" "}
                            {formatMoneda(efectivoPendiente(p))}
                            {!p.crm && " (histórico por conciliar)"}
                          </p>
                        ))
                      )}
                    </td>
                    <td className="p-2">
                      {x.fase}
                      <p>{x.etapa}</p>
                      <p>
                        Intervinieron en CRM:{" "}
                        {Object.values(x.participantes).join(", ") ||
                          "Sin registro todavía"}
                      </p>
                      {x.traspaso && (
                        <p>Pendiente de recibir: {x.traspaso.destinoNombre}</p>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {cursor && (
            <button
              disabled={loading}
              className="border rounded p-2 mt-3"
              onClick={() => void cargar(cursor)}
            >
              Cargar más órdenes
            </button>
          )}
          {loading && <p role="status">Cargando…</p>}
        </div>
        {seleccion && (
          <aside className="w-full xl:w-[470px] border rounded-xl p-4 max-h-[85vh] overflow-y-auto">
            <button className="mb-3 underline" onClick={() => setSeleccion("")}>
              Cerrar ficha
            </button>
            <GestionOrden key={seleccion} ordenId={seleccion} />
          </aside>
        )}
      </div>
    </div>
  );
}
