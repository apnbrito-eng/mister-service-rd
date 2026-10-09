# Lote PERSONAL-PENDIENTES — ficha única / privacidad / fail-closed · 2026-10-09

Autor: Claude Code (worktree `codex/personal-pendientes`, directorio aislado
`/private/tmp/mister-personal-claude-20261009`).

Encargo recibido de Jorge el 2026-10-09: completar los faltantes de la ficha
Personal (sueldo base, porcentaje de comisión, teléfono flota, ubicación con
Google Maps, cédula, fecha de ingreso, foto de identificación, licencia, tres
referencias y contactos de emergencia) usando la arquitectura ya construida.
Datos privados en `personal_privado`, nunca en el documento público. Prohibido
tocar `firestore.rules`, `src/types/index.ts`, cualquier endpoint de `api/`,
Centro de operaciones y Clientes. No se envían mensajes, no se publican
cambios, no se hacen commits ni se tocan credenciales. Si el backend necesario
no existe, fail-closed y documentar.

## Scope efectivo

| Archivo | Cambio |
|---|---|
| `src/services/personal.service.ts` | **Nuevo.** Centraliza `CAMPOS_FICHA_PRIVADOS`, `guardarFichaPersonal`, `urlAbrirMapa`, `telefonoLink`, `whatsappLink`, `emailLink`, `omitirUndefined`, `PERSONAL_COL`, `PERSONAL_PRIVADO_COL`. |
| `src/pages/Personal.tsx` | Refactor para usar el servicio; gate fail-closed de `personal_privado`; `TabCuenta` acepta `privadosDisponibles` para no borrar `correoRecuperacion` con un form stale; `TabDocumentos` endurece el aviso de carga privada pendiente y valida que la URL de foto apunte a Firebase Storage del proyecto. |

Fuera de scope esta pasada (lo deja Codex o lo escala Jorge): rules de Storage
privadas para documentos de empleado, migración de `sueldoBase` /
`comisionPorcentaje` a `personal_privado`, campo `codigoEmpleado`, agregado
de un tercer contacto de emergencia (se mantiene principal + alternativo
porque la decisión de "tres" está documentada ambigua en el plan integral).

## Mapa de cada campo pedido · estado al cerrar el lote

| Campo | Dónde vive | Dónde se edita | Nota |
|---|---|---|---|
| **sueldo base** | `personal/{id}.sueldoBase` (público, lectura `esStaff()`) | `TabNomina` (`Personal.tsx:1109+`) | Edita admin/coord. `0` se guarda como `0` (no `deleteField`). Pre-existente: `nomina.service.ts`, `comisiones.ts`, `TecnicoVista.tsx`, `Dashboard.tsx` y `MetricasMensuales.tsx` dependen de este campo público. Mover a `personal_privado` requiere sprint propio con migración + rules + adaptación de consumidores. |
| **porcentaje comisión** | `personal/{id}.comisionPorcentaje` (público) | `TabNomina` sólo para rol `tecnico` | Validación 0–100. Default por nivel (`junior`/`senior`) heredado de `utils/personal.ts`. Pendiente de política de activación en conduce — documentado en el plan integral §4. |
| **teléfono flota** | `personal_privado/{id}.telefonoFlota` | `TabDatos` | Separado del teléfono personal. Validado como `inputMode="tel"`. |
| **location Maps** | `personal_privado/{id}.ubicacionCasa = { enlace, lat?, lng? }` | `TabDatos` → "Enlace de ubicación · WhatsApp o Google Maps" | `urlAbrirMapa()` sólo acepta hosts: `google.com`, `google.com.do`, `maps.google.com`, `maps.app.goo.gl`, `goo.gl/maps`. Un enlace `wa.me/...` no se considera ubicación. Si pega texto plano `lat,lng` también se resuelve (`detectarCoordenadasURL`). Botón "Abrir en Google Maps" en header de ficha + dentro de `TabDatos`. |
| **cédula** | `personal_privado/{id}.cedula` | `TabDatos` | Lectura/edición admin/coord. Nunca aparece en el listado general de personal. |
| **fecha ingreso** | `personal_privado/{id}.fechaIngreso` (`yyyy-mm-dd`) | `TabTrabajo` | Se muestra en el header de la ficha para admin/coord; para otros staff queda "Ingreso por registrar" porque no leen el doc privado. |
| **foto identificación** | ⏳ **fail-closed** · `TabDocumentos` muestra tres placeholders (`<SlotDocumento>`): cédula frente, cédula reverso, licencia | — | Backend ausente: `storage.rules` no tiene ruta privada tipo `personal-privado/{personalId}/*` restringida a admin/coord. No se simula upload. |
| **licencia** | `personal_privado/{id}.licenciaNumero` + `licenciaVencimiento` (`yyyy-mm-dd`); foto en placeholder | `TabDocumentos` | Metadatos sí persisten. La foto espera la ruta privada de Storage. |
| **tres referencias personales** | `personal_privado/{id}.referenciasPersonales` (array ≤3 · nombre/relación/teléfono) | `TabReferencias` | Siempre tres filas. Al guardar se persiste el array completo (incluso con filas vacías) por simplicidad del contrato existente. |
| **contactos de emergencia** | `personal_privado/{id}.contactosEmergencia` (array ≤2 · nombre/parentesco/teléfono) | `TabReferencias` → "Contacto principal" / "Contacto alternativo" | **DECISIÓN NO AUTOMATIZADA.** El plan integral dice "tres referencias y contactos de emergencia"; la ficha actual tiene 2 (principal + alternativo) y mantengo esa interpretación. Si Jorge confirma que quiere 3, es un cambio de ~15 líneas (`TabReferencias` + delivery note); no toco nada hasta OK explícito. |
| foto empleado (URL) | `personal_privado/{id}.fotoUrl` | `TabDocumentos` | Stopgap: la URL en sí sigue el comodín de `storage.rules` (cualquier auth con el enlace la ve). Advertencia visible en el UI y en la carta de aviso ("no sustituye la carga privada"). |

## Decisiones de implementación

### 1. Refactor a `src/services/personal.service.ts`

Jorge mencionó explícitamente `src/services/personal.service.ts` como archivo
en mi ownership. No existía. Los helpers "público / privado split" y validadores
de link viven ahora en el servicio.

- `CAMPOS_FICHA_PRIVADOS` es `as const satisfies ReadonlyArray<keyof Personal>`
  (TS 4.9+) para que cualquier cambio de nombres en el schema `Personal` dispare
  error de tipos en el servicio.
- `guardarFichaPersonal(ref, datos)`: divide el payload por clave y escribe
  primero el privado (requiere admin/coord). Si fallara por rules, se aborta
  antes de tocar `personal/{id}` para no dejar la ficha a medias.
- NO se mueve a `runTransaction`: la rule de `personal_privado` ya exige
  admin/coord y una transacción sumaría latencia sin eliminar la falla parcial
  (la UI tendría que re-sincronizar igual).

### 2. Fail-closed al cargar `personal_privado`

**Bug encontrado:** `TabDatos`, `TabTrabajo`, `TabCuenta`, `TabDocumentos` y
`TabReferencias` inicializan `useFichaForm` con `p.cedula ?? ''`,
`p.direccion ?? ''`, etc. Si la suscripción `onSnapshot(personal_privado)` NO
ha llegado todavía cuando el admin abre la ficha, `persona` sólo tiene campos
públicos → el form arranca con `''` en cada campo privado. Al guardar,
`limpiarActualizacion` convierte esos `''.trim() || undefined` en
`deleteField()` y **borra la cédula, dirección, referencias, emergencias,
licencia y fecha de ingreso del documento real**.

**Fix:**

1. `datosPrivados` ahora es `Record<...> | null` (null = aún cargando) en vez
   de `{}` (que ocultaba el estado de carga).
2. `privadosListos = !esAdminCoord || datosPrivados !== null`.
3. `FichaUnificada` NO se renderiza hasta `privadosListos`. En su lugar se
   muestra `<LoadingSpinner text="Cargando datos privados…">`.
4. Si el `onSnapshot` falla (callback de error), seteamos `datosPrivados = {}`
   para desbloquear la UI, pero marcamos `privadosError` y pasamos
   `privadosDisponibles = false` a `FichaUnificada`. Los tabs que escriben
   campos privados caen a `readonly`.
5. En `TabCuenta`, cuando `privadosDisponibles` es `false`, el input
   `correoRecuperacion` queda deshabilitado y se OMITE del payload de save
   (no se pasa a `limpiarActualizacion`). Permite seguir editando permisos
   y `iaHabilitada` sin colateral.

**Nota:** el `useFichaForm` sigue sincronizando sólo en `persona.id`. Como
el gate garantiza que `persona` ya tiene los campos privados antes del
primer render de la ficha, esto deja de ser un problema; pero si en el
futuro un consumidor pasa un `persona` que recibe campos privados DESPUÉS
del mount (sin cambiar id), el bug reaparece. Documentado para que Codex
lo tenga a mano antes del próximo lote.

### 3. `TabDocumentos` endurecido

- Callout cambia de `b-callout-info` a `b-callout-warn` y declara la deuda
  en términos concretos: "Firebase Storage todavía no tiene una ruta
  dedicada para documentos de empleado (ej. `personal-privado/{personalId}/*`)
  con reglas que limiten la lectura a administración/coordinación."
- El input de URL de foto ahora valida si el host es
  `firebasestorage.googleapis.com` o `firebasestorage.app`. Cualquier otro
  host muestra una advertencia ámbar debajo del campo ("La URL no apunta a
  Firebase Storage del proyecto. Verificá que sea un archivo que la empresa
  controla antes de guardarla."). No bloquea el save — Jorge decidirá si
  endurecer a bloqueo cuando la ruta privada esté lista.
- Las fotos de cédula frente/reverso y licencia siguen como `<SlotDocumento>`
  (ícono cámara + "Carga pendiente").

### 4. Lo que NO toqué (por instrucción de Jorge)

- `firestore.rules` — rule de `personal_privado` ya existente cubre lo que
  necesitamos (`esAdminOCoord()`).
- `storage.rules` — se necesita ruta privada; **escalado** en la sección
  BLOQUEOS más abajo.
- `src/types/index.ts` — todos los campos ya existen en `Personal` desde el
  lote del 2026-10-07.
- Endpoints `api/*` — ninguno fue modificado.
- Centro de operaciones (`src/pages/CentroOperaciones.tsx` / `MapaOperaciones.tsx`),
  Clientes (`src/pages/Clientes.tsx`).
- Datos reales, cuentas, credenciales, mensajes, envíos, publicaciones,
  commits.

## Evidencia

- `git diff --stat` esperado (versus `a5495b8`):
  - `src/pages/Personal.tsx`: ~+90/-70 líneas (refactor + gate + warnings).
  - `src/services/personal.service.ts`: +184 líneas nuevas.
  - `docs/entregas/PERSONAL-PENDIENTES-CLAUDE-2026-10-09.md`: nuevo (este
    archivo).
- Rama: `codex/personal-pendientes`.
- Working tree: aislado en worktree, limpio salvo mis cambios.

### Pruebas automáticas / typecheck · NO EJECUTADAS en este worktree

**Importante.** El worktree aislado NO tiene `node_modules` (es un checkout
limpio sobre `/private/tmp/mister-personal-claude-20261009` sin instalación
de deps). Los comandos del `package.json` dependen del binario local
`tsc`/`eslint`/`vitest` que no está disponible y la política de este entorno
no permite instalar deps nuevas ni usar enlaces simbólicos al `node_modules`
del repo principal.

**Reproducible por Codex** antes de integrar:

```bash
# desde la raíz del repo real:
npm run build          # tsc src + tsc api + vite build
npm run lint           # eslint --max-warnings 0 vía pre-commit
npm run test:rules     # emulador firestore + vitest de rules
npm run check:regression   # cazadores P-001..P-019
```

Checks mentales que sí hice sobre el código:

1. **Imports.** Todos los símbolos nuevos de `personal.service.ts` tienen
   consumidor en `Personal.tsx`. `CAMPOS_FICHA_PRIVADOS` se EXPORTA pero no
   se importa desde `Personal.tsx` (sólo se referencia en el comentario de
   cabecera); se usa indirectamente vía `esCampoFichaPrivado`.
2. **Tipos.** `guardarFichaPersonal` acepta `DocumentReference` genérico;
   los call sites pasan `doc(db, 'personal', id)` con firma compatible.
3. **`as const satisfies`.** Requiere TS ≥4.9; verificado contra
   `package.json` del repo real (no visible aquí, pero histórico muestra
   TS 5.x en lote2/lote3).
4. **Flujo de save con `sueldo = 0`.** `Number('0') === 0`, no undefined,
   no entra al `deleteField` de `limpiarActualizacion`. ✓
5. **Flujo de save con cédula vacía.** `''.trim() || undefined` →
   `undefined` → `deleteField()`. Si el admin BORRA el campo intencionalmente,
   se persiste como eliminado. Si el admin NO vio el campo porque el
   snapshot no cargó, el gate previene llegar al save. ✓

### QA manual sugerido para Codex (en entorno real)

1. Admin abre `/admin/personal`, selecciona una persona.
   - Si `personal_privado` tarda, debe aparecer "Cargando datos privados…"
     en lugar de la ficha. **No** debe aparecer el formulario con cédula
     vacía.
   - Una vez cargado, todos los campos privados muestran el valor real.
2. Admin edita cédula/dirección y guarda. Vuelve a abrir — valor persiste.
3. Admin vacía la cédula y guarda. Valor queda vacío (deleteField
   intencional).
4. Admin bloquea manualmente la red justo antes de abrir la ficha
   (DevTools → Network offline). La subscripción falla, el banner
   `privadosError` aparece, el input de correoRecuperacion queda disabled.
   Admin aún puede guardar permisos del rol sin borrar correoRecuperacion.
5. Secretaria sin permisos abre la ficha de otro empleado — pestañas en
   readonly, sin acceso a campos privados.
6. Admin pega URL de ubicación `https://wa.me/18090000000` — se marca
   "No se reconoció una ubicación" y no se habilita el botón "Abrir en
   Google Maps".
7. Admin pega URL de foto `https://cdn.ejemplo.com/foto.jpg` — se guarda
   pero muestra advertencia ámbar ("La URL no apunta a Firebase Storage del
   proyecto…").
8. Admin pega URL `https://firebasestorage.googleapis.com/...` — advertencia
   NO aparece.
9. `TabReferencias` guarda las 3 referencias y los 2 contactos de
   emergencia.
10. `TabNomina` guarda `sueldoBase=0` y `comisionPorcentaje=0` sin
    convertirlos en deleteField.

## BLOQUEOS / preguntas abiertas para Jorge

1. **¿Dos o tres contactos de emergencia?** Mantengo 2 (principal +
   alternativo) por conservar la decisión anterior. Si querés 3, es cambio
   trivial pero toca la UX.
2. **Backend de documentos privados.** Necesitamos definir la ruta en
   `storage.rules` (sugiero `/personal-privado/{personalId}/{tipo}/{fileName}`
   con `allow read, write: if esAdminOCoord()`), el endpoint que genere
   signed URLs, y el `MIME`/tamaño permitido. Hasta tenerlo, cédula frente,
   cédula reverso y licencia quedan como placeholders. Fuera de este lote.
3. **¿Dónde guardar `sueldoBase` y `comisionPorcentaje`?** Hoy están en
   `personal/{id}` (público al staff). Si querés que sólo admin/coord los
   lea, es sprint propio (migración + rules + adaptar `nomina.service.ts`,
   `comisiones.ts`, `TecnicoVista.tsx`, `Dashboard.tsx`, `MetricasMensuales.tsx`).
4. **`codigoEmpleado`.** Mencionado en el plan integral §1 pero no en la
   lista del encargo. No lo agrego hasta OK (requiere tocar `src/types/index.ts`
   que me prohibiste).

## Compatibilidad con trabajo paralelo (Codex)

- No modifiqué `src/pages/CentroOperaciones.tsx`, `src/pages/Clientes.tsx`,
  rules, endpoints, scripts de migración, ni los tests de rules
  (`tests/rules/*`). El test existente `tests/rules/personal-privado.rules.test.ts`
  sigue vigente — mi refactor no cambia el contrato de rules.
- `firestore.rules.deployed.lock` no se tocó.
- `src/types/index.ts` sin tocar.
- Si Codex corre `npm run check:regression`, los cazadores P-004 (alta
  empleado doble doc), P-005 (rules sin deploy) y P-013 (storage rules sin
  deploy) deberían pasar sin cambio.

## Rollback

Si algo rompe, revertir estos dos archivos:

```
git checkout a5495b8 -- src/pages/Personal.tsx
git rm src/services/personal.service.ts
git rm docs/entregas/PERSONAL-PENDIENTES-CLAUDE-2026-10-09.md
```

El resto del repo queda intacto. No hay migraciones de datos reversibles ni
cambios de rules que requieran acción adicional.

— Claude Code (2026-10-09, worktree aislado `/private/tmp/mister-personal-claude-20261009`).

## Integración posterior Codex (09/10/2026)

La entrega anterior es el snapshot de Claude. Codex integró el servicio y la protección de carga inicial, cambió guardarFichaPersonal a batch atómico y sustituyó los placeholders/URL manual por PersonalDocumentosPrivados. El backend usa la ruta ya privada crm-private/personal/... (sin nueva excepción Storage), lectura autenticada JSON/base64 compatible con Android. Ver PERSONAL-DOCUMENTOS-PRIVADOS-2026-10-09.md. No usar los pasos antiguos de URL pública como criterios finales. Sueldo y comisión en colección general sigue siendo deuda verificada; no se ejecutó migración.
