import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Send, ShieldOff } from 'lucide-react';
import {
  Cliente,
  PlantillaMarketing,
  Usuario,
  FiltrosCampanaMarketing,
} from '../../types';
import {
  FiltrosClientes,
  FILTROS_DEFAULT,
  aplicaFiltros,
  equiposPresentesEnBase,
} from '../../utils/clientesFiltros';
import { ZONAS_RD } from '../../types';
import {
  COOLDOWN_DIAS_DEFAULT,
  crearCampana,
  enCooldown,
  leerCooldownDias,
  subscribeToPlantillas,
} from '../../services/campanasMarketing.service';
import { esAdminOCoord } from '../../utils/permisos';
import FiltrosSidebarClientes from './FiltrosSidebarClientes';
import TablaReactivacion from './TablaReactivacion';
import PanelPlantilla from './PanelPlantilla';
import ModalLinksWhatsApp from './ModalLinksWhatsApp';
import toast from 'react-hot-toast';
import { useApp } from '../../context/AppContext';

interface Props {
  /** Lista completa parseada (parseCliente). El componente filtra. */
  clientes: Cliente[];
  /** Perfil del agente que está creando la campaña. */
  userProfile: Usuario;
  /** Drawer mobile de filtros (controlado por el padre). */
  filtrosDrawerOpen: boolean;
  onCloseFiltrosDrawer: () => void;
}

/**
 * Construye el snapshot de filtros que se persiste en la campaña. Se usa
 * para auditoría y eventual replay analítico, NO para re-evaluar la
 * campaña sobre la base actual de clientes.
 */
function snapshotFiltros(f: FiltrosClientes): FiltrosCampanaMarketing {
  const out: FiltrosCampanaMarketing = {};
  if (f.zonas.length) out.zonas = [...f.zonas];
  if (f.ultimoServicio !== 'todos') out.rangoUltimoServicio = f.ultimoServicio;
  if (f.tipo !== 'todos') out.tipo = f.tipo;
  if (f.equipos.length) out.equipos = [...f.equipos];
  if (f.totalServicios !== 'todos') out.rangoServiciosTotales = f.totalServicios;
  return out;
}

export default function TabReactivacion({
  clientes,
  userProfile,
  filtrosDrawerOpen,
  onCloseFiltrosDrawer,
}: Props) {
  const esAdmin = userProfile.rol === 'administrador';
  const adminOCoord = esAdminOCoord(userProfile);
  const { currentUser } = useApp();

  const [filtros, setFiltros] = useState<FiltrosClientes>(FILTROS_DEFAULT);
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [plantillas, setPlantillas] = useState<PlantillaMarketing[]>([]);
  const [plantillaSeleccionadaId, setPlantillaSeleccionadaId] = useState<string | null>(null);
  const [overrideCooldown, setOverrideCooldown] = useState(false);
  const [cooldownDias, setCooldownDias] = useState<number>(COOLDOWN_DIAS_DEFAULT);
  const [modalLinksOpen, setModalLinksOpen] = useState(false);
  const [campanaCreadaId, setCampanaCreadaId] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);

  // ─── Sub a plantillas + cooldown ──────────────────────────────────
  useEffect(() => {
    const unsub = subscribeToPlantillas((list) => {
      setPlantillas(list);
      // Auto-seleccionamos la primera activa si la actual no existe.
      setPlantillaSeleccionadaId((curr) => {
        if (curr && list.find((p) => p.id === curr && p.activa !== false)) return curr;
        const primera = list.find((p) => p.activa !== false);
        return primera?.id || null;
      });
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    leerCooldownDias().then((d) => setCooldownDias(d));
  }, []);

  // Si el usuario pierde el rol admin durante la sesión, deshabilitamos
  // el override (defense-in-depth — el botón también queda gated por
  // `esAdmin` en el render).
  useEffect(() => {
    if (!esAdmin && overrideCooldown) setOverrideCooldown(false);
  }, [esAdmin, overrideCooldown]);

  // ─── Derivados ────────────────────────────────────────────────────
  /** Clientes que pasan los filtros del sidebar. */
  const clientesFiltrados = useMemo(
    () => clientes.filter((c) => aplicaFiltros(c, filtros)),
    [clientes, filtros],
  );

  /**
   * Particionamos en elegibles vs en cooldown. La UI muestra ambas para
   * dar transparencia (NO ocultamos los excluidos — los listamos con
   * badge "Cooldown"). El admin puede activar el override para
   * incluirlos en la campaña.
   */
  const { clientesElegibles, clientesEnCooldown } = useMemo(() => {
    const elegibles: Cliente[] = [];
    const enCool: Cliente[] = [];
    for (const c of clientesFiltrados) {
      if (enCooldown(c.ultimoContactoMarketing, cooldownDias)) {
        enCool.push(c);
      } else {
        elegibles.push(c);
      }
    }
    return { clientesElegibles: elegibles, clientesEnCooldown: enCool };
  }, [clientesFiltrados, cooldownDias]);

  /** Los que efectivamente entrarán en la campaña, según override. */
  const clientesParaCampana = useMemo(() => {
    if (overrideCooldown && esAdmin) {
      return [...clientesElegibles, ...clientesEnCooldown];
    }
    return clientesElegibles;
  }, [clientesElegibles, clientesEnCooldown, overrideCooldown, esAdmin]);

  /** Cantidad de seleccionados que están entre los que entran en campaña. */
  const clientesSeleccionadosDeCampana = useMemo(
    () => clientesParaCampana.filter((c) => seleccionados.has(c.id)),
    [clientesParaCampana, seleccionados],
  );

  /** Plantilla actual. */
  const plantillaActiva = useMemo(
    () => plantillas.find((p) => p.id === plantillaSeleccionadaId) || null,
    [plantillas, plantillaSeleccionadaId],
  );

  /** Zonas y equipos disponibles (sobre TODOS los clientes — no los filtrados). */
  const zonasDisponibles = useMemo(() => {
    const set = new Set<string>();
    clientes.forEach((c) => { if (c.zona) set.add(c.zona); });
    const canonicas = ZONAS_RD.filter((z) => set.has(z));
    const extras = Array.from(set).filter((z) => !ZONAS_RD.includes(z as typeof ZONAS_RD[number]));
    return [...canonicas, ...extras];
  }, [clientes]);

  const equiposDisponibles = useMemo(() => equiposPresentesEnBase(clientes), [clientes]);

  // ─── Handlers ─────────────────────────────────────────────────────
  const toggleCliente = (id: string) => {
    setSeleccionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const seleccionarTodos = () => {
    setSeleccionados(new Set(clientesParaCampana.map((c) => c.id)));
  };

  const limpiarSeleccion = () => setSeleccionados(new Set());

  const limpiarFiltros = () => {
    setFiltros(FILTROS_DEFAULT);
    setSeleccionados(new Set());
  };

  const handleGenerarCampana = async () => {
    if (!plantillaActiva) {
      toast.error('Seleccioná una plantilla primero.');
      return;
    }
    if (clientesSeleccionadosDeCampana.length === 0) {
      toast.error('Seleccioná al menos un cliente.');
      return;
    }
    if (!adminOCoord) {
      toast.error('No tenés permiso para crear campañas.');
      return;
    }
    if (!currentUser) {
      toast.error('No estás autenticado.');
      return;
    }
    setCreando(true);
    try {
      const id = await crearCampana({
        plantilla: plantillaActiva,
        filtrosAplicados: snapshotFiltros(filtros),
        clientes: clientesSeleccionadosDeCampana.map((c) => ({
          id: c.id,
          nombre: c.nombre,
          telefono: c.telefono,
        })),
        agente: { id: currentUser.uid, nombre: userProfile.nombre },
        overrideCooldown: overrideCooldown && esAdmin,
        overrideCooldownMotivo: overrideCooldown && esAdmin
          ? 'Override admin desde tab Reactivación'
          : undefined,
      });
      setCampanaCreadaId(id);
      setModalLinksOpen(true);
      toast.success(`Campaña creada — ${clientesSeleccionadosDeCampana.length} clientes.`);
    } catch (err) {
      const e = err as { code?: string; message?: string; stack?: string };
      console.error('[crearCampana] error completo:', err);
      console.error('[crearCampana] code:', e?.code);
      console.error('[crearCampana] message:', e?.message);
      console.error('[crearCampana] stack:', e?.stack);
      toast.error(`No se pudo crear la campaña: ${e?.code || e?.message || 'error desconocido'}`);
    } finally {
      setCreando(false);
    }
  };

  const handleCloseModal = () => {
    setModalLinksOpen(false);
    setCampanaCreadaId(null);
    // Re-set la selección a vacío (los marcados como enviados ya
    // aparecerán con cooldown la próxima vez).
    setSeleccionados(new Set());
  };

  // ─── Render ───────────────────────────────────────────────────────
  return (
    <div className="flex gap-6 flex-col lg:flex-row">
      <FiltrosSidebarClientes
        filtros={filtros}
        onChange={setFiltros}
        zonasDisponibles={zonasDisponibles}
        equiposDisponibles={equiposDisponibles}
        totalCoincidentes={clientesFiltrados.length}
        totalSinCoords={0}
        onLimpiar={limpiarFiltros}
        drawerOpen={filtrosDrawerOpen}
        onCloseDrawer={onCloseFiltrosDrawer}
      />

      <div className="flex-1 min-w-0 space-y-4">
        {/* Banners */}
        {clientesEnCooldown.length > 0 && !overrideCooldown && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-3">
            <ShieldOff size={18} className="text-amber-700 flex-shrink-0 mt-0.5" />
            <div className="flex-1 text-sm text-amber-900">
              <p className="font-semibold">
                {clientesEnCooldown.length.toLocaleString('es-DO')} cliente
                {clientesEnCooldown.length === 1 ? '' : 's'} en cooldown
                ({cooldownDias} días)
              </p>
              <p className="text-xs text-amber-800 mt-0.5">
                Estos clientes recibieron un contacto reciente y están excluidos de la campaña.
                {esAdmin && ' Como admin, podés activar el override abajo.'}
              </p>
            </div>
          </div>
        )}

        {esAdmin && clientesEnCooldown.length > 0 && (
          <label className="flex items-center gap-2 text-sm text-gray-700 bg-white border border-gray-200 rounded-xl px-3 py-2 cursor-pointer">
            <input
              type="checkbox"
              checked={overrideCooldown}
              onChange={(e) => setOverrideCooldown(e.target.checked)}
              className="accent-[#0f3460]"
            />
            <span className="flex-1">
              Saltar cooldown e incluir los {clientesEnCooldown.length} clientes igual
              <span className="block text-[11px] text-gray-500">
                Acción auditable — queda registrada con tu nombre.
              </span>
            </span>
            {overrideCooldown && <AlertTriangle size={14} className="text-amber-600" />}
          </label>
        )}

        {/* Tabla + panel plantilla */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2">
            <TablaReactivacion
              clientes={clientesParaCampana}
              clientesEnCooldown={overrideCooldown ? clientesEnCooldown : []}
              cooldownDias={cooldownDias}
              seleccionados={seleccionados}
              onToggleCliente={toggleCliente}
              onSeleccionarTodos={seleccionarTodos}
              onLimpiarSeleccion={limpiarSeleccion}
            />
          </div>
          <div>
            <PanelPlantilla
              plantillas={plantillas.filter((p) => p.activa !== false)}
              plantillaSeleccionadaId={plantillaSeleccionadaId}
              onChangePlantilla={setPlantillaSeleccionadaId}
              clienteParaPreview={clientesSeleccionadosDeCampana[0] || null}
            />

            <button
              type="button"
              onClick={handleGenerarCampana}
              disabled={
                creando ||
                !plantillaActiva ||
                clientesSeleccionadosDeCampana.length === 0 ||
                !adminOCoord
              }
              className="w-full mt-3 flex items-center justify-center gap-2 bg-[#0f3460] hover:bg-[#1a5fa8] disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
            >
              <Send size={14} />
              {creando
                ? 'Creando campaña...'
                : `Generar links WhatsApp (${clientesSeleccionadosDeCampana.length})`}
            </button>
            <p className="text-[11px] text-gray-500 mt-2 leading-snug">
              Se generan links manuales — no hay envío automático. Marcá cada
              cliente como enviado al abrirle WhatsApp.
            </p>
          </div>
        </div>
      </div>

      {modalLinksOpen && campanaCreadaId && plantillaActiva && currentUser && (
        <ModalLinksWhatsApp
          isOpen={modalLinksOpen}
          onClose={handleCloseModal}
          campanaId={campanaCreadaId}
          plantilla={plantillaActiva}
          clientes={clientesSeleccionadosDeCampana}
          agente={{ id: currentUser.uid, nombre: userProfile.nombre }}
        />
      )}
    </div>
  );
}
