import { useEffect, useMemo, useState } from 'react';
import {
  ItemCotizacion,
  PiezaInventario,
  ServicioPrecio,
  Personal,
  Cliente,
} from '../../types';
import { formatMoneda } from '../../utils';
import Modal from '../Modal';
import { Search, Tag, Boxes, Info } from 'lucide-react';

interface FacturaItemDetallesModalProps {
  open: boolean;
  item: ItemCotizacion;
  catalogoPiezas: PiezaInventario[];
  catalogoServicios: ServicioPrecio[];
  tecnicos: Personal[];
  cliente: Cliente | null;
  /** Solo admin/coord pueden cambiar Mayoreo/Detalle (P3=b). */
  puedeOverrideModalidad: boolean;
  /**
   * IDs de técnicos a mostrar primero en el dropdown, separados por divider
   * visual del resto. Sirve para destacar al técnico asignado a la orden
   * cuando el modal se abre desde `ProcesarFacturacionModal` (Quick-win 12).
   * Si está ausente, vacío, o sus IDs no aparecen en `tecnicos`, el dropdown
   * se renderiza idéntico al comportamiento actual.
   */
  tecnicosPrioritarios?: string[];
  onSave: (item: ItemCotizacion) => void;
  onCancel: () => void;
}

/**
 * Modal anidado para configurar una línea de Inventario (servicio o pieza)
 * dentro del editor de items de un Conduce de Garantía.
 *
 * Comportamiento clave (sprint Conduces SIBS C3b):
 *  - Default Mayoreo si `cliente.tipo='b2b'`, Detalle en otro caso.
 *  - Selector técnico con "Sin técnico (mostrador)" como PRIMERA opción.
 *    Si el usuario lo selecciona, la línea NO genera comisión.
 *  - Toggle Mayoreo/Detalle solo habilitado si `puedeOverrideModalidad`.
 *  - Pieza con precio único (mayoreo === detalle): segmentado oculto, badge.
 *  - Items 'manual' nunca abren este modal — defensivo si llegan, no setea
 *    `precioModalidad` ni `piezaInventarioId`.
 *
 * El precio se guarda como SNAPSHOT del valor numérico al momento (no
 * referencia al catálogo): si admin cambia el precio del catálogo después,
 * la línea facturada no se altera.
 */
export default function FacturaItemDetallesModal({
  open,
  item,
  catalogoPiezas,
  catalogoServicios,
  tecnicos,
  cliente,
  puedeOverrideModalidad,
  tecnicosPrioritarios,
  onSave,
  onCancel,
}: FacturaItemDetallesModalProps) {
  // Si el item ya tiene tipoItem definido, ese es el modo. Si no, default servicio.
  const [tipoActivo, setTipoActivo] = useState<'servicio' | 'pieza'>(
    item.tipoItem === 'pieza' ? 'pieza' : 'servicio',
  );
  const [busqueda, setBusqueda] = useState('');
  const [seleccionId, setSeleccionId] = useState<string>(
    item.servicioPrecioId || item.piezaInventarioId || '',
  );
  const [modalidad, setModalidad] = useState<'mayoreo' | 'detalle'>(() => {
    if (item.precioModalidad) return item.precioModalidad;
    return cliente?.tipo === 'b2b' ? 'mayoreo' : 'detalle';
  });
  const [tecnicoId, setTecnicoId] = useState<string>(item.tecnicoId || '');
  const [cantidad, setCantidad] = useState<number>(item.cantidad || 1);

  // Reset cuando el modal se cierra y se vuelve a abrir con otro item.
  useEffect(() => {
    if (!open) return;
    setTipoActivo(item.tipoItem === 'pieza' ? 'pieza' : 'servicio');
    setBusqueda('');
    setSeleccionId(item.servicioPrecioId || item.piezaInventarioId || '');
    setModalidad(
      item.precioModalidad
        ? item.precioModalidad
        : cliente?.tipo === 'b2b' ? 'mayoreo' : 'detalle',
    );
    setTecnicoId(item.tecnicoId || '');
    setCantidad(item.cantidad || 1);
  }, [open, item, cliente]);

  // Listas filtradas
  const serviciosFiltrados = useMemo(() => {
    const busq = busqueda.toLowerCase().trim();
    return catalogoServicios
      .filter(s => s.activo !== false)
      .filter(s => {
        if (!busq) return true;
        return (
          s.nombre.toLowerCase().includes(busq) ||
          s.marca.toLowerCase().includes(busq) ||
          s.equipoTipo.toLowerCase().includes(busq) ||
          s.categoria.toLowerCase().includes(busq)
        );
      })
      .slice(0, 50);
  }, [catalogoServicios, busqueda]);

  const piezasFiltradas = useMemo(() => {
    const busq = busqueda.toLowerCase().trim();
    return catalogoPiezas
      .filter(p => p.activo !== false)
      .filter(p => {
        if (!busq) return true;
        return (
          p.nombre.toLowerCase().includes(busq) ||
          (p.codigo || '').toLowerCase().includes(busq) ||
          (p.categoria || '').toLowerCase().includes(busq)
        );
      })
      .slice(0, 50);
  }, [catalogoPiezas, busqueda]);

  // Selección actual (servicio o pieza)
  const servicioSeleccionado = useMemo(
    () => catalogoServicios.find(s => s.id === seleccionId) || null,
    [catalogoServicios, seleccionId],
  );
  const piezaSeleccionada = useMemo(
    () => catalogoPiezas.find(p => p.id === seleccionId) || null,
    [catalogoPiezas, seleccionId],
  );

  // Precio según modalidad (snapshot, no referencia)
  const { precioMayoreo, precioDetalle, precioUnico } = useMemo(() => {
    let pm = 0;
    let pd = 0;
    if (tipoActivo === 'servicio' && servicioSeleccionado) {
      pm = servicioSeleccionado.precioMayoreo ?? servicioSeleccionado.precio ?? 0;
      pd = servicioSeleccionado.precioDetalle ?? pm;
    } else if (tipoActivo === 'pieza' && piezaSeleccionada) {
      pm = piezaSeleccionada.precioMayoreo ?? piezaSeleccionada.precioVenta ?? 0;
      pd = piezaSeleccionada.precioDetalle ?? pm;
    }
    return { precioMayoreo: pm, precioDetalle: pd, precioUnico: pm === pd };
  }, [tipoActivo, servicioSeleccionado, piezaSeleccionada]);

  const precioActual = modalidad === 'mayoreo' ? precioMayoreo : precioDetalle;

  // Quick-win 7: precio sugerido auto-redondeado al entero más cercano cuando
  // viene del catálogo. Solo aplica al cargar inicialmente (en el snapshot
  // que se guarda); el usuario puede editar después con decimales en el
  // editor inline.
  const precioRedondeadoSugerido = Math.round(precioActual);

  const handleGuardar = () => {
    if (!seleccionId) return;
    const seleccion = tipoActivo === 'servicio' ? servicioSeleccionado : piezaSeleccionada;
    if (!seleccion) return;

    const nombreSel = tipoActivo === 'servicio'
      ? `${(seleccion as ServicioPrecio).nombre} (${(seleccion as ServicioPrecio).marca} · ${(seleccion as ServicioPrecio).equipoTipo})`
      : (seleccion as PiezaInventario).nombre;

    // SPRINT-132: (t.uid || t.id) — tecnicoId guardado en el item puede ser auth.uid post-c4be345.
    const tecnicoNombre = tecnicoId
      ? (tecnicos.find(t => (t.uid || t.id) === tecnicoId)?.nombre || item.tecnicoNombre || '')
      : '';

    const nuevoItem: ItemCotizacion = {
      ...item,
      descripcion: nombreSel,
      cantidad: cantidad > 0 ? cantidad : 1,
      precio: precioRedondeadoSugerido,
      tipoItem: tipoActivo,
      precioModalidad: modalidad,
    };

    if (tipoActivo === 'servicio') {
      nuevoItem.servicioPrecioId = seleccion.id;
      // Limpiar piezaInventarioId si venía de antes
      delete nuevoItem.piezaInventarioId;
    } else {
      nuevoItem.piezaInventarioId = seleccion.id;
      delete nuevoItem.servicioPrecioId;
      // Capturar costoCompra para análisis de margen
      const pieza = seleccion as PiezaInventario;
      if (typeof pieza.precioCompra === 'number') {
        nuevoItem.costoCompra = pieza.precioCompra;
      }
    }

    if (tecnicoId) {
      nuevoItem.tecnicoId = tecnicoId;
      nuevoItem.tecnicoNombre = tecnicoNombre;
    } else {
      // "Sin técnico (mostrador)" — eliminar tecnicoId/Nombre para que
      // la línea NO genere comisión.
      delete nuevoItem.tecnicoId;
      delete nuevoItem.tecnicoNombre;
    }

    onSave(nuevoItem);
  };

  const tecnicosOrdenados = useMemo(() => {
    return [...tecnicos]
      .filter(t => t.activo !== false)
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }, [tecnicos]);

  // Particionar técnicos en "prioritarios" (asignados a la orden) y "resto".
  // Si la prop está vacía o ningún ID coincide, se renderiza una lista plana
  // idéntica al comportamiento previo a C4b.
  const { tecnicosDestacados, tecnicosResto } = useMemo(() => {
    const prio = Array.isArray(tecnicosPrioritarios)
      ? tecnicosPrioritarios.filter(Boolean)
      : [];
    if (prio.length === 0) {
      return { tecnicosDestacados: [] as Personal[], tecnicosResto: tecnicosOrdenados };
    }
    const setPrio = new Set(prio);
    const destacados = tecnicosOrdenados.filter(t => setPrio.has(t.id));
    const resto = tecnicosOrdenados.filter(t => !setPrio.has(t.id));
    return { tecnicosDestacados: destacados, tecnicosResto: resto };
  }, [tecnicosOrdenados, tecnicosPrioritarios]);

  const sinSeleccion = !seleccionId;

  return (
    <Modal
      isOpen={open}
      onClose={onCancel}
      title={item.tipoItem === 'pieza' || item.tipoItem === 'servicio' ? 'Editar item del conduce' : 'Agregar item del catálogo'}
      size="lg"
    >
      <div className="space-y-4">
        {/* Tabs servicio / pieza */}
        <div className="flex gap-2 border-b border-gray-100 pb-2">
          <button
            type="button"
            onClick={() => { setTipoActivo('servicio'); setSeleccionId(''); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tipoActivo === 'servicio'
                ? 'bg-primary text-white'
                : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
            }`}
          >
            <Tag size={14} /> Servicios
          </button>
          <button
            type="button"
            onClick={() => { setTipoActivo('pieza'); setSeleccionId(''); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tipoActivo === 'pieza'
                ? 'bg-primary text-white'
                : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
            }`}
          >
            <Boxes size={14} /> Piezas
          </button>
        </div>

        {/* Búsqueda */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder={tipoActivo === 'servicio' ? 'Buscar servicio (nombre, marca, equipo)...' : 'Buscar pieza (nombre, código)...'}
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-medium"
          />
        </div>

        {/* Lista resultados */}
        <div className="max-h-56 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-50">
          {tipoActivo === 'servicio' ? (
            serviciosFiltrados.length === 0 ? (
              <p className="p-4 text-xs text-gray-400 text-center">Sin resultados</p>
            ) : (
              serviciosFiltrados.map(s => {
                const pm = s.precioMayoreo ?? s.precio ?? 0;
                const pd = s.precioDetalle ?? pm;
                const sel = seleccionId === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSeleccionId(s.id)}
                    className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between transition-colors ${
                      sel ? 'bg-blue-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 truncate">{s.nombre}</div>
                      <div className="text-[10px] text-gray-500">
                        {s.marca} · {s.equipoTipo} · {s.categoria}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 ml-2">
                      <div className="text-xs text-gray-500">M: {formatMoneda(pm)}</div>
                      <div className="text-xs text-gray-700 font-medium">D: {formatMoneda(pd)}</div>
                    </div>
                  </button>
                );
              })
            )
          ) : (
            piezasFiltradas.length === 0 ? (
              <p className="p-4 text-xs text-gray-400 text-center">Sin resultados</p>
            ) : (
              piezasFiltradas.map(p => {
                const pm = p.precioMayoreo ?? p.precioVenta ?? 0;
                const pd = p.precioDetalle ?? pm;
                const sel = seleccionId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSeleccionId(p.id)}
                    className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between transition-colors ${
                      sel ? 'bg-blue-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 truncate">{p.nombre}</div>
                      <div className="text-[10px] text-gray-500">
                        {p.codigo ? `Cód: ${p.codigo} · ` : ''}Stock: {p.stockActual}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 ml-2">
                      <div className="text-xs text-gray-500">M: {formatMoneda(pm)}</div>
                      <div className="text-xs text-gray-700 font-medium">D: {formatMoneda(pd)}</div>
                    </div>
                  </button>
                );
              })
            )
          )}
        </div>

        {/* Configuración: modalidad + cantidad + técnico */}
        {!sinSeleccion && (
          <div className="bg-gray-50 rounded-xl p-4 space-y-4 border border-gray-100">
            {/* Modalidad */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">Modalidad</label>
                {precioUnico && (
                  <span className="text-[10px] bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full font-medium">
                    Precio único
                  </span>
                )}
              </div>
              {!precioUnico ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={!puedeOverrideModalidad}
                    onClick={() => puedeOverrideModalidad && setModalidad('mayoreo')}
                    title={!puedeOverrideModalidad ? 'Solo admin/coord puede cambiar' : undefined}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                      modalidad === 'mayoreo'
                        ? 'bg-primary text-white border-primary'
                        : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    Mayoreo · {formatMoneda(precioMayoreo)}
                  </button>
                  <button
                    type="button"
                    disabled={!puedeOverrideModalidad}
                    onClick={() => puedeOverrideModalidad && setModalidad('detalle')}
                    title={!puedeOverrideModalidad ? 'Solo admin/coord puede cambiar' : undefined}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                      modalidad === 'detalle'
                        ? 'bg-primary text-white border-primary'
                        : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    Detalle · {formatMoneda(precioDetalle)}
                  </button>
                </div>
              ) : (
                <div className="px-3 py-2 bg-white rounded-lg border border-gray-200 text-sm text-gray-700">
                  {formatMoneda(precioMayoreo)}
                </div>
              )}
              {!puedeOverrideModalidad && !precioUnico && (
                <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
                  <Info size={10} /> Solo admin/coord puede cambiar la modalidad.
                </p>
              )}
            </div>

            {/* Cantidad + precio readonly preview */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cantidad</label>
                <input
                  type="number"
                  min={1}
                  value={cantidad}
                  onChange={e => setCantidad(parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-medium"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Precio sugerido</label>
                <div className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700">
                  {formatMoneda(precioRedondeadoSugerido)}
                </div>
              </div>
            </div>

            {/* Técnico */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Técnico</label>
              <select
                value={tecnicoId}
                onChange={e => setTecnicoId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-medium"
              >
                {/* "Sin técnico (mostrador)" como PRIMERA opción (decisión 40). */}
                <option value="">Sin técnico (mostrador)</option>
                {/* Técnicos prioritarios (orden), separados por divider visual */}
                {/* @safe-tecnicoid-id: item.tecnicoId guarda personal.id (descriptor),
                   no auth.uid. Es lookup de comisiones (utils/comisiones.ts:245
                   getDoc(personal/{tecnicoId})). Migración a auth.uid es scope de
                   SPRINT-111 (auditoría de campos análogos a tecnicoId). */}
                {tecnicosDestacados.length > 0 && (
                  <optgroup label="Asignado a la orden">
                    {/* @safe-tecnicoid-id: ver comentario arriba — descriptor personal.id, scope SPRINT-111. */}
                    {tecnicosDestacados.map(t => (
                      <option key={t.id} value={t.id}>{t.nombre}</option>
                    ))}
                  </optgroup>
                )}
                {/* @safe-tecnicoid-id: ver comentario arriba — descriptor personal.id, scope SPRINT-111. */}
                {tecnicosDestacados.length > 0 ? (
                  <optgroup label="Otros técnicos">
                    {tecnicosResto.map(t => (
                      <option key={t.id} value={t.id}>{t.nombre}</option>
                    ))}
                  </optgroup>
                ) : (
                  // @safe-tecnicoid-id: ver comentario arriba — descriptor personal.id, scope SPRINT-111.
                  tecnicosResto.map(t => (
                    <option key={t.id} value={t.id}>{t.nombre}</option>
                  ))
                )}
              </select>
              <p className="text-[10px] text-gray-400 mt-1">
                Si seleccionás "Sin técnico", esta línea NO genera comisión.
              </p>
            </div>
          </div>
        )}

        {/* Subtotal */}
        {!sinSeleccion && (
          <div className="text-right text-sm font-semibold text-primary">
            Subtotal: {formatMoneda(precioRedondeadoSugerido * (cantidad > 0 ? cantidad : 1))}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleGuardar}
            disabled={sinSeleccion}
            className="px-6 py-2 bg-primary hover:bg-primary-medium text-white rounded-lg text-sm font-medium disabled:opacity-60 transition-colors"
          >
            Guardar item
          </button>
        </div>
      </div>
    </Modal>
  );
}
