import { useState } from "react";
import { formatMoneda } from "../../utils";
export type PiezaPropuesta = {
  nombre: string;
  cantidad: number;
  costoUnitario: number;
  fotoUrl: string;
};
export type Propuesta = {
  revision: number;
  diagnostico: string;
  piezas: PiezaPropuesta[];
  manoObraSugerida: number;
  estado: string;
  autorNombre: string;
  acuerdo?: string;
};
export default function PropuestaTrabajo({
  ordenId,
  propuesta,
  oficina,
  ocupado,
  guardar,
}: {
  ordenId: string;
  propuesta?: Propuesta;
  oficina: boolean;
  ocupado: boolean;
  guardar: (accion: string, campos: object) => Promise<void>;
}) {
  const [diagnostico, setDiagnostico] = useState(""),
    [mano, setMano] = useState(""),
    [precio, setPrecio] = useState(""),
    [motivo, setMotivo] = useState("");
  const [piezas, setPiezas] = useState<PiezaPropuesta[]>([]),
    [subiendo, setSubiendo] = useState(false),
    [error, setError] = useState("");
  const input = "w-full border rounded-lg p-2";
  const btn = "border rounded-lg p-2 disabled:opacity-50";
  async function foto(index: number, file?: File) {
    if (!file) return;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      setError("Usa una foto JPG, PNG o WebP de hasta 5 MB.");
      return;
    }
    setSubiendo(true);
    setError("");
    try {
      const { subirFotoPieza } = await import("../../services/piezas.service");
      const url = await subirFotoPieza(ordenId, crypto.randomUUID(), file);
      setPiezas((v) =>
        v.map((p, i) => (i === index ? { ...p, fotoUrl: url } : p)),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubiendo(false);
    }
  }
  return (
    <div className="space-y-3">
      {error && <p role="alert">{error}</p>}
      {propuesta && (
        <article className="border rounded-lg p-3 space-y-2">
          <h4 className="font-bold">
            Propuesta {propuesta.revision} · {propuesta.estado}
          </h4>
          <p>
            {propuesta.autorNombre}: {propuesta.diagnostico}
          </p>
          {propuesta.piezas.map((p, i) => (
            <div key={i}>
              <p>
                {p.cantidad} × {p.nombre} · costo propuesto{" "}
                {formatMoneda(p.costoUnitario)}
              </p>
              <img
                className="max-h-32 rounded"
                src={p.fotoUrl}
                alt={p.nombre}
              />
            </div>
          ))}
          <p>Servicio sugerido: {formatMoneda(propuesta.manoObraSugerida)}</p>
          {propuesta.acuerdo && (
            <p>Respuesta de oficina: {propuesta.acuerdo}</p>
          )}
          {oficina && propuesta.estado === "pendiente" && (
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                void guardar("aprobar_propuesta", {
                  revision: propuesta.revision,
                  precioFinal: Number(precio),
                  motivo,
                });
              }}
            >
              <label className="block">
                Total final acordado con el cliente
                <input
                  required
                  min="0"
                  step="0.01"
                  type="number"
                  className={input}
                  value={precio}
                  onChange={(e) => setPrecio(e.target.value)}
                />
              </label>
              <label className="block">
                Alcance y acuerdo con el cliente
                <textarea
                  required
                  className={input}
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                />
              </label>
              <button className={btn} disabled={ocupado}>
                Aprobar esta versión
              </button>
              <button
                type="button"
                className={btn}
                disabled={ocupado || !motivo.trim()}
                onClick={() =>
                  void guardar("devolver_propuesta", {
                    revision: propuesta.revision,
                    motivo,
                  })
                }
              >
                Pedir información / corrección
              </button>
            </form>
          )}
        </article>
      )}
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          void guardar("propuesta", {
            diagnostico,
            piezas,
            manoObraSugerida: Number(mano),
          });
        }}
      >
        <h4 className="font-semibold">
          {propuesta
            ? "Solicitar cambio con nueva propuesta"
            : "Diagnóstico y propuesta"}
        </h4>
        <label className="block">
          Falla encontrada y trabajo sugerido
          <textarea
            required
            className={input}
            value={diagnostico}
            onChange={(e) => setDiagnostico(e.target.value)}
          />
        </label>
        <label className="block">
          Precio sugerido del servicio (sin costo de piezas)
          <input
            required
            min="0"
            type="number"
            step="0.01"
            className={input}
            value={mano}
            onChange={(e) => setMano(e.target.value)}
          />
        </label>
        {piezas.map((p, i) => (
          <fieldset key={i} className="border rounded-lg p-2 space-y-2">
            <legend>Pieza {i + 1}</legend>
            <label>
              Nombre
              <input
                required
                className={input}
                value={p.nombre}
                onChange={(e) =>
                  setPiezas((v) =>
                    v.map((x, j) =>
                      i === j ? { ...x, nombre: e.target.value } : x,
                    ),
                  )
                }
              />
            </label>
            <label>
              Cantidad
              <input
                required
                type="number"
                min="1"
                max="100"
                className={input}
                value={p.cantidad}
                onChange={(e) =>
                  setPiezas((v) =>
                    v.map((x, j) =>
                      i === j ? { ...x, cantidad: Number(e.target.value) } : x,
                    ),
                  )
                }
              />
            </label>
            <label>
              Costo unitario de adquisición sugerido
              <input
                required
                type="number"
                min="0"
                step="0.01"
                className={input}
                value={p.costoUnitario}
                onChange={(e) =>
                  setPiezas((v) =>
                    v.map((x, j) =>
                      i === j
                        ? { ...x, costoUnitario: Number(e.target.value) }
                        : x,
                    ),
                  )
                }
              />
            </label>
            <label>
              Foto de la pieza
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={subiendo}
                onChange={(e) => void foto(i, e.target.files?.[0])}
              />
            </label>
            {p.fotoUrl && <p>Foto cargada.</p>}
            <button
              type="button"
              className={btn}
              disabled={subiendo}
              onClick={() => setPiezas((v) => v.filter((_, j) => j !== i))}
            >
              Quitar pieza
            </button>
          </fieldset>
        ))}
        <button
          type="button"
          className={btn}
          disabled={piezas.length >= 20 || subiendo}
          onClick={() =>
            setPiezas((v) => [
              ...v,
              { nombre: "", cantidad: 1, costoUnitario: 0, fotoUrl: "" },
            ])
          }
        >
          Añadir pieza
        </button>
        <button
          className={btn}
          disabled={ocupado || subiendo || piezas.some((p) => !p.fotoUrl)}
        >
          Enviar propuesta a oficina
        </button>
        <p className="text-xs text-gray-500">
          Una nueva propuesta queda pendiente de aprobación. La foto identifica
          la pieza; oficina verifica su costo antes de autorizar.
        </p>
      </form>
    </div>
  );
}
