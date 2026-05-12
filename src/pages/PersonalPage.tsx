import { useState, useEffect, Fragment } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, setDoc, Timestamp, query, orderBy, writeBatch } from 'firebase/firestore';
import { sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { db, auth } from '../firebase/config';
import { Personal, Rol, OrdenServicio, ROLES_CON_ACCESO, PERMISOS_DEFAULT_TECNICO } from '../types';
import { formatTelefono, parseOrden } from '../utils';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';
import FormAltaEditarEmpleado from '../components/personal/FormAltaEditarEmpleado';
import GruposOperariaTecnico from '../components/personal/GruposOperariaTecnico';
import ModalConfirmarEliminar from '../components/personal/ModalConfirmarEliminar';
import { Plus, Edit, Check, Power, Trash2, RotateCcw, ChevronDown, ChevronRight, AlertTriangle, Link2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useApp } from '../context/AppContext';
import { puede, iaHabilitadaDefaultPorRol } from '../utils/permisos';
import { agruparPorRol } from '../utils/roles';

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

const ROLES_CON_COMISION: Rol[] = ['tecnico', 'operaria', 'secretaria', 'coordinadora'];
// Orden del select de rol en el formulario vive ahora dentro de
// `components/personal/FormAltaEditarEmpleado.tsx` (SPRINT-142a).

function comisionDefaultPorNivel(nivel: 'junior' | 'senior'): number {
  return nivel === 'senior' ? 10 : 8;
}

export default function PersonalPage() {
  const { userProfile } = useApp();
  const esAdmin = userProfile?.rol === 'administrador' || userProfile?.rol === 'coordinadora';
  const puedeCrearPersonal = puede(userProfile, 'personalCrear');
  const puedeModificarPersonal = puede(userProfile, 'personalModificar');
  const puedeEliminarPersonal = puede(userProfile, 'personalEliminar');
  const [loading, setLoading] = useState(true);
  const [personal, setPersonal] = useState<Personal[]>([]);
  const [ordenes, setOrdenes] = useState<OrdenServicio[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Marca si el usuario ya tocó el input de comisión manualmente — evita sobrescribir al cambiar nivel
  const [comisionTocada, setComisionTocada] = useState(false);

  // Estado de acciones (desactivar/eliminar) y colapso de inactivos
  const [showDesactivarModal, setShowDesactivarModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [personalAccion, setPersonalAccion] = useState<Personal | null>(null);
  const [transferDestinoId, setTransferDestinoId] = useState('');
  const [processingAccion, setProcessingAccion] = useState(false);
  const [mostrarInactivos, setMostrarInactivos] = useState(false);

  const [form, setForm] = useState<Omit<Personal, 'id'>>({
    nombre: '', rol: 'tecnico', telefono: '', email: '', especialidad: '', zona: '', horario: '', color: '#3b82f6', disponibilidad: true, activo: true,
    nivel: 'senior', comisionPorcentaje: 10, sueldoBase: 0,
    operariaId: '', operariaNombre: '',
    iaHabilitada: iaHabilitadaDefaultPorRol('tecnico'),
  });

  // Credenciales de acceso al sistema (separadas del form principal)
  const [emailAcceso, setEmailAcceso] = useState('');
  const [passwordAcceso, setPasswordAcceso] = useState('');
  const [showPasswordAcceso, setShowPasswordAcceso] = useState(false);

  // Modal de reset de contraseña (al editar personal con acceso)
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetTarget, setResetTarget] = useState<Personal | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetSaving, setResetSaving] = useState(false);

  // Modal de vincular cuenta Auth existente (tanto desde fila como desde form cuando email ya existe)
  const [showVincularModal, setShowVincularModal] = useState(false);
  const [vincularTarget, setVincularTarget] = useState<Personal | null>(null);
  const [vincularEmail, setVincularEmail] = useState('');
  const [vincularPassword, setVincularPassword] = useState('');
  const [vincularSaving, setVincularSaving] = useState(false);
  // Pending data cuando la vinculación se dispara desde el form (no desde un row button)
  const [vincularPending, setVincularPending] = useState<{
    personalId: string | null; // null = crear nuevo personal; string = editar existente
    personalData: Record<string, unknown>;
    usuarioData: Record<string, unknown>;
  } | null>(null);

  // Operarias/Coordinadoras/Admins activos disponibles como supervisoras de técnicos
  const operariasDisponibles = personal.filter(
    p => p.activo && (p.rol === 'operaria' || p.rol === 'coordinadora' || p.rol === 'administrador')
  );

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'personal'), orderBy('nombre')),
      (snap) => {
        setPersonal(snap.docs.map(d => ({ id: d.id, ...d.data() } as Personal)));
        setLoading(false);
      }
    );
    // Listener de órdenes para calcular dependencias al eliminar/desactivar
    const unsubOrdenes = onSnapshot(collection(db, 'ordenes_servicio'), (snap) => {
      setOrdenes(snap.docs.map(d => parseOrden(d.id, d.data() as Record<string, unknown>)));
    });
    return () => {
      unsub();
      unsubOrdenes();
    };
  }, []);

  /**
   * Llama al endpoint serverless `/api/admin/crear-usuario` que usa Admin SDK
   * para crear la cuenta Firebase Auth + docs Firestore sin deslogueyar al admin.
   * Devuelve true si se creó exitosamente, false si hubo error (ya mostró toast).
   * En caso de `email-already-in-use` (409), invoca `onEmailYaExiste` para que el
   * caller abra el modal de vinculación — y devuelve false para que el caller
   * corte el flujo (el modal continúa por otro camino).
   */
  const crearUsuarioViaEndpoint = async (opts: {
    personalId: string | null;
    onEmailYaExiste: () => void;
  }): Promise<boolean> => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      toast.error('Sesión expirada, vuelve a iniciar sesión');
      return false;
    }
    let idToken: string;
    try {
      idToken = await currentUser.getIdToken();
    } catch {
      toast.error('No se pudo obtener la sesión. Vuelve a iniciar sesión.');
      return false;
    }

    const payload: Record<string, unknown> = {
      email: emailAcceso.trim().toLowerCase(),
      password: passwordAcceso,
      nombre: form.nombre.trim(),
      rol: form.rol,
      iaHabilitada: form.iaHabilitada === true,
      disponibilidad: form.disponibilidad === true,
      activo: form.activo !== false,
    };
    if (form.telefono) payload.telefono = form.telefono;
    if (form.especialidad) payload.especialidad = form.especialidad;
    if (form.zona) payload.zona = form.zona;
    if (form.horario) payload.horario = form.horario;
    if (form.color) payload.color = form.color;
    if (form.nivel) payload.nivel = form.nivel;
    if (typeof form.sueldoBase === 'number') payload.sueldoBase = form.sueldoBase;
    if (typeof form.comisionPorcentaje === 'number') payload.comisionPorcentaje = form.comisionPorcentaje;
    if (form.operariaId) payload.operariaId = form.operariaId;
    if (form.operariaNombre) payload.operariaNombre = form.operariaNombre;
    if (opts.personalId) payload.personalId = opts.personalId;

    let resp: Response;
    try {
      resp = await fetch('/api/admin/crear-usuario', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.error('[crearUsuarioViaEndpoint] Error de red:', err);
      toast.error('Error de red al crear el usuario');
      return false;
    }

    let data: { uid?: string; personalId?: string; error?: string } = {};
    try {
      data = await resp.json();
    } catch {
      /* puede venir vacío en 5xx raros */
    }

    if (resp.status === 409) {
      // Email ya existe en Firebase Auth → delegar al modal de vinculación
      opts.onEmailYaExiste();
      return false;
    }
    if (!resp.ok) {
      toast.error(data.error || 'Error al crear el usuario');
      return false;
    }
    return true;
  };

  // @safe-non-tx: SPRINT-134 follow-up (hallazgo P-003 ext, 2026-05-11).
  // Muta personal + usuarios (alta de empleado con acceso, SPRINT-105). P-004 caza el invariante
  // "doble doc obligatorio" pero NO la atomicidad transaccional. Refactor pendiente a writeBatch.
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre || !form.rol) { toast.error('Nombre y rol son requeridos'); return; }

    const necesitaAcceso = ROLES_CON_ACCESO.includes(form.rol);

    // Validación al CREAR: si aplica acceso, email + password requeridos
    if (!editingId && necesitaAcceso) {
      if (!emailAcceso.trim()) {
        toast.error('Email de acceso al sistema es requerido');
        return;
      }
      if (passwordAcceso.length < 8) {
        toast.error('La contraseña inicial debe tener al menos 8 caracteres');
        return;
      }
    }

    setSaving(true);
    try {
      const aplicaComision = ROLES_CON_COMISION.includes(form.rol);
      // iaHabilitada siempre boolean (nunca undefined) — Firestore rechaza undefined.
      const iaHabilitadaValue = form.iaHabilitada === true;
      const data: Record<string, unknown> = {
        nombre: form.nombre,
        rol: form.rol,
        telefono: form.telefono || '',
        email: form.email || '',
        especialidad: form.especialidad || '',
        zona: form.zona || '',
        horario: form.horario || '',
        color: form.color || '#3b82f6',
        disponibilidad: form.disponibilidad,
        activo: form.activo,
        iaHabilitada: iaHabilitadaValue,
      };
      if (aplicaComision) {
        data.nivel = form.nivel || 'senior';
        data.comisionPorcentaje = typeof form.comisionPorcentaje === 'number'
          ? form.comisionPorcentaje
          : comisionDefaultPorNivel(form.nivel || 'senior');
        data.sueldoBase = typeof form.sueldoBase === 'number' ? form.sueldoBase : 0;
      }
      // Solo técnicos tienen operaria a cargo
      if (form.rol === 'tecnico' && form.operariaId) {
        data.operariaId = form.operariaId;
        data.operariaNombre = form.operariaNombre || '';
      }

      if (editingId) {
        // EDITAR: detectar transición ayudante → rol con acceso
        const personalActual = personal.find(p => p.id === editingId);
        const esTransicionAyudanteAAcceso =
          personalActual?.rol === 'ayudante' &&
          necesitaAcceso &&
          !personalActual.uid;

        if (esTransicionAyudanteAAcceso) {
          if (!emailAcceso.trim() || passwordAcceso.length < 8) {
            toast.error('Debes asignar email y contraseña para crear la cuenta de acceso');
            setSaving(false);
            return;
          }
          // Preservar datos para el flujo de vinculación si el email ya existe
          const usuarioDataParaVincular: Record<string, unknown> = {
            nombre: form.nombre,
            email: emailAcceso.trim().toLowerCase(),
            rol: form.rol,
            telefono: form.telefono || '',
            color: form.color || '#3b82f6',
            activo: true,
            createdAt: Timestamp.now(),
            iaHabilitada: iaHabilitadaValue,
          };
          if (form.rol === 'tecnico') usuarioDataParaVincular.permisos = { ...PERMISOS_DEFAULT_TECNICO };
          const personalDataParaVincular: Record<string, unknown> = { ...data, email: emailAcceso.trim().toLowerCase() };
          if (form.rol === 'tecnico' && !personalActual?.permisos) {
            personalDataParaVincular.permisos = { ...PERMISOS_DEFAULT_TECNICO };
          }

          // Llamada al endpoint serverless (usa Admin SDK, no deslogueya al admin)
          const ok = await crearUsuarioViaEndpoint({
            personalId: editingId,
            onEmailYaExiste: () => {
              setVincularPending({
                personalId: editingId,
                personalData: personalDataParaVincular,
                usuarioData: usuarioDataParaVincular,
              });
              setVincularTarget(personalActual || null);
              setVincularEmail(emailAcceso.trim().toLowerCase());
              setVincularPassword(passwordAcceso);
              setShowVincularModal(true);
            },
          });
          if (!ok) {
            setSaving(false);
            return;
          }
          toast.success(`Acceso creado. Puede iniciar sesión con ${emailAcceso.trim()}`);
        } else {
          // EDIT normal
          // Nota: al bajar de rol a 'ayudante' preservamos el uid — los ayudantes
          // ahora necesitan login para usar el módulo /ponche.
          await updateDoc(doc(db, 'personal', editingId), data);
          if (personalActual?.uid && necesitaAcceso) {
            const usuarioData: Record<string, unknown> = {
              nombre: form.nombre,
              rol: form.rol,
              telefono: form.telefono || '',
              color: form.color || '#3b82f6',
              activo: form.activo,
              iaHabilitada: iaHabilitadaValue,
            };
            if (form.rol === 'tecnico') {
              usuarioData.permisos = personalActual.permisos || PERMISOS_DEFAULT_TECNICO;
            }
            try {
              await setDoc(doc(db, 'usuarios', personalActual.uid), usuarioData, { merge: true });
            } catch (err) {
              console.warn('No se pudo sincronizar usuarios/{uid}:', err);
            }
          }
          toast.success('Personal actualizado');
        }
      } else {
        // CREAR
        if (necesitaAcceso) {
          // Preservar datos para el flujo de vinculación si el email ya existe
          const personalDataParaVincular: Record<string, unknown> = {
            ...data,
            createdAt: Timestamp.now(),
            email: emailAcceso.trim().toLowerCase(),
          };
          if (form.rol === 'tecnico') personalDataParaVincular.permisos = { ...PERMISOS_DEFAULT_TECNICO };

          const usuarioDataParaVincular: Record<string, unknown> = {
            nombre: form.nombre,
            email: emailAcceso.trim().toLowerCase(),
            rol: form.rol,
            telefono: form.telefono || '',
            color: form.color || '#3b82f6',
            activo: true,
            createdAt: Timestamp.now(),
            iaHabilitada: iaHabilitadaValue,
          };
          if (form.rol === 'tecnico') usuarioDataParaVincular.permisos = { ...PERMISOS_DEFAULT_TECNICO };

          // Llamada al endpoint serverless (Admin SDK → no deslogueya al admin)
          const ok = await crearUsuarioViaEndpoint({
            personalId: null,
            onEmailYaExiste: () => {
              setVincularPending({
                personalId: null,
                personalData: personalDataParaVincular,
                usuarioData: usuarioDataParaVincular,
              });
              setVincularTarget(null);
              setVincularEmail(emailAcceso.trim().toLowerCase());
              setVincularPassword(passwordAcceso);
              setShowVincularModal(true);
            },
          });
          if (!ok) {
            setSaving(false);
            return;
          }
          toast.success(`Personal creado. Puede iniciar sesión con ${emailAcceso.trim()}`);
        } else {
          // Ayudante (sin acceso al sistema) → solo crea el doc `personal`
          const personalData: Record<string, unknown> = { ...data, createdAt: Timestamp.now() };
          await addDoc(collection(db, 'personal'), personalData);
          toast.success('Ayudante creado');
        }
      }
      setShowModal(false);
      setEditingId(null);
      resetForm();
    } catch (err) {
      console.error(err);
      toast.error('Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setForm({
      nombre: '', rol: 'tecnico', telefono: '', email: '', especialidad: '', zona: '', horario: '', color: '#3b82f6', disponibilidad: true, activo: true,
      nivel: 'senior', comisionPorcentaje: 10, sueldoBase: 0,
      operariaId: '', operariaNombre: '',
      iaHabilitada: iaHabilitadaDefaultPorRol('tecnico'),
    });
    setEmailAcceso('');
    setPasswordAcceso('');
    setShowPasswordAcceso(false);
    setComisionTocada(false);
  };

  const handleEdit = (p: Personal) => {
    setForm({
      nombre: p.nombre, rol: p.rol, telefono: p.telefono || '', email: p.email || '', especialidad: p.especialidad || '', zona: p.zona || '', horario: p.horario || '', color: p.color || '#3b82f6', disponibilidad: p.disponibilidad, activo: p.activo,
      nivel: p.nivel || 'senior',
      comisionPorcentaje: typeof p.comisionPorcentaje === 'number' ? p.comisionPorcentaje : comisionDefaultPorNivel(p.nivel || 'senior'),
      sueldoBase: typeof p.sueldoBase === 'number' ? p.sueldoBase : 0,
      operariaId: p.operariaId || '',
      operariaNombre: p.operariaNombre || '',
      iaHabilitada: p.iaHabilitada ?? false,
    });
    setEmailAcceso('');
    setPasswordAcceso('');
    // Al editar, considerar el valor actual como "tocado" para no pisarlo al cambiar nivel
    setComisionTocada(true);
    setEditingId(p.id);
    setShowModal(true);
  };

  const abrirResetPassword = (p: Personal) => {
    setResetTarget(p);
    setResetPassword('');
    setShowResetModal(true);
  };

  // Vincula un personal con una cuenta Auth ya existente usando email+password del dueño.
  // Devuelve true si vinculó correctamente, false si no (ya mostró toast de error).
  // @safe-non-tx: SPRINT-134 follow-up (hallazgo P-003 ext, 2026-05-11).
  // Muta personal + usuarios. Refactor pendiente a writeBatch.
  const ejecutarVinculacion = async (
    email: string,
    password: string,
    personalId: string | null,
    personalPatch: Record<string, unknown>,
    usuarioData: Record<string, unknown>,
  ): Promise<boolean> => {
    let secondaryAppRef: ReturnType<typeof initializeApp> | null = null;
    try {
      secondaryAppRef = initializeApp(auth.app.options, 'PersonalLink');
      const secondaryAuth = getAuth(secondaryAppRef);
      const cred = await signInWithEmailAndPassword(secondaryAuth, email, password);
      const uid = cred.user.uid;
      await deleteApp(secondaryAppRef);
      secondaryAppRef = null;

      // Crear/mergear usuarios/{uid}
      try {
        await setDoc(doc(db, 'usuarios', uid), usuarioData, { merge: true });
      } catch (err) {
        console.warn('No se pudo sincronizar usuarios/{uid}:', err);
      }

      // Actualizar personal (update si personalId, addDoc si no)
      if (personalId) {
        await updateDoc(doc(db, 'personal', personalId), { ...personalPatch, uid });
      } else {
        await addDoc(collection(db, 'personal'), { ...personalPatch, uid });
      }
      return true;
    } catch (err: unknown) {
      if (secondaryAppRef) {
        try { await deleteApp(secondaryAppRef); } catch { /* noop */ }
      }
      const code = (err as { code?: string })?.code;
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        toast.error('La contraseña no coincide con la cuenta existente. Pídela al dueño o usa /admin/usuarios → Restablecer contraseña.');
      } else if (code === 'auth/user-not-found') {
        toast.error('No se encontró esa cuenta en Firebase Auth.');
      } else if (code === 'auth/invalid-email') {
        toast.error('Email inválido');
      } else {
        console.error(err);
        toast.error('Error al vincular cuenta');
      }
      return false;
    }
  };

  // Abre el modal de vincular para un personal existente (row-level button)
  const abrirVincularExistente = (p: Personal) => {
    setVincularTarget(p);
    setVincularEmail(p.email || '');
    setVincularPassword('');
    setVincularPending(null); // modo row-level, no hay datos pendientes
    setShowVincularModal(true);
  };

  const cerrarVincularModal = () => {
    setShowVincularModal(false);
    setVincularTarget(null);
    setVincularEmail('');
    setVincularPassword('');
    setVincularPending(null);
    setVincularSaving(false);
  };

  const handleConfirmarVincular = async () => {
    if (!vincularEmail.trim()) { toast.error('Email requerido'); return; }
    if (!vincularPassword) { toast.error('Contraseña requerida'); return; }
    setVincularSaving(true);
    try {
      if (vincularPending) {
        // Flujo disparado desde el form (create o edit-transición)
        const ok = await ejecutarVinculacion(
          vincularEmail.trim().toLowerCase(),
          vincularPassword,
          vincularPending.personalId,
          vincularPending.personalData,
          vincularPending.usuarioData,
        );
        if (ok) {
          toast.success(`Cuenta vinculada. ${vincularTarget?.nombre || 'Personal'} ya puede iniciar sesión.`);
          cerrarVincularModal();
          setShowModal(false);
          setEditingId(null);
          resetForm();
        }
      } else if (vincularTarget) {
        // Flujo row-level: solo vincular a personal existente, sin cambios de rol
        const personalActual = vincularTarget;
        const usuarioData: Record<string, unknown> = {
          nombre: personalActual.nombre,
          email: vincularEmail.trim().toLowerCase(),
          rol: personalActual.rol,
          telefono: personalActual.telefono || '',
          color: personalActual.color || '#3b82f6',
          activo: personalActual.activo,
          createdAt: Timestamp.now(),
          iaHabilitada: personalActual.iaHabilitada === true,
        };
        if (personalActual.rol === 'tecnico') {
          usuarioData.permisos = personalActual.permisos || PERMISOS_DEFAULT_TECNICO;
        }
        const ok = await ejecutarVinculacion(
          vincularEmail.trim().toLowerCase(),
          vincularPassword,
          personalActual.id,
          { email: vincularEmail.trim().toLowerCase() },
          usuarioData,
        );
        if (ok) {
          toast.success(`Cuenta vinculada a ${personalActual.nombre}`);
          cerrarVincularModal();
        }
      }
    } finally {
      setVincularSaving(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resetTarget) return;
    const emailReset = resetTarget.email;
    if (!emailReset) {
      toast.error('Este usuario no tiene email configurado');
      return;
    }
    if (resetPassword && resetPassword.length < 8) {
      toast.error('La contraseña debe tener al menos 8 caracteres');
      return;
    }
    setResetSaving(true);
    try {
      if (resetPassword) {
        // Sin Admin SDK no podemos cambiar password de otro usuario desde cliente.
        // Enviar email de reset como alternativa segura.
        await sendPasswordResetEmail(auth, emailReset);
        toast.success('Se envió un email de restablecimiento a ' + emailReset);
      } else {
        await sendPasswordResetEmail(auth, emailReset);
        toast.success('Email de restablecimiento enviado a ' + emailReset);
      }
      setShowResetModal(false);
      setResetTarget(null);
      setResetPassword('');
    } catch (err) {
      console.error(err);
      toast.error('Error al enviar email de restablecimiento');
    } finally {
      setResetSaving(false);
    }
  };

  const handleNivelChange = (nivel: 'junior' | 'senior') => {
    setForm(f => {
      const nuevaComision = comisionTocada
        ? f.comisionPorcentaje
        : comisionDefaultPorNivel(nivel);
      return { ...f, nivel, comisionPorcentaje: nuevaComision };
    });
  };

  const handleRolChange = (rol: Rol) => {
    setForm(f => {
      // iaHabilitada: en CREACIÓN recalcular según default del rol; en EDICIÓN no tocar.
      const iaHabilitada = editingId ? f.iaHabilitada : iaHabilitadaDefaultPorRol(rol);
      const aplicaComision = ROLES_CON_COMISION.includes(rol);
      if (!aplicaComision) {
        return { ...f, rol, iaHabilitada };
      }
      // Si pasa a un rol con comisión y no hay valor, aplicar default
      return {
        ...f,
        rol,
        iaHabilitada,
        nivel: f.nivel || 'senior',
        comisionPorcentaje: typeof f.comisionPorcentaje === 'number'
          ? f.comisionPorcentaje
          : comisionDefaultPorNivel(f.nivel || 'senior'),
        sueldoBase: typeof f.sueldoBase === 'number' ? f.sueldoBase : 0,
      };
    });
  };

  // ───── Dependencias por rol ─────
  const getOrdenesActivasDeTecnico = (p: Personal): OrdenServicio[] =>
    ordenes.filter(o =>
      (o.tecnicoId === p.id || o.responsableId === p.id) &&
      !['cerrado', 'cancelado'].includes(o.fase)
    );

  const getTecnicosDeOperaria = (p: Personal): Personal[] =>
    personal.filter(t => t.operariaId === p.id && t.activo);

  const getOrdenesActivasDeOperaria = (p: Personal): OrdenServicio[] =>
    ordenes.filter(o =>
      o.operariaId === p.id &&
      !['cerrado', 'cancelado'].includes(o.fase)
    );

  // Destinos válidos para transferir dependencias al eliminar — movido a
  // `components/personal/ModalConfirmarEliminar.tsx` en SPRINT-142b. Acá ya no
  // se usa; el handler `handleConfirmarEliminar` resuelve destinos a partir de
  // `transferDestinoId` directamente.

  // ───── Acciones ─────
  const abrirModalDesactivar = (p: Personal) => {
    setPersonalAccion(p);
    setShowDesactivarModal(true);
  };

  const abrirModalEliminar = (p: Personal) => {
    setPersonalAccion(p);
    setTransferDestinoId('');
    setShowDeleteModal(true);
  };

  const cerrarAcciones = () => {
    setShowDesactivarModal(false);
    setShowDeleteModal(false);
    setPersonalAccion(null);
    setTransferDestinoId('');
    setProcessingAccion(false);
  };

  const handleReactivar = async (p: Personal) => {
    try {
      await updateDoc(doc(db, 'personal', p.id), { activo: true });
      toast.success(`${p.nombre} reactivado`);
    } catch (err) {
      console.error(err);
      toast.error('Error al reactivar');
    }
  };

  const handleConfirmarDesactivar = async () => {
    if (!personalAccion) return;
    setProcessingAccion(true);
    try {
      await updateDoc(doc(db, 'personal', personalAccion.id), { activo: false });
      toast.success('Personal desactivado');
      cerrarAcciones();
    } catch (err) {
      console.error(err);
      toast.error('Error al desactivar');
      setProcessingAccion(false);
    }
  };

  const handleConfirmarEliminar = async () => {
    if (!personalAccion) return;
    const p = personalAccion;
    setProcessingAccion(true);
    try {
      if (p.rol === 'tecnico') {
        const deps = getOrdenesActivasDeTecnico(p);
        if (deps.length > 0) {
          // SPRINT-132: lookup contra (t.uid || t.id) — transferDestinoId ahora se setea
          // desde el dropdown con value={d.uid || d.id} (ver más abajo).
          const destino = personal.find(t => (t.uid || t.id) === transferDestinoId);
          if (!destino) {
            toast.error('Selecciona un técnico destino');
            setProcessingAccion(false);
            return;
          }
          // SPRINT-132 + P-006: persistir auth.uid (no doc id de personal/) en tecnicoId/responsableId.
          // Comparar contra ambos (p.id pre-c4be345 + p.uid post-c4be345) para detectar coincidencia.
          const pIdAuth = p.uid || p.id;
          const destinoIdAuth = destino.uid || destino.id;
          const destinoNombre = destino.nombre;
          // SPRINT-133: writeBatch atomicidad para mutación cross-collection
          // (ordenes_servicio × N + personal × 1). Antes: Promise.all con N updateDoc
          // + 1 deleteDoc → si falla a mitad, queda estado parcial inconsistente.
          // Ahora: batch.commit() atómico hasta 500 ops; chunking si >500 (raro en
          // técnicos, pero guardrail bueno).
          const opsPorBatch = 499; // dejamos 1 op libre para el delete del último chunk
          const chunks: typeof deps[] = [];
          for (let i = 0; i < deps.length; i += opsPorBatch) {
            chunks.push(deps.slice(i, i + opsPorBatch));
          }
          // Si llegamos acá con 500+ órdenes, el técnico tenía un volumen muy alto.
          // Atomicidad parcial: si falla un chunk, los anteriores ya están aplicados.
          // Aceptable porque el flujo de UI ya bloquea con `processingAccion` y el
          // botón confirm es manual (no se dispara solo).
          for (let i = 0; i < chunks.length; i++) {
            const batch = writeBatch(db);
            for (const o of chunks[i]) {
              const updateData: Record<string, unknown> = { updatedAt: Timestamp.now() };
              if (o.tecnicoId === pIdAuth || o.tecnicoId === p.id) {
                updateData.tecnicoId = destinoIdAuth;
                updateData.tecnicoNombre = destinoNombre;
                updateData.operariaId = destino.operariaId || null;
                updateData.operariaNombre = destino.operariaNombre || null;
              }
              if (o.responsableId === pIdAuth || o.responsableId === p.id) {
                updateData.responsableId = destinoIdAuth;
                updateData.responsableNombre = destinoNombre;
              }
              batch.update(doc(db, 'ordenes_servicio', o.id), updateData);
            }
            // El deleteDoc del personal SIEMPRE va al final (último chunk).
            if (i === chunks.length - 1) {
              batch.delete(doc(db, 'personal', p.id));
            }
            await batch.commit();
          }
          toast.success(`Técnico eliminado. ${deps.length} orden(es) transferida(s) a ${destino.nombre}`);
        } else {
          await deleteDoc(doc(db, 'personal', p.id));
          toast.success('Técnico eliminado');
        }
      } else if (p.rol === 'operaria') {
        const tecs = getTecnicosDeOperaria(p);
        const ords = getOrdenesActivasDeOperaria(p);
        if (tecs.length > 0 || ords.length > 0) {
          // SPRINT-132: lookup contra (o.uid || o.id) — transferDestinoId proviene del dropdown
          // con value={d.uid || d.id}.
          const destino = personal.find(o => (o.uid || o.id) === transferDestinoId);
          if (!destino) {
            toast.error('Selecciona una operaria destino');
            setProcessingAccion(false);
            return;
          }
          // SPRINT-133: writeBatch atomicidad. Mutación cross-collection
          // (personal × tecs.length para reasignar operaria de cada técnico,
          // + ordenes_servicio × ords.length, + personal × 1 para el delete final).
          // Total ops = tecs.length + ords.length + 1. Si >500, chunking secuencial.
          // Orden de operaciones dentro del batch: 1) updates a ordenes_servicio,
          // 2) updates a personal (técnicos), 3) deleteDoc personal (operaria, al
          // final del último chunk).
          type OpItem =
            | { kind: 'orden'; o: typeof ords[number] }
            | { kind: 'tecnico'; t: typeof tecs[number] };
          const allOps: OpItem[] = [
            ...ords.map((o) => ({ kind: 'orden' as const, o })),
            ...tecs.map((t) => ({ kind: 'tecnico' as const, t })),
          ];
          const opsPorBatch = 499;
          const chunks: OpItem[][] = [];
          for (let i = 0; i < allOps.length; i += opsPorBatch) {
            chunks.push(allOps.slice(i, i + opsPorBatch));
          }
          // Si no hay ops cross (tecs.length + ords.length === 0 no entra acá, ya cubierto
          // por la rama else de abajo), siempre necesitamos al menos 1 chunk para el delete.
          if (chunks.length === 0) chunks.push([]);
          for (let i = 0; i < chunks.length; i++) {
            const batch = writeBatch(db);
            for (const item of chunks[i]) {
              if (item.kind === 'orden') {
                batch.update(doc(db, 'ordenes_servicio', item.o.id), {
                  operariaId: destino.id,
                  operariaNombre: destino.nombre,
                  updatedAt: Timestamp.now(),
                });
              } else {
                batch.update(doc(db, 'personal', item.t.id), {
                  operariaId: destino.id,
                  operariaNombre: destino.nombre,
                });
              }
            }
            if (i === chunks.length - 1) {
              batch.delete(doc(db, 'personal', p.id));
            }
            await batch.commit();
          }
          toast.success(`Operaria eliminada. ${tecs.length} técnico(s) y ${ords.length} orden(es) transferidos a ${destino.nombre}`);
        } else {
          await deleteDoc(doc(db, 'personal', p.id));
          toast.success('Operaria eliminada');
        }
      } else if (p.rol === 'administrador') {
        const adminsActivosSinEste = personal.filter(
          x => x.rol === 'administrador' && x.activo && x.id !== p.id
        );
        if (p.activo && adminsActivosSinEste.length === 0) {
          toast.error('No puedes eliminar el último administrador del sistema');
          setProcessingAccion(false);
          return;
        }
        await deleteDoc(doc(db, 'personal', p.id));
        toast.success('Administrador eliminado');
      } else {
        // secretaria
        await deleteDoc(doc(db, 'personal', p.id));
        toast.success('Secretaria eliminada');
      }
      cerrarAcciones();
    } catch (err) {
      console.error(err);
      toast.error('Error al eliminar');
      setProcessingAccion(false);
    }
  };

  if (loading) return <LoadingSpinner fullPage text="Cargando personal..." />;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#0f3460]">Personal</h1>
        {puedeCrearPersonal && (
          <button onClick={() => { resetForm(); setEditingId(null); setShowModal(true); }}
            className="flex items-center gap-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">
            <Plus size={18} /> Agregar
          </button>
        )}
      </div>

      {/* Banner de migración: personal con rol de acceso pero sin uid vinculado */}
      {(() => {
        const sinAcceso = personal.filter(
          p => p.activo && p.rol !== 'ayudante' && ROLES_CON_ACCESO.includes(p.rol) && !p.uid
        );
        if (sinAcceso.length === 0) return null;
        return (
          <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 flex items-start gap-2 text-sm text-amber-900">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>
              {sinAcceso.length} miembro(s) del personal con rol de acceso no tienen cuenta de login.
              Edítalos para crear su cuenta.
            </span>
          </div>
        );
      })()}

      {/* SPRINT-142c (2026-05-11): bloque "Grupos operaria-técnico" extraído a componente puro.
          Plan de rollback: revertir el commit. El componente vuelve a vivir inline acá. */}
      {esAdmin && <GruposOperariaTecnico personal={personal} />}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Nombre</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Rol</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 hidden md:table-cell">Teléfono</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 hidden md:table-cell">Email</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 hidden lg:table-cell">Especialidad</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 hidden lg:table-cell">Zona</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Estado</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {agruparPorRol(personal.filter(p => p.activo)).map(grupo => (
                <Fragment key={grupo.rol}>
                  <tr className="bg-[#0f3460]/5 border-t border-b border-[#0f3460]/10">
                    <td colSpan={8} className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{grupo.icono}</span>
                        <h3 className="text-sm font-semibold text-[#0f3460]">
                          {grupo.label}
                        </h3>
                        <span className="ml-auto text-xs text-gray-600 bg-white border border-gray-200 px-2 py-0.5 rounded-full">
                          {grupo.items.length}
                        </span>
                      </div>
                    </td>
                  </tr>
                  {grupo.items.map(p => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: p.color || '#0f3460' }}>
                            {p.nombre.split(' ').map(n => n[0]).join('').slice(0, 2)}
                          </div>
                          <span className="text-sm font-medium text-gray-900">{p.nombre}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full w-fit ${ROL_COLORS[p.rol]}`}>
                            {ROL_LABELS[p.rol]}
                          </span>
                          {ROLES_CON_COMISION.includes(p.rol) && p.nivel && (
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 w-fit">
                              {p.nivel === 'senior' ? 'Senior' : 'Junior'} · {typeof p.comisionPorcentaje === 'number' ? p.comisionPorcentaje : comisionDefaultPorNivel(p.nivel)}%
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 hidden md:table-cell">{p.telefono ? formatTelefono(p.telefono) : '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 hidden md:table-cell">{p.email || '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-600 hidden lg:table-cell">{p.especialidad || '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-600 hidden lg:table-cell">{p.zona || '—'}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-green-100 text-green-700">
                          <Check size={10} /> Activo
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {puedeModificarPersonal && (
                            <button onClick={() => handleEdit(p)} title="Editar"
                              className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors">
                              <Edit size={14} />
                            </button>
                          )}
                          {puedeModificarPersonal && p.rol !== 'ayudante' && ROLES_CON_ACCESO.includes(p.rol) && !p.uid && p.email && (
                            <button onClick={() => abrirVincularExistente(p)} title="Vincular cuenta existente"
                              className="p-2 hover:bg-indigo-50 rounded-lg text-indigo-600 transition-colors">
                              <Link2 size={14} />
                            </button>
                          )}
                          {puedeEliminarPersonal && (
                            <button onClick={() => abrirModalDesactivar(p)} title="Desactivar"
                              className="p-2 hover:bg-amber-50 rounded-lg text-amber-600 transition-colors">
                              <Power size={14} />
                            </button>
                          )}
                          {puedeEliminarPersonal && (
                            <button onClick={() => abrirModalEliminar(p)} title="Eliminar"
                              className="p-2 hover:bg-red-50 rounded-lg text-red-500 transition-colors">
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sección Personal inactivo */}
      {(() => {
        const inactivos = personal.filter(p => !p.activo);
        if (inactivos.length === 0) return null;
        return (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <button
              type="button"
              onClick={() => setMostrarInactivos(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                {mostrarInactivos ? <ChevronDown size={16} className="text-gray-500" /> : <ChevronRight size={16} className="text-gray-500" />}
                <span className="text-sm font-semibold text-gray-700">Personal inactivo ({inactivos.length})</span>
              </div>
            </button>
            {mostrarInactivos && (
              <div className="overflow-x-auto border-t border-gray-100">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Nombre</th>
                      <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Rol</th>
                      <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 hidden md:table-cell">Teléfono</th>
                      <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 hidden md:table-cell">Email</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {agruparPorRol(inactivos).map(grupo => (
                      <Fragment key={grupo.rol}>
                        <tr className="bg-gray-100/60 border-t border-b border-gray-200">
                          <td colSpan={5} className="px-4 py-2">
                            <div className="flex items-center gap-2">
                              <span className="text-base">{grupo.icono}</span>
                              <h3 className="text-xs font-semibold text-gray-700">
                                {grupo.label}
                              </h3>
                              <span className="ml-auto text-[11px] text-gray-600 bg-white border border-gray-200 px-2 py-0.5 rounded-full">
                                {grupo.items.length}
                              </span>
                            </div>
                          </td>
                        </tr>
                        {grupo.items.map(p => (
                          <tr key={p.id} className="opacity-60 hover:bg-gray-50 hover:opacity-80 transition-opacity">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: p.color || '#0f3460' }}>
                                  {p.nombre.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                </div>
                                <span className="text-sm font-medium text-gray-900">{p.nombre}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ROL_COLORS[p.rol]}`}>
                                {ROL_LABELS[p.rol]}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600 hidden md:table-cell">{p.telefono ? formatTelefono(p.telefono) : '—'}</td>
                            <td className="px-4 py-3 text-sm text-gray-600 hidden md:table-cell">{p.email || '—'}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-1">
                                {puedeModificarPersonal && (
                                  <button onClick={() => handleReactivar(p)} title="Reactivar"
                                    className="p-2 hover:bg-green-50 rounded-lg text-green-600 transition-colors">
                                    <RotateCcw size={14} />
                                  </button>
                                )}
                                {puedeEliminarPersonal && (
                                  <button onClick={() => abrirModalEliminar(p)} title="Eliminar"
                                    className="p-2 hover:bg-red-50 rounded-lg text-red-500 transition-colors">
                                    <Trash2 size={14} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })()}

      <Modal isOpen={showModal} onClose={() => { setShowModal(false); setEditingId(null); resetForm(); }}
        title={editingId ? 'Editar Personal' : 'Agregar Personal'}>
        <FormAltaEditarEmpleado
          form={form}
          setForm={setForm}
          editingId={editingId}
          personal={personal}
          operariasDisponibles={operariasDisponibles}
          emailAcceso={emailAcceso}
          setEmailAcceso={setEmailAcceso}
          passwordAcceso={passwordAcceso}
          setPasswordAcceso={setPasswordAcceso}
          showPasswordAcceso={showPasswordAcceso}
          setShowPasswordAcceso={setShowPasswordAcceso}
          setComisionTocada={setComisionTocada}
          saving={saving}
          onSubmit={handleSubmit}
          onCancel={() => { setShowModal(false); setEditingId(null); resetForm(); }}
          onRolChange={handleRolChange}
          onNivelChange={handleNivelChange}
          onAbrirResetPassword={abrirResetPassword}
          onAbrirVincularExistente={abrirVincularExistente}
        />
      </Modal>

      {/* Modal Desactivar */}
      <Modal
        isOpen={showDesactivarModal}
        onClose={cerrarAcciones}
        title={personalAccion ? `Desactivar ${personalAccion.nombre}` : 'Desactivar'}
      >
        {personalAccion && (() => {
          const p = personalAccion;
          const ordenesActivas =
            p.rol === 'tecnico' ? getOrdenesActivasDeTecnico(p) :
            p.rol === 'operaria' ? getOrdenesActivasDeOperaria(p) : [];
          return (
            <div className="space-y-4">
              <p className="text-sm text-gray-700">
                El personal desactivado no aparecerá en dropdowns de asignación. Sus órdenes
                históricas se conservan. Puedes reactivarlo cuando quieras.
              </p>
              {ordenesActivas.length > 0 && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <AlertTriangle size={14} className="text-amber-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-800">
                    Tiene {ordenesActivas.length} orden(es) activa(s). Considera eliminarlo
                    en vez de desactivarlo si quieres transferir sus órdenes a otra persona.
                  </p>
                </div>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={cerrarAcciones} disabled={processingAccion}
                  className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-60">
                  Cancelar
                </button>
                <button type="button" onClick={handleConfirmarDesactivar} disabled={processingAccion}
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium disabled:opacity-60">
                  {processingAccion ? 'Desactivando...' : 'Confirmar desactivación'}
                </button>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* Modal Eliminar con transferencia — SPRINT-142b (2026-05-11):
          JSX extraído a ModalConfirmarEliminar. handleConfirmarEliminar (con writeBatch +
          chunking, fijado en SPRINT-133 commit `15cab52`) PERMANECE en PersonalPage y se
          pasa como callback. Helpers locales (`destinosTransferencia`, etc.) replicados
          dentro del componente extraído porque siguen usándose acá para `handleConfirmarEliminar`
          y el modal de Desactivar; la consolidación a utils queda para SPRINT-142d.
          Plan de rollback: revertir el commit. Modal vuelve inline. */}
      <ModalConfirmarEliminar
        isOpen={showDeleteModal}
        onClose={cerrarAcciones}
        personalAccion={personalAccion}
        personal={personal}
        ordenes={ordenes}
        transferDestinoId={transferDestinoId}
        setTransferDestinoId={setTransferDestinoId}
        processingAccion={processingAccion}
        onConfirmar={handleConfirmarEliminar}
      />

      {/* Modal Reset Password */}
      <Modal
        isOpen={showResetModal}
        onClose={() => { setShowResetModal(false); setResetTarget(null); setResetPassword(''); }}
        title={resetTarget ? `Restablecer contraseña de ${resetTarget.nombre}` : 'Restablecer contraseña'}
      >
        {resetTarget && (
          <div className="space-y-4">
            <p className="text-sm text-gray-700">
              Se enviará un email de restablecimiento a <span className="font-medium">{resetTarget.email}</span>.
              El usuario debe seguir el enlace en el email para elegir una nueva contraseña.
            </p>
            <p className="text-[11px] text-gray-500">
              El cambio directo de contraseña desde el panel requiere un backend con Admin SDK.
              Por ahora, se usa el flujo seguro de "email de restablecimiento" de Firebase.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => { setShowResetModal(false); setResetTarget(null); setResetPassword(''); }}
                disabled={resetSaving}
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleResetPassword}
                disabled={resetSaving}
                className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium disabled:opacity-60"
              >
                {resetSaving ? 'Enviando...' : 'Enviar email de restablecimiento'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Vincular cuenta Auth existente */}
      <Modal
        isOpen={showVincularModal}
        onClose={cerrarVincularModal}
        title={vincularTarget ? `Vincular ${vincularTarget.nombre} a su cuenta de Firebase Auth` : 'Vincular cuenta existente'}
      >
        <div className="space-y-4">
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-xs text-indigo-900">
            {vincularPending
              ? 'El email ingresado ya tiene cuenta en Firebase Auth. Confirma la contraseña para vincular este personal a esa cuenta existente. La contraseña que escribiste NO se reemplazará — se usará la que ya tiene la cuenta.'
              : 'Ingresa el email y la contraseña actual de la cuenta de Firebase Auth existente para vincularla a este personal.'}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Email de la cuenta</label>
            <input
              type="email"
              value={vincularEmail}
              onChange={e => setVincularEmail(e.target.value)}
              placeholder="usuario@misterservicerd.com"
              disabled={!!vincularPending}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8] disabled:bg-gray-50"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Contraseña actual de esa cuenta</label>
            <input
              type="password"
              value={vincularPassword}
              onChange={e => setVincularPassword(e.target.value)}
              placeholder="Contraseña que ya tiene la cuenta"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Si no la sabes, ve a Gestión de Accesos y envía un email de restablecimiento al dueño.
            </p>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={cerrarVincularModal} disabled={vincularSaving}
              className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-60">
              Cancelar
            </button>
            <button type="button" onClick={handleConfirmarVincular} disabled={vincularSaving}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium disabled:opacity-60 inline-flex items-center gap-2">
              <Link2 size={14} />
              {vincularSaving ? 'Vinculando...' : 'Vincular cuenta'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
