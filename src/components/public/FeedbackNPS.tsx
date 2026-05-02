import { useState } from 'react';
import { CheckCircle, MessageCircle, Star, AlertTriangle } from 'lucide-react';
import type { ConfigFeedbackNPS } from '../../services/configWeb.service';
import { obtenerAppCheckToken } from '../../lib/appCheck';

type RatingTipo = 'detractor' | 'pasivo' | 'promotor';

interface Props {
  token: string;
  /** Numero del cliente y datos minimos para preformatear el mensaje WhatsApp */
  clienteNombre?: string;
  ordenNumero?: string;
  /** Numero WhatsApp del coordinador para detractores (fallback al activo principal) */
  numeroWhatsAppCoordinador?: string;
  configFeedback?: ConfigFeedbackNPS;
  /** Callback para refrescar el padre cuando se envia exitosamente */
  onEnviado?: () => void;
}

type Paso = 'pregunta' | 'comentario' | 'gracias';

function clasificar(score: number): RatingTipo {
  if (score <= 6) return 'detractor';
  if (score <= 8) return 'pasivo';
  return 'promotor';
}

function colorBoton(score: number, seleccionado: boolean): string {
  if (!seleccionado) return 'bg-white border-gray-200 text-gray-700 hover:border-gray-400';
  if (score <= 6) return 'bg-red-500 border-red-500 text-white';
  if (score <= 8) return 'bg-amber-400 border-amber-400 text-white';
  return 'bg-green-500 border-green-500 text-white';
}

export default function FeedbackNPS({
  token,
  clienteNombre,
  ordenNumero,
  numeroWhatsAppCoordinador,
  configFeedback,
  onEnviado,
}: Props) {
  const [paso, setPaso] = useState<Paso>('pregunta');
  const [npsScore, setNpsScore] = useState<number | null>(null);
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [yaEnviado, setYaEnviado] = useState(false);

  const ratingTipo = npsScore !== null ? clasificar(npsScore) : null;

  const handleSeleccionar = (n: number) => {
    setNpsScore(n);
    setPaso('comentario');
    setErrorMsg(null);
  };

  /**
   * Envío inicial del feedback (NPS + comentario opcional + flags opcionales).
   *
   * - Devuelve `true` si el feedback quedó persistido (200 OK) o si el servidor
   *   responde 409 (`feedback_ya_enviado`), porque en ese caso ya existe un
   *   registro previo y la UI puede continuar (abrir Google / WhatsApp).
   * - Devuelve `false` si el envío realmente falló (4xx distinto a 409, 5xx,
   *   o error de red). En ese caso muestra el mensaje de error y avanza el
   *   estado `yaEnviado`/`paso` lo necesario.
   *
   * Convención: el endpoint acepta `googleReviewClicked` y `whatsappContactClicked`
   * en el envío inicial junto con el NPS, así que NO necesitamos el doble POST.
   */
  async function enviarFeedback(opts?: {
    googleReviewClicked?: boolean;
    whatsappContactClicked?: boolean;
    avanzarAGracias?: boolean;
  }): Promise<boolean> {
    if (npsScore === null) return false;
    const avanzar = opts?.avanzarAGracias ?? true;
    setEnviando(true);
    setErrorMsg(null);
    try {
      const payload: Record<string, unknown> = { nps: npsScore };
      if (comentario.trim().length > 0) payload.comentario = comentario.trim();
      if (opts?.googleReviewClicked) payload.googleReviewClicked = true;
      if (opts?.whatsappContactClicked) payload.whatsappContactClicked = true;

      const appCheckToken = await obtenerAppCheckToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (appCheckToken) headers['X-Firebase-AppCheck'] = appCheckToken;
      const res = await fetch(`/api/feedback/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      if (res.status === 409) {
        // Ya existía feedback previo: la UI puede avanzar igual y, si el
        // caller necesita persistir flags de tracking, lo hace por separado.
        setYaEnviado(true);
        setPaso('gracias');
        return true;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setErrorMsg(`No se pudo enviar (${err.error || res.status}). Intenta de nuevo.`);
        return false;
      }
      if (avanzar) setPaso('gracias');
      if (onEnviado) onEnviado();
      return true;
    } catch (err) {
      console.error('[FeedbackNPS] error enviando:', err);
      setErrorMsg('No se pudo enviar. Verifica tu conexión e intenta de nuevo.');
      return false;
    } finally {
      setEnviando(false);
    }
  }

  /**
   * Modo "solo tracking": actualiza flags de conversión cuando el feedback
   * inicial ya se envió. Best-effort: nunca bloquea la UI.
   */
  async function enviarFeedbackSoloTracking(flags: {
    googleReviewClicked?: boolean;
    whatsappContactClicked?: boolean;
  }): Promise<void> {
    try {
      const payload: Record<string, unknown> = {};
      if (flags.googleReviewClicked) payload.googleReviewClicked = true;
      if (flags.whatsappContactClicked) payload.whatsappContactClicked = true;
      if (Object.keys(payload).length === 0) return;
      const appCheckToken = await obtenerAppCheckToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (appCheckToken) headers['X-Firebase-AppCheck'] = appCheckToken;
      await fetch(`/api/feedback/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.warn('[FeedbackNPS] tracking flag falló (no bloqueante):', err);
    }
  }

  /** Construye el mensaje de WhatsApp del detractor con orden + cliente */
  function construirMensajeWhatsApp(): string {
    const base =
      configFeedback?.mensajeWhatsAppDetractor ||
      'Hola, tuve un servicio recientemente y quiero compartirles mi experiencia.';
    const partes = [base];
    if (ordenNumero) partes.push(`Orden ${ordenNumero}.`);
    if (clienteNombre) partes.push(`Soy ${clienteNombre}.`);
    return partes.join(' ');
  }

  /**
   * Detractor toca "Hablar con un coordinador":
   *   1) Si todavía no hay feedback persistido, lo enviamos AHORA con NPS +
   *      comentario actual + flag `whatsappContactClicked`. Un solo POST.
   *      Si falla → mostramos error y NO abrimos WhatsApp (cliente reintenta).
   *   2) Si ya había feedback (yaEnviado) → solo actualizamos el flag de
   *      tracking en background.
   *   3) Solo si el feedback quedó persistido, abrimos WhatsApp.
   *
   * Esto cierra el bug donde el cliente perdía el comentario al tocar
   * "Hablar con coordinador" antes de "Enviar feedback".
   */
  async function abrirWhatsAppDetractor() {
    const numeroRaw = numeroWhatsAppCoordinador || '';
    const digits = numeroRaw.replace(/\D/g, '');
    if (digits.length === 0) {
      // Si no hay numero, no abrimos pero igual marcamos el flag
      setErrorMsg('No hay un canal de contacto configurado por ahora.');
      return;
    }

    if (!yaEnviado) {
      // 1 solo POST: NPS + comentario + flag whatsappContactClicked.
      const ok = await enviarFeedback({ whatsappContactClicked: true });
      if (!ok) {
        // El error ya quedó renderizado en errorMsg; no abrimos WhatsApp
        // para que el cliente pueda reintentar sin perder el comentario.
        return;
      }
    } else {
      // Best-effort: feedback ya existía, solo persistimos el flag.
      void enviarFeedbackSoloTracking({ whatsappContactClicked: true });
    }

    const numero = digits.length === 10 ? `1${digits}` : digits;
    const url = `https://wa.me/${numero}?text=${encodeURIComponent(construirMensajeWhatsApp())}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  // ─── Render ─────────────────────────────────────────────────

  if (paso === 'gracias') {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-center">
        <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <CheckCircle size={24} className="text-green-600" />
        </div>
        <h3 className="text-lg font-bold text-gray-900 mb-1">
          {yaEnviado ? 'Ya enviaste tu feedback' : 'Gracias por tu feedback'}
        </h3>
        <p className="text-sm text-gray-600">
          {yaEnviado
            ? 'Recibimos tu calificación anteriormente. ¡Gracias por confiar en nosotros!'
            : configFeedback?.mensajeAgradecimiento ||
              'Cada respuesta nos ayuda a mejorar el servicio.'}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
      <div>
        <h3 className="text-base font-bold text-gray-900">¿Cómo fue el servicio?</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          ¿Qué tan probable es que recomiendes Mister Service RD a un familiar o amigo?
        </p>
      </div>

      {/* Botones 0-10 */}
      <div className="grid grid-cols-6 sm:grid-cols-11 gap-1.5">
        {Array.from({ length: 11 }, (_, i) => i).map((n) => {
          const seleccionado = npsScore === n;
          return (
            <button
              key={n}
              type="button"
              onClick={() => handleSeleccionar(n)}
              disabled={enviando}
              className={`min-h-[44px] rounded-lg border-2 text-sm font-bold transition ${colorBoton(n, seleccionado)}`}
            >
              {n}
            </button>
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] text-gray-400 px-0.5">
        <span>Nada probable</span>
        <span>Muy probable</span>
      </div>

      {/* Paso 2 — según rating */}
      {paso === 'comentario' && npsScore !== null && (
        <div className="pt-3 border-t border-gray-100 space-y-3">
          {ratingTipo === 'detractor' && (
            <>
              <div className="bg-red-50 border border-red-100 rounded-lg p-3">
                <p className="text-sm font-semibold text-red-800 flex items-center gap-1.5">
                  <AlertTriangle size={14} /> Lamentamos que no haya sido la experiencia esperada.
                </p>
                <p className="text-xs text-red-700 mt-1">
                  ¿Qué pudimos hacer mejor? (opcional)
                </p>
              </div>
              <textarea
                value={comentario}
                onChange={(e) => setComentario(e.target.value.slice(0, 500))}
                rows={3}
                maxLength={500}
                placeholder="Cuéntanos qué pasó..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
              />
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={() => enviarFeedback()}
                  disabled={enviando}
                  className="flex-1 bg-[#0f3460] hover:bg-[#1a5fa8] disabled:opacity-60 text-white text-sm font-semibold rounded-lg px-4 py-2.5"
                >
                  {enviando ? 'Enviando...' : 'Enviar feedback'}
                </button>
                {numeroWhatsAppCoordinador && (
                  <button
                    type="button"
                    onClick={abrirWhatsAppDetractor}
                    disabled={enviando}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg px-4 py-2.5"
                  >
                    <MessageCircle size={14} /> Hablar con un coordinador
                  </button>
                )}
              </div>
            </>
          )}

          {ratingTipo === 'pasivo' && (
            <>
              <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
                <p className="text-sm font-semibold text-amber-800">
                  Gracias por tu calificación de {npsScore}/10.
                </p>
                <p className="text-xs text-amber-700 mt-1">
                  ¿Algo más que quieras compartir? (opcional)
                </p>
              </div>
              <textarea
                value={comentario}
                onChange={(e) => setComentario(e.target.value.slice(0, 500))}
                rows={3}
                maxLength={500}
                placeholder="Comentario opcional..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
              />
              <button
                type="button"
                onClick={() => enviarFeedback()}
                disabled={enviando}
                className="w-full bg-[#0f3460] hover:bg-[#1a5fa8] disabled:opacity-60 text-white text-sm font-semibold rounded-lg px-4 py-2.5"
              >
                {enviando ? 'Enviando...' : 'Enviar'}
              </button>
            </>
          )}

          {ratingTipo === 'promotor' && (
            <>
              <div className="bg-green-50 border border-green-100 rounded-lg p-3">
                <p className="text-sm font-semibold text-green-800">
                  ¡Nos alegra mucho!
                </p>
                <p className="text-xs text-green-700 mt-1">
                  ¿Nos dejarías una reseña en Google? Solo te toma 30 segundos.
                </p>
              </div>
              {configFeedback?.googleReviewsUrl ? (
                <button
                  type="button"
                  onClick={async () => {
                    // Promotor toca "Dejar reseña en Google":
                    //  1) Persistimos primero el NPS puro (sin flag click).
                    //     Si falla, abortamos y NO abrimos Google — cliente reintenta.
                    //  2) Si OK (o ya había feedback), abrimos Google INMEDIATAMENTE.
                    //  3) En background, persistimos el flag googleReviewClicked.
                    //     No bloqueamos la UX si ese segundo POST falla.
                    if (!yaEnviado) {
                      const ok = await enviarFeedback({ avanzarAGracias: false });
                      if (!ok) return;
                    }
                    // Abrir Google YA — no esperamos al tracking POST.
                    if (configFeedback.googleReviewsUrl) {
                      window.open(
                        configFeedback.googleReviewsUrl,
                        '_blank',
                        'noopener,noreferrer',
                      );
                    }
                    // Tracking en background, best-effort.
                    void enviarFeedbackSoloTracking({ googleReviewClicked: true });
                    setPaso('gracias');
                  }}
                  disabled={enviando}
                  className="w-full inline-flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg px-4 py-3"
                >
                  <Star size={16} /> Dejar reseña en Google
                </button>
              ) : (
                <p className="text-xs text-gray-500 text-center">
                  Pronto activaremos el enlace para reseñas en Google.
                </p>
              )}
              <button
                type="button"
                onClick={() => enviarFeedback()}
                disabled={enviando}
                className="w-full text-xs text-gray-500 hover:text-gray-700 underline"
              >
                {enviando ? 'Enviando...' : 'Más tarde'}
              </button>
            </>
          )}

          {errorMsg && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg p-2">
              {errorMsg}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

interface FeedbackYaEnviadoProps {
  feedback: NonNullable<import('../../types').OrdenServicio['feedback']>;
}

export function FeedbackYaEnviado({ feedback }: FeedbackYaEnviadoProps) {
  const colorTipo = (() => {
    if (feedback.ratingTipo === 'promotor') return 'bg-green-100 text-green-700';
    if (feedback.ratingTipo === 'pasivo') return 'bg-amber-100 text-amber-700';
    return 'bg-red-100 text-red-700';
  })();
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${colorTipo}`}>
        {feedback.nps}
      </div>
      <div className="flex-1">
        <p className="text-sm font-semibold text-gray-900">Ya enviaste tu feedback</p>
        <p className="text-xs text-gray-500">Gracias por confiar en nosotros.</p>
      </div>
    </div>
  );
}
