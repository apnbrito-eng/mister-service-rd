# Corrección de matriz de auditoría previa — Claude Code

Fecha: 2026-09-30
Ejecutor: Claude Code
Motivo: Jorge señaló que la matriz de auditoría anterior de Claude Code
contenía "falsos pendientes" — ítems marcados como abiertos que ya estaban
resueltos en el código de producción. Este documento contrasta esos ítems
contra el estado actual verificado hoy y los cierra.

No se editan las notas anteriores de otros agentes ni de Codex.

## Verificaciones hechas hoy

### 1. `src/utils/buscarOrden.ts` — importado y consumido

- `src/pages/Ordenes.tsx:1` importa `coincideBusquedaOrden` desde `'../utils/buscarOrden'`.
- `src/pages/Ordenes.tsx:847` invoca `coincideBusquedaOrden(o, busqueda)`
  dentro del filtro `matchBusqueda`.

Estado: **integrado, no huérfano**. Cualquier reporte previo que lo listara
como "helper aislado sin caller" es incorrecto.

### 2. `src/pages/SugerenciasChequeo.tsx` — funcionalidades presentes, prueba integral pendiente

Verificado en el archivo actual:

- Línea 5: `import { guardarSeguimientoChequeo, type SeguimientoChequeo } from '../services/seguimientoChequeo.service';`
- Línea 21: `import WhatsAppIcon from '../components/icons/WhatsAppIcon';`
- Línea 26: `import { whatsappLink } from '../utils';`
- Línea 61: filtra `snap.docs.filter(d => d.data().seguimientoChequeo)` y
  materializa el mapa `gestiones`.
- Línea 180: `whatsappTecnicoUrl(item)` arma el link WhatsApp al técnico
  usando el teléfono de `personal`.
- Líneas 236, 269, 340-351: botones "WhatsApp / preparar oferta" y
  "Mandar WhatsApp al técnico" con el icono renderizado.

Estado: **`seguimientoChequeo` + WhatsApp + registro de seguimiento están
presentes como código integrado**. Lo que este documento acredita es la
existencia y consumo de los símbolos, no una prueba integral E2E de la
pantalla contra datos reales. Corrección respecto de una versión previa
de este mismo doc que decía "feature completa" — es prematuro: la prueba
integral (flujo humano, no solo compilación) queda pendiente.

### 3. Samsung 1.0.18

Quien verificó la instalación del build 1.0.18 en el dispositivo Samsung
físico fue **Codex**, no Jorge. Este proceso (Claude Code) no accede a
dispositivos ni a tiendas externas; se limita a tomar el reporte técnico
de Codex como estado autoritativo. Cualquier versión anterior de este
mismo documento que atribuyera esa verificación a Jorge como fuente
técnica está corregida acá: Jorge es el destinatario del entregable, no
el ejecutor de la prueba en el dispositivo.

### 4. CORS PUT

La política CORS PUT fue aplicada y comprobada por **Codex** con sus
herramientas (verificación con `curl`/inspector real contra el bucket).
No es una afirmación de Jorge. Este proceso (Claude Code) no re-verifica
CORS desde acá porque implicaría tocar la configuración de servicios
externos, que está fuera del alcance autorizado hoy. Corrección respecto
a una versión previa que atribuía la verificación técnica al usuario.

## Regla operativa que rompió la matriz previa

El error base fue **inferir ausencia por no ver notas antiguas**, en lugar
de leer el código actual. Los símbolos existían y estaban consumidos; la
auditoría los reportó como pendientes por no haberlos buscado con `grep` /
`Read` en el archivo real. La corrección: antes de listar cualquier ítem
como "no integrado" o "ausente", verificar con `grep -rn <símbolo> src/`
y `Read` sobre los callers presuntos. Si el símbolo aparece consumido, el
ítem no es pendiente — es deuda cerrada.

## Ítems que sí quedan como pendientes reales (fuera del alcance de hoy)

No se declaran nuevos pendientes desde este documento. Cualquier pendiente
legítimo de integridad del Estado de Resultado ya está tratado en
`docs/qa/2026-09-30-integridad-resultados-claude.md` (incidencia de
solapamiento costoPiezas ↔ gastos.repuestos, con tests focales agregados).
El resto de deuda del proyecto sigue viviendo en `docs/sprints/BLOQUEOS.md`
y `docs/sprints/COLA_AUTONOMA.md`, que no se editan desde aquí.

## Alcance respetado

Este documento se limita a rectificar la matriz de auditoría propia. No
modifica notas de otros agentes, no toca código de producción, no cambia
sprints en cola, no interactúa con servicios externos.
