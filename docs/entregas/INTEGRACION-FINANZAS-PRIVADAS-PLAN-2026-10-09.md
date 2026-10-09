# Integración de finanzas privadas de Personal — plan 09/10/2026

Responsable: Codex (review_centro). Revisión estática del código actual; este documento no implementa consumidores, reglas, migración ni pagos. Las líneas se citan como orientación de esta revisión y deben releerse antes de editar.

## Estado comprobado

✅ `src/services/personal.service.ts:70`: guardarFichaPersonal reparte campos públicos/privados y guarda ambos con un batch merge. Su lista privada excluye actualmente sueldoBase/comisionPorcentaje; el propio comentario reconoce la deuda. Reutilizar esta atomicidad y conservar los datos privados ajenos al contrato.

✅ `firestore.rules:515–523`: personal_privado permite lectura/escritura a administrador/coordinadora; personal permite lectura a staff y escritura a admin/coordinadora. Ocultar pestañas no protege campos financieros heredados. Son gates por rol, no por personalVer/personalModificar individuales.

✅ `src/utils/contratoFinanzasPersonal.ts`: contrato preparatorio versión1, identidad personalId+uid exacta, cero válido, dato ausente distinto de cero, sin fallback público; partición de dos campos. No tiene consumidores productivos. Sus cuatro pruebas pasan; no autentica ni consulta usuarios canónicos.

✅ `src/types/index.ts:1671`: Personal.uid es opcional. La ficha admite empleados sin cuenta y usa también sentinel `existing` en algunos flujos (`Personal.tsx:1393`). No convertir personalId, correo o ese sentinel en UID. El contrato preparatorio necesita una política explícita para empleados sin cuenta antes de universalizarlo.

## Consumidores y adaptación necesaria

| Consumidor | Lectura actual | Cambio coordinado |
| --- | --- | --- |
| Personal/guardarFichaPersonal | sueldo y porcentaje públicos; formulario privado cargado por separado | DTO financiero separado y escritura versionada atómica. Error de lectura privada bloquea edición financiera, no sobrescribe con blancos/defaults. |
| nomina.service.ts:85,167–168 | lista pública; falta sueldo se convierte a0 y se divide por2 | Resolver contrato por empleado antes de generar liquidación. Para versión nueva, sueldo ausente/inválido bloquea generación; cero explícito es válido. Conservar períodos y snapshots ya generados. |
| Dashboard.tsx:240,515–546 | listener público; suma sueldo para estimación admin/coordinadora | Fuente privada únicamente para esos roles, estados carga/error y estimación incompleta explícitos. No representar fallo como nómina0 ni cargar privados para staff. |
| utils/comisiones.ts:132–159 | porcentaje público o defaults senior10/junior8/fallback10; identidad docId/uid se resuelve sin ambigüedad | Nueva versión exige porcentaje privado; sin fallback por nivel. Legacy administrativo conserva política existente hasta migración. Resolver UID canónico, no inventarlo. |
| utils/comisiones.ts:397,615 | relectura de personal dentro de transacción comprueba porcentaje actual | Releer también contrato privado dentro de la MISMA transacción, antes de escribir; comparar identidad/versión/porcentaje. Una lectura previa fuera de transacción no basta. No cambiar snapshots de comisión existente. |
| TecnicoVista.tsx:240 | porcentaje de comisiones ya generadas | Mantener lectura propia del snapshot autorizado; no abrir ficha privada del técnico ni recalcular con porcentaje actual. |
| api/_lib/iaTools.ts:971–995 | query_personal lee sueldo público para admin/coordinadora | Mantener gate personalVer efectivo + roles actuales; cargar fuente privada solo en rama autorizada. Para versión nueva ausente/error no usar público ni presentar sueldo0. |
| api/_lib/iaTools.ts:1746 | sueldo de empleados en liquidaciones históricas | Es snapshot de nómina, no ficha actual: conservar reglas/roles y no reinterpretar historia con contrato nuevo. |

✅ Las herramientas IA ya aplican identidad usuarios/{uid}, activo/eliminado, revocación y permisos efectivos existentes. No reutilizar personalVer como permiso nuevo de nómina: nómina/comisiones conservan gates actuales por rol. Los formularios deben usar sus permisos existentes; las Rules aún son más amplias por rol y su endurecimiento debe revisarse como cambio separado.

## Fases implementables sin migrar esta noche

1. **Resolver puro/DTO y pruebas.** Distinguir explícitamente legacy administrativo de contrato nuevo. Definir marcador público NO financiero de adopción (versión) para que un contrato privado borrado o inaccesible no cause regreso al sueldo público. Ausencia de privado por sí sola no prueba legacy. No elegir todavía una colección nueva: personal_privado ya tiene gate apropiado por rol. Validar que UID corresponde al usuario canónico y vínculo único a Personal en servidor.
2. **Adaptadores en código sin activar escritura nueva.** Preparar resolvedor administrativo, pruebas de nómina/Dashboard/IA y relecturas transaccionales. Ningún adaptador nuevo se activa hasta que TODOS los consumidores del contrato estén listos. Legacy fallback solo en contexto administrativo autorizado y sin marcador de adopción; nunca en cliente staff ni al fallar red/permiso/versionado nuevo.
3. **Alta/adopción explícita individual, siguiente lote.** Guardar contrato privado y marcador de versión en mismo batch/transacción, preservar merge de domicilio/documentos y tratar borrado de campo de forma explícita. Los sentinels deleteField actuales no son números: no pasarlos al validador como si fueran valores. Esta fase requiere resolver empleado sin UID y comprobar gates negativos antes de activación. No quitar campos legacy masivamente ni crear cuentas automáticamente.
4. **Migración revisada posterior.** Respaldo, inventario identidad/duplicados, simulación, verificación de consumidores y retiro controlado de campos financieros públicos. Mientras existan esos campos en documentos staff-readable, privacidad completa sigue pendiente, aunque las altas futuras se protejan. No ejecutar esta fase bajo el alcance nocturno actual.

## Decisiones puntuales pendientes

⏳ Jorge: empleados sin cuenta también requieren sueldo; elegir si contrato admite identidad laboral sin UID (con restricción explícita de atribución de comisiones) o si edición financiera nueva espera vinculación canónica. El contrato actual obliga ambas identidades; no bloquear nómina de toda la empresa silenciosamente ni crear usuarios para satisfacerlo.

⏳ Codex/Jorge: aprobar alcance y momento de migración/retirada de campos públicos con respaldo. Esto es distinto de programar adaptadores. No necesita una fórmula salarial nueva ni cambiar porcentajes/bonos existentes.

⏳ Codex: auditar avances/prestamos_empleados antes de afirmar privacidad laboral global: Rules actuales permiten lectura a staff (`firestore.rules:566–585`). Separar esa deuda de este contrato de dos campos; no inventar permisos adicionales ni ampliar lecturas propias.

## Pruebas mínimas del siguiente lote

Alta versionada sin dinero público; merge conserva privados; cero explícito vs ausente; privado eliminado/carga fallida no cae a legacy; UID ausente/sentinel/duplicado/usuario canónico inexistente; legacy administrativo compatible; staff sin lectura privada; nómina bloqueada si configuración nueva incompleta; carrera porcentaje durante transacción; comisiones históricas intactas; Dashboard sin falso0; IA sin sueldo a staff. Ejecutar en emulador antes de cualquier escritura real.

— Codex
