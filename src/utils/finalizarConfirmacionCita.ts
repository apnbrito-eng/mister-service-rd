/** La orden ya está persistida. Un fallo posterior conserva el formulario y vínculo. */
export async function finalizarConfirmacionCita(params: {
  confirmar?: () => Promise<void> | void;
  liberar: () => Promise<void>;
  pendiente: (error: unknown) => void;
  completada: () => void;
}): Promise<boolean> {
  try {
    await params.confirmar?.();
  } catch (error) {
    params.pendiente(error);
    await params.liberar();
    return false;
  }
  // También cuando no existe callback: nunca dejar un bloqueo permanente.
  await params.liberar();
  params.completada();
  return true;
}
