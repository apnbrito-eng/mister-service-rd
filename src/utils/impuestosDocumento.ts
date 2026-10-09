/** Política limitada a documentos nuevos; nunca recalcula históricos ni comisiones. */
export function desgloseImpuestosDocumento(total:number,tipo:'conduce_garantia'|'factura',porcentajeFiscal=18){
 if(!Number.isFinite(total) || total<0 || !Number.isFinite(porcentajeFiscal) || porcentajeFiscal<0 || porcentajeFiscal>100)throw new Error('Importes o porcentaje fiscal inválidos.');
 const redondear=(n:number)=>Math.round(n*100)/100;
 const porcentaje=tipo==='conduce_garantia'?0:porcentajeFiscal;
 const montoTotal=total,subtotal=tipo==='conduce_garantia'?total:redondear(montoTotal/(1+porcentaje/100));
 return {total:montoTotal,subtotal,itbis: redondear(montoTotal-subtotal),itbisPorcentaje:porcentaje};
}
/** Reconoce la política nueva por snapshot fiscal persistido, no por esGarantia de una orden. */
export function esConduceSinImpuestos(documento:{numero?:string;origen?:string;itbisPorcentaje?:number;itbisMonto?:number}){
 return documento.numero?.startsWith('CG-')===true && ['manual','post-cierre'].includes(documento.origen||'') && documento.itbisPorcentaje===0 && documento.itbisMonto===0;
}
