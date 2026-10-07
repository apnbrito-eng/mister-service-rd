import { useRef, useState } from 'react';
import { equipoApi } from '../../services/equipoApi';
import { coincidirPersona } from '../../../api/_lib/plantillaEquipos';
import type { plantillaEquipos as TipoPlantilla } from '../../../api/_lib/plantillaEquipos';
import type { Persona } from './AccesosPorUsuario';
export default function AltaEquipos({ personas, plantillaEquipos, onComplete }: { personas: Persona[]; plantillaEquipos: typeof TipoPlantilla; onComplete(): Promise<void> }) {
  const [clave, setClave] = useState(''), [confirmado, setConfirmado] = useState(false), [ocupado, setOcupado] = useState(false), [estado, setEstado] = useState('');
  const [completados, setCompletados] = useState<string[]>([]);
  const ejecutando = useRef(false);
  const boton = 'min-h-11 border rounded-lg px-3 py-2 disabled:opacity-50';
  async function aplicar() {
    if (ejecutando.current || !confirmado || clave.length < 8) return;
    ejecutando.current = true; setOcupado(true); setCompletados([]);
    try {
      const actuales = (await equipoApi<{ personas: Persona[] }>('/api/admin/accesos')).personas;
      // Resolver TODAS las identidades antes de efectuar el primer cambio.
      const filas = plantillaEquipos.map(fila => {
        const p = coincidirPersona(fila, actuales);
        if (p && (!p.uid || p.rol !== fila.rol)) throw new Error(`Revisa la cuenta y el rol de ${fila.nombre} antes de aplicar.`);
        if (!p && fila.direccion) throw new Error(`Debe existir la cuenta de ${fila.nombre}.`);
        return { fila, p };
      });
      // La responsable debe estar configurada y activa antes de registrar a su equipo.
      const ordenadas = [...filas].sort((a, b) => {
        const prioridad = (f: typeof plantillaEquipos[number]) => f.direccion ? 0 : f.rol === 'operaria' ? 1 : 2;
        return prioridad(a.fila) - prioridad(b.fila);
      });
      for (const equipo of ['A', 'B']) {
        const responsable = filas.find(f => f.fila.equipo === equipo && f.fila.rol === 'operaria');
        if (!responsable) throw new Error(`Falta la responsable del equipo ${equipo}.`);
        if (actuales.some(p => p.equipo === equipo && p.rol === 'operaria' && p.activo && p.uid !== responsable.p?.uid))
          throw new Error(`El equipo ${equipo} tiene otra responsable activa. Retira ese acceso antes de aplicar esta organización.`);
      }
      for (const { fila, p } of ordenadas) {
        setEstado(`Configurando ${fila.nombre}…`);
        const guardado = await equipoApi<{ uid: string }>('/api/admin/accesos', { accion: 'guardar', uid: p?.uid || '', version: p?.version ?? 0, nombre: p?.nombre || fila.nombre, usuario: fila.usuario, equipo: fila.equipo, especialidad: fila.especialidad, rol: fila.rol, ...(!p ? { password: clave } : {}) });
        if (p && !fila.direccion) {
          await equipoApi('/api/admin/accesos', { accion: 'clave', uid: p.uid, password: clave });
          if (!p.activo) await equipoApi('/api/admin/accesos', { accion: 'restaurar', uid: p.uid });
        }
        if (fila.usuario === 'maria') await equipoApi('/api/admin/accesos', { accion: 'supervisora', uid: guardado.uid, habilitada: true });
        if (fila.usuario === 'jorge') await equipoApi('/api/admin/accesos', { accion: 'recuperacion', uid: guardado.uid, habilitada: true });
        setCompletados(prev => [...prev, fila.usuario]);
      }
      setClave(''); setConfirmado(false); await onComplete(); setEstado('Usuarios y equipos guardados. Las claves de Jorge y María se conservaron. El correo de recuperación de María queda pendiente.');
    } catch (e) { setEstado(e instanceof Error ? e.message : 'Proceso interrumpido. Revisa los usuarios antes de reintentar.'); await onComplete().catch(() => {}); }
    finally { ejecutando.current = false; setOcupado(false); }
  }
  return <section className="rounded-2xl border bg-slate-50 p-4 space-y-5" aria-label="Organización del personal">
    <header><h3 className="text-lg font-semibold">Organización del personal</h3><p className="text-sm text-slate-600">16 personas · Dirección y dos equipos. Se conservan las cuentas y claves de Jorge y María Teresa. Solo las personas de esta lista recuperarán acceso; las demás seguirán bloqueadas.</p></header>
    <div className="grid gap-4 lg:grid-cols-3">{['', 'A', 'B'].map(equipo => <section key={equipo} className="rounded-xl border bg-white p-4 space-y-3">
      <h4 className="font-semibold">{equipo ? `Equipo ${equipo}` : 'Dirección'}</h4>
      {plantillaEquipos.filter(f => f.equipo === equipo).map(f => {
        let situacion = 'Cuenta nueva';
        try { const p = coincidirPersona(f, personas); if (p) situacion = p.activo ? 'Cuenta existente' : 'Se reactivará'; } catch { situacion = 'Revisar coincidencia'; }
        return <div key={f.usuario} className="border-t pt-3"><div className="font-medium">{f.nombre}</div><div className="text-sm text-slate-600">{f.direccion ? 'Dirección' : f.rol === 'operaria' ? 'Responsable del equipo' : f.rol === 'secretaria' ? 'Asistente' : 'Técnico'} · <code>{f.usuario}</code></div><p className="text-sm">{completados.includes(f.usuario) ? '✓ Configurado' : situacion}</p></div>;
      })}
    </section>)}</div>
    <p className="text-sm">El proceso configura primero a Wila y Yohana y después a sus integrantes. Si se interrumpe, muestra los avances y permite reintentar sin duplicar cuentas.</p>
    <label className="block">Clave temporal del personal<input className="block min-h-11 border rounded-lg px-3 py-2" type="password" autoComplete="new-password" minLength={8} maxLength={128} value={clave} disabled={ocupado} onChange={e => setClave(e.target.value)} /></label>
    <label className="flex gap-2 items-center min-h-11"><input type="checkbox" checked={confirmado} disabled={ocupado} onChange={e => setConfirmado(e.target.checked)} />Revisé las cuentas y confirmo esta asignación y la gestión de usuarios para María.</label>
    <button className={boton} disabled={ocupado || !confirmado || clave.length < 8} onClick={() => void aplicar()}>Aplicar usuarios y equipos</button>
    {estado && <p role="status">{estado}</p>}
  </section>;
}
