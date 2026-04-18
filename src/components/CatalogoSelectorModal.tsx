import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase/config';
import { ServicioPrecio, PiezaInventario } from '../types';
import { formatMoneda } from '../utils';
import Modal from './Modal';
import { Search, Tag, Boxes, AlertTriangle } from 'lucide-react';

export interface SeleccionServicio {
  tipo: 'servicio';
  servicio: ServicioPrecio;
}
export interface SeleccionPieza {
  tipo: 'pieza';
  pieza: PiezaInventario;
}
export type SeleccionCatalogo = SeleccionServicio | SeleccionPieza;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (sel: SeleccionCatalogo) => void;
  /** Filtros iniciales sugeridos (de la orden por ejemplo) */
  filtroMarcaSugerida?: string;
  filtroEquipoSugerido?: string;
  /** Tab inicial */
  tabInicial?: 'servicios' | 'piezas';
}

export default function CatalogoSelectorModal({
  isOpen, onClose, onSelect, filtroMarcaSugerida, filtroEquipoSugerido, tabInicial = 'servicios',
}: Props) {
  const [tab, setTab] = useState<'servicios' | 'piezas'>(tabInicial);
  const [servicios, setServicios] = useState<ServicioPrecio[]>([]);
  const [piezas, setPiezas] = useState<PiezaInventario[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [filtroMarca, setFiltroMarca] = useState('');
  const [filtroEquipo, setFiltroEquipo] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setBusqueda('');
    setTab(tabInicial);
    setFiltroMarca(filtroMarcaSugerida || '');
    setFiltroEquipo(filtroEquipoSugerido || '');
  }, [isOpen, tabInicial, filtroMarcaSugerida, filtroEquipoSugerido]);

  useEffect(() => {
    if (!isOpen) return;
    const unsubS = onSnapshot(
      query(collection(db, 'precios_servicios'), orderBy('marca')),
      (snap) => setServicios(snap.docs.map(d => {
        const raw = d.data();
        return {
          id: d.id,
          marca: raw.marca || '',
          categoria: raw.categoria || '',
          equipoTipo: raw.equipoTipo || '',
          nombre: raw.nombre || '',
          precio: raw.precio || 0,
          activo: raw.activo !== false,
          createdAt: raw.createdAt?.toDate?.() || new Date(),
          notas: raw.notas,
        } as ServicioPrecio;
      }))
    );
    const unsubP = onSnapshot(
      query(collection(db, 'piezas_inventario'), orderBy('nombre')),
      (snap) => setPiezas(snap.docs.map(d => {
        const raw = d.data();
        return {
          id: d.id,
          nombre: raw.nombre || '',
          codigo: raw.codigo,
          descripcion: raw.descripcion,
          precioCompra: raw.precioCompra,
          precioVenta: raw.precioVenta || 0,
          stockActual: typeof raw.stockActual === 'number' ? raw.stockActual : 0,
          stockMinimo: raw.stockMinimo,
          proveedorSugerido: raw.proveedorSugerido,
          categoria: raw.categoria,
          activo: raw.activo !== false,
          createdAt: raw.createdAt?.toDate?.() || new Date(),
        } as PiezaInventario;
      }))
    );
    return () => { unsubS(); unsubP(); };
  }, [isOpen]);

  const marcas = useMemo(() => Array.from(new Set(servicios.map(s => s.marca))).sort(), [servicios]);
  const equipos = useMemo(() => Array.from(new Set(servicios.map(s => s.equipoTipo))).sort(), [servicios]);

  const serviciosFiltrados = useMemo(() => {
    return servicios.filter(s => {
      if (!s.activo) return false;
      if (filtroMarca && s.marca !== filtroMarca) return false;
      if (filtroEquipo && s.equipoTipo !== filtroEquipo) return false;
      if (busqueda) {
        const q = busqueda.toLowerCase();
        if (!s.nombre.toLowerCase().includes(q) &&
            !s.marca.toLowerCase().includes(q) &&
            !s.equipoTipo.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [servicios, filtroMarca, filtroEquipo, busqueda]);

  const piezasFiltradas = useMemo(() => {
    return piezas.filter(p => {
      if (!p.activo) return false;
      if (busqueda) {
        const q = busqueda.toLowerCase();
        if (!p.nombre.toLowerCase().includes(q) && !(p.codigo || '').toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [piezas, busqueda]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Catálogo de servicios e inventario" size="lg">
      <div className="space-y-3">
        {/* Tabs */}
        <div className="flex bg-gray-100 rounded-xl p-1">
          <button
            type="button"
            onClick={() => setTab('servicios')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === 'servicios' ? 'bg-white text-[#0f3460] shadow-sm' : 'text-gray-600'
            }`}
          >
            <Tag size={14} /> Servicios ({servicios.filter(s => s.activo).length})
          </button>
          <button
            type="button"
            onClick={() => setTab('piezas')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === 'piezas' ? 'bg-white text-[#0f3460] shadow-sm' : 'text-gray-600'
            }`}
          >
            <Boxes size={14} /> Piezas inventario ({piezas.filter(p => p.activo).length})
          </button>
        </div>

        {/* Filtros */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <div className="relative md:col-span-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder={tab === 'servicios' ? 'Buscar servicio, marca, equipo...' : 'Buscar pieza por nombre o código...'}
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
            />
          </div>
          {tab === 'servicios' && (
            <>
              <select value={filtroMarca} onChange={e => setFiltroMarca(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]">
                <option value="">Todas las marcas</option>
                {marcas.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <select value={filtroEquipo} onChange={e => setFiltroEquipo(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8] md:col-span-2">
                <option value="">Todos los equipos</option>
                {equipos.map(eq => <option key={eq} value={eq}>{eq}</option>)}
              </select>
            </>
          )}
        </div>

        {/* Lista */}
        <div className="max-h-[55vh] overflow-y-auto border border-gray-100 rounded-xl">
          {tab === 'servicios' ? (
            serviciosFiltrados.length === 0 ? (
              <p className="p-6 text-center text-sm text-gray-400">Sin servicios que coincidan</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {serviciosFiltrados.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onSelect({ tipo: 'servicio', servicio: s })}
                    className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{s.nombre}</p>
                        <p className="text-[11px] text-gray-500">
                          {s.marca} · {s.equipoTipo} · {s.categoria}
                        </p>
                      </div>
                      <span className="text-sm font-bold text-[#0f3460]">{formatMoneda(s.precio)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )
          ) : (
            piezasFiltradas.length === 0 ? (
              <p className="p-6 text-center text-sm text-gray-400">Sin piezas en inventario</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {piezasFiltradas.map(p => {
                  const min = p.stockMinimo ?? 0;
                  const sinStock = p.stockActual === 0;
                  const bajo = !sinStock && p.stockActual <= min && min > 0;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => onSelect({ tipo: 'pieza', pieza: p })}
                      className={`w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors ${sinStock ? 'bg-red-50/30' : bajo ? 'bg-amber-50/30' : ''}`}
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900">{p.nombre}</p>
                          <p className="text-[11px] text-gray-500">
                            {p.codigo ? `${p.codigo} · ` : ''}{p.categoria || 'sin categoría'}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-[#0f3460]">{formatMoneda(p.precioVenta)}</p>
                          <p className={`text-[10px] flex items-center justify-end gap-1 ${sinStock ? 'text-red-600' : bajo ? 'text-amber-700' : 'text-gray-500'}`}>
                            {(sinStock || bajo) && <AlertTriangle size={10} />}
                            stock: {p.stockActual}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )
          )}
        </div>
      </div>
    </Modal>
  );
}
