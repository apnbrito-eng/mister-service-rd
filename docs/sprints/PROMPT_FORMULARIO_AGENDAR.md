# Sprint: Formulario de agendamiento público + editor configurable

Usa el subagente coordinator.

## Objetivo

Reemplazar la página pública `/agendar` (que hoy muestra "No hay calendarios disponibles") por un formulario funcional que captura los datos de la cita y los escribe directo a `citas_por_confirmar`. El admin puede editar campos visibles, requeridos, labels y orden desde `/admin/web` sin tocar código.

## Decisiones tomadas

- Fase 1 (MVP funcional) + Fase 2 (configurable) en el mismo sprint
- Reemplazar `/agendar` (no agregar ruta paralela)
- Notificación a secretaria + coordinadora cuando llega un formulario
- Toggle para habilitar/deshabilitar el formulario completo

## Pre-investigación

Antes de codear, leer y reportar:
- Cómo está estructurado `/admin/web` (página `ConfiguracionWeb.tsx`) — secciones existentes, patrón de guardado.
- Schema de `config_web/sitio` actual — qué campos tiene.
- Schema de `citas_por_confirmar` — qué campos espera el sistema interno.
- Cómo el modal "Crear Orden" del admin captura los datos (lista exacta de campos que captura).
- Si hay rate limiting o anti-spam ya implementado en algún flujo público.

## Pasos

### 1. Tipos en `src/types/index.ts`

```typescript
export type CampoFormularioTipo =
  | 'text' | 'textarea' | 'tel' | 'email' | 'date' | 'time' | 'select' | 'checkbox';

export interface CampoFormularioPredefinido {
  id: 'nombre' | 'telefono' | 'email' | 'direccion' | 'sector'
    | 'equipoTipo' | 'equipoMarca' | 'equipoModelo' | 'fallaReportada'
    | 'fechaPreferida' | 'horaPreferida' | 'comoNosConocio';
  visible: boolean;
  requerido: boolean;
  label: string;
  placeholder?: string;
  orden: number;
}

export interface CampoFormularioPersonalizado {
  id: string;             // generado al crear (UUID o random)
  label: string;
  tipo: CampoFormularioTipo;
  requerido: boolean;
  opciones?: string[];    // solo para tipo 'select'
  placeholder?: string;
  orden: number;
}

export interface ConfigFormularioAgendar {
  habilitado: boolean;
  titulo: string;
  subtitulo: string;
  mensajeExito: string;
  mensajeDeshabilitado: string;
  notificarA: ('secretaria' | 'coordinadora' | 'administrador' | 'operaria')[];
  campos: CampoFormularioPredefinido[];
  camposPersonalizados: CampoFormularioPersonalizado[];
}
```

### 2. Defaults

Crear helper `src/utils/formularioAgendar.ts` que retorne la config default si no existe en Firestore:

```typescript
export function configFormularioAgendarDefault(): ConfigFormularioAgendar {
  return {
    habilitado: true,
    titulo: 'Agenda tu cita',
    subtitulo: 'Llena este formulario y te contactaremos en menos de 24 horas',
    mensajeExito: '✅ Recibimos tu solicitud. Te contactaremos pronto para coordinar la visita.',
    mensajeDeshabilitado: '⏸ Agendamiento temporalmente cerrado. Contáctanos por WhatsApp.',
    notificarA: ['secretaria', 'coordinadora'],
    campos: [
      { id: 'nombre',          visible: true,  requerido: true,  label: 'Nombre completo',          orden: 1 },
      { id: 'telefono',        visible: true,  requerido: true,  label: 'Teléfono',                 placeholder: '809-555-1234', orden: 2 },
      { id: 'email',           visible: true,  requerido: false, label: 'Email',                     orden: 3 },
      { id: 'direccion',       visible: true,  requerido: false, label: 'Dirección',                 orden: 4 },
      { id: 'sector',          visible: true,  requerido: false, label: 'Sector',                    orden: 5 },
      { id: 'equipoTipo',      visible: true,  requerido: true,  label: 'Tipo de equipo',            orden: 6 },
      { id: 'equipoMarca',     visible: true,  requerido: false, label: 'Marca del equipo',          orden: 7 },
      { id: 'equipoModelo',    visible: true,  requerido: false, label: 'Modelo del equipo',         orden: 8 },
      { id: 'fallaReportada',  visible: true,  requerido: true,  label: '¿Qué problema tiene tu equipo?', placeholder: 'Describe brevemente la falla...', orden: 9 },
      { id: 'fechaPreferida',  visible: true,  requerido: false, label: 'Fecha preferida',           orden: 10 },
      { id: 'horaPreferida',   visible: true,  requerido: false, label: 'Hora preferida',            orden: 11 },
      { id: 'comoNosConocio',  visible: true,  requerido: false, label: '¿Cómo nos conociste?',      orden: 12 },
    ],
    camposPersonalizados: [],
  };
}

export const TIPOS_EQUIPO_FORMULARIO = [
  'Lavadora', 'Secadora', 'Nevera/Refrigerador', 'Estufa', 'Aire Acondicionado',
  'Microondas', 'Lavavajillas', 'Otro',
] as const;

export const FUENTES_COMO_CONOCIO = [
  'Google', 'Facebook', 'Instagram', 'WhatsApp', 'Recomendación', 'Cliente recurrente', 'Otro',
] as const;
```

### 3. Servicio `src/services/formularioAgendar.service.ts`

```typescript
export async function obtenerConfigFormularioAgendar(): Promise<ConfigFormularioAgendar>
export async function guardarConfigFormularioAgendar(config: ConfigFormularioAgendar): Promise<void>
export async function enviarSolicitudAgendar(datos: Record<string, unknown>): Promise<{ ok: boolean; citaId?: string; error?: string }>
```

`obtenerConfigFormularioAgendar` lee `config_web/sitio.formularioAgendar`. Si no existe, retorna `configFormularioAgendarDefault()`.

`guardarConfigFormularioAgendar` hace `setDoc` con merge:true en `config_web/sitio` setando solo el campo `formularioAgendar`.

`enviarSolicitudAgendar`:
1. Valida formato del teléfono RD (normalizarlo a 10 dígitos).
2. Valida email si está presente.
3. Valida `fallaReportada` ≥ 10 chars.
4. Valida campos requeridos según la config actual.
5. Anti-duplicado: query `citas_por_confirmar` where `clienteTelefonoNormalizado == telefono` AND `createdAt > (now - 24h)`. Si existe, retorna error con mensaje "Ya recibimos tu solicitud reciente, espera nuestra llamada".
6. addDoc en `citas_por_confirmar` con:
   - `origen: 'formulario_publico'`
   - `clienteNombre, clienteTelefono, clienteEmail, clienteDireccion, clienteSector`
   - `equipoTipo, equipoMarca, equipoModelo`
   - `descripcionProblema: fallaReportada`
   - `fechaPreferida, horaPreferida` (si llenaron)
   - `comoNosConocio`
   - `camposPersonalizados: { ...los custom que llenaron... }`
   - `estado: 'pendiente'`
   - `createdAt: Timestamp.now()`
7. Después del create exitoso, invocar helper `notificarStaffNuevaCita(citaId, datos, configNotificarA)` que crea entries en `notificaciones` para los roles configurados.

### 4. Página pública `/agendar` — reescribir

`src/pages/CitaPublica.tsx` (o el archivo que renderiza `/agendar` actualmente):

- Al mount: leer config con `obtenerConfigFormularioAgendar()`.
- Si `config.habilitado === false`: mostrar el `mensajeDeshabilitado` + botón WhatsApp.
- Si habilitado: renderizar formulario.

**Estructura visual:**

```
┌─────────────────────────────────┐
│  [Logo Mister Service RD]       │
│                                  │
│  Agenda tu cita                  │  ← config.titulo
│  Llena este formulario y...      │  ← config.subtitulo
│                                  │
│  Nombre completo *               │
│  [_______________]               │
│                                  │
│  Teléfono *                      │
│  [_______________]               │
│                                  │
│  ...resto de campos visibles...  │
│                                  │
│  [Enviar solicitud] (brand color)│
│                                  │
│  ¿Prefieres llamarnos?           │
│  [WhatsApp directo]              │
└─────────────────────────────────┘
```

**Campos a renderizar:**
- Iterar `config.campos` filtrando `visible === true` y ordenando por `orden`.
- Para cada campo predefinido, usar el componente apropiado según el `id`:
  - `nombre, email, direccion, sector, equipoMarca, equipoModelo` → `<input type="text">`
  - `telefono` → `<input type="tel">` con normalización en blur
  - `fallaReportada` → `<textarea>`
  - `equipoTipo` → `<select>` con `TIPOS_EQUIPO_FORMULARIO`
  - `comoNosConocio` → `<select>` con `FUENTES_COMO_CONOCIO`
  - `fechaPreferida` → `<input type="date">` (mín hoy)
  - `horaPreferida` → `<input type="time">`
- Después de los predefinidos, iterar `config.camposPersonalizados` y renderizar según `tipo`.
- Asterisco rojo en label si `requerido === true`.

**Submit:**
- Validación client-side: verificar requeridos llenos, formato teléfono, email, falla ≥10 chars.
- Si OK: llamar `enviarSolicitudAgendar(datos)`.
- Mientras carga: botón disabled con "Enviando...".
- Si éxito: limpiar form + mostrar `config.mensajeExito` + botón "Enviar otra solicitud" o "Volver al inicio".
- Si error: toast con mensaje del backend (ej: "Ya recibimos tu solicitud reciente").

**Móvil-friendly:**
- Inputs grandes (py-3 px-4)
- Labels claros, no truncados
- Botón submit ancho completo, color brand
- Stack vertical (no grid en móvil)

### 5. Editor admin en `/admin/web`

En `src/pages/ConfiguracionWeb.tsx`, agregar nueva sección/tab **"📋 Formulario de Agendamiento"**.

Estructura del editor:

```
┌─────────────────────────────────────────────┐
│ 📋 Formulario de Agendamiento               │
│                                              │
│ ☑ Habilitar formulario                      │
│   (si OFF, el sitio público muestra mensaje  │
│    de cierre temporal con botón WhatsApp)    │
│                                              │
│ Título: [Agenda tu cita________________]    │
│ Subtítulo: [Llena este form...]             │
│ Mensaje de éxito: [textarea]                │
│ Mensaje cuando deshabilitado: [textarea]    │
│                                              │
│ Notificar a:                                 │
│ ☑ Secretaria  ☑ Coordinadora                │
│ ☐ Administrador  ☐ Operaria                 │
│                                              │
│ ─────────────────────────────────────       │
│ Campos del formulario                        │
│ (drag para reordenar)                       │
│                                              │
│ [≡] Nombre completo                          │
│     ☑ Visible  ☑ Requerido                   │
│     Label: [Nombre completo___]              │
│                                              │
│ [≡] Teléfono                                 │
│     ☑ Visible  ☑ Requerido                   │
│     Label: [Teléfono___]                     │
│     Placeholder: [809-555-1234___]           │
│                                              │
│ [...resto de campos...]                      │
│                                              │
│ ─────────────────────────────────────       │
│ Campos personalizados                        │
│                                              │
│ (vacío inicialmente)                         │
│                                              │
│ [+ Agregar campo personalizado]              │
│                                              │
│ ─────────────────────────────────────       │
│                                              │
│ [Vista previa]    [Guardar cambios]          │
└─────────────────────────────────────────────┘
```

**Comportamiento:**
- Drag-and-drop para reordenar campos (usa `react-beautiful-dnd` si ya está instalado, sino implementación manual con `draggable`).
- Modal "Agregar campo personalizado" pide: label, tipo (select), requerido (checkbox), opciones (si tipo=select), placeholder.
- Botón "Vista previa" abre modal con render exacto del formulario público (sin submit funcional).
- "Guardar cambios" hace `guardarConfigFormularioAgendar(config)` → toast éxito.
- Validación: si admin pone `habilitado=false` y guarda, advertir "El formulario público está temporalmente deshabilitado".

### 6. Notificaciones al staff

Crear helper en `src/services/notificaciones.service.ts` (o reusar el existente):

```typescript
export async function notificarStaffNuevaCita(
  citaId: string,
  datosCliente: { nombre: string; telefono: string; equipoTipo?: string },
  rolesNotificar: Rol[]
): Promise<void> {
  // Para cada rol en rolesNotificar:
  //   Buscar usuarios activos con ese rol en personal
  //   Crear notificación in-app:
  //     {
  //       tipo: 'cita_nueva_formulario_publico',
  //       titulo: '🆕 Nueva solicitud de cita',
  //       mensaje: `${nombre} (${telefono}) — ${equipoTipo}`,
  //       citaId,
  //       leida: false,
  //       createdAt: now,
  //       destinatarioUid,
  //       destinatarioRol,
  //     }
}
```

### 7. Validaciones del teléfono RD

Reusar el helper `normalizarTelefono(raw)` que ya existe en `src/utils/index.ts` (per CLAUDE.md). Si no existe: 
- Strip non-digits
- Si tiene 11 dígitos y empieza con 1, drop el 1
- Devolver últimos 10
- Si después de eso no son exactamente 10 dígitos, retornar `null` (inválido)

### 8. Anti-spam / rate limiting

**Fase 1:** confiamos en App Check + el check de duplicado por teléfono en últimas 24h. No implementamos rate limit por IP en este sprint.

**Documentar como deuda técnica futura:** "agregar rate limit por IP via Firebase Functions o Vercel middleware si vemos abuso real."

### 9. Verificación

- Typecheck + lint.
- Tester:
  - Cargar `/agendar` sin auth en incógnito → ve el formulario con campos default.
  - Llenar y enviar → toast de éxito + entry creada en `citas_por_confirmar`.
  - Como admin/coord → verificar notificación in-app.
  - Como admin → ir a `/admin/web` → editar form → cambiar label de "Teléfono" a "Tu número de contacto" → guardar.
  - Volver a `/agendar` (incógnito o hard refresh) → label actualizado.
  - Marcar `habilitado: false` → guardar → `/agendar` muestra mensaje de cierre temporal.
  - Volver a habilitar.
  - Agregar campo personalizado "¿Tu equipo está bajo garantía?" tipo checkbox → guardar → aparece en `/agendar`.
  - Enviar form 2 veces con mismo teléfono en menos de 24h → segunda vez muestra mensaje "Ya recibimos tu solicitud reciente".
- Reviewer:
  - Strip undefined antes de addDoc/setDoc en TODOS los flujos.
  - Validación de teléfono ocurre tanto en frontend como en service (defense in depth).
  - El form NO expone secretos (config_web es público pero solo expone los campos que el form necesita renderizar, no datos sensibles).
  - Mobile responsive verificado al menos mentalmente.

### 10. Commit

```
feat(agendar): formulario público funcional + editor configurable

- /agendar reemplazado: ahora muestra formulario completo en lugar de
  "no hay calendarios disponibles". Captura nombre, teléfono, email,
  dirección, sector, equipo (tipo/marca/modelo), falla reportada, fecha/
  hora preferida y "cómo nos conoció".
- Submit valida formato (teléfono RD 10 dígitos, email válido, falla
  ≥10 chars), bloquea duplicados (mismo teléfono en últimas 24h), y
  escribe a citas_por_confirmar con origen='formulario_publico'.
- Notificaciones in-app automáticas a secretaria + coordinadora cuando
  llega un nuevo lead.
- Editor en /admin/web → "Formulario de Agendamiento": admin puede
  cambiar título/subtítulo/mensajes, ocultar campos, hacer requeridos,
  reordenar con drag, agregar campos personalizados (text/textarea/
  select/checkbox/etc), y deshabilitar el formulario completo
  temporalmente.
- Vista previa antes de guardar.
- Config persiste en config_web/sitio.formularioAgendar.
- Defaults sensatos si la config no existe.

Resuelve el bloqueo histórico: la página /agendar ahora SI funciona
para el cliente final, sin necesidad de configurar calendarios primero.
La secretaria gestiona los leads desde /admin/citas igual que cualquier
otra cita por confirmar.
```

## Ante cualquier ambigüedad

Pregunta con AskUserQuestion antes de tocar código. Especialmente:
- Si `/admin/web` tiene estructura de tabs vs scroll de secciones — adaptar la nueva sección al patrón existente.
- Si la lib drag-and-drop NO está instalada — proponer alternativa simple (botones ↑↓ por campo) en vez de instalar nueva dep.
- Si el campo `equipoTipo` debe usar el mismo array que el modal de Crear Orden (sincronizado) o uno propio del formulario público.
- Si hay un componente reutilizable para forms admin que convenga usar.
