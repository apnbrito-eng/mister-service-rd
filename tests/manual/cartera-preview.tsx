import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import ClientesResponsables from '../../src/pages/ClientesResponsables';
import '../../src/index.css';
function Preview(){const [modo,setModo]=useState('movil'); const interior=new URLSearchParams(location.search).has('interior');
if(interior)return <div style={{background:'#f8fafc',minHeight:'100vh'}}><ClientesResponsables/></div>;
return <main style={{height:'100vh',display:'flex',flexDirection:'column',background:'#e2e8f0'}}><header style={{padding:16,background:'#fff',display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'}}><strong>Clientes y responsables</strong><button onClick={()=>setModo('movil')} aria-pressed={modo==='movil'} style={{padding:'10px 20px',borderRadius:10,background:modo==='movil'?'#1d4ed8':'#e2e8f0',color:modo==='movil'?'white':'#334155'}}>Móvil</button><button onClick={()=>setModo('web')} aria-pressed={modo==='web'} style={{padding:'10px 20px',borderRadius:10,background:modo==='web'?'#1d4ed8':'#e2e8f0',color:modo==='web'?'white':'#334155'}}>Web</button><span style={{fontSize:13}}>Prueba local · datos ficticios · sin publicar</span></header><iframe title={modo==='movil'?'Vista móvil':'Vista web'} src="?interior" style={{width:modo==='movil'?390:'100%',maxWidth:'100%',flex:1,margin:'12px auto',border:'1px solid #cbd5e1',borderRadius:modo==='movil'?24:0,background:'white'}}/></main>;}
createRoot(document.getElementById('root')!).render(<Preview/>);
