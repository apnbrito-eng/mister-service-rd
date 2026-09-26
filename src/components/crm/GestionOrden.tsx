import VinculoChatOrden from './VinculoChatOrden';
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { equipoApi } from "../../services/equipoApi";
import { enviarTexto } from "../../services/whatsapp.service";
import { formatMoneda } from "../../utils";
import { efectivoPendiente, type CrmPago } from "../../utils/crm";
import PropuestaTrabajo from "./PropuestaTrabajo";
import { useApp } from "../../context/AppContext";

const FacturacionEnChat = lazy(() => import("./FacturacionEnChat"));
type Persona = { uid: string; nombre: string; rol: string };
type Nota = {
  id: string;
  texto: string;
  visibilidad: string;
  autorNombre: string;
  fechaMs: number;
  resuelta: boolean;
  destacada: boolean;
  fuente?: { texto: string; wamid: string };
  responsableId?: string;
};
type Evento = {
  id: string;
  accion: string;
  actorNombre: string;
  fechaMs: number;
  detalle: Record<string, unknown>;
};
type Recibo = { id: string; texto: string };
interface Estado {
  cartera?: { responsableNombre: string; version: number };
  orden: {
    id: string;
    numero: string;
    clienteNombre: string;
    equipoTipo: string;
    equipoMarca: string;
    descripcionFalla: string;
    responsableNombre?: string;
    operariaNombre?: string;
    tecnicoNombre?: string;
    tecnicoId?: string;
    clienteTelefono?: string;
    fase: string;
    pagos?: CrmPago[];
    fechaCita?: { _seconds?: number; seconds?: number };
    estadoAprobacion?: string;
    precioFinal?: number;
    precioAprobado?: number;
    esGarantia?: boolean;
  };
  meta: {
    propuesta?: import("./PropuestaTrabajo").Propuesta;
    version: number;
    responsableNombre?: string;
    etapa?: string;
    traspaso?: { destinoId: string; destinoNombre: string; motivo: string };
    revision?: { estado: string; actorNombre: string; observaciones: string };
  };
  notas: Nota[];
  eventos: Evento[];
  recibos: Recibo[];
  parcial: boolean;
  balance: {
    confirmados: number;
    pendientes: number;
    saldo: number | null;
    excedente: number;
  };
  permisos: {
    oficina: boolean;
    supervisor: boolean;
    verificar: boolean;
    registrar: boolean;
  };
  equipo: Persona[];
}
export type FuenteCrm = {
  wamid: string;
  tipo?: "text" | "image" | "video" | "audio" | "document" | "sticker" | "location";
  texto: string;
  accion: "nota" | "pago" | "expediente";
  nonce: number;
};
const entrada = "w-full border border-gray-300 rounded-lg p-2 text-sm bg-white";
const boton =
  "rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium disabled:opacity-50 hover:bg-gray-50";
const fecha = (ms: number) => new Date(ms).toLocaleString("es-DO");
const labels: Record<string, string> = {
  cartera: "Cartera del cliente reasignada",
  nota: "Nota añadida",
  resolver_nota: "Pendiente resuelto",
  traspasar: "Caso enviado",
  recibir: "Caso recibido",
  cancelar_traspaso: "Traspaso cancelado",
  pago: "Pago reportado",
  confirmar_pago: "Pago confirmado",
  entrega_efectivo: "Efectivo entregado a oficina",
  agenda: "Cita o técnico actualizados",
  revision: "Revisión de supervisión",
};

export default function GestionOrden({
  ordenId,
  fuente,
  alUsarFuente,
}: {
  ordenId: string;
  fuente?: FuenteCrm | null;
  alUsarFuente?: () => void;
}) {
  const { currentUser } = useApp();
  const [datos, setDatos] = useState<Estado | null>(null);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [tab, setTab] = useState("resumen");
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(""),
    [visibilidad, setVisibilidad] = useState("oficina");
  const [destacado, setDestacado] = useState(false),
    [asignado, setAsignado] = useState("");
  const [destino, setDestino] = useState(""),
    [etapa, setEtapa] = useState("operaria"),
    [motivo, setMotivo] = useState("");
  const [monto, setMonto] = useState(""),
    [metodo, setMetodo] = useState("transferencia"),
    [receptor, setReceptor] = useState(""),
    [referencia, setReferencia] = useState("");
  const [tecnico, setTecnico] = useState(""),
    [cita, setCita] = useState("");
  const [entregaConfirmar, setEntregaConfirmar] = useState<string | null>(null);
  const [imagen, setImagen] = useState("");
  const [tipoArchivo, setTipoArchivo] = useState("image");
  const [entregas, setEntregas] = useState<Record<string, string>>({});
  const [confirmacion, setConfirmacion] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState(""),
    [recibo, setRecibo] = useState<Recibo | null>(null);
  const ultima = useRef<{ texto: string; id: string; payload: object } | null>(
    null,
  );
  const ciclo = useRef(0);
  const cargar = useCallback(async () => {
    const request = ++ciclo.current;
    try {
      const d = await equipoApi<Estado>(
        `/api/crm/orden?ordenId=${encodeURIComponent(ordenId)}`,
      );
      if (request === ciclo.current) {
        setDatos(d);
        setError("");
      }
    } catch (e) {
      if (request === ciclo.current) {
        setError((e as Error).message);
        setDatos(null);
      }
    }
  }, [ordenId]);
  useEffect(() => {
    setDatos(null);
    void cargar();
    return () => {
      ciclo.current++;
    };
  }, [cargar]);
  useEffect(() => {
    if (editando || ocupado) return;
    const t = window.setInterval(() => void cargar(), 15000);
    return () => window.clearInterval(t);
  }, [cargar, editando, ocupado]);
  useEffect(() => {
    if (fuente) {
      setTab(fuente.accion === "pago" ? "pagos" : "notas");
      setTexto(fuente.texto);
    }
  }, [fuente]);
  async function guardar(accion: string, campos: object) {
    if (!datos || ocupado) return;
    const payload = {
      ordenId,
      version: datos.meta.version || 0,
      accion,
      ...campos,
    };
    const textoPayload = JSON.stringify({ ordenId, accion, ...campos });
    if (ultima.current?.texto !== textoPayload)
      ultima.current = {
        texto: textoPayload,
        id: crypto.randomUUID(),
        payload,
      };
    setOcupado(true);
    setAviso("");
    try {
      if ((accion === "nota" || accion === "pago") && fuente?.wamid) {
        // La evidencia se archiva antes de registrar un pago o nota que dependa de ella.
        if (["image", "video", "audio", "document", "sticker"].includes(fuente.tipo || "") || (!fuente.tipo && fuente.texto.startsWith("[Imagen]")))
          await equipoApi("/api/crm/evidencia", {
            ordenId,
            wamid: fuente.wamid,
          });
      }
      await equipoApi("/api/crm/orden", {
        ...ultima.current.payload,
        operacionId: ultima.current.id,
      });
      ultima.current = null;
      setEditando(false);
      setAviso("Guardado.");
      setMotivo("");
      if (accion === "nota") {
        setTexto("");
        alUsarFuente?.();
      }
      if (accion === "pago") {
        setMonto("");
        setReferencia("");
        alUsarFuente?.();
      }
      await cargar();
    } catch (e) {
      if ((e as { status?: number }).status === 409) {
        ultima.current = null;
        await cargar();
      }
      setAviso((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }
  if (error)
    return (
      <div role="alert">
        <p>{error}</p>
        <button type="button" className={boton} onClick={() => void cargar()}>
          Reintentar
        </button>
      </div>
    );
  if (!datos) return <p role="status">Cargando ficha de trabajo…</p>;
  const { orden: o, meta, permisos, equipo } = datos;
  const opcionesPersonas = (roles?: string[]) => (
    <>
      <option value="">Selecciona una persona</option>
      {equipo
        .filter((p) => !roles || roles.includes(p.rol))
        .map((p) => (
          <option key={p.uid} value={p.uid}>
            {p.nombre} · {p.rol}
          </option>
        ))}
    </>
  );
  return (
    <section
      onChangeCapture={() => setEditando(true)}
      className="space-y-3 text-sm"
      aria-label="Gestión de la orden"
    >
      <header className="bg-blue-50 border border-blue-100 rounded-xl p-3">
        <h3 className="font-bold">
          {o.numero} · {o.equipoTipo} {o.equipoMarca}
        </h3>
        <p>{o.clienteNombre}</p>
        <p className="mt-2">
          Responsable:{" "}
          <strong>
            {meta.responsableNombre ||
              o.responsableNombre ||
              o.operariaNombre ||
              "Sin asignar"}
          </strong>
        </p>
        <p>
          Responsable habitual del cliente:{" "}
          {datos.cartera?.responsableNombre || "Sin asignar"}
        </p>
        <p>Etapa: {meta.etapa || "Por registrar"}</p>
        {o.esGarantia && (
          <p>
            Garantía: agenda a cargo de secretaría, con sustitución por
            operaria.
          </p>
        )}
      </header>
      <button
        type="button"
        className={boton}
        disabled={ocupado}
        onClick={() => void cargar()}
      >
        Actualizar ficha
      </button>
      {meta.traspaso && (
        <div className="bg-amber-50 rounded-lg p-3">
          <strong>Pendiente de recibir: {meta.traspaso.destinoNombre}</strong>
          <p>{meta.traspaso.motivo}</p>
          {meta.traspaso.destinoId === currentUser?.uid && (
            <button
              className={boton}
              disabled={ocupado}
              onClick={() => void guardar("recibir", {})}
            >
              Recibir caso
            </button>
          )}
        </div>
      )}
      <div
        className="flex flex-wrap gap-1"
        role="tablist"
        aria-label="Secciones de la orden"
      >
        {[
          "resumen",
          "notas",
          "trabajo",
          ...(permisos.oficina
            ? ["pagos", "agenda", "equipo", "documentos", "historial"]
            : []),
        ].map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            className={`${boton} ${tab === t ? "bg-blue-50 text-blue-800" : ""}`}
            onClick={() => setTab(t)}
          >
            {t === "equipo"
              ? "Responsables"
              : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      {aviso && (
        <p role="status" className="bg-slate-100 rounded p-2">
          {aviso}
        </p>
      )}
      {imagen && (
        <div>
          {(tipoArchivo === "image" || tipoArchivo === "sticker") && <img
            className="max-w-full rounded"
            src={imagen}
            alt="Archivo adjunto"
          />}
          <a href={imagen} target="_blank" rel="noopener noreferrer" className="block underline min-h-11">Abrir archivo</a>
          <button className={boton} onClick={() => setImagen("")}>
            Cerrar imagen
          </button>
        </div>
      )}
      {permisos.oficina && <VinculoChatOrden key={ordenId} ordenId={ordenId} fuente={fuente} />}
      {fuente && (
        <div className="rounded border border-blue-200 p-2">
          <strong>Mensaje seleccionado como evidencia</strong>
          <p className="whitespace-pre-wrap">
            {fuente.texto || "Imagen del cliente"}
          </p>
          <p>No confirma automáticamente un pago.</p>
          <button type="button" onClick={alUsarFuente} className="underline">
            Quitar selección
          </button>
        </div>
      )}
      {tab === "resumen" && (
        <div className="space-y-2">
          <p>
            <strong>Falla:</strong> {o.descripcionFalla}
          </p>
          <p>Operaria: {o.operariaNombre || "Sin asignar"}</p>
          <p>Técnico: {o.tecnicoNombre || "Sin asignar"}</p>
          <p>
            Cita:{" "}
            {o.fechaCita
              ? fecha((o.fechaCita._seconds || o.fechaCita.seconds || 0) * 1000)
              : "Por agendar"}
          </p>
          <p>Trabajo: {o.fase}</p>
          <p>
            Presupuesto:{" "}
            {o.estadoAprobacion === "aprobado"
              ? formatMoneda(o.precioFinal ?? o.precioAprobado ?? 0)
              : "Por aprobar"}
          </p>
          {datos.balance && (
            <>
              <p>
                Abonos confirmados: {formatMoneda(datos.balance.confirmados)}
              </p>
              <p>En revisión: {formatMoneda(datos.balance.pendientes)}</p>
              <p className="font-semibold">
                Saldo:{" "}
                {datos.balance.saldo === null
                  ? "Presupuesto por confirmar"
                  : formatMoneda(datos.balance.saldo)}
              </p>
              {datos.balance.excedente > 0 && (
                <p>
                  Excedente a revisar: {formatMoneda(datos.balance.excedente)}
                </p>
              )}
            </>
          )}
          <p>
            Revisión de supervisión:{" "}
            {meta.revision?.estado || "Sin revisión registrada"}
          </p>
          {meta.revision && (
            <p>
              {meta.revision.actorNombre}: {meta.revision.observaciones}
            </p>
          )}
          <p className="text-xs text-gray-500">
            El cierre técnico, el cobro y la revisión administrativa son estados
            separados.
          </p>
        </div>
      )}
      {tab === "trabajo" && (
        <PropuestaTrabajo
          ordenId={ordenId}
          propuesta={meta.propuesta}
          oficina={permisos.oficina}
          ocupado={ocupado}
          guardar={guardar}
        />
      )}
      {tab === "notas" && (
        <div className="space-y-3">
          {permisos.oficina && (
            <form
              className="space-y-2 border rounded-xl p-3"
              onSubmit={(e) => {
                e.preventDefault();
                void guardar("nota", {
                  texto,
                  visibilidad,
                  destacada: destacado,
                  responsableId: asignado || null,
                  wamid: fuente?.wamid,
                });
              }}
            >
              <label className="block">
                Nota interna
                <textarea
                  required
                  maxLength={3000}
                  className={entrada}
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                />
              </label>
              <label className="block">
                Visibilidad
                <select
                  className={entrada}
                  value={visibilidad}
                  onChange={(e) => setVisibilidad(e.target.value)}
                >
                  <option value="oficina">Solo oficina</option>
                  <option value="tecnico">Oficina y técnico de la orden</option>
                </select>
              </label>
              <label className="block">
                Responsable del pendiente (opcional)
                <select
                  className={entrada}
                  value={asignado}
                  onChange={(e) => setAsignado(e.target.value)}
                >
                  {opcionesPersonas()}
                </select>
              </label>
              <label className="flex gap-2">
                <input
                  type="checkbox"
                  checked={destacado}
                  onChange={(e) => setDestacado(e.target.checked)}
                />
                Destacar instrucción
              </label>
              <button className={boton} disabled={ocupado}>
                Guardar nota interna
              </button>
              <p className="text-xs">
                No se envía al cliente ni autoriza cambios de precio.
              </p>
            </form>
          )}
          {[...datos.notas]
            .sort(
              (a, b) =>
                Number(b.destacada) - Number(a.destacada) ||
                b.fechaMs - a.fechaMs,
            )
            .map((n) => (
              <article
                key={n.id}
                className={`border rounded-lg p-3 ${n.destacada ? "bg-amber-50" : ""}`}
              >
                <p className="whitespace-pre-wrap">{n.texto}</p>
                <p className="text-xs text-gray-500">
                  {n.autorNombre} · {fecha(n.fechaMs)} ·{" "}
                  {n.visibilidad === "tecnico"
                    ? "Compartida con técnico"
                    : "Solo oficina"}
                </p>
                {n.responsableId && (
                  <p>
                    Pendiente para:{" "}
                    {equipo.find((p) => p.uid === n.responsableId)?.nombre ||
                      "Responsable registrado"}
                  </p>
                )}
                {n.fuente && (
                  <div>
                    <p className="text-xs">
                      Fuente: mensaje de WhatsApp · {n.fuente.texto || "Imagen"}
                    </p>
                    <button
                      className={boton}
                      onClick={async () => {
                        try {
                          const d = await equipoApi<{ url: string; tipo?: string }>(
                            "/api/crm/evidencia",
                            { ordenId, wamid: n.fuente!.wamid },
                          );
                          setTipoArchivo(d.tipo || "image"); setImagen(d.url);
                        } catch (e) {
                          setAviso((e as Error).message);
                        }
                      }}
                    >
                      Abrir archivo de evidencia
                    </button>
                  </div>
                )}
                {n.resuelta ? (
                  <p>Resuelta</p>
                ) : (
                  permisos.oficina && (
                    <button
                      className={boton}
                      disabled={ocupado}
                      onClick={() =>
                        void guardar("resolver_nota", { notaId: n.id })
                      }
                    >
                      Marcar resuelta
                    </button>
                  )
                )}
              </article>
            ))}
        </div>
      )}
      {tab === "pagos" && (
        <div className="space-y-3">
          {permisos.registrar && (
            <form
              className="space-y-2 border rounded-xl p-3"
              onSubmit={(e) => {
                e.preventDefault();
                void guardar("pago", {
                  monto: Number(monto),
                  metodo,
                  receptorId: receptor,
                  referencia,
                  wamid: fuente?.wamid,
                });
              }}
            >
              <label className="block">
                Importe del abono
                <input
                  required
                  type="number"
                  min="0.01"
                  max="10000000"
                  step="0.01"
                  className={entrada}
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                />
              </label>
              <label className="block">
                Método
                <select
                  className={entrada}
                  value={metodo}
                  onChange={(e) => setMetodo(e.target.value)}
                >
                  <option value="transferencia">Transferencia</option>
                  <option value="efectivo">Efectivo</option>
                  <option value="tarjeta">Tarjeta</option>
                </select>
              </label>
              {metodo === "efectivo" ? (
                <label className="block">
                  Quién recibió el efectivo
                  <select
                    required
                    className={entrada}
                    value={receptor}
                    onChange={(e) => setReceptor(e.target.value)}
                  >
                    {opcionesPersonas()}
                  </select>
                </label>
              ) : (
                <label className="block">
                  Referencia reportada
                  <input
                    required
                    className={entrada}
                    value={referencia}
                    onChange={(e) => setReferencia(e.target.value)}
                  />
                </label>
              )}
              <button className={boton} disabled={ocupado}>
                Registrar pago pendiente de confirmar
              </button>
            </form>
          )}
          {(o.pagos || []).map((pago) => (
            <article key={pago.id} className="border rounded-lg p-3 space-y-2">
              <strong>
                {formatMoneda(pago.monto)} · {pago.metodo}
              </strong>
              <p>{pago.verificado ? "Confirmado" : "Pendiente de verificar"}</p>
              {pago.recibidoPorNombre && (
                <p>Recibió: {pago.recibidoPorNombre}</p>
              )}
              {pago.referencia && <p>Referencia: {pago.referencia}</p>}
              {!pago.verificado && permisos.verificar && (
                <>
                  <label className="block">
                    {pago.metodo === "efectivo"
                      ? "Confirmación de recepción (escribe CONFIRMAR)"
                      : "Referencia comprobada en el banco"}
                    <input
                      className={entrada}
                      value={confirmacion[pago.id] || ""}
                      onChange={(e) =>
                        setConfirmacion((v) => ({
                          ...v,
                          [pago.id]: e.target.value,
                        }))
                      }
                    />
                  </label>
                  <button
                    className={boton}
                    disabled={
                      ocupado ||
                      (pago.metodo === "efectivo"
                        ? confirmacion[pago.id] !== "CONFIRMAR"
                        : !confirmacion[pago.id]?.trim())
                    }
                    onClick={() =>
                      void guardar("confirmar_pago", {
                        pagoId: pago.id,
                        referencia: confirmacion[pago.id],
                      })
                    }
                  >
                    Confirmar dinero recibido
                  </button>
                </>
              )}
              {pago.metodo === "efectivo" && pago.verificado && (
                <p>
                  Pendiente de entregar a oficina:{" "}
                  {formatMoneda(efectivoPendiente(pago))}
                  {!pago.crm && " · registro anterior: requiere conciliación"}
                </p>
              )}
              {pago.metodo === "efectivo" &&
                pago.verificado &&
                pago.crm &&
                permisos.verificar &&
                efectivoPendiente(pago) > 0 && (
                  <div>
                    <label>
                      Importe que oficina recibe ahora
                      <input
                        className={entrada}
                        type="number"
                        min="0.01"
                        step="0.01"
                        max={efectivoPendiente(pago)}
                        value={entregas[pago.id] || ""}
                        onChange={(e) =>
                          setEntregas((v) => ({
                            ...v,
                            [pago.id]: e.target.value,
                          }))
                        }
                      />
                    </label>
                    <button
                      className={boton}
                      disabled={ocupado || !(Number(entregas[pago.id]) > 0)}
                      onClick={() => setEntregaConfirmar(pago.id)}
                    >
                      Revisar entrega a oficina
                    </button>
                    {entregaConfirmar === pago.id && (
                      <div className="bg-amber-50 p-2">
                        <p>
                          ¿Oficina recibió{" "}
                          {formatMoneda(Number(entregas[pago.id]))} de{" "}
                          {pago.recibidoPorNombre || "este receptor"}?
                        </p>
                        <button
                          className={boton}
                          disabled={ocupado}
                          onClick={() => {
                            void guardar("entrega_efectivo", {
                              pagoId: pago.id,
                              monto: Number(entregas[pago.id]),
                              motivo:
                                "Entrega de efectivo confirmada en oficina",
                            });
                            setEntregaConfirmar(null);
                          }}
                        >
                          Sí, registrar entrega
                        </button>
                        <button
                          className={boton}
                          onClick={() => setEntregaConfirmar(null)}
                        >
                          Cancelar
                        </button>
                      </div>
                    )}
                  </div>
                )}
              {datos.recibos.some((r) => r.id === pago.id) && (
                <button
                  className={boton}
                  onClick={() =>
                    setRecibo(datos.recibos.find((r) => r.id === pago.id)!)
                  }
                >
                  Ver comprobante de abono
                </button>
              )}
            </article>
          ))}
          {recibo && (
            <div className="border border-blue-200 rounded-xl p-3 space-y-2">
              <h4 className="font-semibold">
                Vista previa · {o.clienteTelefono || "Sin teléfono"}
              </h4>
              <pre className="whitespace-pre-wrap font-sans">
                {recibo.texto}
              </pre>
              <button
                className={boton}
                disabled={ocupado || !o.clienteTelefono}
                onClick={async () => {
                  setOcupado(true);
                  try {
                    await enviarTexto(o.clienteTelefono!, recibo.texto, {
                      ordenId,
                    });
                    setAviso(
                      "Comprobante enviado a WhatsApp. Revisa el estado de entrega en el chat.",
                    );
                    setRecibo(null);
                  } catch (e) {
                    setAviso((e as Error).message);
                  } finally {
                    setOcupado(false);
                  }
                }}
              >
                Enviar comprobante por WhatsApp
              </button>
              <button className={boton} onClick={() => setRecibo(null)}>
                Cerrar vista previa
              </button>
            </div>
          )}
        </div>
      )}
      {tab === "agenda" && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void guardar("agenda", {
              tecnicoId: tecnico,
              fechaCita: new Date(cita).toISOString(),
              motivo,
            });
          }}
        >
          <p>
            Secretaría agenda; operaria puede sustituirla. Los cobros previos
            conservan su receptor original.
          </p>
          <label className="block">
            Técnico
            <select
              required
              className={entrada}
              value={tecnico}
              onChange={(e) => setTecnico(e.target.value)}
            >
              {opcionesPersonas(["tecnico"])}
            </select>
          </label>
          <label className="block">
            Día y hora
            <input
              required
              type="datetime-local"
              className={entrada}
              value={cita}
              onChange={(e) => setCita(e.target.value)}
            />
          </label>
          <label className="block">
            Motivo o acuerdo con el cliente
            <textarea
              required
              className={entrada}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </label>
          <button className={boton} disabled={ocupado}>
            Guardar cita y técnico
          </button>
        </form>
      )}
      {tab === "equipo" && (
        <div className="space-y-3">
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              void guardar("traspasar", { destinoId: destino, etapa, motivo });
            }}
          >
            <label className="block">
              Enviar caso a
              <select
                required
                className={entrada}
                value={destino}
                onChange={(e) => setDestino(e.target.value)}
              >
                {opcionesPersonas([
                  "secretaria",
                  "operaria",
                  "coordinadora",
                  "administrador",
                ])}
              </select>
            </label>
            <label className="block">
              Etapa
              <select
                className={entrada}
                value={etapa}
                onChange={(e) => setEtapa(e.target.value)}
              >
                <option value="secretaria">Agenda / garantía</option>
                <option value="operaria">Atención de la visita</option>
                <option value="supervision">
                  Revisión posterior al cierre técnico
                </option>
              </select>
            </label>
            <label className="block">
              Qué queda pendiente
              <textarea
                required
                className={entrada}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
              />
            </label>
            <button className={boton} disabled={ocupado || !!meta.traspaso}>
              Enviar para recepción
            </button>
          </form>
          {permisos.supervisor && (
            <button
              className={boton}
              disabled={ocupado || !destino || !motivo.trim()}
              onClick={() =>
                void guardar("cartera", {
                  destinoId: destino,
                  motivo,
                  carteraVersion: datos.cartera?.version || 0,
                })
              }
            >
              Asignar cartera del cliente a la persona seleccionada
            </button>
          )}
          {meta.traspaso && permisos.supervisor && (
            <button
              className={boton}
              disabled={ocupado || !motivo.trim()}
              onClick={() => void guardar("cancelar_traspaso", { motivo })}
            >
              Cancelar traspaso con el motivo indicado
            </button>
          )}
          {permisos.supervisor && (
            <div className="border-t pt-3">
              <p>Revisión después del cierre técnico</p>
              <label className="block">
                Observaciones
                <textarea
                  className={entrada}
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                />
              </label>
              <button
                className={boton}
                disabled={ocupado || !motivo.trim()}
                onClick={() =>
                  void guardar("revision", { motivo, conforme: true })
                }
              >
                Confirmar revisión
              </button>
              <button
                className={boton}
                disabled={ocupado || !motivo.trim()}
                onClick={() =>
                  void guardar("revision", { motivo, conforme: false })
                }
              >
                Solicitar corrección
              </button>
              <p className="text-xs">
                La comisión se revisa en Comisiones; esta acción no la liquida.
              </p>
            </div>
          )}
        </div>
      )}
      {tab === "documentos" && (
        <Suspense fallback={<p>Cargando documentos…</p>}>
          <FacturacionEnChat ordenId={ordenId} />
        </Suspense>
      )}
      {tab === "historial" && (
        <div className="space-y-3">
          {datos.parcial && (
            <p role="alert">
              Se muestra una parte del historial. No representa todos los
              movimientos.
            </p>
          )}
          {datos.eventos.map((ev) => (
            <article key={ev.id} className="border-l-2 border-blue-300 pl-3">
              <strong>{labels[ev.accion] || ev.accion}</strong>
              <p>
                {ev.actorNombre} · {fecha(ev.fechaMs)}
              </p>
              {typeof ev.detalle.motivo === "string" && (
                <p>{ev.detalle.motivo}</p>
              )}
              {typeof ev.detalle.texto === "string" && (
                <p>{ev.detalle.texto}</p>
              )}
              {typeof ev.detalle.monto === "number" && (
                <p>{formatMoneda(ev.detalle.monto)}</p>
              )}
            </article>
          ))}
          <p className="text-xs">
            Este historial recoge las nuevas gestiones del CRM. Los registros
            anteriores siguen en el historial de la orden.
          </p>
        </div>
      )}
    </section>
  );
}
