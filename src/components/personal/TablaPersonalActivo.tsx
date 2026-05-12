import { Fragment } from 'react';
import { Edit, Check, Power, Trash2, Link2 } from 'lucide-react';
import type { Personal } from '../../types';
import { ROLES_CON_ACCESO } from '../../types';
import { formatTelefono } from '../../utils';
import { agruparPorRol } from '../../utils/roles';
import { ROL_LABELS, ROL_COLORS, ROLES_CON_COMISION, comisionDefaultPorNivel } from '../../utils/personal';

/**
 * Tabla agrupada por rol del personal ACTIVO, extraída de PersonalPage.tsx
 * (SPRINT-142d, 2026-05-11). Render puro con callbacks; sin escrituras a
 * Firestore.
 *
 * La tabla de personal INACTIVO sigue en PersonalPage (otro componente extraído
 * tomaría más superficie de diff sin ganancia; queda para sprint propio futuro
 * si Jorge lo prioriza).
 *
 * Constantes ROL_LABELS / ROL_COLORS / ROLES_CON_COMISION / comisionDefaultPorNivel
 * importadas desde `utils/personal.ts` (consolidación SPRINT-142d).
 */

export interface TablaPersonalActivoProps {
  /** Lista completa (el componente filtra activos internamente). */
  personal: Personal[];
  /** ¿Mostrar botones de modificación (Edit, Vincular)? */
  puedeModificar: boolean;
  /** ¿Mostrar botones destructivos (Desactivar, Eliminar)? */
  puedeEliminar: boolean;
  onEdit: (p: Personal) => void;
  onAbrirVincular: (p: Personal) => void;
  onAbrirDesactivar: (p: Personal) => void;
  onAbrirEliminar: (p: Personal) => void;
}

export default function TablaPersonalActivo({
  personal,
  puedeModificar,
  puedeEliminar,
  onEdit,
  onAbrirVincular,
  onAbrirDesactivar,
  onAbrirEliminar,
}: TablaPersonalActivoProps) {
  return (
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
                        {puedeModificar && (
                          <button onClick={() => onEdit(p)} title="Editar"
                            className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors">
                            <Edit size={14} />
                          </button>
                        )}
                        {puedeModificar && p.rol !== 'ayudante' && ROLES_CON_ACCESO.includes(p.rol) && !p.uid && p.email && (
                          <button onClick={() => onAbrirVincular(p)} title="Vincular cuenta existente"
                            className="p-2 hover:bg-indigo-50 rounded-lg text-indigo-600 transition-colors">
                            <Link2 size={14} />
                          </button>
                        )}
                        {puedeEliminar && (
                          <button onClick={() => onAbrirDesactivar(p)} title="Desactivar"
                            className="p-2 hover:bg-amber-50 rounded-lg text-amber-600 transition-colors">
                            <Power size={14} />
                          </button>
                        )}
                        {puedeEliminar && (
                          <button onClick={() => onAbrirEliminar(p)} title="Eliminar"
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
  );
}
