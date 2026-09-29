import ProponerConocimiento from "./ProponerConocimiento";
import ResumenBotServicio, { type ResumenServicioIA } from "./ResumenBotServicio";
import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "../../context/AppContext";
import { equipoApi } from "../../services/equipoApi";
import type {
  AtencionChat as EstadoAtencion,
  AccionAtencion,
} from "../../utils/atencionChat";
interface Datos {
  resumenBot?: ResumenServicioIA | null;
  ordenes?: { id: string; numero: string; tecnicoNombre: string }[];
  atencion: EstadoAtencion;
  equipo: { uid: string; nombre: string }[];
  carteraNombre: string | null;
  redactando?: { nombre: string }[];
}
export default function AtencionChat({ waId }: { waId: string }) {
  const { currentUser, userProfile } = useApp();
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [destino, setDestino] = useState("");
  const [ordenId, setOrdenId] = useState('');
  const [motivo, setMotivo] = useState("");
  const secuencia = useRef(0);
  const operacion = useRef<{ key: string; id: string } | null>(null);
  const cargar = useCallback(async () => {
    const numero = ++secuencia.current;
    try {
      const result = await equipoApi<Datos>(
        `/api/crm/atencion?waId=${encodeURIComponent(waId)}`,
      );
      if (numero === secuencia.current) {
        setDatos(result);
        setError("");
      }
    } catch (e) {
      if (numero === secuencia.current) setError((e as Error).message);
    }
  }, [waId]);
  useEffect(() => {
    setDatos(null);
    setDestino("");
    setOrdenId("");
    setMotivo("");
    void cargar();
    const timer = window.setInterval(() => {
      if (!document.hidden) void cargar();
    }, 20000);
    return () => {
      secuencia.current++;
      clearInterval(timer);
    };
  }, [cargar]);
  async function cambiar(accion: AccionAtencion) {
    if (!datos || ocupado) return;
    setOcupado(true);
    setError("");
    const payload = {
      waId,
      accion,
      version: datos.atencion.version,
      destinoId: destino || undefined,
      motivo,
      ordenId: ordenId || undefined,
    };
    const key = JSON.stringify(payload);
    if (operacion.current?.key !== key)
      operacion.current = { key, id: crypto.randomUUID() };
    try {
      await equipoApi("/api/crm/atencion", {
        ...payload,
        requestId: operacion.current.id,
      });
      operacion.current = null;
      setMotivo("");
      setDestino("");
      await cargar();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }
  const a = datos?.atencion;
  const puedeGestionar =
    a?.responsableId === currentUser?.uid ||
    ["administrador", "coordinadora"].includes(userProfile?.rol || "");
  const boton =
    "min-h-[44px] rounded-lg border px-3 py-2 text-sm disabled:opacity-50";
  return (
    <section
      aria-label="Responsables y atención"
      className="rounded-xl border border-stone-200 bg-white p-3 space-y-2 text-sm"
    >
      <p>
        <span className="text-gray-500">Responsable de cartera:</span>{" "}
        {datos ? datos.carteraNombre || "Sin asignar" : error ? "No disponible" : "Consultando…"}
      </p>
      <p>
        <span className="text-gray-500">Atiende el chat:</span>{" "}
        {datos ? a?.responsableNombre ||
          (a?.responsableId ? "Responsable asignada" : "Sin asignar") : error ? "No disponible" : "Consultando…"}
      </p>
      <ResumenBotServicio resumen={datos?.resumenBot} />
      {["administrador", "coordinadora", "secretaria", "operaria"].includes(userProfile?.rol || "") && <ProponerConocimiento key={waId} />}
      <details><summary className="min-h-11 cursor-pointer py-3 font-medium text-emerald-800">Atención y traspasos{a?.pendiente ? " · Pendiente" : ""}</summary>
      {!!datos?.ordenes?.length && <label className="block">Cita para el traspaso<select className="block border rounded p-2 w-full" value={ordenId} onChange={e => setOrdenId(e.target.value)}><option value="">Selecciona una cita</option>{datos.ordenes.map(o => <option key={o.id} value={o.id}>{o.numero} · {o.tecnicoNombre}</option>)}</select><span className="text-xs text-gray-500">Solo esta cita cambia de responsable. Quedará pendiente de asignar técnico.</span></label>}
      {!!datos?.redactando?.length && (
        <p role="status" className="text-blue-800">
          {datos.redactando.map((p) => p.nombre).join(", ")} está preparando una
          respuesta.
        </p>
      )}
      {error && (
        <div role="alert" className="text-red-700">
          {error}{" "}
          <button className="underline" onClick={() => void cargar()}>
            Actualizar
          </button>
        </div>
      )}
      {a && (
        <>
          <p className={a.pendiente ? "text-amber-800" : "text-emerald-700"}>
            {a.pendiente ? "Atención pendiente" : "Atención resuelta"}
          </p>
          {!a.responsableId && (
            <button
              disabled={ocupado}
              className={boton}
              onClick={() => void cambiar("tomar")}
            >
              Atender este chat
            </button>
          )}
          {puedeGestionar && (
            <button
              disabled={ocupado}
              className={boton}
              onClick={() =>
                void cambiar(a.pendiente ? "resolver" : "pendiente")
              }
            >
              {a.pendiente ? "Marcar atención resuelta" : "Dejar pendiente"}
            </button>
          )}
          {a.traspaso ? (
            <div className="rounded-lg bg-amber-50 p-3 space-y-2">
              <p>
                Por recibir: <strong>{a.traspaso.destinoNombre}</strong>
              </p>
              <p className="whitespace-pre-wrap break-words">
                {a.traspaso.motivo}
              </p>
              <p className="text-xs">
                La responsable actual conserva la atención hasta que se acepte.
              </p>
              {a.traspaso.destinoId === currentUser?.uid && (
                <button
                  className={boton}
                  disabled={ocupado}
                  onClick={() => void cambiar("aceptar")}
                >
                  Recibir chat
                </button>
              )}
              {puedeGestionar && (
                <button
                  className={boton}
                  disabled={ocupado}
                  onClick={() => void cambiar("cancelar")}
                >
                  Cancelar traspaso
                </button>
              )}
            </div>
          ) : (
            puedeGestionar && (
              <details>
                <summary className="cursor-pointer py-3">
                  Pasar atención a otra persona
                </summary>
                <label className="block">
                  Responsable
                  <select
                    value={destino}
                    onChange={(e) => setDestino(e.target.value)}
                    className="w-full rounded-lg border p-2"
                  >
                    <option value="">Seleccionar</option>
                    {datos.equipo
                      .filter((p) => p.uid !== a.responsableId)
                      .map((p) => (
                        <option key={p.uid} value={p.uid}>
                          {p.nombre}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="block mt-2">
                  Resumen de lo pendiente
                  <textarea
                    maxLength={1000}
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    className="w-full rounded-lg border p-2"
                  />
                </label>
                <button
                  className={boton}
                  disabled={ocupado || !destino || !motivo.trim() || (!!datos.ordenes?.length && !ordenId)}
                  onClick={() => void cambiar("transferir")}
                >
                  Traspasar ahora
                </button>
              </details>
            )
          )}
        </>
      )}
      </details>
    </section>
  );
}
