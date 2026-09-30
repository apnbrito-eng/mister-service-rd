# Candidato integral — control de entrega

## Alcance
Jorge autorizó continuar el trabajo conjunto de Codex, Claude y Claude Code hasta preparar la versión final. Samsung conectado para pruebas. Esta hoja distingue implementación local, pruebas y disponibilidad en producción.

## Evidencia acumulada de esta ronda
- Suite general local más reciente: 755/755 pruebas en 140 archivos. Registro `/tmp/mister-suite-final-integral.log`. Posteriormente se corrigió la respuesta ante fallo del callback de cita (18 focales aprobadas) y se revisa una carrera al editar una cotización desvinculada.
- Web y API: `npm run build` aprobado; advertencia de tamaño de algunos paquetes. Registro `/tmp/mister-build-final-integral.log`.
- Firestore Emulator: 167/167 pruebas; las tres de Storage se omitieron en esa corrida. Registro `/tmp/mister-rules-final-integral.log`.
- Storage Emulator separado: 3/3 aprobadas. Registro `/tmp/mister-storage-candidata.log`.
- Piezas/taller y reactivación concurrente: 8/8 en emulador, incluyendo nuevas piezas durante la reactivación.
- Reglas nuevas de suplidores: 12/12 en emulador. No publicadas.
- Samsung detectado, aplicación oficial instalada 1.0.17/código18. Checkout nativo corresponde a ensayo; candidato oficial requiere copia aislada, identidad y firma verificadas.

## Revisión funcional
| Área | Implementación local | Condición restante |
|---|---|---|
| Salida IA, Atrás, búsqueda | Lote1 conservado | APK candidata y comprobación física |
| Nómina, comisiones, préstamos y avances | Cierre atómico, conciliación, cuotas y neto revisados | Prueba integral candidata, no operar nómina real |
| Caja, bancos, conduces | Fuente por pago, rangos, confirmación y trazabilidad | Compatibilidad servidor y revisión final |
| Estado de Resultado | Rango RD, comparación, nómina cerrada y cobertura | Último ajuste visual y repetición final |
| Métricas y feedback | Identidades, evaluaciones y datos incompletos visibles | Prueba final de navegación |
| Piezas y taller | Orden/cliente, avisos, fotos, descarte, reactivación guardada | Corrección lista histórica sin fecha y QA candidata |
| Suplidores | Directorio y preparación manual de mensaje | Regla servidor y configuración empresarial de plantilla/fotos |
| Mantenimiento y solo chequeo | Avisos internos, gestión y contacto | Validación final del conjunto |
| Calendarios y solicitudes | Claude Code corrige integración completa | Revisión final independiente y pruebas transaccionales |
| Personal, accesos y ponches | Navegación por ficha; UID legado; sin inferir ausencias | Recorridos finales |
| Marketing y conocimiento | Implementado y corregida atribución de caja/fechas/identidades | Configuración empresarial y recorrido externo |
| Cierre diario | Detalles y gastos; snapshot con versión | Revisión final de fechas RD |

## QA de interfaz con datos ficticios
En 390 px se observó: mantenimiento abre ruta del cliente y del Inbox; solo chequeo abre/cierra formulario de responsable/fecha/resultado/nota; suplidores muestra activos e inactivos y prepara mensaje sin datos de cliente; Personal conserva `personalId` en enlaces; Estado de Resultado diferencia caja/documentos y oculta resultado completo ante incidencias. Las escrituras y conexiones externas de estos ensayos están bloqueadas. Esto no sustituye prueba de permisos/servidor ni Samsung.

## Dependencias para publicar
1. Revisar y publicar de forma coordinada API/frontend/Firestore/Storage. P005 y P013 permanecen visibles hasta despliegue real; no se falsifican locks.
2. La huella del lock de Storage coincide con commit `808cc1ececd2425ff314f1837e6f772e3cc5fced`. Su cambio principal reemplaza subidas públicas directas por permisos firmados del servidor. Debe validarse la infraestructura real antes de cerrar la vía anterior.
3. No se encontró contenido que coincida con la huella del lock de Firestore entre 24 revisiones locales; no se afirma tener el diff exacto contra reglas actualmente desplegadas.
4. WhatsApp empresarial para iniciar consultas a suplidores necesita plantilla aprobada. Inbox ya permite adjuntar manualmente JPEG/PNG con vista previa cuando la ventana está abierta; conserva identificador en reintentos. No se envían mensajes ni se afirma activación externa. La foto de la pieza no se transfiere automáticamente desde el modal.
5. Candidato Android debe conservar `com.misterservicerd.app` y firma anterior. Nunca desinstalar ni borrar datos para resolver incompatibilidad.

## Estado
En trabajo. Este documento no certifica que el plan completo esté terminado ni publicado. La aprobación de un bloque no equivale a aprobación de todos los recorridos.

## Correcciones de la revisión final de Claude
- B2: pagos antiguos sin marca de verificación aparecen para conciliación; reparación de ID/fecha requiere motivo y mantiene el pago pendiente. Revisión y pruebas locales aprobadas.
- B3/B4/R1: identidad única de técnico, porcentaje configurado, devengo transaccional, conduce manual atómico y costos de cotización aceptada. 13 pruebas de emulador más 13 unitarias/UI informadas por constructor y revisión independiente favorable.
- Duplicados históricos: bloquean solamente al empleado afectado. Administración puede elegir el registro válido con motivo/auditoría; ningún registro liquidado se reescribe. 8 pruebas específicas aprobadas.
- Citas: propietario y token de intento, relectura de cita vigente y validación de orden vinculada. 2 pruebas con reglas reales en emulador y 18 focales. Fallo de postprocesado conserva formulario y no anuncia confirmación completa.
- B1/R2/R3: vínculos de cotización y cierre concurrente corregidos, fechas RD y piezas históricas visibles; 8 pruebas en emulador. Revisión independiente encontró una carrera adicional de formulario desactualizado, asignada para corregir antes del cierre.
- Android: preflight oficial 1.0.18/código19 aprobado; certificado coincide con la aplicación instalada. Compilación e instalación son pasos distintos; todavía no se certifica prueba física.
