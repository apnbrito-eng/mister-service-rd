import { collection, addDoc, getDocs, Timestamp, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './config';
import { normalizarTelefono } from '../services/clientes.service';

export async function seedDatabase() {
  // ROBUST anti-duplicate: single flag in config/sistema
  const configRef = doc(db, 'config', 'sistema');
  try {
    const configSnap = await getDoc(configRef);
    if (configSnap.exists() && configSnap.data()?.inicializado === true) {
      return; // Already seeded — never insert again
    }
  } catch (err) {
    console.error('Error checking seed flag:', err);
  }

  // Double-check: if any data exists, skip
  const personalSnap = await getDocs(collection(db, 'personal'));
  if (!personalSnap.empty) {
    // Mark as initialized and exit
    await setDoc(configRef, { inicializado: true, fecha: Timestamp.now() });
    console.log('Data already exists, marking as initialized.');
    return;
  }

  console.log('Seeding database for the first time...');

  // Set atomic counters
  await setDoc(doc(db, 'config', 'contadores'), {
    ultimaOrden: 10,
    ultimaCotizacion: 3,
    ultimaFactura: 5,
  });

  // Personal
  const personalData = [
    { nombre: 'María González', rol: 'administrador', telefono: '8095550001', email: 'maria@misterservicerd.com', especialidad: 'Administración', zona: 'Santo Domingo', color: '#8b5cf6', disponibilidad: true, activo: true },
    { nombre: 'Wila Martínez', rol: 'secretaria', telefono: '8095550002', email: 'wila@misterservicerd.com', especialidad: 'Atención al cliente', zona: 'Santo Domingo', color: '#ec4899', disponibilidad: true, activo: true },
    { nombre: 'Karina Pérez', rol: 'secretaria', telefono: '8095550003', email: 'karina@misterservicerd.com', especialidad: 'Atención al cliente', zona: 'Santo Domingo', color: '#f43f5e', disponibilidad: true, activo: true },
    { nombre: 'Yohana Díaz', rol: 'operaria', telefono: '8095550004', email: 'yohana@misterservicerd.com', especialidad: 'Coordinación', zona: 'Santo Domingo', color: '#14b8a6', disponibilidad: true, activo: true },
    { nombre: 'Yelisa Santos', rol: 'operaria', telefono: '8095550005', email: 'yelisa@misterservicerd.com', especialidad: 'Coordinación', zona: 'Santo Domingo Este', color: '#f59e0b', disponibilidad: true, activo: true },
    {
      nombre: 'Carlos Técnico', rol: 'tecnico', telefono: '8095550006', email: 'carlos@misterservicerd.com',
      especialidad: 'Refrigeración y A/C', zona: 'Distrito Nacional', color: '#3b82f6', disponibilidad: true, activo: true,
      permisos: {
        vistaAgenda: 'dia', soloPropiasCitas: true,
        verTelefonoCliente: true, verEmailCliente: false, verDireccionCliente: true, verUbicacionGPS: true,
        puedeMarcarCompletado: true, puedeAgregarNotas: true, puedeVerHistorial: false,
        puedeContactarCliente: true, puedeVerCotizaciones: false, recibeNotificacionNuevaCita: true,
      },
    },
    {
      nombre: 'Pedro Técnico', rol: 'tecnico', telefono: '8095550007', email: 'pedro@misterservicerd.com',
      especialidad: 'Lavadoras y Secadoras', zona: 'Santo Domingo Norte', color: '#f97316', disponibilidad: true, activo: true,
      permisos: {
        vistaAgenda: 'dia', soloPropiasCitas: true,
        verTelefonoCliente: false, verEmailCliente: false, verDireccionCliente: true, verUbicacionGPS: true,
        puedeMarcarCompletado: true, puedeAgregarNotas: true, puedeVerHistorial: false,
        puedeContactarCliente: false, puedeVerCotizaciones: false, recibeNotificacionNuevaCita: true,
      },
    },
  ];

  const personalRefs: Record<string, string> = {};
  for (const p of personalData) {
    const ref = await addDoc(collection(db, 'personal'), { ...p, createdAt: Timestamp.now() });
    personalRefs[p.nombre] = ref.id;
  }

  // Clientes
  const clientesData = [
    { nombre: 'Juan Ramírez', telefono: '8095551001', email: 'juan@email.com', direccion: 'Av. Winston Churchill #45, Piantini, Santo Domingo', referenciaDireccion: 'Frente a Agora Mall', lat: 18.4861, lng: -69.9312 },
    { nombre: 'Ana Hernández', telefono: '8095551002', email: 'ana@email.com', direccion: 'Calle El Conde #120, Zona Colonial, Santo Domingo', referenciaDireccion: 'Al lado de la Catedral', lat: 18.4730, lng: -69.8854 },
    { nombre: 'Roberto Jiménez', telefono: '8095551003', email: 'roberto@email.com', direccion: 'Av. 27 de Febrero #200, Naco, Santo Domingo', referenciaDireccion: 'Cerca de Blue Mall', lat: 18.4820, lng: -69.9167 },
    { nombre: 'Carmen López', telefono: '8095551004', email: 'carmen@email.com', direccion: 'Av. Abraham Lincoln #89, Piantini, Santo Domingo', referenciaDireccion: 'Detrás de Unicentro', lat: 18.4700, lng: -69.9350 },
    { nombre: 'Miguel Rosario', telefono: '8095551005', email: 'miguel@email.com', direccion: 'Calle Las Damas #55, Zona Colonial, Santo Domingo', referenciaDireccion: 'Junto al Alcázar de Colón', lat: 18.4740, lng: -69.8870 },
  ];

  const clienteRefs: string[] = [];
  for (const c of clientesData) {
    const telNorm = normalizarTelefono(c.telefono);
    // Use normalized phone as doc ID to prevent duplicates
    await setDoc(doc(db, 'clientes', telNorm), {
      ...c,
      telefonoNormalizado: telNorm,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    clienteRefs.push(telNorm);
  }

  const now = Timestamp.now();
  const hace1h = Timestamp.fromDate(new Date(Date.now() - 60 * 60 * 1000));
  const hace30m = Timestamp.fromDate(new Date(Date.now() - 30 * 60 * 1000));
  const hace3h = Timestamp.fromDate(new Date(Date.now() - 3 * 60 * 60 * 1000));
  const hace2d = Timestamp.fromDate(new Date(Date.now() - 2 * 24 * 60 * 60 * 1000));
  const hace5d = Timestamp.fromDate(new Date(Date.now() - 5 * 24 * 60 * 60 * 1000));
  const hace15d = Timestamp.fromDate(new Date(Date.now() - 15 * 24 * 60 * 60 * 1000));
  const hoy10am = Timestamp.fromDate(new Date(new Date().setHours(10, 0, 0, 0)));
  const hoy2pm = Timestamp.fromDate(new Date(new Date().setHours(14, 0, 0, 0)));
  const hoy4pm = Timestamp.fromDate(new Date(new Date().setHours(16, 0, 0, 0)));

  // Órdenes de servicio
  const ordenesData = [
    {
      numero: 'OS-0001', clienteId: clienteRefs[0], clienteNombre: 'Juan Ramírez', clienteTelefono: '8095551001',
      clienteDireccion: clientesData[0].direccion,
      equipoTipo: 'Lavadora', equipoMarca: 'LG', equipoModelo: 'WT19DSBP', descripcionFalla: 'No centrifuga correctamente',
      tecnicoId: personalRefs['Carlos Técnico'], tecnicoNombre: 'Carlos Técnico',
      responsableId: personalRefs['Yohana Díaz'], responsableNombre: 'Yohana Díaz',
      fase: 'nuevo_lead', estadoSimple: 'pendiente', estado: 'activo',
      fechaCita: hoy10am, duracionMin: 60, notas: 'Cliente urgente',
      creadoPor: 'Wila Martínez',
      historialFases: [{ fase: 'nuevo_lead', timestamp: hace30m, usuario: 'Wila Martínez' }],
      createdAt: hace30m, updatedAt: hace30m,
    },
    {
      numero: 'OS-0002', clienteId: clienteRefs[1], clienteNombre: 'Ana Hernández', clienteTelefono: '8095551002',
      clienteDireccion: clientesData[1].direccion,
      equipoTipo: 'Nevera', equipoMarca: 'Samsung', equipoModelo: 'RT38K5930', descripcionFalla: 'No enfría el compartimento superior',
      tecnicoId: personalRefs['Pedro Técnico'], tecnicoNombre: 'Pedro Técnico',
      responsableId: personalRefs['Yelisa Santos'], responsableNombre: 'Yelisa Santos',
      fase: 'en_diagnostico', estadoSimple: 'en_proceso', estado: 'activo',
      fechaCita: hoy2pm, duracionMin: 90, notas: '',
      creadoPor: 'Karina Pérez',
      historialFases: [
        { fase: 'nuevo_lead', timestamp: hace3h, usuario: 'Karina Pérez' },
        { fase: 'en_gestion', timestamp: hace3h, usuario: 'Karina Pérez' },
        { fase: 'en_diagnostico', timestamp: hace3h, usuario: 'Yohana Díaz' },
      ],
      createdAt: hace3h, updatedAt: hace3h,
    },
    {
      numero: 'OS-0003', clienteId: clienteRefs[2], clienteNombre: 'Roberto Jiménez', clienteTelefono: '8095551003',
      clienteDireccion: clientesData[2].direccion,
      equipoTipo: 'Aire Acondicionado', equipoMarca: 'Carrier', equipoModelo: '42KQA012', descripcionFalla: 'No enfría, compresor hace ruido',
      tecnicoId: personalRefs['Carlos Técnico'], tecnicoNombre: 'Carlos Técnico',
      responsableId: personalRefs['Yohana Díaz'], responsableNombre: 'Yohana Díaz',
      fase: 'en_cotizacion', estadoSimple: 'en_proceso', estado: 'activo',
      fechaCita: hoy4pm, duracionMin: 45, notas: 'Revisar compresor',
      creadoPor: 'Wila Martínez',
      historialFases: [
        { fase: 'nuevo_lead', timestamp: hace2d, usuario: 'Wila Martínez' },
        { fase: 'en_cotizacion', timestamp: hace2d, usuario: 'Yohana Díaz' },
      ],
      createdAt: hace2d, updatedAt: hace2d,
    },
    {
      numero: 'OS-0004', clienteId: clienteRefs[3], clienteNombre: 'Carmen López', clienteTelefono: '8095551004',
      clienteDireccion: clientesData[3].direccion,
      equipoTipo: 'Estufa', equipoMarca: 'Whirlpool', equipoModelo: 'WFG320M0B', descripcionFalla: 'Quemador frontal no enciende',
      tecnicoId: personalRefs['Pedro Técnico'], tecnicoNombre: 'Pedro Técnico',
      responsableId: personalRefs['Yelisa Santos'], responsableNombre: 'Yelisa Santos',
      fase: 'aprobado', estadoSimple: 'pendiente', estado: 'activo',
      fechaCita: null, duracionMin: 60, notas: 'Aprobado por cliente, falta agendar',
      creadoPor: 'Karina Pérez',
      historialFases: [
        { fase: 'nuevo_lead', timestamp: hace2d, usuario: 'Karina Pérez' },
        { fase: 'aprobado', timestamp: hace1h, usuario: 'Yelisa Santos' },
      ],
      createdAt: hace2d, updatedAt: hace1h,
    },
    {
      numero: 'OS-0005', clienteId: clienteRefs[4], clienteNombre: 'Miguel Rosario', clienteTelefono: '8095551005',
      clienteDireccion: clientesData[4].direccion,
      equipoTipo: 'Secadora', equipoMarca: 'Maytag', equipoModelo: 'MEDC465HW', descripcionFalla: 'No calienta, ropa sale húmeda',
      tecnicoId: personalRefs['Carlos Técnico'], tecnicoNombre: 'Carlos Técnico',
      responsableId: personalRefs['Yohana Díaz'], responsableNombre: 'Yohana Díaz',
      fase: 'agendado', estadoSimple: 'pendiente', estado: 'activo',
      fechaCita: Timestamp.fromDate(new Date(Date.now() + 60 * 60 * 1000)),
      duracionMin: 60, notas: '', creadoPor: 'Wila Martínez',
      historialFases: [
        { fase: 'nuevo_lead', timestamp: hace2d, usuario: 'Wila Martínez' },
        { fase: 'agendado', timestamp: hace1h, usuario: 'Yohana Díaz' },
      ],
      createdAt: hace2d, updatedAt: hace1h,
    },
    {
      numero: 'OS-0006', clienteId: clienteRefs[0], clienteNombre: 'Juan Ramírez', clienteTelefono: '8095551001',
      clienteDireccion: clientesData[0].direccion,
      equipoTipo: 'Lavadora', equipoMarca: 'Mabe', equipoModelo: 'LMA47100V', descripcionFalla: 'Fuga de agua por la parte inferior',
      tecnicoId: personalRefs['Pedro Técnico'], tecnicoNombre: 'Pedro Técnico',
      responsableId: personalRefs['Yelisa Santos'], responsableNombre: 'Yelisa Santos',
      fase: 'trabajo_realizado', estadoSimple: 'completado', estado: 'activo',
      fechaCita: Timestamp.fromDate(new Date(Date.now() - 5 * 60 * 60 * 1000)),
      duracionMin: 45, notas: 'Sellado de manguera de drenaje',
      creadoPor: 'Wila Martínez',
      historialFases: [
        { fase: 'nuevo_lead', timestamp: hace5d, usuario: 'Wila Martínez' },
        { fase: 'trabajo_realizado', timestamp: hace1h, usuario: 'Pedro Técnico' },
      ],
      createdAt: hace5d, updatedAt: hace1h,
    },
    {
      numero: 'OS-0007', clienteId: clienteRefs[1], clienteNombre: 'Ana Hernández', clienteTelefono: '8095551002',
      clienteDireccion: clientesData[1].direccion,
      equipoTipo: 'Nevera', equipoMarca: 'LG', equipoModelo: 'GS65SPP1', descripcionFalla: 'Hace ruido fuerte al arrancar',
      tecnicoId: personalRefs['Carlos Técnico'], tecnicoNombre: 'Carlos Técnico',
      responsableId: personalRefs['Yohana Díaz'], responsableNombre: 'Yohana Díaz',
      fase: 'cerrado', estadoSimple: 'completado', estado: 'cerrado',
      fechaCita: Timestamp.fromDate(new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)),
      duracionMin: 90, notas: 'Servicio completado',
      creadoPor: 'Karina Pérez',
      historialFases: [
        { fase: 'nuevo_lead', timestamp: hace15d, usuario: 'Karina Pérez' },
        { fase: 'cerrado', timestamp: hace2d, usuario: 'María González' },
      ],
      createdAt: hace15d, updatedAt: hace2d,
    },
    {
      numero: 'OS-0008', clienteId: clienteRefs[2], clienteNombre: 'Roberto Jiménez', clienteTelefono: '8095551003',
      clienteDireccion: clientesData[2].direccion,
      equipoTipo: 'Aire Acondicionado', equipoMarca: 'York', equipoModelo: 'YHGE12', descripcionFalla: 'Gotea agua dentro de la habitación',
      tecnicoId: personalRefs['Pedro Técnico'], tecnicoNombre: 'Pedro Técnico',
      responsableId: personalRefs['Yelisa Santos'], responsableNombre: 'Yelisa Santos',
      fase: 'en_gestion', estadoSimple: 'pendiente', estado: 'activo',
      fechaCita: null, duracionMin: 60, notas: '', creadoPor: 'Wila Martínez',
      historialFases: [
        { fase: 'nuevo_lead', timestamp: hace1h, usuario: 'Wila Martínez' },
        { fase: 'en_gestion', timestamp: hace30m, usuario: 'Yelisa Santos' },
      ],
      createdAt: hace1h, updatedAt: hace30m,
    },
    {
      numero: 'OS-0009', clienteId: clienteRefs[3], clienteNombre: 'Carmen López', clienteTelefono: '8095551004',
      clienteDireccion: clientesData[3].direccion,
      equipoTipo: 'Lavadora', equipoMarca: 'Frigidaire', equipoModelo: 'FFTW4120SW', descripcionFalla: 'No enciende, panel muerto',
      tecnicoId: personalRefs['Carlos Técnico'], tecnicoNombre: 'Carlos Técnico',
      responsableId: personalRefs['Yohana Díaz'], responsableNombre: 'Yohana Díaz',
      fase: 'cancelado', estadoSimple: 'cancelado', estado: 'cancelado',
      fechaCita: null, notas: 'Cliente decidió comprar equipo nuevo',
      creadoPor: 'Karina Pérez',
      historialFases: [
        { fase: 'nuevo_lead', timestamp: hace5d, usuario: 'Karina Pérez' },
        { fase: 'cancelado', timestamp: hace1h, usuario: 'María González' },
      ],
      createdAt: hace5d, updatedAt: hace1h,
    },
    {
      numero: 'OS-0010', clienteId: clienteRefs[4], clienteNombre: 'Miguel Rosario', clienteTelefono: '8095551005',
      clienteDireccion: clientesData[4].direccion,
      equipoTipo: 'Estufa', equipoMarca: 'GE', equipoModelo: 'JGS760', descripcionFalla: 'Horno no calienta uniformemente',
      tecnicoId: personalRefs['Pedro Técnico'], tecnicoNombre: 'Pedro Técnico',
      responsableId: personalRefs['Yelisa Santos'], responsableNombre: 'Yelisa Santos',
      fase: 'nuevo_lead', estadoSimple: 'pendiente', estado: 'activo',
      fechaCita: null, notas: '', creadoPor: 'Wila Martínez',
      historialFases: [{ fase: 'nuevo_lead', timestamp: now, usuario: 'Wila Martínez' }],
      createdAt: now, updatedAt: now,
    },
  ];

  for (const o of ordenesData) {
    await addDoc(collection(db, 'ordenes_servicio'), o);
  }

  // Stand-by piezas
  const standbyData = [
    { clienteNombre: 'Roberto Jiménez', equipoTipo: 'Aire Acondicionado', equipoMarca: 'Carrier', piezaFaltante: 'Compresor inverter', tecnicoNombre: 'Carlos Técnico', fechaInicio: Timestamp.fromDate(new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)), estado: 'buscando', notas: 'Buscando en distribuidores locales', createdAt: Timestamp.fromDate(new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)) },
    { clienteNombre: 'Ana Hernández', equipoTipo: 'Nevera', equipoMarca: 'Samsung', piezaFaltante: 'Tarjeta electrónica principal', tecnicoNombre: 'Pedro Técnico', fechaInicio: Timestamp.fromDate(new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)), estado: 'importada', notas: 'En espera de importación de Miami', createdAt: Timestamp.fromDate(new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)) },
    { clienteNombre: 'Carmen López', equipoTipo: 'Estufa', equipoMarca: 'Whirlpool', piezaFaltante: 'Válvula de gas principal', tecnicoNombre: 'Carlos Técnico', fechaInicio: Timestamp.fromDate(new Date(Date.now() - 16 * 24 * 60 * 60 * 1000)), estado: 'dificil', notas: 'Pieza descontinuada, buscando alternativa compatible', createdAt: Timestamp.fromDate(new Date(Date.now() - 16 * 24 * 60 * 60 * 1000)) },
    { clienteNombre: 'Miguel Rosario', equipoTipo: 'Secadora', equipoMarca: 'Maytag', piezaFaltante: 'Resistencia calefactora 240V', tecnicoNombre: 'Pedro Técnico', fechaInicio: Timestamp.fromDate(new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)), estado: 'buscando', notas: '', createdAt: Timestamp.fromDate(new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)) },
  ];
  for (const s of standbyData) await addDoc(collection(db, 'standby_piezas'), s);

  // Cotizaciones
  const cotizacionesData = [
    { numero: 'QT-00001', clienteNombre: 'Roberto Jiménez', items: [{ descripcion: 'Diagnóstico Aire Acondicionado', cantidad: 1, precio: 1500 }, { descripcion: 'Compresor inverter Carrier', cantidad: 1, precio: 18000 }, { descripcion: 'Mano de obra instalación', cantidad: 1, precio: 3500 }], total: 23000, tecnicoNombre: 'Carlos Técnico', estado: 'borrador', notas: 'Incluye garantía 90 días', createdAt: hace2d, updatedAt: hace2d },
    { numero: 'QT-00002', clienteNombre: 'Carmen López', items: [{ descripcion: 'Diagnóstico estufa', cantidad: 1, precio: 800 }, { descripcion: 'Quemador repuesto Whirlpool', cantidad: 2, precio: 1200 }, { descripcion: 'Mano de obra', cantidad: 1, precio: 2000 }], total: 5200, tecnicoNombre: 'Pedro Técnico', estado: 'aceptada', notas: '', createdAt: hace5d, updatedAt: hace2d },
    { numero: 'QT-00003', clienteNombre: 'Juan Ramírez', items: [{ descripcion: 'Diagnóstico lavadora', cantidad: 1, precio: 800 }, { descripcion: 'Motor lavadora LG original', cantidad: 1, precio: 9500 }, { descripcion: 'Mano de obra', cantidad: 1, precio: 2500 }], total: 12800, tecnicoNombre: 'Carlos Técnico', estado: 'rechazada', notas: 'Cliente considera precio elevado', createdAt: Timestamp.fromDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)), updatedAt: Timestamp.fromDate(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000)) },
  ];
  for (const c of cotizacionesData) await addDoc(collection(db, 'cotizaciones'), c);

  // Facturas
  const facturasData = [
    { numero: 'FAC-00001', clienteNombre: 'Ana Hernández', ordenNumero: 'OS-0007', items: [{ descripcion: 'Reparación nevera LG - ruido compresor', cantidad: 1, precio: 3000 }, { descripcion: 'Mano de obra', cantidad: 1, precio: 1500 }], total: 4500, estado: 'pagada', fechaEmision: Timestamp.fromDate(new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)), fechaPago: Timestamp.fromDate(new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)), createdAt: hace2d },
    { numero: 'FAC-00002', clienteNombre: 'Carmen López', ordenNumero: 'OS-0004', items: [{ descripcion: 'Diagnóstico y reparación estufa Whirlpool', cantidad: 1, precio: 3800 }, { descripcion: 'Repuesto quemador', cantidad: 1, precio: 1400 }], total: 5200, estado: 'emitida', fechaEmision: Timestamp.fromDate(new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)), createdAt: hace1h },
    { numero: 'FAC-00003', clienteNombre: 'Juan Ramírez', ordenNumero: 'OS-0006', items: [{ descripcion: 'Sellado manguera lavadora Mabe', cantidad: 1, precio: 1200 }, { descripcion: 'Mano de obra', cantidad: 1, precio: 1800 }], total: 3000, estado: 'pagada', fechaEmision: Timestamp.fromDate(new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)), fechaPago: hace5d, createdAt: hace5d },
    { numero: 'FAC-00004', clienteNombre: 'Roberto Jiménez', items: [{ descripcion: 'Mantenimiento preventivo A/C', cantidad: 1, precio: 2500 }], total: 2500, estado: 'emitida', fechaEmision: Timestamp.fromDate(new Date(Date.now() - 35 * 24 * 60 * 60 * 1000)), createdAt: Timestamp.fromDate(new Date(Date.now() - 35 * 24 * 60 * 60 * 1000)) },
    { numero: 'FAC-00005', clienteNombre: 'Miguel Rosario', items: [{ descripcion: 'Revisión secadora Maytag', cantidad: 1, precio: 1800 }], total: 1800, estado: 'pagada', fechaEmision: hace15d, fechaPago: Timestamp.fromDate(new Date(Date.now() - 12 * 24 * 60 * 60 * 1000)), createdAt: hace15d },
  ];
  for (const f of facturasData) await addDoc(collection(db, 'facturas'), f);

  // Productos / Catálogo
  const productosData = [
    { nombre: 'Diagnóstico General', descripcion: 'Revisión y diagnóstico de equipo electrodoméstico', precio: 800, categoria: 'servicio', activo: true },
    { nombre: 'Diagnóstico A/C', descripcion: 'Diagnóstico especializado aire acondicionado', precio: 1500, categoria: 'servicio', activo: true },
    { nombre: 'Mantenimiento Preventivo', descripcion: 'Limpieza y revisión general de equipo', precio: 2500, categoria: 'servicio', activo: true },
    { nombre: 'Mano de Obra Básica', descripcion: 'Trabajo técnico estándar (1-2 horas)', precio: 1800, categoria: 'servicio', activo: true },
    { nombre: 'Mano de Obra Compleja', descripcion: 'Trabajo técnico complejo (3+ horas)', precio: 3500, categoria: 'servicio', activo: true },
    { nombre: 'Compresor A/C Inverter', descripcion: 'Compresor inverter para aire acondicionado', precio: 18000, categoria: 'repuesto', activo: true },
    { nombre: 'Tarjeta Electrónica Samsung', descripcion: 'PCB principal para neveras Samsung', precio: 8500, categoria: 'repuesto', activo: true },
    { nombre: 'Motor Lavadora LG', descripcion: 'Motor directo para lavadoras LG', precio: 9500, categoria: 'repuesto', activo: true },
    { nombre: 'Resistencia Secadora', descripcion: 'Elemento calefactor 240V', precio: 3200, categoria: 'repuesto', activo: true },
    { nombre: 'Válvula Gas Estufa', descripcion: 'Válvula de seguridad para gas', precio: 2800, categoria: 'repuesto', activo: true },
  ];
  for (const p of productosData) await addDoc(collection(db, 'productos'), { ...p, createdAt: Timestamp.now() });

  // Equipos taller
  const equiposData = [
    { clienteNombre: 'Ana Hernández', clienteTelefono: '8095551002', equipoTipo: 'Nevera', equipoMarca: 'Samsung', numeroSerie: 'SN-2023-001', fallaReportada: 'No enfría', diagnostico: 'Tarjeta electrónica dañada', tecnicoNombre: 'Pedro Técnico', estado: 'en_diagnostico', fechaRecibido: Timestamp.fromDate(new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)), fechaPrometida: Timestamp.fromDate(new Date(Date.now() + 4 * 24 * 60 * 60 * 1000)), costoReparacion: 9300, createdAt: Timestamp.fromDate(new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)) },
    { clienteNombre: 'Miguel Rosario', clienteTelefono: '8095551005', equipoTipo: 'Secadora', equipoMarca: 'Maytag', numeroSerie: 'MY-2022-445', fallaReportada: 'No calienta', diagnostico: 'Resistencia quemada', tecnicoNombre: 'Carlos Técnico', estado: 'en_standby', fechaRecibido: Timestamp.fromDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)), fechaPrometida: Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)), costoReparacion: 5000, createdAt: Timestamp.fromDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)) },
    { clienteNombre: 'Carmen López', clienteTelefono: '8095551004', equipoTipo: 'Estufa', equipoMarca: 'Whirlpool', numeroSerie: 'WH-2021-789', fallaReportada: 'Quemador dañado', diagnostico: 'Válvula de gas defectuosa', tecnicoNombre: 'Pedro Técnico', estado: 'listo', fechaRecibido: Timestamp.fromDate(new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)), costoReparacion: 4200, createdAt: Timestamp.fromDate(new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)) },
  ];
  for (const e of equiposData) await addDoc(collection(db, 'equipos_taller'), e);

  // Gastos
  const gastosData = [
    { fecha: Timestamp.fromDate(new Date()), categoria: 'repuestos', descripcion: 'Compresor AC Carrier importado', monto: 15000, metodoPago: 'transferencia', createdAt: Timestamp.now() },
    { fecha: Timestamp.fromDate(new Date()), categoria: 'transporte', descripcion: 'Gasolina semana vehículo técnicos', monto: 3500, metodoPago: 'efectivo', createdAt: Timestamp.now() },
    { fecha: Timestamp.fromDate(new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)), categoria: 'repuestos', descripcion: 'Tarjeta electrónica Samsung', monto: 8500, metodoPago: 'transferencia', createdAt: Timestamp.now() },
    { fecha: Timestamp.fromDate(new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)), categoria: 'herramientas', descripcion: 'Multímetro digital Fluke', monto: 4200, metodoPago: 'tarjeta', createdAt: Timestamp.now() },
    { fecha: Timestamp.fromDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)), categoria: 'transporte', descripcion: 'Peaje y estacionamiento', monto: 800, metodoPago: 'efectivo', createdAt: Timestamp.now() },
  ];
  for (const g of gastosData) await addDoc(collection(db, 'gastos'), g);

  // Citas por confirmar
  const citasData = [
    { clienteNombre: 'Francisco Medina', telefono: '8295552001', servicio: 'Reparación Lavadora', falla: 'No drena agua', horarioSolicitado: 'Mañana 9:00 AM', origen: 'WhatsApp', createdAt: Timestamp.fromDate(new Date(Date.now() - 20 * 60 * 1000)) },
    { clienteNombre: 'Luisa Vargas', telefono: '8295552002', servicio: 'Revisión Nevera', falla: 'Hace ruido extraño al cerrar', horarioSolicitado: 'Esta tarde', origen: 'Llamada', createdAt: Timestamp.fromDate(new Date(Date.now() - 5 * 60 * 1000)) },
  ];
  for (const c of citasData) await addDoc(collection(db, 'citas_por_confirmar'), c);

  // Mantenimiento programado
  const mantenimientoData = [
    { clienteId: clienteRefs[0], clienteNombre: 'Juan Ramírez', equipoTipo: 'Aire Acondicionado', frecuencia: 'trimestral', frecuenciaMeses: 3, proximaFecha: Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)), tecnicoId: personalRefs['Carlos Técnico'], activo: true },
    { clienteId: clienteRefs[1], clienteNombre: 'Ana Hernández', equipoTipo: 'Nevera', frecuencia: 'semestral', frecuenciaMeses: 6, proximaFecha: Timestamp.fromDate(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)), tecnicoId: personalRefs['Pedro Técnico'], activo: true },
  ];
  for (const m of mantenimientoData) await addDoc(collection(db, 'mantenimiento'), m);

  // Mark as initialized — this prevents any future seed runs
  await setDoc(configRef, { inicializado: true, fecha: Timestamp.now() });
  console.log('Database seeded successfully!');
}
