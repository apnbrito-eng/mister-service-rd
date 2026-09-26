import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../../src/index.css';
import DocumentoPdf from '../../../src/components/inbox/DocumentoPdf';
createRoot(document.getElementById('root')!).render(<div style={{ padding: 20 }}><p>Conversación de prueba local</p><DocumentoPdf url="./sample.pdf" nombre="Documento de prueba.pdf" /></div>);
