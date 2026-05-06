# Catálogo de patrones de regresión

> Cada entrada aquí corresponde a un bug real que rompió producción.
> El cazador automático se referencia por archivo. Los falsos positivos
> se manejan con allowlist en el header del cazador, NO desactivando.

---

## P-001 — `userProfile.id` usado donde se requiere `auth.uid`

**Bug original:** `afc5e4a` (Reactivación, 2026-05-05) y `b93625d` (Notificaciones, 2026-05-06).

**Síntoma:** Permission-denied silencioso para usuarios cargados vía cascada
`personal/` (operarias/secretarias/técnicos). Para administradores con doc
en `usuarios/{uid}` pasa desapercibido.

**Causa raíz:** `AppContext` carga el perfil desde `usuarios/{uid}` (donde
`id == uid`) o, fallback, desde `personal where email==` (donde `id == doc id de personal`).
Las rules de Firestore validan `request.auth.uid`, no el `userProfile.id`.

**Regla:** cualquier write/read gateado por una rule del estilo
`X == request.auth.uid` debe usar `currentUser.uid` del context, NO
`userProfile.id`.

**Cazador:** `scripts/invariantes/check-userprofile-id-misuse.ts`.

**Allowlist:** ninguna en el momento de creación. Si aparecen falsos
positivos, agregarlos al header del cazador con comentario.

---

## P-002 — Rule de inmutabilidad sobre campo opcional sin `.get()`

**Bug original:** `c7c8e34` (Reactivación rules, 2026-05-05).

**Síntoma:** Permission-denied al hacer update normal (no overrideado) en una
campaña. Sólo aparece cuando el campo opcional está ausente en el doc.

**Causa raíz:** Acceder `request.resource.data.X == resource.data.X` sólo
funciona si `X` está garantizado present desde el primer create. Para
campos opcionales/condicionales, ambos lados pueden estar missing y
Firestore Rules NO resuelve eso como `null == null` con acceso directo.

**Regla:** rules que comparan campos opcionales (existencia condicional)
deben usar `request.resource.data.get('X', null) == resource.data.get('X', null)`.

**Cazador:** `scripts/invariantes/check-rules-immutability.ts` — escanea
`firestore.rules` buscando comparaciones directas en campos que no aparecen
como required en las funciones de validación de la misma rule.

**Allowlist:** la rule debe documentar en comentario qué campos son
required (existencia garantizada) para que el cazador no grite.

---

## P-003 — Mutación cross-collection sin `runTransaction`

**Bug original:** patrón establecido en gotcha CLAUDE.md, riesgo activo en
features futuras.

**Síntoma:** Estado inconsistente cuando una mutación toca 2+ colecciones y
una falla a mitad de camino (ej: orden updateada, audit log no escrito).

**Causa raíz:** `updateDoc` + `addDoc` en la misma función no son atómicos.
Si la red corta entre ambas, queda parcial.

**Regla:** si una mutación toca 2+ colecciones (incluyendo `auditoria_admin`,
`comisiones`, etc.), envolverlas en `runTransaction`. La verificación de
idempotencia (`if (data.flag) return`) va DENTRO del callback DESPUÉS del
`tx.get()`.

**Cazador:** `scripts/invariantes/check-cross-collection-tx.ts` — busca
funciones en `src/services/*.ts` que hagan ≥2 llamadas de mutación
(`updateDoc`, `setDoc`, `addDoc`, `deleteDoc`) sobre `db, '...'` distintos
sin estar dentro de `runTransaction(...)`. Caza por nombre de función
exportada.

**Allowlist:** funciones intencionalmente no-transaccionales (ej:
backfills/migraciones one-shot) marcadas con comentario
`// @safe-non-tx: <razón>` arriba de la función.

---

## P-004 — Alta de empleado sin crear doc espejo en `usuarios/{uid}`

**Bug original:** SPRINT-105 (2026-05-06) — antes del fix, `GestionUsuarios.tsx`
creaba el Auth user + el doc `personal/{auto-id}` pero NO el doc
`usuarios/{uid}`. Patrón también presente en el segundo flujo "dar acceso a
empleado existente".

**Síntoma:** El empleado nuevo loguea correctamente pero su `userProfile.id`
cae al fallback `personal where email==` → `userProfile.id == personalDocId !==
auth.uid`. Cualquier rule que valide `X == request.auth.uid` rechaza sus
writes silenciosamente. Es el mismo vector que P-001, pero la causa raíz es
upstream (en el alta misma).

**Causa raíz:** El form de alta sólo escribía `personal`. La migración masiva
(`scripts/backfill-usuarios-desde-personal.ts`, commit `1353b84`) cubrió a los
21 empleados existentes pero no a futuros. Cualquier técnico/operaria #22 lo
reintroducía.

**Regla:** cuando un flujo crea un `createUserWithEmailAndPassword`, debe
también escribir `setDoc(doc(<db>, 'usuarios', cred.user.uid), {...})` en el
mismo archivo. Patrón seguro: usar el `secondaryDb` del `secondaryApp` para
escribir bajo la sesión del propio user creado (defense-in-depth — funciona
aunque rules cambien en el futuro a "solo cada user crea su propio doc").

**Cazador:** `scripts/invariantes/check-alta-empleado-doble-doc.ts` — escanea
`src/**` y `api/**`, busca archivos con `createUserWithEmailAndPassword` y
verifica que aparezca `setDoc(doc(... , 'usuarios', ...))` en el mismo archivo.

**Allowlist:** comentario `// @safe-no-usuarios-mirror: <razón>` en el header
del archivo lo excluye (raro — sólo aplica a migraciones one-shot o endpoints
serverless que crean Auth sin necesitar espejo).

---

## Plantilla para agregar nuevo patrón

Cuando un sprint cierra un bug que rompió producción, agregar acá:

```
## P-XXX — <nombre corto>

**Bug original:** <hash + fecha>

**Síntoma:** <cómo se manifiesta>

**Causa raíz:** <por qué pasa>

**Regla:** <qué hacer / qué no hacer>

**Cazador:** `scripts/invariantes/check-<algo>.ts`

**Allowlist:** <archivos legítimamente excluidos, si aplica>
```

Y crear el cazador correspondiente en `scripts/invariantes/`.
