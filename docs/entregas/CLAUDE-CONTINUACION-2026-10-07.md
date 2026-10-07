# Continuación para Claude Code — Personal y próximos lotes

Lee primero AGENTS.md del cerebro compartido, Estado actual, diario y pendientes. Jorge quiere mantener web y APK Android coordinadas. Trabaja sobre el lote revisado por Codex, no vuelvas a la versión previa de tu rama.

## Base y responsabilidad
Tu lote inicial: 0806ba782afc5034b2d6ea324965d07da700aa05 (rediseno-bamboohr).
Correcciones funcionales de Codex: f4878bf9ba392abacc0ccde1b603f8523eb38240, rama codex/personal-bamboo-publicacion. Integra esta rama sin sobrescribir cambios ajenos. El commit posterior añade APK 1.0.25/código 26 y documentos; consulta HEAD remoto de esa rama.
Codex conserva y usa la firma oficial. Entrega cada lote terminado con SHA, archivos, pruebas, riesgos y preview. No declaremos publicado hasta verificar web y APK del mismo código funcional. No publiques por tu cuenta una web que adelante la APK.

## Mantener las correcciones
- Un único módulo Personal; /admin/usuarios redirige a /admin/personal.
- Datos de contacto separados del email de autenticación: emailContacto.
- Borrar un campo opcional usa deleteField; sueldo cero se guarda como cero.
- Datos sensibles de ficha en personal_privado/{personalId}, acceso administrador/coordinadora; reglas desplegadas en mister-service-app-cloude. Mantén la suscripción y escritura divididas. No vuelvas a poner domicilio, identificación, referencias/contactos privados en la colección personal legible por el personal. Revisar datos históricos antes de cualquier migración; no hubo migración masiva.
- Botón Agregar empleado recuperado usando el endpoint existente de accesos. No crear empleados reales para probar.
- Enlaces de ubicación validados y botón Abrir Google Maps; enlaces cortos válidos pueden abrirse aunque no entreguen coordenadas. Un enlace a un chat WhatsApp no es una ubicación.

## Personal — siguiente entrega
Conservar el diseño BambooHR aprobado, responsive web/Android, columnas Dirección, Equipo A y Equipo B, activos separados de inactivos desplegables, y agrupación basada en datos reales que se actualice al editar equipo. Rol y equipo son campos distintos. Roles: administrador, coordinadora, secretaria, operaria, técnico; permisos base del rol con excepciones individuales, IA y WhatsApp empresarial independientes del contacto personal.
Ficha: código, cédula, nombre, foto, dirección escrita, enlace de ubicación con botón de mapa, teléfono, WhatsApp, flota, correo de contacto, usuario editable, gestión de clave, rol, equipo, especialidad, sueldo base, fecha de ingreso, tipo/porcentaje de comisión, tres referencias personales y contactos de emergencia. Subir foto de identificación y licencia si existe. Completar almacenamiento y permisos de documentos con privacidad, no URLs públicas de documentación. Nómina accesible desde ficha, con pagos/descuentos por período sin mezclar datos permanentes y movimientos. Verificar sincronización perfil/usuario/auth, cambios de equipo/rol, alta, bloqueo y reactivación. Las pruebas automáticas no sustituyen revisión con cuentas autorizadas de diferentes roles.

## Mapas
Hay dos versiones: Mapa de operaciones (src/pages/Mapa.tsx, /admin/mapa) y Mapa de Rutas anterior (src/pages/MapaRutas.tsx, /admin/mapa-rutas-anterior). El anterior quedó para comprobar paridad, no son idénticos. Audita rutas, GPS, filtros y reasignación; lleva funciones faltantes al mapa nuevo. Después elimina la entrada anterior del menú y deja ruta compatible/redirect cuando la paridad esté probada. No elimines funcionalidades solamente para esconder duplicación visual.

## Decisiones financieras aprobadas por Jorge — todavía planificación
- Comisión de cada trabajo: (importe cobrado correspondiente menos costo de materiales/piezas asignado a ese trabajo) × porcentaje del técnico guardado para ese trabajo.
- Porcentaje desde ficha; cambios solo para trabajos nuevos, nunca retroactivos. Varios técnicos pueden hacer servicios distintos en una orden; cada trabajo conserva técnico, costo y porcentaje.
- Toda la orden debe estar terminada y totalmente pagada antes de calcular/liberar sus comisiones. Una factura total al final. Facturas independientes sin orden permitidas para ventas/servicios independientes; no dividir una orden existente.
- Materiales comprados generalmente: empresa asigna costo a reparación/mantenimiento; no inventar reparto automático de gastos compartidos.
- Conduces de garantía con desglose y total SIN impuestos. Solo estos documentos; no eliminar impuestos globalmente.
- Devolución revierte únicamente comisión correspondiente. Si no se pagó, ajustar antes del pago; si ya se pagó, descontar identificadamente en próxima quincena.
- Si otro técnico resuelve garantía: descontar TODA la comisión ORIGINAL de ese trabajo al original; el que resuelve recibe ese MISMO MONTO original, no su porcentaje actual. No afectar otros trabajos. Movimientos vinculados y protección contra duplicados.
- Pendientes a resolver antes de automatizar: devolución parcial, garantías repetidas, anulación/corrección y momento de abonar al resolutor. No inventar esas reglas.
- Secretaria/operaria: bono proporcional por cumplimiento de meta mensual EDITABLE de ventas efectivamente cobradas del equipo, máximo RD$4,000 por persona. Personal ve porcentaje, sin meta monetaria ni cobrado acumulado; dirección consulta montos. Corregir cualquier KPI que considere completas citas pendientes antes de usarlo para pagar.
- Portal del cliente: progreso sin costos internos; evaluación final separada de atención y técnico, ligada a orden y participantes. Revisar código existente antes de ampliar.

## Evidencia Codex
Integraciones: 185 archivos/1263 pruebas aprobadas antes de añadir formulario de alta; formulario luego validado con build y lint, endpoint ya existente. Build web/mobile y reglas privadas en emulador aprobados. Invariantes P001–P025 sin hallazgos. APK 1.0.25 oficial, 255 recursos comparados byte a byte, manifiesto en public/descargas/android-1.0.25.json. Ver publicación/instalación y límites actuales en cerebro compartido; no asumir probado lo que figure pendiente.
