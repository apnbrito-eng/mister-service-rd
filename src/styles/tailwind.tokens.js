/**
 * Fusionar dentro de theme.extend en tailwind.config.js (NO reemplazar primary/brand/accent existentes).
 *
 *   import { tokensRediseno } from './docs/diseno/handoff-codex-2026-10-01/codigo/tailwind.tokens.js'
 *   theme: { extend: { colors: { ...existentes, ...tokensRediseno.colors }, boxShadow: tokensRediseno.boxShadow } }
 *
 * O copiar los objetos a mano. Los valores leen las variables de tokens.css.
 */
export const tokensRediseno = {
  colors: {
    ms: {
      fondo: 'var(--ms-fondo)',
      superficie: 'var(--ms-superficie)',
      texto: 'var(--ms-texto)',
      'texto-2': 'var(--ms-texto-2)',
      micro: 'var(--ms-texto-micro)',
      borde: 'var(--ms-borde)',
      control: 'var(--ms-borde-control)',
      pista: 'var(--ms-pista)',
      accion: 'var(--ms-accion)',
      'accion-50': 'var(--ms-accion-50)',
      'accion-100': 'var(--ms-accion-100)',
      marca: 'var(--ms-marca)',
      exito: 'var(--ms-exito)',
      advertencia: 'var(--ms-advertencia)',
      peligro: 'var(--ms-peligro)',
      garantia: 'var(--ms-garantia)',
      standby: 'var(--ms-standby)',
    },
    paso: {
      0: 'var(--ms-paso-0)',
      1: 'var(--ms-paso-1)',
      2: 'var(--ms-paso-2)',
      3: 'var(--ms-paso-3)',
      4: 'var(--ms-paso-4)',
      5: 'var(--ms-paso-5)',
      6: 'var(--ms-paso-6)',
    },
  },
  boxShadow: {
    elevacion: 'var(--ms-elevacion)',
  },
};
