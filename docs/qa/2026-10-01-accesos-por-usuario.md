# Acceso por nombre de usuario y equipos

Solicitud: Jorge pidió asignar usuarios individuales y una clave temporal al personal, conservando sus credenciales y las de María. Gerencia y María supervisora podrán administrar usuarios. Recuperación por correo habilitable para dirección; correo de María pendiente. La clave entregada en conversación no se persiste en código, documentación, auditoría ni memoria.

## Implementación
- Login acepta correo existente o alias privado. El servidor valida la clave con Firebase, comprueba UID/perfil activo y emite sesión; App Check y límites por alias/IP. No publica un directorio de correos.
- Endpoint administrativo verifica gerencia o autorización individual de supervisora. Supervisión gestiona personal; no puede elevar roles, editar gerencia ni cambiar su propia clave desde este flujo.
- Alta, edición de alias/equipo, cambio de clave con revocación de sesiones, baja recuperable y restauración. Conserva UID e historial. Alias únicos y control de versiones para ediciones.
- Los técnicos/asistentes se vinculan al UID de la operaria del equipo. Nuevas cuentas no requieren correo personal.
- Preparación automática de 16 integrantes: Jorge/Maria; Wila/Leany y cinco técnicos del A; Yohana/Disnely y cinco técnicos del B. Plantilla entregada únicamente a administradores autenticados. Reutiliza cuentas por coincidencia exacta; ambigüedad bloquea antes del primer cambio.
- Gerencia conserva clave. María conserva clave y recibe permiso individual de gestión al aplicar la plantilla. Recuperación de Jorge usa su correo de Auth existente; recuperación de María queda sin habilitar.
- No cambia reglas financieras ni liquida la condición de Wilmer. La vista de avance diario por equipos y la activación del bot son pendientes independientes.

## Verificación local
- 14 pruebas de integración nuevas: política, identidades, autenticación, App Check, respuesta uniforme y recuperación restringida.
- 8 pruebas de backend con Firestore emulado y Firebase Auth simulado: alta/perfiles, no persistencia de claves, colisión concurrente, reintento tras fallo Auth, alias/versionado, operaria por UID, supervisión y baja/restauración.
- Suite general: 851/851 pruebas, 146 archivos.
- Build aplicación/API aprobado. Lint dirigido sin errores ni avisos. Cazadores de regresión: 0 hits.
- Estas pruebas no demuestran envío de correos reales, acceso físico Android ni ejecución del proveedor de IA.

## Estado de publicación y datos
Publicación pendiente al crear este informe. Ninguna cuenta, permiso o clave real modificados por la implementación local.
La herramienta de navegador exige intervención del usuario para introducir y confirmar credenciales. Se preparó un formulario único en Usuarios & Permisos para que Jorge revise las identidades e introduzca una vez la clave temporal y aplique el lote; no se elude esa restricción mediante automatización de UI.

Fuente: conversación 01a0f833-70e2-7e63-b204-027995df6176. Checkout aislado: ~/.codex/worktrees/web-blanca-publicacion/mister-service-rd. Logs de esta validación: /tmp/ms-accesos-*.log.
