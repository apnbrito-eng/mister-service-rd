# Revisión independiente: Personal, ponches y métricas

## Cambios verificados

- Navegación conserva `Personal.id` exclusivamente como filtro URL. Accesos/Ponches/Nómina usan roles administrador/coordinadora, coincidentes con rutas. Personal usa `personalVer`. No se asigna técnico ni escribe Firestore desde el selector.
- P006 era una detección del `value={p.id}`, legítimo para este filtro. Excepción puntual explicada junto a la opción; ninguna excepción global. Etiqueta Inactivo ahora exige `activo === false`, evitando afirmar desactivación con campo ausente.
- Ponches agrupaba primero por `personalId || personalUid`: entrada antigua UID y salida nueva docId quedaban separadas y sin duración. Ahora resuelve identidad única antes de agrupar. UID ambiguo/desconocido conserva registro separado: no genera parejas ni horas por inferencia. Filtro sigue sin buscar por nombre.
- Métricas preferían `creadoPor` y omitían `creadoPorId` recientemente preservado por parser. Helper y MétricasMensuales prefieren ID explícito; desconocido/ambiguo no cae al nombre legacy ni a otra identidad. El contador de incompletud permanece.

## Suplidores

Servicio/regla candidata coinciden en ID telefónico normalizado de 10 dígitos, metadatos de actor/fecha y campos permitidos. No existe campo país: el flujo usa normalizador local (admite +1, rechaza códigos internacionales más largos). No se añadió soporte internacional. La validación de 10 dígitos no comprueba prefijo dominicano; por tanto el texto “dominicano válido” no demuestra país. No afirmar cobertura mundial ni autorización de teléfonos internacionales.

## APK: revisión estática independiente

`scripts/mobile/build-oficial.mjs` verifica certificado fijado, paquete/versiones finales con aapt y recursos empaquetados byte a byte. Las herramientas de compilación reciben cwd del snapshot y no aparecen comandos de instalación/publicación. No se ejecutó ni se accedió material de firma durante esta revisión.

Hallazgo comunicado: validación `resolve`/`startsWith` de output no resuelve enlaces simbólicos de sus padres. Un padre externo que enlace al checkout permite escribir dentro de éste. Resolver el ancestro existente con realpath y volver a validar antes de crear output. La prueba física y compatibilidad backend continúan pendientes.

## Evidencia

- 15/15 pruebas iniciales navegación, identidad ponche y métricas.
- Ampliación ponches: entrada UID/salida docId y UID ambiguo sin fusión.
- TypeScript y P006 sin errores tras cambios iniciales; repetidos después del cambio de agrupación.
- Pruebas de componentes/helper no equivalen a validación móvil completa.
