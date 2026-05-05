# Retro — Sprint Mapa Clientes + Reactivación (2026-05-04)

## Contexto

Sprint de tres commits encadenados que entregó el módulo Mapa de Clientes con tres vistas Leaflet, el tab Reactivación con plantillas WhatsApp, audit log persistente, schema nuevo, rules endurecidas y ROI tracking fase 2 (orden enlazada al cliente reactivado).

## Commits desplegados

- **C1 `d1d39b0`** — `feat(clientes): tab Mapa con sidebar filtros + 3 vistas Leaflet`
- **C2 `a38eb89`** — `feat(reactivacion): tab Reactivacion + plantillas WhatsApp + audit + schema`
- **C3 `800e0b4`** — `feat(reactivacion): ROI tracking — orden.reactivadaPor + totalReactivados + badge UI`

Rules deployadas con `npm run deploy:rules` dos veces (post-C2 y post-C3).

## Qué salió bien

- **Override de stack en C1.** El architect detectó que el prompt original sugería Google Maps mientras el repo ya estaba con Leaflet. La decisión se tomó antes de escribir código: ahorro ~170KB gz, costo Maps API evitado, cero deuda de stack heterogéneo.
- **Atomicidad real en `runTransaction` 3-way.** Tanto `marcarClienteEnviado` como `marcarOrdenReactivada` envuelven cliente + campaña + audit en una sola transacción. Optimistic locking nativo de Firestore garantiza consistencia bajo concurrencia.
- **Idempotencia post-mortem-proof.** El chequeo `yaEstabaEnviado` y la validación de `reactivadaPor` se hacen DENTRO del callback de `runTransaction`, después del `tx.get`. Patrones reutilizables para futuras mutaciones cross-collection.
- **Sin loops CHANGES_NEEDED en C1 ni C3.** El builder produjo código listo en primera iteración.
- **Rules versionadas + deploy disciplinado.** `npm run deploy:rules` dos veces sin tocar Firebase Console.

## Qué se complicó

- **C2 iter 1 — rules débiles.** El tester dio GO con rules que dejaban manipulables 12 campos sensibles del cliente y permitían incrementar `totalEnviados` arbitrariamente. El reviewer las cazó porque aplicó el mental model de "cliente con auth válida que se vuelve hostil". Tester no audita inmutabilidad.
- **Audit log fuera de transacción en C2 iter 1.** Builder lo dejó como `addDoc` separado post-tx. Reviewer pidió moverlo dentro del callback para preservar atomicidad ante crashes.
- **Lectura stale del listener padre en C3.** Entre `marcarClienteEnviado` y el `addDoc(orden)` siguiente, el listener real-time del componente padre no había refrescado. Workaround: `getDoc` fresh post-mutación. Costo: una lectura extra, evita race condition.
- **Bug pre-existente detectado.** `src/pages/Mantenimiento.tsx:80` usa `ordenesSnap.size + 1` para numerar órdenes. Viola la regla de oro "Counters must use transactions". NO se arregló acá (no es refactor opportunista) — anotado como deuda crítica para sprint propio.

## Aprendizajes accionables

1. **Mutaciones cross-collection van en un solo `runTransaction`, audit logs incluidos.** Idempotencia chequeada DENTRO del callback después del `tx.get`, no antes. (Documentado ya en CLAUDE.md.)
2. **Reviewer obligatorio cuando el sprint toca `firestore.rules`.** Tester no caza inmutabilidad ni defense-in-depth. (Documentado ya en CLAUDE.md.)
3. **`getDoc` fresh post-mutación cross-collection** cuando un downstream depende del campo recién escrito y el listener real-time aún no propagó.
4. **Override de spec del usuario por convención del repo.** Cuando prompt pide stack X y repo usa Y, architect levanta bandera y coordinator decide sin escalar a Jorge.

## Estado consolidado de la sesión 2026-05-04

- Sprint Conduces SIBS — 5 commits + cleanup. Cerrado.
- Sprint Mapa + Reactivación — 3 commits + 2 deploy:rules. Cerrado.
- Audit Críticos — 4/5 desplegados. C2 fase B pendiente ventana 24-48h.
- Cleanup consolidado — 9/14 ítems resueltos.

## Recomendación para próximos sprints (orden de prioridad)

1. **Sprint deuda `Mantenimiento.tsx:80` counter.** Único bug que puede causar inconsistencia de datos en producción (colisión de números de orden). ~30 min.
2. **C2 fase B App Check** una vez transcurrida la ventana 24-48h de métricas.
3. **Sprint C2.5 hardening `api/ai/chat.ts`.**
4. **Sprint repo-wide N6.5** sobre 20+ callsites locales pendientes.

## Métricas globales de la sesión completa

- ~20 commits desplegados (Conduces SIBS + Cleanup + Audit + Instrumentación + Mapa + 2 deploy:rules).
- ~+8000-10000 LOC.
- ~5-7 loops CHANGES_NEEDED total.
- Mayoría de sprints sin loops.

## Riesgos pendientes

- `Mantenimiento.tsx:80` — riesgo activo de colisión de números.
- C2 App Check fase B — bloqueado a métricas.
