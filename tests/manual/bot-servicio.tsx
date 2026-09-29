import ResumenBotServicio from '../../src/components/inbox/ResumenBotServicio';
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import BotServicioConfiguracion from '../../src/components/configuracion/BotServicioConfiguracion';
createRoot(document.getElementById('root')!).render(<main className="service-ui mx-auto max-w-6xl p-4"><p className="mb-4">Vista de prueba local. Personas y presupuestos ficticios; no conecta Firebase ni envía mensajes.</p><div id="resumen" className="mb-4"><ResumenBotServicio resumen={{ estado: 'pendiente', motivo: 'solicitud_o_datos_completos', equipoId: null, datos: { equipo: 'Equipo de prueba', servicio: 'mantenimiento', direccion: 'Dirección de prueba recibida en el chat', tieneFoto: true, tieneUbicacion: true }, pendientes: [] }} /></div><BotServicioConfiguracion /></main>);
