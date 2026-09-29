import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter,Routes,Route,Link} from 'react-router-dom';
import Inbox from '../../src/pages/Inbox';
import '../../src/index.css';
function Preview(){const [modo,setModo]=useState('web');
if(new URLSearchParams(location.search).has('interior'))return <MemoryRouter><Routes><Route path="/" element={<div style={{padding:16}}><Inbox/></div>}/><Route path="*" element={<div style={{padding:24}}>Esta prueba muestra la bandeja. <Link to="/">Volver a conversaciones</Link></div>}/></Routes></MemoryRouter>;
return <main style={{height:'100vh',display:'flex',flexDirection:'column',background:'#e2e8f0'}}><header style={{padding:16,background:'white',display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'}}><strong>WhatsApp · Bandeja actualizada</strong>{['movil','web'].map(m=><button key={m} aria-pressed={modo===m} onClick={()=>setModo(m)} style={{padding:'10px 20px',borderRadius:10,background:modo===m?'#1d4ed8':'#e2e8f0',color:modo===m?'white':'#334155'}}>{m==='movil'?'Móvil':'Web'}</button>)}<span style={{fontSize:13}}>Componente real · datos ficticios · sin publicar</span></header><iframe title="Bandeja WhatsApp" src="?interior" style={{width:modo==='movil'?390:'100%',maxWidth:'100%',flex:1,margin:'12px auto',border:'1px solid #cbd5e1',borderRadius:modo==='movil'?24:0,background:'white'}}/></main>;}
createRoot(document.getElementById('root')!).render(<Preview/>);
