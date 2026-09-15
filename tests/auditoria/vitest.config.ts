// Diagnóstico de brechas conocidas: independiente de la suite de integración.
// Sus fallos reproducen problemas aún no corregidos; no indican regresiones nuevas.
export default { test: { include: ['tests/auditoria/**/*.test.ts'], environment: 'node' } };
