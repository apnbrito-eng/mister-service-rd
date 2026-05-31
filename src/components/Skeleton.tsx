/**
 * Skeleton — placeholders de carga que respetan el layout final.
 *
 * SPRINT-DISENO-C (2026-05-31): reemplaza `<LoadingSpinner />` en las
 * páginas críticas (Dashboard, Ordenes, Inbox) por skeletons que dan la
 * sensación de "la pantalla está armándose" en vez de "espere, todavía
 * nada cargó". El usuario percibe la app como más rápida y menos
 * intermitente.
 *
 * Convención: cada página exporta su propio composite a partir de las
 * primitivas `<SkeletonBox>` y `<SkeletonText>`. No usar afuera de
 * pantallas de carga inicial (no para inputs vacíos en runtime — para
 * eso usar `<EmptyState>` de SPRINT-DISENO-D).
 */

interface SkeletonBoxProps {
  /** Clases Tailwind para forma + tamaño (ej: "h-12 w-full rounded-xl"). */
  className?: string;
}

/**
 * Bloque base con animación pulse. Cualquier tamaño/forma vía Tailwind.
 */
export function SkeletonBox({ className = '' }: SkeletonBoxProps) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse bg-gray-200 rounded ${className}`}
    />
  );
}

/**
 * Línea de texto con altura estándar. Usar para títulos / párrafos /
 * etiquetas.
 */
export function SkeletonText({ className = '' }: SkeletonBoxProps) {
  return <SkeletonBox className={`h-4 ${className}`} />;
}

/**
 * Composite tipo card KPI (Dashboard) — caja con icono + título +
 * número grande.
 */
export function SkeletonKpiCard() {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex flex-col gap-3 w-full">
      <SkeletonBox className="h-10 w-10 rounded-xl" />
      <div className="space-y-2">
        <SkeletonText className="w-24" />
        <SkeletonBox className="h-8 w-20 rounded" />
        <SkeletonText className="w-16 h-3" />
      </div>
    </div>
  );
}

/**
 * Composite tipo bloque-sección (caja blanca con header + filas).
 * Default 4 filas; ajustable.
 */
export function SkeletonSectionBlock({ rows = 4 }: { rows?: number }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-3">
      <SkeletonText className="w-1/3 h-5" />
      <div className="space-y-2 mt-4">
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonBox key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

/**
 * Skeleton para una fila de conversación del Inbox.
 */
export function SkeletonConversacionRow() {
  return (
    <li className="bg-white rounded-lg border border-gray-100 p-3 flex gap-3 items-center">
      <SkeletonBox className="h-10 w-10 rounded-full flex-shrink-0" />
      <div className="flex-1 min-w-0 space-y-2">
        <SkeletonText className="w-1/3" />
        <SkeletonText className="w-2/3 h-3" />
      </div>
      <SkeletonText className="w-12 h-3" />
    </li>
  );
}

/**
 * Skeleton para una orden tipo card (Ordenes /tablero).
 */
export function SkeletonOrdenCard() {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
      <div className="flex justify-between items-start">
        <SkeletonText className="w-20" />
        <SkeletonBox className="h-6 w-16 rounded-full" />
      </div>
      <SkeletonText className="w-3/4" />
      <SkeletonText className="w-1/2 h-3" />
      <div className="flex gap-2 pt-2">
        <SkeletonBox className="h-6 w-6 rounded-full" />
        <SkeletonText className="w-24 h-3 mt-1" />
      </div>
    </div>
  );
}
