/**
 * EmptyState — placeholder visual amistoso cuando una lista/tabla no
 * tiene contenido.
 *
 * SPRINT-DISENO-D (2026-05-31). Reemplaza los "Sin datos" sueltos por
 * un patrón visual consistente: ícono + título + descripción + CTA
 * opcional. Diseñado para el lado admin (Inbox / Citas /
 * FacturacionPendiente, etc.) pero también sirve en páginas públicas.
 *
 * Convención: NO usar para loading inicial (para eso ver `Skeleton.tsx`
 * de SPRINT-DISENO-C). Usar SOLO cuando ya cargó y la lista quedó vacía.
 */
import type { ReactNode } from 'react';

interface EmptyStateProps {
  /** Ícono visual centrado arriba (típicamente un lucide-react). */
  icon?: ReactNode;
  /** Título corto y dominicano. Ej: "Sin conversaciones todavía". */
  titulo: string;
  /** Descripción 1-2 líneas que cuenta qué espera el sistema. */
  descripcion?: string;
  /** CTA opcional (botón / link). Composable. */
  accion?: ReactNode;
  /** Override de container className (margins/padding). */
  className?: string;
}

export default function EmptyState({
  icon,
  titulo,
  descripcion,
  accion,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center py-12 px-6 ${className}`}
    >
      {icon && <div className="text-gray-300 mb-3">{icon}</div>}
      <h3 className="text-base font-semibold text-gray-700 mb-1">{titulo}</h3>
      {descripcion && (
        <p className="text-sm text-gray-500 max-w-md">{descripcion}</p>
      )}
      {accion && <div className="mt-4">{accion}</div>}
    </div>
  );
}
