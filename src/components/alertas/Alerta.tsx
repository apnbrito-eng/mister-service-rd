/**
 * Componente de alerta inline para avisos consistentes en toda la app.
 *
 * Base del Lote A del encargo `docs/entregas/AUDITORIA-ALERTAS-2026-10-08.md`:
 * severidades definidas (exito/atencion/fallo/info/neutro), texto+ícono
 * siempre juntos, contraste AA, aria-live correcto por severidad.
 *
 * El componente NO oculta el ícono por defecto; se puede sobreescribir con
 * la prop `icono` o apagar con `icono={false}` en contextos muy compactos
 * donde el texto por sí solo ya transmite el estado (ej. chip ya rotulado).
 *
 * No cambia prioridades existentes ni introduce timers; es puro
 * presentador. Para persistencia o reintentos, el consumidor decide.
 */
import type { ReactNode } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, MinusCircle } from 'lucide-react';
import type { SeveridadAlerta } from './claseAlerta';

interface AlertaProps {
  /** Severidad del aviso — determina color, ícono y aria. */
  severidad: SeveridadAlerta;
  /** Título opcional en negrita (sobre primera línea). */
  titulo?: ReactNode;
  /** Mensaje principal. */
  children: ReactNode;
  /** Acciones opcionales (botones/enlaces). Ej.: Reintentar, Editar. */
  acciones?: ReactNode;
  /**
   * Ícono override. `undefined` usa el ícono por severidad; `false` lo
   * oculta (sólo cuando el entorno YA transmite el estado con texto —
   * p. ej. chip rotulado al lado).
   */
  icono?: ReactNode | false;
  /** Clases extra sobre el contenedor. */
  className?: string;
}

const ICONO_POR_SEVERIDAD: Record<SeveridadAlerta, ReactNode> = {
  exito: <CheckCircle2 size={18} aria-hidden="true" />,
  atencion: <AlertTriangle size={18} aria-hidden="true" />,
  fallo: <AlertCircle size={18} aria-hidden="true" />,
  info: <Info size={18} aria-hidden="true" />,
  neutro: <MinusCircle size={18} aria-hidden="true" />,
};

const ETIQUETA_SR: Record<SeveridadAlerta, string> = {
  exito: 'Confirmado',
  atencion: 'Atención',
  fallo: 'Error',
  info: 'Información',
  neutro: 'Nota',
};

export default function Alerta({
  severidad,
  titulo,
  children,
  acciones,
  icono,
  className,
}: AlertaProps) {
  const esFallo = severidad === 'fallo';
  const iconoRender =
    icono === false ? null : icono !== undefined ? icono : ICONO_POR_SEVERIDAD[severidad];
  // `role="alert"` para fallos/bloqueos (lectores interrumpen); el resto va
  // en `aria-live="polite"` para no gritar progreso. Nunca `assertive`
  // automático: el usuario no debe recibir anuncios reiterativos.
  const ariaProps = esFallo
    ? ({ role: 'alert' as const })
    : ({ role: 'status' as const, 'aria-live': 'polite' as const });

  return (
    <div className={`alerta alerta-${severidad}${className ? ` ${className}` : ''}`} {...ariaProps}>
      {iconoRender && (
        <span className="alerta-icono">
          {iconoRender}
          <span className="sr-only">{ETIQUETA_SR[severidad]}:</span>
        </span>
      )}
      <div className="alerta-contenido">
        {titulo && <strong>{titulo}</strong>}
        {children}
        {acciones && <div className="alerta-acciones">{acciones}</div>}
      </div>
    </div>
  );
}
