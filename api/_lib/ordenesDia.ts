/** La responsabilidad de la orden prevalece sobre cartera y atención del chat. */
export async function ordenesDelResponsable(db: FirebaseFirestore.Firestore, ordenes: FirebaseFirestore.DocumentSnapshot[], uid: string) {
  const propias: FirebaseFirestore.DocumentSnapshot[] = [];
  for(let i=0;i<ordenes.length;i+=100){
    const lote=ordenes.slice(i,i+100);
    const metas=await db.getAll(...lote.map(d=>db.collection('crm_ordenes').doc(d.id)));
    lote.forEach((d,j)=>{const o=d.data() || {};if((metas[j].data()?.responsableId || o.responsableId || o.operariaId)===uid)propias.push(d);});
  }
  return propias;
}
