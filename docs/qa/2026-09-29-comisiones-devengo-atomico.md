# Comisiones B3/B4/R1 — cierre y conduce manual

## Cambios

- Identidad resuelta por documento Personal y consulta UID, con unión por docID. Ninguna coincidencia por nombre. Ausencia/ambigüedad bloquean y el cierre conserva el aviso existente de comisión no registrada. El porcentaje explícito40% se respeta aunque uid≠docID.
- Se conservan defaults históricos de nivel (senior/junior/fallback) únicamente para persona existente sin porcentaje; no se inventan nuevos porcentajes ni se cambia la fórmula de cierre.
- Devengo al trabajo en `comisiones/orden_{ordenId}` mediante transacción que relee orden, persona, fuentes de costo y comisiones existentes. Dos usuarios convergen. Estado real no terminado, cambio de precio/asignación o datos incoherentes bloquean.
- Cotización aporta costo sólo si aceptada. Conduce activo vinculado tiene prioridad; anulado/solo chequeo se excluyen.
- Registros legacy existentes se conservan sin recalcular liquidación, fecha ni ajustes de garantía. Emitir conduce de orden sólo refleja monto vigente con ajuste firmado, excluyendo anuladas. Si falta devengo, devuelve revisión pendiente; no calcula otra fórmula en facturación. Varios registros legítimos existentes se reflejan; conciliación de duplicados legacy en nómina corresponde al bloque paralelo.
- Caso antiguo con múltiples técnicos en ítems y sin devengo requiere revisión explícita. No se infiere un reparto nuevo que altere la fórmula de cierre del técnico asignado.
- Conduce manual mantiene el cálculo proporcional por ítems. UID/docID de la misma persona se agrupan. IDs canónicos por factura+docPersonal. Una transacción crea conduce, todas las comisiones y denormalización; no queda comisión pagable huérfana si falla la factura o un devengo.
- Modal manual conserva ID/número/payload entre timeout y reintento mientras siga abierto, con guard síncrono ante doble submit. Reintentar no toma ediciones posteriores; el mensaje lo explica. Cerrar el formulario descarta la intención local. No es una cola persistente de recuperación tras reiniciar el navegador.

## Verificación

13 pruebas en emulador Firestore local8080 proyecto `demo-comisiones-devengo`: dos usuarios,40%, UID/doc, ausentes/ambigüedad, defaults, aprobación de cotización, cierre stale, legacy/garantía, emisión sin devengo, reparto manual, atomicidad y rechazo de escritura. Reglas ficticias de ensayo, no certifican permisos de producción.

13 pruebas unitarias/UI/cazador en cuatro archivos: fórmula previa de cierre/garantía/base, intención estable ante doble clic y respuesta perdida, P041. TypeScript y lint dirigidos ejecutados. P041 registrado en scripts/invariantes/run-all.ts y docs/PATRONES_REGRESION.md. P021 excepción local justificada porque denormalización ahora ocurre dentro del helper atómico.

Comando emulador requiere configuración local con Firestore8080 y ningún proyecto real. La suite exige FIRESTORE_EMULATOR_HOST exacto127.0.0.1:8080 antes de operar. No usa datos del Samsung, producción ni credenciales externas.

## Límites

La consulta de coincidencias UID y de documentos legacy se descubre antes de la transacción del SDK cliente; sus documentos se releen dentro. Todos los escritores nuevos usan IDs canónicos. Apps antiguas que sigan escribiendo IDs aleatorios requieren despliegue coordinado; esta corrección no migra ni elimina duplicados históricos y no garantiza unicidad frente a código antiguo aún activo. Revisión de duplicados en nómina evita pagarlos hasta conciliación en el bloque paralelo.

Sin Git, despliegue de reglas/código o datos reales. El hash de introducción exacto del patrón no fue investigado; registro identifica la base auditada y se completará con el commit de integración.
