# Organización de Mister Service RD

Definición confirmada por Jorge el 01/10/2026. Fuente: conversación 01a0f833-70e2-7e63-b204-027995df6176, listado de personal y aclaración sobre María. Este documento registra la estructura solicitada; no certifica cuentas ni permisos modificados en producción.

## Dirección
- Gerente de la empresa: Jorge.
- Supervisora de todos: María.
- Equipo A: operaria Wila (Wilainy en el selector actual), asistente Leany.
- Equipo B: operaria Yohana, asistente Disnely.

## Equipo A
| Persona | Función / especialidades |
|---|---|
| Wila | Operaria que preside el equipo |
| Leany | Asistente |
| Yoniel | Técnico: neveras, lavadoras, secadoras, estufas y aires acondicionados |
| Reyes Guzmán (Aury) | Técnico: lavadoras y secadoras |
| Diorky | Técnico: lavadoras y secadoras |
| Albert Brito | Técnico de aire acondicionado; además da mantenimiento de lavadoras, secadoras y estufas |
| Wilfredo (Gata salvaje) | Técnico: estufas |

## Equipo B
| Persona | Función / especialidades |
|---|---|
| Yohana | Operaria que preside el equipo |
| Disnely | Asistente |
| Wilmer | Contratista: neveras. Condición económica especial descrita abajo |
| Franklin (Fredin) | Técnico: estufas |
| Yunior (Suave) | Técnico: lavadoras y secadoras |
| José Alberto (Yow) | Técnico: lavadoras y secadoras |
| Miguel | Técnico: neveras, lavadoras y secadoras |

## Condición de Wilmer
Jorge indica dividir 50/50 la ganancia después de descontar el costo de la pieza. No confundir con 50% del precio bruto del servicio. No aplicar retroactivamente a liquidaciones ni modificar importes históricos por esta definición. Falta contrastar el cálculo existente y precisar cualquier otro concepto que forme parte de la base si aparece en la implementación.

## Acceso y operación solicitados
- Iniciar sesión con nombres de usuario, sin exigir correo personal. Los nombres exactos de acceso y contraseñas no fueron entregados. No guardar contraseñas en este documento.
- Cada persona conserva su identidad individual para atribuir acciones.
- Control y avance diario por Equipo A y Equipo B.
- IA WhatsApp todo el día, cediendo cuando una persona toma la conversación.
- Límites autorizados de IA: US$5 diarios y US$50 mensuales.
- Antiguas secretarias canceladas según el usuario; no se alteraron cuentas en esta captura de requisitos.

## Estado técnico comprobado
El formulario de ingreso actual usa signInWithEmailAndPassword y campo email. La API de creación también exige email. El acceso por nombre de usuario requiere implementación y pruebas; no está habilitado por registrar esta preferencia.
Los roles actuales son administrador, coordinadora, operaria, secretaria, tecnico y ayudante. Los cargos Gerente y Supervisora deben representarse respetando los permisos existentes; no se debe otorgar a María administración total por inferencia. Personal ya tiene especialidad y relación operariaId, pero requiere conciliación con cuentas existentes antes de asignar nombres a UID.
La IA continúa desactivada según diagnóstico documentado en ../qa/2026-10-01-whatsapp-ia-activacion.md.

## Siguiente paso
Conciliar este listado con personal y usuarios existentes, implementar acceso por nombre de usuario, crear las asistentes que falten y configurar equipos. Revisar por separado el cálculo de Wilmer y los reportes diarios. Validar permisos, acceso individual y derivación antes de activar la IA.
