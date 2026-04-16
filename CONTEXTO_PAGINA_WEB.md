# CONTEXTO PARA DISENAR LA PAGINA WEB PUBLICA DE MISTER SERVICE RD

## 1. QUE ES MISTER SERVICE RD

Mister Service RD es una empresa de reparacion de electrodomesticos en Republica Dominicana. Ya tiene un **software interno** (app web) que usa el equipo de la empresa para gestionar ordenes de servicio, citas, tecnicos, cotizaciones, facturacion, GPS, etc. Ese software esta construido y desplegado.

Lo que se necesita ahora es **la pagina web publica** — el sitio que ven los clientes cuando buscan la empresa. Este sitio debe:
- Presentar la empresa profesionalmente
- Mostrar los servicios que ofrecen
- Permitir que los clientes soliciten citas (conectando con el sistema interno)
- Posiblemente mostrar tracking GPS del tecnico (ya existe la funcionalidad)

---

## 2. STACK TECNOLOGICO DEL SOFTWARE INTERNO (para referencia)

- **Frontend:** React 18 + TypeScript + Vite
- **Estilos:** Tailwind CSS
- **Base de datos:** Firebase Firestore (tiempo real)
- **Autenticacion:** Firebase Authentication
- **Storage:** Firebase Storage (fotos de cierre de servicio)
- **Mapas:** Leaflet + OpenStreetMap
- **Geocodificacion:** Nominatim (gratuito)
- **Hosting actual del software interno:** Vercel
- **Proyecto Firebase:** `mister-service-app-cloude`

### Configuracion Firebase (la pagina web DEBE conectar al mismo proyecto Firebase):
```
projectId: "mister-service-app-cloude"
authDomain: "mister-service-app-cloude.firebaseapp.com"
storageBucket: "mister-service-app-cloude.firebasestorage.app"
```
**IMPORTANTE:** La pagina web publica debe escribir en las MISMAS colecciones de Firestore que usa el software interno, para que las citas lleguen directamente al equipo.

---

## 3. PALETA DE COLORES Y BRANDING

Colores principales usados en el software interno (mantener consistencia):
- **Azul oscuro principal:** `#0f3460`
- **Azul medio:** `#1a5fa8`
- **Fondo claro:** `#f0f4f8`
- **Verde exito:** `#22c55e`
- **Rojo alerta:** `#ef4444`
- **Naranja advertencia:** `#f97316`

### Logo actual:
El logo es un componente React que muestra un icono de llave inglesa (Wrench de Lucide) dentro de un cuadrado redondeado azul oscuro, con el texto "Mister Service" en bold y "RD" debajo en azul medio. No tienen un logo grafico/imagen — es puramente tipografico con icono.

---

## 4. FUNCIONALIDADES PUBLICAS QUE YA EXISTEN EN EL SOFTWARE INTERNO

### 4.1 Formulario de Cita Publica (CitaPublica)

**Ruta actual:** `/cita/:calendarId`

**Como funciona:**
1. El admin crea "Calendarios" en el panel interno. Cada calendario tiene:
   - Nombre (ej: "Agenda de Maria", "Calendario General")
   - Persona asignada (tecnico o coordinador)
   - Color
   - Dias disponibles (seleccion de Lunes a Domingo)
   - Horas disponibles (slots de hora en hora: 9AM, 10AM, 11AM... hasta 6PM)
   - Estado activo/inactivo

2. El admin comparte el enlace del calendario (ej: `tudominio.com/cita/abc123`)

3. El cliente abre el enlace y ve un formulario con 3 secciones:
   - **Sus Datos:** nombre, telefono (10 digitos RD), email, direccion + boton "Mi ubicacion" (GPS)
   - **Detalles del Servicio:** tipo de equipo (Lavadora, Secadora, Nevera, Estufa, Aire Acondicionado, Otro), marca, descripcion de la falla
   - **Fecha y Hora:** calendario visual del mes con dias habilitados, luego seleccion de hora

4. Al enviar, se crea un documento en la coleccion `citas_por_confirmar` de Firestore con:
```javascript
{
  clienteNombre: string,
  telefono: string,
  clienteEmail: string,
  clienteDireccion: string,
  clienteLat: number | null,
  clienteLng: number | null,
  servicio: string, // "Lavadora Samsung"
  falla: string,
  horarioSolicitado: string, // "Lunes 15 de abril a las 10:00 AM"
  fechaSolicitada: Timestamp,
  horaSolicitada: string,
  calendarioId: string,
  calendarioNombre: string,
  asignadoId: string,
  asignadoNombre: string,
  origen: 'formulario_publico',
  estado: 'pendiente',
  createdAt: Timestamp
}
```

5. La cita aparece automaticamente en el panel interno (modulo "Citas por Confirmar") donde la secretaria/admin la gestiona.

### 4.2 Tracking GPS del Tecnico (TrackingCliente)

**Ruta actual:** `/tracking/:token`

**Como funciona:**
1. Cuando un tecnico va en camino, el admin activa GPS tracking en la orden
2. Se genera un token UUID unico y un enlace publico (ej: `tudominio.com/tracking/uuid-aqui`)
3. El enlace se comparte con el cliente por WhatsApp
4. El cliente ve en tiempo real:
   - Nombre del tecnico
   - Tipo de equipo y marca
   - Hora de la cita
   - Mapa interactivo (Leaflet) con:
     - Marcador del vehiculo del tecnico (icono de camion azul)
     - Marcador del domicilio del cliente (pin rojo)
     - Linea punteada entre ambos
   - Tarjeta de ETA: distancia en km, tiempo estimado, velocidad actual
   - Indicador de conexion (conectado/sin senal)
   - Estado del tecnico (en movimiento / detenido)
5. El tracking expira en 24 horas
6. Si el servicio ya fue completado, muestra pantalla de "Servicio completado"

---

## 5. COLECCIONES FIRESTORE RELEVANTES PARA LA PAGINA WEB

### `calendarios` — Calendarios de citas publicas
```typescript
{
  id: string,
  nombre: string,
  asignadoId: string,
  asignadoNombre: string,
  color: string,
  activo: boolean,
  dias: DiaSemana[], // ['Lunes', 'Martes', ...]
  horas: string[],   // ['9:00 AM', '10:00 AM', ...]
  createdAt: Timestamp
}
```

### `citas_por_confirmar` — Donde se guardan las solicitudes de cita
```typescript
{
  clienteNombre: string,
  telefono: string,
  clienteEmail?: string,
  clienteDireccion?: string,
  clienteLat?: number,
  clienteLng?: number,
  servicio: string,
  falla?: string,
  horarioSolicitado: string,
  fechaSolicitada: Timestamp,
  horaSolicitada: string,
  calendarioId: string,
  calendarioNombre: string,
  asignadoId: string,
  asignadoNombre: string,
  origen: string, // 'formulario_publico'
  estado: 'pendiente' | 'confirmada' | 'cancelada',
  createdAt: Timestamp
}
```

### `ordenes_servicio` — Para tracking GPS (solo lectura desde pagina publica)
```typescript
{
  // Solo campos relevantes para tracking:
  clienteNombre: string,
  clienteLat?: number,
  clienteLng?: number,
  clienteDireccion?: string,
  equipoTipo: string,
  equipoMarca?: string,
  fechaCita?: Timestamp,
  tecnicoNombre?: string,
  fase: string, // 'trabajo_realizado' | 'cerrado' = servicio completado
  trackingGPS?: {
    habilitado: boolean,
    token: string,       // UUID — es el parametro de la URL
    vehiculoId: string,
    expiresAt: Timestamp
  }
}
```

### `ubicaciones_vehiculos` — Ubicacion en tiempo real del tecnico
```typescript
// Documento ID = vehiculoId
{
  vehiculoId: string,
  tecnicoId: string,
  tecnicoNombre?: string,
  lat: number,
  lng: number,
  velocidad: number,      // km/h
  rumbo: number,
  timestamp: Timestamp,
  enMovimiento: boolean
}
```

---

## 6. SERVICIOS QUE OFRECE LA EMPRESA

### Tipos de equipos que reparan:
- Lavadoras
- Secadoras
- Neveras / Refrigeradores
- Estufas
- Aires Acondicionados
- Microondas
- Lavavajillas
- Otros electrodomesticos

### Tipos de servicio:
- Reparacion a domicilio
- Diagnostico
- Mantenimiento preventivo
- Reparacion en taller (el cliente lleva el equipo)

### Marcas que suelen manejar (basado en datos del sistema):
LG, Samsung, Mabe, Whirlpool, GE, Frigidaire, y otras marcas comunes en RD

---

## 7. FLUJO DE SERVICIO (para mostrar al cliente)

1. **Solicitud** — El cliente solicita una cita (formulario web, WhatsApp, llamada)
2. **Confirmacion** — La empresa confirma la cita por WhatsApp/telefono
3. **Diagnostico** — El tecnico evalua el equipo en el domicilio o taller
4. **Cotizacion** — Se envia presupuesto al cliente
5. **Aprobacion** — El cliente aprueba y se agenda la reparacion
6. **Reparacion** — El tecnico realiza el trabajo (con tracking GPS en tiempo real)
7. **Cierre** — Verificacion de calidad con foto y GPS

---

## 8. INTEGRACION WHATSAPP

La empresa usa WhatsApp como canal principal de comunicacion. Plantillas de mensajes que usan:
- Confirmacion de cita
- Recordatorio de cita
- Actualizacion de diagnostico
- Envio de cotizacion
- Aprobacion de cotizacion
- Pieza en espera / pieza llego
- Equipo listo para retirar
- Trabajo completado
- Seguimiento post-servicio
- Recordatorio de mantenimiento

**Formato de telefono para RD:** 10 digitos (ej: 8091234567). Para WhatsApp se usa con prefijo +1 (ej: wa.me/18091234567).

---

## 9. NORMALIZACION DE TELEFONO (importante para que los datos sean consistentes)

La funcion de normalizacion:
```javascript
function normalizarTelefono(tel) {
  const soloDigitos = tel.replace(/\D/g, '');
  // Si tiene 11 digitos y empieza con 1, quitar el 1
  if (soloDigitos.length === 11 && soloDigitos.startsWith('1')) {
    return soloDigitos.substring(1);
  }
  // Tomar ultimos 10 digitos
  return soloDigitos.slice(-10);
}
```
Validacion: el telefono normalizado debe tener exactamente 10 digitos.

---

## 10. QUE DEBE TENER LA PAGINA WEB PUBLICA

### Paginas sugeridas:
1. **Inicio (Landing)** — Hero, servicios destacados, CTA para agendar cita, testimonios
2. **Servicios** — Detalle de cada tipo de servicio y equipo
3. **Agendar Cita** — Formulario conectado a Firebase (misma logica que CitaPublica)
4. **Tracking** — Pagina de tracking GPS (misma logica que TrackingCliente)
5. **Sobre Nosotros** — Historia, equipo, valores
6. **Contacto** — WhatsApp (boton flotante), telefono, ubicacion

### Requisitos tecnicos:
- **DEBE** conectar al mismo proyecto Firebase (`mister-service-app-cloude`)
- **DEBE** escribir en la coleccion `citas_por_confirmar` con el campo `origen: 'formulario_publico'`
- **DEBE** leer de `calendarios` para mostrar disponibilidad
- **DEBE** leer de `ordenes_servicio` y `ubicaciones_vehiculos` para tracking
- **DEBE** usar la misma normalizacion de telefono
- **DEBE** ser responsive (mobile-first, los clientes usan mucho el celular)
- **DEBE** tener boton flotante de WhatsApp
- Mantener consistencia visual con los colores del software interno

### Donde alojar:
- **Opcion recomendada:** Vercel (ya usan Vercel para el software interno)
- Dominio separado o subdominio (ej: `www.misterservicerd.com` para la pagina, el software interno en otro dominio)
- Tambien puede ser el mismo proyecto con rutas separadas

---

## 11. DATOS DE CONTACTO DE LA EMPRESA

- **Nombre:** Mister Service RD
- **Ubicacion:** Republica Dominicana (Santo Domingo area)
- **Moneda:** RD$ (Peso Dominicano)
- **Idioma:** Espanol
- **Centro de coordenadas por defecto:** lat 18.48, lng -69.93 (Santo Domingo)

---

## 12. NOTAS ADICIONALES

- El formulario de cita actual NO requiere autenticacion (es totalmente publico)
- El tracking GPS tampoco requiere autenticacion (acceso por token UUID)
- La geocodificacion usa Nominatim (servicio gratuito de OpenStreetMap)
- Los calendarios se crean/gestionan SOLO desde el panel interno
- La pagina web publica solo ESCRIBE citas y LEE calendarios/tracking — nunca modifica ordenes

---

## 13. RESUMEN DE COLECCIONES Y PERMISOS DESDE LA PAGINA WEB

| Coleccion | Permiso desde web publica | Uso |
|-----------|---------------------------|-----|
| `calendarios` | LECTURA | Obtener dias/horas disponibles |
| `citas_por_confirmar` | ESCRITURA | Crear solicitudes de cita |
| `ordenes_servicio` | LECTURA (por token) | Tracking GPS — buscar orden por token |
| `ubicaciones_vehiculos` | LECTURA | Tracking GPS — ubicacion en tiempo real |
| `clientes` | NO ACCESO | Solo el sistema interno |
| `personal` | NO ACCESO | Solo el sistema interno |
| `cotizaciones` | NO ACCESO | Solo el sistema interno |
| `facturas` | NO ACCESO | Solo el sistema interno |
