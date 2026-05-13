# QA E2E Distribuido — Test "Orden de cero a conduce" con todos los roles

> **Qué es esto.** Plan completo de un test end-to-end donde múltiples dispositivos físicos con diferentes roles colaboran para procesar una orden desde lead hasta conduce de garantía emitido. Las Claudes del sidepanel (en las computadoras admin/coord/operarias) verifican cada paso. Los técnicos/secretarias operan manualmente en iPad/celular.
>
> **Cuándo usar.** Al validar features que tocan flujo multi-rol. Antes del go-live. Después de cualquier sprint que cambie rules, permisos o notificaciones.
>
> **Tiempo total estimado:** 30-45 minutos.

---

## Setup necesario (lo que Jorge ya tiene listo)

| Dispositivo | Usuario | Rol | Claude in Chrome |
|---|---|---|---|
| PC #1 | Jorge | Admin | ✅ |
| PC #2 | Maria | Coordinadora | ✅ |
| PC #3 | Yohana | Operaria | ✅ |
| PC #4 | Wilainy | Operaria | ✅ |
| iPad #1 | Aury | Técnico | ❌ (manual) |
| Celular #1 | Jesus | Técnico | ❌ (manual) |
| iPad #2 | Angelica | Secretaria | ❌ (manual) |
| iPad #3 | Luisa | Secretaria | ❌ (manual) |

> Los dispositivos sin Claude operan manualmente — Jorge les indica qué hacer por teléfono/WhatsApp o un humano físicamente al lado.

---

## Escenario 1 — "Orden de cero a conduce" (flujo completo)

### Resumen del flujo

1. **Secretaria (Angelica)** recibe lead → crea orden → asigna técnico Aury.
2. **Coordinadora (Maria, vía Claude)** confirma asignación + verifica agenda.
3. **Técnico (Aury, iPad)** ejecuta iniciar chequeo + diagnóstico.
4. **Operaria (Wilainy, vía Claude)** revisa cotización + aprueba.
5. **Técnico (Aury)** completa reparación + cierra con wizard, período 30 días.
6. **Operaria (Yohana, vía Claude)** envía a Facturación Pendiente.
7. **Coordinadora (Maria, vía Claude)** emite conduce de garantía.
8. **TODAS las Claudes** verifican que recibieron notificaciones correspondientes.
9. **Admin (Jorge, vía Claude)** valida que todos los datos quedaron consistentes.

### Timing (importante: hay dependencias)

```
T+0min   Angelica crea orden (manual en iPad #2)
T+2min   Maria verifica desde Claude PC #2
T+5min   Aury inicia chequeo en iPad #1 (manual)
T+10min  Aury completa diagnóstico (manual)
T+12min  Wilainy revisa cotización desde Claude PC #4
T+15min  Aury cierra con wizard 30 días (manual)
T+18min  Yohana envía a facturación desde Claude PC #3
T+20min  Maria emite conduce desde Claude PC #2
T+22min  TODAS verifican notificaciones simultaneamente
T+25min  Jorge valida desde Claude PC #1 (matriz de simetría)
```

---

## Prompts por Claude (copiar/pegar tal cual)

### PROMPT 1 — Admin (Jorge, PC #1)

Pegar en su sidepanel **después de T+25min**:

```
Estoy logueado como ADMIN en https://app.misterservicerd.com.
Ambiente pre-producción, datos de prueba.

Acaba de procesarse una orden completa "de cero a conduce" con varios roles.
Verificá lo siguiente y reportame:

1. Andá a /admin/ordenes. Buscá la orden más reciente (la creada hace ~25 min).
   Decime su OS-XXXX.
2. Abrila. Verificá:
   - Fase: "cerrado" + facturada: true + facturaNumero: CG-XXXXX
   - Técnico asignado: Aury Mon
   - Operaria: Wilainy o Yohana (cualquiera de las dos)
   - Cierre del técnico completo con período 30 días
   - facturaId apunta al conduce nuevo
3. Andá a /admin/facturas. Confirmá que el conduce CG-XXXXX está ahí con OS-XXXX vinculada.
4. Abrí la fila expandida del conduce. Verificá que aparecen:
   - Nota del conduce (si la operaria la agregó)
   - Período de garantía: 30 días, NO "No configurado"
   - Cierre del técnico (foto, satisfacción, etc.)
5. Mirá la campanita arriba. ¿Hay notificaciones nuevas del último 25min relacionadas con esta orden?
   Listame todas las notificaciones nuevas con título y emisor.
6. Andá a /admin/dashboard. ¿Los KPIs muestran el cierre? (Trabajos Realizados +1, etc.)

Reportame paso por paso.
```

### PROMPT 2 — Coordinadora (Maria, PC #2)

Pegar en su sidepanel **al comenzar T+2min** y **otra vez en T+20min** (dos fases):

**Fase A — T+2min (verificar asignación):**

```
Estoy logueado como COORDINADORA (Maria) en https://app.misterservicerd.com.
Ambiente pre-producción.

Angelica (secretaria) acaba de crear una orden nueva y asignarla al técnico Aury.
Verificá lo siguiente:

1. Andá a /admin/agenda. Buscá la orden nueva del día (asignada a Aury Mon).
   Decime el OS-XXXX y la hora agendada.
2. Verificá que Aury Mon aparece en la lista de técnicos del día (NO en "Sin citas hoy").
3. Andá a /admin/ordenes. Confirmá que la orden está visible con fase "agendado".
4. Mirá tu campanita. ¿Apareció notificación de "Nueva orden asignada"?
5. Andá a /admin/dashboard. ¿KPIs reflejan la orden nueva (+1 en "agendadas")?

Reportá.
```

**Fase B — T+20min (emitir conduce):**

```
Soy Maria, coordinadora. Yohana ya envió la orden a Facturación Pendiente.
Necesito que emitas el conduce de garantía siguiendo el FLUJO 1 del kit
`docs/QA_BROWSER_CLAUDE.md`:

1. Andá a /admin/facturacion-pendiente. Buscá la orden OS-XXXX (la del flujo de hoy).
2. Click "Procesar". Modal de 2 pasos.

PASO 1:
3. Confirmá que la descripción del ítem es editable. Si quieres, escribí
   "Test E2E distribuido — Maria coord" como descripción.
4. Buscá "Nota para el conduce". Escribí "Probado en flujo E2E con 4 Claudes simultaneas.".

PASO 2:
5. Si hay pago pendiente, registralo. Si no, dejá monto en 0 y NO tildes verificado.
6. Tiempo garantía: 30 días.
7. Click "Generar conduce de garantía".
8. Decime el CG-XXXXX que generó.

Reportá.
```

### PROMPT 3 — Operaria Yohana (PC #3)

Pegar **al comenzar T+18min**:

```
Estoy logueada como OPERARIA (Yohana) en https://app.misterservicerd.com.
Ambiente pre-producción.

Aury acaba de cerrar la orden OS-XXXX en su iPad. Necesito que la envíes a
facturación. Verificá y reportá:

1. Andá a /admin/ordenes. Buscá OS-XXXX.
   - ¿Aparece en tu lista? Si NO aparece, decime qué filtros tenés activos.
   - ¿Qué operaria muestra (debería ser Wilainy o vos)?
2. Abrí la orden. Verificá:
   - Cierre del técnico completo (con foto si la subió)
   - Período de garantía: 30 días
3. Si tenés permiso, click "Enviar a facturación" o equivalente.
4. ¿Apareció un toast confirmando que se envió?
5. Mirá tu campanita. ¿Hay notificaciones nuevas relacionadas con esta orden?
6. Andá a /admin/facturacion-pendiente. ¿Aparece OS-XXXX en la bandeja?

Reportá.
```

### PROMPT 4 — Operaria Wilainy (PC #4)

Pegar **al comenzar T+12min**:

```
Estoy logueada como OPERARIA (Wilainy) en https://app.misterservicerd.com.
Ambiente pre-producción.

Aury acaba de hacer el diagnóstico de la orden OS-XXXX en su iPad. Verificá
desde tu rol y reportame:

1. Mirá tu campanita. ¿Apareció notificación tipo "Cotización lista" o "Diagnóstico
   completado" relacionada con OS-XXXX?
2. Andá a /admin/ordenes. Buscá OS-XXXX.
   - ¿Aparece en tu lista?
   - ¿Qué técnico muestra (debería ser Aury Mon)?
   - ¿Qué operaria muestra (debería ser vos)?
   - ¿Qué fase muestra (debería ser "en_cotizacion" o similar)?
3. Abrí la orden. Verificá que el diagnóstico de Aury está visible.
4. Si tenés permiso, aprobá la cotización (click "Aprobar" o equivalente).
5. ¿Apareció toast confirmando aprobación?

Reportá.
```

---

## Instrucciones manuales (dispositivos sin Claude)

### Angelica (Secretaria, iPad #2) — T+0min

1. Abrir Mister Service en iPad.
2. Login como Angelica si no estás.
3. Andá a "Nueva orden" o sección equivalente.
4. Llenar:
   - Cliente: elegí cualquiera existente o creá "Test Cliente E2E".
   - Equipo tipo: lavadora.
   - Marca: Samsung.
   - Modelo: WA-E2E-001.
   - Descripción falla: "Test E2E distribuido — la lavadora no centrifuga".
   - Técnico: Aury Mon.
   - Fecha cita: hoy, hora actual + 15 min.
5. Guardar.
6. Anotá el OS-XXXX que se generó. **Avisame por WhatsApp/chat ese número.**

### Aury (Técnico, iPad #1) — T+5min

1. Login como Aury en iPad.
2. Ir a /tecnico.
3. Buscar la orden OS-XXXX (la que Angelica creó).
4. Click "Iniciar chequeo".
5. Completar diagnóstico:
   - Falla confirmada: "Polea rota, requiere reemplazo".
   - Piezas necesarias: "Polea + correa".
   - Precio sugerido: RD$3,500.
6. Submit.

**Esperá hasta T+15min para el siguiente paso.**

### Aury (Técnico, iPad #1) — T+15min

1. Volver a OS-XXXX en /tecnico.
2. Click "Cerrar orden" o "Trabajo realizado".
3. Wizard del cierre:
   - Equipo funciona: SÍ
   - Cliente satisfecho: SÍ
   - Revisó conexiones: SÍ
   - Foto del cierre: cualquier foto desde la cámara del iPad
   - **Período de garantía: 30 DÍAS** (importante para el test)
4. Firma del cliente (puede ser garabato).
5. Finalizar.

### Jesus (Técnico, celular #1) — paralelo, opcional

Para verificar que el cierre de Aury NO afecta a las órdenes de Jesus:

1. Login como Jesus en celular.
2. Mirar /tecnico. Anotar cuántas órdenes tiene asignadas.
3. Hacer hard refresh cada 5 min durante el test. Confirmar que su lista NO cambia (no debería verse afectado por las acciones de Aury).

### Luisa (Secretaria, iPad #3) — paralelo, opcional

Para verificar que las secretarias NO ven el flujo financiero:

1. Login como Luisa.
2. Intentar acceder a /admin/facturacion-pendiente.
3. ¿Te deja entrar o redirige? Reportá.
4. Intentar acceder a /admin/comisiones. ¿Te deja?
5. Reportá qué vio el sidebar tuyo vs. lo que vio Angelica.

---

## Checklist final post-test (Jorge revisa todos los reportes)

Una vez que tenés los 4-6 reportes (4 Claudes + Aury + Angelica como mínimo), Jorge cruza:

### Datos consistentes

- [ ] OS-XXXX aparece en TODAS las vistas con la misma información (número, cliente, técnico, equipo, fase).
- [ ] Operaria asignada coincide en /admin/ordenes vista admin, vista coord, vista operaria.
- [ ] Período de garantía 30 días aparece consistente en: detalle de orden, detalle de conduce, endpoint público `/garantia/<token>`.

### Notificaciones

- [ ] Cuando Angelica crea orden → Maria recibe "Nueva orden asignada".
- [ ] Cuando Aury completa diagnóstico → Wilainy recibe "Cotización lista".
- [ ] Cuando Aury cierra orden → Yohana recibe "Orden lista para conduce".
- [ ] Cuando Yohana envía a facturación → Maria recibe "Orden enviada a facturación".
- [ ] Cuando Maria emite conduce → Wilainy + Yohana + Jorge reciben "Conduce CG-XXXXX emitido".

### Permisos

- [ ] Luisa (secretaria) NO accede a /admin/facturacion-pendiente.
- [ ] Luisa NO accede a /admin/comisiones.
- [ ] Aury (técnico) NO accede a /admin (queda en /tecnico).
- [ ] Wilainy ve solo SUS órdenes de su grupo de técnicos, NO las de Yohana.

### Simetría visual

- [ ] El detalle de la orden se ve igual de coherente en cada rol (admin/coord/operaria).
- [ ] Los datos clave (cliente, equipo, técnico, período garantía) aparecen siempre en el mismo orden.
- [ ] Ningún campo aparece como "—" o "(sin nombre)" en ninguna vista.

---

## Cómo reportar el resultado

Cuando todos terminen, Jorge agrupa los reportes en un solo mensaje a Cowork:

```
QA E2E ejecutado 2026-MM-DD HH:MM.

OS-XXXX → CG-XXXXX.

REPORTES POR ROL:
- Admin (Claude PC #1): [pegar reporte]
- Coord Maria (Claude PC #2): [pegar reporte Fase A + Fase B]
- Operaria Yohana (Claude PC #3): [pegar reporte]
- Operaria Wilainy (Claude PC #4): [pegar reporte]
- Técnico Aury (manual iPad #1): [resumen Jorge]
- Secretaria Angelica (manual iPad #2): [resumen Jorge]
- Técnico Jesus (manual celular #1): [resumen Jorge si participó]
- Secretaria Luisa (manual iPad #3): [resumen Jorge si participó]

OBSERVACIONES:
- [bugs detectados]
- [UX rara]
- [permisos que fallaron]

Recomendación:
[archivar / abrir sprint de fix / repetir / ...]
```

Cowork cruza todo, identifica si hay bugs, y arma los sprints de fix.

---

## Escenarios futuros (para próximos tests)

Una vez que el Escenario 1 esté validado, expandir:

- **Escenario 2 — Reclamo de garantía**: el cliente abre `/garantia/<token>`, hace reclamo, cómo se ve en cada rol.
- **Escenario 3 — Reasignación de técnico**: admin reasigna técnico de Aury a Jesus, verificar que cambia operaria, notificaciones, agenda.
- **Escenario 4 — Cierre de día / nómina**: viernes simulado, todas las operarias revisan sus comisiones, admin valida totales.
- **Escenario 5 — Cancelar orden**: secretaria cancela una orden, verificar cleanup en agenda + notificaciones.
- **Escenario 6 — Edge case: orden Solo Chequeo**: probar el flujo con `soloChequeo: true` (sin reparación). Verificar que el conduce muestra el badge amber del SPRINT-148.

---

## Histórico

- **2026-05-12 v1** — Creado por Cowork después de que Jorge montó setup distribuido con 8 dispositivos / 8 roles simultáneos.
