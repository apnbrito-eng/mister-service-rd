import { useState } from 'react';
import { doc, updateDoc, collection, getDocs, query, where, Timestamp, arrayUnion } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { OrdenServicio, Usuario, Personal } from '../../types';
import { useApp } from '../../context/AppContext';
import { crearRegistroAuditoria } from '../../utils';
import { crearNotificacion } from '../../services/notificaciones.service';
import { razonEnviarFacturacionDisabled } from '../../utils/tooltipsBotones';
import { Receipt, Check } from 'lucide-react';
import toast from 'react-hot-toast';

interface Props {
  orden: OrdenServicio;
  userProfile: Usuario | null;
}

/**
 * Marca la orden como "enviada a facturación" y notifica a admin/coordinadoras.
 * Requiere:
 *  - orden con un precio definido (cualquiera de: precioFinal, precioAprobado,
 *    precioSugerido > 0, o cotizacionId vinculado, o estadoAprobacion === 'aprobado')
 *  - al menos un pago registrado (montoPagado > 0)
 *  - usuario con permiso `ordenesEnviarAFacturacion`
 */
export default function EnviarFacturacionButton({ orden, userProfile }: Props) {
  const { currentUser } = useApp();
  const [saving, setSaving] = useState(false);

  const yaEnviada = !!orden.enviadaAFacturacion;
  // Solo requerimos al menos un pago registrado. El precio se infiere del pago si no existe explícito.
  const tienePago = Number(orden.montoPagado || 0) > 0;
  const habilitado = tienePago && !yaEnviada && !orden.facturada;

  const handleClick = async () => {
    if (!habilitado) return;
    if (!confirm('¿Enviar esta orden para emitir Conduce de Garantía? Admin/Coordinadora recibirá una notificación.')) return;

    setSaving(true);
    try {
      const usuario = userProfile?.nombre || 'Sistema';
      // SPRINT-114: usar auth.uid en vez de userProfile.id para que el campo
      // descriptivo `enviadaAFacturacionPorId` sea consistente con la
      // convención auth.uid del resto del esquema (gotcha CLAUDE.md
      // "userProfile.id NO siempre es auth.uid").
      const usuarioId = currentUser?.uid || '';
      const ahora = Timestamp.now();

      // 1) Marcar la orden
      const registro = crearRegistroAuditoria(
        usuario,
        'editar',
        'Orden enviada a facturación',
        'enviadaAFacturacion',
        'no',
        'sí',
      );
      await updateDoc(doc(db, 'ordenes_servicio', orden.id), {
        enviadaAFacturacion: true,
        enviadaAFacturacionAt: ahora,
        enviadaAFacturacionPorId: usuarioId,
        enviadaAFacturacionPorNombre: usuario,
        auditoria: arrayUnion(registro),
        updatedAt: ahora,
      });

      // SPRINT-158d-FIX (2026-05-15): optimistic UI — confirmar al usuario apenas
      // el updateDoc crítico resuelve. Las notificaciones al admin/coord viajan
      // fire-and-forget en background (no críticas para la operación; si fallan,
      // el doc YA está marcado `enviadaAFacturacion: true` y la próxima sesión las
      // muestra). Antes el botón quedaba en "Enviando..." 3-8s (a veces 30s en
      // conexiones lentas — caso Wilainy 2026-05-13 QA E2E) esperando getDocs +
      // Promise.all de notifs secuenciales. Diagnóstico estático en SPRINT-158d.
      toast.success('Enviada a conduce de garantía');
      setSaving(false);

      // 2) Notificar a admin + coordinadoras (fan-out) — fire-and-forget.
      void (async () => {
        try {
          const qAdmin = query(
            collection(db, 'personal'),
            where('activo', '==', true),
            where('rol', 'in', ['administrador', 'coordinadora']),
          );
          const snap = await getDocs(qAdmin);
          const destinatarios = snap.docs
            .map(d => ({ id: d.id, ...d.data() } as Personal))
            .filter(p => !!p.uid);

          await Promise.all(
            destinatarios.map(p =>
              crearNotificacion({
                userId: p.uid!,
                destinatarioNombre: p.nombre,
                tipo: 'orden_enviada_a_facturacion',
                titulo: 'Orden lista para conduce de garantía',
                mensaje: `${orden.numero || orden.id} — ${orden.clienteNombre}. Enviada por ${usuario}.`,
                ordenId: orden.id,
                ordenNumero: orden.numero,
              }),
            ),
          );
        } catch (err) {
          console.warn('No se pudieron crear todas las notificaciones:', err);
        }
      })();
    } catch (err) {
      console.error(err);
      toast.error('Error al enviar a conduce');
      setSaving(false);
    }
  };

  if (yaEnviada || orden.facturada) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200">
        <Check size={12} />
        {orden.facturada ? `Conduce ${orden.facturaNumero || ''}` : 'En proceso'}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!habilitado || saving}
      title={
        razonEnviarFacturacionDisabled({
          enviadaAFacturacion: orden.enviadaAFacturacion,
          facturada: orden.facturada,
          montoPagado: orden.montoPagado,
        }) || 'Enviar a conduce de garantía.'
      }
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-primary hover:bg-primary-medium text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      <Receipt size={12} />
      {saving ? 'Enviando...' : 'Enviar a conduce'}
    </button>
  );
}
