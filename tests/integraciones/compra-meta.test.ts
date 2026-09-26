import { describe, it, expect } from 'vitest';
import { prepararCompraMeta, type CompraMetaEntrada } from '../../api/_lib/compraMeta';
import { origenAnuncio } from '../../api/_lib/preferenciasMarketing';
const base: CompraMetaEntrada = { facturaId: 'f1', facturaOrdenId: 'o1', ordenId: 'o1', facturaTotal: 8000, moneda: 'DOP', facturaAnulada: false, ordenAnulada: false, cierreSupervisorConfirmado: true, cierreMs: 100000, pagos: [{ monto: 3000, verificado: true }, { monto: 5000, verificado: true }], ctwaClid: 'clic_ficticio' };
describe('Compra para Meta al cierre administrativo pagado', () => {
  it('conserva clic y anuncio sin inventar atribución', () => {
    expect(origenAnuncio({referral:{source_type:'ad',source_id:'123',ctwa_clid:'clic_1'}})).toMatchObject({anuncioId:'123',ctwaClid:'clic_1'});
    expect(origenAnuncio({})).toBeNull();
  });
  it('cuenta una factura y no dos abonos', () => {
    const r = prepararCompraMeta(base);
    expect(r.ok && r.evento.custom_data.value).toBe(8000);
    expect(r.ok && r.evento.event_id).toBe('factura:f1');
    expect(prepararCompraMeta(base)).toEqual(r);
  });
  it('no cuenta transferencia pendiente ni anticipo solo', () => {
    expect(prepararCompraMeta({...base,pagos:[{monto:3000,verificado:true},{monto:5000,verificado:false}]}).ok).toBe(false);
  });
  it('requiere cierre de supervisión', () => expect(prepararCompraMeta({...base,cierreSupervisorConfirmado:false}).ok).toBe(false));
  it('rechaza anulada y orden ajena', () => {
    expect(prepararCompraMeta({...base,facturaAnulada:true}).ok).toBe(false);
    expect(prepararCompraMeta({...base,facturaOrdenId:'otra'}).ok).toBe(false);
  });
  it('no atribuye sin clic ni altera fecha real', () => {
    expect(prepararCompraMeta({...base,ctwaClid:undefined}).ok).toBe(false);
    expect(prepararCompraMeta({...base,cierreMs:Date.now()+60000}).ok).toBe(false);
  });
});
