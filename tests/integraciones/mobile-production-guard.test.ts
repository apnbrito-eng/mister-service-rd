import {expect,it} from 'vitest';
import {debugAppCheckActivo} from '../../config/mobile.production-guard';
it('rechaza debug activo sin confundir false minificado con true',()=>{
 for(const valor of ['true','1','!0','! 0'])expect(debugAppCheckActivo.test(`debugToken: ${valor}`)).toBe(true);
 for(const valor of ['false','!1','0'])expect(debugAppCheckActivo.test(`debugToken: ${valor}`)).toBe(false);
});
