import { useMemo, useState } from 'react';
import { addDoc, collection, doc, Timestamp, serverTimestamp, updateDoc } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { db } from '../../firebase/config';
import {
  Cliente,
  EstadoFactura,
  ItemCotizacion,
  MetodoPago,
  Personal,
  PiezaInventario,
  ServicioPrecio,
} from '../../types';
import { formatMoneda } from '../../utils';
import { METODO_PAGO_LABELS } from '../../utils/factura';
import { siguienteNumeroFactura } from '../../services/contadores.service';
import { registrarComisionesPorItems } from '../../utils/comisiones';
import { esAdminOCoord } from '../../utils/permisos';
import { useApp } from '../../context/AppContext';
import Modal from '../Modal';
import FacturaItemsEditor from './FacturaItemsEditor';
import ClienteNuevoDrawer from './ClienteNuevoDrawer';
import { Search, UserPlus, AlertTriangle } from 'lucide-react';

interface FormState {
  cliente: Cliente | null;
  /** Búsqueda libre en el autocomplete; si no se selecciona cliente, se usa como nombre. */
  clienteBusqueda: string;
  ordenNumero: string;
  notas: string;
  metodoPago: MetodoPago | '';
  bancoDestino: string;
  items: ItemCotizacion[];
}

const INITIAL_FORM: FormState = {
  cliente: null,
  clienteBusqueda: '',
  ordenNumero: '',
  notas: '',
  metodoPago: '',
  bancoDestino: '',
  items: [{ descripcion: '', cantidad: 1, precio: 0, tipoItem: 'manual' }],
};

interface FacturaCrearModalProps {
  open: boolean;
  onClose: () => void;
  /** Disparado luego de crear el conduce con éxito. Recibe el número emitido. */
  onCreated?: (numero: string) => void;
  /** Catálogos cargados por el padre (Facturas.tsx) — patrón "padre gordo". */
  catalogoServicios: ServicioPrecio[];
  catalogoPiezas: PiezaInventario[];
  tecnicos: Personal[];
  /** Lista real-time de clientes (suscripción del padre). */
  clientes: Cliente[];
  /** IDs de clientes sin tipo definido (badge G2). */
  clientesSinTipoDefinido: Set<string>;
}

/**
 * Modal de creación de Conduces de Garantía (CG-####).
 *
 * C3b — features SIBS sobre el split:
 *  - Autocomplete de clientes (lista real-time recibida por props).
 *  - Botón "+ Nuevo cliente" abre `ClienteNuevoDrawer` con prefill.
 *  - `FacturaItemsEditor` integrado con catálogos + técnicos.
 *  - Persiste `clienteTipoEnEmision` (snapshot defensivo).
 *  - Audit log de override modalidad (best-effort, no bloquea emisión).
 *  - Comisiones por items (vendedor por línea) vía `registrarComisionesPorItems`.
 *  - Override Mayoreo/Detalle solo admin/coord.
 *
 * Patrón "padre gordo, hijo presentacional": el padre `Facturas.tsx` mantiene
 * los listeners de catálogos, técnicos y clientes (vía `useClientesEnVivo`).
 * Este componente recibe todo por props y se mantiene presentacional, igual
 * que los otros 4 listeners centralizados.
 */
export default function FacturaCrearModal({
  open,
  onClose,
  onCreated,
  catalogoServicios,
  catalogoPiezas,
  tecnicos,
  clientes,
  clientesSinTipoDefinido,
}: FacturaCrearModalProps) {
  const { userProfile } = useApp();
  const puedeOverrideModalidad = esAdminOCoord(userProfile);

  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [saving, setSaving] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [autocompleteOpen, setAutocompleteOpen] = useState(false);

  const total = form.items.reduce(
    (sum, item) => sum + item.cantidad * item.precio,
    0,
  );

  // Sugerencias de autocomplete (top 8 por nombre o teléfono).
  const sugerencias = useMemo(() => {
    const q = form.clienteBusqueda.trim().toLowerCase();
    if (q.length < 2) return [];
    const soloDigitos = q.replace(/\D/g, '');
    return clientes
      .filter(c => {
        if (soloDigitos.length >= 3) {
          const tel = (c.telefonoNormalizado || c.telefono || '').replace(/\D/g, '');
          if (tel.includes(soloDigitos)) return true;
        }
        return c.nombre.toLowerCase().includes(q);
      })
      .slice(0, 8);
  }, [clientes, form.clienteBusqueda]);

  // ¿El cliente actual fue marcado como "sin tipo definido"? Badge G2.
  const clienteSinTipoDefinido = form.cliente
    ? clientesSinTipoDefinido.has(form.cliente.id)
    : false;

  const resetForm = () => {
    setForm(INITIAL_FORM);
    setAutocompleteOpen(false);
  };

  const handleClose = () => {
    if (saving) return;
    onClose();
    resetForm();
  };

  const handleSeleccionarCliente = (cliente: Cliente) => {
    setForm(f => ({
      ...f,
      cliente,
      clienteBusqueda: cliente.nombre,
    }));
    setAutocompleteOpen(false);
  };

  const handleClienteCreado = (cliente: Cliente) => {
    handleSeleccionarCliente(cliente);
  };

  // Cuando el usuario abre el drawer, intentamos pre-rellenar nombre o
  // teléfono según lo que ya tipeó en el autocomplete.
  const prefillsDrawer = useMemo(() => {
    const busq = form.clienteBusqueda.trim();
    const soloDigitos = busq.replace(/\D/g, '');
    if (soloDigitos.length >= 7) {
      return { prefillTelefono: busq, prefillNombre: '' };
    }
    return { prefillTelefono: '', prefillNombre: busq };
  }, [form.clienteBusqueda]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clienteNombreFinal = form.cliente?.nombre || form.clienteBusqueda.trim();
    if (!clienteNombreFinal) {
      toast.error('El nombre del cliente es requerido');
      return;
    }
    if (form.items.length === 0) {
      toast.error('Agregá al menos un item');
      return;
    }
    if (form.items.some(i => !i.descripcion.trim())) {
      toast.error('Completá la descripción de todos los items (los items de Inventario deben estar configurados)');
      return;
    }
    if (total <= 0) {
      toast.error('El total debe ser mayor a 0');
      return;
    }

    setSaving(true);
    try {
      const numero = await siguienteNumeroFactura();

      // Snapshot defensivo del tipo de cliente al momento de emitir (security #2).
      // Si el cliente no tenía tipo definido, se persiste 'particular' (mismo
      // default que parseCliente).
      const clienteTipoEnEmision: 'particular' | 'b2b' =
        form.cliente?.tipo === 'b2b' ? 'b2b' : 'particular';

      const docData: Record<string, unknown> = {
        numero,
        clienteNombre: clienteNombreFinal,
        items: form.items,
        total,
        estado: 'emitida' as EstadoFactura,
        fechaEmision: Timestamp.now(),
        createdAt: Timestamp.now(),
        // Conduces manuales se asumen como reparación completa (no chequeo).
        tipoCierre: 'reparacion_completa',
        // Origen: distingue conduces creados manualmente desde /admin/facturas
        // de los emitidos automáticamente al cerrar una orden.
        origen: 'manual' as const,
        clienteTipoEnEmision,
      };
      if (form.cliente?.id) docData.clienteId = form.cliente.id;
      if (form.cliente?.telefono) docData.clienteTelefono = form.cliente.telefono;
      if (form.ordenNumero.trim()) docData.ordenNumero = form.ordenNumero.trim();
      if (form.notas.trim()) docData.notas = form.notas.trim();
      if (form.metodoPago) docData.metodoPago = form.metodoPago;
      if (form.metodoPago === 'transferencia' && form.bancoDestino.trim()) {
        docData.bancoDestino = form.bancoDestino.trim();
      }

      // Strip undefined defensivo (Firestore rechaza undefined).
      const docLimpio = Object.fromEntries(
        Object.entries(docData).filter(([, v]) => v !== undefined),
      );
      const facturaRef = await addDoc(collection(db, 'facturas'), docLimpio);

      // Comisiones por items (best-effort, no bloquea emisión si falla).
      // Como este flujo NO tiene una orden vinculada en Firestore, sintetizamos
      // un objeto `OrdenServicio`-like mínimo para el helper. registrarComisionesPorItems
      // tolera campos faltantes (los maneja como '' / undefined).
      try {
        const ordenSintetica = {
          id: `factura-manual-${facturaRef.id}`,
          numero: '', // sin orden
          clienteNombre: clienteNombreFinal,
          tecnicoId: undefined as string | undefined,
          tecnicoNombre: undefined as string | undefined,
          soloChequeo: false,
        } as Parameters<typeof registrarComisionesPorItems>[0]['orden'];

        const algunoConTecnico = form.items.some(i => !!i.tecnicoId);
        if (algunoConTecnico) {
          const result = await registrarComisionesPorItems({
            orden: ordenSintetica,
            facturaId: facturaRef.id,
            facturaNumero: numero,
            totalFactura: total,
            items: form.items,
            userProfile,
          });

          // Denormalizar la comisión en el doc factura para que el render
          // de Facturas.tsx pueda mostrarla sin tener que consultar la
          // colección `comisiones`. Sin esto, el bloque N>1 muestra "—"
          // permanentemente porque `factura.comisionTecnicoMonto` queda
          // undefined.
          //
          // `registrarComisionesPorItems` NO denormaliza por sí mismo
          // (solo escribe en `comisiones` + auditoría de la orden), así
          // que esta responsabilidad es del caller — mismo patrón que
          // FacturacionPendiente.tsx post-registrarComisionPorFactura.
          if (result.comisiones.length > 0) {
            const denorm: Record<string, unknown> =
              result.comisiones.length === 1
                ? {
                  // N=1: campos completos (compatibles con el render legacy).
                  comisionTecnicoId: result.comisiones[0].tecnicoId,
                  comisionTecnicoNombre: result.comisiones[0].tecnicoNombre,
                  comisionTecnicoMonto: result.comisiones[0].monto,
                  comisionTecnicoPorcentaje: result.comisiones[0].porcentaje,
                  comisionRegistroId: result.comisiones[0].comisionId,
                }
                : {
                  // N>1: agregado. El render expande el desglose por técnico
                  // a partir de los items (`tecnicoId` por línea).
                  comisionTecnicoId: '',
                  comisionTecnicoNombre: 'N técnicos',
                  comisionTecnicoMonto: result.totalAgregado,
                  comisionTecnicoPorcentaje: 0,
                };
            // Strip undefined defensivo (Firestore rechaza undefined).
            const denormLimpio = Object.fromEntries(
              Object.entries(denorm).filter(([, v]) => v !== undefined),
            );
            await updateDoc(doc(db, 'facturas', facturaRef.id), denormLimpio);
          }
        }
      } catch (comErr) {
        console.error('Error registrando comisiones por items:', comErr);
        toast.error('Conduce creado, pero hubo problema registrando comisiones. Revisar logs.');
      }

      // Audit log de override de modalidad (security #1, best-effort).
      // Una entry por cada línea overrideada respecto al default que dictaba
      // el tipo del cliente. NO bloquea el flujo principal.
      try {
        const modalidadDefaultPorTipo: 'mayoreo' | 'detalle' =
          clienteTipoEnEmision === 'b2b' ? 'mayoreo' : 'detalle';
        const overrides = form.items
          .map((it, idx) => ({ it, idx }))
          .filter(({ it }) =>
            (it.tipoItem === 'servicio' || it.tipoItem === 'pieza') &&
            it.precioModalidad &&
            it.precioModalidad !== modalidadDefaultPorTipo,
          );
        if (overrides.length > 0) {
          for (const { it, idx } of overrides) {
            const auditPayload: Record<string, unknown> = {
              accion: 'override_modalidad_precio_factura',
              lineaIndex: idx,
              modalidadOriginal: modalidadDefaultPorTipo,
              modalidadOverride: it.precioModalidad,
              clienteTipo: clienteTipoEnEmision,
              solicitanteUid: userProfile?.id || null,
              solicitanteNombre: userProfile?.nombre || null,
              facturaNumero: numero,
              timestamp: serverTimestamp(),
            };
            const auditLimpio = Object.fromEntries(
              Object.entries(auditPayload).filter(([, v]) => v !== undefined),
            );
            // Sin await en paralelo: no bloqueamos la UX del usuario.
            addDoc(collection(db, 'auditoria_admin'), auditLimpio).catch(err =>
              console.warn('Audit log override modalidad falló:', err),
            );
          }
        }
      } catch (auditErr) {
        console.warn('Error preparando audit log de override modalidad:', auditErr);
      }

      toast.success(`Conduce ${numero} creado`);
      onCreated?.(numero);
      onClose();
      resetForm();
    } catch (err) {
      console.error(err);
      toast.error('Error al crear el conduce de garantía');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Modal
        isOpen={open}
        onClose={handleClose}
        title="Nuevo Conduce de Garantía"
        size="xl"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Autocomplete cliente */}
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cliente <span className="text-red-600">*</span>
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={form.clienteBusqueda}
                    onChange={e => {
                      setForm(f => ({ ...f, clienteBusqueda: e.target.value, cliente: null }));
                      setAutocompleteOpen(true);
                    }}
                    onFocus={() => setAutocompleteOpen(true)}
                    onBlur={() => {
                      // Delay para permitir click en sugerencia.
                      setTimeout(() => setAutocompleteOpen(false), 150);
                    }}
                    placeholder="Buscar cliente por nombre o teléfono..."
                    className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(true)}
                  className="flex items-center gap-1 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-xs font-medium transition-colors"
                  title="Crear cliente nuevo"
                >
                  <UserPlus size={14} /> Nuevo
                </button>
              </div>
              {/* Dropdown sugerencias */}
              {autocompleteOpen && sugerencias.length > 0 && (
                <div className="absolute left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-56 overflow-y-auto">
                  {sugerencias.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onMouseDown={(e) => {
                        // onMouseDown corre antes de onBlur — evita que el dropdown
                        // se cierre antes de registrar el click.
                        e.preventDefault();
                        handleSeleccionarCliente(c);
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors flex items-center justify-between border-b border-gray-50 last:border-b-0"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-gray-900 truncate">{c.nombre}</div>
                        <div className="text-[10px] text-gray-500">{c.telefono}</div>
                      </div>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                        c.tipo === 'b2b' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {c.tipo === 'b2b' ? 'B2B' : 'Particular'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {/* Badge G2: cliente sin tipo definido */}
              {form.cliente && clienteSinTipoDefinido && (
                <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">
                  <AlertTriangle size={12} />
                  Cliente sin tipo definido — verificar
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Orden de Servicio</label>
              <input
                type="text"
                value={form.ordenNumero}
                onChange={e => setForm(f => ({ ...f, ordenNumero: e.target.value }))}
                placeholder="Ej: OS-0001 (opcional)"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
              />
            </div>
          </div>

          {/* Items */}
          <div>
            <FacturaItemsEditor
              items={form.items}
              onItemsChange={items => setForm(f => ({ ...f, items }))}
              catalogoServicios={catalogoServicios}
              catalogoPiezas={catalogoPiezas}
              tecnicos={tecnicos}
              cliente={form.cliente}
              puedeOverrideModalidad={puedeOverrideModalidad}
              disabled={saving}
            />
            <div className="text-right mt-3 pt-3 border-t border-gray-100">
              <span className="text-lg font-bold text-[#0f3460]">Total: {formatMoneda(total)}</span>
            </div>
          </div>

          {/* Método de pago */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Método de pago</label>
              <select
                value={form.metodoPago}
                onChange={e => setForm(f => ({ ...f, metodoPago: e.target.value as MetodoPago | '' }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
              >
                <option value="">Sin especificar</option>
                {(Object.keys(METODO_PAGO_LABELS) as MetodoPago[]).map(m => (
                  <option key={m} value={m}>{METODO_PAGO_LABELS[m]}</option>
                ))}
              </select>
            </div>
            {form.metodoPago === 'transferencia' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Banco destino</label>
                <input
                  type="text"
                  value={form.bancoDestino}
                  onChange={e => setForm(f => ({ ...f, bancoDestino: e.target.value }))}
                  placeholder="Ej: Banreservas, BHD, Popular..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
                />
              </div>
            )}
          </div>

          {/* Notas */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
            <textarea
              value={form.notas}
              onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
              rows={2}
              placeholder="Observaciones adicionales (opcional)"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-lg text-sm font-medium disabled:opacity-60 transition-colors"
            >
              {saving ? 'Guardando...' : 'Crear Conduce'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Drawer cliente nuevo */}
      <ClienteNuevoDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onClienteCreado={handleClienteCreado}
        prefillNombre={prefillsDrawer.prefillNombre}
        prefillTelefono={prefillsDrawer.prefillTelefono}
      />
    </>
  );
}
