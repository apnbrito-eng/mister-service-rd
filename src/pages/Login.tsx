import { useState, FormEvent } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { FirebaseAppCheck } from '@capacitor-firebase/app-check';
const autofill = registerPlugin<{ commit(): Promise<void> }>('AutofillSession');
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase/config';
import { useNavigate } from 'react-router-dom';
import Logo from '../components/Logo';
import { Mail, Lock, Loader2, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mostrarClave, setMostrarClave] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorVisible, setErrorVisible] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Por favor ingresa tu email y contraseña');
      return;
    }
    setLoading(true);
    setErrorVisible('');
    try {
      if (Capacitor.isNativePlatform()) {
        try {
          await FirebaseAppCheck.getToken({ forceRefresh: false });
        } catch (cause) {
          console.error('Verificación de app móvil no disponible', cause instanceof Error ? cause.message : 'App Check');
          throw Object.assign(new Error('No se pudo verificar la aplicación'), { code: 'appCheck/native-unavailable' });
        }
      }
      await signInWithEmailAndPassword(auth, email.trim(), password);
      if (Capacitor.getPlatform() === 'android') await autofill.commit().catch(() => {});
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      navigate('/admin/dashboard');
    } catch (error: unknown) {
      const messages: Record<string, string> = {
        'auth/user-not-found': 'Usuario no encontrado',
        'auth/wrong-password': 'Contraseña incorrecta',
        'auth/invalid-credential': 'Credenciales inválidas',
        'auth/invalid-email': 'Email inválido',
        'auth/too-many-requests': 'Demasiados intentos. Intenta más tarde',
        'auth/network-request-failed': 'No se pudo conectar con el acceso del sistema. Revisa tu conexión y vuelve a intentar.',
        'auth/app-check-token-is-invalid': 'La verificación de esta aplicación fue rechazada. Informa al administrador (APP-VERIFY).',
      };
      const err = error as { code?: string; message?: string };
      console.error('Firebase Auth Error:', err.code, err.message);
      const mensaje = err.code?.startsWith('appCheck/')
        ? 'No se pudo verificar esta aplicación con Google o Apple. No cambies tu contraseña. Comprueba la conexión y usa la versión actualizada; si continúa, informa al administrador (APP-VERIFY).'
        : (err.code && messages[err.code]) || 'No pudimos iniciar sesión. Revisa tu conexión e intenta nuevamente.';
      setErrorVisible(mensaje);
      toast.error(mensaje);
    } finally {
      setLoading(false);
    }
  };

  return (
    // @safe-gradient: pantalla de login splash full-screen sutil — branding entrada al sistema
    <div className="login-page bg-gradient-to-br from-brand-50 to-brand-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-brand-800 px-8 py-10 flex flex-col items-center">
            <Logo size="lg" white />
            <p className="text-blue-200 text-sm mt-4 text-center">
              Lo arreglamos en tu casa, el mismo día
            </p>
          </div>

          {/* Form */}
          <div className="px-8 py-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-1">Bienvenido</h2>
            <p className="text-gray-500 text-sm mb-6">Ingresa tus credenciales para continuar</p>

            {errorVisible && <p role="alert" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{errorVisible}</p>}
            <form onSubmit={handleSubmit} autoComplete="on" className="space-y-4">
              <div>
                <label htmlFor="correo-login" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Correo electrónico
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input
                    id="correo-login"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="usuario@misterservicerd.com"
                    className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-[#1a5fa8] focus:border-transparent"
                    disabled={loading}
                    name="username"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    enterKeyHint="next"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="clave-login" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Contraseña
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input
                    id="clave-login"
                    type={mostrarClave ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-14 py-3 border border-gray-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-[#1a5fa8] focus:border-transparent"
                    disabled={loading}
                    name="password"
                    autoComplete="current-password"
                    enterKeyHint="go"
                  />
                  <button
                    type="button"
                    aria-label={mostrarClave ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    aria-pressed={mostrarClave}
                    aria-controls="clave-login"
                    onClick={() => setMostrarClave(actual => !actual)}
                    disabled={loading}
                    className="absolute right-1 top-1/2 -translate-y-1/2 min-w-11 min-h-11 flex items-center justify-center rounded-lg text-gray-500 hover:text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
                  >
                    {mostrarClave ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-brand-600 hover:bg-brand-700 text-white py-3 rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2 mt-2"
              >
                {loading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Iniciando sesión...
                  </>
                ) : (
                  'Iniciar sesión'
                )}
              </button>
            </form>
          </div>
        </div>

        <p className="text-center text-brand-700 text-xs mt-6">
          © {new Date().getFullYear()} Mister Service RD · Todos los derechos reservados
        </p>
      </div>
    </div>
  );
}
