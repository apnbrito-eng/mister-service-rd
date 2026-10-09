# Documentos privados de personal — 09/10/2026

Endpoint `api/personal/documentos.ts`: administración/coordinación activas mediante sesión revocable y perfil usuarios; si usa permisos personalizados, exige personalModificar explícito. Tipos foto, cedula, licencia. POST base64 de JPEG/PNG/WebP con firma binaria y límite2MB; guarda path aleatorio bajo crm-private/personal/{personalId}/UUID, no añade token de descarga ni URL pública. Registra metadatos mínimos en personal_privado.documentos y auditoría actor. Si falla persistencia borra el objeto nuevo; reemplazos antiguos quedan conservados para futura política de retención, nunca se purgan automáticamente.

GET id/tipo autentificado valida path, MIME y tamaño antes de descargar y devuelve JSON MIME+base64 compatible con el transporte de APK Capacitor, decodificado a Blob por el servicio, con cache private/no-store y nosniff. Acceso de lectura también auditado. No usa URLs firmadas persistentes.

Frontend nuevo `PersonalDocumentosPrivados` recibe personalId guardado; subir/ver por fetch autorizado. Preview mediante blob URL revocada al desmontar/reemplazar. Root debe montar solo en ficha de administración/coord autorizada después de integrar cambios concurrentes de Claude. No se tocó Personal.tsx, types ni Rules.

Verificación: typecheck API/frontend, lint focal,3 pruebas unitarias de roles/overrides/tipo/MIME/firma/base64/tamaño y transporte móvil byte a byte pasan. No carga real, prueba HTTP, emulador Storage, verificación IAM pública del bucket ni validación Samsung. Rules existentes excluyen prefijo crm-private de comodín público; verificar eso e IAM antes de publicación. La validación de firmas no reemplaza decodificador completo/antivirus; solo se aceptan formatos raster indicados.
