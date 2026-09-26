# Navegación y lectura clara — 22/09/2026

Objetivo: aplicar la referencia visual de WhatsApp al espacio de oficina del CRM, conservando rutas y funciones.

Implementado:
- Navegación inferior móvil/tableta: Inicio, Chats, Servicios, Clientes, Más. Se muestra bajo 1024px; escritorio conserva sidebar.
- Chats usa los mismos cuatro roles que Sidebar; Servicios y Clientes consultan los permisos existentes. Más abre el menú completo y navegar lo cierra.
- Barra inferior participa en el layout, sin cubrir el área desplazable. Asistente elevado sobre la barra. Áreas seguras existentes conservadas.
- Fondo blanco, tipografía de sistema, secundarios más contrastados y cabecera de sección compacta móvil.
- Clientes: filas claras, nombre16px, avatar44px. Citas/órdenes: filas con separadores; avisos de estado/garantía conservados. Cabecera Citas apilada móvil.
- No cambios en consultas, permisos de servidor, cobros, envíos o datos.

Validación: compilación web y API correcta. Administrador ficticio en navegador: enlaces Clientes/Servicios/Chats, Más y entrada Citas; formulario Registrar Cita abre y cancela sin guardar. 360px formulario sin overflow; 414px capturas Clientes y navegación;768px barra dentro de viewport, sin overflow;1440px barra móvil oculta y sidebar conservado. Los datos actuales de estas listas están vacíos: falta revisión de filas pobladas y recorridos con roles distintos en navegador. No equivale a prueba en dispositivo físico.

Se corrigió durante QA una importación de icono no soportado por la versión local. Sin nuevas dependencias. No APK/IPA reconstruido. Producción intacta; destino de publicación: mister-service-ensayo.
