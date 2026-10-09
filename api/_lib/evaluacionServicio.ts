// Validadores y helpers del Portal del Cliente — evaluación final.
//
// Historia de versiones (shape persistido en `ordenes_servicio/{id}.evaluacionServicio`):
//
//   v1 (compat lectura): `{ version: 1, escala, categorias: {puntualidad, trato, claridad, calidad}, comentario, fecha }`
//        Cliente evaluaba 4 categorías en un solo bloque. Writer legacy.
//
//   v2 (writer actual): `{ version: 2, escala, atencion, tecnico, comentario, fecha, participantes }`
//        Decisión 2026-10-09 (Jorge): el cliente evalúa POR SEPARADO atención al cliente
//        (secretaria u operaria) y servicio técnico. Los dos lados son opcionales
//        individualmente, pero al menos UNO debe venir con todas sus categorías.
//        `participantes` captura identidades de servidor (UIDs) extraídas del doc
//        de la orden — NUNCA se aceptan del body del cliente. Si la orden no tiene
//        identificadores fiables, se persiste `null` + `atribucion*Confiable: false`
//        en vez de inferir por nombre.

export const categoriasTecnico = ['puntualidad', 'trato', 'claridad', 'calidad'] as const;
export const categoriasAtencion = ['puntualidad', 'trato', 'claridad'] as const;
// Alias legacy — algunos tests y lectores viejos siguen importando `categoriasEvaluacion`.
export const categoriasEvaluacion = categoriasTecnico;

export type EvaluacionTecnico = Record<typeof categoriasTecnico[number], number>;
export type EvaluacionAtencion = Record<typeof categoriasAtencion[number], number>;
// Alias legacy del tipo v1 — se mantiene porque `api/feedback/[token].ts` y
// `tests/integraciones/evaluacion-servicio.test.ts` importan `EvaluacionServicio`.
export type EvaluacionServicio = EvaluacionTecnico;

function validarScores<T extends readonly string[]>(
  categorias: T,
  value: unknown,
): Record<T[number], number> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  if (Object.keys(obj).length !== categorias.length) return null;
  const res = {} as Record<T[number], number>;
  for (const c of categorias) {
    const s = obj[c];
    if (typeof s !== 'number' || !Number.isInteger(s) || s < 1 || s > 5) return null;
    (res as Record<string, number>)[c] = s;
  }
  return res;
}

/** Compat v1 — rechaza nulls, extras, no-enteros, fuera de rango 1-5. */
export function validarEvaluacion(value: unknown): EvaluacionServicio | null {
  return validarScores(categoriasTecnico, value);
}

export interface EvaluacionV2 {
  atencion: EvaluacionAtencion | null;
  tecnico: EvaluacionTecnico | null;
}

/**
 * v2 — el cliente envía 1 o 2 bloques. Cada bloque, si está presente, debe venir
 * con TODAS sus categorías y puntajes 1-5. No se aceptan claves fuera de
 * `atencion`/`tecnico`. Al menos UN bloque válido es obligatorio.
 */
export function validarEvaluacionV2(value: unknown): EvaluacionV2 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  for (const k of Object.keys(obj)) {
    if (k !== 'atencion' && k !== 'tecnico') return null;
  }
  let atencion: EvaluacionAtencion | null = null;
  if (obj.atencion !== undefined) {
    atencion = validarScores(categoriasAtencion, obj.atencion);
    if (atencion === null) return null;
  }
  let tecnico: EvaluacionTecnico | null = null;
  if (obj.tecnico !== undefined) {
    tecnico = validarScores(categoriasTecnico, obj.tecnico);
    if (tecnico === null) return null;
  }
  if (atencion === null && tecnico === null) return null;
  return { atencion, tecnico };
}

export interface ParticipantesEvaluacion {
  /**
   * UID (auth) del técnico atribuido al trabajo. `null` si la orden no tiene
   * `tecnicoId` persistido (orden histórica sin asignación o visita no
   * concretada). NO se infiere desde nombre.
   */
  tecnicoUid: string | null;
  /**
   * UID (auth) de la secretaria/operaria responsable de atención. Fuente
   * canónica: `metadatosCita.responsableAtencionId` (campo explícito agregado
   * 2026-09-29 por el sprint de calendarios/solicitudes). NO se infiere desde
   * `operariaId` ni `responsableId` legacy — esos pueden ser doc.id en órdenes
   * viejas (sprint-111 pendiente) y la rule aquí es "identidad estable o nada".
   */
  atencionUid: string | null;
  atribucionTecnicoConfiable: boolean;
  atribucionAtencionConfiable: boolean;
}

function stringNoVacio(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
}

/**
 * Lee los identificadores de participantes DIRECTAMENTE del doc de la orden,
 * NUNCA del body del cliente. Si no hay identificador fiable, deja la
 * atribución explícitamente nula.
 */
export function candidatosParticipantes(
  ordenData: Record<string, unknown> | undefined | null,
): { tecnicoUid: string | null; atencionUid: string | null } {
  const data = ordenData || {};
  const tecnicoUid = stringNoVacio((data as Record<string, unknown>).tecnicoId);
  const metadatos = (data as Record<string, unknown>).metadatosCita as
    | Record<string, unknown>
    | undefined;
  const atencionUid = stringNoVacio(metadatos?.responsableAtencionId);
  return { tecnicoUid, atencionUid };
}

/** Solo una identidad comprobada en usuarios/{uid} puede recibir atribución. */
export function extraerParticipantes(
  ordenData: Record<string, unknown> | undefined | null,
  uidsVerificados: ReadonlySet<string> = new Set(),
): ParticipantesEvaluacion {
  const candidatos = candidatosParticipantes(ordenData);
  const tecnicoUid = candidatos.tecnicoUid && uidsVerificados.has(candidatos.tecnicoUid) ? candidatos.tecnicoUid : null;
  const atencionUid = candidatos.atencionUid && uidsVerificados.has(candidatos.atencionUid) ? candidatos.atencionUid : null;
  return { tecnicoUid, atencionUid,
    atribucionTecnicoConfiable: tecnicoUid !== null,
    atribucionAtencionConfiable: atencionUid !== null,
  };
}
