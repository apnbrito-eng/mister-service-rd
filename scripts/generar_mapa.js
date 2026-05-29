/**
 * scripts/generar_mapa.js (ESM — el repo usa "type": "module")
 *
 * Lee `docs/mapa/MAPA_MENTAL.yaml` (fuente única de verdad mantenida por el
 * agente `cartografo` y editable a mano por Jorge) y produce 3 salidas:
 *
 *   - docs/mapa/mapa.mmd            (Mermaid — se renderiza a SVG/PNG)
 *   - docs/mapa/explorador.html     (visor interactivo — abrir con doble clic)
 *   - docs/mapa/PROMPT_SISTEMA.md   (contexto en lenguaje natural para agentes)
 *
 * Además guarda una copia versionada del YAML en `docs/mapa/historico/`.
 *
 * Validaciones (si alguna falla → NO pisa las salidas anteriores, exit 1):
 *   1. Toda dependencia apunta a un módulo declarado.
 *   2. No hay dependencias circulares (A→B→A).
 *   3. Toda integración externa declarada en un módulo existe en la sección
 *      `integraciones_externas`.
 *   4. Todo módulo declara área válida.
 *
 * NOTA: la validación "toda colección existe en el código" la hace el agente
 * `cartografo` con grep en src/ y api/, NO este script (que solo conoce YAML).
 *
 * Dependencias: `js-yaml`. Comando: `npm run mapa`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(__dirname, '..');
const YAML_PATH = path.join(RAIZ, 'docs/mapa/MAPA_MENTAL.yaml');
const OUT_DIR = path.join(RAIZ, 'docs/mapa');
const HISTORICO_DIR = path.join(OUT_DIR, 'historico');

// --- 0. Cargar YAML --------------------------------------------------------

if (!fs.existsSync(YAML_PATH)) {
  console.error(`✗ No existe ${YAML_PATH}`);
  process.exit(1);
}

let mapa;
try {
  mapa = yaml.load(fs.readFileSync(YAML_PATH, 'utf8'));
} catch (err) {
  console.error(`✗ YAML inválido: ${err.message}`);
  process.exit(1);
}

if (!mapa || !mapa.modulos || !mapa.areas) {
  console.error('✗ El YAML no tiene secciones `modulos` y `areas`.');
  process.exit(1);
}

// --- 1. Validaciones --------------------------------------------------------

function validar(mapa) {
  const errores = [];
  const nombresModulos = Object.keys(mapa.modulos);
  const nombresAreas = Object.keys(mapa.areas);
  const integraciones = Object.keys(mapa.integraciones_externas || {});

  for (const [nombre, mod] of Object.entries(mapa.modulos)) {
    if (!mod.area) {
      errores.push(`Módulo "${nombre}" no declara área.`);
    } else if (!nombresAreas.includes(mod.area)) {
      errores.push(`Módulo "${nombre}" declara área "${mod.area}" que no existe en \`areas\`.`);
    }
    for (const dep of mod.depende_de || []) {
      if (!nombresModulos.includes(dep)) {
        errores.push(`Módulo "${nombre}" depende de "${dep}" que no existe.`);
      }
    }
    for (const exp of mod.expone_a || []) {
      if (!nombresModulos.includes(exp)) {
        errores.push(`Módulo "${nombre}" expone a "${exp}" que no existe.`);
      }
    }
    for (const integ of mod.integraciones_externas || []) {
      if (!integraciones.includes(integ)) {
        errores.push(`Módulo "${nombre}" usa integración "${integ}" no declarada en \`integraciones_externas\`.`);
      }
    }
  }

  // Detección de ciclos (DFS).
  function tieneCiclo(nodo, visitando, visitado) {
    visitando.add(nodo);
    const mod = mapa.modulos[nodo];
    for (const dep of (mod?.depende_de || [])) {
      if (visitando.has(dep)) {
        errores.push(`Dependencia circular detectada: ${nodo} → ${dep} → ... → ${nodo}`);
        return true;
      }
      if (!visitado.has(dep) && tieneCiclo(dep, visitando, visitado)) {
        return true;
      }
    }
    visitando.delete(nodo);
    visitado.add(nodo);
    return false;
  }
  const visitado = new Set();
  for (const n of nombresModulos) {
    if (!visitado.has(n)) tieneCiclo(n, new Set(), visitado);
  }

  return errores;
}

const errores = validar(mapa);
if (errores.length) {
  console.error('✗ El mapa tiene errores — NO se regeneran las salidas:');
  errores.forEach((e) => console.error('  - ' + e));
  process.exit(1);
}

// --- 2. Versionado del YAML -------------------------------------------------

if (!fs.existsSync(HISTORICO_DIR)) fs.mkdirSync(HISTORICO_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
const copiaPath = path.join(HISTORICO_DIR, `MAPA_MENTAL.${stamp}.yaml`);
if (!fs.existsSync(copiaPath)) {
  fs.copyFileSync(YAML_PATH, copiaPath);
}

// --- 3. Generar Mermaid -----------------------------------------------------

function generarMermaid(mapa) {
  let out = 'graph LR\n';
  out += '  %% Mapa generado automáticamente desde docs/mapa/MAPA_MENTAL.yaml\n';
  out += '  %% NO editar a mano. Editá el YAML y corré `npm run mapa`.\n\n';

  for (const [areaNombre] of Object.entries(mapa.areas)) {
    const modulosDeArea = Object.entries(mapa.modulos).filter(([, m]) => m.area === areaNombre);
    if (modulosDeArea.length === 0) continue;
    // Prefijo `area_` para que el id del subgraph nunca colisione con el id
    // de un módulo (caso: área "clientes" + módulo "clientes" → Mermaid 11.x
    // tira "Syntax error in text"). El label visible no lleva el prefijo.
    out += `  subgraph area_${areaNombre}["${areaNombre.toUpperCase()}"]\n`;
    for (const [nombre, mod] of modulosDeArea) {
      const clase = mod.criticidad === 'alta' ? ':::critico' : '';
      out += `    ${nombre}["${nombre}"]${clase}\n`;
    }
    out += `  end\n\n`;
  }

  for (const [nombre, mod] of Object.entries(mapa.modulos)) {
    for (const dep of mod.depende_de || []) {
      out += `  ${nombre} --> ${dep}\n`;
    }
  }

  out += '\n  classDef critico stroke:#dc2626,stroke-width:3px\n';
  return out;
}

// --- 4. Generar PROMPT_SISTEMA.md -------------------------------------------

function generarPrompt(mapa) {
  const fecha = mapa.meta?.ultima_actualizacion || 'sin fecha';
  let p = `# Contexto del sistema — ${mapa.meta?.proyecto || 'Mister Service RD'}\n\n`;
  p += `_Generado automáticamente desde \`docs/mapa/MAPA_MENTAL.yaml\` — última actualización: ${fecha}._\n\n`;
  if (mapa.meta?.descripcion) p += `${mapa.meta.descripcion}\n\n`;
  p += `> **Para los demás agentes:** este es el mapa del sistema. Si vas a tocar un módulo, consultá la sección "Impacto de cambios" al final para saber qué otros módulos dependen de él.\n\n`;

  p += `## Áreas del sistema (${Object.keys(mapa.areas).length})\n\n`;
  for (const [nombre, area] of Object.entries(mapa.areas)) {
    p += `- **${nombre.toUpperCase()}**: ${area.descripcion || '—'}\n`;
  }

  p += `\n## Módulos (${Object.keys(mapa.modulos).length} total)\n\n`;
  for (const [nombre, mod] of Object.entries(mapa.modulos)) {
    p += `### ${nombre}\n`;
    p += `- **Área:** ${mod.area} · **Criticidad:** ${mod.criticidad || 'no declarada'}\n`;
    p += `- **Qué hace:** ${mod.descripcion || '—'}\n`;
    if (mod.responsable_humano) p += `- **Responsable humano:** ${mod.responsable_humano}\n`;
    if (mod.depende_de?.length) p += `- **Depende de:** ${mod.depende_de.join(', ')}\n`;
    if (mod.expone_a?.length) p += `- **Expone a:** ${mod.expone_a.join(', ')}\n`;
    if (mod.colecciones_firestore?.length) p += `- **Colecciones Firestore:** ${mod.colecciones_firestore.join(', ')}\n`;
    if (mod.rutas_api?.length) p += `- **Rutas API:** ${mod.rutas_api.join(', ')}\n`;
    if (mod.integraciones_externas?.length) p += `- **Integraciones externas:** ${mod.integraciones_externas.join(', ')}\n`;
    if (mod.notas) p += `- **Notas:** ${mod.notas}\n`;
    p += `\n`;
  }

  if (mapa.integraciones_externas && Object.keys(mapa.integraciones_externas).length) {
    p += `## Integraciones externas\n\n`;
    for (const [nombre, integ] of Object.entries(mapa.integraciones_externas)) {
      p += `- **${nombre}** (${integ.criticidad || 'criticidad no declarada'}): ${integ.descripcion || '—'}`;
      if (integ.notas) p += ` _${integ.notas}_`;
      p += `\n`;
    }
  }

  p += `\n## Impacto de cambios (si tocás X, revisá Y)\n\n`;
  const inverso = {};
  for (const [nombre, mod] of Object.entries(mapa.modulos)) {
    for (const dep of mod.depende_de || []) {
      inverso[dep] = inverso[dep] || [];
      inverso[dep].push(nombre);
    }
  }
  const ordenados = Object.entries(inverso).sort(([a], [b]) => a.localeCompare(b));
  for (const [mod, dependientes] of ordenados) {
    p += `- Si tocás **${mod}**, verificá: ${dependientes.join(', ')}\n`;
  }
  if (ordenados.length === 0) p += `_Sin dependencias declaradas._\n`;

  return p;
}

// --- 5. Generar HTML interactivo --------------------------------------------

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function generarHTML(mapa) {
  const fecha = mapa.meta?.ultima_actualizacion || 'sin fecha';
  const mermaid = generarMermaid(mapa);
  const tarjetas = Object.entries(mapa.modulos).map(([nombre, mod]) => {
    const clase = mod.criticidad === 'alta' ? 'alta' : mod.criticidad === 'media' ? 'media' : 'baja';
    return `
      <div class="modulo ${clase}" data-area="${escapeHtml(mod.area)}">
        <div class="nombre">${escapeHtml(nombre)} <span class="area">[${escapeHtml(mod.area)}]</span></div>
        <div class="desc">${escapeHtml(mod.descripcion || '')}</div>
        <div class="meta">
          ${mod.depende_de?.length ? `<div><strong>Depende de:</strong> ${mod.depende_de.map(escapeHtml).join(', ')}</div>` : ''}
          ${mod.expone_a?.length ? `<div><strong>Expone a:</strong> ${mod.expone_a.map(escapeHtml).join(', ')}</div>` : ''}
          ${mod.colecciones_firestore?.length ? `<div><strong>Colecciones:</strong> ${mod.colecciones_firestore.map(escapeHtml).join(', ')}</div>` : ''}
          ${mod.integraciones_externas?.length ? `<div><strong>Integraciones:</strong> ${mod.integraciones_externas.map(escapeHtml).join(', ')}</div>` : ''}
          ${mod.notas ? `<div class="notas"><em>${escapeHtml(mod.notas)}</em></div>` : ''}
        </div>
      </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Mapa Mental — ${escapeHtml(mapa.meta?.proyecto || 'Mister Service RD')}</title>
  <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
  <style>
    :root { --bg: #fafafa; --card: #fff; --text: #0f172a; --muted: #64748b; --border: #e2e8f0; }
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 2rem; max-width: 1300px; margin: auto; background: var(--bg); color: var(--text); }
    h1 { margin-bottom: 0; }
    .fecha { color: var(--muted); font-size: 0.85em; margin-top: 0.25rem; }
    .mermaid { background: var(--card); padding: 1.5rem; border-radius: 10px; border: 1px solid var(--border); margin: 1.5rem 0; }
    h2 { margin-top: 2.5rem; }
    .filtros { margin: 1rem 0; }
    .filtros button { margin-right: 0.5rem; padding: 0.3rem 0.8rem; border: 1px solid var(--border); background: var(--card); border-radius: 6px; cursor: pointer; font-size: 0.85em; }
    .filtros button.activo { background: #0f172a; color: #fff; }
    .modulo { background: var(--card); border: 1px solid var(--border); padding: 1rem; margin: 0.5rem 0; border-radius: 8px; }
    .modulo.alta { border-left: 4px solid #dc2626; }
    .modulo.media { border-left: 4px solid #f59e0b; }
    .modulo.baja { border-left: 4px solid #10b981; }
    .modulo.hidden { display: none; }
    .nombre { font-weight: 700; font-size: 1.05em; }
    .nombre .area { font-weight: 400; color: var(--muted); font-size: 0.85em; }
    .desc { color: #475569; margin: 0.4rem 0; font-size: 0.95em; }
    .meta { font-size: 0.85em; color: #555; line-height: 1.7; }
    .notas { margin-top: 0.5rem; color: var(--muted); }
    footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid var(--border); color: var(--muted); font-size: 0.85em; }
  </style>
</head>
<body>
  <h1>Mapa Mental — ${escapeHtml(mapa.meta?.proyecto || 'Mister Service RD')}</h1>
  <div class="fecha">Última actualización: ${escapeHtml(fecha)} · ${Object.keys(mapa.modulos).length} módulos · ${Object.keys(mapa.areas).length} áreas</div>

  <h2>Diagrama</h2>
  <div class="mermaid">
${mermaid}
  </div>

  <h2>Módulos</h2>
  <div class="filtros">
    <button data-filtro="todos" class="activo">Todos</button>
    ${Object.keys(mapa.areas).map((a) => `<button data-filtro="${escapeHtml(a)}">${escapeHtml(a)}</button>`).join('')}
  </div>
  <div id="lista">${tarjetas}</div>

  <footer>
    Generado desde <code>docs/mapa/MAPA_MENTAL.yaml</code>. NO editar este HTML a mano — editá el YAML y corré <code>npm run mapa</code>.
  </footer>

  <script>
    mermaid.initialize({ startOnLoad: true });
    document.querySelectorAll('.filtros button').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filtros button').forEach((b) => b.classList.remove('activo'));
        btn.classList.add('activo');
        const f = btn.dataset.filtro;
        document.querySelectorAll('.modulo').forEach((m) => {
          m.classList.toggle('hidden', f !== 'todos' && m.dataset.area !== f);
        });
      });
    });
  </script>
</body>
</html>`;
}

// --- 6. Escribir salidas ----------------------------------------------------

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

fs.writeFileSync(path.join(OUT_DIR, 'mapa.mmd'), generarMermaid(mapa));
fs.writeFileSync(path.join(OUT_DIR, 'explorador.html'), generarHTML(mapa));
fs.writeFileSync(path.join(OUT_DIR, 'PROMPT_SISTEMA.md'), generarPrompt(mapa));

console.log('✓ Mapa regenerado:');
console.log('  - docs/mapa/mapa.mmd');
console.log('  - docs/mapa/explorador.html');
console.log('  - docs/mapa/PROMPT_SISTEMA.md');
console.log(`  - docs/mapa/historico/MAPA_MENTAL.${stamp}.yaml (copia versionada)`);
