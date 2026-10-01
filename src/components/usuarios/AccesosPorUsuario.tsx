import AltaEquipos from './AltaEquipos';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { equipoApi } from '../../services/equipoApi';
import { sugerirUsuario } from '../../../api/_lib/accesosUsuarios';
export interface Persona { version: number; uid: string; personalId: string; nombre: string; rol: string; usuario: string; equipo: string; especialidad: string; activo: boolean; supervisora: boolean; recuperacion: boolean; email: string }
import type { plantillaEquipos } from '../../../api/_lib/plantillaEquipos';
interface Datos { plantilla: typeof plantillaEquipos; administrador: boolean; actor: string; personas: Persona[] }
const campo = 'w-full min-h-11 rounded-lg border border-gray-300 px-3 py-2 text-base';
const boton = 'min-h-11 rounded-lg border border-gray-300 px-3 py-2 disabled:opacity-50';
const vacio = { version: 0, uid: '', nombre: '', usuario: '', equipo: '', especialidad: '', rol: 'tecnico', password: '' };
export default function AccesosPorUsuario() {
  const ejecutando = useRef(false);
  const [datos, setDatos] = useState<Datos | null>(null), [form, setForm] = useState(vacio);
  const [error, setError] = useState(''), [aviso, setAviso] = useState(''), [ocupado, setOcupado] = useState(false);
  const [editar, setEditar] = useState(false), [clavePara, setClavePara] = useState<Persona | null>(null), [clave, setClave] = useState('');
  const [confirmarBaja, setConfirmarBaja] = useState<Persona | null>(null);
  useEffect(() => { let vivo = true; equipoApi<Datos>('/api/admin/accesos').then(d => { if (vivo) setDatos(d); }).catch(e => { if (vivo) setError(e.message); }); return () => { vivo = false; }; }, []);
  async function ejecutar(body: object) {
    if (ejecutando.current) return;
    ejecutando.current = true;
    setOcupado(true); setError(''); setAviso('');
    try {
      await equipoApi('/api/admin/accesos', body);
      setForm(vacio); setClave(''); setClavePara(null); setEditar(false); setConfirmarBaja(null);
      setDatos(await equipoApi<Datos>('/api/admin/accesos'));
      setAviso('Cambio guardado.');
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar.'); }
    finally { ejecutando.current = false; setOcupado(false); }
  }
  function guardar(e: FormEvent) { e.preventDefault(); void ejecutar({ accion: 'guardar', ...form }); }
  return <section className="rounded-xl border bg-white p-4 space-y-4" aria-labelledby="accesos-usuario">
    <h2 id="accesos-usuario" className="text-lg font-semibold">Usuarios y equipos</h2>
    <p>Acceso individual por nombre de usuario. Gerencia y la supervisora autorizada administran las claves del personal.</p>
    {error && <p role="alert" className="text-red-700">{error}</p>}{aviso && <p role="status">{aviso}</p>}
    {!datos ? <p>{error ? 'El acceso a esta gestión no está disponible.' : 'Cargando accesos…'}</p> : <>
      {datos.administrador && <AltaEquipos plantillaEquipos={datos.plantilla} personas={datos.personas} onComplete={async () => setDatos(await equipoApi<Datos>('/api/admin/accesos'))} />}
      <button className={boton} disabled={ocupado} onClick={() => { setForm(vacio); setEditar(true); setClavePara(null); }}>Agregar usuario</button>
      {editar && <form onSubmit={guardar} className="grid gap-3 sm:grid-cols-2 border rounded-lg p-4">
        <label>Nombre completo<input className={campo} required maxLength={120} value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} /></label>
        <label>Equipo<select className={campo} value={form.equipo} onChange={e => setForm({ ...form, equipo: e.target.value })}><option value="">Dirección / sin equipo</option><option>A</option><option>B</option></select></label>
        <label>Nombre de usuario<input className={campo} required pattern="[a-z][a-z0-9._\-]{2,39}" autoCapitalize="none" autoComplete="off" value={form.usuario} onChange={e => setForm({ ...form, usuario: e.target.value.toLowerCase() })} /></label>
        <button className={boton} type="button" onClick={() => setForm({ ...form, usuario: sugerirUsuario(form.nombre, form.equipo) })}>Generar usuario con nombre y equipo</button>
        {!form.uid && <><label>Rol<select className={campo} value={form.rol} onChange={e => setForm({ ...form, rol: e.target.value })}><option value="tecnico">Técnico</option><option value="secretaria">Asistente</option><option value="operaria">Operaria</option><option value="ayudante">Ayudante</option></select></label>
          <label>Clave inicial<input className={campo} type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /></label></>}
        <label className="sm:col-span-2">Especialidades<input className={campo} maxLength={300} value={form.especialidad} onChange={e => setForm({ ...form, especialidad: e.target.value })} /></label>
        <button className={boton} disabled={ocupado}>Guardar usuario</button><button className={boton} type="button" disabled={ocupado} onClick={() => { setEditar(false); setForm(vacio); }}>Cancelar</button>
      </form>}
      {clavePara && <form className="border rounded-lg p-4 space-y-3" onSubmit={e => { e.preventDefault(); void ejecutar({ accion: 'clave', uid: clavePara.uid, password: clave }); }}>
        <label>Nueva clave para {clavePara.nombre}<input className={campo} type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={clave} onChange={e => setClave(e.target.value)} /></label>
        <p>Se cerrarán las sesiones anteriores de esta persona.</p><button className={boton} disabled={ocupado}>Cambiar clave</button> <button className={boton} type="button" disabled={ocupado} onClick={() => { setClavePara(null); setClave(''); }}>Cancelar</button>
      </form>}
      {confirmarBaja && <div className="border rounded-lg p-4 space-y-2"><p>Eliminar el acceso de {confirmarBaja.nombre} cerrará sus sesiones. Su historial se conserva y podrás restaurar el acceso.</p><button className={boton} disabled={ocupado} onClick={() => void ejecutar({ accion: 'eliminar', uid: confirmarBaja.uid })}>Confirmar eliminación del acceso</button> <button className={boton} disabled={ocupado} onClick={() => setConfirmarBaja(null)}>Cancelar</button></div>}
      <details><summary className="min-h-11 cursor-pointer font-semibold">Administrar un usuario individual</summary><div className="space-y-3">{datos.personas.filter(p => p.uid).map(p => {
        const propio = p.uid === datos.actor;
        const editable = datos.administrador || propio || !p.supervisora && ['operaria', 'secretaria', 'tecnico', 'ayudante'].includes(p.rol);
        return <article key={p.personalId} className="border rounded-lg p-3 space-y-2">
          <h3 className="font-semibold">{p.nombre} · {p.equipo ? `Equipo ${p.equipo}` : 'Sin equipo'}</h3>
          <p className="break-words">{p.usuario || 'Usuario por asignar'} · {p.activo ? 'Activo' : 'Acceso eliminado'} · {p.supervisora ? 'Supervisora general' : p.rol}</p>
          <div className="flex flex-wrap gap-2">{editable && <button className={boton} disabled={ocupado} onClick={() => { setForm({ ...vacio, ...p }); setEditar(true); setClavePara(null); }}>Editar usuario y equipo</button>}
            {editable && !propio && <><button className={boton} disabled={ocupado} onClick={() => { setClavePara(p); setClave(''); setEditar(false); }}>Cambiar clave de {p.nombre}</button>
              <button className={boton} disabled={ocupado} onClick={() => p.activo ? setConfirmarBaja(p) : void ejecutar({ accion: 'restaurar', uid: p.uid })}>{p.activo ? 'Eliminar acceso' : 'Restaurar acceso'}</button></>}
            {datos.administrador && p.rol === 'coordinadora' && <button className={boton} disabled={ocupado} onClick={() => void ejecutar({ accion: 'supervisora', uid: p.uid, habilitada: !p.supervisora })}>{p.supervisora ? 'Retirar gestión de usuarios' : 'Autorizar como supervisora general'}</button>}
            {(datos.administrador || propio) && (p.rol === 'administrador' || p.supervisora) && <button className={boton} disabled={ocupado || !p.email} onClick={() => void ejecutar({ accion: 'recuperacion', uid: p.uid, habilitada: !p.recuperacion })}>{p.recuperacion ? 'Deshabilitar' : 'Habilitar'} recuperación por correo</button>}
          </div>{(p.rol === 'administrador' || p.supervisora) && <p className="text-sm break-words">Correo de la cuenta: {p.email || 'Pendiente'}. Recuperación: {p.recuperacion ? 'habilitada' : 'pendiente'}.</p>}
        </article>;
      })}</div></details>
    </>}
  </section>;
}
