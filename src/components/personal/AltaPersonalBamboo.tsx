import { useState, type FormEvent } from 'react';
import { equipoApi } from '../../services/equipoApi';
import type { Rol } from '../../types';
import { ROL_LABELS } from '../../utils/personal';

/** Alta mediante el endpoint existente: usuario, Auth y ficha quedan vinculados. */
export default function AltaPersonalBamboo({ onCreado }: { onCreado: (id: string) => void }) {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState('');
  const [usuario, setUsuario] = useState('');
  const [rol, setRol] = useState<Rol>('tecnico');
  const [clave, setClave] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  async function crear(e: FormEvent) {
    e.preventDefault(); setOcupado(true); setError('');
    try {
      const result = await equipoApi<{ uid: string }>('/api/admin/accesos', { accion: 'guardar', nombre: nombre.trim(), usuario: usuario.trim(), rol, equipo: '', password: clave });
      setClave(''); setNombre(''); setUsuario(''); setAbierto(false); onCreado(result.uid);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo crear el empleado.'); }
    finally { setOcupado(false); }
  }
  return <section>
    <button className="b-btn is-primary" type="button" onClick={() => { setAbierto(!abierto); setClave(''); setError(''); }}>Agregar empleado</button>
    {abierto && <form onSubmit={crear} className="b-panel" style={{ marginTop: 12 }}>
      <h3 className="b-h3">Nuevo empleado y cuenta de acceso</h3>
      <div className="b-fields">
        <label>Nombre completo<input className="b-input" value={nombre} onChange={e => setNombre(e.target.value)} required maxLength={120} /></label>
        <label>Usuario<input className="b-input" value={usuario} onChange={e => setUsuario(e.target.value)} required autoCapitalize="none" /></label>
        <label>Rol<select className="b-input" value={rol} onChange={e => setRol(e.target.value as Rol)}>{(['administrador','coordinadora','operaria','secretaria','tecnico'] as Rol[]).map(r => <option key={r} value={r}>{ROL_LABELS[r]}</option>)}</select></label>
        <label>Contraseña inicial<input className="b-input" type="password" value={clave} onChange={e => setClave(e.target.value)} required minLength={8} maxLength={128} autoComplete="new-password" /></label>
      </div>
      <p className="b-help">El equipo se asigna desde la ficha después del alta. El correo de contacto se registra por separado.</p>
      {error && <p role="alert">{error}</p>}
      <button className="b-btn is-primary" disabled={ocupado} type="submit">{ocupado ? 'Creando…' : 'Crear empleado y acceso'}</button>
      <button className="b-btn" type="button" disabled={ocupado} onClick={() => { setAbierto(false); setClave(''); }}>Cancelar</button>
    </form>}
  </section>;
}
