# Sistema de movimiento — 28 de septiembre de 2026

## Alcance y estado

Jorge autorizó unir la documentación y el piloto para probar una APK, incluyendo además el menú lateral desplegable. Esta ficha documenta la **base implementada**; no acredita todavía la integración, pruebas visuales ni APK de otros builders.

Se leyeron completas las skills locales `apple-design` y `emil-design-eng` del repositorio de Emil Kowalski. Sus ejemplos no prevalecen sobre la restricción del proyecto a transform/opacity, springs y colores intactos. Taste no se instaló. El azul sigue pendiente por la instrucción más reciente.

`motion` no estaba declarado: se agregó **13.4.4 exacta**, junto con sus dependencias transitivas en el lockfile. Justificación: retomar valores y velocidades durante gestos reversibles, con APIs React y MotionValues comunes para el piloto. La instalación añadió cuatro paquetes; no se hizo actualización masiva ni se ejecutaron scripts de instalación.

Referencias: [transiciones oficiales de Motion](https://motion.dev/docs/react-transitions), [skills de Emil](https://github.com/emilkowalski/skills). Motion diferencia springs físicos, que incorporan velocidad, de springs por duración/rebote, que no la incorporan. Se usa física para respetar el gesto.

## Tokens

Archivo: `src/utils/motion.ts`.

| Token | Valor / propósito |
|---|---|
| RESORTE_PREDETERMINADO | masa 1, rigidez 400, amortiguación 40: razón de amortiguación 1 |
| RESORTE_GESTO | masa 1, rigidez 400, amortiguación 32: razón 0,8; solo tras arrastre |
| MOVIMIENTO_REDUCIDO | duración 0; transición inmediata, no spring |
| ESCALA_PRESION / ESCALA_ENTRADA | 0,97; no aplicar transform de entrada bajo reduced motion |
| DESPLAZAMIENTO_PANEL | 16px; movimiento visual opcional, no afecta distribución |
| UMBRAL_ARRASTRE | 6px para distinguir toque de arrastre |
| MUESTRA_VELOCIDAD_MS | ventana reciente 100ms; ignorar velocidad antigua tras pausa |
| DESACELERACION_GESTO | 0,998, proyección exponencial |
| obtenerTransicionMovimiento | reduced primero; luego spring y velocidad absoluta opcional |
| proyectarDestinoMovimiento | proyecta posición usando velocidad px/s; consumidor limita destino |

La razón 0,8 expresa rebote **leve**, no 20% de overshoot físico ni equivalencia matemática exacta con `bounce: 0.2`. El objetivo visual es respuesta alrededor de 0,4 segundos; no hay fecha límite de asentamiento. La física conserva velocidad incluso si eso alarga el recorrido. Los límites de pantalla deben mantenerse durante la animación completa.

## Antes / después previsto

| Before | After | Why |
|---|---|---|
| Duraciones y curvas dispersas | Springs compartidos, sin curvas por componente | Interrumpir y retomar sin reiniciar |
| Arrastre seguido de parada sin proyección | Destino proyectado y velocidad por eje | Continuidad al soltar el dedo |
| Entrada de modal por CSS que termina al desmontar | Superficie con presencia reversible y foco conservado | Cerrar/reabrir rápidamente no pierde el control |
| Acceso de área que obliga a otra pantalla | Secciones desplegables en lateral, permisos conservados | Llegar directamente al destino existente |

Esta tabla describe el objetivo del piloto; no es evidencia de que todos los cambios ya estén realizados.

## Diez oportunidades reales

| Prioridad | Archivo / superficie | Movimiento útil | Dónde NO usarlo / riesgo |
|---|---|---|---|
| 1 · piloto | `src/components/BotonAsistenteMovil.tsx` | Continuidad al agarrar, soltar y recolocar IA | No abrir chat por arrastre ni quedar fuera al girar; sin inercia reducida |
| 2 · piloto | `src/components/Modal.tsx` | Entrada/salida reversible de superficie y velo | No animar importes ni contenido del formulario; preservar foco, scroll y borrador |
| 3 · piloto | `src/components/Sidebar.tsx` | Panel izquierdo coherente y feedback de apertura | No animar anchura ni altura de grupos, no esperar para navegar; permisos intactos |
| 4 · posterior | `src/components/AsistenteIAFlotante.tsx` | Mostrar/ocultar panel desde su botón | No animar texto recibido, no demorar envío |
| 5 · posterior | `src/components/inbox/MenuMensaje.tsx` | Opacidad/escala desde disparador | Sin salida que bloquee Escape/clic fuera; no ejecutar acción debajo |
| 6 · posterior | `src/components/inbox/PanelCliente360.tsx` | Panel de ficha que entra y vuelve por el mismo lado | No desplazar ubicación, nombre o datos que se actualizan |
| 7 · posterior | `src/components/NotificacionesPanel.tsx` | Superficie vinculada a campana | No contar avisos con números animados ni animar cada fila |
| 8 · posterior | `src/components/clientes/FiltrosSidebarClientes.tsx` | Entrada lateral de filtros | No interpolar resultados ni perder selección; sin animar campos |
| 9 · posterior | `src/components/NavegacionMovil.tsx` | Feedback al presionar destino | Sin carrusel de pantallas, no bloquear navegación ni animar contadores |
| 10 · evaluación crítica | `src/components/ordenes/FaseStepper.tsx` / consumidor técnico | Feedback de confirmación en superficie existente | Nunca animar transición de negocio antes de confirmar guardado. QA manual obligatorio; fuera del piloto actual |

`Ordenes.tsx` queda fuera de la touch-list. Tampoco se modifican Dashboard, OrdenDetalle, TecnicoVista ni wizards de cierre: si el alcance crece hacia ellos, requiere revisión y QA manual declarada. La fila 10 es una oportunidad futura, no autorización para tocarla ahora.

## Touch-list expandido y contratos

| Bloque | Archivos | Dependencias / contratos a verificar | Riesgo |
|---|---|---|---|
| Base (este builder) | `DESIGN.md`, `src/utils/motion.ts`, `package.json`, `package-lock.json`, este informe | Imports Motion React18; no hooks/global provider por instalar tokens | Bajo; peso bundle por medir en build |
| Botón IA (piloto) | `src/components/BotonAsistenteMovil.tsx`, pruebas del botón | Pointer capture, posición guardada, viewport, multitouch, cancelación, teclado | Medio |
| Modal (piloto) | `src/components/Modal.tsx`, pruebas de modal | Consumidores de formularios y dinero sin modificar; foco/escape/scroll/borrador | Alto por uso compartido |
| Menú (piloto) | `src/components/Sidebar.tsx`, `src/components/Layout.tsx`, pruebas de navegación | `src/navigation/areas.ts`, PermisoRoute/RolRoute, gates, contadores, rutas antiguas; inspeccionar sin cambiar contrato | Alto por visibilidad de destinos |
| CSS compartido (solo si necesita) | reglas acotadas de `src/index.css` | Retirar transición competidora únicamente del piloto; no barrido global | Alto por cascada |
| QA | tests relevantes en `tests/integraciones`, evidencia 375/1440 y Android | Fijar lista final según archivos del builder; sin datos de negocio reales | Medio |
| APK posterior | recursos móviles y procedimiento de compilación vigente | Mantener identidad/firma; no usar configuración local de ensayo para release | Alto; compilación no equivale a publicación |

Archivos leídos como antecedentes: `docs/sprints/MEMORIA_MAESTRA.md`, riesgos de módulos e instrucciones actuales. `CONTEXTO_CODEX.md` no existe en la raíz observada. El coordinador realizó archivist PRE-CHANGE antes de esta delegación. Este builder conserva las restricciones recibidas: no pantallas, colores, handlers, lógica financiera ni permisos. No afirma haber realizado una revisión histórica independiente de todo el repositorio.

## Verificación de aceptación

1. PC 1440px: abrir/cerrar/reabrir menú y modal rápidamente; elemento retoma posición actual. Tab, Shift+Tab y Escape conservan foco. Rutas y roles muestran los mismos destinos permitidos.
2. Móvil 375px: arrastrar IA, soltar con distintas velocidades y agarrar a mitad del retorno; no abre el chat ni sale del área visible. Un toque normal sí abre. Cambiar orientación mantiene acceso al botón.
3. Reduced motion antes de cargar y cambiado durante interacción: ningún desplazamiento autónomo, escala de entrada ni rebote; arrastre voluntario sigue al dedo y se detiene al soltar.
4. Modal abierto: cancelar y volver a abrir preserva la política actual del formulario; no cambiar cierre de formularios con cambios ni perder foco. Teclado móvil no tapa controles.
5. Android físico con APK candidata: repetir gestos, pausa antes de soltar, segundo dedo, volver de segundo plano. Samsung confirma funcionamiento en ese dispositivo, no certifica rendimiento en gama media.
6. `npx tsc --noEmit`, lint y `check:regression` completos. Registrar fallos preexistentes sin ocultarlos ni declararlos corregidos por este cambio.
7. Inspección: nuevos movimientos solo transform/opacity; ningún duration/ease fuera de tokens; no espera artificial antes de operación. Ningún contador, KPI o importe animado.

No hay commit, push ni despliegue de este builder. Las evidencias y resultados finales del piloto los añadirá el coordinador después de tester → regression_guardian → reviewer.

### Comprobación de la base

- ESLint de `src/utils/motion.ts`: aprobado.
- `npx tsc --noEmit`: ejecutado después de instalar Motion. Detectó un error de tipado en `Sidebar.tsx:33` mientras el builder de navegación trabajaba en paralelo (`unknown` frente a `boolean`); comunicado al coordinador. No se modificó el archivo ajeno. Repetición global pendiente al cerrar el piloto.
- `check:regression`, build y pruebas visuales: a ejecutar por tester/coordinador sobre la entrega integrada; no se declaran aprobadas aquí.


### Ampliación de touch-list para candidata Android

- `vite.mobile.config.ts`: únicamente literal de identificación `mobile-production-1.0.16` → `mobile-production-1.0.17`; ningún otro campo alterado. Objetivo del empaquetado posterior: APK candidata 1.0.17 / code 18.
- La candidata se prepara **localmente, no publicada**. Firma, identidad y versión del archivo final deben verificarse durante el empaquetado; este literal no acredita por sí solo esos datos.
- Las correcciones locales previas de API/jornada/GPS aún no publicadas deben declararse aparte. Una APK nueva no publica endpoints del servidor ni permite afirmar que el seguimiento GPS quedó corregido de punta a punta.

### Tester — entrega integrada (28/09, después de «piloto listo»)

**NOGO para declarar todos los criterios globales verdes.** El piloto supera types e integraciones, pero dos comprobaciones del repositorio fallan por archivos fuera de su touch-list.

| Verificación | Resultado |
|---|---|
| `npx tsc --noEmit` | PASS; el error transitorio de Sidebar ya no está |
| `npm run test:integraciones` | PASS: 340 pruebas, 73 archivos; incluye 11 de botón IA y 3 de sidebar |
| ESLint dirigido a tokens/componentes/pruebas piloto | Exit 0: sin errores, 13 warnings en mocks de pruebas |
| `npm run lint` | Exit 1: 1 error y 316 warnings. Error en artifact previo `docs/qa/evidencias-mejoras-20260927/auditoria-modulos/modulos.js:1`: variable `modulos` declarada para HTML externo |
| `npm run check:regression` | Exit 1: 3 cazadores, 6 hits; se ejecutó sin error de runtime |
| Comprobaciones matemáticas de tokens | 10 PASS: amortiguación, prioridad reducida, velocidad y proyección por signo |

Hits de regresión: P-010 en `src/types/index.ts` (`crm_traspaso` sin emisor reconocido); P-015 en `src/services/whatsappInbox.service.ts:172,244,250` (query con colección distante del orderBy); P-019 en `api/whatsapp/audio.ts:23` y `api/whatsapp/media-proxy.ts:77` (catch de acceso sin señal reconocida). Son archivos ajenos al piloto; no se estableció aquí su fecha de introducción mediante historia Git y no se cambiaron ni silenciaron. Requieren contraste por coordinator/regression guardian antes de declarar verde global.

El tester no sustituyó la QA visual del coordinador ni certifica Android físico o reduced-motion real. Logs de esta ejecución: `/tmp/movimiento-tsc.log`, `/tmp/movimiento-lint.log`, `/tmp/movimiento-regression.log`, `/tmp/movimiento-integraciones.log` y `/tmp/movimiento-lint-piloto.log`.

### Ampliación autorizada antes de entregar APK: Empresas y navegación directa

Touch-list adicional: `src/pages/EmpresasAliadas.tsx`, `src/components/NavegacionMovil.tsx`, `src/components/EspacioTrabajo.tsx`, `tests/integraciones/empresas-aliadas-responsive.test.ts`, `tests/integraciones/navegacion-directa.test.ts`.

- Empresas implementa la distribución aprobada: tarjetas móviles y tabla desde lg, cabecera que envuelve, datos reales completos y acciones existentes. No cambia servicios, handlers, permisos ni colores. Activa explícitamente `movimiento` solo en su Modal no financiero; cancelar sigue limpiando el formulario como antes.
- Atención/Servicios inferiores abren el primer destino permitido del catálogo y conservan los gates anteriores. El activo se determina por pertenencia al área, también dentro de conversación. El selector superior ofrece destinos directos; el título deja de enlazar al hub. «Ver todos» elimina contexto y abre el listado del módulo actual. Las rutas antiguas se conservan.
- Riesgos: breakpoint lg y correos/nombres largos en tarjetas; foco al cancelar/abrir Modal; navegación con permisos personalizados; asociación de ficha/conversación. No se migran otros modales ni se modifica Ordenes.tsx.
- Verificación del builder: TypeScript y ESLint dirigido limpios. 14 pruebas aprobadas en cuatro archivos: 3 Empresas, 4 navegación directa, 2 selector compacto, 5 catálogo de áreas. Prueban apertura de edición sin escritura, ID correcto al activar/desactivar con servicios mock, destino directo, nombre de área activa, conservación del cliente y gates de secretaria.
- QA visual pendiente de este delta: 375/1440px con nombre/correo largo, tabla y tarjetas mutuamente excluyentes; abrir/editar/cancelar empresa sin guardar, foco y teclado; recorrer con administrador y permisos reducidos. No se realizaron cambios reales de empresas durante las pruebas unitarias.

### Revisión final de lateral y controles públicos

Touch-list adicional: Sidebar.tsx, PublicLayout.tsx, sidebar-movimiento.test.ts y public-layout-menu.test.ts. Avisos del lateral usan fondo azul suave y etiqueta contextual conservando origen/cálculos. Paneles animan solo opacity/transform; al cerrar devuelven foco antes de aplicar inert y aria-hidden, al completar se ocultan; reapertura revierte desde valores actuales. Reduced-motion oculta inmediatamente. Cinco pruebas del lateral cubren cierre de sección activa, permisos, foco y reapertura durante salida. Menú público tiene objetivo48px, nombre Abrir/Cerrar menú, aria-expanded y referencia al panel; una prueba dirigida valida el recorrido. Pendiente QA visual final del lateral.
