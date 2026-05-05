# Sprint C2.5: Hardening de `api/ai/chat.ts`

Usa el subagente coordinator. Sprint SENSIBLE — toca endpoint público que consume API tokens (costo real).

## Contexto

El audit `docs/audit-2026-05-04.md` identificó que `api/ai/chat.ts`:
- **NO usa `verificarAppCheck`** (a diferencia de `api/garantia/[token].ts` y `api/portal-cliente/[token].ts`). Usa Firebase ID token Authorization Bearer, lo que autentica al usuario pero NO valida origen del request. Atacante con credenciales válidas robadas puede abusar el endpoint desde cualquier cliente.
- **A6 ALTO** del audit: rate limiting ausente. Bot puede abusar IA endpoints (consumo de tokens Anthropic = costo real para Jorge).
- **A7 ALTO** del audit: `err.message.substring(0, 300)` retornado al cliente en líneas 336 y 525. Expone arquitectura interna.
- **A8 ALTO** del audit: posibles logs con datos sensibles (revisar).

C2 (fase B App Check para los 2 endpoints de tokens) NO incluye este endpoint porque su auth es distinta. C2.5 lo cubre.

## Decisiones cerradas

### 1. Auth: agregar App Check ADEMÁS del Firebase ID token

Mantener `Authorization: Bearer <Firebase ID token>` (autentica usuario). AGREGAR `verificarAppCheck` (autentica origen del cliente). Ambos requeridos. Si cualquiera falla → 401.

```ts
// Inicio del handler:
const appCheck = await verificarAppCheck(req);
if (!appCheck.ok) {
  return res.status(401).json({ error: 'App Check token requerido' });
}
// Continuar con verificación de Firebase ID token...
```

El audit log de `app_check_audit` (sprint instrumentación commit `58115e2`) automáticamente registra requests al endpoint vía el wrapper en `api/_lib/firebaseAdmin.ts`.

### 2. Rate limiting por uid: 100 requests / día

Cap diario por `uid` (no por IP — usuario autenticado conocido). Implementación Firestore-based:

```ts
// Colección rate_limits/<uid>_ai_chat_<YYYY-MM-DD> con counter atómico via runTransaction
const fechaHoy = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
const limitRef = db.collection('rate_limits').doc(`${uid}_ai_chat_${fechaHoy}`);

const { count } = await db.runTransaction(async (tx) => {
  const snap = await tx.get(limitRef);
  const current = snap.exists ? (snap.data()?.count || 0) : 0;
  if (current >= 100) {
    throw new Error('rate-limit');
  }
  tx.set(limitRef, {
    uid,
    fecha: fechaHoy,
    count: current + 1,
    updatedAt: Timestamp.now(),
  }, { merge: true });
  return { count: current + 1 };
});
```

Si lanza `'rate-limit'` → respond `429` con mensaje accionable: "Alcanzaste el límite diario de 100 consultas IA. Reintenta mañana o contactá al administrador para aumentar tu cap."

**Configurabilidad**: cap por rol (en `config/rate_limits` doc), default 100 para todos. Admin tiene 1000.

### 3. Sanitización de errores

Líneas 336 y 525: NUNCA retornar `err.message` al cliente en producción. Mapear a códigos genéricos:

```ts
// Antes (línea 336):
return res.status(400).json({ error: `Petición rechazada por Anthropic: ${message.substring(0, 300)}` });

// Después:
console.error('[ai/chat] anthropic 400:', err);
return res.status(400).json({ error: 'Tu pregunta no pudo procesarse. Reformulala más simple.' });
```

```ts
// Antes (línea 525):
return res.status(500).json({ error: `Error ${message.substring(0, 300)}` });

// Después:
console.error('[ai/chat] error general:', err);
return res.status(500).json({ error: 'Error interno. Intentá de nuevo.' });
```

El log server-side mantiene el detalle completo para debugging. El cliente recibe genérico.

### 4. Sanitización de console.log/error

Buscar todos los `console.log`, `console.error`, `console.warn` en `api/ai/chat.ts` y verificar que NO loguean:
- Tokens (Authorization Bearer, App Check)
- Email del usuario
- Mensajes completos del usuario (pueden contener PII de clientes)

Si alguno lo hace, sanitizar dejando solo: `uid`, `endpoint`, `iteracion`, `error.code`/`error.status`, `tokensInput`/`tokensOutput`.

### 5. Firestore rules

```
match /rate_limits/{docId} {
  allow read: if false;        // solo Admin SDK
  allow write: if false;       // solo Admin SDK
}
```

Admin SDK bypassa. Defense-in-depth contra clientes accidentales.

### 6. Schema extension config_marketing-style

Doc `config/rate_limits`:

```typescript
{
  ai_chat: {
    administrador: 1000,
    coordinadora: 500,
    operaria: 200,
    secretaria: 200,
    tecnico: 100,        // ya bloqueado por iaHabilitada pero por si acaso
    ayudante: 100,
    default: 100,
  }
}
```

Si el doc no existe → fallback hardcoded `100` para todos.

### 7. Permisos NO cambian

`tieneAccesoAsistenteIA(rol, perfil)` sigue gateando. Este sprint solo agrega capas defensivas.

## Implementación recomendada (un solo commit)

Sprint chico-medio, ~1.5-2h. NO requiere split en commits internos porque toda la lógica vive en un solo handler.

### Paso a paso

1. **builder**: leer `api/ai/chat.ts` completo para entender flujo actual (Firebase ID token, tieneAccesoAsistenteIA, tools loop con max 10 iteraciones, persistencia conversaciones).
2. Agregar `verificarAppCheck` al inicio del handler ANTES de cualquier otra validación. Si falla → 401.
3. Después del check de Firebase ID token + permisos, ANTES de llamar `anthropic.messages.create`, hacer rate limit check transaccional. Si lanza → 429.
4. Reemplazar los 2 `err.message.substring(0, 300)` por mensajes genéricos. Mantener `console.error` con `err` completo para debugging.
5. Auditar todos los `console.*` del archivo. Sanitizar PII.
6. Agregar rule `rate_limits` en `firestore.rules`.
7. Crear doc seed `config/rate_limits` con caps por rol (manual una vez post-deploy, o via script).

## Verificación

### Tester
1. `npm run build` + `npm run lint`.
2. Greps:
   - `grep -n "verificarAppCheck" api/ai/chat.ts` → 1+ matches al inicio del handler.
   - `grep -n "rate_limits\|runTransaction" api/ai/chat.ts` → matches con la lógica de cap.
   - `grep -n "err.message.substring\|message.substring" api/ai/chat.ts` → 0 matches (deben haberse reemplazado).
   - `grep -n "rate_limits" firestore.rules` → matches con la rule deny clientes.
3. Verificación funcional leyendo código:
   - Request sin App Check → 401.
   - Request con App Check + Firebase ID token válido pero >100 requests del día → 429.
   - Request normal dentro del cap → flujo igual al actual + audit en `app_check_audit` + `rate_limits/{uid}_<fecha>` incrementado.
   - Error de Anthropic → cliente recibe mensaje genérico, server-side mantiene log completo.

### Reviewer
- Race condition rate limit: 2 requests del mismo uid en paralelo. `runTransaction` debe garantizar que ambos cuenten correctamente (Firestore reintenta tx en conflicto).
- Idempotencia parcial: si el handler arranca, increment counter, después falla en Anthropic, ¿el counter ya gastó el cap? **Decisión**: SÍ, es esperado (rate limit cuenta intentos, no éxitos). Si no, atacante puede hacer fuzzing sin penalización.
- Mensaje 429 accionable, no genérico.
- App Check audit log automático del wrapper de instrumentación (commit `58115e2`).
- Sanitización de console: ningún log con PII.

### Security
- Rule `rate_limits` deny clientes correcto.
- Verificar que `verificarAppCheck` se ejecuta ANTES del Firebase ID token check (orden de defense-in-depth: origen primero, identidad después).
- Considerar: si un usuario llega a 100 (cap), ¿el doc en `rate_limits` permanece 24h o se purga? **Decisión**: TTL via campo `fecha: 'YYYY-MM-DD'`, queries históricas pueden filtrar. Cleanup manual si crece.

### QA manual
- Login con usuario admin → enviar 5 mensajes IA → verificar `rate_limits/<uid>_ai_chat_<fecha>` count incrementa.
- Login con usuario operaria → mismo flujo, cap distinto (200).
- DevTools → request al endpoint sin header App Check → 401 esperado.

## Estimación

~1.5-2h con full equipo (coordinator + builder + tester + reviewer + security + devops + retro).

## Después del sprint

- Validar 24-48h con uso real que el cap de 100 default no es restrictivo para usuarios típicos.
- Si admin se queja del cap, ajustar config doc.
- Considerar dashboard de uso de IA por uid en `/admin/configuracion-ia` o similar.
- Sprint follow-up: implementar billing alerts si costo total IA mensual supera threshold.

## Estado: listo para ejecutar después de C2 fase B

Decisiones cerradas. Coordinator activa cuando:
- C2 fase B esté desplegado y validado.
- Métricas de `app_check_audit` confirmen cobertura de App Check >95%.
