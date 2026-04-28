# Mapa Mental — Mister Service RD

> **Propósito:** documento vivo para alinear flujos del negocio entre Jorge y Cowork. **NO modifica el software.** Solo documenta lo que hay, lo que falta y reglas importantes.
>
> **Cómo se actualiza:**
> - Cowork lo regenera al final de cada sprint.
> - Jorge edita libremente: agrega `[FALTA]`, `[REVISAR]`, `[BUG]`, `[DUDA]` en cualquier nodo.
> - Push al repo → GitHub renderiza los diagramas automáticamente.
> - VS Code: instala "Markdown Preview Mermaid Support" para preview en vivo.

---

## 1. Vista general del software

```mermaid
mindmap
  root((Mister Service RD))
    Audiencias
      Público
        Cliente potencial
        Cliente con orden activa
        Cliente con garantía vigente
      Admin interno
        Administrador
        Coordinadora
        Secretaria
        Operaria
      Técnico
        Vista mobile dedicada
    Flujo del negocio
      1. Cliente llega
        Web pública /agendar
        WhatsApp manual
        Llamada
      2. Se registra cita
        citas_por_confirmar
        Coord/secretaria confirma
      3. Se crea orden
        OS-#### asignado
        Técnico asignado
        Fecha/hora agendada
      4. Técnico va a domicilio
        Inicia chequeo (foto+GPS)
        Diagnostica
        Sugiere precio
      5. Oficina aprueba precio
        Notifica al técnico
      6. Técnico ejecuta
        Trabajo realizado
        Foto cierre
      7. Cobra
        Operaria registra pago
        Genera Conduce CG
      8. Garantía activa
        Cliente puede reclamar
        Link público con token
    Sistemas auxiliares
      Asistente IA
      Ponche entrada/salida
      Comisiones
      Nómina quincenal
      Reportes DGII
      Banner versión
```

---

## 2. Flujos detallados por módulo

### 2.1 Flujo de orden completa

```mermaid
mindmap
  root((Orden))
    Origen
      Web /agendar
      Crear orden manual
      WhatsApp manual
      Garantía vigente reclamada
    Fases
      nuevo_lead
      en_gestion
      en_diagnostico
      en_cotizacion
      aprobado
      agendado
      trabajo_realizado
      cerrado
      cancelado
    Cierres posibles
      Reparación completa
        Genera comisión técnico
        Genera Conduce CG
      Solo chequeo
        RD$2,000 fijo
        SIN comisión técnico
        Genera Conduce CG por chequeo
      Reactivada post-chequeo
        Cliente regresó a reparar
        Comisión solo sobre reparación nueva
        Histórico chequeo persiste
      Cancelada
        Motivo obligatorio
        Auditoría
    Estados especiales
      Stand-by
        Esperando pieza externa
        Cliente no disponible
        Reactivable desde admin
      Garantía vigente
        Token público
        Reclamo descuenta técnico
```

### 2.2 Flujo del técnico

```mermaid
mindmap
  root((Vista Técnico))
    Inicio del día
      Ve agenda asignada
      Card ganancias quincena
      Banner versión nueva
    En cada orden
      Iniciar chequeo
        Captura foto obligatoria
        Captura GPS obligatoria
      Diagnostica equipo
      Sugerir precio
        Trabajo Realizado bloqueado
        Espera aprobación oficina
      Recibe notificación aprobación
      Marca trabajo realizado
      Cierra
        Reparación completa
        Solo chequeo
        Stand-by
    Final del día
      Ponche salida
        Foto + GPS
```

### 2.3 Asistente IA

```mermaid
mindmap
  root((Asistente IA))
    Roles con acceso
      Administrador
      Coordinadora
      Operaria
      Secretaria
      Técnico [FALTA - decisión pendiente]
    Tools disponibles
      query_ordenes
      count_ordenes
      get_orden_detallada
      query_clientes
      query_comisiones
      agenda_dia
      query_facturas
      query_piezas_usadas
      query_ponches [admin only]
      get_resumen_negocio
      crear_recordatorio
      query_garantias [REVISAR]
    Gaps identificados
      Filtro tecnicoNombre [FALTA]
      Modo voz [BACKLOG]
```

### 2.4 Web pública

```mermaid
mindmap
  root((Web Pública))
    Landing
      Hero
      Servicios
      Marcas que reparamos
      Cómo trabajamos
      Footer con WhatsApps
    /agendar
      Formulario configurable
      Bloques de hora
        9 AM, 11 AM, 1 PM, 3 PM, 5 PM
        Editables desde admin
      Domingos bloqueados
      Ubicación con Places
        Mini mapa confirmación
        Botón Mi ubicación
        Parser URL Maps
      Round-robin WhatsApp
      Pantalla éxito + WhatsApp
    /tracking/:token
      Cliente ve estado de su orden
    /garantia/:token
      Reclamar garantía
      Descripción del problema
    /cita/:calendarId
      Auto-agenda con calendario
    /f/:slug
      Formularios dinámicos
```

---

## 3. Reglas críticas de negocio

Estas son las reglas que MÁS importan recordar al planear cualquier sprint:

| # | Regla | Donde aplica |
|---|---|---|
| R1 | El técnico **NO cobra comisión sobre los RD$2,000 del chequeo**, ni siquiera si el cliente regresa después | `utils/comisiones.ts` |
| R2 | Si el cliente regresa para reparar después de un chequeo solo, se **REACTIVA la orden original** (no se crea nueva) | `OrdenCard`, fase pasa a `agendado` |
| R3 | La comisión de la reparación post-chequeo es **solo sobre el monto de reparación**, no incluye los RD$2,000 previos | `utils/comisiones.ts` |
| R4 | El técnico **NO puede marcar "Trabajo Realizado"** hasta que la oficina apruebe el precio sugerido | `TecnicoVista`, gate por `estadoAprobacion` |
| R5 | El precio default del chequeo es **RD$2,000**, configurable en `config/empresa` | `precioChequeoDefault` |
| R6 | Quincenas RD: Q1 día 30→14 paga 15, Q2 día 15→29 paga 30 | `utils/index.ts → rangoQuincena` |
| R7 | Garantía reclamada → **descuenta de la comisión del técnico** que hizo la orden original | Sistema de garantía |
| R8 | Conduces de Garantía (CG-####) son **internos**, paralelos a DGII (sistema sin facturación oficial) | `Refactor Factura→CG` |
| R9 | ITBIS 18% se calcula como referencia interna, no se reporta automáticamente | Configurable |
| R10 | Counters (OS, QT, FAC, CG) usan **transacciones atómicas** — nunca generar números client-side | `contadores.service.ts` |
| R11 | App Check + reCAPTCHA v3 protege endpoints públicos | `/agendar`, `/api/*` |
| R12 | Nunca eliminar permanentemente — usar flags `eliminado: true` para auditoría | Personal, órdenes, clientes |

---

## 4. Roles y permisos (resumen)

```mermaid
mindmap
  root((Roles))
    Administrador
      Acceso total
      Único que aprueba precios sugeridos
      Único que edita orden completa
      Configura tasas, bancos, ITBIS
    Coordinadora
      Confirma citas
      Aprueba precios
      Asigna técnicos
      Reactiva órdenes
    Secretaria
      Crea órdenes
      Confirma citas
      Recibe notificaciones nueva cita
      Reactiva post-chequeo
    Operaria
      Registra pagos
      Banners 9 y 11 AM
      Bono mensual por citas
      Envía a facturación
    Técnico
      Vista mobile dedicada
      Inicia chequeo
      Sugiere precio
      Cierra orden
      Ve sus comisiones quincena
```

---

## 5. Estados de cosas (state machines)

| Cosa | Estados posibles |
|---|---|
| **Orden** | nuevo_lead → en_gestion → en_diagnostico → en_cotizacion → aprobado → agendado → trabajo_realizado → cerrado / cancelado / stand-by |
| **Cita por confirmar** | pendiente → confirmada → cancelada |
| **Conduce CG** | emitido (no se anula, se reemite con nuevo número si hay error) |
| **Garantía** | vigente → reclamada → resuelta (con/sin costo) |
| **Pieza pendiente** | solicitada → en_camino → recibida → instalada / cancelada |
| **Personal** | activo → inactivo → eliminado |
| **Ponche** | abierto (entrada sin salida) → cerrado (con salida) |

---

## 6. Backlog / pendientes

### En curso
- [ ] Sprint flujo técnico — Plan B (reactivar post-chequeo + revertir comisión solo_chequeo). **Pendiente push.**

### Próximos sprints sugeridos
- [ ] **Filtro tecnicoNombre en tools IA** (`PROMPT_TECNICO_NOMBRE.md`) — 30 min
- [ ] **Sprint de pulido** (`PROMPT_PULIDO_POST_AGENDAR.md`) — 2-3h, smells acumulados
- [ ] Actualizar Manual PDF con cambios recientes

### Ideas / preguntas abiertas
- [ ] **Asistente IA para técnicos**: ¿darles acceso? con qué tools? [DECISIÓN PENDIENTE]
- [ ] **Modo voz en IA**: convertir input/output en audio para coord/operaria que tienen las manos ocupadas [BACKLOG]
- [ ] **Notificaciones push reales** (no solo in-app): integración con FCM o similar [BACKLOG]
- [ ] **Reportes de rentabilidad por técnico**: ya hay comisiones, falta dashboard de "quién genera más ingreso neto" [REVISAR]
- [ ] **Sistema de incentivos**: bonos por X órdenes/mes, X clientes nuevos/quincena [BACKLOG]

### Bugs/issues conocidos pero no críticos
- [ ] Markdown injection cosmético en mensaje WhatsApp prellenado (sanitizar `*`, `_`, `~`)
- [ ] `genDireccionId()` no se reusa en `clientes.service` (refactor menor)
- [ ] Race condition tolerable al confirmar cita (improbable, documentado)
- [ ] Campos stand-by quedan stale al reactivar orden
- [ ] `handleConfirmarChequeo` duplicado entre `AgendaDia` + `TecnicoVista`

---

## 7. Cómo se conecta todo (arquitectura mental)

```mermaid
mindmap
  root((Arquitectura))
    Frontend SPA
      React + Vite + TypeScript
      Tailwind
      Spanish UI
    Backend
      Firebase Firestore
        ordenes_servicio
        clientes
        personal
        usuarios
        citas_por_confirmar
        config_web/sitio
        config_web/contadores
        ponches
        comisiones
        conduces_garantia
        auditoria_admin
      Firebase Auth
        Email/password
        App Check + reCAPTCHA
      Firebase Storage
        Fotos de cierre
        Fotos de ponche
        Fotos de inicio chequeo
      Firebase Admin SDK
        /api/admin/crear-usuario
        /api/admin/reset-password
        /api/admin/cambiar-email
        /api/garantia/[token]
    Anthropic API
      Asistente IA
        Tool use loop
        max 10 iteraciones
    Vercel
      Deploy automático en push
      Webhook deploy hook
    GPS proxy
      /api/gps/ubicacion
      Wialon Samsara Traccar
    Multi-agent
      coordinator
      builder
      tester
      reviewer
      devops
```

---

## 8. Glosario rápido

| Término | Significado |
|---|---|
| **OS-####** | Orden de Servicio (counter atómico) |
| **CG-####** | Conduce de Garantía (sustituye factura interna) |
| **QT-####** | Cotización |
| **Quincena Q1/Q2** | Q1 = 30 anterior al 14, paga el 15. Q2 = 15 al 29, paga el 30. |
| **Round-robin** | Asignación rotativa de WhatsApps en `/agendar` |
| **Solo chequeo** | Cierre con RD$2,000 sin reparación |
| **Reactivada post-chequeo** | Orden cerrada como solo chequeo que se reabre porque el cliente regresó |
| **Stand-by** | Orden pausada (esperando pieza, cliente no disponible) |
| **App Check** | Firebase feature que bloquea requests sin token reCAPTCHA |
| **parseOrden / parseFactura / parseCita** | Helpers que rehidratan docs de Firestore con tipos correctos |

---

## 9. Flujo end-to-end del negocio

```mermaid
flowchart TD
    A[Cliente llega] --> B{Por dónde?}
    B --> C[Web /agendar]
    B --> D[WhatsApp manual]
    B --> E[Llamada]
    C & D & E --> F[Cita en citas_por_confirmar]
    F --> G[Coord/secretaria confirma]
    G --> H[Crea OS-####]
    H --> I[Asigna técnico]
    I --> J[Técnico va al domicilio]
    J --> K[Iniciar chequeo<br/>foto + GPS obligatorio]
    K --> L[Diagnostica]
    L --> M[Sugiere precio]
    M --> N{Oficina aprueba?}
    N -->|No| P[Negociar o cancelar]
    N -->|Sí| R{Cliente decide<br/>reparar?}
    R -->|Sí| O[Trabajo realizado<br/>+ foto cierre + GPS]
    R -->|No| T[Cierre Solo Chequeo<br/>RD$2,000 sin comisión]
    O --> S[Cierre normal<br/>+ comisión]
    T -.cliente regresa después.-> U[Reactivar para reparación]
    U --> M
    S --> V[Operaria registra pago]
    V --> W[Genera Conduce CG]
    W --> X[Garantía vigente activa]
```

---

> **Convención**: cuando edites este archivo, agrega tu inicial al final del nodo si quieres dejar nota.
> Ejemplo: `Sub1 [J: revisar esto el lunes]`
>
> **Última actualización**: por Cowork al final del sprint flujo técnico Plan B.

