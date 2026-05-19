/**
 * Init: crea (o actualiza idempotentemente) el doc `whatsapp_config/sistema`
 * con los 10 valores firmes de SPRINT-WA-0 (OK Jorge 2026-05-19).
 *
 * Por qué: el módulo WhatsApp requiere configuración operativa (horario bot,
 * límite de turnos, opt-outs, routing por zona, palabras clave de escalado,
 * números activos) que vive en un doc Firestore. Este script lo siembra
 * con los valores firmes para evitar tener que clickear formularios en UI.
 *
 * Idempotente:
 *   - Si `whatsapp_config/sistema` NO existe → crear con valores default.
 *   - Si existe → hacer merge solo de campos NUEVOS o explícitamente forzados.
 *     Los campos ya editados desde UI (ej. routing zonas, opt-outs) se preservan.
 *
 * Uso:
 *   npx tsx scripts/init-whatsapp-config.ts             # ejecuta (idempotente)
 *   npx tsx scripts/init-whatsapp-config.ts --dry-run   # solo muestra plan
 *   npx tsx scripts/init-whatsapp-config.ts --force     # sobrescribe TODO con defaults
 *
 * Auth (mismo patrón que backfill-usuarios-desde-personal.ts):
 *   1) GOOGLE_APPLICATION_CREDENTIALS apunta a un JSON existente.
 *   2) ./service-account.json en el cwd.
 *   3) FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY.
 *
 * Decisiones firmes (SPRINT-WA-0, OK Jorge 2026-05-19):
 *   D1=D — sticky por conversación (no hardcoded acá, lo respeta send.ts)
 *   D2=A — una conversación por wa_id (no parametrizable acá)
 *   D3=B — L-S 8-18 RD + plantilla fuera horario
 *   D4=C — bot solo UTILITY autónomas (no parametrizable acá, lógica en whatsappBot.ts)
 *   D5=B — 20 turnos
 *   D6=C — admin/coord/secretaria/operaria (gateado en send.ts)
 *   D7=A — sync-plantillas primero (no aplica acá)
 *   D8=A — opt-out automático (lista en optOuts[], lógica en webhook + send)
 *   D9=Pro — 3 crons (no aplica acá)
 *   D10=A — Fixman, usted/tú adaptive (no parametrizable acá, vive en system prompt)
 */
import { initializeApp, getApps, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

interface WhatsappConfigSistema {
  numerosActivos: Array<{
    phoneNumberId: string;
    display: string;
    nombre: string;
    activo: boolean;
  }>;
  numeroDefaultEnvio: string;
  bot: {
    habilitadoGlobal: boolean;
    horario: {
      activo: boolean;
      inicio: string;
      fin: string;
      zona: string;
      fueraDeHorario: 'auto_responder_plantilla' | 'silenciar' | 'siempre_bot';
      plantillaFueraHorario: string | null;
    };
    limiteTurnosConversacion: number;
    palabrasEscaladoHumano: string[];
    palabrasUrgencia: string[];
    palabrasOptOut: string[];
    umbralCaracteresComplejo: number;
    systemPromptVersion: string;
  };
  optOuts: string[];
  routingZonas: Record<string, string>;
  costosReferencia: {
    marketing_DO: number;
    utility_DO: number;
    authentication_DO: number;
  };
  decisionesSnapshot: {
    sprintWa0Fecha: string;
    D1: 'sticky_por_conversacion';
    D2: 'una_conversacion_por_wa_id';
    D3: 'horario_L_S_8_18_con_plantilla_fuera';
    D4: 'bot_solo_utility';
    D5_limiteTurnos: number;
    D6_rolesAutorizados: string[];
    D7: 'sync_plantillas_primero';
    D8: 'opt_out_automatico_stop_baja';
    D9_planVercel: 'pro_3_crons';
    D10_nombreBot: string;
  };
  createdAt?: FirebaseFirestore.FieldValue;
  updatedAt: FirebaseFirestore.FieldValue;
  schemaVersion: string;
}

const DEFAULTS: WhatsappConfigSistema = {
  numerosActivos: [
    {
      phoneNumberId: '1151997541323577',
      display: '6767',
      nombre: 'Fixman Mister service',
      activo: true,
    },
    {
      phoneNumberId: '1226992440486630',
      display: '6265',
      nombre: 'Fixman 6265',
      activo: true,
    },
  ],
  numeroDefaultEnvio: '1151997541323577',
  bot: {
    habilitadoGlobal: false,
    horario: {
      activo: true,
      inicio: '08:00',
      fin: '18:00',
      zona: 'America/Santo_Domingo',
      fueraDeHorario: 'auto_responder_plantilla',
      plantillaFueraHorario: 'auto_respuesta_fuera_horario',
    },
    limiteTurnosConversacion: 20,
    palabrasEscaladoHumano: [
      'humano',
      'agente',
      'persona',
      'operador',
      'representante',
      'asesor',
      'hablar con alguien',
      'no me entiendes',
    ],
    palabrasUrgencia: [
      'urgente',
      'emergencia',
      'inundación',
      'fuego',
      'incendio',
      'humo',
      'gotea',
      'goteo',
      'electrocutado',
      'no enciende',
    ],
    palabrasOptOut: ['stop', 'baja', 'no mas', 'no más', 'cancelar', 'detener'],
    umbralCaracteresComplejo: 200,
    systemPromptVersion: '1.0',
  },
  optOuts: [],
  routingZonas: {
    general: '',
  },
  costosReferencia: {
    marketing_DO: 2.5,
    utility_DO: 0.5,
    authentication_DO: 0.3,
  },
  decisionesSnapshot: {
    sprintWa0Fecha: '2026-05-19',
    D1: 'sticky_por_conversacion',
    D2: 'una_conversacion_por_wa_id',
    D3: 'horario_L_S_8_18_con_plantilla_fuera',
    D4: 'bot_solo_utility',
    D5_limiteTurnos: 20,
    D6_rolesAutorizados: ['administrador', 'coordinadora', 'secretaria', 'operaria'],
    D7: 'sync_plantillas_primero',
    D8: 'opt_out_automatico_stop_baja',
    D9_planVercel: 'pro_3_crons',
    D10_nombreBot: 'Fixman',
  },
  updatedAt: FieldValue.serverTimestamp(),
  schemaVersion: '1.0',
};

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const force = process.argv.includes('--force');

  console.log(`[INFO] Modo: ${dryRun ? 'DRY-RUN' : force ? 'FORCE' : 'IDEMPOTENTE'}`);

  if (getApps().length === 0) {
    const gacPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const localPath = resolve(process.cwd(), 'service-account.json');

    if (gacPath && existsSync(gacPath)) {
      console.log(`[INFO] Usando GOOGLE_APPLICATION_CREDENTIALS: ${gacPath}`);
      initializeApp({ credential: applicationDefault() });
    } else if (existsSync(localPath)) {
      console.log(`[INFO] Usando service-account.json local`);
      const json = JSON.parse(readFileSync(localPath, 'utf8'));
      initializeApp({
        credential: cert({
          projectId: json.project_id,
          clientEmail: json.client_email,
          privateKey: json.private_key,
        }),
        projectId: json.project_id,
      });
    } else {
      const projectId = process.env.FIREBASE_PROJECT_ID;
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;

      if (!projectId || !clientEmail || !privateKeyRaw) {
        console.error(
          '[ERROR] Faltan credenciales del Admin SDK. Probá una de:\n' +
            '  1) Descargar service-account.json y ponerlo en la raíz.\n' +
            '  2) Setear GOOGLE_APPLICATION_CREDENTIALS apuntando al JSON.\n' +
            '  3) Setear FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY.',
        );
        process.exit(1);
      }
      const privateKey = privateKeyRaw.replace(/\\n/g, '\n');
      initializeApp({ credential: cert({ projectId, clientEmail, privateKey }), projectId });
    }
  }

  const db = getFirestore();
  const ref = db.collection('whatsapp_config').doc('sistema');
  const snap = await ref.get();

  if (!snap.exists) {
    console.log('[INFO] Doc whatsapp_config/sistema NO existe — crear con defaults.');
    if (dryRun) {
      console.log('[DRY-RUN] Crearía con:', JSON.stringify(DEFAULTS, null, 2));
      return;
    }
    await ref.set({
      ...DEFAULTS,
      createdAt: FieldValue.serverTimestamp(),
    });
    console.log('[OK] Doc creado.');
    return;
  }

  console.log('[INFO] Doc ya existe. Modo:', force ? 'FORCE (sobrescribe TODO)' : 'IDEMPOTENTE (merge solo nuevos)');

  if (force) {
    if (dryRun) {
      console.log('[DRY-RUN] Sobrescribiría TODO con:', JSON.stringify(DEFAULTS, null, 2));
      return;
    }
    await ref.set(DEFAULTS, { merge: false });
    console.log('[OK] Doc sobrescrito con defaults.');
    return;
  }

  // Modo idempotente: hacer merge de campos NUEVOS solamente.
  // Estrategia: para cada campo top-level de DEFAULTS, si no existe en el doc actual → setear.
  const existing = snap.data() as Partial<WhatsappConfigSistema>;
  const updates: Record<string, unknown> = {};
  let nuevosCampos = 0;

  for (const [key, value] of Object.entries(DEFAULTS)) {
    if (key === 'createdAt' || key === 'updatedAt') continue;
    if (existing[key as keyof WhatsappConfigSistema] === undefined) {
      updates[key] = value;
      nuevosCampos++;
      console.log(`  [+] Campo nuevo: ${key}`);
    }
  }

  // Siempre actualizar decisionesSnapshot + schemaVersion + updatedAt para reflejar el run actual.
  updates['decisionesSnapshot'] = DEFAULTS.decisionesSnapshot;
  updates['schemaVersion'] = DEFAULTS.schemaVersion;
  updates['updatedAt'] = FieldValue.serverTimestamp();

  if (dryRun) {
    console.log(`[DRY-RUN] Aplicaría merge con ${nuevosCampos} campos nuevos + refresh de decisionesSnapshot/schemaVersion/updatedAt.`);
    console.log('[DRY-RUN] Updates:', JSON.stringify(updates, null, 2));
    return;
  }

  await ref.update(updates);
  console.log(`[OK] Doc actualizado: ${nuevosCampos} campos nuevos + decisionesSnapshot refresh.`);
}

main().catch((err) => {
  console.error('[ERROR]', err);
  process.exit(1);
});
