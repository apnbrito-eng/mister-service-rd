/** Solo solicitudes inequívocas: no confundir "no puedo ir" con una baja. */
export function solicitaBaja(texto: unknown): boolean {
  if (typeof texto !== 'string') return false;
  const normalizado = texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[.!¡¿?]/g, '').trim().replace(/\s+/g, ' ');
  return ['stop', 'baja', 'no deseo promociones', 'no quiero promociones', 'no me escriban mas', 'no me envien mas mensajes', 'cancelar suscripcion'].includes(normalizado);
}
export function origenAnuncio(raw: Record<string, unknown>) {
  const ref = raw.referral;
  if (!ref || typeof ref !== 'object' || Array.isArray(ref)) return null;
  const dato = ref as Record<string, unknown>;
  if (dato.source_type !== 'ad' || typeof dato.source_id !== 'string') return null;
  return { canal: 'whatsapp', anuncioId: dato.source_id.slice(0, 100), capturadoPor: 'referral_meta' };
}
