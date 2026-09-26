import { useState } from "react";
import type { OrdenServicio } from "../../types";
import { efectivoPendiente } from "../../utils/crm";
import { formatMoneda } from "../../utils";
import GestionOrden from "./GestionOrden";
export default function RendicionEfectivo({
  ordenes,
}: {
  ordenes: OrdenServicio[];
}) {
  const [seleccion, setSeleccion] = useState("");
  const filas = ordenes
    .filter((o) => !o.eliminada)
    .flatMap((o) =>
      (o.pagos || [])
        .filter((p) => p.crm && efectivoPendiente(p) > 0)
        .map((p) => ({ o, p, saldo: efectivoPendiente(p) })),
    );
  return (
    <section className="bg-white border rounded-xl p-4 space-y-3">
      <h2 className="font-bold text-lg">
        Efectivo recibido pendiente de entregar
      </h2>
      <p className="text-sm">
        Incluye anticipos en órdenes abiertas y saldos de días anteriores. La
        entrega se confirma por pago y receptor real.
      </p>
      <p className="font-semibold">
        Total pendiente: {formatMoneda(filas.reduce((s, x) => s + x.saldo, 0))}
      </p>
      {!filas.length && (
        <p>No hay efectivo pendiente registrado mediante el nuevo flujo.</p>
      )}
      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left p-2">Receptor</th>
              <th className="text-left p-2">Cliente / orden</th>
              <th className="text-left p-2">Pendiente</th>
            </tr>
          </thead>
          <tbody>
            {filas.map(({ o, p, saldo }) => (
              <tr key={`${o.id}-${p.id}`} className="border-t">
                <td className="p-2">
                  {p.recibidoPorNombre || "Por identificar"}
                </td>
                <td className="p-2">
                  <button
                    className="text-blue-700 underline"
                    onClick={() => setSeleccion(o.id)}
                  >
                    {o.clienteNombre} · {o.numero}
                  </button>
                </td>
                <td className="p-2">{formatMoneda(saldo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {seleccion && (
        <div className="max-w-xl border rounded-lg p-3">
          <button className="underline mb-3" onClick={() => setSeleccion("")}>
            Cerrar ficha
          </button>
          <GestionOrden key={seleccion} ordenId={seleccion} />
        </div>
      )}
    </section>
  );
}
