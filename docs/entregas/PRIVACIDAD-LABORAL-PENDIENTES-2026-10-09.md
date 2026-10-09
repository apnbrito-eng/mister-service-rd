# Privacidad laboral pendiente — auditoría 09/10/2026

✅ Auditoría read-only agente carteras: personal/{id} sigue permitido a staff y contiene sueldoBase/comisionPorcentaje. Ocultar campos UI no protege documentos. Domicilio actual sí utiliza personal_privado/{id} restringido admin/coordinación: ubicacionCasa {lat?,lng?,enlace?} y direccion.

Consumidores por revisar conjuntamente: nomina.service.ts sueldo/2, Dashboard suma sueldos activos, utils/comisiones.ts porcentaje/fallback nivel, TecnicoVista porcentaje de comisiones generadas propias, api/_lib/iaTools.ts datos nómina. Avances y prestamos_empleados también requieren auditoría de lectura.

💡 Plan técnico pendiente, no implementado: nuevo contrato privado financiero para fichas nuevas; guardarFichaPersonal y consumidores coordinados; API administrativa para porcentaje con identidad inequívoca; error/falta privada bloquea cálculo sin defaults inventados; legacy sólo server administrativo hasta migración revisada. Mantener porcentaje congelado por trabajo y lecturas propias de comisiones generadas.

⏳ Cierre completo requiere retirar campos financieros de documentos públicos existentes tras preservar respaldo y migración revisada. No ejecutar borrados ni migraciones ahora: restricción de trabajo nocturno. No afirmar privacidad laboral completa.

Pruebas: alta nueva sin finanzas públicas; fallback administrativo; error privado fail-closed; identidad ambigua; no retroactividad. No cambia fórmula financiera ni escenarios abiertos.

⏳ Auditoría específica autorización iaTools en curso — carteras/Codex. No afirmar fuga por IA hasta rastrear gates reales.
