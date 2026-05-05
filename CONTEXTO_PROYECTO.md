# 🛠️ CONTEXTO COMPLETO — Mister Service RD
> Documento de referencia para Claude. Si hay desconexión o cambio de sesión, comparte este archivo y Claude retoma el proyecto desde aquí sin perder nada.

---

## ¿Qué es este proyecto?

**Mister Service RD** es una aplicación web de gestión de servicios técnicos para reparación de electrodomésticos en República Dominicana. Maneja el ciclo completo de una orden: desde el primer contacto del cliente hasta el cierre con foto + verificación GPS.

**Carpeta del proyecto en tu computadora:** `~/Desktop/mister-service-rd`
**Firebase Project ID:** `mister-service-app-cloude`
**Desplegado en:** Vercel (vercel.json presente) + Firebase Hosting

---

## Stack Tecnológico

| Capa | Tecnología | Versión |
|---|---|---|
| Frontend | React + TypeScript | 18.2.0 / 5.2.2 |
| Build | Vite | 5.0.0 |
| Estilos | Tailwind CSS | 3.3.5 |
| Enrutamiento | React Router | 6.20.0 |
| Estado global | Context API (AppContext) | — |
| Base de datos | Firebase Firestore | 10.7.0 |
| Autenticación | Firebase Auth | 10.7.0 |
| Almacenamiento | Firebase Storage | 10.7.0 |
| Mapas | Leaflet + react-leaflet | 1.9.4 / 4.2.1 |
| Iconos | lucide-react | 0.294.0 |
| Fechas | date-fns (locale: es) | 2.30.0 |
| Notificaciones UI | react-hot-toast | 2.4.1 |

**Comandos:**
- `npm run dev` → servidor de desarrollo
- `npm run build` → compilar para producción (tsc + vite build)

---

## Estructura de Archivos

```
src/
├── App.tsx                      # Rutas principales, guards de auth
├── main.tsx                     # Entry point
├── index.css                    # Estilos globales
├── vite-env.d.ts
├── context/
│   └── AppContext.tsx            # Estado global: currentUser, userProfile, loading
├── firebase/
│   ├── config.ts                # Inicialización Firebase (lee .env con fallback)
│   └── seedData.ts              # Datos demo iniciales (con flag anti-duplicados)
├── types/
│   ├── index.ts                 # TODOS los tipos TypeScript (397 líneas)
│   └── google.d.ts              # Tipos para Google Maps API
├── services/
│   ├── contadores.service.ts    # Generación segura de números OS/QT/FAC
│   ├── clientes.service.ts      # CRUD clientes + normalización teléfono
│   ├── gps.service.ts           # GPS: config, ubicaciones, ETA, tracking token
│   └── storage.service.ts       # Subida de fotos a Firebase Storage
├── utils/
│   ├── index.ts                 # Helpers: fechas, moneda, teléfono, fases, alertas, parseOrden
│   ├── whatsapp.ts              # Mensajes predefinidos + URLs wa.me
│   ├── checklistTemplates.ts    # Checklists por tipo de equipo
│   ├── rutas.ts                 # Optimización de rutas (Nearest Neighbor)
│   └── cleanFirestore.ts        # Funciones manuales de limpieza de datos
├── components/
│   ├── Layout.tsx               # Shell principal con Sidebar
│   ├── Sidebar.tsx              # Navegación lateral (154 líneas)
│   ├── CierreServicioWizard.tsx # Wizard de cierre (303 líneas)
│   ├── Badge.tsx                # Componente de etiqueta
│   ├── Modal.tsx                # Modal reutilizable
│   ├── LoadingSpinner.tsx       # Spinner de carga
│   └── Logo.tsx                 # Logo SVG de Mister Service
└── pages/
    ├── Login.tsx                # Autenticación Firebase (126 líneas)
    ├── Dashboard.tsx            # KPIs, alertas, embudo, finanzas (783 líneas)
    ├── Ordenes.tsx              # CRUD órdenes — archivo más grande (1594 líneas)
    ├── OrdenDetalle.tsx         # Vista detalle de una orden (692 líneas)
    ├── Citas.tsx                # Citas por confirmar (362 líneas)
    ├── Calendario.tsx           # Calendario de citas (250 líneas)
    ├── Calendarios.tsx          # Gestión de calendarios públicos (437 líneas)
    ├── CitaPublica.tsx          # Formulario público (sin auth) (421 líneas)
    ├── Standby.tsx              # Piezas en espera (338 líneas)
    ├── MapaRutas.tsx            # Mapa + optimización de rutas (388 líneas)
    ├── Clientes.tsx             # Gestión de clientes (275 líneas)
    ├── Cotizaciones.tsx         # Cotizaciones (330 líneas)
    ├── Facturas.tsx             # Facturación (629 líneas)
    ├── EquiposTaller.tsx        # Equipos recibidos en taller (279 líneas)
    ├── Productos.tsx            # Catálogo de repuestos/servicios (387 líneas)
    ├── Rendimiento.tsx          # Métricas por técnico (286 líneas)
    ├── Mantenimiento.tsx        # Mantenimientos preventivos (258 líneas)
    ├── Gastos.tsx               # Gastos e ingresos (295 líneas)
    ├── PersonalPage.tsx         # Gestión de personal (231 líneas)
    ├── GestionUsuarios.tsx      # Usuarios Firebase Auth (674 líneas)
    ├── Configuracion.tsx        # Ajustes del sistema (315 líneas)
    ├── TecnicoVista.tsx         # Vista simplificada para técnicos (788 líneas)
    └── TrackingCliente.tsx      # Tracking público por token (368 líneas)
```

---

## Colecciones en Firestore

| Colección | Descripción |
|---|---|
| `ordenes_servicio` | Órdenes de servicio (núcleo del sistema) |
| `clientes` | Base de clientes |
| `personal` | Técnicos y staff |
| `usuarios` | Perfiles de usuarios autenticados |
| `citas_por_confirmar` | Solicitudes de citas entrantes |
| `cotizaciones` | Cotizaciones |
| `facturas` | Facturas emitidas |
| `equipos_taller` | Equipos físicos recibidos en el taller |
| `productos` | Catálogo de repuestos y servicios |
| `standby_piezas` | Piezas en espera/búsqueda |
| `gastos` | Registro de gastos |
| `mantenimientos` | Mantenimientos programados |
| `calendarios` | Calendarios de citas públicos |
| `ubicaciones_vehiculos` | GPS en tiempo real de técnicos |
| `config` | Contadores atómicos (OS/QT/FAC) y configuración |
| `config_gps` | Configuración de proveedor GPS |

---

## Modelos de Datos Principales

### Roles de usuario
```typescript
type Rol = 'administrador' | 'secretaria' | 'operaria' | 'tecnico'
```

### Fases de una Orden (flujo)
```
nuevo_lead → en_gestion → en_diagnostico → en_cotizacion → aprobado → agendado → trabajo_realizado → cerrado
                                                                                                    ↘ cancelado
```

### OrdenServicio (tipo central)
```typescript
{
  id, numero,                    // ej: "OS-0042"
  clienteId, clienteNombre,
  clienteTelefono, clienteDireccion, clienteReferencia,
  clienteLat, clienteLng,        // coordenadas GPS del cliente
  equipoTipo, equipoMarca, equipoModelo,
  descripcionFalla,
  tecnicoId, tecnicoNombre,
  responsableId, responsableNombre,
  fase: FaseOrden,               // 9 estados posibles
  estadoSimple,                  // 'pendiente'|'en_proceso'|'completado'|'cancelado'
  estado,                        // 'activo'|'cerrado'|'cancelado'
  fechaCita, duracionMin, reagendada,
  notas, notasTecnico,
  precioSugerido, precioAprobado, precioFinal,
  estadoAprobacion,              // 'pendiente'|'aprobado'
  historialFases: HistorialFase[],
  auditoria?: RegistroAuditoria[],
  creadoPor,
  cierreServicio?: CierreServicio,
  trackingGPS?: TrackingGPS,
  createdAt, updatedAt
}
```

### CierreServicio (dos formatos)
```typescript
{
  fechaCierre, tecnicoId, tecnicoNombre,
  // Wizard NUEVO (simplificado):
  equipoFunciona?: boolean,
  clienteSatisfecho?: boolean,
  revisoConexiones?: boolean,
  fotoCierre?: { url, lat, lng, timestamp, gpsVerificado, distanciaCliente },
  // Wizard LEGACY (antiguo, para órdenes ya cerradas):
  piezasRetiradas?, piezasInstaladas?,
  checklist?: ChecklistItem[],
  descripcionTrabajo?, trabajoPendiente?,
  satisfaccionCliente?,           // 1-5
}
```

### TecnicoPermisos (granular)
```typescript
{
  vistaAgenda: 'dia'|'semana'|'mes',
  soloPropiasCitas: boolean,
  verTelefonoCliente: boolean,
  verEmailCliente: boolean,
  verDireccionCliente: boolean,
  verUbicacionGPS: boolean,
  puedeMarcarCompletado: boolean,
  puedeAgregarNotas: boolean,
  puedeVerHistorial: boolean,
  puedeContactarCliente: boolean,
  puedeVerCotizaciones: boolean,
  recibeNotificacionNuevaCita: boolean,
}
```

---

## Servicios Clave

### contadores.service.ts
Genera números de documento con **transacciones ACID** de Firestore. No hay riesgo de colisión.
- `siguienteNumeroOrden()` → `OS-0001`
- `siguienteNumeroCotizacion()` → `QT-00001`
- `siguienteNumeroFactura()` → `FAC-00001`

### gps.service.ts
- Lee config GPS de Firestore (`config_gps/sistema`)
- Soporta proveedores: **Wialon, Samsara, Traccar, API Personalizada**
- La llamada directa a API externa **requiere proxy backend** (hay CORS en producción)
- Fallback: guarda ubicaciones manualmente en `ubicaciones_vehiculos`
- Real-time con `onSnapshot()`
- `calcularETA()` usa fórmula Haversine (km reales)
- `generarTrackingToken()` → UUID v4 para URLs públicas `/tracking/:token`

### whatsapp.ts
- **NO usa API de WhatsApp Business**
- Solo genera URLs `wa.me/{numero}?text=...` que abren la app
- 11 mensajes predefinidos: confirmacion, recordatorioCita, enDiagnostico, cotizacion, cotizacionAprobada, piezaEnEspera, piezaLlego, equipoListo, trabajoRealizado, seguimiento, mantenimientoProgramado
- Normaliza teléfonos RD: si 10 dígitos, prepend `1`

### checklistTemplates.ts
Checklists **hardcodeados** por tipo de equipo (no editables desde la UI):
- LAVADORA: 6 ítems (mangueras, desagüe, ciclo, nivel, área, cliente)
- NEVERA: 5 ítems (enfría, temperatura, juntas, área, cliente)
- AIRE ACONDICIONADO: 6 ítems (enfría, filtros, drenajes, cables, área, cliente)
- ESTUFA: 5 ítems (quemadores, gas, horno, área, cliente)
- SECADORA: 5 ítems (calienta, ducto, ciclo, área, cliente)
- OTRO: 4 ítems genéricos
- Ítems marcados `critica: true` se muestran en rojo

---

## AppContext (Estado Global)

Carga en cascada al detectar usuario autenticado:
1. Busca en colección `usuarios/{uid}` (real-time vía `onSnapshot`).
2. Si no existe, busca en `personal` por email (real-time vía `onSnapshot`).
3. Si tampoco existe → setea `userProfile=null` y `authError`, la UI muestra `PerfilNoEncontrado`.

**Audit fix C3 (eliminado):** anteriormente, si no había perfil en `usuarios` ni en `personal`, se sintetizaba en memoria un perfil con `rol: 'administrador'` (demo mode). Esto permitía escalación silenciosa de privilegios para cualquier usuario autenticado en Firebase Auth con email no registrado. **Eliminado en audit fix C3 — NO reintroducir.** Si auth falla por falta de perfil, la app debe mostrar `PerfilNoEncontrado` con instrucciones para contactar al administrador.

Los cambios de permisos en `usuarios/{uid}` o `personal` se reflejan en tiempo real (listener basado en `onSnapshot`), no requiere re-login.

---

## Rutas de la App

| Ruta | Componente | Auth |
|---|---|---|
| `/login` | Login | Pública |
| `/cita/:calendarId` | CitaPublica | Pública |
| `/tracking/:token` | TrackingCliente | Pública |
| `/tecnico` | TecnicoVista | Solo rol técnico |
| `/dashboard` | Dashboard | Admin/Secretaria/Operaria |
| `/ordenes` | Ordenes | Todos |
| `/ordenes/:id` | OrdenDetalle | Todos |
| `/citas` | Citas | Todos |
| `/calendario` | Calendario | Todos |
| `/calendarios` | Calendarios | Todos |
| `/standby` | Standby | Todos |
| `/mapa` | MapaRutas | Admin/Operaria |
| `/clientes` | Clientes | Todos |
| `/cotizaciones` | Cotizaciones | Todos |
| `/facturas` | Facturas | Todos |
| `/taller` | EquiposTaller | Todos |
| `/productos` | Productos | Todos |
| `/rendimiento` | Rendimiento | Admin/Operaria |
| `/mantenimiento` | Mantenimiento | Todos |
| `/gastos` | Gastos | Admin |
| `/personal` | PersonalPage | Admin |
| `/usuarios` | GestionUsuarios | Admin |
| `/configuracion` | Configuracion | Admin |

---

## Estado del Proyecto

| Módulo | Estado |
|---|---|
| Órdenes, clientes, citas | ✅ Completo y funcional |
| Facturación y cotizaciones | ✅ Completo |
| Roles y permisos granulares | ✅ Completo |
| Mapa y optimización de rutas | ✅ Funcional |
| Checklist de cierre | ✅ Funcional |
| Cierre con foto + GPS | ⚠️ Implementado pero parcial |
| GPS en vivo (Wialon/Samsara) | ⚠️ Estructura lista, falta proxy backend |
| WhatsApp automático | ❌ Solo abre la app del celular manualmente |
| Notificaciones push | ❌ No implementado (solo toasts visuales) |
| Tests automatizados | ❌ No hay |

---

## Puntos de Atención / Deuda Técnica

1. **`Ordenes.tsx` tiene 1,594 líneas** — funciona bien pero es difícil de mantener. Candidato a refactorizar en partes.
2. **AppContext no refresca permisos en tiempo real** — requiere logout/login para ver cambios de permisos.
3. **GPS en producción fallará por CORS** — necesita proxy backend (Cloud Function o Express server).
4. **Checklists no editables desde UI** — están hardcodeados en `checklistTemplates.ts`.
5. **Dashboard abre 6 listeners simultáneos** — puede volverse costoso en Firestore conforme crezca la base de datos.
6. **WhatsApp no es automático** — solo genera URLs; para automatizar necesitaría WhatsApp Business API.
7. **Sin logging/telemetría** — errores se pierden en `console.error`. Considerar Sentry.

---

## Utils Importantes (utils/index.ts)

```typescript
formatFecha(date)          // "15 abr 2026, 14:30"
formatFechaCorta(date)     // "15/04/2026"
formatHora(date)           // "14:30"
formatMoneda(amount)       // "RD$3,500"
formatTelefono(tel)        // "(809) 555-1234"
tiempoTranscurrido(date)   // "hace 2 días"
faseLabel(fase)            // "En Diagnóstico"
faseColor(fase)            // clase Tailwind de color
googleMapsLink(lat, lng)   // URL Google Maps
whatsappLink(tel, msg)     // URL wa.me
parseOrden(doc)            // Convierte doc Firestore → OrdenServicio tipado
getAlertasFromOrdenes(ordenes) // Genera alertas rojas/naranjas por SLA
crearRegistroAuditoria(...)    // Registra quién cambió qué
```

---

## Alertas Automáticas (SLA)

La función `getAlertasFromOrdenes()` genera alertas basadas en tiempo:
- 🔴 **Roja:** orden activa sin mover en +24h
- 🟠 **Naranja:** en diagnóstico +2h sin cotización
- 🟠 **Naranja:** cotización sin respuesta +24h
- Estas alertas se muestran en el Dashboard en tiempo real

---

## Seed Data

Al iniciar sesión por primera vez, `seedDatabase()` carga datos de demo. Está protegido por un flag en `config/sistema.inicializado` para no duplicar datos. Carga: personal de ejemplo, productos, contadores iniciales (ordenes=10, cotizaciones=3, facturas=5).

---

## Para Claude: Cómo Retomar el Proyecto

Si ves este archivo, ya tienes todo el contexto. El proyecto está montado en:
- **Carpeta activa:** `/sessions/.../mnt/mister-service-rd/`
- Puedes leer, editar y crear archivos directamente
- Para correr el proyecto: `cd ~/Desktop/mister-service-rd && npm run dev`
- Pregunta a Jorge: ¿en qué parte están trabajando o qué quieren mejorar?
