/**
 * ListaAtencion.tsx — lista de avisos agrupados por categoría.
 *
 *  - Cliente SIEMPRE como título.
 *  - Cada categoría tiene su propia sección con tope visible + «ver más» que
 *    expande realmente a la lista completa (sin tope). Antes el botón era
 *    tautológico (fix revisión Codex #5).
 *  - Click en el aviso abre la orden real `/admin/ordenes/:id` cuando hay
 *    permiso `ordenesVer`. Sin permiso, el nombre no es un link.
 *  - Botón «Ver técnico» ≥ 44 px (fix Codex #7).
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { AvisoOperaciones, CategoriaAviso } from '../../utils/operacionesPrioridad';

interface Props {
  datosIncompletos?: boolean;
  /** Avisos truncados por `limiteCategoria` (vista inicial). */
  avisos: AvisoOperaciones[];
  conteosCategoria: Record<CategoriaAviso, number>;
  totalesCategoria: Record<CategoriaAviso, number>;
  /** Lista completa de avisos por categoría — necesaria para que «Ver más» expanda. */
  avisosPorCategoria: Record<CategoriaAviso, AvisoOperaciones[]>;
  onAbrirTecnico?: (tecnicoId: string) => void;
  /** Si es `false`, el nombre del cliente no es un link y no se expone la ruta. */
  puedeAbrirOrden?: boolean;
}

const CATEGORIAS: Array<{ clave: CategoriaAviso; titulo: string; tono: string }> = [
  { clave: 'chequeo_por_revisar', titulo: 'Chequeo por revisar', tono: 'border-sky-300 bg-sky-50' },
  { clave: 'cliente_por_confirmar', titulo: 'Presupuesto aprobado · contactar al cliente', tono: 'border-sky-300 bg-sky-50' },
  { clave: 'precio_por_revisar', titulo: 'Diagnóstico y precio por revisar', tono: 'border-sky-300 bg-sky-50' },
  { clave: 'atrasada', titulo: 'Atrasadas', tono: 'border-amber-300 bg-amber-50' },
  { clave: 'garantia_abierta', titulo: 'Garantías abiertas', tono: 'border-rose-300 bg-rose-50' },
  { clave: 'sin_salir', titulo: 'Sin registrar salida', tono: 'border-amber-300 bg-amber-50' },
  { clave: 'por_cobrar', titulo: 'Terminadas sin cobrar', tono: 'border-slate-300 bg-slate-50' },
  { clave: 'standby_pieza', titulo: 'En stand-by', tono: 'border-slate-300 bg-slate-50' },
  { clave: 'pendiente_anterior', titulo: 'Pendientes de días anteriores', tono: 'border-slate-300 bg-slate-50' },
];

export default function ListaAtencion({
  avisos,
  datosIncompletos = false,
  conteosCategoria,
  totalesCategoria,
  avisosPorCategoria,
  onAbrirTecnico,
  puedeAbrirOrden = true,
}: Props) {
  const total = Object.values(totalesCategoria).reduce((a, b) => a + b, 0);

  if (total === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
        {datosIncompletos ? 'Pendientes por verificar cuando termine la carga de datos.' : 'Sin casos que requieran atención ahora.'}
      </div>
    );
  }

  return (
    <div>
      <p className="mb-3 text-xs text-slate-600">{total} casos · Ordenados por prioridad. Desplaza la lista para ver las categorías.</p>
      <div className="max-h-[360px] overflow-y-auto overscroll-contain pr-1 space-y-5 lg:max-h-[440px]" tabIndex={0} role="region" aria-label="Casos que requieren atención">
      {CATEGORIAS.map((cat) => (
        <SeccionCategoria
          key={cat.clave}
          titulo={cat.titulo}
          tono={cat.tono}
          truncados={avisos.filter((a) => a.categoria === cat.clave)}
          completos={avisosPorCategoria[cat.clave] ?? []}
          mostradas={conteosCategoria[cat.clave]}
          total={totalesCategoria[cat.clave]}
          onAbrirTecnico={onAbrirTecnico}
          puedeAbrirOrden={puedeAbrirOrden}
        />
      ))}
      </div>
    </div>
  );
}

interface SeccionProps {
  titulo: string;
  tono: string;
  /** Primera tanda (hasta `mostradas`). */
  truncados: AvisoOperaciones[];
  /** Lista total sin tope. */
  completos: AvisoOperaciones[];
  mostradas: number;
  total: number;
  onAbrirTecnico?: (tecnicoId: string) => void;
  puedeAbrirOrden: boolean;
}

function SeccionCategoria({
  titulo,
  tono,
  truncados,
  completos,
  mostradas,
  total,
  onAbrirTecnico,
  puedeAbrirOrden,
}: SeccionProps) {
  const [expandida, setExpandida] = useState(false);
  if (!total) return null;
  const visibles = expandida ? completos : truncados;
  const sobrantes = Math.max(0, total - mostradas);

  return (
    <section data-testid={`seccion-${titulo}`}>
      <header className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800">{titulo}</h3>
        <span className="text-xs text-slate-500">{total}</span>
      </header>
      <ul className="space-y-2">
        {visibles.map((a) => (
          <li key={a.id}>
            <div className={`flex flex-col sm:flex-row items-start gap-3 rounded-lg border p-3 min-h-[44px] ${tono}`}>
              <div className="min-w-0 w-full sm:flex-1">
                {puedeAbrirOrden ? (
                  <Link
                    to={`/admin/ordenes/${a.ordenId}`}
                    className="block min-h-[44px] text-sm font-semibold text-slate-900 underline-offset-2 hover:underline"
                    title={`Abrir orden ${a.ordenId}`}
                  >
                    {a.clienteNombre}
                  </Link>
                ) : (
                  <span className="block text-sm font-semibold text-slate-900">{a.clienteNombre}</span>
                )}
                <p className="text-xs text-slate-600">
                  {a.equipoTipo}
                  {a.equipoMarca ? ` · ${a.equipoMarca}` : ''}
                  {a.tecnicoNombre ? ` · Técnico: ${a.tecnicoNombre}` : ' · Técnico sin identificar'}
                  {a.equipoOperacion ? ` · Equipo ${a.equipoOperacion}` : ''}
                </p>
                <p className="mt-1 text-xs font-medium text-slate-700">{a.razon}</p>
                {a.importeSugerido !== undefined && Number.isFinite(a.importeSugerido) && (
                  <p className="mt-1 text-sm font-semibold text-sky-900">Sugerido: RD$ {a.importeSugerido.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</p>
                )}
                {a.detalleTecnico && <p className="mt-1 whitespace-pre-line break-words text-xs text-slate-600 line-clamp-3">{a.categoria === 'chequeo_por_revisar' ? 'Motivo: ' : 'Notas del técnico: '}{a.detalleTecnico}</p>}
                {a.importeSugerido !== undefined && !a.detalleTecnico && <p className="text-xs text-slate-500">Sin nota técnica registrada.</p>}
              </div>
              <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:flex-col sm:items-end">
                <span className="text-xs font-medium text-slate-700 tabular-nums sm:text-right">{a.metrica}</span>
                {a.tecnicoId && onAbrirTecnico && (
                  <button
                    type="button"
                    onClick={() => onAbrirTecnico(a.tecnicoId!)}
                    className="min-h-[44px] min-w-[44px] rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 hover:bg-slate-100"
                  >
                    Ver técnico
                  </button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
      {sobrantes > 0 && (
        <button
          type="button"
          data-testid={`ver-mas-${titulo}`}
          onClick={() => setExpandida((v) => !v)}
          className="mt-2 min-h-[44px] rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-sky-700 hover:bg-slate-50"
          aria-expanded={expandida}
        >
          {expandida ? 'Mostrar menos' : `Ver ${sobrantes} más`}
        </button>
      )}
    </section>
  );
}
