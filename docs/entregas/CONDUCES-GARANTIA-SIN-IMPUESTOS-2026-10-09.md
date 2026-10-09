# Conduces de garantía sin impuestos — 09/10/2026

Fuente: decisión de Jorge en 05 Decisiones/2026-10-07 Comisión técnica por trabajo.md: estos documentos mantienen desglose y total, sin impuestos. Alcance no equivale a exención fiscal de facturas normales.

Identidad de documento verificada: ProcesarFacturacionModal emite Conduce de Garantía post-cierre; FacturaCrearModal se titula Nuevo Conduce de Garantía y emite CG manual. El flag orden.esGarantia identifica revisita y no se usa para inferir tipo de documento.

Implementado para documentos NUEVOS emitidos por ambos flujos: subtotal igual al total existente, ITBIS porcentaje0 y monto0. Se conserva desglose de renglones y el total; no se resta un impuesto anterior al precio ya acordado ni se modifica el monto cobrado. Facturas normales conservan política fiscal existente. No hubo migración ni recálculo de documentos históricos.

La representación/impresión de Facturas usa snapshot persistido CG+origen+ITBIS0. Muestra Sin impuestos para documentos nuevos; los históricos con18% conservan subtotal/tasa/monto guardados. Impresión mantiene las líneas y factura.total, con leyenda sin impuestos solo cuando snapshot lo indica.

Archivos: src/utils/impuestosDocumento.ts, ProcesarFacturacionModal.tsx, FacturaCrearModal.tsx, Facturas.tsx, tests/unit/impuestosDocumento.test.ts.

Comisiones: NO se cambiaron. Modal post-cierre sigue reflejando devengos existentes; manual mantiene su lógica heredada independiente. La diferencia respecto a la futura comisión por trabajo está auditada como pendiente y esta entrega no certifica nómina.

Verificación:4 pruebas unitarias (nuevoCG0, facturanormal18/10, snapshot histórico intacto, valores inválidos); typecheck frontend y lint focal PASA. Regresión de invariantes ejecutada, resultado comunicado a root. No emisión Firestore real, impresión visual ni dispositivo físico. Sin commit/despliegue.
