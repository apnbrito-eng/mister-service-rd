import React from 'react';
import ReactDOM from 'react-dom/client';
import { iniciarRuntimeMovil } from './mobile/runtime';
import './index.css';
import './styles/apple.css';
import { iniciarViewport } from './mobile/viewport';
iniciarViewport();

async function arrancar() {
  await iniciarRuntimeMovil();
  const { default: App } = await import('./App');
  const { protegerSesionMovil } = await import('./mobile/sesion');
  protegerSesionMovil();
  document.documentElement.classList.toggle('es-ensayo', import.meta.env.VITE_FIREBASE_PROJECT_ID === 'mister-service-ensayo-260921');
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>{import.meta.env.VITE_FIREBASE_PROJECT_ID === 'mister-service-ensayo-260921' && <div role="note" className="entorno-ensayo">ENSAYO · Datos ficticios · WhatsApp real bloqueado</div>}<App /></React.StrictMode>,
  );
}
void arrancar().catch(() => {
  document.getElementById('root')!.textContent = 'No se pudo iniciar la aplicación. Revisa la configuración de esta versión.';
});
