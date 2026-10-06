/**
 * marcadores.ts — HTML de los AdvancedMarkerElement del mapa de operaciones.
 *
 * Reglas:
 *  - garantía SIEMPRE roja (#dc2626), aunque esté hecha. QA review #16: antes el gris de "hecha"
 *    tapaba el rojo de garantía por precedencia; acá se evalúa garantía primero.
 *  - gris = sin señal GPS o cita terminada; ámbar = atraso.
 *  - Todo texto va por `textContent` — nunca `innerHTML` con datos del usuario.
 *  - Mínimo 44px de área táctil cuando el pin es interactivo (QA review #15).
 */

export const COLOR = {
  accion: '#0f3460',
  garantia: '#dc2626',
  atraso: '#b45309',
  ok: '#15803d',
  gris: '#64748b',
  grisClaro: '#94a3b8',
  borde: '#ffffff',
  antiguedad: {
    activo: '#15803d',
    reciente: '#4a6fa5',
    enfriando: '#b45309',
    frio: '#64748b',
    sin_registro: '#cbd5e1',
  },
} as const;

const AREA_TACTIL_MIN = 44;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, css: string, texto?: string) => {
  const e = document.createElement(tag);
  e.style.cssText = css;
  if (texto !== undefined) e.textContent = texto;
  return e;
};

interface PinCitaOpts {
  numero: number;
  color: string;
  garantia: boolean;
  hecha: boolean;
  atrasada: boolean;
  seleccionada: boolean;
  titulo: string;
  sinUbicacion?: boolean;
}

/**
 * Gota con número de parada. Garantía SIEMPRE #dc2626. Hecha pinta gris oscuro con ✓ *solo si*
 * no es garantía — garantía mantiene color aunque esté hecha.
 */
export function pinCita(o: PinCitaOpts): HTMLElement {
  const fondo = o.garantia ? COLOR.garantia : o.hecha ? COLOR.grisClaro : o.color;
  const t = o.seleccionada ? 1.25 : 1;
  const anchoPin = 30 * t;
  const altoPin = 40 * t;
  // La envoltura garantiza área táctil 44px aunque el pin visible sea más pequeño.
  const envoltura = el(
    'div',
    `position:relative;width:${Math.max(AREA_TACTIL_MIN, anchoPin)}px;height:${Math.max(AREA_TACTIL_MIN, altoPin)}px;display:grid;place-items:end center;cursor:pointer`,
  );
  envoltura.title = o.titulo;
  envoltura.setAttribute('role', 'button');
  envoltura.setAttribute('aria-label', o.titulo);
  envoltura.tabIndex = 0;

  const w = el(
    'div',
    `position:relative;width:${anchoPin}px;height:${altoPin}px;transform-origin:50% 100%`,
  );
  const gota = el(
    'div',
    `position:absolute;left:0;top:0;width:${anchoPin}px;height:${anchoPin}px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${fondo};border:2px solid ${COLOR.borde};box-shadow:0 2px 6px rgb(15 23 42/.3)`,
  );
  const simbolo = o.garantia ? '!' : o.hecha ? '✓' : String(o.numero);
  const num = el(
    'div',
    `position:absolute;left:0;top:0;width:${anchoPin}px;height:${anchoPin}px;display:grid;place-items:center;color:#fff;font:700 ${13 * t}px 'Plus Jakarta Sans',system-ui`,
    simbolo,
  );
  w.append(gota, num);
  if (o.atrasada && !o.hecha) {
    w.append(el(
      'div',
      `position:absolute;right:-4px;top:-4px;width:12px;height:12px;border-radius:50%;background:${COLOR.atraso};border:2px solid ${COLOR.borde}`,
    ));
  }
  if (o.sinUbicacion) {
    w.style.opacity = '0.55';
  }
  envoltura.append(w);
  return envoltura;
}

interface MarcadorVanOpts {
  inicial: string;
  color: string;
  hechas: number;
  total: number;
  atrasado: boolean;
  senal: 'ok' | 'vieja' | 'perdida' | 'sin_gps';
  etiqueta: string;
  titulo: string;
}

export function marcadorVan(o: MarcadorVanOpts): HTMLElement {
  const sinSenal = o.senal !== 'ok';
  const w = el(
    'div',
    `display:flex;flex-direction:column;align-items:center;gap:2px;cursor:pointer;min-width:${AREA_TACTIL_MIN}px`,
  );
  w.title = o.titulo;
  w.setAttribute('role', 'button');
  w.setAttribute('aria-label', o.titulo);
  w.tabIndex = 0;

  const r = 19;
  const c = 2 * Math.PI * r;
  const frac = o.total ? o.hechas / o.total : 0;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('width', '46');
  svg.setAttribute('height', '46');
  svg.setAttribute('viewBox', '0 0 46 46');
  const fondo = document.createElementNS(ns, 'circle');
  Object.entries({ cx: '23', cy: '23', r: String(r), fill: '#fff', stroke: '#e2e8f0', 'stroke-width': '4' })
    .forEach(([k, v]) => fondo.setAttribute(k, v));
  const arco = document.createElementNS(ns, 'circle');
  Object.entries({
    cx: '23', cy: '23', r: String(r), fill: 'none',
    stroke: o.atrasado ? COLOR.atraso : COLOR.ok,
    'stroke-width': '4', 'stroke-linecap': 'round',
    'stroke-dasharray': `${c * frac} ${c}`, transform: 'rotate(-90 23 23)',
  }).forEach(([k, v]) => arco.setAttribute(k, v));
  const centro = document.createElementNS(ns, 'circle');
  Object.entries({ cx: '23', cy: '23', r: '14', fill: sinSenal ? COLOR.gris : o.color })
    .forEach(([k, v]) => centro.setAttribute(k, v));
  const txt = document.createElementNS(ns, 'text');
  Object.entries({
    x: '23', y: '28', 'text-anchor': 'middle', fill: '#fff',
    'font-size': '14', 'font-weight': '800', 'font-family': 'Plus Jakarta Sans,system-ui',
  }).forEach(([k, v]) => txt.setAttribute(k, v));
  txt.textContent = (o.inicial || '?').slice(0, 1).toUpperCase();
  svg.append(fondo, arco, centro, txt);
  if (sinSenal) svg.style.opacity = '.75';

  const etq = el(
    'div',
    `max-width:160px;padding:3px 10px;border-radius:999px;background:#fff;box-shadow:0 1px 4px rgb(15 23 42/.25);font:600 12px 'Plus Jakarta Sans',system-ui;color:${o.atrasado ? COLOR.atraso : '#0f172a'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis`,
    o.etiqueta,
  );
  w.append(svg, etq);
  return w;
}

export function puntoCliente(color: string, titulo: string): HTMLElement {
  const envoltura = el(
    'div',
    `width:${AREA_TACTIL_MIN}px;height:${AREA_TACTIL_MIN}px;display:grid;place-items:center;cursor:pointer`,
  );
  envoltura.title = titulo;
  envoltura.setAttribute('role', 'button');
  envoltura.setAttribute('aria-label', titulo);
  envoltura.tabIndex = 0;
  const d = el(
    'div',
    `width:16px;height:16px;border-radius:50%;background:${color};border:2px solid ${COLOR.borde};box-shadow:0 1px 3px rgb(15 23 42/.3)`,
  );
  envoltura.append(d);
  return envoltura;
}

export function grupoClientes(total: number, mezcla: { color: string; n: number }[], etiqueta = `${total} clientes. Abrir listado.`): HTMLElement {
  const tam = total < 10 ? 44 : total < 100 ? 52 : total < 1000 ? 60 : 68;
  let ac = 0;
  const partes = mezcla.filter((m) => m.n > 0).map((m) => {
    const a = ac;
    ac += (m.n / total) * 360;
    return `${m.color} ${a}deg ${ac}deg`;
  });
  const w = el(
    'div',
    `width:${tam}px;height:${tam}px;border-radius:50%;background:conic-gradient(${partes.join(',') || '#94a3b8 0deg 360deg'});display:grid;place-items:center;cursor:pointer;box-shadow:0 1px 4px rgb(15 23 42/.3)`,
  );
  w.setAttribute('role', 'button');
  w.setAttribute('aria-label', etiqueta);
  w.tabIndex = 0;
  w.append(el(
    'div',
    `width:${tam - 12}px;height:${tam - 12}px;border-radius:50%;background:#fff;display:grid;place-items:center;font:700 13px 'Plus Jakarta Sans',system-ui;color:#0f172a`,
    total.toLocaleString('es-DO'),
  ));
  return w;
}

export function marcadorOficina(): HTMLElement {
  const envoltura = el(
    'div',
    `width:${AREA_TACTIL_MIN}px;height:${AREA_TACTIL_MIN}px;display:grid;place-items:center`,
  );
  envoltura.title = 'Oficina Mister Service';
  envoltura.setAttribute('aria-label', 'Oficina Mister Service');
  const d = el(
    'div',
    `width:32px;height:32px;border-radius:50%;background:${COLOR.accion};border:3px solid ${COLOR.borde};display:grid;place-items:center;color:#fff;font:800 10px 'Plus Jakarta Sans',system-ui;box-shadow:0 2px 6px rgb(15 23 42/.3)`,
    'MS',
  );
  envoltura.append(d);
  return envoltura;
}
