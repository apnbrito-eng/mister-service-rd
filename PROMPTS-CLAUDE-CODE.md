# Prompts para Claude Code - Mister Service RD

Copia y pega cada prompt en Claude Code, **uno a la vez**, en el orden que prefieras.

---

## PROMPT 1: Resolver CORS del GPS con Vercel Serverless Functions

```
Necesito resolver el problema de CORS en las llamadas a APIs externas de GPS (Wialon, Samsara, Traccar, Fleet Complete, API personalizada).

CONTEXTO:
- El proyecto es un SPA React+Vite desplegado en Vercel
- En src/services/gps.service.ts, la función obtenerUbicacionAPI() hace fetch directo a APIs externas desde el navegador, lo cual falla por CORS en producción
- La config de GPS se guarda en Firestore en config_gps/sistema con campos: proveedor, apiUrl, apiKey, activo
- Ya existe la función normalizarRespuesta() que transforma la data según el proveedor

LO QUE NECESITO:
1. Crear una Vercel Serverless Function en /api/gps/ubicacion.ts que actúe como proxy:
   - Reciba vehiculoId y las credenciales GPS (apiUrl, apiKey, proveedor) como parámetros
   - Haga el fetch al proveedor externo desde el servidor (sin CORS)
   - Devuelva la respuesta normalizada al frontend
   - Maneje errores correctamente (timeout, auth fallida, proveedor no disponible)

2. Modificar gps.service.ts para que obtenerUbicacionAPI() llame a /api/gps/ubicacion en vez de llamar directo a la API externa

3. Asegurarte de que vercel.json siga funcionando con el rewrite SPA existente sin romper la nueva API route

NO cambies la lógica de Firestore ni los listeners de onSnapshot. Solo el flujo de llamada a APIs externas.
```

---

## PROMPT 2: Refactorizar Ordenes.tsx (1,594 líneas)

```
El archivo src/pages/Ordenes.tsx tiene 1,594 líneas y necesita ser refactorizado en componentes más pequeños y manejables.

CONTEXTO:
- Es la página principal de órdenes de servicio del sistema
- Usa Firestore con onSnapshot para datos en tiempo real
- Tiene: listado con filtros, búsqueda, modal de crear orden, modal de editar, cambio de fase/estado, asignación de técnico, integración WhatsApp y Google Maps
- Importa utilidades de src/utils/index.ts y tipos de src/types/index.ts
- Usa el contexto de AppContext para permisos del usuario

LO QUE NECESITO:
1. Extraer estos componentes a src/components/ordenes/:
   - OrdenCard.tsx - tarjeta individual de cada orden en el listado
   - OrdenFilters.tsx - la barra de filtros y búsqueda
   - OrdenFormModal.tsx - el modal de crear/editar orden (formulario completo)
   - FaseSelector.tsx - el selector de cambio de fase con las flechas/botones
   - AsignarTecnicoModal.tsx - modal para asignar técnico a una orden

2. Mantener en Ordenes.tsx solo:
   - La carga de datos con onSnapshot
   - El estado global de la página (filtros activos, modal abierto, orden seleccionada)
   - La lógica de escritura a Firestore (crear, actualizar, cambiar fase)
   - Pasar todo lo demás como props a los sub-componentes

3. REGLAS:
   - No cambies ninguna funcionalidad, solo reorganiza
   - Mantén los tipos de TypeScript correctos
   - No rompas los estilos de Tailwind
   - Asegúrate de que la app compile sin errores después (npm run build)
   - Corre npm run build al final para verificar
```

---

## PROMPT 3: Permisos en tiempo real sin re-login

```
Actualmente en src/context/AppContext.tsx, el perfil del usuario (incluyendo su rol y permisos) solo se carga UNA VEZ cuando hace login, usando getDoc(). Si un admin cambia los permisos de un técnico en la página de Gestión de Usuarios, ese técnico no ve los cambios hasta que cierra sesión y vuelve a entrar.

CONTEXTO:
- AppContext.tsx usa onAuthStateChanged para detectar el login
- Luego hace getDoc() a usuarios/{uid} o busca en personal por email
- El perfil se guarda en userProfile (estado React)
- Los permisos están en userProfile.permisos (tipo TecnicoPermisos)
- La colección de usuarios es "usuarios" y la de personal es "personal"

LO QUE NECESITO:
1. Cambiar el getDoc() en AppContext.tsx por un onSnapshot() al documento del usuario, para que cuando un admin modifique el rol o los permisos, el cambio se refleje inmediatamente sin re-login

2. El listener debe:
   - Activarse después de que onAuthStateChanged confirme el usuario
   - Escuchar cambios en usuarios/{uid} en tiempo real
   - Si no existe en usuarios, escuchar el documento correspondiente en personal (por email)
   - Limpiar el listener (unsubscribe) cuando el usuario cierre sesión o el componente se desmonte
   - Manejar errores sin romper la app

3. NO toques la lógica del fallback a "admin demo" cuando no existe en ninguna colección

4. Verifica que compile: npm run build
```

---

## Orden recomendado de ejecución

1. **Prompt 3 primero** (permisos) - Es el cambio más pequeño y aislado
2. **Prompt 1 segundo** (CORS GPS) - Agrega funcionalidad nueva sin tocar mucho código existente
3. **Prompt 2 último** (refactor Ordenes) - Es el más grande, conviene hacerlo con lo demás estable
