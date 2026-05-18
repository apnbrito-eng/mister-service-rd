# Postmortem — permission-denied en console al cargar /tecnico (listener comisiones sin where)

**Fecha del incidente:** detectado 2026-05-16 (QA E2E sidepanel), fix 2026-05-18
**Detectado por:** QA E2E ROL 2 + ROL 4 sobre qa-tecnica al cargar `/tecnico`
**Severidad:** baja (no bloquea funcionalidad — solo contamina console + sugiere patrón problemático)
**Patrón asociado:** clase nueva — listener Firestore en página rol-restringida sin where que matchee la rule. Proponer P-012 a futuro si recurre.
**Commits relacionados:**
- Introduce: histórico — el listener de comisiones en `TecnicoVista.tsx` existió desde "Fase 5" sin where filter (commit anterior a este postmortem; no rastreable a un sprint específico).
- Fix: `<pendiente>` (SPRINT-179 — 2026-05-18)

---

## Resumen ejecutivo

`TecnicoVista.tsx` suscribía a la colección `comisiones` completa sin filtro
`where('tecnicoId', '==', auth.uid)`. La rule de Firestore exige ese matcheo
para técnicos. Firestore rechaza la suscripción y emite `permission-denied`
en console. Funcionalmente la app seguía OK (la query nunca emitía datos,
pero un filter client-side esperaba algo igualmente vacío). Síntoma:
console contaminado en cada carga + sugerencia de patrón problemático.

---

## Timeline

| Hora | Evento |
|---|---|
| Histórico (pre-2026-05-16) | Listener creado sin where. Funcionalmente "funcionaba" porque el filter client-side `c.tecnicoId === userProfile.id` igualmente devolvía vacío. Console ruidoso ignorado. |
| 2026-05-16 10:41 / 11:09 | QA E2E ROL 2 + ROL 4 sobre qa-tecnica capturó el error: `@firebase/firestore: Firestore (10.14.1): Uncaught Error in snapshot listener: FirebaseError: [code=permission-denied]: Missing or insufficient permissions.` Solo aparece al cargar `/tecnico`, NO se replica en admin/coord. |
| 2026-05-18 | SPRINT-179 redactado a la cola. Coordinator audita estáticamente los listeners en `TecnicoVista.tsx`. Identifica el `onSnapshot(collection(db, 'comisiones'))` sin where como culpable principal (las rules de `ordenes_servicio` y `standby_piezas` permiten `esStaff()` global → no rechazan). |
| 2026-05-18 | Fix aplicado: `query(collection(db, 'comisiones'), where('tecnicoId', '==', currentUser.uid))`. Filtro client-side restante: solo `quincenaAsignada === quincena`. Dep array del effect cambia de `userProfile?.id` a `currentUser?.uid` (consistencia con el query). |

---

## Impacto

- **Usuarios afectados:** todos los técnicos al cargar `/tecnico`.
- **Funcionalidad bloqueada:** ninguna — la vista del técnico funciona OK (el listener ruidoso retornaba 0 docs y un filter client-side de quincena igualmente filtraba a vacío). La lista de comisiones del técnico nunca renderizaba datos reales para SUS comisiones — bug latente porque las comisiones de la quincena actual se mostraban en otra parte (admin, no /tecnico). 
- **Tiempo total fuera:** N/A — no hubo "fuera".
- **Severidad de negocio:** baja. Bug observable solo en DevTools. Si Sentry o similar reportara, sería ruido continuo.
- **Pérdida de datos:** NO.

---

## Causa raíz (5 porqués)

1. **¿Por qué Firestore emitía permission-denied?** — Porque el listener
   suscribía a la colección `comisiones` completa sin filtro.

2. **¿Por qué la rule rechaza la query?** — La rule `comisiones` exige
   `esAdminOCoord() || (esTecnico() && resource.data.tecnicoId == request.auth.uid)`.
   Firestore Rules rechaza queries que no garanticen vía `where` que cada
   doc retornado matchea la regla (no evalúa doc por doc en queries — exige
   garantía estructural en la query misma).

3. **¿Por qué la query no incluía el where?** — La intención del autor
   original parece haber sido "traer todas las comisiones de la quincena y
   filtrar por técnico en client-side". Probablemente copia de un patrón
   admin (donde `esAdminOCoord()` SÍ permite query full-collection) sin
   adaptación al contexto técnico.

4. **¿Por qué nadie cazó el error hasta el QA E2E?** — El error vive solo
   en console.error de Firestore SDK. No se lanza al UI, no se traduce a
   toast, no hay monitoring de logs en cliente. El filter client-side
   silenciaba el síntoma observable (lista vacía vs lista vacía == sin
   diferencia visible). Solo un humano abriendo DevTools en /tecnico lo
   detectaba.

5. **¿Por qué no hay sistema para detectar listeners sin where con rules
   restrictivas?** — **Causa raíz:** no existe un cazador determinístico
   que correlacione `match /<col>/<doc>` con `auth.uid == X` en rules con
   los `onSnapshot(collection(db, '<col>'))` sin where del codebase. Sería
   un sprint follow-up de complejidad media — requiere parsear rules +
   queries TypeScript. Por ahora se documenta la clase de bug en este
   postmortem y se confía en el regression_guardian para futuros casos.

---

## Lo que funcionó bien

- El QA E2E distribuido detectó el bug en una sesión. Sin esa práctica, el
  spam de logs seguiría desapercibido.
- El sprint vino con 3 hipótesis bien fundadas (H1/H2/H3). La auditoría
  estática confirmó H1 directamente sin necesidad de reproducir con
  sourcemaps.
- Las rules estaban correctamente escritas y enforce el principio de
  menor privilegio. El bug NO era de rules — era del cliente que asumía
  que podía hacer queries permisivas.

---

## Lo que falló

- Los `onSnapshot` sin where no tienen un cazador determinístico. Cualquier
  página nueva puede reintroducir el patrón.
- El filter client-side en runtime ocultaba que el listener nunca recibía
  datos. Si en el futuro el técnico debiera ver "sus comisiones de la
  quincena" en `/tecnico`, el feature estaría roto silenciosamente
  (lista vacía por permission-denied, no por no haber datos).
- El comentario `@safe-userprofile-id` en el código sugería que el autor
  conocía el riesgo de `userProfile.id` vs `auth.uid` pero NO consideró
  que la query misma debía cambiar — solo agregó un filter post-snapshot.

---

## Acciones tomadas (fix inmediato)

- `src/pages/TecnicoVista.tsx`: query con `where('tecnicoId', '==', currentUser.uid)`.
- Filter client-side reducido a `quincenaAsignada === quincena` solamente.
- Dep array del useEffect cambia a `currentUser?.uid` (consistencia con el
  filtro de la query).
- Comentario inline explicando por qué el where es necesario + referencia
  a este postmortem.

---

## Acciones preventivas (para que no vuelva)

- [ ] **Cazador determinístico (sprint follow-up):** detectar
  `onSnapshot(collection(db, '<col>'), ...)` sin `query(... where(...))`
  cuando la rule de esa colección tiene `auth.uid == X`. Sería P-012.
  Requiere parsear `firestore.rules` + AST del TSX. Pendiente porque
  primero hay que ver si recurre en otras páginas.
- [x] **Documentación:** este postmortem queda como referencia para futuros
  builders que vean listeners similares.
- [ ] **Sub-regla CLAUDE.md (futuro):** cuando una página de rol restringido
  (tecnico/operaria/secretaria/ayudante) suscribe a una colección, verificar
  que el `where` matchee el constraint de la rule.

---

## Métricas

- **Tiempo desde introducción hasta detección:** desconocido, probablemente
  meses (el listener existió desde "Fase 5" — pre-2026-04).
- **MTTR (detección hasta fix):** 2 días (2026-05-16 detección → 2026-05-18
  fix).
- **Es recurrencia de clase ya catalogada:** no — clase nueva.
- **Cazador propuesto:** P-012 (no creado en este sprint — pendiente si
  recurre).

---

## Lecciones aprendidas

- **Filter client-side NO sustituye where server-side.** Si la rule exige
  un constraint, el query DEBE incluirlo. El client-side filter es para
  refinamientos UX (ej: solo quincena actual entre las del técnico), no
  para sustituir reglas de seguridad.

- **console.error de Firestore SDK no es ruido — es señal.** Cualquier
  `permission-denied` en console indica que algo del data flow está
  mal-configurado. Vale la pena monitorear esos errores en producción
  (Sentry / equivalente) en lugar de ignorarlos.

- **Email al equipo del futuro (3 frases):** cuando suscribís a una
  colección desde una página rol-restringida, abrí
  `firestore.rules`, encontrá el `match /<col>/<docId>`, y copiá el
  constraint de `auth.uid` directo al where de tu query. Si la rule dice
  `tecnicoId == request.auth.uid`, tu query debe decir
  `where('tecnicoId', '==', currentUser.uid)`. No confíes en filtros
  client-side para reemplazar el constraint server-side.

---

## Referencias

- Sprint: `docs/sprints/COLA_AUTONOMA.md` SPRINT-179
- Log de ejecución: `docs/sprints/EJECUCION_AUTONOMA.md` (entrada 2026-05-18)
- Postmortem hermano (mismo patrón antes de catalogar): N/A (clase nueva)
