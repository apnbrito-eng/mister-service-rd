import { useEffect, useMemo, useState } from 'react';
import { arrayUnion, doc, Timestamp, updateDoc } from 'firebase/firestore';
import { Pencil, Plus, Trash2, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { db } from '../../firebase/config';
import { useApp } from '../../context/AppContext';
import { crearRegistroAuditoria, formatMoneda } from '../../utils';
import { iconoCondicion, iconoOrigen, etiquetaOrigen } from '../../utils/piezas';
import { calcularTotales, borrarFotoPieza } from '../../services/piezas.service';
import type { OrdenServicio, PiezaUsada } from '../../types';
import Modal from '../Modal';
import PiezaFormModal from './PiezaFormModal';

/**
 * Modal de edición masiva de piezas de una orden (Fase A2).
 * - Muestra todas las piezas registradas por el técnico.
 * - Permite editar, eliminar y agregar piezas.
 * - Al guardar escribe el array actualizado + recalcula costoPiezasTotal
 *   y cantidadPiezasUsadas + agrega entrada a `auditoria`.
 * - Cada pieza tocada por el admin se marca con editadaPor/editadaEn,
 *   preservando registradaPor/registradaPorNombre/registradaEn original.
 *
 * Props:
 *   orden: si null, el modal está cerrado.
 *   onClose: cierra el modal.
 */

interface Props {
  orden: OrdenServicio | null;
  onClose: () => void;
}

export default function ModalEditarPiezasOrden({ orden, onClose }: Props) {
  const { userProfile, currentUser } = useApp();
  const [piezas, setPiezas] = useState<PiezaUsada[]>([]);
  const [modalPiezaAbierto, setModalPiezaAbierto] = useState(false);
  const [piezaEditandoIdx, setPiezaEditandoIdx] = useState<number | null>(null);
  const [guardando, setGuardando] = useState(false);
  // Track de ids editados/agregados por el admin en esta sesión (para marcar editadaPor/editadaEn)
  const [idsTocados, setIdsTocados] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (orden?.cierreServicio?.piezasUsadas) {
      setPiezas(orden.cierreServicio.piezasUsadas.map(p => ({ ...p })));
      setIdsTocados(new Set());
    } else {
      setPiezas([]);
      setIdsTocados(new Set());
    }
    setModalPiezaAbierto(false);
    setPiezaEditandoIdx(null);
  }, [orden?.id]);

  const totales = useMemo(() => calcularTotales(piezas), [piezas]);

  if (!orden) return null;

  const adminUid = currentUser?.uid || '';
  const adminNombre = userProfile?.nombre || userProfile?.email || 'Admin';

  const abrirAgregar = () => {
    setPiezaEditandoIdx(null);
    setModalPiezaAbierto(true);
  };

  const abrirEditar = (idx: number) => {
    setPiezaEditandoIdx(idx);
    setModalPiezaAbierto(true);
  };

  const eliminar = (idx: number) => {
    const p = piezas[idx];
    if (!p) return;
    if (!window.confirm(`¿Eliminar la pieza "${p.nombre}"?`)) return;
    if (p.fotoUrl) {
      void borrarFotoPieza(p.fotoUrl);
    }
    setPiezas(prev => prev.filter((_, i) => i !== idx));
    // Marcamos como "tocado" virtualmente para que la auditoría refleje cambio;
    // no hace falta rastrear id eliminado — el diff queda al guardar.
  };

  const guardarPieza = (pieza: PiezaUsada) => {
    setIdsTocados(prev => {
      const next = new Set(prev);
      next.add(pieza.id);
      return next;
    });
    if (piezaEditandoIdx !== null) {
      setPiezas(prev => prev.map((p, i) => i === piezaEditandoIdx ? pieza : p));
    } else {
      setPiezas(prev => [...prev, pieza]);
    }
    setModalPiezaAbierto(false);
    setPiezaEditandoIdx(null);
  };

  const handleGuardarCambios = async () => {
    if (!currentUser) {
      toast.error('Sesión expirada.');
      return;
    }
    setGuardando(true);
    try {
      const now = Timestamp.now();

      // Armar el array final: normalizar fechas a Timestamp para consistencia en Firestore,
      // marcar editadaPor/editadaEn en las piezas que tocó el admin en esta sesión.
      const piezasFinal = piezas.map(p => {
        const base: Record<string, unknown> = {
          id: p.id,
          nombre: p.nombre,
          condicion: p.condicion,
          origen: p.origen,
          cantidad: p.cantidad,
          costoUnitario: p.costoUnitario,
          costoTotal: p.costoTotal,
          registradaPor: p.registradaPor,
          registradaPorNombre: p.registradaPorNombre,
          registradaEn: p.registradaEn instanceof Date ? Timestamp.fromDate(p.registradaEn) : p.registradaEn,
          aprobadaPorAdmin: p.aprobadaPorAdmin ?? false,
        };
        if (p.marca !== undefined) base.marca = p.marca;
        if (p.modelo !== undefined) base.modelo = p.modelo;
        if (p.proveedor !== undefined) base.proveedor = p.proveedor;
        if (p.fotoUrl !== undefined) base.fotoUrl = p.fotoUrl;
        if (p.notas !== undefined) base.notas = p.notas;
        if (p.aprobadaEn !== undefined) {
          base.aprobadaEn = p.aprobadaEn instanceof Date ? Timestamp.fromDate(p.aprobadaEn) : p.aprobadaEn;
        }
        if (p.aprobadaPor !== undefined) base.aprobadaPor = p.aprobadaPor;
        // Admin edit trail
        if (idsTocados.has(p.id)) {
          base.editadaPor = adminUid;
          base.editadaEn = now;
        } else {
          if (p.editadaPor !== undefined) base.editadaPor = p.editadaPor;
          if (p.editadaEn !== undefined) {
            base.editadaEn = p.editadaEn instanceof Date ? Timestamp.fromDate(p.editadaEn) : p.editadaEn;
          }
        }
        // Strip undefined (convención CLAUDE.md)
        return Object.fromEntries(Object.entries(base).filter(([, v]) => v !== undefined));
      });

      const registro = crearRegistroAuditoria(
        adminNombre,
        'editar_piezas',
        `Editó las piezas del cierre: ${piezasFinal.length} pieza${piezasFinal.length === 1 ? '' : 's'} · Costo total ${formatMoneda(totales.costoTotal)}`,
      );

      await updateDoc(doc(db, 'ordenes_servicio', orden.id), {
        'cierreServicio.piezasUsadas': piezasFinal,
        costoPiezasTotal: totales.costoTotal,
        cantidadPiezasUsadas: totales.cantidadTotal,
        auditoria: arrayUnion(registro),
        updatedAt: now,
      });

      toast.success('Cambios guardados');
      onClose();
    } catch (err) {
      console.error('[editar-piezas] error:', err);
      toast.error('No se pudieron guardar los cambios. Reintenta.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <>
      <Modal
        isOpen={!!orden}
        onClose={() => { if (!guardando) onClose(); }}
        title={`Editar piezas · ${orden.numero}`}
        size="lg"
      >
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-sm">
            <p className="font-medium text-gray-900">{orden.clienteNombre}</p>
            <p className="text-xs text-gray-600">
              {orden.equipoTipo}{orden.equipoMarca ? ` · ${orden.equipoMarca}` : ''}
              {orden.cierreServicio?.tecnicoNombre && ` · Técnico: ${orden.cierreServicio.tecnicoNombre}`}
            </p>
          </div>

          {piezas.length === 0 ? (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center text-sm text-gray-500">
              No hay piezas. Agrega una para continuar.
            </div>
          ) : (
            <div className="space-y-2">
              {piezas.map((p, idx) => (
                <div key={p.id} className="border border-gray-200 rounded-lg p-3 bg-white">
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-gray-900 truncate">
                        📦 {p.nombre}{p.marca ? ` · ${p.marca}` : ''}{p.modelo ? ` · ${p.modelo}` : ''}
                      </div>
                      <div className="text-xs text-gray-600 mt-0.5">
                        {iconoCondicion(p.condicion)} {p.condicion === 'nueva' ? 'Nueva' : 'Usada'}
                        {' · '}
                        {iconoOrigen(p.origen)} {etiquetaOrigen(p.origen)}
                        {p.proveedor && ` · ${p.proveedor}`}
                      </div>
                      <div className="text-xs text-gray-700 mt-0.5">
                        {p.cantidad} × {formatMoneda(p.costoUnitario)} = <span className="font-semibold">{formatMoneda(p.costoTotal)}</span>
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        Registrada por {p.registradaPorNombre || 'técnico'}
                        {idsTocados.has(p.id) && (
                          <span className="ml-2 text-amber-700">· (editada ahora por admin)</span>
                        )}
                      </div>
                      {p.notas && <p className="text-[11px] italic text-gray-600 mt-0.5">Notas: {p.notas}</p>}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => abrirEditar(idx)}
                        className="p-2 text-gray-500 hover:text-[#0f3460] hover:bg-gray-50 rounded-lg"
                        aria-label="Editar pieza"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => eliminar(idx)}
                        className="p-2 text-gray-500 hover:text-red-600 hover:bg-gray-50 rounded-lg"
                        aria-label="Eliminar pieza"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={abrirAgregar}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-white border-2 border-dashed border-gray-300 hover:border-[#0f3460] text-gray-700 rounded-xl font-semibold text-sm transition-colors"
          >
            <Plus size={16} /> Agregar pieza
          </button>

          {piezas.length > 0 && (
            <div className="bg-gray-50 rounded-lg p-3 text-right text-sm">
              <span className="text-gray-600">Total: </span>
              <span className="font-bold text-gray-900">{totales.cantidadTotal} piezas · {formatMoneda(totales.costoTotal)}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={guardando}
              className="py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold text-sm disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleGuardarCambios}
              disabled={guardando}
              className="py-3 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-xl font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {guardando ? <><Loader2 size={16} className="animate-spin" /> Guardando...</> : 'Guardar cambios'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Sub-modal de agregar / editar pieza individual */}
      {modalPiezaAbierto && (
        <PiezaFormModal
          isOpen={modalPiezaAbierto}
          ordenId={orden.id}
          tecnicoId={piezaEditandoIdx !== null
            ? piezas[piezaEditandoIdx].registradaPor
            : (orden.cierreServicio?.tecnicoId || orden.tecnicoId || adminUid)}
          tecnicoNombre={piezaEditandoIdx !== null
            ? piezas[piezaEditandoIdx].registradaPorNombre
            : (orden.cierreServicio?.tecnicoNombre || orden.tecnicoNombre || adminNombre)}
          piezaEditando={piezaEditandoIdx !== null ? piezas[piezaEditandoIdx] : null}
          onCancel={() => { setModalPiezaAbierto(false); setPiezaEditandoIdx(null); }}
          onSave={guardarPieza}
        />
      )}
    </>
  );
}
