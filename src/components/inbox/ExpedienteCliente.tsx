import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { equipoApi } from "../../services/equipoApi";
import type { FuenteCrm } from "../crm/GestionOrden";
type Entrada = {
  id: string;
  texto: string;
  categoria: string;
  autorNombre: string;
  fechaMs: number;
  fuente?: { wamid: string; waId: string; tipo: string; texto: string };
};
export default function ExpedienteCliente({
  clienteId,
  fuente,
  alUsarFuente,
}: {
  clienteId: string;
  fuente?: FuenteCrm | null;
  alUsarFuente?: () => void;
}) {
  const [tipoArchivo, setTipoArchivo] = useState("image");
  const [items, setItems] = useState<Entrada[]>([]),
    [cursor, setCursor] = useState<string | null>(null);
  const [texto, setTexto] = useState(""),
    [categoria, setCategoria] = useState("otro");
  const [error, setError] = useState(""),
    [ocupado, setOcupado] = useState(false),
    [imagen, setImagen] = useState("");
  const ciclo = useRef(0),
    operacion = useRef<{ key: string; id: string } | null>(null);
  const cargar = useCallback(
    async (pagina?: string) => {
      const n = ++ciclo.current;
      try {
        const r = await equipoApi<{ items: Entrada[]; cursor: string | null }>(
          `/api/crm/expediente?clienteId=${encodeURIComponent(clienteId)}${pagina ? `&cursor=${encodeURIComponent(pagina)}` : ""}`,
        );
        if (n === ciclo.current) {
          setItems((prev) => (pagina ? [...prev, ...r.items] : r.items));
          setCursor(r.cursor);
        }
      } catch (e) {
        if (n === ciclo.current) setError((e as Error).message);
      }
    },
    [clienteId],
  );
  useEffect(() => {
    void cargar();
    return () => {
      ciclo.current++;
    };
  }, [cargar]);
  useEffect(() => {
    if (fuente?.accion === "expediente") setTexto(fuente.texto);
  }, [fuente]);
  const seleccion = fuente?.accion === "expediente" ? fuente : null;
  const categorias = [
    ["equipo", "Fotos y datos del equipo"],
    ["acuerdo", "Acuerdos"],
    ["documento", "Documentos"],
    ["comprobante", "Comprobantes"],
    ["otro", "Otras notas"],
  ];
  return (
    <section className="space-y-3 p-3" aria-label="Expediente del cliente">
      <h2 className="font-semibold">Expediente del cliente</h2>
      <p className="text-xs text-gray-500">
        Información permanente para oficina. Para compartir con el técnico,
        guarda la evidencia en su orden. Un comprobante no confirma el pago.
      </p>
      {error && (
        <p role="alert" className="text-red-700 text-sm">
          {error}
        </p>
      )}
      <form
        className="space-y-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (ocupado) return;
          setOcupado(true);
          setError("");
          const payload = {
            clienteId,
            texto,
            categoria,
            wamid: seleccion?.wamid,
          };
          const key = JSON.stringify(payload);
          if (operacion.current?.key !== key)
            operacion.current = { key, id: crypto.randomUUID() };
          try {
            if (seleccion && ["image", "video", "audio", "document", "sticker"].includes(seleccion.tipo || ""))
              await equipoApi("/api/crm/evidencia", {
                clienteId,
                wamid: seleccion.wamid,
              });
            await equipoApi("/api/crm/expediente", {
              ...payload,
              requestId: operacion.current.id,
            });
            operacion.current = null;
            setTexto("");
            alUsarFuente?.();
            await cargar();
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setOcupado(false);
          }
        }}
      >
        <label className="block text-sm">
          Categoría
          <select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            className="w-full border rounded-lg p-2"
          >
            {categorias.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          Información importante
          <textarea
            value={texto}
            maxLength={3000}
            onChange={(e) => setTexto(e.target.value)}
            className="w-full border rounded-lg p-2"
          />
        </label>
        {seleccion && (
          <p className="text-xs">
            Mensaje de WhatsApp seleccionado. Se conservará el original y su
            fecha.{" "}
            <button type="button" className="underline" onClick={alUsarFuente}>
              Quitar selección
            </button>
          </p>
        )}
        <button
          disabled={ocupado || !texto.trim()}
          className="min-h-[44px] rounded-lg bg-brand-600 text-white px-3 disabled:opacity-50"
        >
          {ocupado ? "Guardando…" : "Guardar en expediente"}
        </button>
      </form>
      {categorias.map(([id, label]) => {
        const notas = items.filter((n) => n.categoria === id);
        return (
          notas.length > 0 && (
            <section key={id}>
              <h3 className="font-medium mb-2">{label}</h3>
              {notas.map((n) => (
                <article
                  key={n.id}
                  className="border rounded-lg p-3 mb-2 text-sm"
                >
                  <p className="whitespace-pre-wrap break-words">{n.texto}</p>
                  <p className="text-xs text-gray-500">
                    {n.autorNombre} ·{" "}
                    {new Date(n.fechaMs).toLocaleString("es-DO")}
                  </p>
                  {n.fuente && (
                    <>
                      <p className="text-xs mt-2">
                        Original: {n.fuente.texto || "Archivo del cliente"}
                      </p>
                      <Link
                        className="underline block py-2"
                        to={`/admin/inbox/${n.fuente.waId}#${encodeURIComponent("mensaje-" + n.fuente.wamid)}`}
                      >
                        Ir al mensaje original
                      </Link>
                      {["image", "video", "audio", "document", "sticker"].includes(n.fuente.tipo) && (
                        <button
                          className="underline min-h-[44px]"
                          onClick={async () => {
                            try {
                              const r = await equipoApi<{ url: string }>(
                                "/api/crm/evidencia",
                                { clienteId, wamid: n.fuente!.wamid },
                              );
                              setTipoArchivo(n.fuente!.tipo); setImagen(r.url);
                            } catch (e) {
                              setError((e as Error).message);
                            }
                          }}
                        >
                          Abrir archivo guardado
                        </button>
                      )}
                    </>
                  )}
                </article>
              ))}
            </section>
          )
        );
      })}
      {cursor && (
        <button
          className="min-h-[44px] underline"
          onClick={() => void cargar(cursor)}
        >
          Cargar más documentos
        </button>
      )}
      {imagen && (
        <div>
          <button
            className="min-h-[44px] underline"
            onClick={() => setImagen("")}
          >
            Cerrar imagen
          </button>
          {(tipoArchivo === "image" || tipoArchivo === "sticker") && <img
            src={imagen}
            alt="Evidencia del expediente"
            className="max-w-full rounded-lg"
          />}
          <a href={imagen} target="_blank" rel="noopener noreferrer" className="block underline min-h-11">Abrir archivo</a>
        </div>
      )}
    </section>
  );
}
