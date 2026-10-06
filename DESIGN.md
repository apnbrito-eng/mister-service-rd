# Sistema de diseño — Mister Service RD

**Fase 0 · 28 de septiembre de 2026 · Propuesta documentada, sin implementación.**

Ámbito: web administrativa y aplicación móvil del técnico. Este documento define presentación e interacción; no cambia reglas del negocio, permisos, datos, cálculos ni handlers. La auditoría de respaldo está en [Auditoría visual de septiembre](docs/diseno/AUDITORIA-VISUAL-2026-09.md).

## 1. Dirección y decisiones

**«Que se sienta como WhatsApp y se vea como Apple».** Lista → detalle, búsqueda visible, nombres reconocibles, pocas acciones y respuesta inmediata. La jerarquía proviene primero del tamaño, peso y espacio; el color señala acciones y estados concretos.

Decisiones de Jorge:

- Filas de 64–72px, avatar o icono, título, una línea de contexto y hora o estado a la derecha.
- Nombre del cliente como título de conversación o ficha; teléfono como información secundaria.
- Una acción principal por contexto. Acciones secundarias en menú; mantener presionado puede abrirlo, pero siempre habrá un botón visible equivalente.
- Móvil: máximo 4–5 pestañas inferiores, una vista a la vez. Web: barra lateral y lista/detalle cuando el ancho útil lo permita.
- Interacción táctil mínima 44×44px; 48×48px en la vista del técnico.
- Sin vidrio, fondos 3D, degradados llamativos, emojis decorativos, animación ornamental ni nuevas librerías de componentes. Motion queda autorizado en la ampliación del 28/09 para el sistema de movimiento.

### Azul de acción: DECISIÓN PENDIENTE DE JORGE

La instrucción más reciente para el sistema de movimiento vuelve a dejar pendiente la elección. La aprobación anterior queda como antecedente; esta entrega no cambia colores ni sustituye clases de marca.

| Opción | Contraste sobre blanco | AA normal |
|---|---:|---|
| `#0f3460` | 12,50:1 | Cumple |
| `#4A6FA5` | 5,11:1 | Cumple |

## 2. Fundamentos

### 2.1 Colores semánticos propuestos

Reutilizar valores presentes en Tailwind y en el proyecto. En la migración se definirán alias semánticos; evitar añadir colores literales por pantalla.

| Token conceptual | Valor | Aplicación |
|---|---|---|
| fondo | `#f0f4f8` | Fondo general suave |
| superficie | `#ffffff` | Listas, formularios y paneles |
| texto principal | `#111827` | Títulos y contenido; 17,74:1 sobre blanco |
| texto secundario | `#4b5563` | Contexto y ayuda; 7,56:1 sobre blanco |
| texto micro | `#6b7280` | Metadatos; 4,83:1 sobre blanco |
| borde suave | `#e5e7eb` | Separadores decorativos, no única señal de un control |
| borde de control | `#6b7280` | Cuando el límite es necesario para reconocer el campo |
| acción y foco | Pendiente: `#0f3460` / `#4A6FA5` | Conservar estilos actuales hasta decisión |
| acento secundario | Sin cambio | Conservar estilos actuales |
| éxito | `#15803d` | Resultado completado y confirmado; 5,02:1 sobre blanco |
| advertencia | `#b45309` | Atención requerida, acompañada de texto; 5,02:1 sobre blanco |
| peligro | `#b91c1c` | Acción destructiva; 6,47:1 sobre blanco |

- No usar rojo para cantidad de mensajes, ni verde para un botón genérico de guardar, enviar o abrir WhatsApp. Conservar logotipos oficiales como activos de marca, sin extender sus colores a toda la interfaz.
- Validación y fallos deben explicarse con texto e icono. Bajo la dirección de rojo solo destructivo, emplear advertencia o texto principal para errores ordinarios; no depender exclusivamente del color.
- Estado pendiente: neutro y etiqueta explícita. Éxito: solo después de confirmación real. Un envío en cola no es un envío completado.
- Hover y pressed conservan el azul principal: cambiar borde/sombra interior o tratamiento neutro. Si se introduce un tono derivado, medir su contraste antes de aprobarlo. No reutilizar automáticamente todos los azules históricos.
- Foco: contorno de 2px del color de acción, separación de 2px; en fondo azul usar contraste blanco. No eliminar `focus-visible`.
- Los ratios calculados son pares opacos sobre blanco, también válidos para texto blanco sobre esos fondos sólidos. Comprobar nuevamente cualquier otra combinación, transparencia o estado.

El criterio de contraste de texto normal es 4,5:1; para texto grande, 3:1. Referencia: [WCAG contraste mínimo](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html). Los mínimos táctiles 44/48 son requisitos propios del proyecto, más exigentes que el mínimo de 24px con excepciones de [WCAG 2.2 AA](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).

### 2.2 Tipografía

**Plus Jakarta Sans**, ya declarada y cargada, con `system-ui, sans-serif` como respaldo. Corregir en una fase posterior la sobrescritura de `.service-ui`; no descargar otra familia. Mantener los cinco nombres de escala existentes.

| Clase | Tamaño / interlineado | Peso propuesto | Letter-spacing propuesto | Uso |
|---|---|---:|---|---|
| `.text-h1` | 30 / 36px | 700 | -0,02em | Título de pantalla |
| `.text-h2` | 20 / 28px | 600 | -0,01em | Sección o ventana |
| `.text-body` | 16 / 24px | 400 | 0 | Contenido y formularios |
| `.text-caption` | 14 / 20px | 400 | 0 | Contexto secundario |
| `.text-micro` | 12 / 16px | 500 | 0 | Hora y metadatos breves |

Los tamaños/interlineados reutilizan la escala existente. Los pesos de caption/micro y el tracking se explicitan aquí como propuesta: hoy se heredan o no están definidos. Títulos de fila y botones usan tamaño body con peso 600; etiquetas pueden usar caption 600. No crear otra escala para esas variantes.

Títulos en texto principal, no azules por defecto. No usar 10/11px para información operativa, financiera o de navegación. El texto del técnico que determina una acción debe ser body; micro queda para metadatos no críticos. Permitir ampliación de texto al 200%, sin fijar alturas que lo corten.

### 2.3 Espaciado, bordes y sombras

- Escala: 4, 8, 12, 16, 24, 32 y 48px. Excepciones justificadas: borde de 1px, tamaño de iconos y métricas tipográficas.
- Margen exterior móvil 16px; web 24px, ampliable a 32px en vistas holgadas.
- Icono/texto: 8px. Entre controles: 8px mínimo. Entre grupos relacionados: 16px. Entre secciones: 24px.
- Radios: 8px en controles; 12px en tarjetas; 16px en modal y esquinas superiores de hoja; círculo completo en avatar, contador y botón flotante. No alternar radios por preferencia de cada pantalla.
- Superficies ordinarias sin sombra; usar borde o espacio. Una sombra de elevación para menú, hoja y modal: `0 8px 24px rgb(15 23 42 / 0.12)`.
- Fondo de diálogo: velo negro al 40%, sin desenfoque. Superficies sólidas, también en barra lateral y navegación inferior.
- Iconos: reutilizar Lucide; 20–24px dentro de una caja táctil mayor. No añadir otra librería.

### 2.4 Movimiento

**Actualización 28/09/2026.** Sustituye la tabla anterior de duraciones/easing. Jorge autorizó completar la base y un piloto junto con el menú lateral desplegable, para una APK candidata. El inventario completo de oportunidades, riesgos y pruebas está en [Movimiento y alcance](docs/diseno/MOVIMIENTO-2026-09-28.md).

Referencias principales leídas completas: `apple-design` y `emil-design-eng`, de Emil Kowalski. Las restricciones explícitas de Jorge prevalecen sobre sus ejemplos de blur, animación de altura, curvas fijas o cambios de tipografía. No se instala Taste.

#### Nueve principios del proyecto

1. **Springs físicos.** Usar los tokens de `src/utils/motion.ts`: predeterminado críticamente amortiguado (masa 1, rigidez 400, amortiguación 40). Respuesta visual orientativa de 0,4s, no temporizador ni espera. No declarar duraciones/easings por componente.
2. **Rebote solo tras gesto.** Token gesto: misma masa/rigidez, amortiguación 32 (razón 0,8; intención equivalente a bounce aproximado 0,2). Botones, modal y navegación usan el predeterminado, sin rebote decorativo.
3. **Continuidad de posición.** Retomar el MotionValue vivo, nunca reiniciar a cero ni al destino anterior. Mantener identidad estable al invertir una transición; una entrada nueva puede comenzar en una posición espacial explícita, no escala cero.
4. **Continuidad de velocidad.** Al soltar, pasar velocidad reciente del dedo en px/s, por eje. Motion acepta velocidad absoluta. No normalizar por distancia, que puede ser cero. El spring físico incorpora la velocidad: la variante `duration + bounce` no lo hace y por eso no se usa en el piloto.
5. **Interrupción y reversión.** Un nuevo pointerdown detiene la animación conservando el valor visible y permite retomar el arrastre. No bloquear controles mientras anima ni esperar un callback para actualizar el negocio.
6. **Respuesta al presionar.** Feedback comienza en pointerdown (escala centralizada 0,97); la acción conserva su click/teclado original. Cancelar o arrastrar no ejecuta un click accidental. Teclado mantiene foco y feedback inmediato, sin movimiento ornamental.
7. **Proyección de momento.** Proyectar `posición + (velocidad/1000) × d/(1−d)`, con `d=0,998`, y elegir un destino permitido. Limitar al viewport/área segura. El botón IA se recoloca, no se descarta. Un gesto nunca confirma pagos ni cambia una fase de negocio.
8. **Coherencia espacial.** Panel lateral entra y sale a la izquierda; hoja por abajo; modal centrado. No animar width/height/top/left: cambios de distribución necesarios son inmediatos y el movimiento visual usa transform/opacity. Un menú contextual nace junto a su disparador.
9. **Movimiento reducido.** Consultar `prefers-reduced-motion` en tiempo real; `MOVIMIENTO_REDUCIDO` completa sin interpolación. Sin desplazamientos, escala, rebote ni inercia autónomos. El arrastre voluntario puede seguir al dedo 1:1; al soltar se detiene, sin recorrido proyectado. No basta con cambiar la duración: quitar objetivos de entrada desplazados y feedback de escala.

#### Límites y adopción

Solo animar **transform y opacity**. No `layout`, `transition-all`, filtros, sombras, colores o clip-path animados. Los datos, importes, KPIs y tablas financieras se presentan inmediatamente, sin stagger ni contadores animados. La animación no debe cambiar permisos, handlers, validaciones ni transacciones. Mantener el área táctil y el foco utilizables.

Los tokens están centralizados; ejemplos históricos fuera del piloto no equivalen a cumplimiento global. La migración del CSS previo será acotada a los componentes autorizados. Retirar de ellos cualquier transición CSS que compita con el transform de Motion. Comprobar el resultado con 375px, 1440px, movimiento reducido y Android físico; pruebas unitarias no certifican fluidez o GPU.

**Nota técnica:** el resorte sin rebote se refiere a su amortiguación; una velocidad entrante extrema puede cruzar el destino incluso con amortiguación crítica. Los límites de pantalla prevalecen y deben verificarse durante toda la trayectoria. La regla de no movimiento reducido se refiere al movimiento autónomo, preservando control directo del usuario.

## 3. Componentes base

### Botón

Una especificación común, conservando semántica nativa y handlers existentes. No existe un componente Button/Boton en el conjunto inspeccionado: una futura fase podrá añadir un adaptador pequeño o clases compartidas, sin biblioteca nueva ni migración masiva.

| Variante | Apariencia | Uso |
|---|---|---|
| Primario | Fondo acción, texto blanco | Una acción principal visible por contexto |
| Secundario | Blanco, borde de control y texto acción | Alternativa relevante |
| Destructivo | Rojo peligro con blanco, o texto rojo en variante discreta | Acción que elimina o destruye; conservar confirmaciones |
| Fantasma | Transparente, texto principal o acción; respuesta neutra al presionar | Menú y acciones auxiliares |

Altura y ancho mínimos 44px; técnico 48px. Padding horizontal 16px, icono/texto separados 8px. Solo icono: caja cuadrada y nombre accesible. Texto body/600. Evitar dos primarios contiguos.

Estados: normal, hover, foco, presionado, deshabilitado y cargando. Carga conserva ancho y nombre, anuncia el estado y evita duplicados con la lógica existente. No activar doble envío ni cambiar `type`, `disabled`, permisos o condiciones del handler al sustituir estilos.

### Fila de lista

Altura mínima 64px; preferida 72px con contexto. Avatar/icono 40px, separación 12px, centro flexible con `min-width: 0`, extremo derecho para hora/estado. Título body/600; una línea de contexto caption; hora micro. La fila puede crecer al ampliar texto: no imponer altura fija.

Nombre real del cliente como título; teléfono secundario. Si falta nombre, usar una etiqueta neutral de ausencia de nombre, sin inventar una persona; mantener el teléfono disponible para identificar el registro. No modificar la clave ni la asociación de datos para cumplir una regla visual.

No leídos: título semibold y contador del significado vigente. No sumar mensajes cuando el contador representa conversaciones. Mantener contadores de órdenes cuando representan órdenes. Menú secundario con caja 44px que no dispare la apertura de la fila. Tocar fuera cierra el menú sin ejecutar la acción situada debajo; Escape también. Mantener presionado es un atajo, no el único acceso.

No comprimir nombres letra por letra. Truncar una línea en listas si es necesario y mostrar el nombre completo en el detalle. El botón de abrir fila y el de menú deben ser elementos hermanos, no botones anidados.

### Hoja inferior móvil y Modal web

Reutilizar la API actual de Modal cuando corresponda; introducir una variante de presentación de forma acotada. Formularios cortos en hoja móvil; formularios extensos pueden necesitar pantalla completa. Web centrado con anchos actuales sm/md/lg/xl, sin reformar contenido por la fuerza.

Cabecera con título h2 y cierre de 44px/48px; contenido con padding 16 móvil/24 web. Una zona de scroll; acciones visibles sin tapar el último campo. Altura limitada al viewport útil, considerando teclado y áreas seguras.

Nombre accesible, foco inicial adecuado, foco contenido y retorno al disparador. Escape y toque en fondo respetan la política de cierre existente; si hay cambios sin guardar, no descartarlos silenciosamente. Conservar bloqueo de scroll y comportamiento de formularios. Probar apertura de un diálogo desde otro antes de modificar la gestión del foco.

### Badge de estado

Texto micro/500, padding 4px vertical y 8px horizontal, radio completo. No interactivo por defecto. Etiqueta explícita y semántica neutro/advertencia/éxito; color no es el único código. No renombrar fases de negocio ni transformar una cancelación histórica en una acción destructiva. Contadores usan acción o neutro, nunca rojo por cantidad. Si el badge filtra, será un control con área44/48 y estado accesible.

### Campo de formulario

Etiqueta visible caption/600; entrada body, mínimo44px/48px, radio8, padding12px horizontal. Ayuda debajo, separada4px. Placeholder no sustituye la etiqueta. Borde reconocible; foco visible. Error asociado al campo con texto y `aria-invalid`/descripción cuando corresponda. Preservar valores, validaciones y borradores existentes. Al fallar guardado, conservar lo escrito.

En móvil, fuente 16px, teclado apropiado al tipo de dato y scroll al campo enfocado. No ocultar el campo tras el teclado ni bloquear zoom. Buscador al principio de la lista, con limpiar accesible cuando haya contenido.

### Estado vacío y carga

Reutilizar EmptyState, Skeleton y LoadingSpinner. Vacío: icono neutral, título breve y explicación existente; acción solo si el usuario tiene permiso. Distinguir lista vacía, filtro sin resultados, error y carga. No inventar clientes, órdenes ni métricas para rellenar la vista.

Skeleton reproduce la geometría del contenido final para evitar saltos; elementos decorativos ocultos a tecnología asistiva. Un anuncio de carga por región, no por cada fila. Spinner conserva espacio y texto útil. Para recarga con datos previos, mantenerlos cuando la lógica actual lo permita y señalar actualización, sin presentar información vieja como confirmación nueva.

## 4. Navegación

### Web administrativa

Barra lateral con las áreas del catálogo actual; opciones específicas dentro del área. Conservar rutas, roles, contadores y accesos existentes. La agrupación visual no concede permisos. Sidebar reducido debe mantener nombres accesibles y títulos al enfocar.

Atención y clientes reúne Conversaciones (Inbox completo), Clientes y Solicitudes, con Citas por confirmar en su contexto y los demás destinos acordados accesibles. Mantener el cliente seleccionado al cambiar entre vistas solo cuando la asociación esté resuelta por la lógica vigente; un teléfono compartido no autoriza elegir arbitrariamente otra ficha.

Lista a la izquierda y detalle a la derecha cuando haya ancho útil suficiente. Usar el ancho disponible después de la barra lateral, no solo el tamaño total de la pantalla. Si la lista queda demasiado estrecha, pasar a lista → detalle. Preservar búsqueda, filtros, posición y retorno.

### Móvil administrativo y técnico

Admin conserva las cuatro opciones actuales de NavegacionMovil y sus permisos. Máximo cinco destinos; no convertir cada módulo en otra pestaña. El chat abierto dispone del espacio de conversación y mantiene el retorno ya existente.

TecnicoVista tiene un contenedor propio: no hereda automáticamente la navegación inferior del administrador. Aplicar el patrón de hasta 4–5 destinos solo a funciones del técnico que ya existan, conservando sus rutas y controles; no añadir funciones ni privilegios para completar una barra.

Una vista principal por vez, búsqueda arriba y acción principal arriba a la derecha o flotante, no duplicada. Menús secundarios accesibles sin gestos obligatorios. Mantener áreas seguras y las reglas vigentes al abrir teclado. Probar tableta en ambas orientaciones además de los dos anchos obligatorios.

## 5. Migración por fases pequeñas

**Estas fases son propuestas futuras, no trabajo implementado.** Cada fila se entrega, verifica y revisa antes de la siguiente. Evitar reemplazos globales de clases. Las filas de fundamentos y layout tienen alcance transversal explícito; el resto migra un componente o pantalla por vez.

Criterios comunes: a 375px y 1440px no hay desplazamiento horizontal de página ni controles ocultos; nombres legibles; foco visible; contraste medido sobre estilos computados; texto al 200% sin pérdida de acciones. Conservar handlers, atributos de formulario, condiciones, permisos, datos y rutas. Comparar antes/después con el mismo estado existente y autorizado. No usar producción para crear mensajes, pagos u órdenes de prueba.

| Fase / prioridad | Archivos previstos | Riesgo | Aceptación a 375px | Aceptación a 1440px |
|---|---|---|---|---|
| 1 · Fundamentos | tailwind.config.js; src/index.css | Alto por cascada | Jakarta efectiva; escala legible; áreas seguras y teclado intactos | Mismo color de acción y escala; sin vidrio; sin alterar colores de gráficos ajenos al alcance |
| 2 · Botón | src/components/Button.tsx (nuevo, si se elige adaptador) o bloque acotado en src/index.css | Medio | Todas sus variantes 44px y variante técnico 48px; texto y carga caben | Teclado/foco funcionan; deshabilitado no dispara acción; contraste de cada estado |
| 3 · Campo | src/components/FormField.tsx (nuevo, opcional adaptador mínimo) | Medio | Fuente 16; teclado no tapa campo ni error | Etiqueta y descripción asociadas; valores y validaciones intactos |
| 4 · Modal | src/components/Modal.tsx | Alto | Cierre 44/48; último campo accesible con teclado | Foco contenido y retorno; Escape respeta cambios pendientes |
| 5 · Hoja inferior | src/components/BottomSheet.tsx (nuevo) o variante móvil de Modal.tsx | Alto | Una zona de scroll y acciones accesibles; sin pérdida de borrador | Modal sigue centrado con tamaños actuales; no cambia handlers |
| 6 · Badge | src/components/Badge.tsx; mapeo visual acotado de src/utils/index.ts | Medio | Etiquetas legibles; ningún estado depende solo del color | Todas las fases conservan etiqueta y valor; contadores no se vuelven destructivos |
| 7 · Estado vacío | src/components/EmptyState.tsx | Bajo | Título y acción caben; diferencia error/vacío | Ancho de lectura y espacio consistentes; permisos intactos |
| 8 · Skeleton | src/components/Skeleton.tsx | Bajo | Geometría coincide con fila; estático con reduced-motion | Sin saltos al cargar; sin anuncios redundantes |
| 9 · Indicador de carga | src/components/LoadingSpinner.tsx | Bajo | Estado anunciado sin giro obligatorio | Conserva espacio y texto; no bloquea contenido innecesariamente |
| 10 · Fila | src/components/ListRow.tsx (nuevo adaptador visual) | Medio | 64–72px base; crece con texto; menú 44px; nombres sin letras apiladas | Hora/estado alineados; clic de menú no abre fila |
| 11 · Navegación inferior | src/components/NavegacionMovil.tsx; reglas propias en index.css | Medio | 4 destinos actuales, objetivos de 44, etiquetas de 12; teclado y chat conservan comportamiento | No aparece una segunda navegación móvil; destinos intactos |
| 12 · Barra lateral | src/components/Sidebar.tsx | Medio | Menú abierto con controles de 44; cierre y acceso por rol | Control de colapsar de 44; colapsado conserva nombres accesibles y selección |
| 13 · Contenedor | src/components/Layout.tsx; reglas propias en index.css | Alto | Sin doble scroll ni pie tapado; contexto de atención conservado | Paneles y sidebar caben; sin regresión al cambiar tamaños |
| 14 · Inbox | src/pages/Inbox.tsx | Alto | Fila nombre/contexto/contador; buscador arriba; filtros accesibles | Lista densa legible; mismos resultados y contadores con iguales datos |
| 15 · Conversación | src/pages/InboxConversacion.tsx | Alto | Entrada a izquierda y salida a derecha; compositor visible; menú cierra fuera | Cabecera con nombre; contexto y paneles sin tapar mensajes |
| 16 · Técnico | src/pages/TecnicoVista.tsx | Alto | Acciones de 48; operación principal clara; estados pendientes/error visibles | Lista y detalle aprovechan ancho sin cambiar asignaciones ni acciones |
| 17 · Órdenes | src/pages/Ordenes.tsx | Alto | Filtros, agenda y acciones accesibles; misma consulta | Misma tabla/agenda y selección; jerarquía consistente |
| 18 · Detalle de orden | src/pages/OrdenDetalle.tsx | Muy alto | Pagos, estados y formularios legibles sin 10/11px; no se ocultan acciones | Totales, permisos y todas las operaciones conservan resultados |

**Dependencias y límites:** los adaptadores nuevos son posibilidades de implementación, no una librería ni autorización de refactor masivo. Si requieren cambiar consumidores para demostrar su funcionamiento, escoger un único consumidor y registrar ese alcance antes de ejecutar la fase. Un componente hijo con estilos propios que no responda al cambio de su página se migra en una fase separada; no ampliar silenciosamente el lote.

En particular, las burbujas de mensajes pertenecen a `src/components/inbox/MensajeBubble.tsx`: cualquier ajuste interno de su alineación exige una subfase propia antes de aceptar la fase 15. No modificar ese archivo dentro de esta Fase 0. Conservar el cierre al tocar fuera y los estados de envío existentes.

**Ordenes.tsx permanece monolítico a propósito.** La fase 17 solo cambia presentación dentro del archivo; no extrae lógica, mueve handlers ni reorganiza flujos. La fase 18 tampoco refactoriza lógica financiera, permisos ni transacciones. Si una mejora visual exige cambiar comportamiento de negocio, se documenta como tarea separada.

## 6. Verificación y entrega de cada fase futura

1. Capturar estado base y resultado con viewport 375×812 y 1440×900. Complementar con iPad vertical/horizontal y técnico en Android físico antes de publicación.
2. Medir cajas táctiles completas, estilos computados, contrastes y overflow. Incluir portal de modal y contenedor independiente del técnico.
3. Probar teclado, Tab/Shift+Tab, Escape, foco tras cerrar, zoom/texto200%, reduced-motion y apertura del teclado móvil.
4. Probar vacío, error, carga, nombre largo, nombre ausente y permisos reducidos con datos existentes de prueba; no crear contenido ficticio en el producto.
5. En Inbox/conversación: conservar búsquedas, filtros, semántica de contadores, cliente correcto, borrador, adjuntos, cola/fallo y restricciones de envío. No enviar mensajes reales durante la revisión visual.
6. En técnico/órdenes/detalle: comprobar que no cambiaron handlers ni condiciones; ejecutar las pruebas existentes pertinentes y añadir solo cobertura de regresión necesaria. Revisar pagos y otras acciones críticas mediante fixtures/emuladores autorizados, sin movimientos reales.
7. Entregar diff acotado, evidencia de ambos anchos y límites pendientes. Si un caso no se probó, marcarlo pendiente, nunca aprobado por inspección estática.

La compilación y APK corresponden a una fase posterior autorizada. Esta entrega no las ejecuta ni certifica la aplicación publicada.

## 7. Estado de esta entrega

- Auditoría estática y mediciones de uso documentadas.
- Contraste de ambos candidatos calculado; azul oscuro aprobado por Jorge durante la sesión.
- Sistema y fases propuestos, pendientes de implementación y validación visual.
- Solo se crean este archivo y el informe de auditoría. No se modifican pantallas, componentes, dependencias, memoria local ni archivos de publicación.

## Avance de implementación — 28/09/2026
Tras cerrar la fase documental, Jorge autorizó corregir y publicar. Se inició la base común (fuente, acción azul oscuro, tacto, foco, lectura y movimiento reducido), Modal y ajustes de Citas/Precios/filtros de Órdenes. Véase `docs/diseno/REVISION-GLOBAL-2026-09-28.md` para evidencia y límites. Las fases anteriores siguen como guía: este avance no certifica su finalización completa.

## Web pública blanca — 01/10/2026
Dirección confirmada por Jorge: fondo blanco liso, fotografía protagonista y tipografía legible inspirada en Samsung. Implementada en las rutas públicas existentes; administración y técnico conservan sus estilos.
- Fondo #fff; texto #17191c; secundario #555b63; acciones #0f3460. Plus Jakarta Sans existente con fallback de sistema, sin fuentes nuevas.
- Navegación blanca sticky, menú móvil accesible, controles de 48px, foco azul, movimiento reducido.
- Portada: equipo visible al entrar, selección equipo/intención conservada en agenda. Material CMS fijo/carrusel accesible con «Ver presentación del servicio»; carrusel manual.
- Catálogo y detalle proceden de servicios habilitados del CMS. Imágenes rotas usan respaldo local. Sin precio, estadísticas o certificaciones nuevas: textos CMS siguen bajo control del negocio.
- Los videos y el desarme automático de entrada se integrarán después por instrucción expresa del usuario.
- Evidencia y límites: docs/qa/2026-10-01-web-blanca.md. Impeccable se usó desde repositorio oficial temporal; el detector advirtió únicamente familia tipográfica común. Se conserva por coherencia con el sistema existente y las referencias del usuario.

## Convenciones de negocio

Reglas de color específicas del dominio de Mister Service RD. No son opiniones estéticas: son decisiones de negocio que condicionan el significado del color en toda la interfaz y no deben romperse en rediseños futuros.

### Rojo de garantía — `#DC2626`

**Uso exclusivo:** órdenes de servicio bajo garantía. Aplica a:

- Marcadores de garantía en el mapa de operaciones (ver `src/components/mapa/marcadores.ts`: `garantia: '#dc2626'`).
- Badges, bordes, iconos de estado y cualquier otro indicador visual de garantía en la interfaz de admin y la vista del técnico.

**Prohibido** usar `#DC2626` para cualquier otro propósito: ni para acciones destructivas, ni para estados de error, ni para facturas vencidas, ni para botones peligrosos, ni para efectos decorativos. Para "acción destructiva" o "peligro" conservar el `#b91c1c` ya documentado en §2.1.

**Razón del negocio.** Las operarias y los técnicos deben identificar visualmente una orden de garantía al instante — en el mapa, en la lista de órdenes, en la ficha. Si otros usos del "rojo intenso" compiten con esa señal, el canal de comunicación se degrada y las garantías se pierden en el ruido operacional (origen de la convención: QA review #16, confirmado en el comentario de `marcadores.ts`).

**Deuda detectada al redactar esta regla (02/10/2026):** dos usos actuales de `#DC2626` en código fuente violan la convención y deben migrarse en un sprint propio antes de poder enforce la regla con cazador:

- `src/pages/Facturas.tsx:378` — `.estado-vencida { color: #dc2626 }`. Migrar a `#b91c1c`.
- `src/utils/heroGradient.ts:18` — gradient `rojo-energy` termina en `#dc2626`. Reemplazar por `#b91c1c` o `#991b1b`.
