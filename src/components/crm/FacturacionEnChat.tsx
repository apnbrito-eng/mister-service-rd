import { useEffect, useState } from "react";
import {
  collection,
  doc,
  getDocs,
  getDoc,
  query,
  where,
} from "firebase/firestore";
import { db } from "../../firebase/config";
import { useApp } from "../../context/AppContext";
import { puede } from "../../utils/permisos";
import {
  parseOrden,
  parseServicioPrecio,
  parsePiezaInventario,
  parseFactura,
} from "../../utils";
import type {
  OrdenServicio,
  ServicioPrecio,
  PiezaInventario,
  Personal,
  Factura,
} from "../../types";
import { mensajeConduceGarantia } from "../../utils/whatsapp";
import { enviarTexto } from "../../services/whatsapp.service";
import ProcesarFacturacionModal from "../facturacion-pendiente/ProcesarFacturacionModal";
export default function FacturacionEnChat({ ordenId }: { ordenId: string }) {
  const { userProfile } = useApp();
  const [datos, setDatos] = useState<{
    orden: OrdenServicio;
    servicios: ServicioPrecio[];
    piezas: PiezaInventario[];
    personal: Personal[];
  } | null>(null);
  const [emitidos, setEmitidos] = useState<Factura[]>([]);
  const [preview, setPreview] = useState<Factura | null>(null);
  const [telefono, setTelefono] = useState("");
  const [aviso, setAviso] = useState("");
  const [abierto, setAbierto] = useState(false),
    [error, setError] = useState(""),
    [cargando, setCargando] = useState(false);
  useEffect(() => {
    setDatos(null);
    setAbierto(false);
  }, [ordenId]);
  useEffect(() => {
    let vivo = true;
    Promise.all([
      getDocs(
        query(collection(db, "facturas"), where("ordenId", "==", ordenId)),
      ),
      getDoc(doc(db, "ordenes_servicio", ordenId)),
    ])
      .then(([fac, ord]) => {
        if (vivo) {
          setEmitidos(fac.docs.map((d) => parseFactura(d.id, d.data())));
          setTelefono(ord.data()?.clienteTelefono || "");
        }
      })
      .catch(() => {
        if (vivo) setError("No se pudieron cargar los documentos emitidos.");
      });
    return () => {
      vivo = false;
    };
  }, [ordenId, abierto]);
  async function abrir() {
    setCargando(true);
    setError("");
    try {
      const [o, s, p, personal] = await Promise.all([
        getDoc(doc(db, "ordenes_servicio", ordenId)),
        getDocs(collection(db, "precios_servicios")),
        getDocs(collection(db, "piezas_inventario")),
        getDocs(collection(db, "personal")),
      ]);
      if (!o.exists()) throw new Error("La orden ya no está disponible.");
      if (o.data().facturada)
        throw new Error(
          "La orden ya tiene documento emitido. Consulta Facturas para evitar duplicarlo.",
        );
      setDatos({
        orden: parseOrden(o.id, o.data()),
        servicios: s.docs.map((d) => parseServicioPrecio(d.id, d.data())),
        piezas: p.docs.map((d) => parsePiezaInventario(d.id, d.data())),
        personal: personal.docs
          .map((d) => ({ id: d.id, ...d.data() }) as Personal)
          .filter((p) => p.activo !== false),
      });
      setAbierto(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }
  if (
    !puede(userProfile, "facturasCrear") &&
    !puede(userProfile, "facturasCerrar")
  )
    return (
      <p>
        La emisión del documento corresponde al personal autorizado de
        facturación.
      </p>
    );
  return (
    <div className="space-y-3">
      {aviso && <p role="status">{aviso}</p>}
      {emitidos.map((f) => (
        <div key={f.id} className="border rounded p-2">
          <p>Documento emitido: {f.numero}</p>
          <button className="border rounded p-2" onClick={() => setPreview(f)}>
            Preparar envío por WhatsApp
          </button>
        </div>
      ))}
      {preview && (
        <div className="bg-blue-50 p-3 rounded">
          <p>Destinatario: {telefono || "Sin teléfono"}</p>
          <pre className="whitespace-pre-wrap font-sans">
            {mensajeConduceGarantia(preview)}
          </pre>
          <button
            disabled={cargando || !telefono}
            className="border rounded p-2"
            onClick={async () => {
              setCargando(true);
              try {
                await enviarTexto(telefono, mensajeConduceGarantia(preview), {
                  ordenId,
                });
                setAviso("Mensaje enviado. Consulta entrega en el chat.");
                setPreview(null);
              } catch (e) {
                setAviso((e as Error).message);
              } finally {
                setCargando(false);
              }
            }}
          >
            Enviar resumen y enlace de garantía
          </button>
          <button
            className="border rounded p-2"
            onClick={() => setPreview(null)}
          >
            Cancelar
          </button>
        </div>
      )}
      <h4 className="font-semibold">Documento del servicio</h4>
      <p>
        Abre el formulario existente de facturación sin salir del chat. Conserva
        las reglas de garantía y comisión del sistema.
      </p>
      <p>Los abonos se registran y confirman en Pagos antes de emitir.</p>
      {error && <p role="alert">{error}</p>}
      <button
        className="border rounded-lg p-2"
        disabled={cargando}
        onClick={() => void abrir()}
      >
        {cargando ? "Cargando catálogos…" : "Revisar y emitir documento"}
      </button>
      {abierto && datos && (
        <ProcesarFacturacionModal
          orden={datos.orden}
          userProfile={userProfile}
          catalogoServicios={datos.servicios}
          catalogoPiezas={datos.piezas}
          tecnicos={datos.personal.filter((p) => p.rol === "tecnico")}
          personalActivo={datos.personal}
          onClose={() => setAbierto(false)}
        />
      )}
    </div>
  );
}
