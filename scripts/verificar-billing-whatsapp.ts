/**
 * Verifica el estado de billing / quality / approval de la integración
 * WhatsApp Cloud API (Meta) consultando Graph API y genera un REPORTE en
 * `docs/sprints/REPORTE_BILLING_WA_2026-05-19.md`.
 *
 * SPRINT-WA-BILLING-VERIFY (2026-05-19). Permite detectar PROACTIVAMENTE
 * estados problemáticos antes de que rompan envíos en producción:
 *  - `quality_rating === 'RED'` (Meta restringe envíos masivos).
 *  - `code_verification_status !== 'VERIFIED'` (number sin verificar).
 *  - `account_review_status === 'REJECTED'` (WABA rechazado/baneado).
 *  - Plantillas con estado `REJECTED` / `PAUSED` que un cron `sync-plantillas`
 *    debería desactivar.
 *
 * Este script NO necesita Firebase Admin SDK — sólo Graph API + env vars.
 *
 * ============================================================================
 * USO
 * ============================================================================
 *
 * Opción A (recomendada — env desde Vercel):
 *   vercel env pull .env.local
 *   export $(grep -v '^#' .env.local | xargs)
 *   npx tsx scripts/verificar-billing-whatsapp.ts
 *
 * Opción B (inline):
 *   META_ACCESS_TOKEN=xxx \
 *     META_WABA_ID=xxx \
 *     META_PHONE_NUMBER_IDS_ALLOWLIST=1151997541323577,1226992440486630 \
 *     npx tsx scripts/verificar-billing-whatsapp.ts
 *
 * ============================================================================
 * ENV VARS
 * ============================================================================
 *
 *   META_ACCESS_TOKEN              (obligatorio) — System User token o
 *                                                 Business Integration Token.
 *   META_PHONE_NUMBER_IDS_ALLOWLIST (opcional CSV) — ej:
 *                                                 1151997541323577,1226992440486630.
 *                                                 Si no está, se usa
 *                                                 META_PHONE_NUMBER_ID single.
 *   META_PHONE_NUMBER_ID            (fallback)   — single phone number id.
 *   META_WABA_ID                    (obligatorio para checks de WABA y plantillas).
 *   META_API_VERSION                (opcional)   — default `v21.0`.
 *
 * ============================================================================
 * SEGURIDAD
 * ============================================================================
 *
 * El script NUNCA persiste el token en el reporte markdown ni en logs. Sólo
 * IDs públicos (phone_number_ids, WABA_id), nombres de plantillas y estados.
 *
 * ============================================================================
 * OUTPUT
 * ============================================================================
 *
 *  1. Stdout: tabla resumida + veredicto final.
 *  2. Archivo: `docs/sprints/REPORTE_BILLING_WA_2026-05-19.md` con timestamp
 *     + tablas markdown + veredicto. Se sobrescribe en cada corrida.
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const RUTA_REPORTE = resolve(
  process.cwd(),
  'docs/sprints/REPORTE_BILLING_WA_2026-05-19.md',
);

type Veredicto = 'OK' | 'WARNINGS' | 'CRITICO';

interface PhoneNumberInfo {
  id: string;
  display_phone_number?: string;
  verified_name?: string;
  quality_rating?: string;
  messaging_limit_tier?: string;
  name_status?: string;
  code_verification_status?: string;
  throughput?: { level?: string };
  errorFetch?: string;
}

interface WabaInfo {
  id: string;
  name?: string;
  timezone_id?: string;
  on_behalf_of_business_info?: Record<string, unknown>;
  owner_business_info?: Record<string, unknown>;
  account_review_status?: string;
  message_template_namespace?: string;
  errorFetch?: string;
}

interface PlantillaInfo {
  name: string;
  status: string;
  category?: string;
  language?: string;
}

interface PlantillasResult {
  total: number;
  plantillas: PlantillaInfo[];
  errorFetch?: string;
}

interface Flag {
  nivel: 'critico' | 'warning';
  tema: string;
  detalle: string;
}

function errorClaro(msg: string): never {
  console.error(`[verificar-billing] ${msg}`);
  process.exit(1);
}

/**
 * Lee la allowlist CSV de phone_number_ids desde env. Fallback al single
 * `META_PHONE_NUMBER_ID` si la CSV no está definida.
 */
function obtenerPhoneNumberIds(): string[] {
  const csv = process.env.META_PHONE_NUMBER_IDS_ALLOWLIST;
  if (typeof csv === 'string' && csv.trim().length > 0) {
    return csv
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  const single = process.env.META_PHONE_NUMBER_ID;
  if (typeof single === 'string' && single.trim().length > 0) {
    return [single.trim()];
  }
  return [];
}

/**
 * Wrapper de fetch a Graph API con manejo de error consistente. NO loggea
 * el token (solo lo manda en header). Retorna `{ ok, data?, error? }`.
 */
async function fetchGraph<T>(
  url: string,
  token: string,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const r = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    if (!r.ok) {
      const body = (await r.json().catch(() => ({}))) as Record<string, unknown>;
      const err = body.error as Record<string, unknown> | undefined;
      const mensaje =
        (err?.message as string | undefined) ??
        (err?.error_user_msg as string | undefined) ??
        `HTTP ${r.status}`;
      return { ok: false, error: mensaje.substring(0, 250) };
    }
    const data = (await r.json()) as T;
    return { ok: true, data };
  } catch (err) {
    const m = err instanceof Error ? err.message.substring(0, 250) : 'fetch-failed';
    return { ok: false, error: m };
  }
}

async function consultarPhoneNumber(
  apiVersion: string,
  phoneNumberId: string,
  token: string,
): Promise<PhoneNumberInfo> {
  const fields = [
    'display_phone_number',
    'verified_name',
    'quality_rating',
    'messaging_limit_tier',
    'name_status',
    'code_verification_status',
    'throughput',
  ].join(',');
  const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}?fields=${fields}`;
  const r = await fetchGraph<Record<string, unknown>>(url, token);
  if (!r.ok) {
    return { id: phoneNumberId, errorFetch: r.error };
  }
  const d = r.data;
  return {
    id: phoneNumberId,
    display_phone_number: d.display_phone_number as string | undefined,
    verified_name: d.verified_name as string | undefined,
    quality_rating: d.quality_rating as string | undefined,
    messaging_limit_tier: d.messaging_limit_tier as string | undefined,
    name_status: d.name_status as string | undefined,
    code_verification_status: d.code_verification_status as string | undefined,
    throughput: d.throughput as { level?: string } | undefined,
  };
}

async function consultarWaba(
  apiVersion: string,
  wabaId: string,
  token: string,
): Promise<WabaInfo> {
  const fields = [
    'name',
    'timezone_id',
    'on_behalf_of_business_info',
    'owner_business_info',
    'account_review_status',
    'message_template_namespace',
  ].join(',');
  const url = `https://graph.facebook.com/${apiVersion}/${wabaId}?fields=${fields}`;
  const r = await fetchGraph<Record<string, unknown>>(url, token);
  if (!r.ok) {
    return { id: wabaId, errorFetch: r.error };
  }
  const d = r.data;
  return {
    id: wabaId,
    name: d.name as string | undefined,
    timezone_id: d.timezone_id as string | undefined,
    on_behalf_of_business_info: d.on_behalf_of_business_info as
      | Record<string, unknown>
      | undefined,
    owner_business_info: d.owner_business_info as Record<string, unknown> | undefined,
    account_review_status: d.account_review_status as string | undefined,
    message_template_namespace: d.message_template_namespace as string | undefined,
  };
}

async function consultarPlantillas(
  apiVersion: string,
  wabaId: string,
  token: string,
): Promise<PlantillasResult> {
  const fields = ['name', 'status', 'category', 'language'].join(',');
  const url = `https://graph.facebook.com/${apiVersion}/${wabaId}/message_templates?fields=${fields}&limit=50`;
  const r = await fetchGraph<{ data?: Array<Record<string, unknown>> }>(url, token);
  if (!r.ok) {
    return { total: 0, plantillas: [], errorFetch: r.error };
  }
  const raw = Array.isArray(r.data.data) ? r.data.data : [];
  const plantillas: PlantillaInfo[] = raw.map((p) => ({
    name: typeof p.name === 'string' ? p.name : '(sin nombre)',
    status: typeof p.status === 'string' ? p.status : 'UNKNOWN',
    category: typeof p.category === 'string' ? p.category : undefined,
    language: typeof p.language === 'string' ? p.language : undefined,
  }));
  return { total: plantillas.length, plantillas };
}

function evaluarFlags(input: {
  phones: PhoneNumberInfo[];
  waba: WabaInfo | null;
  plantillas: PlantillasResult | null;
}): { veredicto: Veredicto; flags: Flag[] } {
  const flags: Flag[] = [];

  for (const p of input.phones) {
    if (p.errorFetch) {
      flags.push({
        nivel: 'critico',
        tema: `phone ${p.id}`,
        detalle: `fetch falló: ${p.errorFetch}`,
      });
      continue;
    }
    if (p.quality_rating === 'RED') {
      flags.push({
        nivel: 'critico',
        tema: `phone ${p.id}`,
        detalle: `quality_rating=RED — Meta restringe envíos masivos. Revisar bandeja de calidad en WhatsApp Business Manager.`,
      });
    }
    if (p.code_verification_status && p.code_verification_status !== 'VERIFIED') {
      flags.push({
        nivel: 'warning',
        tema: `phone ${p.id}`,
        detalle: `code_verification_status=${p.code_verification_status} — número sin verificación de código.`,
      });
    }
    if (p.name_status && p.name_status !== 'APPROVED') {
      flags.push({
        nivel: 'warning',
        tema: `phone ${p.id}`,
        detalle: `name_status=${p.name_status} — display name pendiente o rechazado.`,
      });
    }
  }

  if (input.waba) {
    if (input.waba.errorFetch) {
      flags.push({
        nivel: 'critico',
        tema: `WABA ${input.waba.id}`,
        detalle: `fetch falló: ${input.waba.errorFetch}`,
      });
    } else if (input.waba.account_review_status === 'REJECTED') {
      flags.push({
        nivel: 'critico',
        tema: `WABA ${input.waba.id}`,
        detalle: `account_review_status=REJECTED — cuenta WABA rechazada/baneada. Envíos van a fallar.`,
      });
    }
  }

  if (input.plantillas?.errorFetch) {
    flags.push({
      nivel: 'warning',
      tema: 'plantillas',
      detalle: `fetch falló: ${input.plantillas.errorFetch}`,
    });
  }

  const tieneCritico = flags.some((f) => f.nivel === 'critico');
  const tieneWarning = flags.some((f) => f.nivel === 'warning');
  const veredicto: Veredicto = tieneCritico
    ? 'CRITICO'
    : tieneWarning
    ? 'WARNINGS'
    : 'OK';
  return { veredicto, flags };
}

function construirReporteMd(input: {
  timestamp: string;
  apiVersion: string;
  phones: PhoneNumberInfo[];
  waba: WabaInfo | null;
  plantillas: PlantillasResult | null;
  veredicto: Veredicto;
  flags: Flag[];
}): string {
  const lineas: string[] = [];
  lineas.push('# Reporte de billing / quality WhatsApp Cloud API');
  lineas.push('');
  lineas.push(`**Generado:** ${input.timestamp}`);
  lineas.push(`**API version:** ${input.apiVersion}`);
  lineas.push(`**Script:** \`scripts/verificar-billing-whatsapp.ts\``);
  lineas.push('');
  lineas.push('---');
  lineas.push('');
  lineas.push(`## Veredicto final: ${input.veredicto}`);
  lineas.push('');

  if (input.flags.length === 0) {
    lineas.push('Sin flags — todos los checks pasaron.');
  } else {
    lineas.push('| Nivel | Tema | Detalle |');
    lineas.push('|---|---|---|');
    for (const f of input.flags) {
      lineas.push(`| ${f.nivel} | ${f.tema} | ${escaparTabla(f.detalle)} |`);
    }
  }
  lineas.push('');
  lineas.push('---');
  lineas.push('');

  lineas.push('## Phone Numbers');
  lineas.push('');
  if (input.phones.length === 0) {
    lineas.push('_No se configuró ningún `META_PHONE_NUMBER_ID`._');
  } else {
    lineas.push(
      '| ID | Display | Verified name | Quality | Tier | Name status | Code verif | Throughput | Error |',
    );
    lineas.push('|---|---|---|---|---|---|---|---|---|');
    for (const p of input.phones) {
      lineas.push(
        `| ${p.id} | ${p.display_phone_number ?? '—'} | ${p.verified_name ?? '—'} | ${p.quality_rating ?? '—'} | ${p.messaging_limit_tier ?? '—'} | ${p.name_status ?? '—'} | ${p.code_verification_status ?? '—'} | ${p.throughput?.level ?? '—'} | ${p.errorFetch ? escaparTabla(p.errorFetch) : '—'} |`,
      );
    }
  }
  lineas.push('');
  lineas.push('---');
  lineas.push('');

  lineas.push('## WABA (WhatsApp Business Account)');
  lineas.push('');
  if (!input.waba) {
    lineas.push('_No se configuró `META_WABA_ID` — checks de WABA y plantillas saltados._');
  } else if (input.waba.errorFetch) {
    lineas.push(`**Error al consultar WABA \`${input.waba.id}\`:** ${input.waba.errorFetch}`);
  } else {
    lineas.push('| Campo | Valor |');
    lineas.push('|---|---|');
    lineas.push(`| id | ${input.waba.id} |`);
    lineas.push(`| name | ${input.waba.name ?? '—'} |`);
    lineas.push(`| timezone_id | ${input.waba.timezone_id ?? '—'} |`);
    lineas.push(`| account_review_status | ${input.waba.account_review_status ?? '—'} |`);
    lineas.push(`| message_template_namespace | ${input.waba.message_template_namespace ?? '—'} |`);
  }
  lineas.push('');
  lineas.push('---');
  lineas.push('');

  lineas.push('## Plantillas (limit 50)');
  lineas.push('');
  if (!input.plantillas) {
    lineas.push('_Sin `META_WABA_ID` — no se consultaron plantillas._');
  } else if (input.plantillas.errorFetch) {
    lineas.push(`**Error al consultar plantillas:** ${input.plantillas.errorFetch}`);
  } else if (input.plantillas.total === 0) {
    lineas.push('_Sin plantillas en la cuenta._');
  } else {
    lineas.push('| Nombre | Status | Category | Language |');
    lineas.push('|---|---|---|---|');
    for (const p of input.plantillas.plantillas) {
      lineas.push(
        `| ${p.name} | ${p.status} | ${p.category ?? '—'} | ${p.language ?? '—'} |`,
      );
    }
    const rechazadas = input.plantillas.plantillas.filter(
      (p) => p.status === 'REJECTED' || p.status === 'PAUSED' || p.status === 'DISABLED',
    );
    if (rechazadas.length > 0) {
      lineas.push('');
      lineas.push(
        `_${rechazadas.length} plantilla(s) en estado problemático (REJECTED/PAUSED/DISABLED). El cron \`sync-plantillas\` debería marcarlas inactivas._`,
      );
    }
  }
  lineas.push('');
  lineas.push('---');
  lineas.push('');
  lineas.push(
    '_Reporte generado por `scripts/verificar-billing-whatsapp.ts`. No contiene tokens ni secretos — sólo IDs públicos y estados de Graph API._',
  );
  lineas.push('');
  return lineas.join('\n');
}

function escaparTabla(s: string): string {
  // Pipes rompen tablas markdown — los escapamos.
  return s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

async function main(): Promise<void> {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token || token.trim().length === 0) {
    errorClaro(
      'Falta META_ACCESS_TOKEN. Correr con:\n' +
        '  vercel env pull .env.local && export $(grep -v \'^#\' .env.local | xargs)\n' +
        '  npx tsx scripts/verificar-billing-whatsapp.ts\n' +
        'O inline:\n' +
        '  META_ACCESS_TOKEN=xxx npx tsx scripts/verificar-billing-whatsapp.ts',
    );
  }

  const apiVersion = process.env.META_API_VERSION ?? 'v21.0';
  const phoneIds = obtenerPhoneNumberIds();
  const wabaId = process.env.META_WABA_ID;

  console.log(`[verificar-billing] API version: ${apiVersion}`);
  console.log(`[verificar-billing] Phone Numbers a consultar: ${phoneIds.length === 0 ? 'NINGUNO' : phoneIds.join(', ')}`);
  console.log(`[verificar-billing] WABA ID: ${wabaId ?? 'NO CONFIGURADO'}`);
  console.log('');

  // 1) Consultar cada phone_number_id.
  const phones: PhoneNumberInfo[] = [];
  for (const id of phoneIds) {
    console.log(`[verificar-billing] Consultando phone ${id}...`);
    phones.push(await consultarPhoneNumber(apiVersion, id, token));
  }

  // 2) Consultar WABA (si está configurado).
  let waba: WabaInfo | null = null;
  if (wabaId) {
    console.log(`[verificar-billing] Consultando WABA ${wabaId}...`);
    waba = await consultarWaba(apiVersion, wabaId, token);
  }

  // 3) Consultar plantillas.
  let plantillas: PlantillasResult | null = null;
  if (wabaId) {
    console.log(`[verificar-billing] Consultando plantillas de WABA ${wabaId}...`);
    plantillas = await consultarPlantillas(apiVersion, wabaId, token);
  }

  // 4) Evaluar flags.
  const { veredicto, flags } = evaluarFlags({ phones, waba, plantillas });

  // 5) Imprimir stdout resumido.
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  VEREDICTO FINAL: ${veredicto}`);
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  if (flags.length === 0) {
    console.log('Sin flags — todos los checks pasaron.');
  } else {
    for (const f of flags) {
      console.log(`  [${f.nivel.toUpperCase()}] ${f.tema}: ${f.detalle}`);
    }
  }
  console.log('');
  console.log(`Phones consultados: ${phones.length}`);
  console.log(`WABA consultado: ${waba ? 'sí' : 'no'}`);
  console.log(`Plantillas consultadas: ${plantillas ? plantillas.total : 'no'}`);
  console.log('');

  // 6) Escribir el reporte markdown.
  const timestamp = new Date().toISOString();
  const reporteMd = construirReporteMd({
    timestamp,
    apiVersion,
    phones,
    waba,
    plantillas,
    veredicto,
    flags,
  });

  try {
    writeFileSync(RUTA_REPORTE, reporteMd, 'utf8');
    console.log(`[verificar-billing] Reporte escrito: ${RUTA_REPORTE}`);
  } catch (err) {
    const m = err instanceof Error ? err.message : 'unknown';
    console.error(`[verificar-billing] No se pudo escribir el reporte: ${m}`);
    process.exit(2);
  }

  process.exit(veredicto === 'CRITICO' ? 1 : 0);
}

main().catch((err) => {
  const m = err instanceof Error ? err.message : 'unknown';
  console.error(`[verificar-billing] error inesperado: ${m}`);
  process.exit(2);
});
