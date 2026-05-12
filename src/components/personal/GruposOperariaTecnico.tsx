import { Users } from 'lucide-react';
import type { Personal } from '../../types';
import { ROL_LABELS } from '../../utils/personal';

/**
 * Sección "Grupos operaria-técnico" extraída de `PersonalPage.tsx` (SPRINT-142c, 2026-05-11).
 *
 * Render puro: solo recibe `personal` y muestra una tarjeta por operaria/coordinadora/admin
 * activa con los técnicos asignados (post-SPRINT-149: `tecnico.operariaId === (operaria.uid || operaria.id)`),
 * más una tarjeta "Sin asignar" para técnicos sin operariaId. Sin handlers, sin escrituras.
 * @safe-tecnicoid-id: descripción en JSDoc, el código real usa `(op.uid || op.id)`.
 *
 * La edición de operaria→técnico vive en `FormAltaEditarEmpleado.tsx` (campo
 * `operariaId` del form). Acá solo se visualiza el estado actual.
 *
 * Comportamiento auto-oculto: si no hay ningún grupo con técnicos NI técnicos sin
 * asignar, retorna `null` (idéntico al `if (!hayGrupos) return null` del original).
 *
 * SPRINT-142d (2026-05-11): `ROL_LABELS` consolidada en `utils/personal.ts`.
 */

export interface GruposOperariaTecnicoProps {
  /** Lista completa de personal (activos e inactivos). El componente filtra activos. */
  personal: Personal[];
}

export default function GruposOperariaTecnico({ personal }: GruposOperariaTecnicoProps) {
  const tecnicos = personal.filter(p => p.rol === 'tecnico' && p.activo);
  const operarias = personal.filter(
    p => (p.rol === 'operaria' || p.rol === 'coordinadora' || p.rol === 'administrador') && p.activo
  );
  // SPRINT-149 (P-006 variante operariaId): `t.operariaId` post-SPRINT-105 persiste
  // auth.uid; fallback `op.id` legacy.
  const operariasConTecnicos = operarias
    .map(op => ({
      operaria: op,
      tecnicos: tecnicos.filter(t => t.operariaId === (op.uid || op.id)),
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
}
