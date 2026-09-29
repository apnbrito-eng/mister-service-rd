# Lote2 — fechas financieras verificables

## Alcance

`fechaCobro` conserva su significado heredado de fecha de devengo de comisión. No se cambia a fecha de pago ni se cambian fórmulas o porcentajes.

- `src/utils/fechaFinanciera.ts`: acepta Date, Timestamp y texto ISO inequívoco. Devuelve null para fecha ausente, nula, imposible, objeto defectuoso o texto ambiguo. No usa fecha actual como sustituto. Texto sin hora YYYY-MM-DD se interpreta como inicio de ese día dominicano (UTC−04:00), conservando mes y corte quincenal; otros textos ambiguos se rechazan.
- `src/pages/Comisiones.tsx`: elimina orderBy porque Firestore oculta documentos sin ese campo. Ordena después del parseo, muestra registros inválidos en sección conciliación, no los incluye en totales/períodos/CSV. Excluye comisiones anuladas. Listener restringido a roles admin/coordinación según rules, con error visible.
- `src/services/estadoResultado.service.ts`: excluye comisiones anuladas y sin fecha del total mensual. Devuelve detalle de las desconocidas para que la pantalla indique resultado incompleto. Preserva subtotal cero y último milisegundo del mes.
- `src/pages/EstadoResultado.tsx`: alerta con registros para revisar y acceso a Comisiones; CSV incluye contador de registros pendientes de conciliación.
- `src/services/nomina.service.ts`: generar nómina nueva aborta si existe comisión pendiente no anulada sin fecha válida. Informa ID y conciliación necesaria. No asigna estas comisiones a quincena alguna. Anuladas omitidas. Cierre atómico del lote1 preservado.

## Verificación y límites

Pruebas nuevas: fecha ausente/null/texto imposible/Date inválido/Timestamp/ISO/último milisegundo; P&L con subtotal0 y comisiones fuera de mes/anuladas/sin fecha; generación rechaza desconocidas y omite anuladas. Pruebas previas de pérdida bruta y asistencia permanecen verdes. Sin datos reales, reglas, deploy ni commits.

Bloquear generación por una comisión pendiente desconocida es deliberado: no se puede determinar su período sin conciliar. Liquidaciones ya generadas conservan comportamiento de devolver la existente; no se reconstruyen automáticamente ni se modifica su historia.

Las fechas de creación/aplicación de ajustes fuera de fechaCobro y otros reportes históricos no se migraron en este lote. Race de generación concurrente queda para lote independiente.

PRECHANGE respetado: P009/015/020/024/030/031; significado devengo confirmado28Sep; conserva pérdidas y bonosIncompletos; evita listener que oculta documentos sin fecha; sin nuevas reglas.

## Resultado final
21/21 pruebas dirigidas (incluye cierre atómico previo), TypeScript y lint dirigido pasan. Cazador P032 agregado y registrado: sin hits. `npm run check:regression` ejecuta sin errores runtime; mantiene dos bloqueos previos P005/P013 de despliegue de reglas, no modificados. Sin nuevos tipos globales ni cambios de parseOrden/parseFactura.
