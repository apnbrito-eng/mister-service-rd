/**
 * scripts/generar_svg.js (ESM — el repo usa "type": "module")
 *
 * Genera un SVG simple del mapa (no necesita Chromium ni mermaid-cli). Es la
 * imagen que se puede mirar directo o mandar por WhatsApp.
 *
 * Lee `docs/mapa/MAPA_MENTAL.yaml` y produce `docs/mapa/mapa.svg`.
 *
 * Layout: una columna por área. Las cajas se acomodan verticalmente dentro
 * de su columna. Flechas grises = dependencia.
 *
 * Dependencias: `js-yaml`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(__dirname, '..');
const YAML_PATH = path.join(RAIZ, 'docs/mapa/MAPA_MENTAL.yaml');
const OUT_PATH = path.join(RAIZ, 'docs/mapa/mapa.svg');

if (!fs.existsSync(YAML_PATH)) {
  console.error(`✗ No existe ${YAML_PATH}`);
  process.exit(1);
}

const mapa = yaml.load(fs.readFileSync(YAML_PATH, 'utf8'));

// Paleta por área (alineada con la del HTML/Mermaid).
const COLORES = {
  ordenes:              { bg: '#e0e7ff', border: '#6366f1', text: '#312e81' },
  agendamiento:         { bg: '#dbeafe', border: '#3b82f6', text: '#1e3a8a' },
  clientes:             { bg: '#fef3c7', border: '#f59e0b', text: '#78350f' },
  dinero:               { bg: '#d1fae5', border: '#10b981', text: '#064e3b' },
  inventario:           { bg: '#ede9fe', border: '#a855f7', text: '#4c1d95' },
  personal_rrhh:        { bg: '#ffedd5', border: '#f97316', text: '#7c2d12' },
  whatsapp_crm:         { bg: '#ccfbf1', border: '#14b8a6', text: '#134e4a' },
  formularios_publicos: { bg: '#fce7f3', border: '#ec4899', text: '#831843' },
  reporting:            { bg: '#f1f5f9', border: '#64748b', text: '#0f172a' },
  sistema:              { bg: '#f5f5f4', border: '#78716c', text: '#1c1917' },
};
const DEFAULT_COLOR = { bg: '#f8fafc', border: '#94a3b8', text: '#0f172a' };

const areas = Object.keys(mapa.areas);
const modulosPorArea = {};
for (const a of areas) modulosPorArea[a] = [];
for (const [n, m] of Object.entries(mapa.modulos)) {
  if (modulosPorArea[m.area]) modulosPorArea[m.area].push(n);
}

// Layout.
const PAD_X = 60;
const PAD_TOP = 90;
const PAD_BOTTOM = 80;
const BOX_W = 180;
const BOX_H = 54;
const GAP_Y = 16;
const COL_GAP = 30;
const COL_W = BOX_W + COL_GAP;

const maxFilas = Math.max(...areas.map((a) => modulosPorArea[a].length), 1);
const W = PAD_X * 2 + COL_W * areas.length - COL_GAP;
const H = PAD_TOP + maxFilas * (BOX_H + GAP_Y) + PAD_BOTTOM;

const pos = {};
areas.forEach((area, ai) => {
  modulosPorArea[area].forEach((m, i) => {
    pos[m] = {
      x: PAD_X + ai * COL_W,
      y: PAD_TOP + i * (BOX_H + GAP_Y),
      area,
    };
  });
});

function escape(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

let svg = '';
svg += `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="-apple-system, system-ui, sans-serif">\n`;
svg += `  <defs>\n`;
svg += `    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">\n`;
svg += `      <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b"/>\n`;
svg += `    </marker>\n`;
svg += `  </defs>\n`;
svg += `  <rect width="${W}" height="${H}" fill="#fafafa"/>\n`;
svg += `  <text x="${W/2}" y="36" text-anchor="middle" font-size="20" font-weight="700" fill="#0f172a">${escape(mapa.meta?.proyecto || 'Mister Service RD')}</text>\n`;
svg += `  <text x="${W/2}" y="58" text-anchor="middle" font-size="11" fill="#64748b">Mapa mental · última actualización: ${escape(mapa.meta?.ultima_actualizacion || '—')} · ${Object.keys(mapa.modulos).length} módulos</text>\n`;

// Encabezados de columna por área.
areas.forEach((area, ai) => {
  const c = COLORES[area] || DEFAULT_COLOR;
  const x = PAD_X + ai * COL_W + BOX_W/2;
  svg += `  <text x="${x}" y="82" text-anchor="middle" font-size="11" font-weight="700" fill="${c.text}">${area.toUpperCase()}</text>\n`;
});

// Líneas de dependencia (primero para que queden debajo de las cajas).
for (const [nombre, mod] of Object.entries(mapa.modulos)) {
  if (!pos[nombre]) continue;
  for (const dep of mod.depende_de || []) {
    if (!pos[dep]) continue;
    const x1 = pos[nombre].x + BOX_W/2;
    const y1 = pos[nombre].y + BOX_H/2;
    const x2 = pos[dep].x + BOX_W/2;
    const y2 = pos[dep].y + BOX_H/2;
    svg += `  <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#cbd5e1" stroke-width="1.1" marker-end="url(#arrow)" stroke-dasharray="4,3"/>\n`;
  }
}

// Cajas.
for (const [nombre, mod] of Object.entries(mapa.modulos)) {
  const p = pos[nombre];
  if (!p) continue;
  const c = COLORES[p.area] || DEFAULT_COLOR;
  const sw = mod.criticidad === 'alta' ? 2.5 : 1.2;
  svg += `  <g>\n`;
  svg += `    <rect x="${p.x}" y="${p.y}" width="${BOX_W}" height="${BOX_H}" rx="8" fill="${c.bg}" stroke="${c.border}" stroke-width="${sw}"/>\n`;
  svg += `    <text x="${p.x + BOX_W/2}" y="${p.y + 22}" text-anchor="middle" font-size="13" font-weight="700" fill="${c.text}">${escape(nombre)}</text>\n`;
  const cf = (mod.colecciones_firestore || []).slice(0, 2).join(', ');
  if (cf) {
    svg += `    <text x="${p.x + BOX_W/2}" y="${p.y + 40}" text-anchor="middle" font-size="9" fill="${c.text}" opacity="0.7">${escape(cf)}</text>\n`;
  }
  svg += `  </g>\n`;
}

// Leyenda.
const lgY = H - 50;
svg += `  <g transform="translate(${PAD_X}, ${lgY})">\n`;
svg += `    <text font-size="11" font-weight="600" fill="#475569">Leyenda:</text>\n`;
svg += `    <line x1="0" y1="20" x2="38" y2="20" stroke="#cbd5e1" stroke-width="1.1" marker-end="url(#arrow)" stroke-dasharray="4,3"/>\n`;
svg += `    <text x="46" y="24" font-size="11" fill="#475569">depende de</text>\n`;
svg += `    <rect x="160" y="12" width="16" height="16" rx="3" fill="#fff" stroke="#dc2626" stroke-width="2.5"/>\n`;
svg += `    <text x="182" y="24" font-size="11" fill="#475569">criticidad alta (borde grueso)</text>\n`;
svg += `  </g>\n`;

svg += `</svg>\n`;

if (!fs.existsSync(path.dirname(OUT_PATH))) fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, svg);
console.log('✓ Generado: docs/mapa/mapa.svg');
