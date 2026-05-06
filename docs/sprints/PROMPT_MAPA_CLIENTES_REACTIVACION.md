# Sprint: Mapa de Clientes + Reactivación Marketing

Usa el subagente coordinator.

## Contexto

Hoy `/admin/clientes` es solo una lista buscable. Con 9094 clientes históricos importados (+ los que se crean continuamente), Jorge necesita:

1. **Visualización geográfica** — saber dónde está concentrada la base de clientes para decidir inversión en marketing, identificar zonas con baja cobertura, y planear logística de técnicos.

2. **Reactivación** — contactar clientes que no recibieron servicio hace tiempo, recordarles que Mister Service sigue activo, ofrecerles mantenimiento. Es la base de marketing más valiosa del negocio.

Este sprint construye ambas capas integradas.

## Lo que ya existe (reusar)

- `cliente.zona` poblado en 6021 de 9094 clientes (sprint auto-detección GPS, commit 1dcb24d).
- `cliente.lat` / `cliente.lng` GPS coords (importadas del calendar).
- `cliente.legacyMetricas` con historial: `ultimoServicio`, `totalServicios`, `equipoTipo`, etc. (sprint import calendar, commits 3b34ce4 + 48cda19).
- `inferirZona(lat, lng)` en `utils/zonas.ts` (zonas RD ya configuradas).
- `MapaRutas.tsx` con Google Maps integrado — patrón reusable.
- `utils/whatsapp.ts` para construir links wa.me.
- `crearRegistroAuditoria()` en `utils/index.ts`.
- `puede(userProfile, ...)` helper de permisos.

## Decisiones cerradas

### 1. Layout: tab dentro de `/admin/clientes` (no página separada)

`/admin/clientes` tendrá 3 tabs en el header:
- **Lista** (default, como hoy)
- **Mapa**
- **Reactivación**

Razón: mantiene contexto. El admin ya entró a buscar clientes, ahora tiene visualización + acción en el mismo lugar.

### 2. Mapa: 3 vistas toggleables

**Vista A — Cluster (default)**
- Google Maps con `MarkerClusterer` library (`@googlemaps/markerclusterer`).
- Pin gris para clientes sin servicio reciente, verde para activos (< 3 meses), amarillo para 3-6, naranja para 6-12, rojo para > 12 meses.
- Click en pin abre tooltip con nombre + teléfono + último servicio + botón "Ver detalle".

**Vista B — Heatmap**
- `google.maps.visualization.HeatmapLayer`.
- Toggle de intensidad slider (peso por servicios totales, no solo cantidad).
- Sin pins individuales en esta vista (solo concentración).

**Vista C — Por zonas (coloreado)**
- Pins coloreados por `cliente.zona`:
  - Distrito Nacional → azul `#3b82f6`
  - Santo Domingo Norte → verde `#10b981`
  - Santo Domingo Este → amarillo `#eab308`
  - Santo Domingo Oeste → naranja `#f97316`
  - Santiago → morado `#a855f7`
  - La Vega, Puerto Plata, Punta Cana, Otro → tonos secundarios
- Leyenda visual en esquina del mapa.

Toggle entre las 3 vistas con botones segmentados arriba del mapa.

### 3. Sidebar de filtros (compartido entre tabs Mapa y Reactivación)

Filtros combinables (AND):

- **Zona** (multi-select de los valores presentes en la base)
- **Último servicio**: 
  - Sin servicio registrado
  - < 3 meses
  - 3-6 meses
  - 6-12 meses
  - > 12 meses
  - > 24 meses (clientes muy fríos)
- **Tipo cliente**: particular / B2B / todos
- **Total servicios histórico**: 1 / 2-5 / 6-10 / 11+ (proxy de fidelidad)
- **Equipo tipo** (multi-select desde `cliente.legacyMetricas.equiposAtendidos[]`)
- **Tiene WhatsApp válido**: sí / no (filtra clientes sin teléfono normalizado correcto)

Botón "Limpiar filtros" + contador "X clientes encuentran" arriba de la lista/mapa.

### 4. Tab Reactivación: campañas WhatsApp

**Layout**: filtros sidebar + tabla con checkboxes + panel derecho de plantilla.

**Tabla**:
| ☐ | Nombre | Tel | Zona | Último servicio | Equipos | Servicios totales | Última campaña |

Ordenable por cada columna. Paginación 50 rows.

**Panel plantilla**:
- Selector de 4 plantillas iniciales (configurables vía Firestore en `config_marketing/plantillas`):
  1. **Recordatorio mantenimiento**: "Hola {nombre}, soy de Mister Service RD. Hace {mesesUltimoServicio} meses te ayudamos con tu {equipoTipo}. ¿Quieres que te agendemos un mantenimiento preventivo? Respondé y coordinamos."
  2. **Oferta promocional**: configurable, ej "Aprovechá 15% off este mes en mantenimiento de electrodomésticos"
  3. **Encuesta satisfacción tardía**: "Hola {nombre}, ¿cómo va el {equipoTipo} que te reparamos? Tu opinión nos ayuda a mejorar."
  4. **Garantía por expirar**: si el cliente tiene equipo con garantía vigente próxima a expirar.

- Variables soportadas: `{nombre}`, `{telefono}`, `{ultimoServicio}` (formato "hace X meses"), `{equipoTipo}`, `{zona}`.

- Preview render del mensaje con datos del primer cliente seleccionado.

- Botón **"Generar links WhatsApp"** → genera array de `{cliente, link}`. Modal muestra cada cliente con su link clickable. Admin abre uno por uno, registra envío con botón "Marcar como enviado" (no auto-bulk porque WhatsApp Business API no está integrada).

- Alternativa: botón "Copiar todos los links" para abrir manualmente en pestañas.

**Anti-spam**:
- Antes de generar links, filtrá clientes con `ultimoContactoMarketing` < 30 días (configurable en `config_marketing/cooldownDias`).
- Mostrá warning: "12 clientes excluidos por cooldown de contacto reciente."
- Override admin con confirmación explícita ("Sí, contactar de nuevo aunque haya cooldown").

**Persistencia**:
- Cada cliente contactado: `cliente.ultimoContactoMarketing = Timestamp.now()`, `cliente.contactosMarketing.push({fecha, plantillaId, agente, campanaId})`.
- Colección `campanas_marketing/` con `{id, fecha, plantillaId, filtrosAplicados, clientesContactados[], creadaPor, totalEnviados, totalReactivados}`.
- Audit log en `auditoria_admin`: `tipoEntidad: 'campana_marketing'`, `accion: 'creada' | 'enviada'`.

### 5. ROI tracking (Fase 2 — opcional en este sprint)

Cuando una orden nueva se crea para un cliente que tiene `ultimoContactoMarketing` dentro de los últimos 60 días:
- Marcar `orden.reactivadaPor: campanaId`.
- Incrementar `campana.totalReactivados` atomically.
- Mostrar en panel admin: "Esta orden fue reactivada por campaña X del Y/Z/W."

**Decisión Jorge cerrada**: incluir Fase 2 en este sprint si el tiempo total sigue dentro del estimado (~7h). Si excede, mover a sprint propio.

### 6. Permisos

- **Mapa**: visible para `administrador`, `coordinadora`, `secretaria`.
- **Reactivación**: solo `administrador` y `coordinadora` (es decisión comercial).
- Operaria/secretaria pueden registrar contactos individuales (no campañas masivas).

### 7. Schema extension Cliente

```typescript
interface Cliente {
  // ...existing...
  ultimoContactoMarketing?: Timestamp;
  contactosMarketing?: Array<{
    fecha: Timestamp;
    plantillaId: string;
    plantillaNombre: string;
    agenteId: string;
    agenteNombre: string;
    campanaId: string;
  }>;
}
```

Backwards compatible (campos opcionales).

### 8. Schema nuevo `campanas_marketing/`

```typescript
interface CampanaMarketing {
  id: string;
  fecha: Timestamp;
  plantillaId: string;
  plantillaNombre: string;
  filtrosAplicados: {
    zonas?: string[];
    rangoUltimoServicio?: string;
    tipo?: 'particular' | 'b2b';
    equipos?: string[];
    rangoServiciosTotales?: string;
  };
  clientesContactados: Array<{
    clienteId: string;
    clienteNombre: string;
    telefono: string;
    enviado: boolean;
    fechaEnvio?: Timestamp;
  }>;
  creadaPor: string;
  creadaPorNombre: string;
  totalEnviados: number;
  totalReactivados?: number;
  totalReactivadosUpdatedAt?: Timestamp;
}
```

### 9. Firestore rules

```
match /clientes/{docId} {
  // existing rules + permitir update de ultimoContactoMarketing y contactosMarketing
  // por admin/coord/secretaria/operaria
}

match /campanas_marketing/{docId} {
  allow read: if esAdminOCoord();
  allow create: if esAdminOCoord();
  allow update: if esAdmin(); // solo admin actualiza ROI tracking post-creación
  allow delete: if false; // nunca, son auditables
}

match /config_marketing/{docId} {
  allow read: if esStaff();
  allow write: if esAdmin();
}
```

### 10. Plantillas configurables — `config_marketing/plantillas`

Doc inicial seedeable:
```json
{
  "plantillas": [
    {
      "id": "mantenimiento_3meses",
      "nombre": "Recordatorio mantenimiento (3+ meses)",
      "mensaje": "Hola {nombre}, soy de Mister Service RD. Hace {mesesUltimoServicio} meses te ayudamos con tu {equipoTipo}. ¿Quieres que te agendemos un mantenimiento preventivo? Respondé y coordinamos.",
      "activa": true,
      "filtroSugerido": { "rangoUltimoServicio": "3-6 meses" }
    },
    ...
  ]
}
```

Editor de plantillas en `/admin/configuracion-marketing` (página nueva, solo admin).

## Implementación recomendada (split en 2 commits)

### Commit 1 (~3-4h): Mapa + filtros

- Tab "Mapa" en Clientes.tsx con sidebar filtros.
- Componente `MapaClientes.tsx` con 3 vistas toggleables.
- MarkerClusterer para clusters.
- HeatmapLayer para vista heatmap.
- Coloreado por zona para vista zonas.
- Filtros aplicados al estado del mapa (renderiza solo los pines que cumplen).

### Commit 2 (~3-4h): Reactivación + plantillas + audit

- Tab "Reactivación" con tabla seleccionable.
- Selector + preview de plantillas.
- Panel de generación de links WhatsApp.
- Anti-spam con override.
- Schema extensions Cliente + colección `campanas_marketing`.
- Página `/admin/configuracion-marketing` para editar plantillas.
- Rules update.
- Audit logs.

### Commit 3 (~1h, opcional): ROI tracking Fase 2

- Hook al crear orden: detectar reactivación.
- UI badge "Reactivado por campaña X" en orden detail.
- Métrica `totalReactivados` en lista de campañas.

## Verificación

**Tester:**
1. Abrir `/admin/clientes` → tab Mapa → ver 3 vistas funcionando.
2. Aplicar filtro zona DN → mapa muestra solo pines DN.
3. Aplicar filtro "último servicio > 6 meses" → contador correcto, mapa actualizado.
4. Tab Reactivación → seleccionar 5 clientes → plantilla "mantenimiento" → preview correcto con variables.
5. Generar links → 5 links wa.me válidos con mensajes correctos.
6. Marcar 3 como enviados → cliente.ultimoContactoMarketing actualizado en Firestore.
7. Repetir filtro mismo cliente → cooldown bloquea con warning.
8. Override admin → permite re-enviar.
9. Login secretaria → tab Reactivación NO visible (solo admin/coord).
10. Crear plantilla nueva en `/admin/configuracion-marketing` → aparece en selector.

**QA manual:**
- Performance: con 9000+ pines, render del mapa < 3s.
- Zoom/pan responsive.
- WhatsApp links abren correctamente la app móvil + web.
- Plantillas con variables faltantes (cliente sin equipoTipo) → fallback "tu equipo" o similar.

**Reviewer:**
- Anti-spam tiene override pero queda audit log.
- Rules nuevas no rompen lectura de clientes existente.
- Firestore queries con índices compuestos si aplica (filtro multi-campo).
- Variables de plantilla escapan caracteres especiales para wa.me URL encoding.

**Security:**
- `campanas_marketing` solo admin/coord pueden leer.
- Plantillas solo admin puede modificar.
- No exponer telefonos sin auth en endpoints.

## Estimación

Sprint mediano-grande, **~6-8h** total con full equipo (coordinator + tech_lead + architect si toca rules + builder + tester + qa + reviewer + security + devops + retro).

Si se incluye Fase 2 ROI tracking: +1h.

## Después del sprint

- Validar con uso real: una campaña a 50 clientes "último servicio 6-12 meses" en DN.
- Medir: % que respondieron, % que reagendaron servicio.
- Si funciona, escalar a campañas semanales segmentadas.
- Considerar futuras mejoras:
  - Schedule de campañas automáticas (cron)
  - Exclusión por feedback NPS bajo
  - Templates con imágenes/multimedia (requiere WhatsApp Business API)
  - Dashboard de marketing con ROI consolidado mensual

## Estado: listo para ejecutar después de Sprint Críticos del audit

Decisiones cerradas. Coordinator puede arrancar cuando los 5 CRÍTICOS del audit cierren.
