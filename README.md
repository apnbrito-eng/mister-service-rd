# Mister Service RD

Sistema de gestión de servicios para empresa de reparación de electrodomésticos en República Dominicana.

## Stack Tecnológico

- **Frontend:** React + Vite + TypeScript
- **Estilos:** Tailwind CSS
- **Base de Datos:** Firebase Firestore (tiempo real)
- **Autenticación:** Firebase Authentication
- **Mapas:** Leaflet + OpenStreetMap
- **Geocodificación:** Nominatim (gratuito)
- **Íconos:** Lucide React
- **Fechas:** date-fns (español)
- **Notificaciones:** React Hot Toast

## Configuración

### 1. Crear proyecto en Firebase

1. Ve a [Firebase Console](https://console.firebase.google.com/)
2. Crea un nuevo proyecto
3. Habilita **Authentication** → método Email/Password
4. Crea una base de datos en **Firestore Database**
5. En configuración del proyecto, copia las credenciales del SDK web

### 2. Configurar variables de entorno

```bash
cp .env.example .env
```

Edita `.env` con tus credenciales de Firebase:

```
VITE_FIREBASE_API_KEY=tu-api-key
VITE_FIREBASE_AUTH_DOMAIN=tu-proyecto.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=tu-proyecto-id
VITE_FIREBASE_STORAGE_BUCKET=tu-proyecto.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=000000000000
VITE_FIREBASE_APP_ID=1:000000000000:web:0000000000000000
```

### 3. Crear usuario de prueba en Firebase Auth

En Firebase Console → Authentication → Agregar usuario:
- Email: `maria@misterservicerd.com`
- Contraseña: `misterservice123`

### 4. Instalar y ejecutar

```bash
npm install
npm run dev
```

La aplicación estará en `http://localhost:5173`

### 5. Datos de prueba

Los datos de prueba se cargan automáticamente al primer inicio de sesión si la base de datos está vacía.

## Reglas de Firestore (Producción)

Agrega estas reglas en Firebase Console → Firestore → Reglas:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

## Deploy en Vercel

1. Sube el repositorio a GitHub
2. Importa el proyecto en [Vercel](https://vercel.com)
3. Agrega las variables de entorno (las mismas del `.env`)
4. Framework Preset: **Vite**
5. Deploy

## Módulos

| Módulo | Descripción |
|--------|-------------|
| Dashboard | KPIs, embudo de servicio, alertas en tiempo real |
| Órdenes | Gestión completa de órdenes de servicio |
| Citas por Confirmar | Citas pendientes con alertas de urgencia |
| Calendario | Vista mensual/semanal/diaria por técnico |
| Stand-by/Piezas | Control de piezas faltantes con semáforo |
| Mapa de Rutas | Mapa interactivo con rutas de técnicos |
| Clientes | Directorio con historial y geocodificación |
| Cotizaciones | Generación e impresión de cotizaciones |
| Equipos Taller | Control de equipos en reparación |
| Rendimiento | KPIs por coordinador y globales |
| Mantenimiento | Programación de mantenimientos preventivos |
| Gastos e Ingresos | Control financiero con gráficos |
| Personal | CRUD de empleados |
| Configuración | Datos empresa y tipos de equipo |
| Vista Técnico | Interfaz móvil simplificada |

## Roles

- **Administrador:** Acceso total
- **Secretaria:** Gestión de citas y clientes
- **Operaria:** Diagnóstico, cotización, ejecución
- **Técnico:** Vista móvil — solo sus citas del día
