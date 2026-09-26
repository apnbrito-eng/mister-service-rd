# Revisión de los 20 criterios de publicación

Fecha: 25/09/2026. Proyecto Mister Service RD. Fuente de criterios: captura aportada por Jorge.
Alcance: inspección del código local, solicitudes HTTP a producción y navegación de inicio y agendar. No se modificó ni desplegó software, no se enviaron citas ni mensajes y no se intentaron escrituras abusivas. No equivale a auditoría legal, de penetración o certificación de todos los módulos/dispositivos.

| # | Criterio | Resultado | Evidencia y siguiente paso |
|---|---|---|---|
| 1 | Política de privacidad | Parcial | /privacidad devuelve 200 y contiene identidad, fines y eliminación. Revisar cobertura específica de GPS durante jornada, cámara, audio, notificaciones y conservación de app; presencia no certifica cumplimiento legal. |
| 2 | Términos y condiciones | Falta | Sin página dedicada ni enlace en pie. /terminos devuelve shell SPA. Definir condiciones reales de citas, cobros, cancelaciones y garantías. |
| 3 | API y secretos | Parcial | Solo .env.example versionado entre .env*. Barrido acotado src y dist/assets sin patrones de claves privadas, Anthropic o AWS. No cubre historial Git ni todas las credenciales/despliegues. Revisar restricciones de claves públicas y permisos; Firebase config pública no es por sí misma un secreto. |
| 4 | Forzar HTTPS | Comprobado | HTTP www devuelve 308 hacia HTTPS; HTTPS tiene HSTS max-age=63072000. |
| 5 | Banner de cookies | No implementado / evaluar necesidad | Sin componente de consentimiento localizado. Inventariar almacenamiento y servicios de terceros antes de decidir alcance; no instalar banner decorativo ni afirmar obligación universal. |
| 6 | Metadescripciones | Parcial | Inicio carece de description en HTML y DOM. ServicioDetalle.tsx:154 agrega descripción con JS, no en HTML inicial. |
| 7 | Vista previa al compartir | Falta | Sin og:title, og:description, og:image ni twitter:card en index.html/inicio. Implementar metadata accesible sin ejecutar JS. |
| 8 | Favicon | Comprobado | iconos declarados en index.html y /favicon.svg 200 image/svg+xml. |
| 9 | Sitemap y robots.txt | Parcial | sitemap.xml válido servido como XML con 9 URLs, manual y susceptible a catálogo desactualizado. /robots.txt devuelve HTML SPA 200, no robots. No usar robots para proteger datos privados. |
| 10 | ALT de imágenes | Parcial | Tres imágenes del inicio cargaron; logos con alt y decoración con alt vacío. Servicios usan título. No se certificaron todas las imágenes del CRM. |
| 11 | Comprimir imágenes | Parcial | comprimirImagen en formulario agendar (1 MB/1600px). logo-compacto.png 429308 bytes para logo pequeño; carrusel carga todas imágenes sin lazy/srcset. |
| 12 | Velocidad de carga | Pendiente de medición | Rutas lazy/Suspense existen. No se midieron LCP/INP/CLS ni red móvil real en esta revisión. No inferir rapidez por HTTP200. |
| 13 | Contraste | No cumple en caso comprobado | Botones WhatsApp texto blanco sobre rgb(34,197,94), contraste calculado 2.28:1. Inferior a 4.5:1 para texto normal y 3:1 grande. Oscurecer fondo o cambiar texto; ampliar auditoría. |
| 14 | Web en móvil | Parcial | Viewport y estilos responsive presentes. Pruebas anteriores no sustituyen nueva verificación integral Android/iPhone/iPad. En esta revisión no hubo prueba física ni matriz de tamaños. |
| 15 | Página 404 | Parcial | Admin404 existe; catch-all público redirige inicio. URL inexistente devuelve200: soft404. Crear vista pública y respuesta adecuada. |
| 16 | Enlaces rotos | Parcial | 10 destinos públicos responden200 y agendar carga formulario. SPA responde200 también a rutas inexistentes, por lo que no es validación semántica completa. No se envió WhatsApp ni comprobó cada destino externo/privado. |
| 17 | Validación de formularios | Parcial / prioridad alta | Frontend valida correo y campos. firestore.rules:287,295 permite create if true en citas_por_confirmar y solicitudes_servicio; solicitudes.service.ts:40 escribe directo. Faltan restricciones de esquema/campos en esas reglas. Verificar versión remota antes de afirmar exposición efectiva. |
| 18 | Protección antispam | Insuficiente en código revisado | Honeypot en agendar y límites en algunas API, pero creación pública directa sin límite de frecuencia/esquema en reglas señaladas. App Check no sustituye validación ni cuotas de negocio. No se probó abuso en producción. |
| 19 | Analytics GA4 | No localizado / opcional | Sin integración GA4/gtag encontrada en src/public. No es requisito de funcionamiento ni seguridad. Si se incorpora, medir web pública y evitar datos del CRM/clientes en eventos. |
| 20 | Llamada a la acción clara | Comprobado en inicio | Agendar Cita Online, Agendar Cita Ahora, WhatsApp y Llamar Ahora visibles; /agendar abre formulario. |

## Prioridades
1. Confirmar reglas desplegadas; restringir creación pública, validar esquema y aplicar cuotas/antispam con pruebas en ensayo. Hallazgo adicional: firestore.rules:277 permite lectura pública de ubicaciones_vehiculos; revisar si colección contiene posiciones reales y sustituir acceso general por acceso acotado autorizado. No se descargaron ubicaciones ni datos de clientes.
2. Términos, cobertura de privacidad para app, robots, metadata social y 404 público.
3. Contraste, peso de logos, imágenes adaptables y medición de rendimiento/accesibilidad por dispositivo.
4. Decidir medición GA4 y consentimiento según tecnologías/finalidades concretas, no por cumplir una lista mecánicamente.

Fuentes: index.html; vercel.json; public/sitemap.xml; public/privacidad.html; src/App.tsx:335,347; src/components/public/PublicLayout.tsx; src/components/public/HeroCarrusel.tsx:52; src/pages/public/ServicioDetalle.tsx:154; src/components/public/FormularioAgendarPublico.tsx:243,428,505; src/services/solicitudes.service.ts:40; firestore.rules:277,287,295.
Referencia contraste: https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html

No se asigna porcentaje de cumplimiento: varios criterios son parciales, opcionales o requieren mediciones adicionales. Esta lista de publicación no cubre por sí sola roles, copias/restauración, trazabilidad, integridad de órdenes, colas offline ni entrega push.
