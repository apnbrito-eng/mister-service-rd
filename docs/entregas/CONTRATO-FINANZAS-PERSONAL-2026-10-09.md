# Contrato puro de finanzas privadas de Personal

💡 Propuesta implementada como utilidad aislada, aún sin consumidores: `src/utils/contratoFinanzasPersonal.ts`. Contrato versión 1 con personalId y uid canónico explícitos; campos opcionales sueldoBase y comisionPorcentaje. Se usa exactamente el nombre sueldoBase existente, no salarioBase ni otra fuente financiera nueva.

✅ Verificado: crear valida números reales finitos, sueldo no negativo y comisión entre 0 y 100. No convierte strings, null, undefined explícito ni valores vacíos en cero. Campo ausente permanece ausente; cero explícito es válido. `exigirValorFinanzasPersonal` bloquea cálculos si falta la configuración solicitada. No defaults por nivel ni porcentaje implícito.

✅ Verificado: leer exige versión e identidad exactas del documento privado frente al personalId/uid suministrados; rechaza ausencia, legacy sin versión e identidades incompatibles. No busca por correo ni usa campos públicos como fallback. La utilidad valida estructura, no verifica Firebase Auth ni existencia de usuarios: el futuro endpoint debe obtener y comprobar esas identidades canónicas antes de llamarla.

✅ Verificado: particionar devuelve copia pública sin sueldoBase/comisionPorcentaje y contrato financiero privado separado, sin mutar el original. Sólo separa campos financieros; debe componerse con la separación existente de domicilios/documentos de personal.service.ts. No sustituye ese servicio ni ofrece protección por sí sola.

✅ Verificado: `npx tsx --test tests/unit/contratoFinanzasPersonal.test.ts`: 4/4 casos pasan (partición sin mutación, ausencia/cero, validación, identidad/legacy). ESLint utilidad y test: 0 errores/advertencias.

⏳ Pendiente, dueño coordinador: integración simultánea del servicio/ficha, consumidores de nómina/Dashboard/comisiones y API autorizada, con pruebas de permisos y fallos de lectura. Para contratos nuevos, lectura financiera ausente/error debe bloquear cálculo. Fichas antiguas requieren compatibilidad administrativa explícita, fuera de este contrato, y posterior migración revisada.

❓ Sin resolver aún: los campos financieros existentes siguen en personal legible por staff. Este lote no modifica rules, consumidores, datos, pagos ni permisos; no ejecuta migraciones. No se debe presentar como cierre de privacidad ni cambio aplicado a producción. Sin commit/despliegue.
