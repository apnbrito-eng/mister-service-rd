import js from '@eslint/js';
import ts from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

export default ts.config(
  // SPRINT-FIX-LINT-RUIDO (2026-09-09) — auditoría hallazgo T-2.
  //
  // `dist-lazy` y `.claude/worktrees` están en `.gitignore` pero siguen en
  // disco, y ESLint entraba a lintear JavaScript minificado: `npm run lint`
  // devolvía 10.905 problemas, de los cuales 10.847 eran de bundles
  // compilados (7.346 `no-unused-expressions` + 2.711 `no-undef`). Sobre
  // `src` el total real son 25. El linter era tan ruidoso que nadie lo
  // miraba — de ahí las 12 directivas `eslint-disable` ya muertas que
  // encontró la auditoría.
  //
  // `api` sigue ignorado acá a propósito (el pre-commit usa
  // `--no-warn-ignored` contando con eso), pero YA NO está sin verificar:
  // `tsconfig.api.json` + `npm run typecheck:api` lo compilan en strict.
  { ignores: ['dist', 'dist-lazy', 'node_modules', 'public', '.vercel', '.claude', 'api'] },
  js.configs.recommended,
  ...ts.configs.recommended,
  // SPRINT-FIX-LINT-RUIDO (2026-09-09): scripts Node sueltos (`diagnose-fix.js`,
  // `scripts/*.js`) no declaraban los globals de Node, así que `no-undef`
  // marcaba `process`, `require`, `console`, `__dirname`... 95 errores que
  // quedaron a la vista al dejar de lintear los bundles minificados.
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      // Scripts CommonJS de diagnóstico/generación en la raíz y en `scripts/`.
      // No son parte del bundle; `require()` es correcto ahí.
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'react/react-in-jsx-scope': 'off',
      // TypeScript ya resuelve identificadores no definidos; `no-undef` sobre
      // .ts/.tsx sólo produce falsos positivos con tipos globales.
      'no-undef': 'off',
    },
  },
);
