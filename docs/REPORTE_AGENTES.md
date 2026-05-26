# 🤖 Reporte de Agentes — Mister Service RD

> **2026-05-25.** Todos los agentes que trabajan en este proyecto, qué hace cada uno y cuál es su responsabilidad. Pensado para leer/analizar con calma. Dos equipos distintos: el de **Claude Code** (tu equipo permanente, viven en `.claude/agents/*.md`) y el de **Cowork** (los que yo levanto dentro de una conversación).

---

## PARTE A — Equipo de Claude Code (17 agentes permanentes)

Son tu "empresa" de software. El único que habla contigo es el **coordinator**; él reparte el trabajo al resto. Los agrupo por función para que sea más fácil de analizar.

### 🎖️ Mando (deciden y reparten)

**1. coordinator** — *El jefe de obra. Tu única interfaz.*
Entiende el negocio (taller de electrodomésticos), recibe lo que pides en español, lo parte en tareas concretas y se las delega a los demás. **Nunca escribe código él mismo.** Tiene el modo autónomo que se dispara con `trabaja` / `procesa cola`. Responsabilidad: que cada pedido tuyo termine bien, en orden, sin romper nada.
*Herramientas: puede invocar a los otros agentes, leer, buscar, correr comandos.*

**2. tech_lead** — *El segundo al mando.*
Toma decisiones técnicas de alto nivel, estima esfuerzo, prioriza dentro de un sprint y dirige las retrospectivas. No escribe código pero entiende todo el sistema. Responsabilidad: que las decisiones técnicas sean sólidas y bien priorizadas.

### 🔨 Construcción

**3. builder** — *El que pone las manos en el código.*
Implementa los cambios siguiendo las reglas de `CLAUDE.md`. **Nunca commitea directo** — devuelve un resumen de los cambios al coordinator para que pasen por revisión. Responsabilidad: escribir el código correcto respetando las convenciones del proyecto.

### ✅ Verificación antes de guardar (corren después del builder)

**4. tester** — *Control de calidad automático.*
Corre el typecheck, el lint y busca regresiones conocidas. Devuelve GO (pasa) o NOGO (no pasa). Responsabilidad: que nada roto llegue al commit.

**5. reviewer** — *Revisión con ojos frescos.*
Lee los cambios del builder como si fuera otra persona (no escribe código). Caza regresiones, duplicación, violaciones de convención y "malos olores" de diseño. Responsabilidad: segunda opinión independiente antes de guardar.

**6. regression_guardian** — *Cazador de bugs que ya pasaron.*
Lee el cambio y verifica que no reintroduzca ninguno de los patrones de bugs históricos catalogados (P-001…P-024). Complementa los "cazadores" automáticos: atrapa lo que el grep no ve. Responsabilidad: que un bug ya resuelto no vuelva por otra puerta.

**7. security** — *Ingeniero de seguridad.*
Audita cuando se tocan reglas de Firestore, login, endpoints `/api/*`, App Check o datos sensibles. Verifica defensa en profundidad y previene fugas de datos. Responsabilidad: que ningún cambio abra un hueco de seguridad.

### 🧠 Lógica de negocio y dinero (miran el TODO, no solo el archivo)

**8. guardian_logica** — *El que revisa que la lógica cierre de punta a punta.*
Mira el flujo completo y la coherencia entre módulos (sobre todo la contabilidad). No le importa solo que compile, sino que el negocio cuadre. Corre en paralelo, lee la memoria viva y el mapa de riesgo. Avisa cuando un flujo no cuadra (ej.: una garantía que descuenta mal, un pago que no sincroniza la fase). Responsabilidad: que los módulos encajen bien entre sí de principio a fin. *(Este lo creamos juntos hace poco.)*

**9. auditor_contable** — *El contador auditor.*
Especialista en los módulos de dinero (pagos, facturación, comisiones, nómina, préstamos, gastos, bancos, cotizaciones, contadores). Solo lee y **reporta** — no arregla. Si encuentra un bug de plata, lo documenta y propone un sprint; si el arreglo toca reglas o datos masivos, lo escala para tu OK. Responsabilidad: que las cuentas estén bien y los errores de dinero no pasen silenciosos. *(También lo creamos hace poco.)*

### 📐 Diseño y planeo (antes de construir)

**10. architect** — *El arquitecto.*
Diseña el plan técnico de las features grandes ANTES de implementarlas. Identifica impactos cruzados (reglas, índices, tipos, servicios, componentes). No escribe código de producción — entrega un plan que el builder sigue. Responsabilidad: que lo grande se piense antes de tocarlo.

**11. user_advocate** — *La voz del que usa el software.*
Representa a técnicos en el campo, secretarias, coordinadoras, operarias y clientes. Valida que la feature realmente sirva en la vida real, no solo en teoría. Detecta fricción, pasos de más, suposiciones falsas. Responsabilidad: que el software sea usable de verdad.

**12. qa** — *Líder de pruebas manuales.*
Genera los planes de prueba que TÚ ejecutas a mano sobre los flujos críticos. Es el puente entre el tester (automático) y el reviewer (estático). Responsabilidad: darte una guía clara de qué probar antes de confiar en un cambio.

### 💾 Memoria y aprendizaje (que no se pierda nada)

**13. memoria** — *El guardián del estado actual.*
Mantiene `MEMORIA_MAESTRA.md` siempre al día: qué está pendiente, en curso, hecho reciente, y tus decisiones. El coordinator lo llama al cerrar cada pasada; yo (Cowork) al cerrar cada conversación. Ve el AHORA. Responsabilidad: que cualquier sesión nueva arranque con todo el contexto sin que tengas que re-explicar.

**14. archivist** — *El historiador de incidentes.*
Tres modos: consulta el historial ANTES de tocar algo (qué pasó antes con esto), genera el análisis (postmortem) de cada bug de producción, y mide tendencias del sistema anti-regresión. Ve el TIEMPO. Responsabilidad: que cada error se vuelva aprendizaje guardado, no anécdota.

**15. mejora_continua** — *El ingeniero de mejora continua.*
Antes de sugerir algo, analiza TODO el sistema para que sus propuestas no introduzcan contradicciones y resuelvan causas raíz, no síntomas. Detecta patrones problemáticos entre archivos que ningún otro agente ve (porque trabajan acotados a su sprint). Responsabilidad: reportar deuda técnica priorizada y oportunidades de refactor de fondo.

### 📄 Documentación y despliegue

**16. docs** — *El redactor técnico.*
Mantiene la documentación sincronizada con los cambios: `CLAUDE.md`, `README.md`, los archivos de `docs/sprints/` y comentarios clave en el código. Responsabilidad: que la documentación no quede mintiendo respecto al código.

**17. devops** — *El de despliegues.*
Monitorea los deploys de Vercel y la sincronización con GitHub; dispara el Deploy Hook si el webhook se atora. Reporta errores concretos cuando un build falla. Responsabilidad: que lo que se aprueba llegue a producción de verdad.

---

### El flujo típico del equipo de Claude Code

```
Vos pedís algo
   ↓
coordinator  ── (si es grande) → architect / tech_lead planean
   ↓
builder construye
   ↓
EN PARALELO: reviewer + regression_guardian + guardian_logica + security/auditor_contable verifican
   ↓
tester da GO/NOGO  →  commit + push
   ↓
devops vigila el deploy
   ↓
memoria + archivist + docs dejan todo registrado
   ↓
qa te da el plan de prueba manual
```

---

## PARTE B — Agentes de Cowork (los que YO levanto)

A diferencia del equipo de Claude Code (que son permanentes y viven en archivos), los míos los **creo en el momento** dentro de una conversación, para investigar o ejecutar algo, y desaparecen cuando terminan. Los principales:

**1. general-purpose** — *Investigador todoterreno.*
Lo uso para análisis profundos y multi-paso. Por ejemplo, la auditoría de flujo y dependencias de hoy: levanté 4 en paralelo (uno por cluster: agendamiento, órdenes-clientes, dinero, inventario) para revisar todo el software a la vez. Responsabilidad: investigar a fondo y devolverme hallazgos concretos con archivo:línea.

**2. Explore** — *Buscador rápido de código.*
Lo uso para localizar dónde está algo (un archivo, una función, dónde se usa un campo) cuando no estoy seguro a la primera. Es rápido pero superficial — no sirve para análisis profundo. Responsabilidad: encontrar ubicaciones en el código.

**3. Plan** — *Arquitecto de planes.*
Lo uso cuando necesito diseñar la estrategia de implementación de algo antes de escribirlo: pasos, archivos críticos, trade-offs. Responsabilidad: devolver un plan paso a paso.

**4. claude-code-guide** — *Experto en Claude Code / API.*
Responde preguntas sobre cómo funciona Claude Code, el SDK o la API de Anthropic (hooks, comandos, agentes, etc.). Responsabilidad: orientarme/orientarte sobre las herramientas de Anthropic.

> Nota: yo (Cowork) hago directo las cosas simples y escribo los sprints estructurados en `COLA_AUTONOMA.md`. El equipo de Claude Code es el que los ejecuta cuando corrés `trabaja`. Por eso conviene pensar en mí como "el que planifica y deja todo listo" y en el coordinator como "el que ejecuta el plan con su equipo".

---

## En una frase

- **Cowork (yo):** hablo contigo en simple, investigo, audito y dejo el trabajo escrito y ordenado en la cola.
- **coordinator + su equipo de 16:** ejecutan esa cola de noche, construyen, verifican por varios lados, y dejan todo registrado y desplegado.
- **El objetivo de tener tantos:** que nada se construya sin que alguien revise la lógica, el dinero, la seguridad, la regresión y el uso real — para cortar el bucle de "arreglo uno, rompo otro".
