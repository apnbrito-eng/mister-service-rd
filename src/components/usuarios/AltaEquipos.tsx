import { useRef, useState } from 'react';
import { equipoApi } from '../../services/equipoApi';
import { coincidirPersona } from '../../../api/_lib/plantillaEquipos';
import type { plantillaEquipos as TipoPlantilla } from '../../../api/_lib/plantillaEquipos';
import type { Persona } from './AccesosPorUsuario';
export default function AltaEquipos({ personas, plantillaEquipos, onComplete }: { personas: Persona[]; plantillaEquipos: typeof TipoPlantilla; onComplete(): Promise<void> }) {
  const [clave, setClave] = useState(''), [confirmado, setConfirmado] = useState(false), [ocupado, setOcupado] = useState(false), [estado, setEstado] = useState('');
  const ejecutando = useRef(false);
  const boton = 'min-h-11 border rounded-lg px-3 py-2 disabled:opacity-50';
  async function aplicar() {
    if (ejecutando.current || !confirmado || clave.length < 8) return;
    ejecutando.current = true; setOcupado(true);
    try {
      const actuales = (await equipoApi<{ personas: Persona[] }>('/api/admin/accesos')).personas;
      // Resolver TODAS las identidades antes de efectuar el primer cambio.
      const filas = plantillaEquipos.map(fila => {
        const p = coincidirPersona(fila, actuales);
        if (p && (!p.uid || p.rol !== fila.rol)) throw new Error(`Revisa la cuenta y el rol de ${fila.nombre} antes de aplicar.`);
        if (!p && fila.direccion) throw new Error(`Debe existir la cuenta de ${fila.nombre}.`);
        return { fila, p };
      });
      for (const { fila, p } of filas) {
        setEstado(`Configurando ${fila.nombre}…`);
        const guardado = await equipoApi<{ uid: string }>('/api/admin/accesos', { accion: 'guardar', uid: p?.uid || '', version: p?.version ?? 0, nombre: p?.nombre || fila.nombre, usuario: fila.usuario, equipo: fila.equipo, especialidad: fila.especialidad, rol: fila.rol, ...(!p ? { password: clave } : {}) });
        if (p && !fila.direccion) await equipoApi('/api/admin/accesos', { accion: 'clave', uid: p.uid, password: clave });
        if (fila.usuario === 'maria') await equipoApi('/api/admin/accesos', { accion: 'supervisora', uid: guardado.uid, habilitada: true });
        if (fila.usuario === 'jorge') await equipoApi('/api/admin/accesos', { accion: 'recuperacion', uid: guardado.uid, habilitada: true });
      }
      setClave(''); setConfirmado(false); await onComplete(); setEstado('Usuarios y equipos guardados. Las claves de Jorge y María se conservaron. El correo de recuperación de María queda pendiente.');
    } catch (e) { setEstado(e instanceof Error ? e.message : 'Proceso interrumpido. Revisa los usuarios antes de reintentar.'); await onComplete().catch(() => {}); }
    finally { ejecutando.current = false; setOcupado(false); }
  }
  return <details className="border rounded-lg p-4 space-y-3"><summary className="min-h-11 cursor-pointer font-semibold">Asignar automáticamente los equipos de Jorge</summary>
    <p>Reutiliza cuentas existentes, crea las que falten y asigna los usuarios de esta lista. Conserva los accesos y claves actuales de Jorge y María. La clave temporal se aplicará al resto del personal listado.</p>
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th>Persona</th><th>Usuario</th><th>Equipo</th><th>Cuenta</th></tr></thead><tbody>{plantillaEquipos.map(f => {
      let cuenta = 'Nueva'; try { const p = coincidirPersona(f, personas); cuenta = p ? p.nombre : 'Nueva'; } catch { cuenta = 'Coincidencia ambigua: revisar'; }
      return <tr key={f.usuario}><td className="p-2">{f.nombre}</td><td>{f.usuario}</td><td>{f.equipo || 'Dirección'}</td><td>{cuenta}</td></tr>;
    })}</tbody></table></div>
    <label className="block">Clave temporal del personal<input className="block min-h-11 border rounded-lg px-3 py-2" type="password" autoComplete="new-password" minLength={8} maxLength={128} value={clave} disabled={ocupado} onChange={e => setClave(e.target.value)} /></label>
    <label className="flex gap-2 items-center min-h-11"><input type="checkbox" checked={confirmado} disabled={ocupado} onChange={e => setConfirmado(e.target.checked)} />Revisé las cuentas y confirmo esta asignación y la gestión de usuarios para María.</label>
    <button className={boton} disabled={ocupado || !confirmado || clave.length < 8} onClick={() => void aplicar()}>Aplicar usuarios y equipos</button>
    {estado && <p role="status">{estado}</p>}
  </details>;
}
