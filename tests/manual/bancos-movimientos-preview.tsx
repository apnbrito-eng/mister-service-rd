import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { HistorialBanco } from '../../src/components/bancos/MovimientosBanco';
import '../../src/index.css';
const p = (id: string, extra = {}) => ({ id, bancoId: 'b1', metodo: 'transferencia', monto: 1500, fecha: '2026-09-29T12:00:00-04:00', verificado: true, ...extra });
createRoot(document.getElementById('root')!).render(<MemoryRouter><main className="max-w-5xl mx-auto p-4 space-y-4"><p className="bg-amber-50 p-3">Prueba local · datos ficticios · sin suscripciones ni escrituras</p><HistorialBanco bancos={[{ id: 'b1', nombre: 'Cuenta de prueba', numeroCuenta: '001' }, { id: 'b2', nombre: 'Cuenta de prueba', numeroCuenta: '002' }]} ordenes={[{ id: 'orden-prueba', datos: { numero: 'OS-PRUEBA', clienteNombre: 'Cliente de prueba', pagos: [p('p1'), p('p2', { verificado: false }), p('p3'), p('p3'), p('p4', { fecha: undefined }), p('p5', { bancoId: 'b2' })] } }]} /></main></MemoryRouter>);
