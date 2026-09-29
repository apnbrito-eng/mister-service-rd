// Rollup serializa true como !0 y false como !1. No confundirlos.
export const debugAppCheckActivo = /debugToken\s*:\s*(?:true\b|1\b|!\s*0\b)/i;
