import { Key, Eye, EyeOff, Link2 } from 'lucide-react';
import type { Personal, Rol } from '../../types';
import { ROLES_CON_ACCESO } from '../../types';
import { ROL_LABELS, ROLES_CON_COMISION, ROL_SELECT_ORDEN } from '../../utils/personal';

/**
 * Form interno del modal de alta / edición de empleados de PersonalPage.
 *
 * Refactor SPRINT-142a (2026-05-11): extraído de `PersonalPage.tsx` (1713 líneas)
 * para reducir el monolito. La lógica de submit, vinculación de cuenta y reset
 * de password sigue viviendo en PersonalPage — este componente solo renderiza
 * el form y delega via callbacks. State del form se levanta (lifted state)
 * porque PersonalPage controla el ciclo de vida del modal y persiste el
 * payload final hacia Firestore.
 *
 * SPRINT-142d (2026-05-11): constantes ROL_LABELS / ROLES_CON_COMISION /
 * ROL_SELECT_ORDEN movidas a `utils/personal.ts` (single source of truth).
 */

export type FormPersonal = Omit<Personal, 'id'>;

export interface FormAltaEditarEmpleadoProps {
  /** Estado del form, controlado por PersonalPage (lifted state) */
  form: FormPersonal;
  setForm: React.Dispatch<React.SetStateAction<FormPersonal>>;

  /** Id del personal que se está editando, o null si es alta nueva */
  editingId: string | null;
  /** Lista de personal — usada para resolver `personal.find(p => p.id === editingId)` */
  personal: Personal[];
  /** Operarias y secretarias que se pueden asignar como "operaria a cargo" de un técnico */
  operariasDisponibles: Personal[];

  /** Credenciales del flujo de acceso al sistema */
  emailAcceso: string;
  setEmailAcceso: (v: string) => void;
  passwordAcceso: string;
  setPasswordAcceso: (v: string) => void;
  showPasswordAcceso: boolean;
  setShowPasswordAcceso: React.Dispatch<React.SetStateAction<boolean>>;

  /** Si comisión fue editada manualmente (no debe recalcularse al cambiar nivel) */
  setComisionTocada: (v: boolean) => void;

  /** Flag de submit en progreso */
  saving: boolean;

  /** Handlers que viven en PersonalPage */
  onSubmit: (e: React.FormEvent) => Promise<void> | void;
  onCancel: () => void;
  onRolChange: (rol: Rol) => void;
  onNivelChange: (nivel: 'junior' | 'senior') => void;
  onAbrirResetPassword: (p: Personal) => void;
  onAbrirVincularExistente: (p: Personal) => void;
}

export default function FormAltaEditarEmpleado({
  form,
  setForm,
  editingId,
  personal,
  operariasDisponibles,
  emailAcceso,
  setEmailAcceso,
  passwordAcceso,
  setPasswordAcceso,
  showPasswordAcceso,
  setShowPasswordAcceso,
  setComisionTocada,
  saving,
  onSubmit,
  onCancel,
  onRolChange,
  onNivelChange,
  onAbrirResetPassword,
  onAbrirVincularExistente,
}: FormAltaEditarEmpleadoProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
        <input
          type="text"
          value={form.nombre}
          onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-medium"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Rol *</label>
        <select
          value={form.rol}
          onChange={(e) => onRolChange(e.target.value as Rol)}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-medium"
        >
          {ROL_SELECT_ORDEN.map((r) => (
            <option key={r} value={r}>
              {ROL_LABELS[r]}
            </option>
          ))}
        </select>
        <p className="text-[11px] text-gray-400 mt-1">
          {form.rol === 'ayudante'
            ? 'Los ayudantes tienen acceso limitado solo al módulo de Ponche.'
            : 'Este rol tiene acceso al sistema — se creará una cuenta de login.'}
        </p>
      </div>

      {/* Sección Acceso al sistema — solo para roles con login */}
      {ROLES_CON_ACCESO.includes(form.rol) && (
        <div className="bg-blue-50/40 border border-blue-100 rounded-lg p-3 space-y-3">
          <div className="flex items-center gap-2">
            <Key size={14} className="text-primary-medium" />
            <h3 className="text-xs font-semibold text-primary uppercase tracking-wide">Acceso al sistema</h3>
          </div>
          {(() => {
            const personalActual = editingId ? personal.find((p) => p.id === editingId) : null;
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
                    onClick={() => onAbrirResetPassword(personalActual)}
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
                  <p className="text-xs text-amber-800">Este personal aún no tiene cuenta de login.</p>
                  {personalActual && (
                    <button
                      type="button"
                      onClick={() => onAbrirVincularExistente(personalActual)}
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
                    onChange={(e) => setEmailAcceso(e.target.value)}
                    placeholder="usuario@misterservicerd.com"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-medium"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">Este email es distinto al email de contacto. Se usará para iniciar sesión.</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Contraseña inicial *</label>
                  <div className="relative">
                    <input
                      type={showPasswordAcceso ? 'text' : 'password'}
                      value={passwordAcceso}
                      onChange={(e) => setPasswordAcceso(e.target.value)}
                      placeholder="Mínimo 8 caracteres"
                      minLength={8}
                      className="w-full px-3 py-2 pr-10 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-medium"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasswordAcceso((v) => !v)}
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
            onChange={(e) => {
              // SPRINT-142a / cazador P-006 (post-c4be345): buscar por uid|id para
              // soportar docs legacy con `operariaId = personal.id` (pre-migración).
              const op = operariasDisponibles.find((o) => (o.uid || o.id) === e.target.value);
              setForm((f) => ({
                ...f,
                operariaId: e.target.value,
                operariaNombre: op?.nombre || '',
              }));
            }}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-medium"
          >
            <option value="">Sin asignar</option>
            {operariasDisponibles.map((op) => (
              // Cazador P-006: `value={op.uid || op.id}` preserva compatibilidad legacy.
              // Las operarias nuevas (post-SPRINT-105) tienen uid; las viejas conservan id.
              <option key={op.id} value={op.uid || op.id}>
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
              onChange={(e) => onNivelChange(e.target.value as 'junior' | 'senior')}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-medium"
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
              onChange={(e) => {
                setComisionTocada(true);
                const val = e.target.value === '' ? undefined : Number(e.target.value);
                setForm((f) => ({ ...f, comisionPorcentaje: val }));
              }}
              placeholder="10"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-medium"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Sueldo base mensual (RD$)</label>
            <input
              type="number"
              min={0}
              step={100}
              value={form.sueldoBase ?? ''}
              onChange={(e) => {
                const val = e.target.value === '' ? 0 : Number(e.target.value);
                setForm((f) => ({ ...f, sueldoBase: val }));
              }}
              placeholder="50000"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-medium"
            />
            <p className="text-[10px] text-gray-500 mt-1">
              Sueldo mensual completo. El sistema lo divide automáticamente en 2 para cada quincena.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
          <input
            type="tel"
            value={form.telefono}
            onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-medium"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-medium"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Especialidad</label>
          <input
            type="text"
            value={form.especialidad}
            onChange={(e) => setForm((f) => ({ ...f, especialidad: e.target.value }))}
            placeholder="Ej: Refrigeración, Lavadoras..."
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-medium"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Zona</label>
          <input
            type="text"
            value={form.zona}
            onChange={(e) => setForm((f) => ({ ...f, zona: e.target.value }))}
            placeholder="Ej: Santo Domingo, DN..."
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-medium"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Horario</label>
          <input
            type="text"
            value={form.horario}
            onChange={(e) => setForm((f) => ({ ...f, horario: e.target.value }))}
            placeholder="Ej: 8:00 AM - 5:00 PM"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-medium"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Color en mapa</label>
          <input
            type="color"
            value={form.color}
            onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
            className="w-full h-10 border border-gray-200 rounded-lg cursor-pointer"
          />
        </div>
      </div>

      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.disponibilidad}
            onChange={(e) => setForm((f) => ({ ...f, disponibilidad: e.target.checked }))}
            className="rounded border-gray-300 text-primary-medium focus:ring-primary-medium"
          />
          Disponible
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.activo}
            onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))}
            className="rounded border-gray-300 text-primary-medium focus:ring-primary-medium"
          />
          Activo
        </label>
      </div>

      {/* Acceso al Asistente IA */}
      {(() => {
        const iaBloqueada = form.rol === 'tecnico' || form.rol === 'ayudante';
        return (
          <div className="mt-2 pt-4 border-t border-gray-100">
            <h3 className="text-sm font-semibold text-primary uppercase tracking-wide mb-2">Acceso al Asistente IA</h3>
            <label
              className={`flex items-start gap-2 ${iaBloqueada ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
              title={iaBloqueada ? 'Disponible en una fase futura del proyecto' : undefined}
            >
              <input
                type="checkbox"
                checked={form.iaHabilitada === true}
                disabled={iaBloqueada}
                onChange={(e) => setForm((f) => ({ ...f, iaHabilitada: e.target.checked }))}
                className="mt-1 rounded border-gray-300 text-primary-medium focus:ring-primary-medium"
              />
              <span className="text-sm text-gray-800">Habilitar acceso al Asistente IA</span>
            </label>
            <p className="text-xs text-gray-500 mt-1 ml-6">
              Si está activo, este usuario verá un chat flotante en la esquina inferior derecha para hacerle preguntas a la IA del sistema.
            </p>
          </div>
        );
      })()}

      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={saving}
          className="px-6 py-2 bg-primary hover:bg-primary-medium text-white rounded-lg text-sm font-medium disabled:opacity-60"
        >
          {saving ? 'Guardando...' : editingId ? 'Actualizar' : 'Crear'}
        </button>
      </div>
    </form>
  );
}
