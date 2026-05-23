import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Send,
  Phone,
  Search,
  MessageSquare,
  CheckCheck,
} from 'lucide-react';
import { collection, doc, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useApp } from '../context/AppContext';
import {
  suscribirConversaciones,
  suscribirMensajes,
  marcarLeida,
} from '../services/whatsappInbox.service';
import { enviarTexto } from '../services/whatsapp.service';
import {
  suscribirRespuestasRapidas,
  type WhatsappRespuestaRapida,
} from '../services/whatsappRespuestasRapidas.service';
import MensajeBubble from '../components/inbox/MensajeBubble';
import IndicadorVentana24h from '../components/inbox/IndicadorVentana24h';
import ToggleBot from '../components/inbox/ToggleBot';
import { type PrefillCrearOrden } from '../components/inbox/CardCliente';
import PanelCliente360 from '../components/inbox/PanelCliente360';
import SelectorPlantillas from '../components/inbox/SelectorPlantillas';
import OrdenCreateModal from '../components/ordenes/OrdenCreateModal';
import { useOrdenCreateForm } from '../hooks/useOrdenCreateForm';
import type {
  OrdenServicio,
  WhatsAppConversacion,
  WhatsAppMensajeInbox,
  WhatsAppMensajeOutbox,
} from '../types';
import { parseOrden } from '../utils';
import toast from 'react-hot-toast';

/**
 * Página `/admin/inbox/:waId` — vista detalle 3 columnas
 * (SPRINT-INBOX-3, 2026-05-20).
 *
 * Layout:
 *   - Col 1: lista compacta de conversaciones (re-usa suscribirConversaciones,
 *     mismo source que /admin/inbox).
 *   - Col 2: datos básicos del cliente (placeholder — SPRINT-INBOX-5 lo amplía
 *     con órdenes vinculadas).
 *   - Col 3: timeline mensajes + composer footer + indicador ventana 24h.
 *
 * Comportamiento:
 *   - Al montar y al cambiar waId, suscribe mensajes y marca leído.
 *   - Sin auto-scroll forzado: se hace scroll al final solo cuando llegan
 *     mensajes nuevos (no en cada re-render).
 *   - Si la ventana 24h está cerrada, el input se deshabilita y muestra
 *     mensaje guiando al uso de plantillas (SPRINT-INBOX-3 todavía no
 *     implementa selector de plantillas — placeholder).
 *
 * Responsive (sub-criterio): col1 colapsa <1200px → solo iconos / volver
 * a /admin/inbox para elegir conversación.
 */

type MensajeRender =
  | (WhatsAppMensajeInbox & { _direccion: 'entrante' })
  | (WhatsAppMensajeOutbox & { _direccion: 'saliente' });

export default function InboxConversacion() {
  const { waId } = useParams<{ waId: string }>();
  const navigate = useNavigate();
  const { currentUser, userProfile } = useApp();

  const [conversaciones, setConversaciones] = useState<WhatsAppConversacion[]>([]);
  const [conversacionActual, setConversacionActual] = useState<WhatsAppConversacion | null>(null);
  const [mensajes, setMensajes] = useState<MensajeRender[]>([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [buscar, setBuscar] = useState('');
  const [loading, setLoading] = useState(true);

  // SPRINT-INBOX-8 (2026-05-21): modal crear orden EN contexto del inbox,
  // sin navegar a /admin/ordenes. Replica patrón Ordenes.tsx/Citas.tsx:
  // hook compartido useOrdenCreateForm + OrdenCreateModal, alimentado con
  // un prefill cuando el operario clickea desde CardCliente.
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [ordenesInbox, setOrdenesInbox] = useState<OrdenServicio[]>([]);
  const [prefillPendiente, setPrefillPendiente] = useState<PrefillCrearOrden | null>(null);
  const [refreshOrdenesCardKey, setRefreshOrdenesCardKey] = useState(0);

  const timelineRef = useRef<HTMLDivElement>(null);
  const ultimoCountRef = useRef(0);

  // SPRINT-WA-TRAZABILIDAD (2026-05-23) — respuestas rápidas. Sub-realtime
  // a config/whatsapp_respuestas_rapidas + dropdown que se abre al escribir
  // "/" como primer char del input (o ante un nuevo "/" tras espacio).
  const [respuestasRapidas, setRespuestasRapidas] = useState<WhatsappRespuestaRapida[]>([]);
  const [mostrarDropdownRespuestas, setMostrarDropdownRespuestas] = useState(false);
  const [filtroRespuestas, setFiltroRespuestas] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const unsub = suscribirRespuestasRapidas((cfg) => setRespuestasRapidas(cfg.items));
    return () => unsub();
  }, []);

  // Suscripción liviana a ordenes_servicio para alimentar useOrdenCreateForm
  // (necesita la lista para validar double-booking del técnico). Mismo patrón
  // que Ordenes.tsx — orderBy createdAt desc.
  useEffect(() => {
    if (!showCreateModal) return;
    const q = query(collection(db, 'ordenes_servicio'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setOrdenesInbox(
        snap.docs
          .filter((d) => d.data().eliminada !== true)
          .map((d) => parseOrden(d.id, d.data() as Record<string, unknown>)),
      );
    });
    return () => unsub();
  }, [showCreateModal]);

  const createForm = useOrdenCreateForm({
    ordenes: ordenesInbox,
    usuarioActual: { id: currentUser?.uid, nombre: userProfile?.nombre },
    onAfterCreate: () => {
      setShowCreateModal(false);
      setPrefillPendiente(null);
      // Forzar re-mount de CardCliente para que recargue órdenes activas.
      setRefreshOrdenesCardKey((k) => k + 1);
    },
  });

  // Aplicar prefill al hook una vez que el modal se abre y el cliente está
  // bien cargado. Se ejecuta UNA sola vez por waId+tipo de prefill para no
  // pisar ediciones del operario.
  const prefillAplicadoRef = useRef<string | null>(null);
  useEffect(() => {
    if (!showCreateModal || !prefillPendiente) return;
    const clave =
      prefillPendiente.tipo === 'cliente-existente'
        ? `existente:${prefillPendiente.cliente.id}`
        : `nuevo:${prefillPendiente.telefono}`;
    if (prefillAplicadoRef.current === clave) return;
    prefillAplicadoRef.current = clave;

    if (prefillPendiente.tipo === 'cliente-existente') {
      createForm.handleSelectCliente(prefillPendiente.cliente);
    } else {
      const tel = prefillPendiente.telefono;
      const nombre = prefillPendiente.nombre;
      createForm.setIsNewCliente(true);
      createForm.setForm((f) => ({
        ...f,
        clienteTelefono: tel,
        clienteNombre: nombre ?? f.clienteNombre,
      }));
    }
  }, [showCreateModal, prefillPendiente, createForm]);

  // Limpiar prefillAplicadoRef al cerrar el modal — el siguiente abrir
  // puede traer otro prefill.
  useEffect(() => {
    if (!showCreateModal) {
      prefillAplicadoRef.current = null;
    }
  }, [showCreateModal]);

  function handleCrearOrden(prefill: PrefillCrearOrden) {
    setPrefillPendiente(prefill);
    setShowCreateModal(true);
  }

  // SPRINT-INBOX-8b (2026-05-21): callbacks que pasamos a MensajeBubble
  // SOLO cuando el form de orden está abierto (drawer). Si no hay form
  // abierto, callbacks son undefined → los íconos no se renderizan.
  // - onCopiarAOrden: pega el texto en `descripcionFalla`. Heurística simple
  //   pero útil: en el flujo típico la operaria abre la orden y quiere
  //   trasladar el reclamo del cliente al campo de falla. Si ya hay texto,
  //   concatena con salto de línea.
  // - onUsarUbicacion: vuelca lat/lng (+ dirección si viene) a los campos
  //   correspondientes del form mediante setForm.
  const handleCopiarAOrden = showCreateModal
    ? (texto: string) => {
        createForm.setForm((f) => ({
          ...f,
          descripcionFalla: f.descripcionFalla
            ? `${f.descripcionFalla}\n${texto}`
            : texto,
        }));
        toast.success('Texto copiado a la orden (falla)');
      }
    : undefined;
  const handleUsarUbicacion = showCreateModal
    ? (loc: { lat: number; lng: number; direccion?: string }) => {
        createForm.setForm((f) => ({
          ...f,
          clienteLat: loc.lat,
          clienteLng: loc.lng,
          clienteDireccion: loc.direccion?.trim() ? loc.direccion : f.clienteDireccion,
        }));
        toast.success('Ubicación volcada a la orden');
      }
    : undefined;

  // SPRINT-INBOX-9 (2026-05-22): callback que pasamos a MensajeBubble para
  // mensajes tipo image entrantes. POST a `/api/whatsapp/media-proxy` con
  // el wamid; el endpoint descarga de Meta + persiste en Firebase Storage
  // (path `whatsapp-media/{wa_id}/{wamid}.{ext}`) + retorna URL firmada
  // 7 días. La URL se vuelca al campo `fotoEquipoUrl` del form.
  //
  // Idempotencia: el endpoint detecta si el archivo ya existe y reutiliza
  // (responde `reused: true`); siempre regenera la URL firmada.
  //
  // Prerequisito storage.rules: SPRINT-138 deployado (path `whatsapp-media/`
  // gateado). Si Jorge aún no corrió `npm run deploy:storage-rules`, el
  // endpoint funciona (Admin SDK ignora rules) pero la URL pública puede
  // fallar lecturas client-side hasta el deploy.
  const handleAdjuntarFotoAOrden = showCreateModal && waId
    ? async (wamid: string) => {
        if (!currentUser) {
          toast.error('Sesión expirada — recargá la página');
          return;
        }
        try {
          const idToken = await currentUser.getIdToken();
          const resp = await fetch('/api/whatsapp/media-proxy', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({ wamid, wa_id: waId }),
          });
          if (!resp.ok) {
            const body = (await resp.json().catch(() => ({}))) as { error?: string };
            toast.error(`No se pudo adjuntar la foto (${body.error ?? resp.status})`);
            return;
          }
          const data = (await resp.json()) as { urlImagen?: string };
          if (!data.urlImagen) {
            toast.error('La respuesta del proxy no incluye URL');
            return;
          }
          createForm.setForm((f) => ({ ...f, fotoEquipoUrl: data.urlImagen as string }));
          toast.success(
            createForm.form.fotoEquipoUrl
              ? 'Foto adjuntada (reemplazó la anterior)'
              : 'Foto adjuntada a la orden',
          );
        } catch (err) {
          console.error('[inbox/media-proxy] error:', err);
          toast.error('Error de red al adjuntar la foto');
        }
      }
    : undefined;

  // Lista de conversaciones (col 1).
  useEffect(() => {
    const unsub = suscribirConversaciones(setConversaciones);
    return () => unsub();
  }, []);

  // Mensajes de la conversación activa (col 3).
  useEffect(() => {
    if (!waId) return;
    setMensajes([]);
    ultimoCountRef.current = 0;
    setLoading(true);
    const unsub = suscribirMensajes(waId, (items) => {
      setMensajes(items);
      setLoading(false);
    });
    return () => unsub();
  }, [waId]);

  // Conversación activa (read directo del doc para tener `noLeidos` actual).
  useEffect(() => {
    if (!waId) return;
    const ref = doc(db, 'whatsapp_conversaciones', waId);
    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) {
        setConversacionActual(null);
        return;
      }
      const data = snap.data();
      setConversacionActual({
        id: snap.id,
        wa_id: (data.wa_id as string) ?? snap.id,
        ultimoPhoneNumberId: (data.ultimoPhoneNumberId as string) ?? '',
        clienteId: data.clienteId as string | undefined,
        ultimoMensajeEntrante: data.ultimoMensajeEntrante as WhatsAppConversacion['ultimoMensajeEntrante'],
        ultimoMensajeSaliente: data.ultimoMensajeSaliente as WhatsAppConversacion['ultimoMensajeSaliente'],
        noLeidos: typeof data.noLeidos === 'number' ? data.noLeidos : 0,
        ventana24h: (data.ventana24h as WhatsAppConversacion['ventana24h']) ?? {
          abierta: false,
          cierraEn: new Date(0),
        },
        requiereHumano: data.requiereHumano === true,
        asignadaA: (data.asignadaA as string | null) ?? null,
        etiquetas: Array.isArray(data.etiquetas) ? (data.etiquetas as string[]) : [],
        bot: data.bot as WhatsAppConversacion['bot'],
        primeraInteraccion: data.primeraInteraccion as WhatsAppConversacion['primeraInteraccion'],
        ultimaActividad: data.ultimaActividad as WhatsAppConversacion['ultimaActividad'],
        updatedAt: data.updatedAt as WhatsAppConversacion['updatedAt'],
      });
    });
    return () => unsub();
  }, [waId]);

  // Marca leído al abrir conversación (best-effort, no bloquea).
  useEffect(() => {
    if (!waId || !conversacionActual || conversacionActual.noLeidos === 0) return;
    marcarLeida(waId).catch((err) => {
      // eslint-disable-next-line no-console
      console.warn('[InboxConversacion] marcarLeida falló:', err);
    });
  }, [waId, conversacionActual]);

  // Scroll al final solo cuando llegan mensajes nuevos.
  useEffect(() => {
    if (mensajes.length > ultimoCountRef.current && timelineRef.current) {
      const el = timelineRef.current;
      // Si el user está cerca del final, hacer scroll; sino respetar su posición.
      const cercaDelFinal = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
      if (cercaDelFinal || ultimoCountRef.current === 0) {
        el.scrollTop = el.scrollHeight;
      }
    }
    ultimoCountRef.current = mensajes.length;
  }, [mensajes]);

  const ventanaAbierta = useMemo(() => {
    const v = conversacionActual?.ventana24h;
    if (!v?.abierta) return false;
    const cierraDate =
      v.cierraEn instanceof Date
        ? v.cierraEn
        : new Date((v.cierraEn as { toMillis?: () => number }).toMillis?.() ?? 0);
    return cierraDate.getTime() > Date.now();
  }, [conversacionActual]);

  const conversacionesFiltradas = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    if (q.length === 0) return conversaciones;
    return conversaciones.filter((c) => {
      if (c.wa_id.includes(q)) return true;
      const ent = c.ultimoMensajeEntrante?.preview?.toLowerCase() ?? '';
      const sal = c.ultimoMensajeSaliente?.preview?.toLowerCase() ?? '';
      return ent.includes(q) || sal.includes(q);
    });
  }, [conversaciones, buscar]);

  async function handleEnviar() {
    if (!waId || !texto.trim() || enviando) return;
    if (!ventanaAbierta) {
      toast.error('Ventana 24h cerrada. Usá una plantilla aprobada para reabrir.');
      return;
    }
    setEnviando(true);
    try {
      const r = await enviarTexto(waId, texto.trim());
      if ('error' in r && r.error) {
        toast.error(`No se pudo enviar: ${r.error}`);
      } else {
        setTexto('');
        toast.success('Enviado');
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[InboxConversacion] enviarTexto falló:', err);
      toast.error('Error al enviar — revisá la conexión');
    } finally {
      setEnviando(false);
    }
  }

  // SPRINT-WA-TRAZABILIDAD (2026-05-23) — detección del prefix "/atajo" en
  // la posición actual del cursor. Devuelve { match, start, end } si hay
  // un "/" reciente sin espacios después (= candidato para autocomplete);
  // null si no aplica.
  function detectarPrefixSlash(value: string, cursor: number): { match: string; start: number } | null {
    if (cursor <= 0) return null;
    // Buscar el "/" más cercano hacia atrás, sin atravesar espacios/saltos.
    let i = cursor - 1;
    while (i >= 0) {
      const ch = value.charAt(i);
      if (ch === '/') {
        // Verificar que el char anterior sea inicio-de-input o whitespace
        // (para no matchear URLs ni "x/y").
        if (i === 0 || /\s/.test(value.charAt(i - 1))) {
          return { match: value.substring(i + 1, cursor), start: i };
        }
        return null;
      }
      if (/\s/.test(ch)) return null;
      i--;
    }
    return null;
  }

  function handleTextoChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value;
    setTexto(value);
    const cursor = e.target.selectionStart ?? value.length;
    const det = detectarPrefixSlash(value, cursor);
    if (det) {
      setMostrarDropdownRespuestas(true);
      setFiltroRespuestas(det.match.toLowerCase());
    } else {
      setMostrarDropdownRespuestas(false);
      setFiltroRespuestas('');
    }
  }

  function aplicarRespuestaRapida(item: WhatsappRespuestaRapida) {
    // Reemplazar el "/atajo<filtro>" en la posición del cursor por `item.texto`.
    const ta = textareaRef.current;
    if (!ta) return;
    const cursor = ta.selectionStart ?? texto.length;
    const det = detectarPrefixSlash(texto, cursor);
    if (!det) {
      // Fallback: append al final.
      setTexto((prev) => (prev.length > 0 ? `${prev}${prev.endsWith(' ') ? '' : ' '}${item.texto}` : item.texto));
      setMostrarDropdownRespuestas(false);
      setFiltroRespuestas('');
      return;
    }
    const antes = texto.substring(0, det.start);
    const despues = texto.substring(cursor);
    const nuevo = `${antes}${item.texto}${despues}`;
    setTexto(nuevo);
    setMostrarDropdownRespuestas(false);
    setFiltroRespuestas('');
    // Mover cursor al final del texto insertado.
    setTimeout(() => {
      const ta2 = textareaRef.current;
      if (ta2) {
        const pos = antes.length + item.texto.length;
        ta2.focus();
        ta2.setSelectionRange(pos, pos);
      }
    }, 0);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Si el dropdown de respuestas está abierto, ESC lo cierra sin enviar.
    if (mostrarDropdownRespuestas && e.key === 'Escape') {
      e.preventDefault();
      setMostrarDropdownRespuestas(false);
      setFiltroRespuestas('');
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleEnviar();
    }
  }

  // Lista filtrada de respuestas para el dropdown (case-insensitive prefix).
  const respuestasFiltradas = useMemo(() => {
    if (!mostrarDropdownRespuestas) return [];
    const f = filtroRespuestas.trim().toLowerCase();
    if (f.length === 0) return respuestasRapidas;
    return respuestasRapidas.filter((r) => r.atajo.toLowerCase().startsWith(f));
  }, [respuestasRapidas, filtroRespuestas, mostrarDropdownRespuestas]);

  function formatTelRD(wa: string): string {
    if (!wa || wa.length < 10) return wa;
    const d = wa.replace(/\D/g, '').slice(-10);
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-gray-50">
      <div className="flex flex-1 min-h-0">
        {/* SPRINT-INBOX-11 (2026-05-22): cuando el drawer de crear orden está
            abierto, lo montamos COMO PRIMERA COLUMNA EN FLUJO (izquierda), y
            el chat queda a la derecha como segunda columna. Así `[form|chat]`
            son hermanas → cero solapamiento a cualquier ancho. Antes (8c) el
            drawer era `fixed top-0 right-0` con % del viewport + padding hack
            en el main; eso seguía tapando el borde derecho del chat a anchos
            normales de laptop. Col 1 (lista) y Col 2 (PanelCliente360) siguen
            ocultas con el drawer abierto, como en 8c. */}
        {showCreateModal && (
          <section className="flex flex-col w-full md:w-1/2 lg:w-[55%] xl:w-[50%] min-h-0 shrink-0">
            <OrdenCreateModal
              form={createForm.form}
              setForm={createForm.setForm}
              clienteBusqueda={createForm.clienteBusqueda}
              setClienteBusqueda={createForm.setClienteBusqueda}
              showClienteDropdown={createForm.showClienteDropdown}
              setShowClienteDropdown={createForm.setShowClienteDropdown}
              isNewCliente={createForm.isNewCliente}
              setIsNewCliente={createForm.setIsNewCliente}
              saving={createForm.saving}
              clientes={createForm.clientes}
              clientesFiltrados={createForm.clientesFiltrados}
              tecnicos={createForm.tecnicos}
              horariosOcupadosCreate={createForm.horariosOcupadosCreate}
              ordenesActivasCliente={createForm.ordenesActivasCliente}
              buscandoTelefono={createForm.buscandoTelefono}
              showTelefonoDropdown={createForm.showTelefonoDropdown}
              setShowTelefonoDropdown={createForm.setShowTelefonoDropdown}
              clientesFiltradosTelefono={createForm.clientesFiltradosTelefono}
              onSubmit={createForm.handleSubmit}
              onClose={() => {
                setShowCreateModal(false);
                setPrefillPendiente(null);
                createForm.resetForm();
              }}
              handleDireccionChange={createForm.handleDireccionChange}
              handleSelectCliente={createForm.handleSelectCliente}
              handleClienteTelefonoChange={createForm.handleClienteTelefonoChange}
              chequeoPrevio={createForm.chequeoPrevioCreate}
              aplicarDescuento={createForm.aplicarDescuentoCreate}
              setAplicarDescuento={createForm.setAplicarDescuentoCreate}
              presentationMode="drawer"
              extraFooterSlot={
                createForm.isNewCliente && prefillPendiente?.tipo === 'cliente-nuevo' ? (
                  <div className="mb-3 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-md text-xs text-emerald-800">
                    Este contacto no esta registrado como cliente. Se creara
                    automaticamente al guardar la orden.
                  </div>
                ) : null
              }
            />
          </section>
        )}

        {/* COL 1 — lista de conversaciones (hidden <md, w-72 md:w-80).
            SPRINT-INBOX-8c (2026-05-22): se OCULTA cuando el drawer de crear
            orden está abierto, para que el chat tenga ancho real disponible. */}
        <aside className={`${showCreateModal ? 'hidden' : 'hidden md:flex'} flex-col w-72 lg:w-80 border-r border-gray-200 bg-white`}>
          <div className="p-3 border-b border-gray-200 flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/admin/inbox')}
              className="p-1 rounded hover:bg-gray-100 text-gray-500"
              title="Volver a inbox"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="relative flex-1">
              <Search
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="search"
                value={buscar}
                onChange={(e) => setBuscar(e.target.value)}
                placeholder="Buscar..."
                className="w-full pl-8 pr-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
          </div>
          <ul className="flex-1 overflow-y-auto py-1">
            {conversacionesFiltradas.length === 0 ? (
              <li className="px-4 py-6 text-center text-xs text-gray-400">
                Sin conversaciones
              </li>
            ) : (
              conversacionesFiltradas.map((c) => {
                const activa = c.wa_id === waId;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/admin/inbox/${c.wa_id}`)}
                      className={`w-full text-left px-3 py-2 border-l-2 hover:bg-gray-50 transition-colors ${
                        activa
                          ? 'border-brand-600 bg-brand-50/50'
                          : 'border-transparent'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`text-sm truncate ${
                            c.noLeidos > 0 ? 'font-semibold text-gray-900' : 'text-gray-700'
                          }`}
                        >
                          {formatTelRD(c.wa_id)}
                        </span>
                        {c.noLeidos > 0 && (
                          <span className="bg-brand-600 text-white text-[10px] rounded-full px-1.5 py-0.5 min-w-[18px] text-center flex-shrink-0">
                            {c.noLeidos > 9 ? '9+' : c.noLeidos}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 truncate mt-0.5">
                        {c.ultimoMensajeEntrante?.preview || c.ultimoMensajeSaliente?.preview || '—'}
                      </p>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </aside>

        {/* COL 2 — Panel cliente 360 (SPRINT-INBOX-10, 2026-05-22).
            Antes: bloque simple con datos+CardCliente (INBOX-5).
            Ahora: centro de mando del cliente con tabs (Datos, Órdenes,
            Garantías, Facturas, Historial) — `PanelCliente360` envuelve
            a `CardCliente` (que sigue siendo el responsable del tab Datos)
            y suma los tabs nuevos. El header con teléfono/etiquetas/
            asignación/toggle bot vive ARRIBA fijo, los tabs llenan el
            resto del aside con scroll interno.

            SPRINT-INBOX-8c (2026-05-22): el aside completo se OCULTA
            cuando el drawer de crear orden está abierto, para que el chat
            quede visible al lado del form. Sin regresión.

            Ancho ampliado a w-72 xl:w-80 para acomodar los tabs sin
            apretar. */}
        <aside className={`${showCreateModal ? 'hidden' : 'hidden lg:flex'} flex-col w-72 xl:w-80 border-r border-gray-200 bg-white`}>
          {conversacionActual ? (
            <>
              {/* Header fijo con info de la CONVERSACIÓN (no del cliente) */}
              <div className="p-3 border-b border-gray-100 space-y-2 flex-shrink-0">
                <h3 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                  Conversación
                </h3>
                <div className="flex items-center gap-2 text-sm">
                  <Phone size={14} className="text-gray-400" />
                  <span className="font-medium text-gray-900">
                    {formatTelRD(conversacionActual.wa_id)}
                  </span>
                </div>
                {conversacionActual.etiquetas && conversacionActual.etiquetas.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {conversacionActual.etiquetas.map((e) => (
                      <span
                        key={e}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-700"
                      >
                        {e}
                      </span>
                    ))}
                  </div>
                )}
                {conversacionActual.asignadaA && (
                  <div className="text-[11px] text-gray-500">
                    Asignada a:{' '}
                    <span
                      className={`font-medium ${
                        conversacionActual.asignadaA === currentUser?.uid
                          ? 'text-brand-600'
                          : 'text-gray-700'
                      }`}
                    >
                      {conversacionActual.asignadaA === currentUser?.uid
                        ? 'Tú'
                        : `uid ***${conversacionActual.asignadaA.slice(-6)}`}
                    </span>
                  </div>
                )}
                {/* SPRINT-INBOX-4 (2026-05-20): toggle bot IA. */}
                <ToggleBot
                  waId={conversacionActual.wa_id}
                  habilitado={conversacionActual.bot?.habilitado === true}
                  puedeTogglear={
                    conversacionActual.asignadaA === currentUser?.uid ||
                    // Sin asignación: cualquier staff puede tomar (la rule
                    // de bot decide al final; si no aplica, el service
                    // emite permission-denied y el toast lo explica).
                    true
                  }
                />
              </div>

              {/* Panel cliente 360 con tabs — flex-1 para llenar el resto */}
              <div className="flex-1 min-h-0">
                <PanelCliente360
                  key={`${conversacionActual.wa_id}-${refreshOrdenesCardKey}`}
                  waId={conversacionActual.wa_id}
                  onCrearOrden={handleCrearOrden}
                />
              </div>
            </>
          ) : (
            <div className="p-4">
              <p className="text-sm text-gray-400">Cargando conversación...</p>
            </div>
          )}
        </aside>

        {/* COL 3 — timeline + composer.
            SPRINT-INBOX-11 (2026-05-22): drawer ahora es columna flex en
            flujo (primera columna izquierda); el chat (`main`) es su
            hermana derecha vía `flex-1`. Sin padding hack — el flexbox se
            encarga del layout. Cero solapamiento a cualquier ancho. */}
        <main className="flex-1 flex flex-col min-w-0 bg-gray-50">
          {/* Header */}
          <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => navigate('/admin/inbox')}
                className="md:hidden p-1 rounded hover:bg-gray-100 text-gray-500"
                title="Volver"
              >
                <ArrowLeft size={18} />
              </button>
              <div className="min-w-0">
                <h2 className="font-semibold text-gray-900 truncate">
                  {conversacionActual ? formatTelRD(conversacionActual.wa_id) : waId}
                </h2>
                <p className="text-xs text-gray-500">
                  {conversacionActual?.ultimoPhoneNumberId
                    ? `vía ${conversacionActual.ultimoPhoneNumberId.slice(-4)}`
                    : 'WhatsApp'}
                </p>
              </div>
            </div>
            {conversacionActual?.ventana24h && (
              <IndicadorVentana24h ventana24h={conversacionActual.ventana24h} />
            )}
          </div>

          {/* Timeline */}
          <div
            ref={timelineRef}
            className="flex-1 overflow-y-auto px-4 py-3 space-y-2"
          >
            {loading ? (
              <div className="text-center py-12 text-gray-400">
                <MessageSquare size={28} className="mx-auto mb-2 opacity-40" />
                Cargando mensajes...
              </div>
            ) : mensajes.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <MessageSquare size={28} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm">Sin mensajes en esta conversación todavía</p>
              </div>
            ) : (
              mensajes.map((m) => (
                <MensajeBubble
                  key={m.id}
                  mensaje={m}
                  onCopiarAOrden={handleCopiarAOrden}
                  onUsarUbicacion={handleUsarUbicacion}
                  onAdjuntarAOrden={handleAdjuntarFotoAOrden}
                />
              ))
            )}
          </div>

          {/* Composer */}
          <div className="bg-white border-t border-gray-200 p-3">
            {!ventanaAbierta && waId && (
              <div className="mb-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-800 flex items-start gap-2">
                <CheckCheck size={14} className="mt-0.5 flex-shrink-0" />
                <div className="flex-1 flex items-start justify-between gap-3">
                  <span>
                    Ventana 24h cerrada. Para reabrir la conversación enviá una
                    plantilla aprobada por Meta.
                  </span>
                  <SelectorPlantillas waId={waId} />
                </div>
              </div>
            )}
            <div className="flex items-end gap-2 relative">
              <div className="flex-1 relative">
                <textarea
                  ref={textareaRef}
                  value={texto}
                  onChange={handleTextoChange}
                  onKeyDown={handleKeyDown}
                  onBlur={() => {
                    // Cerrar dropdown con un pequeño delay para permitir click en items.
                    setTimeout(() => setMostrarDropdownRespuestas(false), 150);
                  }}
                  placeholder={
                    ventanaAbierta
                      ? 'Escribí un mensaje... (Enter para enviar, Shift+Enter salto de línea, "/" para respuestas rápidas)'
                      : 'Ventana cerrada — usá una plantilla'
                  }
                  rows={2}
                  disabled={!ventanaAbierta || enviando}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none disabled:bg-gray-50 disabled:text-gray-400"
                />
                {/* SPRINT-WA-TRAZABILIDAD (2026-05-23) — dropdown respuestas rápidas */}
                {mostrarDropdownRespuestas && respuestasFiltradas.length > 0 && (
                  <div className="absolute bottom-full left-0 right-0 mb-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto z-20">
                    {respuestasFiltradas.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onMouseDown={(e) => {
                          // mouseDown (no onClick) para ganar al onBlur del textarea.
                          e.preventDefault();
                          aplicarRespuestaRapida(r);
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                      >
                        <div className="text-xs font-mono text-[#1a5fa8] font-semibold">
                          /{r.atajo}
                        </div>
                        <div className="text-xs text-gray-700 line-clamp-2 whitespace-pre-wrap">
                          {r.texto}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {mostrarDropdownRespuestas && respuestasFiltradas.length === 0 && filtroRespuestas.length > 0 && (
                  <div className="absolute bottom-full left-0 right-0 mb-1 bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs text-gray-400 z-20">
                    Sin respuestas que matcheen "/{filtroRespuestas}".
                  </div>
                )}
              </div>
              {/* SPRINT-WA-INBOX-UX-QUICKWINS quickwin 4 (2026-05-23): el
                  selector de plantillas también accesible con la ventana 24h
                  ABIERTA (Meta permite enviar plantillas en cualquier
                  momento). Con ventana CERRADA el botón ya aparece arriba
                  dentro del banner amarillo — no lo duplicamos acá. */}
              {ventanaAbierta && waId && (
                <SelectorPlantillas waId={waId} />
              )}
              <button
                type="button"
                onClick={handleEnviar}
                disabled={!ventanaAbierta || !texto.trim() || enviando}
                className="bg-brand-600 hover:bg-brand-700 disabled:bg-gray-300 text-white p-2.5 rounded-lg transition-colors"
                title="Enviar (Enter)"
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </main>
      </div>

      {/* SPRINT-INBOX-11 (2026-05-22): el `OrdenCreateModal` con
          `presentationMode='drawer'` ya NO se monta acá afuera del
          contenedor flex. Ahora vive como primera columna flex izquierda
          dentro de `<div className="flex flex-1 min-h-0">` (ver arriba).
          Esto elimina el solapamiento drawer-vs-chat sin necesidad de
          padding hack en el `<main>`. */}
    </div>
  );
}
