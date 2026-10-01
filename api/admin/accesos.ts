import { plantillaEquipos } from '../_lib/plantillaEquipos.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { accesoEquipo, ErrorAcceso } from '../_lib/accesoEquipo.js';
import { getAdminAuth } from '../_lib/firebaseAdmin.js';
import { normalizarUsuario, puedeGestionar, puedeModificar, ROLES_PERSONAL } from '../_lib/accesosUsuarios.js';

/** Gestión administrativa con alias privados y baja recuperable. Claves solo pasan a Auth. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(req.method ?? '')) return res.status(405).json({ error: 'Método no permitido.' });
  try {
    const { db, uid: actor, rol } = await accesoEquipo(req);
    const permisoActor = (await db.doc(`gestion_accesos/${actor}`).get()).data();
    if (!puedeGestionar(rol, permisoActor?.supervisora === true)) throw new ErrorAcceso(403, 'Solo gerencia y la supervisora autorizada pueden gestionar accesos.');
    const auth = getAdminAuth();
    if (req.method === 'GET') {
      const [personal, perfiles, controles] = await Promise.all([db.collection('personal').limit(500).get(), db.collection('usuarios').limit(500).get(), db.collection('gestion_accesos').limit(500).get()]);
      const perfilesPorUid = new Map(perfiles.docs.map(d => [d.id, d.data()]));
      const permisos = new Map(controles.docs.map(d => [d.id, d.data()]));
      return res.status(200).json({ plantilla: rol === 'administrador' ? plantillaEquipos : [], administrador: rol === 'administrador', actor, personas: personal.docs.map(d => {
        const p = d.data(), u = perfilesPorUid.get(p.uid) ?? {}, c = permisos.get(p.uid) ?? {};
        return { personalId: d.id, uid: p.uid ?? '', nombre: p.nombre ?? '', rol: u.rol ?? p.rol, usuario: c.usuario ?? '', equipo: c.equipo ?? '', version: c.version ?? 0, especialidad: p.especialidad ?? '', activo: u.activo !== false && p.activo !== false && !u.eliminado, supervisora: c.supervisora === true, recuperacion: c.recuperacion === true, email: ['administrador', 'coordinadora'].includes(u.rol) ? u.email ?? p.email ?? '' : '' };
      }) });
    }
    const b = req.body;
    if (!b || typeof b !== 'object') throw new ErrorAcceso(400, 'Datos inválidos.');
    const accion = String(b.accion ?? '');
    if (!['guardar', 'clave', 'eliminar', 'restaurar', 'supervisora', 'recuperacion'].includes(accion)) throw new ErrorAcceso(400, 'Acción inválida.');
    const esNuevo = accion === 'guardar' && !b.uid;
    const uid = esNuevo ? randomUUID() : String(b.uid ?? '');
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(uid)) throw new ErrorAcceso(400, 'Usuario inválido.');
    const perfilRef = db.doc(`usuarios/${uid}`), controlRef = db.doc(`gestion_accesos/${uid}`);
    const [perfilSnap, controlSnap] = await Promise.all([perfilRef.get(), controlRef.get()]);
    const perfil = perfilSnap.data(), control = controlSnap.data() ?? {};
    if (!esNuevo && !perfil) throw new ErrorAcceso(404, 'Esta persona todavía no tiene acceso vinculado.');
    const propioAlias = uid === actor && (accion === 'guardar' || accion === 'recuperacion');
    if (!esNuevo && !propioAlias && !puedeModificar(rol, actor, uid, String(perfil?.rol), control.supervisora === true)) throw new ErrorAcceso(403, 'No puedes modificar esta cuenta.');
    const personales = esNuevo ? null : await db.collection('personal').where('uid', '==', uid).get();
    const audit = (operacion: string) => ({ actorUid: actor, accion: operacion, objetivoId: uid, createdAt: FieldValue.serverTimestamp() });
    const actualizarPerfil = async (datos: Record<string, unknown>, operacion: string) => {
      const batch = db.batch(); batch.set(perfilRef, datos, { merge: true });
      personales?.docs.forEach(d => batch.set(d.ref, datos, { merge: true }));
      batch.create(db.collection('auditoria_admin').doc(), audit(operacion)); await batch.commit();
    };
    if (accion === 'supervisora') {
      if (rol !== 'administrador' || perfil?.rol !== 'coordinadora' || typeof b.habilitada !== 'boolean') throw new ErrorAcceso(403, 'Solo gerencia puede autorizar a una coordinadora como supervisora.');
      const batch = db.batch(); batch.set(controlRef, { supervisora: b.habilitada }, { merge: true }); batch.create(db.collection('auditoria_admin').doc(), audit(b.habilitada ? 'autorizar_supervisora' : 'retirar_supervisora')); await batch.commit();
    } else if (accion === 'recuperacion') {
      if (uid !== actor && rol !== 'administrador') throw new ErrorAcceso(403, 'Solo puedes gestionar tu propia recuperación.');
      if (!(perfil?.rol === 'administrador' || perfil?.rol === 'coordinadora' && control.supervisora === true)) throw new ErrorAcceso(403, 'La recuperación por correo está reservada a gerencia y supervisión.');
      const cuenta = await auth.getUser(uid);
      if (typeof b.habilitada !== 'boolean' || !cuenta.email || cuenta.email.endsWith('@usuarios.misterservicerd.invalid')) throw new ErrorAcceso(400, 'Configura primero un correo real en la cuenta.');
      const batch = db.batch(); batch.set(controlRef, { recuperacion: b.habilitada }, { merge: true }); batch.create(db.collection('auditoria_admin').doc(), audit('configurar_recuperacion')); await batch.commit();
    } else if (accion === 'clave') {
      if (typeof b.password !== 'string' || b.password.length < 8 || b.password.length > 128) throw new ErrorAcceso(400, 'La clave debe tener entre 8 y 128 caracteres.');
      await auth.updateUser(uid, { password: b.password }); await auth.revokeRefreshTokens(uid);
      await db.collection('auditoria_admin').add(audit('cambiar_clave'));
    } else if (accion === 'eliminar' || accion === 'restaurar') {
      const activo = accion === 'restaurar';
      // Desactivar primero Auth para que un fallo de Firestore no deje acceso abierto.
      if (!activo) { await auth.updateUser(uid, { disabled: true }); await auth.revokeRefreshTokens(uid); }
      await actualizarPerfil({ activo, eliminado: !activo }, activo ? 'restaurar_acceso' : 'eliminar_acceso');
      if (activo) await auth.updateUser(uid, { disabled: false });
    } else {
      let usuario: string;
      try { usuario = normalizarUsuario(b.usuario); } catch (e) { throw new ErrorAcceso(400, (e as Error).message); }
      const nombre = typeof b.nombre === 'string' ? b.nombre.trim() : '';
      const equipo = typeof b.equipo === 'string' ? b.equipo : '';
      if (!nombre || nombre.length > 120 || !['', 'A', 'B'].includes(equipo)) throw new ErrorAcceso(400, 'Revisa el nombre y equipo.');
      const rolDestino = esNuevo ? b.rol : perfil!.rol;
      if (esNuevo && !ROLES_PERSONAL.includes(rolDestino)) throw new ErrorAcceso(400, 'Selecciona un rol de personal.');
      if (esNuevo && (typeof b.password !== 'string' || b.password.length < 8 || b.password.length > 128)) throw new ErrorAcceso(400, 'La clave debe tener entre 8 y 128 caracteres.');
      const especialidad = typeof b.especialidad === 'string' ? b.especialidad.trim() : '';
      if (especialidad.length > 300) throw new ErrorAcceso(400, 'Especialidad demasiado larga.');
      let operariaId = '', operariaNombre = '';
      if (equipo && rolDestino !== 'operaria') {
        const integrantes = await db.collection('gestion_accesos').where('equipo', '==', equipo).get();
        const perfilesEquipo = await Promise.all(integrantes.docs.map(d => db.doc(`usuarios/${d.id}`).get()));
        const lideres = perfilesEquipo.filter(d => d.data()?.rol === 'operaria' && d.data()?.activo !== false && !d.data()?.eliminado);
        if (lideres.length !== 1) throw new ErrorAcceso(409, 'Asigna primero una única operaria activa a este equipo.');
        operariaId = lideres[0].id; operariaNombre = String(lideres[0].data()?.nombre ?? '');
      }
      const aliasRef = db.doc(`accesos_alias/${usuario}`);
      if (!esNuevo && b.version !== (control.version ?? 0)) throw new ErrorAcceso(409, 'La cuenta cambió. Recarga antes de guardar.');
      // Solo las altas reservan alias antes de crear Auth. Los cambios existentes son atómicos.
      if (esNuevo) await db.runTransaction(async tx => {
        const alias = (await tx.get(aliasRef)).data();
        if (alias && alias.uid !== uid) throw new ErrorAcceso(409, 'Ese nombre de usuario ya está asignado.');
        tx.set(aliasRef, { uid });
      });
      let creada = false;
      try {
        const email = esNuevo ? `${uid}@usuarios.misterservicerd.invalid` : (await auth.getUser(uid)).email;
        if (esNuevo) { await auth.createUser({ uid, email, password: b.password, displayName: nombre, disabled: true }); creada = true; }
        const datos = { nombre, especialidad, ...(equipo && rolDestino !== 'operaria' ? { operariaId, operariaNombre } : {}), equipoId: equipo ? `equipo-${equipo === 'A' ? 1 : 2}` : '', ...(esNuevo ? { uid, email, rol: rolDestino, activo: false, disponibilidad: true, iaHabilitada: false } : {}) };
        await db.runTransaction(async tx => {
          const [aliasActual, controlActual] = await Promise.all([tx.get(aliasRef), tx.get(controlRef)]);
          if (aliasActual.exists && aliasActual.data()?.uid !== uid) throw new ErrorAcceso(409, 'Ese nombre de usuario ya está asignado.');
          if ((controlActual.data()?.version ?? 0) !== (control.version ?? 0)) throw new ErrorAcceso(409, 'La cuenta cambió. Recarga antes de guardar.');
          tx.set(aliasRef, { uid });
          tx.set(perfilRef, datos, { merge: true });
          if (esNuevo) tx.set(db.collection('personal').doc(uid), datos);
          else personales!.docs.forEach(d => tx.set(d.ref, datos, { merge: true }));
          tx.set(controlRef, { usuario, equipo, version: (control.version ?? 0) + 1 }, { merge: true });
          if (typeof control.usuario === 'string' && control.usuario !== usuario) tx.delete(db.doc(`accesos_alias/${control.usuario}`));
          tx.create(db.collection('auditoria_admin').doc(), audit(esNuevo ? 'crear_acceso_usuario' : 'asignar_usuario_equipo'));
        });
        if (esNuevo) { await auth.updateUser(uid, { disabled: false }); await actualizarPerfil({ activo: true }, 'activar_alta'); await db.doc(`personal/${uid}`).set({ activo: true }, { merge: true }); }

      } catch (error) {
        // No borrar cuentas ni registros ya confirmados; una alta incompleta queda desactivada para recuperación administrativa.
        if (!creada && esNuevo) await db.runTransaction(async tx => { const a = await tx.get(aliasRef); if (a.data()?.uid === uid) tx.delete(aliasRef); });
        throw error;
      }
    }
    return res.status(200).json({ ok: true, uid });
  } catch (error) {
    return res.status(error instanceof ErrorAcceso ? error.status : 503).json({ error: error instanceof ErrorAcceso ? error.message : 'No se pudo completar el cambio. Recarga para verificar el estado antes de reintentar.' });
  }
}
