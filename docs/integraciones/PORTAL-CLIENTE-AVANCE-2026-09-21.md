# Primera etapa: portal, garantías y evaluación

Implementación local en la copia de trabajo CRM. No desplegada, no WhatsApp real enviado, no datos reales modificados. La app Android/iPhone no está construida aún. Jorge confirmó que se usan ambas plataformas.

## Cambios

- Garantía: consulta y reclamo comparten vigencia; fechas faltantes/corruptas solicitan revisión. Transacción conjunta para factura, solicitud pendiente y auditoría. Un ID por factura conserva la política existente de un reclamo; posteriores ciclos/reaperturas requieren diseño explícito, no un nuevo clic accidental. Revalida token dentro de la transacción. Secretaría coordina el agendamiento.
- Portal: envío usa API oficial existente; resultado distingue cola/aceptación, sin afirmar entrega. Retiene identificador para reintentos dentro del componente. Un fallo de metadatos posterior a aceptación no invita a reenviar. Si la ventana está cerrada, dirige a plantilla desde bandeja; no crea ni aprueba plantillas Meta.
- Evaluación: cuatro categorías 1–5 y comentario opcional, campo evaluacionServicio versionado. Conserva NPS anterior; transacciones impiden sobrescribir respuestas antiguas/nuevas. No calcula un NPS ficticio a partir de estrellas. Pendiente integrar estas nuevas dimensiones en informes de oficina.
- Se retiran fragmentos de tokens de registros de portal, reprogramación, garantías y feedback.

## Validación

- Suite de integración: 152 pruebas pasan.
- Compilación frontend/API y Vite pasan; quedan advertencias de tamaño de paquetes.
- Pruebas dedicadas contra emulador demo-mister-ensayo: concurrencia, fallo atómico, vigencia, proyección pública y evaluación; ver resultado registrado en notas de continuidad.
- Comprobadores de regresión: dos alertas preexistentes de reglas Firestore/Storage locales distintas del último despliegue registrado. No se publicó ni se falseó el registro para eliminarlas.
- Falta revisión visual de este bloque y prueba de API WhatsApp con número de ensayo autorizado.

## Ejecutar prueba de almacenamiento aislado

Con el emulador Firestore en 127.0.0.1:8289:

```
FIRESTORE_EMULATOR_HOST=127.0.0.1:8289 npx vitest run --config vitest.garantia-ensayo.config.ts
```

La prueba exige explícitamente ese host y usa proyecto demo. Crea documentos propios con prefijo temporal y los elimina; no reutiliza clientes existentes. Los límites de espera son mayores que los unitarios por las operaciones reales del emulador.

## Antes del siguiente bloque

- Conciliación global de repositorios aún pendiente. El endpoint de garantía coincidía entre Escritorio y copia de trabajo al empezar; eso no significa que ambas copias estén conciliadas.
- Completar política unificada de expiración/revocación para todos los enlaces antiguos y rutas públicas; revisar App Check/rate limit, acceso a archivos y notas internas. No declarar portal auditado por completo.
- Migración de secretos a hashes y estrategia de enlaces existentes sin romper garantía vigente.
- Cobertura de garantía pública, envío conjunto con conduce y avisos de nuevas evaluaciones a oficina.
- App móvil: prueba nativa de cámara, GPS, notificaciones, cola sin conexión y revalidación tras reasignación; no habilitar técnico en WhatsApp sin control servidor por orden/destinatario.
- Vista actual de ensayo corre en otra carpeta temporal: no confundir código construido con lo que está abierto en el navegador.
