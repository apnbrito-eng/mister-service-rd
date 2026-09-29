export interface ResumenServicioIA {
  estado: 'pendiente'; motivo: string; equipoId: string | null;
  datos: { equipo?: string; servicio?: string; falla?: string; direccion?: string; tieneFoto: boolean; tieneUbicacion: boolean };
  pendientes: string[];
}
const motivos: Record<string, string> = { solicitud_o_datos_completos: 'El cliente pidió atención humana o ya entregó sus datos', modelo: 'Continuar la atención con una persona', error: 'La atención automática encontró un problema y quedó pausada', contexto: 'Revisar la conversación antes de continuar', humano: 'El cliente pidió atención humana', datos_completos: 'Datos recibidos para continuar la atención', limite: 'Se alcanzó un límite de atención automática', presupuesto: 'Presupuesto de IA agotado', sin_equipo: 'Hace falta asignar un equipo', fallo: 'La atención automática necesita revisión' };
const campos: Record<string, string> = { equipo: 'Equipo', servicio: 'Tipo de servicio', falla: 'Descripción de la falla', foto: 'Foto del equipo', ubicacion: 'Ubicación' };
export default function ResumenBotServicio({ resumen }: { resumen: ResumenServicioIA | null | undefined }) {
  if (!resumen) return null;
  const d = resumen.datos;
  return <section className="rounded-lg border border-gray-200 p-3 space-y-2" aria-label="Resumen de atención automática">
    <h3 className="font-semibold">Pendiente de atención · IA pausada</h3>
    <p>{motivos[resumen.motivo] || 'Revisa los datos recibidos y continúa con el cliente.'}</p>
    {!resumen.equipoId && <p className="text-amber-800">Sin equipo asignado. Requiere revisión de administración.</p>}
    <dl className="space-y-1 break-words">
      <div><dt className="inline font-medium">Equipo: </dt><dd className="inline">{d.equipo || 'Por confirmar'}</dd></div>
      <div><dt className="inline font-medium">Servicio: </dt><dd className="inline">{d.servicio === 'mantenimiento' ? 'Mantenimiento' : d.servicio === 'reparacion' ? 'Reparación' : 'Por confirmar'}</dd></div>
      {d.falla && <div><dt className="inline font-medium">Descripción: </dt><dd className="inline whitespace-pre-wrap">{d.falla}</dd></div>}
      {d.direccion && <div><dt className="inline font-medium">Dirección indicada: </dt><dd className="inline whitespace-pre-wrap">{d.direccion}</dd></div>}
      <div><dt className="inline font-medium">Foto: </dt><dd className="inline">{d.tieneFoto ? 'Recibida en el chat' : 'Pendiente'}</dd></div>
      <div><dt className="inline font-medium">Ubicación: </dt><dd className="inline">{d.tieneUbicacion ? 'Recibida en el chat' : 'Pendiente'}</dd></div>
    </dl>
    {!!resumen.pendientes.length && <p>Falta confirmar: {resumen.pendientes.map(p => campos[p] || p).join(', ')}.</p>}
    <p className="text-xs text-gray-600">Verifica los datos con el cliente antes de coordinar la visita.</p>
  </section>;
}
