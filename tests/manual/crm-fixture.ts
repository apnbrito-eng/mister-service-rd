const data: any = {
  orden: {
    id: "demo",
    numero: "PRUEBA-001",
    clienteNombre: "Cliente de prueba",
    equipoTipo: "Lavadora",
    equipoMarca: "Mabe",
    descripcionFalla: "No desagua. Revisar bomba antes de comprar piezas.",
    operariaNombre: "Operaria de prueba",
    tecnicoNombre: "Técnico de prueba",
    fase: "en_diagnostico",
    estadoAprobacion: "aprobado",
    precioFinal: 8000,
    pagos: [
      {
        id: "abono1",
        monto: 3000,
        metodo: "efectivo",
        verificado: true,
        crm: true,
        recibidoPorNombre: "Técnico de prueba",
        recibidoPorId: "tecnico",
      },
    ],
  },
  meta: {
    version: 0,
    responsableNombre: "Operaria de prueba",
    etapa: "operaria",
  },
  cartera: { responsableNombre: "Operaria de prueba", version: 0 },
  balance: { confirmados: 3000, pendientes: 0, saldo: 5000, excedente: 0 },
  permisos: {
    oficina: true,
    supervisor: true,
    registrar: true,
    verificar: true,
  },
  equipo: [
    { uid: "admin", nombre: "Supervisora de prueba", rol: "administrador" },
    { uid: "operaria", nombre: "Operaria de prueba", rol: "operaria" },
    { uid: "secretaria", nombre: "Secretaria de prueba", rol: "secretaria" },
    { uid: "tecnico", nombre: "Técnico de prueba", rol: "tecnico" },
  ],
  eventos: [],
  notas: [
    {
      id: "n1",
      texto: "Avisar treinta minutos antes de llegar.",
      autorNombre: "Secretaria de prueba",
      fechaMs: Date.now(),
      visibilidad: "tecnico",
      destacada: true,
      resuelta: false,
    },
  ],
  recibos: [],
  parcial: false,
};
export function useApp() {
  return {
    currentUser: { uid: "admin" },
    userProfile: { rol: "administrador" },
  };
}
export async function enviarTexto() {
  throw new Error("Envío deshabilitado en esta prueba.");
}
export async function equipoApi<T>(_ruta: string, body?: any): Promise<T> {
  if (body) {
    if (!["nota", "resolver_nota", "entrega_efectivo"].includes(body.accion))
      throw new Error("Esta acción requiere la versión conectada. La demostración permite notas y entregas ficticias de efectivo.");
    if (body.accion === "nota")
      data.notas.push({
        ...body,
        id: body.operacionId,
        fechaMs: Date.now(),
        autorNombre: "Supervisora de prueba",
        resuelta: false,
      });
    if (body.accion === "resolver_nota")
      data.notas.find((n: any) => n.id === body.notaId).resuelta = true;
    if (body.accion === "entrega_efectivo")
      data.orden.pagos.find((p: any) => p.id === body.pagoId).entregadoOficina =
        Number(data.orden.pagos.find((p: any) => p.id === body.pagoId).entregadoOficina || 0) + Number(body.monto);
    data.meta.version++;
    return { ok: true } as T;
  }
  return structuredClone(data) as T;
}
