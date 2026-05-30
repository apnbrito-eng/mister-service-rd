import { useRef, useState } from 'react';
import { Camera, Loader2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../Modal';
import { subirFotoPieza, crearPiezaUsada, borrarFotoPieza } from '../../services/piezas.service';
import type { CondicionPieza, OrigenPieza, PiezaUsada } from '../../types';

/**
 * Modal de agregar / editar una pieza usada. Extraído de
 * `CierreServicioWizard.tsx` (Fase A2) para que se pueda reutilizar
 * desde el wizard del técnico y desde el panel admin de validación.
 *
 * Mantiene el MISMO shape de props que el sub-modal original:
 *   isOpen, ordenId, tecnicoId, tecnicoNombre, piezaEditando, onCancel, onSave.
 */

interface PiezaFormModalProps {
  isOpen: boolean;
  ordenId: string;
  tecnicoId: string;
  tecnicoNombre: string;
  piezaEditando: PiezaUsada | null;
  onCancel: () => void;
  onSave: (pieza: PiezaUsada) => void;
}

export default function PiezaFormModal({
  isOpen, ordenId, tecnicoId, tecnicoNombre, piezaEditando, onCancel, onSave,
}: PiezaFormModalProps) {
  const fotoInputRef = useRef<HTMLInputElement>(null);

  const [nombre, setNombre] = useState(piezaEditando?.nombre || '');
  const [marca, setMarca] = useState(piezaEditando?.marca || '');
  const [modelo, setModelo] = useState(piezaEditando?.modelo || '');
  const [condicion, setCondicion] = useState<CondicionPieza | null>(piezaEditando?.condicion || null);
  const [origen, setOrigen] = useState<OrigenPieza | null>(piezaEditando?.origen || null);
  const [cantidad, setCantidad] = useState<number>(piezaEditando?.cantidad || 1);
  const [costoUnitario, setCostoUnitario] = useState<number>(piezaEditando?.costoUnitario ?? 0);
  const [proveedor, setProveedor] = useState(piezaEditando?.proveedor || '');
  const [notas, setNotas] = useState(piezaEditando?.notas || '');
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string>(piezaEditando?.fotoUrl || '');
  const [fotoUrlExistente, setFotoUrlExistente] = useState<string | undefined>(piezaEditando?.fotoUrl);
  const [subiendoFoto, setSubiendoFoto] = useState(false);

  const costoTotal = Math.round((cantidad || 0) * (costoUnitario || 0) * 100) / 100;

  const puedeGuardar =
    !!nombre.trim() &&
    !!condicion &&
    !!origen &&
    cantidad > 0 &&
    costoUnitario >= 0 &&
    !subiendoFoto;

  const handleFotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFotoFile(file);
    setFotoPreview(URL.createObjectURL(file));
    setFotoUrlExistente(undefined);
  };

  const handleQuitarFoto = () => {
    if (fotoUrlExistente) void borrarFotoPieza(fotoUrlExistente);
    setFotoFile(null);
    setFotoPreview('');
    setFotoUrlExistente(undefined);
  };

  const handleGuardar = async () => {
    if (!puedeGuardar || !condicion || !origen) return;

    setSubiendoFoto(true);
    try {
      // Reusa el id de la pieza si estamos editando (para sobrescribir foto si cambió)
      const piezaId = piezaEditando?.id || crypto.randomUUID();
      let fotoUrl: string | undefined = fotoUrlExistente;

      if (fotoFile) {
        fotoUrl = await subirFotoPieza(ordenId, piezaId, fotoFile);
      }

      const pieza = crearPiezaUsada(
        {
          id: piezaId,
          nombre,
          marca,
          modelo,
          condicion,
          origen,
          cantidad,
          costoUnitario,
          proveedor: origen === 'comprada_externamente' ? proveedor : undefined,
          fotoUrl,
          notas,
        },
        { uid: tecnicoId, nombre: tecnicoNombre },
      );

      // Si estábamos editando, preservar los campos originales de "quién registró"
      // (el editor admin no debe figurar como creador; eso lo anota el caller vía editadaPor/editadaEn).
      if (piezaEditando) {
        pieza.registradaPor = piezaEditando.registradaPor;
        pieza.registradaPorNombre = piezaEditando.registradaPorNombre;
        pieza.registradaEn = piezaEditando.registradaEn;
        if (piezaEditando.aprobadaPorAdmin !== undefined) pieza.aprobadaPorAdmin = piezaEditando.aprobadaPorAdmin;
        if (piezaEditando.aprobadaEn !== undefined) pieza.aprobadaEn = piezaEditando.aprobadaEn;
        if (piezaEditando.aprobadaPor !== undefined) pieza.aprobadaPor = piezaEditando.aprobadaPor;
      }

      onSave(pieza);
    } catch (err: unknown) {
      console.error('[pieza] error al guardar:', err);
      const errMsg = err instanceof Error ? err.message : 'Error desconocido';
      if (errMsg.includes('Timeout')) {
        toast.error('La foto tardó mucho en subir. Verifica tu conexión e intenta de nuevo.');
      } else {
        toast.error('No se pudo guardar la pieza. Reintenta.');
      }
    } finally {
      setSubiendoFoto(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => { if (!subiendoFoto) onCancel(); }}
      title={piezaEditando ? 'Editar pieza' : 'Agregar pieza'}
      size="md"
    >
      <div className="space-y-4">
        {/* Nombre */}
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-1">
            Nombre de la pieza <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej: Bomba de agua"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary"
          />
        </div>

        {/* Marca y modelo */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Marca</label>
            <input
              type="text"
              value={marca}
              onChange={(e) => setMarca(e.target.value)}
              placeholder="Opcional"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Modelo</label>
            <input
              type="text"
              value={modelo}
              onChange={(e) => setModelo(e.target.value)}
              placeholder="Opcional"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary"
            />
          </div>
        </div>

        {/* Condición */}
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">
            Condición <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setCondicion('nueva')}
              className={`py-3 rounded-xl font-bold text-sm transition-all ${
                condicion === 'nueva'
                  ? 'bg-primary text-white shadow-md'
                  : 'bg-white border-2 border-gray-200 text-gray-700 hover:border-primary'
              }`}
            >
              ✨ Nueva
            </button>
            <button
              type="button"
              onClick={() => setCondicion('usada')}
              className={`py-3 rounded-xl font-bold text-sm transition-all ${
                condicion === 'usada'
                  ? 'bg-primary text-white shadow-md'
                  : 'bg-white border-2 border-gray-200 text-gray-700 hover:border-primary'
              }`}
            >
              ♻️ Usada
            </button>
          </div>
        </div>

        {/* Origen */}
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">
            Origen <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setOrigen('inventario_taller')}
              className={`py-3 px-2 rounded-xl font-semibold text-xs transition-all ${
                origen === 'inventario_taller'
                  ? 'bg-primary text-white shadow-md'
                  : 'bg-white border-2 border-gray-200 text-gray-700 hover:border-primary'
              }`}
            >
              🏭 Taller
            </button>
            <button
              type="button"
              onClick={() => setOrigen('inventario_vehiculo')}
              className={`py-3 px-2 rounded-xl font-semibold text-xs transition-all ${
                origen === 'inventario_vehiculo'
                  ? 'bg-primary text-white shadow-md'
                  : 'bg-white border-2 border-gray-200 text-gray-700 hover:border-primary'
              }`}
            >
              🚗 Vehículo
            </button>
            <button
              type="button"
              onClick={() => setOrigen('comprada_externamente')}
              className={`py-3 px-2 rounded-xl font-semibold text-xs transition-all ${
                origen === 'comprada_externamente'
                  ? 'bg-primary text-white shadow-md'
                  : 'bg-white border-2 border-gray-200 text-gray-700 hover:border-primary'
              }`}
            >
              🛒 Externa
            </button>
          </div>
        </div>

        {/* Cantidad + Costo unitario */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-1">
              Cantidad <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min={1}
              step={1}
              value={cantidad}
              onChange={(e) => setCantidad(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-1">
              Costo unitario (RD$) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={costoUnitario}
              onChange={(e) => setCostoUnitario(Math.max(0, Number(e.target.value) || 0))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary"
            />
          </div>
        </div>

        {/* Costo total computado */}
        <div className="bg-gray-50 rounded-lg p-3 text-right">
          <span className="text-xs text-gray-600">Costo total: </span>
          <span className="text-lg font-bold text-gray-900">RD${costoTotal.toFixed(2)}</span>
        </div>

        {/* Proveedor (solo si origen externo) */}
        {origen === 'comprada_externamente' && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Proveedor</label>
            <input
              type="text"
              value={proveedor}
              onChange={(e) => setProveedor(e.target.value)}
              placeholder="Ej: Ferretería del barrio"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary"
            />
          </div>
        )}

        {/* Foto */}
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">Foto (opcional)</label>
          <input
            ref={fotoInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFotoCapture}
            className="hidden"
          />
          {fotoPreview ? (
            <div className="space-y-2">
              <img src={fotoPreview} alt="Pieza" className="w-full rounded-xl border-2 border-green-200 max-h-48 object-contain bg-gray-50" />
              <button
                type="button"
                onClick={handleQuitarFoto}
                className="w-full flex items-center justify-center gap-1 py-2 text-xs text-gray-500 hover:text-gray-700"
              >
                <X size={12} /> Quitar foto
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fotoInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium text-sm transition-colors"
            >
              <Camera size={18} /> Tomar foto
            </button>
          )}
        </div>

        {/* Notas */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Notas</label>
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Opcional"
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary resize-none"
          />
        </div>

        {/* Botones */}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={subiendoFoto}
            className="py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold text-sm transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleGuardar}
            disabled={!puedeGuardar}
            className="py-3 bg-primary hover:bg-primary-medium text-white rounded-xl font-semibold text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {subiendoFoto ? (
              <><Loader2 size={16} className="animate-spin" /> Subiendo foto...</>
            ) : (
              piezaEditando ? 'Guardar cambios' : 'Agregar pieza'
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
