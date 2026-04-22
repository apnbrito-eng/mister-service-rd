import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, setDoc, doc, Timestamp, query, orderBy } from 'firebase/firestore';
import { createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { db, auth } from '../firebase/config';
import { Personal, Rol, TecnicoPermisos, PERMISOS_DEFAULT_TECNICO, PermisosSistema } from '../types';
import { permisosDefaultDeRol, iaHabilitadaDefaultPorRol } from '../utils/permisos';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';
import { Plus, Edit, Key, Power, User, Shield, Eye, EyeOff, Check, X, KeyRound, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';

const ROL_LABELS: Record<Rol, string> = {
  administrador: 'Administrador',
  coordinadora: 'Coordinadora',
  secretaria: 'Secretaria',
  operaria: 'Operaria',
  tecnico: 'Técnico',
  ayudante: 'Ayudante',
};

const ROL_COLORS: Record<Rol, string> = {
  administrador: 'bg-purple-100 text-purple-700',
  coordinadora: 'bg-violet-100 text-violet-700',
  secretaria: 'bg-blue-100 text-blue-700',
  operaria: 'bg-teal-100 text-teal-700',
  tecnico: 'bg-orange-100 text-orange-700',
  ayudante: 'bg-slate-100 text-slate-700',
};

interface FormState {
  nombre: string;
  email: string;
  password: string;
  telefono: string;
  rol: Rol;
  color: string;
  permisos: TecnicoPermisos;
  permisosPersonalizados: boolean;
  permisosSistema: PermisosSistema;
  iaHabilitada: boolean;
}

const initialForm: FormState = {
  nombre: '',
  email: '',
  password: '',
  telefono: '',
  rol: 'tecnico',
  color: '#3b82f6',
  permisos: { ...PERMISOS_DEFAULT_TECNICO },
  permisosPersonalizados: false,
  permisosSistema: permisosDefaultDeRol('tecnico'),
  iaHabilitada: iaHabilitadaDefaultPorRol('tecnico'),
};

const COLORES_TECNICO = ['#3b82f6', '#f97316', '#14b8a6', '#a855f7', '#22c55e', '#ef4444', '#f59e0b', '#0f3460'];

export default function GestionUsuarios() {
  const [loading, setLoading] = useState(true);
  const [usuarios, setUsuarios] = useState<Personal[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(initialForm);
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Access modal (crear/cambiar contraseña para Firebase Auth)
  const [showAccessModal, setShowAccessModal] = useState(false);
  const [accessUser, setAccessUser] = useState<Personal | null>(null);
  const [accessPassword, setAccessPassword] = useState('');
  const [showAccessPassword, setShowAccessPassword] = useState(false);
  const [accessSaving, setAccessSaving] = useState(false);
  // 'email' = enviar email de recuperación; 'directa' = cambiar contraseña directamente (Admin SDK)
  const [accessMode, setAccessMode] = useState<'email' | 'directa'>('directa');

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'personal'), orderBy('nombre')),
      (snap) => {
        setUsuarios(snap.docs.map(d => ({ id: d.id, ...d.data() } as Personal)));
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const resetForm = () => {
    setForm(initialForm);
    setEditingId(null);
    setShowPassword(false);
  };

  const openCreate = () => {
    resetForm();
    setShowModal(true);
  };

  const openEdit = (u: Personal) => {
    setForm({
      nombre: u.nombre,
      email: u.email || '',
      password: '',
      telefono: u.telefono || '',
      rol: u.rol,
      color: u.color || '#3b82f6',
      permisos: u.permisos || { ...PERMISOS_DEFAULT_TECNICO },
      permisosPersonalizados: !!u.permisosPersonalizados,
      permisosSistema: u.permisosSistema || permisosDefaultDeRol(u.rol),
      iaHabilitada: u.iaHabilitada ?? false,
    });
    setEditingId(u.id);
    setShowModal(true);
  };

  const togglePermisoSistema = (key: keyof PermisosSistema) => {
    setForm(f => ({
      ...f,
      permisosSistema: { ...f.permisosSistema, [key]: !f.permisosSistema[key] } as PermisosSistema,
    }));
  };

  const restaurarDefaultsRol = () => {
    setForm(f => ({
      ...f,
      permisosSistema: permisosDefaultDeRol(f.rol),
      permisosPersonalizados: false,
    }));
  };

  const togglePermiso = (key: keyof TecnicoPermisos) => {
    setForm(f => ({
      ...f,
      permisos: { ...f.permisos, [key]: !f.permisos[key] },
    }));
  };

  const setVistaAgenda = (v: 'dia' | 'semana' | 'mes') => {
    setForm(f => ({ ...f, permisos: { ...f.permisos, vistaAgenda: v } }));
  };

  const setSoloPropiasCitas = (v: boolean) => {
    setForm(f => ({ ...f, permisos: { ...f.permisos, soloPropiasCitas: v } }));
  };

  const handleRolChange = (nuevoRol: Rol) => {
    setForm(f => ({
      ...f,
      rol: nuevoRol,
      // iaHabilitada: en CREACIÓN recalcular según default del rol; en EDICIÓN no tocar.
      iaHabilitada: editingId ? f.iaHabilitada : iaHabilitadaDefaultPorRol(nuevoRol),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre.trim()) { toast.error('Nombre es obligatorio'); return; }
    if (!form.email.trim()) { toast.error('Email es obligatorio'); return; }
    if (!editingId && form.password.length < 8) { toast.error('La contraseña debe tener al menos 8 caracteres'); return; }

    setSaving(true);
    try {
      const data: Record<string, unknown> = {
        nombre: form.nombre.trim(),
        email: form.email.trim().toLowerCase(),
        telefono: form.telefono,
        rol: form.rol,
        color: form.color,
        disponibilidad: true,
        activo: true,
        // iaHabilitada siempre boolean (nunca undefined) — Firestore rechaza undefined.
        iaHabilitada: form.iaHabilitada === true,
      };

      if (form.rol === 'tecnico') {
        data.permisos = form.permisos;
      }
      // Permisos granulares (Fase 3B)
      data.permisosPersonalizados = form.permisosPersonalizados;
      if (form.permisosPersonalizados) {
        data.permisosSistema = form.permisosSistema;
      }

      if (editingId) {
        await updateDoc(doc(db, 'personal', editingId), data);

        // Sync ampliado a usuarios/{uid} cuando hay Auth vinculado (task #76).
        // El doc en `usuarios/` es el profile real-time que consume AppContext; si no
        // se propaga, cambios en iaHabilitada/rol/permisos no llegan al usuario hasta
        // que vuelva a iniciar sesión. Envolvemos en try/catch independiente para no
        // romper el updateDoc principal si falla el sync.
        try {
          const editedUser = usuarios.find(u => u.id === editingId);
          const uid = editedUser?.uid;
          if (uid && uid !== 'existing') {
            const syncPayload: Record<string, unknown> = {};
            if (data.iaHabilitada !== undefined) syncPayload.iaHabilitada = data.iaHabilitada;
            if (data.rol !== undefined) syncPayload.rol = data.rol;
            if (data.nombre !== undefined) syncPayload.nombre = data.nombre;
            if (data.email !== undefined) syncPayload.email = data.email;
            if (data.activo !== undefined) syncPayload.activo = data.activo;
            if (data.permisosPersonalizados !== undefined) syncPayload.permisosPersonalizados = data.permisosPersonalizados;
            if (data.permisosSistema !== undefined) syncPayload.permisosSistema = data.permisosSistema;
            await setDoc(doc(db, 'usuarios', uid), syncPayload, { merge: true });
          }
        } catch (syncErr) {
          console.warn('Sync a usuarios/{uid} falló (no bloquea el update principal):', syncErr);
        }

        toast.success('Usuario actualizado');
      } else {
        // Create Firebase Auth user using a secondary app to not kick out admin
        let createdUid: string | null = null;
        try {
          const secondaryApp = initializeApp(auth.app.options, 'Secondary');
          const secondaryAuth = getAuth(secondaryApp);
          const cred = await createUserWithEmailAndPassword(secondaryAuth, form.email.trim(), form.password);
          createdUid = cred.user.uid;
          await deleteApp(secondaryApp);
        } catch (authErr: unknown) {
          const errCode = (authErr as { code?: string })?.code;
          if (errCode === 'auth/email-already-in-use') {
            toast.error('El email ya está registrado en Firebase Auth');
            setSaving(false);
            return;
          }
          console.warn('Auth creation issue:', authErr);
        }
        if (createdUid) data.uid = createdUid;
        data.createdAt = Timestamp.now();
        await addDoc(collection(db, 'personal'), data);
        toast.success('Usuario creado');
      }
      setShowModal(false);
      resetForm();
    } catch (err) {
      console.error(err);
      toast.error('Error al guardar usuario');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActivo = async (u: Personal) => {
    try {
      await updateDoc(doc(db, 'personal', u.id), { activo: !u.activo });
      toast.success(u.activo ? 'Desactivado' : 'Activado');
    } catch { toast.error('Error'); }
  };

  const openAccessModal = (u: Personal) => {
    if (!u.email) { toast.error('El usuario no tiene email configurado'); return; }
    setAccessUser(u);
    setAccessPassword('');
    setShowAccessPassword(false);
    setAccessMode('directa');
    setShowAccessModal(true);
  };

  const closeAccessModal = () => {
    setShowAccessModal(false);
    setAccessUser(null);
    setAccessPassword('');
  };

  /**
   * Cambia la contraseña directamente usando el endpoint /api/admin/reset-password
   * (Firebase Admin SDK en Vercel). No envía email al usuario.
   */
  const handleCambiarPasswordDirecto = async () => {
    if (!accessUser || !accessUser.email) return;
    if (accessPassword.length < 8) {
      toast.error('La contraseña debe tener al menos 8 caracteres');
      return;
    }
    setAccessSaving(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        toast.error('Sesión expirada. Vuelve a iniciar sesión.');
        setAccessSaving(false);
        return;
      }
      const idToken = await currentUser.getIdToken();

      const resp = await fetch('/api/admin/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          targetEmail: accessUser.email,
          newPassword: accessPassword,
        }),
      });

      const data = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        toast.error(data.error || `Error ${resp.status}`);
        return;
      }

      toast.success(`✅ Contraseña cambiada para ${accessUser.nombre}`);
      closeAccessModal();
    } catch (err) {
      console.error(err);
      toast.error('Error al cambiar contraseña');
    } finally {
      setAccessSaving(false);
    }
  };

  /** Crear cuenta en Firebase Auth para un usuario existente en Firestore */
  const handleCrearAcceso = async () => {
    if (!accessUser || !accessUser.email) return;
    if (accessPassword.length < 8) {
      toast.error('La contraseña debe tener al menos 8 caracteres');
      return;
    }
    setAccessSaving(true);
    try {
      // Usar app secundaria para no cerrar la sesión del admin
      const secondaryApp = initializeApp(auth.app.options, 'AccessSecondary');
      const secondaryAuth = getAuth(secondaryApp);
      const cred = await createUserWithEmailAndPassword(secondaryAuth, accessUser.email, accessPassword);
      await deleteApp(secondaryApp);

      // Guardar el uid en el documento de Firestore para marcar que tiene acceso
      await updateDoc(doc(db, 'personal', accessUser.id), {
        uid: cred.user.uid,
      });
      toast.success(`✅ Acceso creado para ${accessUser.nombre}`);
      closeAccessModal();
    } catch (err: unknown) {
      const errCode = (err as { code?: string })?.code;
      if (errCode === 'auth/email-already-in-use') {
        // Ya tiene Auth — marcar como que tiene acceso aunque no sepamos el uid
        await updateDoc(doc(db, 'personal', accessUser.id), { uid: 'existing' });
        toast('Este email ya tiene Auth. Marcado como "con acceso". Usa "Restablecer contraseña" para cambiarla.', { icon: 'ℹ️' });
        closeAccessModal();
      } else if (errCode === 'auth/weak-password') {
        toast.error('Contraseña demasiado débil');
      } else if (errCode === 'auth/invalid-email') {
        toast.error('Email inválido');
      } else {
        console.error(err);
        toast.error('Error al crear acceso');
      }
    } finally {
      setAccessSaving(false);
    }
  };

  /** Envía email de recuperación de contraseña (para usuarios que ya tienen Auth) */
  const handleEnviarResetPassword = async () => {
    if (!accessUser || !accessUser.email) return;
    setAccessSaving(true);
    try {
      await sendPasswordResetEmail(auth, accessUser.email);
      toast.success('Email de recuperación enviado');
      closeAccessModal();
    } catch (err) {
      console.error(err);
      toast.error('Error al enviar email');
    } finally {
      setAccessSaving(false);
    }
  };

  if (loading) return <LoadingSpinner fullPage text="Cargando usuarios..." />;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#0f3460]">Gestión de Accesos</h1>
          <p className="text-gray-500 text-sm">Contraseñas, activación y permisos granulares</p>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start gap-2 text-sm text-blue-900">
        <User size={14} className="mt-0.5 shrink-0" />
        <div className="flex-1">
          Para crear nuevos usuarios del sistema, ve a{' '}
          <Link to="/admin/personal" className="font-semibold underline hover:text-blue-700 inline-flex items-center gap-1">
            Personal <ExternalLink size={11} />
          </Link>
          . Al crear un miembro del personal con rol distinto de "ayudante", se genera automáticamente su cuenta de acceso.
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Usuario</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Rol</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 hidden md:table-cell">Email</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 hidden lg:table-cell">Teléfono</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Estado</th>
                <th className="text-right text-xs font-semibold text-gray-500 px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {usuarios.map(u => (
                <tr key={u.id} className={`hover:bg-gray-50 ${!u.activo ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold"
                        style={{ backgroundColor: u.color || '#0f3460' }}>
                        {u.nombre.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </div>
                      <span className="text-sm font-medium text-gray-900">{u.nombre}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ROL_COLORS[u.rol]}`}>
                      {ROL_LABELS[u.rol]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 hidden md:table-cell">{u.email || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 hidden lg:table-cell">{u.telefono || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <span className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full w-fit ${u.activo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {u.activo ? 'Activo' : 'Inactivo'}
                      </span>
                      {u.uid ? (
                        <span className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full w-fit bg-green-50 text-green-700 border border-green-200">
                          🟢 Con acceso
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full w-fit bg-red-50 text-red-700 border border-red-200">
                          🔴 Sin acceso
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => openEdit(u)} title="Editar permisos"
                        className="p-2 hover:bg-blue-50 rounded-lg text-blue-500 transition-colors">
                        <Edit size={14} />
                      </button>
                      <button
                        onClick={() => openAccessModal(u)}
                        title={u.uid ? 'Cambiar contraseña' : 'Crear acceso'}
                        className={`p-2 rounded-lg transition-colors ${u.uid ? 'hover:bg-yellow-50 text-yellow-600' : 'hover:bg-red-50 text-red-600'}`}
                      >
                        {u.uid ? <Key size={14} /> : <KeyRound size={14} />}
                      </button>
                      <button onClick={() => handleToggleActivo(u)} title={u.activo ? 'Desactivar' : 'Activar'}
                        className={`p-2 rounded-lg transition-colors ${u.activo ? 'hover:bg-red-50 text-red-500' : 'hover:bg-green-50 text-green-500'}`}>
                        <Power size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Crear/Editar */}
      <Modal
        isOpen={showModal}
        onClose={() => { setShowModal(false); resetForm(); }}
        title={editingId ? 'Editar Usuario' : 'Crear Usuario / Técnico'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* SECCIÓN 1: Datos Básicos */}
          <div>
            <h3 className="text-sm font-semibold text-[#0f3460] uppercase tracking-wide mb-3 pb-2 border-b border-gray-100 flex items-center gap-2">
              <User size={16} /> 1. Datos Básicos
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre completo *</label>
                <input type="text" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email * <span className="text-xs text-gray-400">(usuario de acceso)</span></label>
                  <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    disabled={!!editingId}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8] disabled:bg-gray-50" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
                  <input type="tel" value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))}
                    placeholder="8091234567"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
                </div>
              </div>

              {!editingId && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña inicial * <span className="text-xs text-gray-400">(mínimo 8 caracteres)</span></label>
                  <div className="relative">
                    <input type={showPassword ? 'text' : 'password'} value={form.password}
                      onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                      className="w-full px-3 py-2 pr-10 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600">
                      {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Rol *</label>
                  <select value={form.rol} onChange={e => handleRolChange(e.target.value as Rol)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]">
                    <option value="administrador">Administrador</option>
                    <option value="secretaria">Secretaria</option>
                    <option value="operaria">Operaria</option>
                    <option value="tecnico">Técnico</option>
                  </select>
                </div>
                {form.rol === 'tecnico' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Color en mapa</label>
                    <div className="flex gap-1.5 pt-1">
                      {COLORES_TECNICO.map(c => (
                        <button key={c} type="button" onClick={() => setForm(f => ({ ...f, color: c }))}
                          className={`w-7 h-7 rounded-full transition-transform ${form.color === c ? 'ring-2 ring-offset-1 ring-[#0f3460] scale-110' : 'hover:scale-105'}`}
                          style={{ backgroundColor: c }}>
                          {form.color === c && <Check size={12} className="text-white mx-auto" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* SECCIÓN 2: Permisos (solo si rol = técnico) */}
          {form.rol === 'tecnico' && (
            <div>
              <h3 className="text-sm font-semibold text-[#0f3460] uppercase tracking-wide mb-1 pb-2 border-b border-gray-100 flex items-center gap-2">
                <Shield size={16} /> 2. Permisos del Técnico
              </h3>
              <p className="text-sm text-gray-600 mb-4">Configurar qué puede ver y hacer este técnico</p>

              {/* Vista de Agenda */}
              <div className="bg-gray-50 rounded-xl p-4 mb-3">
                <p className="text-sm font-semibold text-gray-900 mb-1">Vista de Agenda</p>
                <p className="text-xs text-gray-500 mb-3">¿Cuánto tiempo de su agenda puede ver?</p>
                <div className="space-y-2">
                  {([
                    { v: 'dia', l: 'Solo su día de trabajo (recomendado)' },
                    { v: 'semana', l: 'Semana completa' },
                    { v: 'mes', l: 'Mes completo' },
                  ] as const).map(op => (
                    <label key={op.v} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="radio" checked={form.permisos.vistaAgenda === op.v}
                        onChange={() => setVistaAgenda(op.v)}
                        className="text-[#1a5fa8] focus:ring-[#1a5fa8]" />
                      <span>{op.l}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Visibilidad de Citas */}
              <div className="bg-gray-50 rounded-xl p-4 mb-3">
                <p className="text-sm font-semibold text-gray-900 mb-1">Visibilidad de Citas</p>
                <p className="text-xs text-gray-500 mb-3">¿Qué citas puede ver?</p>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="radio" checked={form.permisos.soloPropiasCitas}
                      onChange={() => setSoloPropiasCitas(true)}
                      className="text-[#1a5fa8] focus:ring-[#1a5fa8]" />
                    <span>Solo las citas asignadas a él</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="radio" checked={!form.permisos.soloPropiasCitas}
                      onChange={() => setSoloPropiasCitas(false)}
                      className="text-[#1a5fa8] focus:ring-[#1a5fa8]" />
                    <span>Todas las citas del sistema</span>
                  </label>
                </div>
              </div>

              {/* Datos del Cliente */}
              <div className="bg-gray-50 rounded-xl p-4 mb-3">
                <p className="text-sm font-semibold text-gray-900 mb-1">Datos del Cliente</p>
                <p className="text-xs text-gray-500 mb-3">¿Qué información del cliente puede ver?</p>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm cursor-not-allowed opacity-75">
                    <input type="checkbox" checked disabled
                      className="rounded border-gray-300 text-[#1a5fa8]" />
                    <span>Dirección y ubicación GPS <span className="text-xs text-gray-400">(siempre activo)</span></span>
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={form.permisos.verTelefonoCliente}
                      onChange={() => togglePermiso('verTelefonoCliente')}
                      className="rounded border-gray-300 text-[#1a5fa8] focus:ring-[#1a5fa8]" />
                    <span>Número de teléfono del cliente</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={form.permisos.verEmailCliente}
                      onChange={() => togglePermiso('verEmailCliente')}
                      className="rounded border-gray-300 text-[#1a5fa8] focus:ring-[#1a5fa8]" />
                    <span>Email del cliente</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={form.permisos.puedeContactarCliente}
                      onChange={() => togglePermiso('puedeContactarCliente')}
                      className="rounded border-gray-300 text-[#1a5fa8] focus:ring-[#1a5fa8]" />
                    <span>Botón de WhatsApp directo al cliente</span>
                  </label>
                </div>
              </div>

              {/* Acciones Permitidas */}
              <div className="bg-gray-50 rounded-xl p-4 mb-3">
                <p className="text-sm font-semibold text-gray-900 mb-1">Acciones Permitidas</p>
                <p className="text-xs text-gray-500 mb-3">¿Qué puede hacer en cada cita?</p>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={form.permisos.puedeMarcarCompletado}
                      onChange={() => togglePermiso('puedeMarcarCompletado')}
                      className="rounded border-gray-300 text-[#1a5fa8] focus:ring-[#1a5fa8]" />
                    <span>Marcar trabajo como realizado</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={form.permisos.puedeAgregarNotas}
                      onChange={() => togglePermiso('puedeAgregarNotas')}
                      className="rounded border-gray-300 text-[#1a5fa8] focus:ring-[#1a5fa8]" />
                    <span>Agregar notas técnicas</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={form.permisos.puedeVerHistorial}
                      onChange={() => togglePermiso('puedeVerHistorial')}
                      className="rounded border-gray-300 text-[#1a5fa8] focus:ring-[#1a5fa8]" />
                    <span>Ver historial completo de la orden</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={form.permisos.puedeVerCotizaciones}
                      onChange={() => togglePermiso('puedeVerCotizaciones')}
                      className="rounded border-gray-300 text-[#1a5fa8] focus:ring-[#1a5fa8]" />
                    <span>Ver cotizaciones asociadas</span>
                  </label>
                </div>
              </div>

              {/* Notificaciones */}
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-sm font-semibold text-gray-900 mb-3">Notificaciones</p>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={form.permisos.recibeNotificacionNuevaCita}
                    onChange={() => togglePermiso('recibeNotificacionNuevaCita')}
                    className="rounded border-gray-300 text-[#1a5fa8] focus:ring-[#1a5fa8]" />
                  <span>Recibir notificación cuando se le asigna una cita nueva</span>
                </label>
              </div>
            </div>
          )}

          {/* Permisos granulares del sistema (Fase 3B) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Permisos granulares</h3>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.permisosPersonalizados}
                    onChange={() => setForm(f => ({
                      ...f,
                      permisosPersonalizados: !f.permisosPersonalizados,
                      permisosSistema: !f.permisosPersonalizados ? f.permisosSistema : permisosDefaultDeRol(f.rol),
                    }))}
                    className="rounded border-gray-300 text-[#1a5fa8] focus:ring-[#1a5fa8]"
                  />
                  Personalizar (sobrescribir defaults del rol)
                </label>
                <button
                  type="button"
                  onClick={restaurarDefaultsRol}
                  className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600"
                >
                  Restaurar defaults
                </button>
              </div>
            </div>

            {!form.permisosPersonalizados ? (
              <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-3">
                Usando los permisos por defecto del rol <span className="font-semibold">{ROL_LABELS[form.rol]}</span>.
                Marca "Personalizar" para editar permisos individuales.
              </p>
            ) : (
              <div className="space-y-3 bg-blue-50/40 border border-blue-100 rounded-xl p-4">
                {[
                  { titulo: 'Órdenes', keys: ['ordenesVer', 'ordenesCrear', 'ordenesModificar', 'ordenesModificarFueraGrupo', 'ordenesEliminar', 'ordenesVerEliminadas'] },
                  { titulo: 'Cotizaciones', keys: ['cotizacionesVer', 'cotizacionesCrear', 'cotizacionesModificar', 'cotizacionesAprobarPrecio'] },
                  { titulo: 'Facturas', keys: ['facturasVer', 'facturasCrear', 'facturasModificar', 'facturasEliminar'] },
                  { titulo: 'Clientes', keys: ['clientesVer', 'clientesCrear', 'clientesModificar', 'clientesEliminar'] },
                  { titulo: 'Personal', keys: ['personalVer', 'personalCrear', 'personalModificar', 'personalEliminar'] },
                  { titulo: 'Gastos', keys: ['gastosVer', 'gastosCrear', 'gastosEliminar'] },
                  { titulo: 'Otros', keys: ['rendimientoVer', 'configuracionVer', 'configuracionModificar', 'cierreDiaEjecutar'] },
                ].map(g => (
                  <div key={g.titulo}>
                    <p className="text-xs font-semibold text-gray-700 mb-1.5">{g.titulo}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {g.keys.map(k => (
                        <label key={k} className="flex items-center gap-2 text-xs cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!form.permisosSistema[k as keyof PermisosSistema]}
                            onChange={() => togglePermisoSistema(k as keyof PermisosSistema)}
                            className="rounded border-gray-300 text-[#1a5fa8] focus:ring-[#1a5fa8]"
                          />
                          <span className="text-gray-700">{k}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Acceso al Asistente IA */}
          {(() => {
            const iaBloqueada = form.rol === 'tecnico' || form.rol === 'ayudante';
            return (
              <div>
                <h3 className="text-sm font-semibold text-[#0f3460] uppercase tracking-wide mb-2 pb-2 border-b border-gray-100">
                  Acceso al Asistente IA
                </h3>
                <label
                  className={`flex items-start gap-2 ${iaBloqueada ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                  title={iaBloqueada ? 'Disponible en una fase futura del proyecto' : undefined}
                >
                  <input
                    type="checkbox"
                    checked={form.iaHabilitada === true}
                    disabled={iaBloqueada}
                    onChange={e => setForm(f => ({ ...f, iaHabilitada: e.target.checked }))}
                    className="mt-1 rounded border-gray-300 text-[#1a5fa8] focus:ring-[#1a5fa8]"
                  />
                  <span className="text-sm text-gray-800">Habilitar acceso al Asistente IA</span>
                </label>
                <p className="text-xs text-gray-500 mt-1 ml-6">
                  Si está activo, este usuario verá un chat flotante en la esquina inferior derecha para hacerle preguntas a la IA del sistema.
                </p>
              </div>
            );
          })()}

          {/* Botones */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <button type="button" onClick={() => { setShowModal(false); resetForm(); }}
              className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg">Cancelar</button>
            <button type="submit" disabled={saving}
              className="px-6 py-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-lg text-sm font-medium disabled:opacity-60">
              {saving ? 'Guardando...' : editingId ? 'Actualizar' : 'Crear Usuario'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Gestionar Acceso (Firebase Auth) */}
      <Modal
        isOpen={showAccessModal}
        onClose={closeAccessModal}
        title={accessUser?.uid ? 'Cambiar contraseña' : 'Crear acceso'}
        size="md"
      >
        {accessUser && (
          <div className="space-y-4">
            {/* Info del usuario */}
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold"
                  style={{ backgroundColor: accessUser.color || '#0f3460' }}>
                  {accessUser.nombre.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{accessUser.nombre}</p>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ROL_COLORS[accessUser.rol]}`}>
                    {ROL_LABELS[accessUser.rol]}
                  </span>
                </div>
              </div>
              <p className="text-xs text-gray-600 mt-1">📧 {accessUser.email}</p>
              <p className="text-xs mt-2">
                Estado:{' '}
                {accessUser.uid ? (
                  <span className="text-green-600 font-medium">🟢 Ya tiene acceso al sistema</span>
                ) : (
                  <span className="text-red-600 font-medium">🔴 Aún no puede hacer login</span>
                )}
              </p>
            </div>

            {accessUser.uid ? (
              // Usuario ya tiene Auth → permitir cambiar directo o enviar email
              <div className="space-y-4">
                {/* Selector de modo */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAccessMode('directa')}
                    className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                      accessMode === 'directa'
                        ? 'bg-[#0f3460] text-white border-[#0f3460]'
                        : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    Cambiar directamente
                  </button>
                  <button
                    type="button"
                    onClick={() => setAccessMode('email')}
                    className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                      accessMode === 'email'
                        ? 'bg-[#0f3460] text-white border-[#0f3460]'
                        : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    Enviar email de reset
                  </button>
                </div>

                {accessMode === 'directa' ? (
                  <div className="space-y-3">
                    <p className="text-sm text-gray-700">
                      Define una nueva contraseña para <strong>{accessUser.nombre}</strong>. El
                      cambio es inmediato; no se le notifica por email. Comunícale la nueva
                      contraseña por otro medio.
                    </p>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Nueva contraseña <span className="text-gray-400">(mínimo 8 caracteres)</span>
                      </label>
                      <div className="relative">
                        <input
                          type={showAccessPassword ? 'text' : 'password'}
                          value={accessPassword}
                          onChange={e => setAccessPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full px-3 py-2 pr-10 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
                          autoComplete="new-password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowAccessPassword(!showAccessPassword)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                        >
                          {showAccessPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                      {accessPassword && accessPassword.length < 8 && (
                        <p className="text-[11px] text-red-500 mt-1">Faltan {8 - accessPassword.length} caracteres</p>
                      )}
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                      <button
                        type="button"
                        onClick={closeAccessModal}
                        disabled={accessSaving}
                        className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={handleCambiarPasswordDirecto}
                        disabled={accessSaving || accessPassword.length < 8}
                        className="flex items-center gap-1 px-5 py-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-lg text-sm font-medium disabled:opacity-60"
                      >
                        <Key size={14} />
                        {accessSaving ? 'Guardando...' : 'Cambiar contraseña'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-gray-700">
                      Se enviará un enlace de recuperación al email{' '}
                      <strong>{accessUser.email}</strong>. El usuario define su propia contraseña
                      desde el enlace.
                    </p>
                    <div className="flex justify-end gap-3 pt-2">
                      <button
                        type="button"
                        onClick={closeAccessModal}
                        disabled={accessSaving}
                        className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={handleEnviarResetPassword}
                        disabled={accessSaving}
                        className="px-5 py-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-lg text-sm font-medium disabled:opacity-60"
                      >
                        {accessSaving ? 'Enviando...' : 'Enviar email'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              // Usuario sin Auth → crear cuenta con contraseña
              <div className="space-y-3">
                <p className="text-sm text-gray-700">
                  Crea una contraseña inicial para que <strong>{accessUser.nombre}</strong> pueda hacer login
                  con el email <strong>{accessUser.email}</strong>.
                </p>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Nueva contraseña <span className="text-gray-400">(mínimo 8 caracteres)</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showAccessPassword ? 'text' : 'password'}
                      value={accessPassword}
                      onChange={e => setAccessPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3 py-2 pr-10 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAccessPassword(!showAccessPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                    >
                      {showAccessPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  {accessPassword && accessPassword.length < 8 && (
                    <p className="text-[11px] text-red-500 mt-1">Faltan {8 - accessPassword.length} caracteres</p>
                  )}
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={closeAccessModal}
                    disabled={accessSaving}
                    className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleCrearAcceso}
                    disabled={accessSaving || accessPassword.length < 8}
                    className="flex items-center gap-1 px-5 py-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-lg text-sm font-medium disabled:opacity-60"
                  >
                    <KeyRound size={14} />
                    {accessSaving ? 'Creando...' : 'Crear acceso'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
