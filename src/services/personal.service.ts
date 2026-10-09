/**
 * Capa de servicio para la ficha única de Personal (lote PERSONAL-PENDIENTES
 * 2026-10-09). Centraliza el partido público / privado y los helpers que
 * usan tanto la página `/admin/personal` como los componentes propios.
 *
 * Diseño:
 * - Los campos definidos en `CAMPOS_PRIVADOS` NUNCA se escriben en
 *   `personal/{id}` — van a `personal_privado/{id}` por `setDoc(..., { merge })`.
 *   Esta frontera coincide con las rules desplegadas (`esAdminOCoord()` para
 *   `personal_privado`, `esStaff()` para `personal`). Si una regresión tratara
 *   de persistir uno de estos campos como público, la escritura seguiría
 *   funcionando pero expondría datos sensibles al listado general de personal.
 * - `limpiarActualizacion` del helper `src/utils/actualizacionPersonal.ts`
 *   convierte `undefined` en `deleteField()` para que vaciar un input desde
 *   la ficha realmente limpie el campo. Mantener ese contrato: nunca pasar
 *   `null` donde el UI espera "sin valor"; usar `undefined`.
 * - Esta capa NO escribe en `usuarios/{uid}` ni en `auditoria_admin`; esas
 *   sincronizaciones best-effort viven en la página porque son del dominio
 *   "cuenta de acceso" (equipoApi) y no de la ficha permanente.
 *
 * Autor: Claude Code (worktree codex/personal-pendientes).
 */
import { doc, writeBatch, type DocumentReference } from 'firebase/firestore';
import { db } from '../firebase/config';
import type { Personal } from '../types';

/**
 * Campos de la ficha que deben vivir en `personal_privado/{personalId}` y
 * NUNCA en `personal/{id}` (que es legible por todo el staff).
 *
 * Fuente: decisiones de Jorge en `docs/entregas/CLAUDE-CONTINUACION-2026-10-07.md`
 * — "Datos sensibles de ficha en personal_privado/{personalId}, acceso
 * administrador/coordinadora; … no vuelvas a poner domicilio, identificación,
 * referencias/contactos privados en la colección personal legible por el
 * personal."
 *
 * Deuda abierta documentada en `docs/entregas/PERSONAL-PENDIENTES-CLAUDE-2026-10-09.md`:
 * `sueldoBase` y `comisionPorcentaje` todavía viven en `personal/{id}` porque
 * `nomina.service.ts`, `comisiones.ts`, `TecnicoVista.tsx` y `Dashboard.tsx`
 * los leen desde ahí. Moverlos a `personal_privado` requiere adaptar rules y
 * consumidores en un sprint propio — fuera del scope de este lote.
 */
export const CAMPOS_FICHA_PRIVADOS = [
  'cedula',
  'telefonoFlota',
  'whatsapp',
  'emailContacto',
  'correoRecuperacion',
  'direccion',
  'ubicacionCasa',
  'fechaIngreso',
  'fotoUrl',
  'licenciaNumero',
  'licenciaVencimiento',
  'referenciasPersonales',
  'contactosEmergencia',
] as const satisfies ReadonlyArray<keyof Personal>;

export type CampoFichaPrivado = (typeof CAMPOS_FICHA_PRIVADOS)[number];

const CAMPOS_PRIVADOS_SET: ReadonlySet<string> = new Set(CAMPOS_FICHA_PRIVADOS);

export function esCampoFichaPrivado(key: string): key is CampoFichaPrivado {
  return CAMPOS_PRIVADOS_SET.has(key);
}

/** Guarda la ficha pública y privada en un mismo batch: todo o nada. */
export async function guardarFichaPersonal(
  referencia: DocumentReference,
  datos: Record<string, unknown>,
): Promise<void> {
  const publico: Record<string, unknown> = {};
  const privado: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(datos)) {
    (esCampoFichaPrivado(k) ? privado : publico)[k] = v;
  }
  const batch = writeBatch(db);
  if (Object.keys(privado).length) batch.set(doc(db, 'personal_privado', referencia.id), privado, { merge: true });
  if (Object.keys(publico).length) batch.update(referencia, publico);
  await batch.commit();
}

/**
 * Resuelve una URL para abrir la ubicación compartida de la casa del empleado
 * en Google Maps. Valida que el enlace tenga un host conocido (Google
 * Maps/Goo.gl) para no abrir dominios arbitrarios: un enlace de WhatsApp
 * (`wa.me/...`) o cualquier otra URL de terceros NO se considera ubicación
 * válida y devuelve `null`.
 *
 * Preferencia:
 *   1. Coordenadas (`lat`,`lng`) → URL canónica `search/?api=1&query=lat,lng`.
 *   2. Enlace crudo → se devuelve tal cual si pasa la whitelist de hosts.
 *
 * Pensado para alimentar un `<a href=...>` que abre en nueva pestaña.
 */
export function urlAbrirMapa(ubi: Personal['ubicacionCasa'] | null | undefined): string | null {
  if (!ubi) return null;
  if (
    typeof ubi.lat === 'number' &&
    typeof ubi.lng === 'number' &&
    Number.isFinite(ubi.lat) &&
    Number.isFinite(ubi.lng) &&
    Math.abs(ubi.lat) <= 90 &&
    Math.abs(ubi.lng) <= 180
  ) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${ubi.lat},${ubi.lng}`)}`;
  }
  if (ubi.enlace && /^https?:\/\//.test(ubi.enlace)) {
    try {
      const u = new URL(ubi.enlace);
      if (u.protocol !== 'https:') return null;
      const host = u.hostname.toLowerCase();
      const esMaps =
        (['google.com', 'www.google.com', 'google.com.do', 'www.google.com.do'].includes(host) && u.pathname.startsWith('/maps')) ||
        host === 'maps.google.com' ||
        host === 'maps.app.goo.gl' ||
        (host === 'goo.gl' && u.pathname.startsWith('/maps'));
      if (esMaps) return ubi.enlace;
    } catch {
      /* enlace inválido — no abrir */
    }
  }
  return null;
}

/** `tel:` normalizado a dígitos solo. Devuelve null si queda vacío. */
export function telefonoLink(numero?: string | null): string | null {
  if (!numero) return null;
  const limpio = numero.replace(/\D/g, '');
  if (!limpio) return null;
  return `tel:${limpio}`;
}

/**
 * `https://wa.me/{numero}` normalizado para RD. Si el número tiene 10 dígitos
 * se antepone `1` (código país). Devuelve null si queda vacío.
 */
export function whatsappLink(numero?: string | null): string | null {
  if (!numero) return null;
  const limpio = numero.replace(/\D/g, '');
  if (!limpio) return null;
  const rd = limpio.length === 10 ? `1${limpio}` : limpio;
  return `https://wa.me/${rd}`;
}

/** `mailto:` sanitizado. Devuelve null si no hay `@`. */
export function emailLink(email?: string | null): string | null {
  if (!email) return null;
  const limpio = email.trim();
  if (!limpio || !limpio.includes('@')) return null;
  return `mailto:${limpio}`;
}

/** Quita entradas `undefined` antes de pasarlas a Firestore. */
export function omitirUndefined<T extends object>(obj: T): T {
  const copia: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) copia[k] = v;
  }
  return copia as T;
}

export const PERSONAL_PRIVADO_COL = 'personal_privado' as const;
export const PERSONAL_COL = 'personal' as const;
