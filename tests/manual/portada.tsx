import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import PortadaElectrodomesticos from '../../src/components/public/PortadaElectrodomesticos';
import PublicLayout from '../../src/components/public/PublicLayout';
import { configPortada } from './portada-stubs';
import '../../src/index.css';
createRoot(document.getElementById('root')!).render(<MemoryRouter><Routes><Route element={<PublicLayout />}><Route path="*" element={<PortadaElectrodomesticos config={configPortada} />} /></Route></Routes></MemoryRouter>);
