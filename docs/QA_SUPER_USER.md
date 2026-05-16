# QA Super Usuario — 5 cuentas dedicadas para sidepanel Claude

> **Qué es esto.** Cinco cuentas dedicadas en Firebase Auth + Firestore (una por rol) que la Claude del sidepanel (`Claude in Chrome`) usa para hacer QA E2E completo del software en un solo prompt, sin pausas humanas. Cada cuenta tiene permisos reales del rol correspondiente — la Claude del sidepanel se loguea como esa cuenta y ejerce el flujo real, no un mock.
>
> **Por qué.** Decisión de Jorge (2026-05-15, vía Cowork): eligió ruta B sobre tres alternativas:
> - **Ruta A** — super-admin único con todos los permisos. Rechazada: pierde la capacidad de validar que cada rol ve lo que debe ver.
> - **Ruta B** (esta) — 5 cuentas QA dedicadas, una por rol. Aceptada: ejercita rules reales sin tocar code.
> - **Ruta C** — override de impersonation en código. Rechazada: agrega complejidad + superficie de ataque permanente.
>
> **Origen del sprint:** SPRINT-QA-USER en `docs/sprints/COLA_AUTONOMA.md`. Sprint hermano `SPRINT-QA-USER-B` (esQA flag) queda pendiente si los reportes financieros empiezan a contaminarse con datos QA.

---

## El catálogo

Estas son las 5 cuentas. **No tocar emails, roles ni nombres simbólicos sin actualizar también `scripts/qa-sanity-check.ts` (catálogo `CUENTAS_QA`)**.

| Email | Rol | Nombre simbólico |
|---|---|---|
| `qa-secretaria@misterservicerd.com` | `secretaria` | QA Secretaria Sidepanel |
| `qa-tecnica@misterservicerd.com` | `tecnico` | QA Técnica Sidepanel |
| `qa-operaria@misterservicerd.com` | `operaria` | QA Operaria Sidepanel |
| `qa-coordinadora@misterservicerd.com` | `coordinadora` | QA Coordinadora Sidepanel |
| `qa-admin@misterservicerd.com` | `administrador` | QA Admin Sidepanel |

**Passwords:** NO se commitean. Viven sólo en el password manager personal de Jorge (1Password / Apple Keychain). Si alguno fuga, ver "Regeneración de passwords" abajo.

---

## Cómo se crearon

Jorge las creó manualmente vía `/admin/gestion-usuarios` (alta normal, NO desde Firebase Console). El alta desde la UI garantiza:

1. Doc en `personal/{auto-id}` con email, rol, nombre y `uid` poblado.
2. Doc espejo en `usuarios/{uid}` con rol consistente (invariante P-004).
3. Usuario en Firebase Auth con email + password.

Si una de las 3 partes falta → `scripts/qa-sanity-check.ts` lo detecta y reporta la clasificación correspondiente.

---

## Convención de uso

### Antes de una sesión QA

1. Verificar drift con el sanity check:
   ```bash
   npx tsx scripts/qa-sanity-check.ts
   ```
   Si retorna exit 1, leer las acciones sugeridas y corregir antes de seguir.

2. Hard refresh del browser donde corre Claude in Chrome (Cmd+Shift+R) — descarta cache de sesión vieja.

3. Logout completo si la sesión actual no matchea el rol que vas a probar.

### Orden recomendado de testing (1 prompt, sin pausas)

La Claude del sidepanel arranca como `qa-secretaria` (la que más flujo crea), avanza la orden por todos los roles, y termina en `qa-admin` para validar reportes. Detalle del prompt en `docs/QA_PROMPT_MAESTRO.md`.

Resumen del ciclo:

1. **qa-secretaria** → crea cita en `/admin/citas-por-confirmar`, confirma orden, asigna técnico (auto-deriva operaria).
2. **qa-tecnica** → en `/tecnico`, abre la orden, hace check-in (iniciar chequeo), llena wizard, sugiere precio.
3. **qa-coordinadora** → en `/admin/ordenes`, aprueba el precio sugerido, valida transición a `aprobado`.
4. **qa-tecnica** → vuelve a `/tecnico`, marca trabajo realizado, completa wizard de cierre (con foto + firma).
5. **qa-operaria** → emite conduce de garantía desde `/admin/facturas-pendientes`.
6. **qa-admin** → valida en dashboard que KPIs movieron + abre modal de orden y revisa renderizado completo + chequea histórico de notificaciones.

Cada paso debe reportar bugs estructurados + sugerencias UX (formato en `docs/QA_PROMPT_MAESTRO.md`).

### Datos de prueba obligatorios

- **Cliente:** siempre "QA Test" (un único cliente dedicado, NO crear uno nuevo por sesión).
- **Teléfono:** `8090000000` (placeholder reservado — no manda WhatsApp real porque no es número válido).
- **Observaciones de la orden:** `TEST QA <YYYY-MM-DD>` para forensia.
- **Equipo / fallas / piezas:** valores realistas pero claramente test (ej: equipo "Samsung TEST", falla "QA dummy fallo").
- **Fotos:** cualquier imagen — puede ser un emoji renderizado en canvas para evitar tener que subir archivos reales.

### Después de una sesión

1. **NO borrar las órdenes / conduces de prueba.** Sirven como histórico para detectar regresiones la próxima vez.
2. **Sí** marcar el conduce de prueba con observación `TEST QA <fecha>` para que el filtro de reportes financieros los excluya (en el futuro, cuando exista `SPRINT-QA-USER-B`).
3. Pegar el reporte estructurado en Cowork (desktop app) o al coordinator. Cowork decide si abre sprints de fix.

---

## Política de seguridad

**Prohibido:**

- Usar estas cuentas para crear datos reales en producción.
- Compartir passwords por chat, doc, email o cualquier canal.
- Commitear passwords (ni siquiera ofuscados) en este repo.
- Asignar permisos elevados a cuentas reales para "imitar el QA" — usar las QA dedicadas.
- Eliminar una cuenta QA sin antes confirmar que NO está referenciada en docs / scripts QA activos.

**Si una rule bloquea una acción legítima de la cuenta QA:**

NO ajustar la rule "para que el QA pase". Significa que un usuario real con ese rol también está bloqueado → reportar como bug real con el flujo exacto, y abrir sprint si Jorge confirma que el rol debería poder hacerlo.

**Si la cuenta QA puede hacer algo que el rol real NO debería:**

Bug de rules / permission escalation. Reportar como crítico. Verificar también el rol real (no asumir que la cuenta QA tiene un permiso especial — todas usan rules normales).

---

## Regeneración de passwords (fuga / rotación periódica)

Si Jorge sospecha que un password se filtró (Cowork lo mencionó por error en chat, screenshot pegado, etc.):

1. Ir a Firebase Console → Authentication → buscar el usuario por email.
2. Reset password (envía email al propio Jorge si el email es suyo, o regenera link).
3. Setear nuevo password en el password manager personal.
4. Correr `npx tsx scripts/qa-sanity-check.ts` para confirmar que la cuenta sigue accesible (el sanity check no valida password, sólo existencia + rol + invariantes).

Rotación recomendada: cada 90 días o cuando haya un incidente de fuga.

---

## Cómo escribir nuevos prompts QA que usan estas cuentas

Cualquier prompt QA nuevo (sub-flujo específico, regression test puntual, etc.) debe:

1. **Empezar declarando el rol QA que se asume logueado**. Ejemplo: `"Estoy logueada como qa-tecnica@misterservicerd.com en el sidepanel..."`.
2. **Listar el flujo paso a paso** con pausas mínimas — la Claude del sidepanel es buena clickeando, mala adivinando intención.
3. **Pedir reporte estructurado** con secciones: bugs estructurados, sugerencias UX, cobertura, evidencia.
4. **NO inventar emails alternativos**. Si necesitás un rol que no está en el catálogo (ej: super-admin custom), el sprint del prompt está mal dimensionado — ajustá scope o pedile a Jorge que apruebe ampliar el catálogo.

El prompt maestro de referencia vive en `docs/QA_PROMPT_MAESTRO.md`.

---

## Referencias cruzadas

- **Sprint origen:** `docs/sprints/COLA_AUTONOMA.md` → `SPRINT-QA-USER`.
- **Sanity check script:** `scripts/qa-sanity-check.ts`.
- **Prompt maestro E2E:** `docs/QA_PROMPT_MAESTRO.md`.
- **Kit QA browser general:** `docs/QA_BROWSER_CLAUDE.md` (incluye plantillas por rol y flujos puntuales — complementario a este doc).
- **QA E2E distribuido humano:** `docs/QA_E2E_DISTRIBUIDO.md` (cuando varios humanos prueban en paralelo — alternativa a la ruta sidepanel).
- **Invariante P-004** (alta doble doc personal/+usuarios/): `docs/PATRONES_REGRESION.md`. Las cuentas QA cumplen por construcción.

---

## Cambios al catálogo

Para agregar / quitar / modificar una cuenta QA:

1. Actualizar la tabla "El catálogo" en este doc.
2. Actualizar `CUENTAS_QA` en `scripts/qa-sanity-check.ts`.
3. Actualizar `docs/QA_PROMPT_MAESTRO.md` si el prompt referencia la cuenta por email.
4. Jorge crea la cuenta nueva manualmente vía `/admin/gestion-usuarios` (o la deshabilita en Firebase Console si se quita).
5. Correr `scripts/qa-sanity-check.ts` para confirmar consistencia.
6. Commit con mensaje `docs(qa): actualizar catálogo SPRINT-QA-USER <descripción>`.
