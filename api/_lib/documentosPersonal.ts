export const TIPOS_DOCUMENTO_PERSONAL = ['foto', 'cedula', 'licencia'] as const;
export type TipoDocumentoPersonal = typeof TIPOS_DOCUMENTO_PERSONAL[number];
export function validarTipoDocumento(tipo: unknown): TipoDocumentoPersonal {
 if(typeof tipo!=='string' || !TIPOS_DOCUMENTO_PERSONAL.includes(tipo as TipoDocumentoPersonal)) throw new Error('Tipo de documento inválido.');
 return tipo as TipoDocumentoPersonal;
}
export function puedeDocumentosPersonal(perfil: Record<string,unknown>):boolean {
 if(perfil.activo===false || perfil.eliminado===true || !['administrador','coordinadora'].includes(String(perfil.rol)))return false;
 const permisos=perfil.permisosSistema as Record<string,unknown>|undefined;
 return perfil.permisosPersonalizados!==true || permisos?.personalModificar===true;
}
export function validarImagenPersonal(base64:unknown,mime:unknown):Buffer {
 if(typeof base64!=='string' || base64.length>Math.ceil(2*1024*1024/3)*4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || base64.length%4!==0)throw new Error('Imagen inválida o mayor de 2 MB.');
 const bytes=Buffer.from(base64,'base64');
 if(bytes.length<12 || bytes.length>2*1024*1024 || bytes.toString('base64')!==base64)throw new Error('Imagen inválida o mayor de 2 MB.');
 const jpeg=bytes[0]===0xff && bytes[1]===0xd8 && bytes[2]===0xff;
 const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 const webp=bytes.toString('ascii',0,4)==='RIFF' && bytes.toString('ascii',8,12)==='WEBP';
 if(!(mime==='image/jpeg' && jpeg || mime==='image/png' && png || mime==='image/webp' && webp))throw new Error('Usa únicamente JPG, PNG o WebP válidos.');
 return bytes;
}
