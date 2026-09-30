# Personal, accesos y ponches — 29/09/2026

Se añade navegación compartida conservando `personalId` del documento Personal, sin sustituirlo por UID o nombre. Selector distingue registros por ID aunque tengan nombres iguales. Personal y Accesos filtran sus tablas; Ponches sincroniza su selector existente con la URL. ID inexistente informa explícitamente y no abre otra ficha por coincidencia de nombre.

Gates conservados: Personal según personalVer; Accesos/Ponches/Nómina solo administrador o coordinadora. Las rutas mantienen sus wrappers existentes. No se modifican altas, contraseñas, roles, endpoints, Firestore Rules ni fórmulas. Enlace Nómina general no promete filtro individual inexistente.

Se aclara que registrar asistencia no descuenta automáticamente: revisión/aprobación y aplicación en nómina siguen el flujo existente. RevisionAsistencia tiene selector propio y queda rotulado como tal. El aviso de alta ya no promete cuenta automática sin comprobar vínculo.

PRECHANGE: P001/P004, Personal.id distinto de auth.uid y cuenta espejo. Navegación usa identidad personal estable; no toca escrituras sensibles.

Verificación: TypeScript limpio; pruebas de navegación con homónimos y UID distinto, gates de técnico y selección desconocida. No datos reales/publicación.

Pendientes: integrar selector de RevisionAsistencia con contexto de empleado mediante su API de props; ponches legacy solo UID ahora filtran por vínculo único a Personal, incluyendo inactivos; UID ambiguo/desconocido no se atribuye; no resolver por nombre/email ni registrar ausencia automática. Prueba visual móvil/recorridos con roles reales siguen pendientes. No se declara completada toda la gestión de personal.

Ampliación verificada: helper personalIdDePonche conserva ID explícito, resuelve solo legacy UID único. Pruebas de UID ambiguo y ficha inactiva. Selector local Ponches incluye inactivos para consultar períodos históricos. No cambia inferencia ni descuentos por ausencias.
