import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import Logo from '../../components/Logo';
import LoadingSpinner from '../../components/LoadingSpinner';
import { Shield, ShieldAlert, ShieldCheck, ShieldOff, Clock, Wrench, User, Calendar, AlertCircle, Send, X } from 'lucide-react';

interface GarantiaApiInfo {
  conduceNumero: string | null;
  clienteNombre: string | null;
  equipoTipo: string | null;
  equipoMarca: string | null;
  equipoModelo: string | null;
  tecnicoNombre: string | null;
  fechaServicio: string | null;
  garantia: {
    tiempoDias: number;
    inicioFecha: string | null;
    finFecha: string | null;
    estado: 'vigente' | 'reclamada' | 'atendida' | 'expirada';
    diasRestantes: number;
    reclamadaEn: string | null;
  };
}

const TELEFONO_EMPRESA = '8293897474';

function formatearFecha(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-DO', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

export default function GarantiaCliente() {
  const { token } = useParams<{ token: string }>();
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<GarantiaApiInfo | null>(null);
  const [mostrarReclamo, setMostrarReclamo] = useState(false);
  const [problema, setProblema] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [exitoReclamo, setExitoReclamo] = useState<string | null>(null);

  const cargarInfo = async () => {
    if (!token) return;
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(`/api/garantia/${encodeURIComponent(token)}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError((data as { error?: string }).error || 'No se pudo cargar la garantía');
        setInfo(null);
      } else {
        const data = (await res.json()) as GarantiaApiInfo;
        setInfo(data);
      }
    } catch (err) {
      console.error('[garantia] fetch error:', err);
      setError('Error de conexión. Reintenta.');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const enviarReclamo = async () => {
    if (!token) return;
    if (problema.trim().length < 10) {
      setError('La descripción debe tener al menos 10 caracteres.');
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch(`/api/garantia/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ problemaDescripcion: problema.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { error?: string }).error || 'No se pudo enviar el reclamo');
      } else {
        setExitoReclamo(
          (data as { mensaje?: string }).mensaje || 'Recibimos tu reclamo. Te contactaremos pronto.',
        );
        setMostrarReclamo(false);
        setProblema('');
        await cargarInfo();
      }
    } catch (err) {
      console.error('[garantia] reclamo error:', err);
      setError('Error de conexión. Reintenta.');
    } finally {
      setEnviando(false);
    }
  };

  if (cargando) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-blue-50 flex items-center justify-center">
        <LoadingSpinner text="Cargando garantía..." />
      </div>
    );
  }

  if (error && !info) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-blue-50 px-4 py-8 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg border border-gray-100 p-8 text-center">
          <div className="w-14 h-14 mx-auto rounded-full bg-red-100 flex items-center justify-center mb-3">
            <AlertCircle size={28} className="text-red-600" />
          </div>
          <h1 className="text-lg font-bold text-gray-900 mb-1">No encontramos esta garantía</h1>
          <p className="text-sm text-gray-600 mb-6">{error}</p>
          <a
            href={`https://wa.me/1${TELEFONO_EMPRESA}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold"
          >
            <Send size={14} /> Contactar por WhatsApp
          </a>
        </div>
      </div>
    );
  }

  if (!info) return null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-blue-50">
      <header className="px-4 pt-6 pb-2 flex justify-center">
        <Logo size="md" />
      </header>

      <main className="max-w-md mx-auto px-4 py-6 space-y-4">
        <CardEstado info={info} />

        <CardDatos info={info} />

        {info.garantia.estado === 'vigente' && (
          <button
            type="button"
            onClick={() => setMostrarReclamo(true)}
            className="w-full inline-flex items-center justify-center gap-2 px-5 py-3.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-semibold shadow-md"
          >
            <Shield size={16} /> Reclamar Garantía
          </button>
        )}

        {info.garantia.estado === 'expirada' && (
          <a
            href={`https://wa.me/1${TELEFONO_EMPRESA}`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full inline-flex items-center justify-center gap-2 px-5 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold shadow-md"
          >
            <Send size={16} /> Contactar por WhatsApp
          </a>
        )}

        {exitoReclamo && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-800">
            {exitoReclamo}
          </div>
        )}

        <p className="text-center text-[11px] text-gray-400 pt-4">
          Mister Service RD · Reparación de electrodomésticos
        </p>
      </main>

      {mostrarReclamo && (
        <ModalReclamo
          problema={problema}
          onProblema={setProblema}
          enviando={enviando}
          error={error}
          onCancelar={() => {
            setMostrarReclamo(false);
            setProblema('');
            setError(null);
          }}
          onEnviar={enviarReclamo}
        />
      )}
    </div>
  );
}

function CardEstado({ info }: { info: GarantiaApiInfo }) {
  const { garantia } = info;

  if (garantia.estado === 'vigente') {
    const total = Math.max(1, garantia.tiempoDias);
    const usado = Math.max(0, total - garantia.diasRestantes);
    const pct = Math.min(100, Math.max(0, (usado / total) * 100));
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-amber-200 p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
            <Shield size={20} className="text-amber-700" />
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-amber-700 font-semibold">
              Garantía vigente
            </div>
            <div className="text-sm text-gray-600">
              Tu servicio está protegido
            </div>
          </div>
        </div>

        <div className="text-center py-3">
          <div className="text-4xl font-bold text-amber-700">
            {garantia.diasRestantes}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            día{garantia.diasRestantes === 1 ? '' : 's'} restante{garantia.diasRestantes === 1 ? '' : 's'}
          </div>
        </div>

        <div className="w-full h-2 bg-amber-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-amber-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-[11px] text-gray-500 mt-2">
          <span>Inicio: {formatearFecha(garantia.inicioFecha)}</span>
          <span>Vence: {formatearFecha(garantia.finFecha)}</span>
        </div>
      </div>
    );
  }

  if (garantia.estado === 'reclamada') {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-blue-200 p-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
            <ShieldAlert size={20} className="text-blue-700" />
          </div>
          <div className="flex-1">
            <div className="text-[11px] uppercase tracking-wide text-blue-700 font-semibold mb-0.5">
              Reclamo recibido
            </div>
            <p className="text-sm text-gray-800 mb-1">
              Reclamaste tu garantía el{' '}
              <strong>{formatearFecha(garantia.reclamadaEn)}</strong>.
            </p>
            <p className="text-xs text-gray-600">
              Pronto un técnico te contactará para coordinar la visita.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (garantia.estado === 'atendida') {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-green-200 p-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
            <ShieldCheck size={20} className="text-green-700" />
          </div>
          <div className="flex-1">
            <div className="text-[11px] uppercase tracking-wide text-green-700 font-semibold mb-0.5">
              Garantía atendida
            </div>
            <p className="text-sm text-gray-800">
              Servicio de garantía completado. Gracias por confiar en nosotros.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Expirada
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
          <ShieldOff size={20} className="text-gray-600" />
        </div>
        <div className="flex-1">
          <div className="text-[11px] uppercase tracking-wide text-gray-600 font-semibold mb-0.5">
            Garantía expirada
          </div>
          <p className="text-sm text-gray-800 mb-1">
            La garantía expiró el <strong>{formatearFecha(garantia.finFecha)}</strong>.
          </p>
          <p className="text-xs text-gray-600">
            Si necesitas un nuevo servicio, contáctanos por WhatsApp.
          </p>
        </div>
      </div>
    </div>
  );
}

function CardDatos({ info }: { info: GarantiaApiInfo }) {
  const equipo = useMemo(
    () => [info.equipoTipo, info.equipoMarca].filter(Boolean).join(' '),
    [info],
  );
  const modelo = info.equipoModelo;
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-2.5">
      <div className="flex items-center justify-between pb-2 border-b border-gray-100">
        <div className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">
          Conduce
        </div>
        <div className="text-sm font-mono font-bold text-[#0f3460]">
          {info.conduceNumero || '—'}
        </div>
      </div>

      <Linea icon={<User size={14} />} label="Cliente" valor={info.clienteNombre} />
      <Linea
        icon={<Wrench size={14} />}
        label="Equipo"
        valor={equipo + (modelo ? ` (${modelo})` : '')}
      />
      <Linea icon={<User size={14} />} label="Atendido por" valor={info.tecnicoNombre} />
      <Linea
        icon={<Calendar size={14} />}
        label="Fecha del servicio"
        valor={info.fechaServicio ? formatearFecha(info.fechaServicio) : null}
      />
      <Linea
        icon={<Clock size={14} />}
        label="Tiempo de garantía"
        valor={`${info.garantia.tiempoDias} días`}
      />
    </div>
  );
}

function Linea({
  icon,
  label,
  valor,
}: {
  icon: React.ReactNode;
  label: string;
  valor: string | null | undefined;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-gray-400">{icon}</span>
      <span className="text-gray-500 text-xs w-32 flex-shrink-0">{label}</span>
      <span className="text-gray-900 font-medium flex-1 truncate">
        {valor && valor.trim() ? valor : '—'}
      </span>
    </div>
  );
}

function ModalReclamo({
  problema,
  onProblema,
  enviando,
  error,
  onCancelar,
  onEnviar,
}: {
  problema: string;
  onProblema: (s: string) => void;
  enviando: boolean;
  error: string | null;
  onCancelar: () => void;
  onEnviar: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl p-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Shield size={20} className="text-amber-600" />
            <h2 className="text-base font-bold text-gray-900">Reclamar garantía</h2>
          </div>
          <button
            type="button"
            onClick={onCancelar}
            className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        <p className="text-sm text-gray-600 mb-3">
          Describe el problema que estás teniendo con tu equipo. Pronto un técnico te contactará para coordinar la visita.
        </p>

        <label className="block text-xs font-medium text-gray-700 mb-1">
          Descripción del problema
        </label>
        <textarea
          value={problema}
          onChange={e => onProblema(e.target.value)}
          rows={5}
          maxLength={500}
          placeholder="Ej: La lavadora vuelve a hacer el mismo ruido al iniciar el lavado…"
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
        />
        <div className="flex items-center justify-between mt-1">
          <span className="text-[11px] text-gray-400">
            Mínimo 10 caracteres
          </span>
          <span className="text-[11px] text-gray-400">
            {problema.length}/500
          </span>
        </div>

        {error && (
          <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-2.5 text-xs text-red-700">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onCancelar}
            disabled={enviando}
            className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onEnviar}
            disabled={enviando || problema.trim().length < 10}
            className="inline-flex items-center gap-2 px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Send size={14} />
            {enviando ? 'Enviando...' : 'Enviar reclamo'}
          </button>
        </div>
      </div>
    </div>
  );
}
