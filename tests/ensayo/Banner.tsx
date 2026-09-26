import { useEffect } from 'react';
export default function BannerEnsayo() {
  useEffect(() => { document.title = 'ENSAYO AISLADO · Mister Service RD'; }, []);
  return <div role="note" style={{background:'#d1fae5',padding:12,color:'#064e3b',textAlign:'center'}}>
    <strong>ENSAYO AISLADO</strong> · Datos ficticios en este equipo. Sin envíos a WhatsApp, Meta ni bancos.
  </div>;
}
