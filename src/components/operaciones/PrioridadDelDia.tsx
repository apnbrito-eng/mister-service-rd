/**
 * Prioridad del día — Lote C (plan integral §6, auditoría alertas §6).
 *
 * Vive DENTRO del Centro de operaciones existente (`/admin/operaciones`);
 * no es una pantalla independiente. Tres sub-vistas que reusan los datos
 * ya cargados por `useMapaDatos` + una suscripción paralela a
 * `whatsapp_conversaciones` (misma rule `esStaffOficina` del inbox general).
 *
 * Vistas:
 *   - Clientes de hoy       → clientes con cita, trabajo activo o
 *                             conversación entrante del día en curso.
 *   - Atrasados activos     → órdenes con atraso o garantía abierta
 *                             identificadas por `agregarAvisos`
 *                             (categorías `atrasada` + `garantia_abierta`).
 *                             NO infiere tiempos propios.
 *   - Esperando respuesta   → conversaciones con `ultimoMensajeEntrante`
 *                             sin respuesta posterior y sin `bajaSolicitada`.
 *
 * Reglas:
 *   - Deduplicación por `clienteId || wa_id`: una conversación aparece en
 *     UNA sola categoría prioritaria (atraso > espera > hoy) y el mismo
 *     cliente nunca aparece dos veces en la misma sección.
 *   - Al pulsar: abre `/admin/inbox/<waId>?volverA=operaciones&prioridad=<cat>`
 *     para que la vista de regreso conserve el contexto. Si NO hay wa_id
 *     (atraso sin conversación), abre la orden en lugar del inbox para
 *     que el usuario pueda responder desde la orden del cliente.
 *   - NO envía mensajes ni crea formulario-aislado. La respuesta pasa por
 *     la conversación completa real en el inbox empresarial. El envío por
 *     lote lo cierra Codex con la plantilla WhatsApp aprobada por Meta.
 *   - NO inventa minutos de urgencia: usa los avisos ya calculados
 *     (`operacionesPrioridad.ts`) y el shape persistido de las
 *     conversaciones (`ultimoMensajeEntrante`/`Saliente`).
 *   - Soporta modo televisor (`modo === 'tv'`): oculta descripciones y
 *     controles, agranda tarjetas y títulos; útil para proyectar.
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, Clock, AlertTriangle, UserRound, Package } from 'lucide-react';
import type { OrdenServicio, WhatsAppConversacion } from '../../types';
import type { AvisoOperaciones } from '../../utils/operacionesPrioridad';

export type ModoVista = 'normal' | 'tv';

interface Props {
  modo: ModoVista;
  /** Avisos ya calculados por `agregarAvisos`; filtramos a `atrasada`/`garantia_abierta`. */
  avisos: AvisoOperaciones[];
  /** Órdenes del día (ya con `conEspera` aplicado) para derivar "Clientes de hoy". */
  ordenesDelDia: OrdenServicio[];
  /** Conversaciones WhatsApp vigentes. */
  conversaciones: WhatsAppConversacion[];
  /** Momento actual del tick de Operaciones. */
  ahora: Date;
  /** `true` cuando `useMapaDatos` todavía no entregó datos confiables. */
  cargando: boolean;
  /** Error al leer conversaciones; no bloquea las otras vistas. */
  errorConversaciones?: string | null;
}

interface TarjetaPrioridad {
  key: string;
  waId: string | null;
  clienteId: string | null;
  ordenId: string | null;
  nombre: string;
  resumen: string;
  minutoAtraso?: number;
  horaReferencia?: Date;
  categoria: 'hoy' | 'atraso' | 'espera';
  /** Para enlace al chat (prefijo visible). */
  tipoIcono: 'cliente' | 'alerta' | 'chat' | 'pieza';
}

function esMismoDiaRD(a: Date, b: Date): boolean {
  const fmt = new Intl.DateTimeFormat('es-DO', {
    timeZone: 'America/Santo_Domingo',
    year: 'numeric',
    month: '2-digit',
    day: 'numeric',
  });
  return fmt.format(a) === fmt.format(b);
}

function toDateSeguro(
  v: Date | { toMillis?: () => number } | undefined | null,
): Date | null {
  if (!v) return null;
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v : null;
  const ms = typeof v.toMillis === 'function' ? v.toMillis() : NaN;
  return Number.isFinite(ms) ? new Date(ms) : null;
}

function clienteKey(waId: string | null, clienteId: string | null, ordenId: string | null): string {
  if (clienteId) return `cli:${clienteId}`;
  if (waId) return `wa:${waId}`;
  if (ordenId) return `ord:${ordenId}`;
  return `anon:${Math.random()}`;
}

/**
 * Toma avisos de `atrasada` + `garantia_abierta` y los enriquece con el
 * `clienteId` del `ordenId` cuando lo encontramos en `ordenesDelDia`.
 */
function tarjetasDeAtrasos(
  avisos: AvisoOperaciones[],
  ordenesDelDia: OrdenServicio[],
): TarjetaPrioridad[] {
  const porOrden = new Map(ordenesDelDia.map((o) => [o.id, o]));
  return avisos
    .filter((a) => a.categoria === 'atrasada' || a.categoria === 'garantia_abierta')
    .map((a) => {
      const orden = porOrden.get(a.ordenId);
      const clienteId = orden?.clienteId ?? null;
      // metrica suele ser "15 min" o "2 días"; extraemos minutos sólo cuando
      // es seguro. No inventamos umbral alguno.
      const matchMin = /^(\d+)\s*min/.exec(a.metrica ?? '');
      const minutoAtraso = matchMin ? Number.parseInt(matchMin[1], 10) : undefined;
      return {
        key: clienteKey(null, clienteId, a.ordenId),
        waId: null,
        clienteId,
        ordenId: a.ordenId,
        nombre: a.clienteNombre || 'Sin cliente identificado',
        resumen: a.razon || a.metrica || 'Atraso registrado',
        minutoAtraso,
        horaReferencia: undefined,
        categoria: 'atraso' as const,
        tipoIcono: a.categoria === 'garantia_abierta' ? 'alerta' : 'alerta',
      };
    });
}

function tarjetasClientesHoy(
  ordenes: OrdenServicio[],
  ahora: Date,
): TarjetaPrioridad[] {
  const vistos = new Set<string>();
  const out: TarjetaPrioridad[] = [];
  for (const o of ordenes) {
    if (o.eliminada) continue;
    if (['cerrado', 'cancelado'].includes(o.fase)) continue;
    // `fechaCita` cuando existe, si no `createdAt`. No usamos otras fechas
    // para no inferir "hoy" por campos ambiguos.
    const fechaBase = o.fechaCita || o.createdAt;
    if (!(fechaBase instanceof Date) || !Number.isFinite(fechaBase.getTime())) continue;
    if (!esMismoDiaRD(fechaBase, ahora)) continue;
    const key = clienteKey(null, o.clienteId || null, o.id);
    if (vistos.has(key)) continue;
    vistos.add(key);
    out.push({
      key,
      waId: null,
      clienteId: o.clienteId || null,
      ordenId: o.id,
      nombre: o.clienteNombre || 'Sin cliente',
      resumen: `${o.equipoTipo || 'Trabajo'} · ${o.fase.replace(/_/g, ' ')}`,
      horaReferencia: fechaBase,
      categoria: 'hoy' as const,
      tipoIcono: 'cliente',
    });
  }
  return out;
}

function tarjetasEsperandoRespuesta(
  conversaciones: WhatsAppConversacion[],
): TarjetaPrioridad[] {
  const out: TarjetaPrioridad[] = [];
  for (const c of conversaciones) {
    if (c.bajaSolicitada) continue;
    if ((c.ocultoGlobalHastaMs ?? 0) > 0) continue;
    const entrante = toDateSeguro(c.ultimoMensajeEntrante?.timestamp);
    const saliente = toDateSeguro(c.ultimoMensajeSaliente?.timestamp);
    if (!entrante) continue;
    if (saliente && saliente.getTime() >= entrante.getTime()) continue;
    out.push({
      key: clienteKey(c.wa_id, c.clienteId ?? null, null),
      waId: c.wa_id,
      clienteId: c.clienteId ?? null,
      ordenId: null,
      // El nombre real del cliente lo resuelve el inbox desde el panel
      // del lado; acá mostramos un identificador legible: wa_id (10 dígitos
      // RD normalizados).
      nombre: c.wa_id,
      resumen: c.ultimoMensajeEntrante?.preview || 'Mensaje entrante sin respuesta',
      horaReferencia: entrante,
      categoria: 'espera',
      tipoIcono: 'chat',
    });
  }
  return out;
}

/**
 * Dedup entre categorías: prioridad atraso > espera > hoy.
 */
function dedupEntreVistas(
  hoy: TarjetaPrioridad[],
  atraso: TarjetaPrioridad[],
  espera: TarjetaPrioridad[],
): { hoy: TarjetaPrioridad[]; atraso: TarjetaPrioridad[]; espera: TarjetaPrioridad[] } {
  const tomados = new Set<string>();
  const filtrar = (lista: TarjetaPrioridad[]): TarjetaPrioridad[] => {
    const out: TarjetaPrioridad[] = [];
    for (const t of lista) {
      if (tomados.has(t.key)) continue;
      tomados.add(t.key);
      out.push(t);
    }
    return out;
  };
  const atrasoDedup = filtrar(atraso);
  const esperaDedup = filtrar(espera);
  const hoyDedup = filtrar(hoy);
  return { atraso: atrasoDedup, espera: esperaDedup, hoy: hoyDedup };
}

function enlaceDestino(t: TarjetaPrioridad): string | null {
  if (t.waId) {
    const params = new URLSearchParams({ volverA: 'operaciones', prioridad: t.categoria });
    return `/admin/inbox/${encodeURIComponent(t.waId)}?${params.toString()}`;
  }
  if (t.ordenId) {
    return `/admin/ordenes/${encodeURIComponent(t.ordenId)}?volverA=operaciones&prioridad=${t.categoria}`;
  }
  return null;
}

function iconoDe(tipo: TarjetaPrioridad['tipoIcono'], tam: number) {
  if (tipo === 'chat') return <MessageCircle size={tam} aria-hidden="true" />;
  if (tipo === 'alerta') return <AlertTriangle size={tam} aria-hidden="true" />;
  if (tipo === 'pieza') return <Package size={tam} aria-hidden="true" />;
  return <UserRound size={tam} aria-hidden="true" />;
}

function Tarjeta({ t, modo }: { t: TarjetaPrioridad; modo: ModoVista }) {
  const enlace = enlaceDestino(t);
  const grande = modo === 'tv';
  const horaFmt = t.horaReferencia
    ? new Intl.DateTimeFormat('es-DO', {
        timeZone: 'America/Santo_Domingo',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(t.horaReferencia)
    : null;
  const contenido = (
    <div
      className={`flex items-start gap-3 rounded-lg border bg-white p-3 transition-colors ${grande ? 'min-h-[88px] text-base' : 'min-h-[72px] text-sm'} border-slate-200 hover:border-slate-300`}
    >
      <span
        aria-hidden="true"
        className={`mt-0.5 inline-flex items-center justify-center rounded-full ${grande ? 'h-10 w-10' : 'h-8 w-8'} bg-slate-100 text-slate-500`}
      >
        {iconoDe(t.tipoIcono, grande ? 20 : 16)}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`truncate font-semibold text-slate-900 ${grande ? 'text-lg' : ''}`}>
          {t.nombre}
        </p>
        <p className={`truncate text-slate-600 ${grande ? 'text-sm' : 'text-xs'}`}>{t.resumen}</p>
        {(horaFmt || typeof t.minutoAtraso === 'number') && (
          <p className={`mt-1 flex items-center gap-1 text-slate-500 ${grande ? 'text-sm' : 'text-xs'}`}>
            <Clock size={grande ? 14 : 12} aria-hidden="true" />
            {horaFmt && <span>{horaFmt}</span>}
            {typeof t.minutoAtraso === 'number' && t.minutoAtraso > 0 && (
              <span className="font-medium text-amber-800">· +{t.minutoAtraso} min</span>
            )}
          </p>
        )}
      </div>
      {enlace && (
        <span
          aria-hidden="true"
          className={`${grande ? 'text-sm' : 'text-xs'} shrink-0 self-center font-medium text-blue-700`}
        >
          {t.waId ? 'Abrir chat →' : 'Abrir orden →'}
        </span>
      )}
    </div>
  );
  if (enlace) {
    return (
      <Link
        to={enlace}
        className="block focus:outline focus:outline-2 focus:outline-blue-700"
      >
        {contenido}
      </Link>
    );
  }
  return <div>{contenido}</div>;
}

function Columna({
  titulo,
  descripcion,
  tarjetas,
  icono,
  modo,
  vacio,
}: {
  titulo: string;
  descripcion: string;
  tarjetas: TarjetaPrioridad[];
  icono: React.ReactNode;
  modo: ModoVista;
  vacio: string;
}) {
  const grande = modo === 'tv';
  return (
    <section
      className={`rounded-xl border border-slate-200 bg-white ${grande ? 'p-5' : 'p-4'}`}
    >
      <header className="mb-3 flex items-center gap-2">
        <span aria-hidden="true" className="text-slate-500">
          {icono}
        </span>
        <h3 className={`font-semibold text-slate-800 ${grande ? 'text-lg' : 'text-sm'}`}>
          {titulo}
        </h3>
        <span className={`${grande ? 'text-base' : 'text-xs'} text-slate-500`}>
          · {tarjetas.length}
        </span>
      </header>
      {!grande && <p className="mb-3 text-xs text-slate-500">{descripcion}</p>}
      {tarjetas.length === 0 ? (
        <p className={`${grande ? 'text-base' : 'text-xs'} text-slate-400`}>{vacio}</p>
      ) : (
        <ul className={`${grande ? 'space-y-3' : 'space-y-2'}`}>
          {tarjetas.map((t) => (
            <li key={t.key}>
              <Tarjeta t={t} modo={modo} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function PrioridadDelDia({
  modo,
  avisos,
  ordenesDelDia,
  conversaciones,
  ahora,
  cargando,
  errorConversaciones,
}: Props) {
  const { hoy, atraso, espera } = useMemo(() => {
    const atrasoBase = tarjetasDeAtrasos(avisos, ordenesDelDia);
    const hoyBase = tarjetasClientesHoy(ordenesDelDia, ahora);
    const esperaBase = tarjetasEsperandoRespuesta(conversaciones);
    return dedupEntreVistas(hoyBase, atrasoBase, esperaBase);
  }, [avisos, ordenesDelDia, conversaciones, ahora]);

  const grande = modo === 'tv';
  const tituloVisible = grande ? 'Prioridad del día · TV' : 'Prioridad del día';

  return (
    <section
      className={`rounded-xl border border-slate-200 bg-slate-50 ${grande ? 'p-5' : 'p-4'}`}
      aria-label="Prioridad del día"
    >
      <header className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className={`font-semibold text-slate-900 ${grande ? 'text-2xl' : 'text-base'}`}>
          {tituloVisible}
        </h2>
        {!grande && (
          <p className="text-xs text-slate-500">
            Mismo cliente aparece una sola vez · abre su chat completo en el inbox
          </p>
        )}
      </header>
      {cargando && (
        <p className={`${grande ? 'text-base' : 'text-xs'} text-slate-500`}>
          Esperando datos del día…
        </p>
      )}
      {errorConversaciones && (
        <p
          role="alert"
          className={`${grande ? 'text-base' : 'text-xs'} text-amber-800`}
        >
          No se pudieron leer las conversaciones ({errorConversaciones}). "Esperando
          respuesta" queda vacía; las otras vistas siguen funcionando.
        </p>
      )}
      <div
        className={`grid gap-3 ${grande ? 'grid-cols-1 lg:grid-cols-3 gap-5' : 'md:grid-cols-3'}`}
      >
        <Columna
          titulo="Clientes de hoy"
          descripcion="Con cita, trabajo activo o conversación del día."
          icono={<UserRound size={grande ? 18 : 14} />}
          tarjetas={hoy}
          modo={modo}
          vacio="Sin clientes agendados para hoy."
        />
        <Columna
          titulo="Atrasados activos"
          descripcion="Órdenes con atraso o garantía abierta ya identificadas."
          icono={<AlertTriangle size={grande ? 18 : 14} />}
          tarjetas={atraso}
          modo={modo}
          vacio="Sin atrasos activos."
        />
        <Columna
          titulo="Esperando respuesta"
          descripcion="Último mensaje entrante sin respuesta posterior."
          icono={<MessageCircle size={grande ? 18 : 14} />}
          tarjetas={espera}
          modo={modo}
          vacio="Todas las conversaciones están al día."
        />
      </div>
    </section>
  );
}
