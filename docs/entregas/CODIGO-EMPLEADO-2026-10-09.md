# Código administrativo de empleado — 09/10/2026

Objetivo: completar el campo solicitado por Jorge en la ficha única Personal. Responsable: Codex. Código manual opcional `codigoEmpleado`, independiente de UID Auth, alias de acceso y cédula. Sin generación ni modificación masiva, sin creación de cuentas ni afirmación de unicidad global.

✅ Implementado en datos personales, tarjeta del listado y cabecera de la ficha. Vacío muestra «Sin asignar»; formulario admite hasta30 letras/números/puntos/guiones/guiones bajos y conserva mayúsculas originales. Validación compartida también en servicio. La autorización existente del módulo se mantiene.

✅ Persistencia mediante `guardarFichaPersonal` y batch existente: campo almacenado en `personal_privado/{id}` por merge, evita exponerlo al listado operativo general de todo el staff. El listado administrativo ya combina documento público y privado. Vaciarlo usa deleteField sin borrar otras propiedades ni documentos. No se toca sueldo/comisión/usuario.

✅ Cinco pruebas dirigidas pasan: legacy vacío, normalización, formato inválido, escritura privada/publica en un batch, limpieza solo del campo e invalidación antes de commit. ESLint scope pasa. Typecheck global `npx tsc --noEmit --pretty false` pasa.

Prueba: `npx vitest run --config vitest.integraciones.config.ts tests/integraciones/codigo-empleado.test.ts`. Servicio Firebase mockeado: no escritura real ni despliegue. Pendiente prueba visual de ficha con código existente/guardar/limpiar dentro QA posterior autorizado.

Archivos: src/pages/Personal.tsx, src/services/personal.service.ts, src/utils/codigoEmpleado.ts, tests/integraciones/codigo-empleado.test.ts; root incorpora campo tipado en src/types/index.ts.

— Codex
