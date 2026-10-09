import test from 'node:test';import assert from 'node:assert/strict';
import { puedeDocumentosPersonal,validarImagenPersonal,validarTipoDocumento } from '../../api/_lib/documentosPersonal.js';
test('documentos privados solo administración/coordinación activas y override explícito',()=>{
 for(const rol of ['secretaria','operaria','tecnico','ayudante'])assert.equal(puedeDocumentosPersonal({rol}),false);
 assert.equal(puedeDocumentosPersonal({rol:'administrador'}),true);
 assert.equal(puedeDocumentosPersonal({rol:'coordinadora',activo:false}),false);
 assert.equal(puedeDocumentosPersonal({rol:'coordinadora',permisosPersonalizados:true,permisosSistema:{personalModificar:false}}),false);
 assert.equal(puedeDocumentosPersonal({rol:'coordinadora',permisosPersonalizados:true,permisosSistema:{personalModificar:true}}),true);
});
test('rechaza SVG, mime suplantado, base64 irregular y tamaño excesivo',()=>{
 assert.throws(()=>validarImagenPersonal(Buffer.from('<svg>bad</svg>').toString('base64'),'image/svg+xml'));
 assert.throws(()=>validarImagenPersonal(Buffer.from('<svg>bad</svg>').toString('base64'),'image/png'));
 assert.throws(()=>validarImagenPersonal('???','image/png'));
 assert.throws(()=>validarImagenPersonal(Buffer.alloc(2*1024*1024+1).toString('base64'),'image/png'));
 assert.throws(()=>validarTipoDocumento('../cedula'));
 const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(8)]);
 assert.equal(validarImagenPersonal(png.toString('base64'),'image/png').length,16);
});
import { decodificarDocumentoPersonal } from '../../src/services/documentosPersonal.service.js';
test('transporte JSON móvil preserva bytes al decodificar y rechaza MIME/tamaño',async()=>{
 const bytes=Buffer.from([137,80,78,71,13,10,26,10,0,128,255,0]);
 const blob=decodificarDocumentoPersonal({mime:'image/png',base64:bytes.toString('base64')});
 assert.equal(blob.type,'image/png');assert.deepEqual(Buffer.from(await blob.arrayBuffer()),bytes);
 assert.throws(()=>decodificarDocumentoPersonal({mime:'text/html',base64:bytes.toString('base64')}));
 assert.throws(()=>decodificarDocumentoPersonal({mime:'image/png',base64:'?bad'}));
 assert.throws(()=>decodificarDocumentoPersonal({mime:'image/png',base64:Buffer.alloc(2*1024*1024+1).toString('base64')}));
});
