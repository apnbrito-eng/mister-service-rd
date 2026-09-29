import type { FormEvent } from 'react';
interface Props {
  fecha: string; motivo: string; guardando: boolean;
  onFecha: (v: string) => void; onMotivo: (v: string) => void;
  onGuardar: (e: FormEvent) => void; onCancelar: () => void;
}
export default function ConciliarFechaComisionFormulario(p: Props) {
  return <form onSubmit={p.onGuardar} className="rounded-xl border p-4 space-y-3 bg-white">
    <h3 className="font-semibold">Conciliar fecha de comisión</h3>
    <p className="text-sm">Indica la fecha de devengo respaldada por el registro original. Se actualizará su quincena y quedará constancia del motivo. No se modifica el importe.</p>
    <label className="block">Fecha de devengo<input type="date" required disabled={p.guardando} value={p.fecha} onChange={e => p.onFecha(e.target.value)} className="block border rounded p-2" /></label>
    <label className="block">Motivo y respaldo<textarea required minLength={5} maxLength={1000} disabled={p.guardando} value={p.motivo} onChange={e => p.onMotivo(e.target.value)} className="block border rounded p-2 w-full" /></label>
    <div className="flex gap-3"><button type="submit" disabled={p.guardando} className="bg-primary text-white rounded p-2">{p.guardando ? 'Guardando…' : 'Guardar fecha y motivo'}</button><button type="button" disabled={p.guardando} onClick={p.onCancelar}>Cancelar</button></div>
  </form>;
}
