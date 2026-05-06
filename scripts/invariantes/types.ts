/**
 * Tipo común para los cazadores de invariantes.
 * Cada check-*.ts exporta `check()` que retorna InvariantResult.
 */
export interface InvariantHit {
  file: string;
  line: number;
  snippet: string;
  explanation: string;
}

export interface InvariantResult {
  patternId: string;
  patternName: string;
  status: 'pass' | 'fail' | 'warn';
  hits: InvariantHit[];
  /** Notas explicativas (info adicional, no son hits). */
  notes?: string[];
}

export const COLOR = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
};
