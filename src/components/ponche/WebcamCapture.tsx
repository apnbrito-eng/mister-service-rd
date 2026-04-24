import { useEffect, useRef, useState } from 'react';
import { Camera, RotateCcw, Check, X } from 'lucide-react';

interface Props {
  onFoto: (blob: Blob) => void;
  onCancelar: () => void;
}

export default function WebcamCapture({ onFoto, onCancelar }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [capturada, setCapturada] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function iniciarCamara() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (!mounted) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setCargando(false);
      } catch (err: unknown) {
        if (!mounted) return;
        const e = err as { name?: string; message?: string };
        if (e.name === 'NotAllowedError') {
          setError('Permiso de cámara denegado. Habilítalo en la barra de direcciones y recarga la página.');
        } else if (e.name === 'NotFoundError') {
          setError('No se encontró una cámara en este dispositivo.');
        } else if (e.name === 'NotReadableError') {
          setError('La cámara está siendo usada por otra aplicación. Ciérrala y reintenta.');
        } else {
          setError('No pude abrir la cámara: ' + (e.message || 'error desconocido'));
        }
        setCargando(false);
      }
    }

    iniciarCamara();

    return () => {
      mounted = false;
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  function capturar() {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Espejar la foto para que coincida con el preview espejado
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0);
    setCapturada(canvas.toDataURL('image/jpeg', 0.85));
  }

  function reintentar() {
    setCapturada(null);
  }

  function confirmar() {
    if (!canvasRef.current) return;
    canvasRef.current.toBlob(blob => {
      if (blob) onFoto(blob);
    }, 'image/jpeg', 0.85);
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[9999] p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full overflow-hidden">
        <div className="bg-brand-700 text-white px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Camera size={18} />
            <h2 className="font-semibold">Toma tu selfie</h2>
          </div>
          <button onClick={onCancelar} className="p-1 hover:bg-white/10 rounded">
            <X size={20} />
          </button>
        </div>
        <div className="p-4 flex flex-col items-center gap-4">
          {error ? (
            <div className="text-center py-8">
              <p className="text-red-600 font-medium mb-2">{error}</p>
              <button onClick={onCancelar} className="px-4 py-2 bg-gray-200 rounded">
                Cerrar
              </button>
            </div>
          ) : cargando ? (
            <div className="text-gray-500 py-12">Cargando cámara...</div>
          ) : capturada ? (
            <>
              <img src={capturada} alt="Selfie capturada" className="w-full rounded-lg" />
              <div className="flex gap-3 w-full">
                <button
                  onClick={reintentar}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-gray-200 hover:bg-gray-300 rounded-lg font-semibold"
                >
                  <RotateCcw size={18} /> Tomar otra
                </button>
                <button
                  onClick={confirmar}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-lg font-semibold"
                >
                  <Check size={18} /> Confirmar
                </button>
              </div>
            </>
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full rounded-lg"
                style={{ transform: 'scaleX(-1)' }}
              />
              <canvas ref={canvasRef} className="hidden" />
              <button
                onClick={capturar}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-lg font-semibold w-full"
              >
                <Camera size={20} /> Capturar foto
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
