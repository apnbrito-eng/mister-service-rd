import { obtenerAppCheckToken } from '../lib/appCheck';
import type { PayloadEnvioCita, ResultadoEnvioCita } from './formularioAgendar.service';
export async function enviarCitaPublicaSegura(payload: PayloadEnvioCita & { calendarioId?: string; horarioSolicitado?: string }): Promise<ResultadoEnvioCita> {
  try {
    const token = await obtenerAppCheckToken();
    if (!token) return { ok: false, error: 'No pudimos verificar la solicitud. Recarga la página e inténtalo de nuevo.' };
    const r = await fetch('/api/publico/cita', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Firebase-AppCheck': token }, body: JSON.stringify(payload),
    });
    const data = await r.json() as ResultadoEnvioCita;
    if (!r.ok) return { ok: false, error: data.error || 'No pudimos registrar tu solicitud. Inténtalo de nuevo.' };
    return data;
  } catch { return { ok: false, error: 'No pudimos registrar tu solicitud. Inténtalo de nuevo.' }; }
}
