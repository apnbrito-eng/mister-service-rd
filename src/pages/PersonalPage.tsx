import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, setDoc, Timestamp, query, orderBy } from 'firebase/firestore';
import { createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { db, auth } from '../firebase/config';
import { Personal, Rol, OrdenServicio, ROLES_CON_ACCESO, PERMISOS_DEFAULT_TECNICO } from '../types';
import { formatTelefono, parseOrden } from '../utils';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';
import { Plus, Edit, Check, X, Users, Power, Trash2, RotateCcw, ChevronDown, ChevronRight, AlertTriangle, Key, Eye, EyeOff, Link2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useApp } from '../context/AppContext';

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
// Orden del select de rol en el formulario
const ROL_SELECT_ORDEN: Rol[] = ['administrador', 'coordinadora', 'operaria', 'secretaria', 'tecnico', 'ayudante'];

function comisionDefaultPorNivel(nivel: 'junior' | 'senior'): number {
  return nivel === 'senior' ? 10 : 8;
}

export default function PersonalPage() {
  const { userProfile } = useApp();
  const esAdmin = userProfile?.rol === 'administrador' || userProfile?.rol === 'coordinadora';
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
          // Intentar crear la cuenta Auth; si el email ya existe, ofrecer vincular
          const usuarioData: Record<string, unknown> = {
            nombre: form.nombre,
            email: emailAcceso.trim().toLowerCase(),
            rol: form.rol,
            telefono: form.telefono || '',
            color: form.color || '#3b82f6',
            activo: true,
            createdAt: Timestamp.now(),
          };
          if (form.rol === 'tecnico') usuarioData.permisos = { ...PERMISOS_DEFAULT_TECNICO };
          data.email = emailAcceso.trim().toLowerCase();
          if (form.rol === 'tecnico' && !personalActual?.permisos) {
            data.permisos = { ...PERMISOS_DEFAULT_TECNICO };
          }

          let createdUid: string | null = null;
          try {
            const secondaryApp = initializeApp(auth.app.options, 'PersonalSecondary');
            const secondaryAuth = getAuth(secondaryApp);
            const cred = await createUserWithEmailAndPassword(
              secondaryAuth,
              emailAcceso.trim().toLowerCase(),
              passwordAcceso
            );
            createdUid = cred.user.uid;
            await deleteApp(secondaryApp);
          } catch (authErr: unknown) {
            const errCode = (authErr as { code?: string })?.code;
            if (errCode === 'auth/email-already-in-use') {
              // Abrir flujo de vinculación y preservar datos pendientes
              setVincularPending({
                personalId: editingId,
                personalData: data,
                usuarioData,
              });
              setVincularTarget(personalActual || null);
              setVincularEmail(emailAcceso.trim().toLowerCase());
              setVincularPassword(passwordAcceso);
              setShowVincularModal(true);
              setSaving(false);
              return;
            }
            if (errCode === 'auth/weak-password') { toast.error('Contraseña demasiado débil'); setSaving(false); return; }
            if (errCode === 'auth/invalid-email') { toast.error('Email de acceso inválido'); setSaving(false); return; }
            console.error('Error creando cuenta Auth:', authErr);
            toast.error('Error al crear la cuenta de acceso');
            setSaving(false);
            return;
          }
          if (createdUid) {
            try {
              await setDoc(doc(db, 'usuarios', createdUid), usuarioData);
            } catch (err) { console.warn('No se pudo crear usuarios/{uid}:', err); }
            data.uid = createdUid;
          }
          await updateDoc(doc(db, 'personal', editingId), data);
          toast.success(`Acceso creado. Puede iniciar sesión con ${emailAcceso.trim()}`);
        } else {
          // EDIT normal
          if (personalActual && personalActual.rol !== 'ayudante' && form.rol === 'ayudante' && personalActual.uid) {
            // rol con acceso → ayudante: desvincular uid (no borramos Auth)
            data.uid = null;
          }
          await updateDoc(doc(db, 'personal', editingId), data);
          if (personalActual?.uid && necesitaAcceso) {
            const usuarioData: Record<string, unknown> = {
              nombre: form.nombre,
              rol: form.rol,
              telefono: form.telefono || '',
              color: form.color || '#3b82f6',
              activo: form.activo,
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
        // CREAR: si necesita acceso, crear auth + usuarios doc + personal doc con uid
        let createdUid: string | null = null;
        const personalData: Record<string, unknown> = { ...data, createdAt: Timestamp.now() };
        if (form.rol === 'tecnico') personalData.permisos = { ...PERMISOS_DEFAULT_TECNICO };
        // Retrocompat: guardar email de acceso también en personal.email
        if (necesitaAcceso) personalData.email = emailAcceso.trim().toLowerCase();

        const usuarioData: Record<string, unknown> = {
          nombre: form.nombre,
          email: necesitaAcceso ? emailAcceso.trim().toLowerCase() : '',
          rol: form.rol,
          telefono: form.telefono || '',
          color: form.color || '#3b82f6',
          activo: true,
          createdAt: Timestamp.now(),
        };
        if (form.rol === 'tecnico') usuarioData.permisos = { ...PERMISOS_DEFAULT_TECNICO };

        if (necesitaAcceso) {
          try {
            const secondaryApp = initializeApp(auth.app.options, 'PersonalSecondary');
            const secondaryAuth = getAuth(secondaryApp);
            const cred = await createUserWithEmailAndPassword(
              secondaryAuth,
              emailAcceso.trim().toLowerCase(),
              passwordAcceso
            );
            createdUid = cred.user.uid;
            await deleteApp(secondaryApp);
          } catch (authErr: unknown) {
            const errCode = (authErr as { code?: string })?.code;
            if (errCode === 'auth/email-already-in-use') {
              // Disparar flujo de vinculación con cuenta existente
              setVincularPending({
                personalId: null,
                personalData,
                usuarioData,
              });
              setVincularTarget(null);
              setVincularEmail(emailAcceso.trim().toLowerCase());
              setVincularPassword(passwordAcceso);
              setShowVincularModal(true);
              setSaving(false);
              return;
            }
            if (errCode === 'auth/weak-password') { toast.error('Contraseña demasiado débil'); setSaving(false); return; }
            if (errCode === 'auth/invalid-email') { toast.error('Email de acceso inválido'); setSaving(false); return; }
            console.error('Error creando cuenta Auth:', authErr);
            toast.error('Error al crear la cuenta de acceso');
            setSaving(false);
            return;
          }
        }

        if (createdUid) {
          try {
            await setDoc(doc(db, 'usuarios', createdUid), usuarioData);
          } catch (err) { console.warn('No se pudo crear usuarios/{uid}:', err); }
          personalData.uid = createdUid;
        }

        await addDoc(collection(db, 'personal'), personalData);
        if (necesitaAcceso) {
          toast.success(`Personal creado. Puede iniciar sesión con ${emailAcceso.trim()}`);
        } else {
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
      const aplicaComision = ROLES_CON_COMISION.includes(rol);
      if (!aplicaComision) {
        return { ...f, rol };
      }
      // Si pasa a un rol con comisión y no hay valor, aplicar default
      return {
        ...f,
        rol,
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

  // Destinos válidos para transferir dependencias al eliminar
  const destinosTransferencia = (p: Personal): Personal[] => {
    if (p.rol === 'tecnico') {
      return personal.filter(t => t.rol === 'tecnico' && t.activo && t.id !== p.id);
    }
    if (p.rol === 'operaria') {
      return personal.filter(o => o.rol === 'operaria' && o.activo && o.id !== p.id);
    }
    return [];
  };

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
          const destino = personal.find(t => t.id === transferDestinoId);
          if (!destino) {
            toast.error('Selecciona un técnico destino');
            setProcessingAccion(false);
            return;
          }
          const tareas = deps.map(async (o) => {
            const updateData: Record<string, unknown> = { updatedAt: Timestamp.now() };
            if (o.tecnicoId === p.id) {
              updateData.tecnicoId = destino.id;
              updateData.tecnicoNombre = destino.nombre;
              updateData.operariaId = destino.operariaId || null;
              updateData.operariaNombre = destino.operariaNombre || null;
            }
            if (o.responsableId === p.id) {
              updateData.responsableId = destino.id;
              updateData.responsableNombre = destino.nombre;
            }
            try {
              await updateDoc(doc(db, 'ordenes_servicio', o.id), updateData);
            } catch (err) {
              console.error('Error transfiriendo orden', o.id, err);
            }
          });
          await Promise.all(tareas);
          await deleteDoc(doc(db, 'personal', p.id));
          toast.success(`Técnico eliminado. ${deps.length} orden(es) transferida(s) a ${destino.nombre}`);
        } else {
          await deleteDoc(doc(db, 'personal', p.id));
          toast.success('Técnico eliminado');
        }
      } else if (p.rol === 'operaria') {
        const tecs = getTecnicosDeOperaria(p);
        const ords = getOrdenesActivasDeOperaria(p);
        if (tecs.length > 0 || ords.length > 0) {
          const destino = personal.find(o => o.id === transferDestinoId);
          if (!destino) {
            toast.error('Selecciona una operaria destino');
            setProcessingAccion(false);
            return;
          }
          const tareasTecs = tecs.map(async (t) => {
            try {
              await updateDoc(doc(db, 'personal', t.id), {
                operariaId: destino.id,
                operariaNombre: destino.nombre,
              });
            } catch (err) {
              console.error('Error transfiriendo técnico', t.id, err);
            }
          });
          const tareasOrds = ords.map(async (o) => {
            try {
              await updateDoc(doc(db, 'ordenes_servicio', o.id), {
                operariaId: destino.id,
                operariaNombre: destino.nombre,
                updatedAt: Timestamp.now(),
              });
            } catch (err) {
              console.error('Error transfiriendo orden', o.id, err);
            }
          });
          await Promise.all([...tareasTecs, ...tareasOrds]);
          await deleteDoc(doc(db, 'personal', p.id));
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
        <button onClick={() => { resetForm(); setEditingId(null); setShowModal(true); }}
          className="flex items-center gap-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">
          <Plus size={18} /> Agregar
        </button>
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

      {esAdmin && (() => {
        const tecnicos = personal.filter(p => p.rol === 'tecnico' && p.activo);
        const operarias = personal.filter(p => (p.rol === 'operaria' || p.rol === 'coordinadora' || p.rol === 'administrador') && p.activo);
        const operariasConTecnicos = operarias
          .map(op => ({
            operaria: op,
            tecnicos: tecnicos.filter(t => t.operariaId === op.id),
          }))
          .filter(g => g.tecnicos.length > 0);
        const tecnicosSinAsignar = tecnicos.filter(t => !t.operariaId);
        const hayGrupos = operariasConTecnicos.length > 0 || tecnicosSinAsignar.length > 0;

        if (!hayGrupos) return null;

        return (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Users size={18} className="text-[#1a5fa8]" />
              <h2 className="text-lg font-semibold text-[#0f3460]">Grupos operaria-técnico</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {operariasConTecnicos.map(({ operaria, tecnicos: tecs }) => (
                <div key={operaria.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                      style={{ backgroundColor: operaria.color || '#0f3460' }}
                    >
                      {operaria.nombre.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{operaria.nombre}</p>
                      <p className="text-[10px] text-gray-500">{ROL_LABELS[operaria.rol]} · {tecs.length} técnico{tecs.length !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {tecs.map(t => (
                      <span
                        key={t.id}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium"
                        style={{
                          backgroundColor: `${t.color || '#3b82f6'}22`,
                          color: t.color || '#3b82f6',
                        }}
                      >
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color || '#3b82f6' }} />
                        {t.nombre}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              {tecnicosSinAsignar.length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm border-2 border-dashed border-amber-200 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 text-xs font-bold">?</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-amber-900">Sin asignar</p>
                      <p className="text-[10px] text-amber-700">{tecnicosSinAsignar.length} técnico{tecnicosSinAsignar.length !== 1 ? 's' : ''} sin operaria</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {tecnicosSinAsignar.map(t => (
                      <span
                        key={t.id}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium bg-gray-100 text-gray-700"
                      >
                        {t.nombre}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

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
              {personal.filter(p => p.activo).map(p => (
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
                      <button onClick={() => handleEdit(p)} title="Editar"
                        className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors">
                        <Edit size={14} />
                      </button>
                      {p.rol !== 'ayudante' && ROLES_CON_ACCESO.includes(p.rol) && !p.uid && p.email && (
                        <button onClick={() => abrirVincularExistente(p)} title="Vincular cuenta existente"
                          className="p-2 hover:bg-indigo-50 rounded-lg text-indigo-600 transition-colors">
                          <Link2 size={14} />
                        </button>
                      )}
                      <button onClick={() => abrirModalDesactivar(p)} title="Desactivar"
                        className="p-2 hover:bg-amber-50 rounded-lg text-amber-600 transition-colors">
                        <Power size={14} />
                      </button>
                      <button onClick={() => abrirModalEliminar(p)} title="Eliminar"
                        className="p-2 hover:bg-red-50 rounded-lg text-red-500 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
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
                    {inactivos.map(p => (
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
                            <button onClick={() => handleReactivar(p)} title="Reactivar"
                              className="p-2 hover:bg-green-50 rounded-lg text-green-600 transition-colors">
                              <RotateCcw size={14} />
                            </button>
                            <button onClick={() => abrirModalEliminar(p)} title="Eliminar"
                              className="p-2 hover:bg-red-50 rounded-lg text-red-500 transition-colors">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
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
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
            <input type="text" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Rol *</label>
            <select value={form.rol} onChange={e => handleRolChange(e.target.value as Rol)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]">
              {ROL_SELECT_ORDEN.map(r => <option key={r} value={r}>{ROL_LABELS[r]}</option>)}
            </select>
            <p className="text-[11px] text-gray-400 mt-1">
              {form.rol === 'ayudante'
                ? 'Los ayudantes NO tienen cuenta de acceso al sistema.'
                : 'Este rol tiene acceso al sistema — se creará una cuenta de login.'}
            </p>
          </div>

          {/* Sección Acceso al sistema — solo para roles con login */}
          {ROLES_CON_ACCESO.includes(form.rol) && (
            <div className="bg-blue-50/40 border border-blue-100 rounded-lg p-3 space-y-3">
              <div className="flex items-center gap-2">
                <Key size={14} className="text-[#1a5fa8]" />
                <h3 className="text-xs font-semibold text-[#0f3460] uppercase tracking-wide">Acceso al sistema</h3>
              </div>
              {(() => {
                const personalActual = editingId ? personal.find(p => p.id === editingId) : null;
                const tieneAcceso = !!personalActual?.uid;
                const esTransicionAyudante =
                  !!personalActual &&
                  personalActual.rol === 'ayudante' &&
                  ROLES_CON_ACCESO.includes(form.rol);
                const pedirCredenciales = !editingId || esTransicionAyudante;

                if (tieneAcceso && personalActual) {
                  return (
                    <div className="space-y-2">
                      <p className="text-xs text-gray-600">
                        Email de login: <span className="font-medium">{personalActual.email || '—'}</span>
                      </p>
                      <button
                        type="button"
                        onClick={() => abrirResetPassword(personalActual)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors"
                      >
                        <Key size={12} /> Restablecer contraseña
                      </button>
                    </div>
                  );
                }

                if (editingId && !pedirCredenciales) {
                  return (
                    <div className="space-y-2">
                      <p className="text-xs text-amber-800">
                        Este personal aún no tiene cuenta de login.
                      </p>
                      {personalActual && (
                        <button
                          type="button"
                          onClick={() => abrirVincularExistente(personalActual)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
                        >
                          <Link2 size={12} /> Vincular cuenta existente
                        </button>
                      )}
                    </div>
                  );
                }

                // pedirCredenciales === true (create, o transición ayudante → acceso)
                return (
                  <>
                    {esTransicionAyudante && (
                      <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
                        Cambio de rol detectado: ayudante → {ROL_LABELS[form.rol]}. Debes asignar email y contraseña para crear la cuenta de acceso.
                      </p>
                    )}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Email de acceso al sistema *</label>
                      <input
                        type="email"
                        value={emailAcceso}
                        onChange={e => setEmailAcceso(e.target.value)}
                        placeholder="usuario@misterservicerd.com"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
                      />
                      <p className="text-[11px] text-gray-400 mt-1">Este email es distinto al email de contacto. Se usará para iniciar sesión.</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Contraseña inicial *</label>
                      <div className="relative">
                        <input
                          type={showPasswordAcceso ? 'text' : 'password'}
                          value={passwordAcceso}
                          onChange={e => setPasswordAcceso(e.target.value)}
                          placeholder="Mínimo 8 caracteres"
                          minLength={8}
                          className="w-full px-3 py-2 pr-10 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPasswordAcceso(v => !v)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                        >
                          {showPasswordAcceso ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          {form.rol === 'tecnico' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Operaria a cargo</label>
              <select
                value={form.operariaId || ''}
                onChange={e => {
                  const op = operariasDisponibles.find(o => o.id === e.target.value);
                  setForm(f => ({
                    ...f,
                    operariaId: e.target.value,
                    operariaNombre: op?.nombre || '',
                  }));
                }}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
              >
                <option value="">Sin asignar</option>
                {operariasDisponibles.map(op => (
                  <option key={op.id} value={op.id}>
                    {op.nombre} ({ROL_LABELS[op.rol]})
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-gray-400 mt-1">
                La operaria de las órdenes se asignará automáticamente según este técnico.
              </p>
            </div>
          )}

          {ROLES_CON_COMISION.includes(form.rol) && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-indigo-50/40 border border-indigo-100 rounded-lg p-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Nivel</label>
                <select
                  value={form.nivel || 'senior'}
                  onChange={e => handleNivelChange(e.target.value as 'junior' | 'senior')}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
                >
                  <option value="senior">Senior</option>
                  <option value="junior">Junior</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Comisión (%)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={form.comisionPorcentaje ?? ''}
                  onChange={e => {
                    setComisionTocada(true);
                    const val = e.target.value === '' ? undefined : Number(e.target.value);
                    setForm(f => ({ ...f, comisionPorcentaje: val }));
                  }}
                  placeholder="10"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Sueldo base (RD$)</label>
                <input
                  type="number"
                  min={0}
                  step={100}
                  value={form.sueldoBase ?? ''}
                  onChange={e => {
                    const val = e.target.value === '' ? 0 : Number(e.target.value);
                    setForm(f => ({ ...f, sueldoBase: val }));
                  }}
                  placeholder="25000"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
                />
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
              <input type="tel" value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Especialidad</label>
              <input type="text" value={form.especialidad} onChange={e => setForm(f => ({ ...f, especialidad: e.target.value }))}
                placeholder="Ej: Refrigeración, Lavadoras..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Zona</label>
              <input type="text" value={form.zona} onChange={e => setForm(f => ({ ...f, zona: e.target.value }))}
                placeholder="Ej: Santo Domingo, DN..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Horario</label>
              <input type="text" value={form.horario} onChange={e => setForm(f => ({ ...f, horario: e.target.value }))}
                placeholder="Ej: 8:00 AM - 5:00 PM"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Color en mapa</label>
              <input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                className="w-full h-10 border border-gray-200 rounded-lg cursor-pointer" />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.disponibilidad} onChange={e => setForm(f => ({ ...f, disponibilidad: e.target.checked }))}
                className="rounded border-gray-300 text-[#1a5fa8] focus:ring-[#1a5fa8]" />
              Disponible
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.activo} onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))}
                className="rounded border-gray-300 text-[#1a5fa8] focus:ring-[#1a5fa8]" />
              Activo
            </label>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => { setShowModal(false); setEditingId(null); resetForm(); }}
              className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg">Cancelar</button>
            <button type="submit" disabled={saving}
              className="px-6 py-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-lg text-sm font-medium disabled:opacity-60">
              {saving ? 'Guardando...' : editingId ? 'Actualizar' : 'Crear'}
            </button>
          </div>
        </form>
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

      {/* Modal Eliminar con transferencia */}
      <Modal
        isOpen={showDeleteModal}
        onClose={cerrarAcciones}
        title={personalAccion ? `Eliminar ${ROL_LABELS[personalAccion.rol].toLowerCase()}: ${personalAccion.nombre}` : 'Eliminar'}
      >
        {personalAccion && (() => {
          const p = personalAccion;
          const destinos = destinosTransferencia(p);

          if (p.rol === 'tecnico') {
            const deps = getOrdenesActivasDeTecnico(p);
            const sinDestino = deps.length > 0 && destinos.length === 0;
            const sinSeleccion = deps.length > 0 && !transferDestinoId;

            return (
              <div className="space-y-4">
                {deps.length === 0 ? (
                  <p className="text-sm text-gray-700">
                    Sin órdenes activas asignadas. La eliminación es segura.
                  </p>
                ) : (
                  <>
                    <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
                      <AlertTriangle size={14} className="text-red-600 mt-0.5 shrink-0" />
                      <p className="text-xs text-red-800">
                        Este técnico tiene {deps.length} orden(es) activa(s). Debes transferirlas a otro técnico.
                      </p>
                    </div>
                    {sinDestino ? (
                      <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                        Crea otro técnico activo primero antes de eliminar a {p.nombre}.
                      </p>
                    ) : (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Transferir a:</label>
                        <select
                          value={transferDestinoId}
                          onChange={e => setTransferDestinoId(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
                        >
                          <option value="">Seleccionar técnico...</option>
                          {destinos.map(d => (
                            <option key={d.id} value={d.id}>
                              {d.nombre}{d.operariaNombre ? ` (grupo ${d.operariaNombre})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </>
                )}
                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={cerrarAcciones} disabled={processingAccion}
                    className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-60">
                    Cancelar
                  </button>
                  <button type="button" onClick={handleConfirmarEliminar}
                    disabled={processingAccion || sinDestino || sinSeleccion}
                    className="px-5 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium disabled:opacity-60">
                    {processingAccion ? 'Eliminando...' : 'Confirmar eliminación'}
                  </button>
                </div>
              </div>
            );
          }

          if (p.rol === 'operaria') {
            const tecs = getTecnicosDeOperaria(p);
            const ords = getOrdenesActivasDeOperaria(p);
            const tieneDeps = tecs.length > 0 || ords.length > 0;
            const sinDestino = tieneDeps && destinos.length === 0;
            const sinSeleccion = tieneDeps && !transferDestinoId;

            return (
              <div className="space-y-4">
                {!tieneDeps ? (
                  <p className="text-sm text-gray-700">Sin técnicos ni órdenes asignadas. La eliminación es segura.</p>
                ) : (
                  <>
                    <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
                      <AlertTriangle size={14} className="text-red-600 mt-0.5 shrink-0" />
                      <p className="text-xs text-red-800">
                        {tecs.length} técnico(s) y {ords.length} orden(es) asignada(s). Debes transferirlos a otra operaria.
                      </p>
                    </div>
                    {sinDestino ? (
                      <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                        Crea otra operaria activa primero antes de eliminar a {p.nombre}.
                      </p>
                    ) : (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Transferir a:</label>
                        <select
                          value={transferDestinoId}
                          onChange={e => setTransferDestinoId(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
                        >
                          <option value="">Seleccionar operaria...</option>
                          {destinos.map(d => (
                            <option key={d.id} value={d.id}>{d.nombre}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </>
                )}
                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={cerrarAcciones} disabled={processingAccion}
                    className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-60">
                    Cancelar
                  </button>
                  <button type="button" onClick={handleConfirmarEliminar}
                    disabled={processingAccion || sinDestino || sinSeleccion}
                    className="px-5 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium disabled:opacity-60">
                    {processingAccion ? 'Eliminando...' : 'Confirmar eliminación'}
                  </button>
                </div>
              </div>
            );
          }

          // administrador / secretaria
          const esUltimoAdmin =
            p.rol === 'administrador' &&
            p.activo &&
            personal.filter(x => x.rol === 'administrador' && x.activo && x.id !== p.id).length === 0;

          return (
            <div className="space-y-4">
              {esUltimoAdmin ? (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
                  <AlertTriangle size={14} className="text-red-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-red-800">
                    No puedes eliminar el último administrador del sistema. Crea otro admin activo primero.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-gray-700">
                  {p.rol === 'administrador'
                    ? 'Este administrador no tiene dependencias operativas directas. Su historial se conserva.'
                    : 'Las secretarias no son dueñas de órdenes operativas. Su historial se conserva.'}
                </p>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={cerrarAcciones} disabled={processingAccion}
                  className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-60">
                  Cancelar
                </button>
                <button type="button" onClick={handleConfirmarEliminar}
                  disabled={processingAccion || esUltimoAdmin}
                  className="px-5 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium disabled:opacity-60">
                  {processingAccion ? 'Eliminando...' : 'Confirmar eliminación'}
                </button>
              </div>
            </div>
          );
        })()}
      </Modal>

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
