import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import Modal from '../Modal';
import { useApp } from '../../context/AppContext';
import { buscarClientePorTelefono } from '../../services/clientes.service';
import { suscribirSuplidores, leerEstadoChatEmpresa } from '../../services/suplidores.service';
import {
  construirMensajeConsulta, ocultarContactos, esFotoPiezaSegura, numeroWhatsAppSuplidor,
  enlaceWhatsAppDispositivo, evaluarChatEmpresa, filtrarSuplidores, type Suplidor,
} from '../../utils/consultaSuplidor';
import { validarFoto } from '../../utils/uploads';

interface PiezaConsulta {
  piezaFaltante: string;
  equipoTipo?: string;
  equipoMarca?: string;
  equipoModelo?: string;
  fotoUrl?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  pieza: PiezaConsulta | null;
}

type OrigenFoto = 'ninguna' | 'registrada' | 'dispositivo';

/**
 * Prepara la consulta de una pieza para un suplidor. Nada se envía desde aquí:
 * el usuario copia el mensaje, guarda la foto que eligió y abre el chat.
 * El mensaje no incluye datos del cliente.
 */
export default function ConsultaSuplidorModal({ isOpen, onClose, pieza }: Props) {
  const navigate = useNavigate();
  const { userProfile } = useApp();
  const puedeInbox = ['administrador', 'coordinadora', 'secretaria', 'operaria'].includes(userProfile?.rol || '');
  const [plantillaConfirmadaPara, setPlantillaConfirmadaPara] = useState('');
  const [suplidores, setSuplidores] = useState<Suplidor[]>([]);
  const [errorLista, setErrorLista] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [suplidorId, setSuplidorId] = useState('');
  const [detalle, setDetalle] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [origenFoto, setOrigenFoto] = useState<OrigenFoto>('ninguna');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [archivoUrl, setArchivoUrl] = useState('');
  const [fotoRevisada, setFotoRevisada] = useState(false);
  const [aviso, setAviso] = useState('');
  const [consultandoChat, setConsultandoChat] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    return suscribirSuplidores(l => { setSuplidores(l); setErrorLista(''); }, setErrorLista);
  }, [isOpen]);

  // Reinicio al abrir otra pieza: nunca arrastrar foto ni suplidor anterior.
  useEffect(() => {
    if (!isOpen || !pieza) return;
    setPlantillaConfirmadaPara(''); setSuplidorId(''); setBusqueda(''); setDetalle(''); setOrigenFoto('ninguna'); setArchivo(null); setFotoRevisada(false); setAviso('');
    setMensaje(construirMensajeConsulta({ piezaFaltante: pieza.piezaFaltante, equipoTipo: pieza.equipoTipo, equipoMarca: pieza.equipoMarca, equipoModelo: pieza.equipoModelo }).mensaje);
  }, [isOpen, pieza]);

  useEffect(() => {
    if (!archivo) { setArchivoUrl(''); return; }
    const url = URL.createObjectURL(archivo);
    setArchivoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [archivo]);

  const fotoRegistradaSegura = esFotoPiezaSegura(pieza?.fotoUrl);
  const activos = useMemo(() => filtrarSuplidores(suplidores, busqueda), [suplidores, busqueda]);
  const suplidor = suplidores.find(s => s.id === suplidorId && s.activo) || null;
  const fotoElegida = origenFoto === 'registrada' ? (fotoRegistradaSegura ? pieza!.fotoUrl! : '') : origenFoto === 'dispositivo' ? archivoUrl : '';
  const fotoLista = !!fotoElegida && fotoRevisada;

  if (!pieza) return null;

  const regenerar = () => {
    const r = construirMensajeConsulta({ piezaFaltante: pieza.piezaFaltante, equipoTipo: pieza.equipoTipo, equipoMarca: pieza.equipoMarca, equipoModelo: pieza.equipoModelo, detalle });
    setMensaje(r.mensaje);
    setAviso(r.ocultados ? `Se ocultaron ${r.ocultados} dato(s) de contacto escritos en la descripción.` : '');
  };

  const textoFinal = () => {
    const r = ocultarContactos(mensaje.trim());
    if (r.ocultados) setAviso(`Se ocultaron ${r.ocultados} dato(s) de contacto antes de copiar.`);
    return r.texto;
  };

  const copiar = async () => {
    const texto = textoFinal();
    if (!texto) { toast.error('El mensaje está vacío.'); return false; }
    try { await navigator.clipboard.writeText(texto); toast.success('Mensaje copiado'); return true; }
    catch { toast.error('No se pudo copiar. Selecciona el texto y cópialo manualmente.'); return false; }
  };

  const elegirArchivo = (f: File | null) => {
    setFotoRevisada(false);
    if (!f) { setArchivo(null); return; }
    const v = validarFoto(f);
    if (!v.ok) { toast.error(v.error); setArchivo(null); return; }
    setArchivo(f);
  };

  const abrirInbox = async () => {
    if (!suplidor || !puedeInbox) return;
    const numero = numeroWhatsAppSuplidor(suplidor.telefono);
    if (!numero) { toast.error('El teléfono del suplidor no es válido para WhatsApp.'); return; }
    setConsultandoChat(true);
    try {
      const cliente = await buscarClientePorTelefono(numero);
      if (cliente) { setAviso('Este teléfono pertenece a un cliente registrado. Revisa el teléfono del suplidor antes de continuar.'); return; }
      let id = numero;
      let estado = await leerEstadoChatEmpresa(numero);
      if (!estado.existe) { const corto = await leerEstadoChatEmpresa(numero.slice(1)); if (corto.existe) { estado = corto; id = numero.slice(1); } }
      const r = evaluarChatEmpresa(estado);
      if (!r.puede) { setAviso(r.motivo); return; }
      if (r.requierePlantilla && plantillaConfirmadaPara !== id) {
        setPlantillaConfirmadaPara(id);
        setAviso('Abrirás el Inbox para elegir y revisar una plantilla disponible. El texto de consulta y la foto no se envían automáticamente. Si no hay una plantilla adecuada para suplidores, no la envíes. Pulsa de nuevo para continuar.');
        return;
      }
      if (!r.requierePlantilla && !(await copiar())) return;
      toast(r.requierePlantilla ? 'Elige y revisa una plantilla en el Inbox; abrirlo no envía nada.' : 'Pega y revisa el mensaje en el Inbox. La foto elegida no se adjunta automáticamente.', { duration: 6000 });
      onClose();
      navigate(`/admin/inbox/${encodeURIComponent(id)}`);
    } catch {
      toast.error('No se pudo revisar el chat empresarial.');
    } finally {
      setConsultandoChat(false);
    }
  };

  const abrirDispositivo = () => {
    if (!suplidor) return;
    const url = enlaceWhatsAppDispositivo(suplidor.telefono, textoFinal());
    if (!url) { toast.error('El teléfono del suplidor no es válido para WhatsApp.'); return; }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Consultar pieza a suplidor" size="lg">
      <div className="space-y-4 text-sm">
        <p className="text-gray-600">El mensaje solo lleva la pieza, el equipo y el modelo. No incluye nombre, teléfono ni dirección del cliente. Nada se envía automáticamente.</p>

        <fieldset className="space-y-2">
          <legend className="font-semibold text-gray-800">1. Suplidor</legend>
          {errorLista && <p role="alert" className="text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">{errorLista}</p>}
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar por nombre o especialidad" aria-label="Buscar suplidor"
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5" />
          <select value={suplidorId} onChange={e => { setSuplidorId(e.target.value); setPlantillaConfirmadaPara(''); setAviso(''); }} aria-label="Suplidor"
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 min-h-[44px]">
            <option value="">Selecciona un suplidor</option>
            {activos.map(s => <option key={s.id} value={s.id}>{s.nombre} · {s.especialidad}</option>)}
          </select>
          {suplidores.length === 0 && !errorLista && <p className="text-gray-500">No hay suplidores. Regístralos en la pestaña Suplidores.</p>}
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="font-semibold text-gray-800">2. Mensaje</legend>
          <label className="block">Detalle técnico (opcional)
            <input value={detalle} onChange={e => setDetalle(e.target.value)} maxLength={500}
              placeholder="Ej.: número de parte, voltaje, medidas" className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5" />
          </label>
          <button type="button" onClick={regenerar} className="border rounded-xl px-3 py-2 min-h-[44px]">Rehacer mensaje con el detalle</button>
          <textarea value={mensaje} onChange={e => setMensaje(e.target.value)} rows={6} maxLength={1500} aria-label="Mensaje para el suplidor"
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 font-mono text-xs" />
          {aviso && <p role="status" className="text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">{aviso}</p>}
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="font-semibold text-gray-800">3. Foto (opcional)</legend>
          <div className="flex flex-wrap gap-3">
            <label className="flex items-center gap-2"><input type="radio" name="origenFoto" checked={origenFoto === 'ninguna'} onChange={() => { setOrigenFoto('ninguna'); setFotoRevisada(false); }} /> Sin foto</label>
            {fotoRegistradaSegura && <label className="flex items-center gap-2"><input type="radio" name="origenFoto" checked={origenFoto === 'registrada'} onChange={() => { setOrigenFoto('registrada'); setFotoRevisada(false); }} /> Foto registrada de la pieza</label>}
            <label className="flex items-center gap-2"><input type="radio" name="origenFoto" checked={origenFoto === 'dispositivo'} onChange={() => { setOrigenFoto('dispositivo'); setFotoRevisada(false); }} /> Foto de este dispositivo</label>
          </div>
          {pieza.fotoUrl && !fotoRegistradaSegura && <p className="text-gray-500">La foto registrada no está en la ruta segura de piezas; no se muestra ni se ofrece.</p>}
          {origenFoto === 'dispositivo' && (
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => elegirArchivo(e.target.files?.[0] || null)} aria-label="Elegir foto" />
          )}
          {fotoElegida && (
            <>
              <img src={fotoElegida} alt="Vista previa de la foto para el suplidor" className="w-full max-h-64 object-contain rounded-xl border" />
              <label className="flex items-start gap-2">
                <input type="checkbox" checked={fotoRevisada} onChange={e => setFotoRevisada(e.target.checked)} className="mt-1" />
                <span>Revisé la foto: no se ven nombre, dirección, documentos, caras ni el interior de la casa del cliente.</span>
              </label>
            </>
          )}
          {fotoLista && (
            origenFoto === 'dispositivo'
              ? <a href={archivoUrl} download="pieza-consulta.jpg" className="inline-block border rounded-xl px-4 py-2.5 min-h-[44px]">Guardar foto para adjuntarla</a>
              : <a href={fotoElegida} target="_blank" rel="noopener noreferrer" className="inline-block border rounded-xl px-4 py-2.5 min-h-[44px]">Abrir foto para guardarla</a>
          )}
        </fieldset>

        <div className="border-t pt-4 space-y-2">
          <p className="font-semibold text-gray-800">4. Abrir chat (tú envías)</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={copiar} className="border rounded-xl px-4 py-2.5 min-h-[44px]">Copiar mensaje</button>
            <button type="button" disabled={!suplidor || !puedeInbox || consultandoChat} onClick={abrirInbox}
              className="bg-primary text-white rounded-xl px-4 py-2.5 min-h-[44px] disabled:opacity-50">{consultandoChat ? 'Revisando…' : plantillaConfirmadaPara ? 'Continuar al Inbox para elegir plantilla' : 'Inbox empresarial'}</button>
            <button type="button" disabled={!suplidor} onClick={abrirDispositivo}
              className="border rounded-xl px-4 py-2.5 min-h-[44px] disabled:opacity-50">WhatsApp de este dispositivo</button>
          </div>
          <p className="text-xs text-gray-500">
            Inbox empresarial: con ventana abierta puedes pegar el texto; con ventana cerrada o sin conversación puedes elegir una plantilla disponible y revisarla antes de enviar. La foto seleccionada aquí no se adjunta al Inbox. En el Inbox puedes elegir manualmente una imagen y revisar su envío si la ventana está abierta.
            WhatsApp de este dispositivo abre la cuenta instalada en este teléfono o computadora, que no es la línea empresarial.
          </p>
        </div>
      </div>
    </Modal>
  );
}
