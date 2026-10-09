/**
 * MapaClientes.tsx — mapa de la cartera de clientes.
 *
 * Reutiliza la MISMA infraestructura Google que el mapa de operaciones:
 *  - `MapaGoogle` (components/mapa/MapaGoogle.tsx) como motor y loader único.
 *  - `cargarGoogleMaps` (utils/cargarGoogleMaps.ts) compartido con autocompletado y
 *    con el mapa de operaciones; una sola etiqueta de script por sesión.
 *  - `agruparEnPantalla` (utils/clusterPantalla.ts) para no crear 9000 marcadores
 *    simultáneos — en pantalla hay como máximo ~300 pines o grupos.
 *  - `puntoCliente` y `grupoClientes` (components/mapa/marcadores.ts), que generan
 *    los nodos DOM del AdvancedMarker con `textContent`, sin `innerHTML` y sin
 *    inyección de datos de Firestore en templates.
 *
 * Diferencias intencionales respecto del motor Leaflet anterior:
 *  - Se eliminó la vista "heatmap". El motor compartido Google no expone una capa
 *    de calor; pintar simples pines coloreados y llamarle "heatmap" sería mentir
 *    sobre la capacidad del sistema. Las vistas conservadas (cluster por
 *    antigüedad y zonas por zona) ya cumplen el requisito de "capas útiles por
 *    zona/antigüedad" sin cargar un SDK secundario.
 *  - Las tarjetas y listados que ve el usuario se renderizan con React
 *    (sin `innerHTML`); los nodos que viven dentro del mapa pasan por
 *    `marcadores.ts` que usa `textContent` para los datos del cliente.
 *  - El reintento ante caída de red lo maneja `MapaGoogle` (botón "Reintentar"
 *    cuando el estado del loader compartido es `sin_conexion`). No se reinventa
 *    acá un flujo paralelo de carga.
 *
 * Lo que NO cambia:
 *  - Props públicas (`clientes`, `totalSinCoords`, `onSelectCliente`).
 *  - El padre (`pages/Clientes.tsx`) sigue mandando clientes ya filtrados Y con
 *    coords; este componente NO hace consultas a Firestore ni filtra la cartera.
 *  - La ficha de expediente del cliente se abre vía callback — el consumidor
 *    decide cómo mostrarla.
 *  - El botón de WhatsApp hacia el cliente va por `BotonChatCliente`, el inbox
 *    empresarial. No se usa `wa.me` ni app externa.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Layers, MapPin as MapPinIcon, AlertTriangle, X, FileText } from 'lucide-react';
import { Cliente, ZONAS_RD } from '../../types';
import { formatTelefono } from '../../utils';
import { tieneCoord } from '../../utils/geo';
import { agruparEnPantalla } from '../../utils/clusterPantalla';
import { mesesDesdeUltimoServicio } from '../../utils/clientesFiltros';
import { antiguedadDe, ANTIGUEDAD, ORDEN_ANTIGUEDAD } from '../../utils/mapaClientes';
import { colorZonaPin } from '../../utils/zonas';
import MapaGoogle, {
  type MarcadorMapa,
  type Vista,
  type Encuadre,
} from '../mapa/MapaGoogle';
import { puntoCliente, grupoClientes } from '../mapa/marcadores';
import BotonChatCliente from '../shared/BotonChatCliente';

type VistaCapa = 'cluster' | 'zonas';

interface MapaClientesProps {
  /** Clientes ya filtrados Y con coords válidas. El componente NO filtra. */
  clientes: Cliente[];
  /** Cantidad de clientes que el filtro deja pasar pero no tienen coords. */
  totalSinCoords: number;
  /** Callback cuando el usuario pide abrir el expediente completo del cliente. */
  onSelectCliente: (id: string) => void;
}

/**
 * Forma mínima que exige `agruparEnPantalla<T extends LatLng & { id: string }>`.
 * `id` tiene que ser único por punto (no por cliente) — si un cliente tiene
 * varias ubicaciones, cada una entra con su propio id para no colapsar en el
 * mismo pin.
 */
interface PuntoClienteItem {
  id: string;
  clienteId: string;
  lat: number;
  lng: number;
  nombre: string;
}

function colorDeCliente(c: Cliente | undefined, modo: VistaCapa): string {
  if (!c) return ANTIGUEDAD.sin_registro.color;
  if (modo === 'zonas') return colorZonaPin(c.zona);
  return ANTIGUEDAD[antiguedadDe(mesesDesdeUltimoServicio(c))].color;
}

function mezclaColores(
  items: PuntoClienteItem[],
  porId: Map<string, Cliente>,
  modo: VistaCapa,
): { color: string; n: number }[] {
  const cuentas = new Map<string, number>();
  for (const it of items) {
    const color = colorDeCliente(porId.get(it.clienteId), modo);
    cuentas.set(color, (cuentas.get(color) ?? 0) + 1);
  }
  return [...cuentas.entries()].map(([color, n]) => ({ color, n }));
}

function BotonVista({
  activo,
  onClick,
  icon,
  label,
}: {
  activo: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
        activo ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-50'
      }`}
    >
      {icon} {label}
    </button>
  );
}

/**
 * Lista accesible que se muestra cuando Google Maps no está disponible, o como
 * contenido del panel lateral cuando se abre un grupo. Siempre segura: usa JSX,
 * nunca `innerHTML`. Se recorta a un tope visible para no romper el DOM con
 * cartera completa; los filtros del padre son el camino para ir más fino.
 */
function ListaClientes({
  clientes,
  onSelectCliente,
  tope,
  titulo,
}: {
  clientes: Cliente[];
  onSelectCliente: (id: string) => void;
  tope: number;
  titulo: string;
}) {
  const [limite, setLimite] = useState(tope);
  useEffect(() => setLimite(tope), [clientes, tope]);
  const visibles = clientes.slice(0, limite);
  const restantes = Math.max(0, clientes.length - visibles.length);
  if (clientes.length === 0) {
    return (
      <p className="p-4 text-sm text-gray-500" role="status">
        No hay clientes para mostrar con los filtros actuales.
      </p>
    );
  }
  return (
    <div className="p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600">
        {titulo} ({clientes.length.toLocaleString('es-DO')})
      </p>
      <ul className="space-y-1" role="list">
        {visibles.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onSelectCliente(c.id)}
              className="flex min-h-[44px] w-full items-center gap-2 rounded-md border border-gray-100 bg-white px-2 py-1 text-left hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary/40"
              aria-label={`Abrir expediente de ${c.nombre || 'cliente'}`}
            >
              <span className="truncate text-sm text-gray-900">
                {c.nombre || 'Sin nombre'}
              </span>
              <span className="ml-auto truncate text-xs text-gray-500">
                {c.sector || c.zona || '—'}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {restantes > 0 && (
        <p className="mt-2 text-[11px] text-gray-500">
          <button type="button" className="min-h-[44px] text-primary underline" onClick={() => setLimite((n) => n + tope)}>
            Mostrar más ({restantes.toLocaleString('es-DO')} pendientes)
          </button>
        </p>
      )}
    </div>
  );
}

export default function MapaClientes({
  clientes,
  totalSinCoords,
  onSelectCliente,
}: MapaClientesProps) {
  const [modoVista, setModoVista] = useState<VistaCapa>('cluster');
  const [vistaMapa, setVistaMapa] = useState<Vista | null>(null);
  const [seleccionCliente, setSeleccionCliente] = useState<Cliente | null>(null);
  const [seleccionGrupo, setSeleccionGrupo] = useState<string[] | null>(null);

  const clientesPorId = useMemo(() => {
    const m = new Map<string, Cliente>();
    for (const c of clientes) m.set(c.id, c);
    return m;
  }, [clientes]);

  /**
   * Un punto por ubicación del cliente (principal + alternas si existieran).
   * Las coords inválidas se descartan explícitamente — nunca se inventa un
   * (lat,lng) para rellenar un cliente sin ubicación.
   */
  const puntosClientes = useMemo<PuntoClienteItem[]>(() => {
    const out: PuntoClienteItem[] = [];
    for (const c of clientes) {
      if (tieneCoord(c)) {
        out.push({
          id: `c:${c.id}:main`,
          clienteId: c.id,
          lat: c.lat as number,
          lng: c.lng as number,
          nombre: c.nombre || 'Sin nombre',
        });
      }
      (c.direcciones ?? []).forEach((d) => {
        if (tieneCoord(d)) {
          out.push({
            id: `c:${c.id}:${d.id}`,
            clienteId: c.id,
            lat: d.lat as number,
            lng: d.lng as number,
            nombre: c.nombre || 'Sin nombre',
          });
        }
      });
    }
    return out;
  }, [clientes]);

  const grupos = useMemo(() => {
    if (!vistaMapa || puntosClientes.length === 0) return [];
    return agruparEnPantalla(puntosClientes, vistaMapa.limites, vistaMapa.zoom);
  }, [puntosClientes, vistaMapa]);

  const marcadoresMapa = useMemo<MarcadorMapa[]>(() => {
    const marcas: MarcadorMapa[] = [];
    for (const g of grupos) {
      if (g.items.length === 1) {
        const p = g.items[0];
        const c = clientesPorId.get(p.clienteId);
        const color = colorDeCliente(c, modoVista);
        marcas.push({
          id: `cli:${p.id}`,
          pos: { lat: p.lat, lng: p.lng },
          capa: 'cliente',
          clave: `uno|${modoVista}|${color}|${p.id}`,
          titulo: p.nombre,
          contenido: () => puntoCliente(color, p.nombre),
          z: 2,
        });
      } else {
        const partes = mezclaColores(g.items, clientesPorId, modoVista);
        const unicos = new Set(g.items.map((i) => i.clienteId)).size;
        const etq = `${unicos.toLocaleString('es-DO')} clientes agrupados. Abrir listado.`;
        marcas.push({
          id: `grp:${g.id}`,
          pos: g.centro,
          capa: 'grupo',
          clave: `g|${modoVista}|${g.items.length}|${partes
            .map((m) => `${m.color}:${m.n}`)
            .join(',')}`,
          titulo: `${unicos} clientes · ${g.items.length} ubicaciones`,
          contenido: () => grupoClientes(unicos, partes, etq),
          z: 3,
        });
      }
    }
    return marcas;
  }, [grupos, clientesPorId, modoVista]);

  /**
   * Encuadre inicial que `MapaGoogle` consume cuando cambia la `clave`. Se
   * pasan solo las esquinas (SW y NE) para no iterar 10k puntos dentro del
   * componente del mapa. Se limita a un recalc cuando cambian los bounds
   * agregados, no en cada render.
   */
  const encuadreMapa = useMemo<Encuadre | null>(() => {
    if (puntosClientes.length === 0) return null;
    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLng = Infinity;
    let maxLng = -Infinity;
    for (const p of puntosClientes) {
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
      if (p.lng < minLng) minLng = p.lng;
      if (p.lng > maxLng) maxLng = p.lng;
    }
    return {
      clave: `clientes|${puntosClientes.length}|${minLat.toFixed(4)}|${maxLat.toFixed(4)}|${minLng.toFixed(4)}|${maxLng.toFixed(4)}`,
      puntos: [
        { lat: minLat, lng: minLng },
        { lat: maxLat, lng: maxLng },
      ],
    };
  }, [puntosClientes]);

  /**
   * Si el dataset cambia (filtros del padre), descartar selección vieja: el
   * cliente abierto puede ya no estar en el nuevo rango, y mostrar un pin que
   * ya no existe en el mapa confunde más que ayuda.
   */
  useEffect(() => {
    setSeleccionCliente(null);
    setSeleccionGrupo(null);
  }, [clientes]);

  const handleClickMarcador = useCallback(
    (m: MarcadorMapa) => {
      if (m.capa === 'cliente') {
        const puntoId = m.id.replace(/^cli:/, '');
        const punto = puntosClientes.find((p) => p.id === puntoId);
        if (!punto) return;
        const c = clientesPorId.get(punto.clienteId);
        if (c) {
          setSeleccionCliente(c);
          setSeleccionGrupo(null);
        }
      } else if (m.capa === 'grupo') {
        const grupo = grupos.find((g) => `grp:${g.id}` === m.id);
        if (grupo) {
          const ids = Array.from(new Set(grupo.items.map((i) => i.clienteId)));
          setSeleccionGrupo(ids);
          setSeleccionCliente(null);
        }
      }
    },
    [grupos, puntosClientes, clientesPorId],
  );

  const clientesDelGrupo = useMemo<Cliente[]>(() => {
    if (!seleccionGrupo) return [];
    const out: Cliente[] = [];
    for (const id of seleccionGrupo) {
      const c = clientesPorId.get(id);
      if (c) out.push(c);
    }
    return out;
  }, [seleccionGrupo, clientesPorId]);

  const totalEnMapa = new Set(puntosClientes.map((p) => p.clienteId)).size;

  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm"
      style={{ height: '70vh' }}
    >
      {/* Botones de vista */}
      <div
        className="absolute left-3 top-3 z-20 flex rounded-xl border border-gray-100 bg-white p-1 shadow-md"
        role="group"
        aria-label="Vista del mapa"
      >
        <BotonVista
          activo={modoVista === 'cluster'}
          onClick={() => setModoVista('cluster')}
          icon={<Layers size={12} />}
          label="Antigüedad"
        />
        <BotonVista
          activo={modoVista === 'zonas'}
          onClick={() => setModoVista('zonas')}
          icon={<MapPinIcon size={12} />}
          label="Zonas"
        />
      </div>

      {/* Contador */}
      <div
        className="absolute right-3 top-3 z-20 rounded-full border border-gray-100 bg-white/95 px-3 py-1.5 text-xs text-gray-700 shadow-md backdrop-blur"
        aria-live="polite"
      >
        <span className="font-semibold text-primary">
          {totalEnMapa.toLocaleString('es-DO')}
        </span>{' '}
        clientes en mapa
      </div>

      {/* Overlay explícito: ningún cliente para mostrar (ni en mapa ni sin coords).
          Se muestra aunque Google cargue bien — no depende de `sinMapa`. */}
      {clientes.length === 0 && totalSinCoords === 0 && (
        <div
          className="absolute left-1/2 top-16 z-20 w-[90%] max-w-sm -translate-x-1/2 rounded-xl border border-gray-100 bg-white/95 px-4 py-3 text-center text-sm text-gray-600 shadow-md backdrop-blur"
          role="status"
        >
          No hay clientes para mostrar con los filtros actuales.
        </div>
      )}

      {/* Leyenda */}
      {modoVista === 'zonas' && (
        <div className="absolute bottom-12 left-3 z-20 max-w-[220px] rounded-xl border border-gray-100 bg-white/95 p-3 text-xs shadow-md backdrop-blur">
          <p className="mb-1.5 font-semibold text-gray-700">Zonas</p>
          <ul className="space-y-1" role="list">
            {ZONAS_RD.map((z) => (
              <li key={z} className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="inline-block h-3 w-3 rounded-full border border-white shadow-sm"
                  style={{ backgroundColor: colorZonaPin(z) }}
                />
                <span className="text-gray-700">{z}</span>
              </li>
            ))}
            <li className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="inline-block h-3 w-3 rounded-full border border-white shadow-sm"
                style={{ backgroundColor: colorZonaPin(null) }}
              />
              <span className="italic text-gray-500">Sin zona</span>
            </li>
          </ul>
        </div>
      )}

      {modoVista === 'cluster' && (
        <div className="absolute bottom-12 left-3 z-20 max-w-[220px] rounded-xl border border-gray-100 bg-white/95 p-3 text-xs shadow-md backdrop-blur">
          <p className="mb-1.5 font-semibold text-gray-700">
            Antigüedad del último servicio
          </p>
          <ul className="space-y-1" role="list">
            {ORDEN_ANTIGUEDAD.map((a) => (
              <li key={a} className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="inline-block h-3 w-3 rounded-full border border-white shadow-sm"
                  style={{ backgroundColor: ANTIGUEDAD[a].color }}
                />
                <span className="text-gray-700">{ANTIGUEDAD[a].etiqueta}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Banner "sin ubicación" */}
      {totalSinCoords > 0 && (
        <div
          className="absolute bottom-3 left-3 right-3 z-20 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 shadow-md"
          role="status"
        >
          <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            <strong>{totalSinCoords.toLocaleString('es-DO')}</strong>{' '}
            cliente{totalSinCoords === 1 ? '' : 's'} cumple
            {totalSinCoords === 1 ? '' : 'n'} los filtros pero no tiene
            {totalSinCoords === 1 ? '' : 'n'} coordenadas y no aparece
            {totalSinCoords === 1 ? '' : 'n'} en el mapa.
          </span>
        </div>
      )}

      {/* Mapa Google compartido */}
      <MapaGoogle
        marcadores={marcadoresMapa}
        lineas={[]}
        tipo="mapa"
        trafico={false}
        encuadre={encuadreMapa}
        relleno={{ top: 56, right: 24, bottom: 72, left: 24 }}
        onClickMarcador={handleClickMarcador}
        onClickMapa={() => {
          setSeleccionCliente(null);
          setSeleccionGrupo(null);
        }}
        onCambioVista={(v) => setVistaMapa(v)}
        sinMapa={
          <ListaClientes
            clientes={clientes}
            onSelectCliente={onSelectCliente}
            tope={200}
            titulo="Clientes del filtro actual"
          />
        }
      />

      {/* Panel de grupo (lista de clientes del cluster seleccionado) */}
      {seleccionGrupo && (
        <aside
          className="absolute bottom-16 left-3 top-16 z-30 flex w-72 flex-col overflow-hidden rounded-xl border border-gray-100 bg-white shadow-xl"
          aria-label="Clientes del grupo seleccionado"
        >
          <header className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
            <span className="text-sm font-semibold text-gray-800">
              Grupo de clientes
            </span>
            <button
              type="button"
              onClick={() => setSeleccionGrupo(null)}
              className="rounded-md p-1 text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary/40"
              aria-label="Cerrar grupo"
            >
              <X size={14} />
            </button>
          </header>
          <div className="flex-1 overflow-y-auto">
            <ListaClientes
              clientes={clientesDelGrupo}
              onSelectCliente={(id) => {
                const c = clientesPorId.get(id);
                if (c) {
                  setSeleccionCliente(c);
                  setSeleccionGrupo(null);
                }
              }}
              tope={30}
              titulo="En este punto"
            />
          </div>
        </aside>
      )}

      {/* Tarjeta de cliente individual seleccionado */}
      {seleccionCliente && (
        <aside
          className="absolute bottom-16 right-3 z-30 w-72 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-xl"
          aria-label={`Resumen de ${seleccionCliente.nombre || 'cliente'}`}
        >
          <header className="flex items-start justify-between gap-2 border-b border-gray-100 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-gray-900">
                {seleccionCliente.nombre || 'Sin nombre'}
              </p>
              <p className="truncate text-xs text-gray-500">
                {seleccionCliente.telefono
                  ? formatTelefono(seleccionCliente.telefono)
                  : 'Sin teléfono'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSeleccionCliente(null)}
              className="rounded-md p-1 text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary/40"
              aria-label="Cerrar tarjeta"
            >
              <X size={14} />
            </button>
          </header>
          <div className="space-y-1 px-3 py-2 text-xs text-gray-600">
            <p>
              <span className="font-medium text-gray-700">Zona:</span>{' '}
              {seleccionCliente.zona || 'Sin zona'}
            </p>
            {seleccionCliente.sector && (
              <p>
                <span className="font-medium text-gray-700">Sector:</span>{' '}
                {seleccionCliente.sector}
              </p>
            )}
            <p>
              <span className="font-medium text-gray-700">Antigüedad:</span>{' '}
              {ANTIGUEDAD[
                antiguedadDe(mesesDesdeUltimoServicio(seleccionCliente))
              ].etiqueta}
            </p>
          </div>
          <div className="flex flex-col gap-1 border-t border-gray-100 px-3 py-2">
            <button
              type="button"
              onClick={() => onSelectCliente(seleccionCliente.id)}
              className="flex min-h-[44px] items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <FileText size={14} aria-hidden="true" /> Ver expediente
            </button>
            <BotonChatCliente
              telefono={seleccionCliente.telefono}
              nombre={seleccionCliente.nombre}
              clienteId={seleccionCliente.id}
              className="flex min-h-[44px] items-center justify-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              WhatsApp empresa
            </BotonChatCliente>
          </div>
        </aside>
      )}

    </div>
  );
}
