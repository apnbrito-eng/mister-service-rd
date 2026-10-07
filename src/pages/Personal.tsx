/**
 * Rediseño visual BambooHR — Lote 1 (2026-10-07).
 *
 * Página unificada Personal + Usuarios + Permisos. Reemplaza las antiguas
 * `PersonalPage.tsx` y `GestionUsuarios.tsx`. Toda la escritura sobre `personal/{id}`
 * usa `updateDoc` directo (mismo contrato que antes); la gestión de acceso
 * (usuario, equipo, clave, bloqueo, supervisora, recuperación) sigue pasando por
 * el endpoint autorizado `/api/admin/accesos`. El cambio de email de acceso usa
 * `/api/admin/cambiar-correo`.
 *
 * No introduce reglas financieras nuevas: `sueldoBase`, `nivel` y
 * `comisionPorcentaje` ya existían en Personal y en `nomina.service.ts`. El bono
 * por meta mensual queda documentado como "pendiente de activación" porque Jorge
 * aún no cerró las reglas (devoluciones, cambios de meta durante el mes, etc.).
 *
 * Autor: Claude Code.
 */
import { useState, useEffect, useMemo, useCallback, type FormEvent, type ReactNode } from 'react';
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  setDoc,
  doc,
  query,
  orderBy,
  serverTimestamp,
  getFirestore,
} from 'firebase/firestore';
import { createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import toast from 'react-hot-toast';
import { useSearchParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Camera,
  Check,
  Eye,
  EyeOff,
  Key,
  KeyRound,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Shield,
  UserCheck,
  UserX,
} from 'lucide-react';

import { db, auth } from '../firebase/config';
import type { Personal, Rol, PermisosSistema } from '../types';
import { permisosDefaultDeRol, puede, esAdminOCoord } from '../utils/permisos';
import { ROL_LABELS, ROL_SELECT_ORDEN, ROLES_CON_COMISION, comisionDefaultPorNivel } from '../utils/personal';
import { useApp } from '../context/AppContext';
import AltaPersonalBamboo from '../components/personal/AltaPersonalBamboo';
import LoadingSpinner from '../components/LoadingSpinner';
import { detectarCoordenadasURL } from '../utils/direccion';
import { limpiarActualizacion } from '../utils/actualizacionPersonal';
import { equipoApi } from '../services/equipoApi';
import { sugerirUsuario } from '../../api/_lib/accesosUsuarios';

// ────────────────────────────────────────────────────────────────────────
// Tipos locales
// ────────────────────────────────────────────────────────────────────────

type EquipoFiltro = 'todos' | 'Dirección' | 'Equipo A' | 'Equipo B' | 'Sin equipo' | 'Desactivados';

type TabId = 'datos' | 'trabajo' | 'nomina' | 'cuenta' | 'documentos' | 'referencias';

interface PersonaAcceso {
  personalId: string;
  uid: string;
  nombre: string;
  rol: Rol;
  usuario: string;
  equipo: string;
  version: number;
  especialidad: string;
  activo: boolean;
  supervisora: boolean;
  recuperacion: boolean;
  email: string;
}

interface DatosAcceso {
  plantilla: unknown[];
  administrador: boolean;
  actor: string;
  personas: PersonaAcceso[];
}

const EQUIPO_OPCIONES: EquipoFiltro[] = [
  'todos',
  'Dirección',
  'Equipo A',
  'Equipo B',
  'Sin equipo',
  'Desactivados',
];

const ROL_OPCIONES_SISTEMA: Rol[] = ROL_SELECT_ORDEN.filter((r) => r !== 'ayudante');

// ────────────────────────────────────────────────────────────────────────
// Helpers puros
// ────────────────────────────────────────────────────────────────────────

function iniciales(nombre: string): string {
  if (!nombre) return '?';
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '?';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

function equipoDePersona(p: Personal, acceso?: PersonaAcceso | null): EquipoFiltro {
  if (p.activo === false) return 'Desactivados';
  const equipoApi = acceso?.equipo;
  if (equipoApi === 'A') return 'Equipo A';
  if (equipoApi === 'B') return 'Equipo B';
  if (p.rol === 'administrador' || p.rol === 'coordinadora') return 'Dirección';
  return 'Sin equipo';
}

function urlAbrirMapa(ubi: Personal['ubicacionCasa']): string | null {
  if (!ubi) return null;
  if (typeof ubi.lat === 'number' && typeof ubi.lng === 'number' && Number.isFinite(ubi.lat) && Number.isFinite(ubi.lng) && Math.abs(ubi.lat) <= 90 && Math.abs(ubi.lng) <= 180) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${ubi.lat},${ubi.lng}`)}`;
  }
  if (ubi.enlace && /^https?:\/\//.test(ubi.enlace)) {
    // Sólo abrimos enlaces de Maps/goo.gl; nunca abrimos directamente wa.me ni otros.
    try {
      const u = new URL(ubi.enlace);
      const host = u.hostname.toLowerCase();
      const esMaps =
        (u.protocol === 'https:' && ['google.com', 'www.google.com', 'google.com.do', 'www.google.com.do'].includes(host) && u.pathname.startsWith('/maps')) ||
        host === 'maps.google.com' ||
        host === 'maps.app.goo.gl' ||
        (u.protocol === 'https:' && host === 'goo.gl' && u.pathname.startsWith('/maps'));
      if (u.protocol === 'https:' && esMaps) return ubi.enlace;
    } catch {
      /* enlace inválido */
    }
  }
  return null;
}

function telefonoLink(numero?: string): string | null {
  if (!numero) return null;
  const limpio = numero.replace(/\D/g, '');
  if (!limpio) return null;
  return `tel:${limpio}`;
}

function whatsappLink(numero?: string): string | null {
  if (!numero) return null;
  const limpio = numero.replace(/\D/g, '');
  if (!limpio) return null;
  // Normalización RD: anteponer 1 si tiene 10 dígitos y no empieza con 1.
  const rd = limpio.length === 10 ? `1${limpio}` : limpio;
  return `https://wa.me/${rd}`;
}

function emailLink(email?: string): string | null {
  if (!email) return null;
  const limpio = email.trim();
  if (!limpio || !limpio.includes('@')) return null;
  return `mailto:${limpio}`;
}

// Limpia campos undefined antes de escribir en Firestore.
function limpiarUndefined<T extends object>(obj: T): T {
  const copia: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) copia[k] = v;
  }
  return copia as T;
}

// ────────────────────────────────────────────────────────────────────────
// Componente raíz
const CAMPOS_PRIVADOS = new Set(['cedula', 'telefonoFlota', 'whatsapp', 'emailContacto', 'correoRecuperacion', 'direccion', 'ubicacionCasa', 'fechaIngreso', 'fotoUrl', 'licenciaNumero', 'licenciaVencimiento', 'referenciasPersonales', 'contactosEmergencia']);
async function actualizarFicha(referencia: ReturnType<typeof doc>, datos: Record<string, unknown>) {
  const publico = Object.fromEntries(Object.entries(datos).filter(([k]) => !CAMPOS_PRIVADOS.has(k)));
  const privado = Object.fromEntries(Object.entries(datos).filter(([k]) => CAMPOS_PRIVADOS.has(k)));
  if (Object.keys(privado).length) await setDoc(doc(db, 'personal_privado', referencia.id), privado, { merge: true });
  if (Object.keys(publico).length) await updateDoc(referencia, publico);
}

// ────────────────────────────────────────────────────────────────────────

export default function PersonalUnificado() {
  const { userProfile, currentUser } = useApp();
  const [params, setParams] = useSearchParams();
  const esAdmin = userProfile?.rol === 'administrador';
  const esAdminCoord = esAdminOCoord(userProfile);

  const [personalBase, setPersonal] = useState<Personal[]>([]);
  const [datosPrivados, setDatosPrivados] = useState<Record<string, Partial<Personal>>>({});
  const personal = useMemo(() => personalBase.map(p => ({ ...p, ...(datosPrivados[p.id] ?? {}) })), [personalBase, datosPrivados]);
  useEffect(() => {
    if (!esAdminCoord) { setDatosPrivados({}); return; }
    return onSnapshot(collection(db, 'personal_privado'), snap => {
      setDatosPrivados(Object.fromEntries(snap.docs.map(d => [d.id, d.data()])));
    }, () => { setDatosPrivados({}); toast.error('No se pudieron cargar los datos privados del personal.'); });
  }, [esAdminCoord]);
  const [acceso, setAcceso] = useState<DatosAcceso | null>(null);
  const [accesoError, setAccesoError] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const [equipoFiltro, setEquipoFiltro] = useState<EquipoFiltro>('todos');
  const [tab, setTab] = useState<TabId>('datos');
  const personaSelId = params.get('personalId') || null;

  // Subscripción Firestore `personal`
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'personal'), orderBy('nombre')),
      (snap) => {
        setPersonal(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Personal)));
        setLoading(false);
      },
      (err) => {
        console.error('onSnapshot personal:', err);
        setLoading(false);
      },
    );
    return () => unsub();
  }, []);

  // Fetch de /api/admin/accesos (gateado server-side, puede fallar para roles sin permiso)
  const refrescarAcceso = useCallback(async () => {
    if (!esAdminCoord) {
      setAcceso(null);
      return;
    }
    try {
      const d = await equipoApi<DatosAcceso>('/api/admin/accesos');
      setAcceso(d);
      setAccesoError('');
    } catch (e) {
      setAcceso(null);
      setAccesoError(e instanceof Error ? e.message : 'No se pudo cargar la gestión de accesos.');
    }
  }, [esAdminCoord]);

  useEffect(() => {
    void refrescarAcceso();
  }, [refrescarAcceso]);

  const personaSel = personal.find((p) => p.id === personaSelId) || null;
  const accesoSel = acceso?.personas.find((x) => x.personalId === personaSelId) || null;

  const grupos = useMemo(() => {
    const base: Record<EquipoFiltro, Personal[]> = {
      todos: [],
      'Dirección': [],
      'Equipo A': [],
      'Equipo B': [],
      'Sin equipo': [],
      Desactivados: [],
    };
    for (const p of personal) {
      const a = acceso?.personas.find((x) => x.personalId === p.id);
      const g = equipoDePersona(p, a);
      base[g].push(p);
      if (g !== 'Desactivados') base.todos.push(p);
    }
    return base;
  }, [personal, acceso]);

  const seleccionar = useCallback(
    (id: string | null) => {
      const next = new URLSearchParams(params);
      if (id) next.set('personalId', id);
      else next.delete('personalId');
      setParams(next, { replace: true });
      setTab('datos');
    },
    [params, setParams],
  );

  if (loading) return <LoadingSpinner fullPage text="Cargando personal..." />;

  if (!puede(userProfile, 'personalVer')) {
    return (
      <div className="p-6">
        <div className="ms-bamboo">
          <div className="b-callout b-callout-danger">
            No tenés permiso para ver el módulo de Personal. Si creés que esto es un error, contactá
            al administrador.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ms-bamboo p-4 md:p-6">
      <div className="b-shell">
        <aside className="b-side" aria-label="Organización del personal">
          <small>Personal</small>
          {EQUIPO_OPCIONES.map((op) => {
            const total = grupos[op]?.length ?? 0;
            const esActivo = equipoFiltro === op;
            return (
              <button
                key={op}
                type="button"
                className={`b-side-link ${esActivo ? 'is-active' : ''}`}
                aria-current={esActivo ? 'page' : undefined}
                onClick={() => {
                  setEquipoFiltro(op);
                  seleccionar(null);
                }}
              >
                <span>{op === 'todos' ? 'Todos los equipos' : op}</span>
                <span className="b-side-count">{total}</span>
              </button>
            );
          })}

          <small>Atajos</small>
          <Link to="/admin/nomina" className="b-side-link">
            Nómina general
          </Link>
          <Link to="/admin/ponches" className="b-side-link">
            Ponches y asistencia
          </Link>
          <Link to="/admin/comisiones" className="b-side-link">
            Comisiones
          </Link>
        </aside>

        <main className="b-workspace">
          <div className="b-crumb">
            Personal / {personaSel ? personaSel.nombre : equipoFiltro === 'todos' ? 'Todos los equipos' : equipoFiltro}
          </div>

          {accesoError && !acceso && (
            <div className="b-callout b-callout-warn" role="alert" style={{ marginBottom: 12 }}>
              La gestión de accesos no está disponible: {accesoError}. Podés ver la ficha pero las
              acciones de cuenta (usuario, clave, equipo) quedan desactivadas en esta sesión.
            </div>
          )}

          {!personaSel && esAdminCoord && <AltaPersonalBamboo onCreado={id => { seleccionar(id); void refrescarAcceso(); }} />}
          {!personaSel ? (
            <ListaEquipos
              grupos={grupos}
              acceso={acceso}
              equipoFiltro={equipoFiltro}
              onSeleccionar={seleccionar}
            />
          ) : (
            <FichaUnificada
              persona={personaSel}
              acceso={accesoSel}
              personal={personal}
              tab={tab}
              onCambiarTab={setTab}
              onVolver={() => seleccionar(null)}
              onRefrescarAcceso={refrescarAcceso}
              esAdmin={esAdmin}
              esAdminCoord={esAdminCoord}
              currentUserUid={currentUser?.uid}
            />
          )}
        </main>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Lista por equipo
// ────────────────────────────────────────────────────────────────────────

function ListaEquipos({
  grupos,
  acceso,
  equipoFiltro,
  onSeleccionar,
}: {
  grupos: Record<EquipoFiltro, Personal[]>;
  acceso: DatosAcceso | null;
  equipoFiltro: EquipoFiltro;
  onSeleccionar: (id: string) => void;
}) {
  const columnas: EquipoFiltro[] =
    equipoFiltro === 'todos'
      ? ['Dirección', 'Equipo A', 'Equipo B', 'Sin equipo']
      : [equipoFiltro];

  return (
    <section>
      <h2 className="b-h3" style={{ marginBottom: 8 }}>
        {equipoFiltro === 'todos' ? 'Todos los equipos' : equipoFiltro}
      </h2>
      <p className="b-help" style={{ marginBottom: 16 }}>
        Elegí una persona para abrir su ficha completa. La organización se actualiza en vivo con los
        cambios de rol y equipo.
      </p>

      <div className="b-equipo-cols">
        {columnas.map((col) => {
          const items = grupos[col] || [];
          if (col === 'Sin equipo' && !items.length && equipoFiltro === 'todos') return null;
          // SPRINT-DISENO-BAMBOO-LOTE-1b (2026-10-07): separar vinculados de "sin
          // acceso" para que las fichas históricas sin uid Auth no se mezclen con
          // las cuentas activas de login. No se reactivan ni borran — se agrupan en
          // un desplegable al pie de la columna. Pendiente dejado por Codex en
          // docs/entregas/CLAUDE-CONTINUACION-2026-10-07.md.
          const conAcceso = items.filter((p) => !!p.uid);
          const sinAcceso = items.filter((p) => !p.uid);
          const renderTarjeta = (p: Personal) => {
            const a = acceso?.personas.find((x) => x.personalId === p.id);
            return (
              <button
                key={p.id}
                type="button"
                className="b-persona-card"
                onClick={() => onSeleccionar(p.id)}
              >
                <AvatarBamboo persona={p} />
                <div className="b-persona-main">
                  <strong>{p.nombre}</strong>
                  <span>
                    {ROL_LABELS[p.rol]}
                    {a?.usuario ? ` · ${a.usuario}` : ''}
                  </span>
                </div>
                {p.uid ? (
                  <span className="b-chip b-chip-ok">Acceso</span>
                ) : (
                  <span className="b-chip b-chip-off">Sin acceso</span>
                )}
              </button>
            );
          };
          return (
            <div key={col} className="b-equipo-col">
              <h3>
                {col} · {conAcceso.length}
                {sinAcceso.length > 0 && (
                  <span style={{ color: 'var(--b-muted)', fontWeight: 400 }}>
                    {' '}+ {sinAcceso.length} sin acceso
                  </span>
                )}
              </h3>
              {conAcceso.length === 0 && sinAcceso.length === 0 && (
                <p className="b-help">Sin personas activas en este grupo.</p>
              )}
              {conAcceso.map(renderTarjeta)}
              {sinAcceso.length > 0 && (
                <details className="b-sinacceso">
                  <summary>
                    Sin acceso vinculado · {sinAcceso.length}
                  </summary>
                  <p className="b-help" style={{ marginBottom: 8 }}>
                    Fichas activas laboralmente pero sin cuenta de acceso Auth.
                    Se conservan por historial; para habilitar el login abrí la ficha → pestaña Cuenta y permisos.
                  </p>
                  {sinAcceso.map(renderTarjeta)}
                </details>
              )}
            </div>
          );
        })}
      </div>

      {equipoFiltro === 'Desactivados' && grupos.Desactivados.length === 0 && (
        <div className="b-callout" style={{ marginTop: 16 }}>
          No hay personas desactivadas.
        </div>
      )}
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Avatar
// ────────────────────────────────────────────────────────────────────────

function AvatarBamboo({ persona, size }: { persona: Personal; size?: 'lg' }) {
  const style = size === 'lg' ? { width: 76, height: 76, fontSize: 24 } : undefined;
  if (persona.fotoUrl) {
    return (
      <div className="b-avatar" style={style}>
        <img src={persona.fotoUrl} alt={`Foto de ${persona.nombre}`} />
      </div>
    );
  }
  return (
    <div className="b-avatar" style={style} aria-hidden="true">
      {iniciales(persona.nombre)}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Ficha unificada (ProfileCard + TabBar + Panel)
// ────────────────────────────────────────────────────────────────────────

function FichaUnificada({
  persona,
  acceso,
  personal,
  tab,
  onCambiarTab,
  onVolver,
  onRefrescarAcceso,
  esAdmin,
  esAdminCoord,
  currentUserUid,
}: {
  persona: Personal;
  acceso: PersonaAcceso | null;
  personal: Personal[];
  tab: TabId;
  onCambiarTab: (t: TabId) => void;
  onVolver: () => void;
  onRefrescarAcceso: () => Promise<void>;
  esAdmin: boolean;
  esAdminCoord: boolean;
  currentUserUid?: string;
}) {
  const tabs: Array<{ id: TabId; label: string }> = [
    { id: 'datos', label: 'Datos personales' },
    { id: 'trabajo', label: 'Trabajo y equipo' },
    { id: 'nomina', label: 'Nómina y comisión' },
    { id: 'cuenta', label: 'Cuenta y permisos' },
    { id: 'documentos', label: 'Documentos' },
    { id: 'referencias', label: 'Referencias y emergencia' },
  ];

  const mapaUrl = urlAbrirMapa(persona.ubicacionCasa);
  const equipoLabel = equipoDePersona(persona, acceso);

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button type="button" className="b-btn is-ghost" onClick={onVolver}>
          <ArrowLeft size={16} aria-hidden="true" /> Volver al equipo
        </button>
      </div>

      <section className="b-profile">
        <AvatarBamboo persona={persona} size="lg" />
        <div className="b-profile-main">
          <h2>{persona.nombre}</h2>
          <p>
            {ROL_LABELS[persona.rol]} · {equipoLabel}
            {acceso?.usuario ? ` · usuario ${acceso.usuario}` : ''}
          </p>
          <p>
            {persona.activo ? 'Activo' : 'Desactivado'}
            {persona.fechaIngreso ? ` · Ingreso ${persona.fechaIngreso}` : ' · Ingreso por registrar'}
          </p>
          <div className="b-profile-actions">
            {telefonoLink(persona.telefono) && (
              <a className="b-link-btn" href={telefonoLink(persona.telefono)!}>
                <Phone size={14} aria-hidden="true" /> Llamar
              </a>
            )}
            {whatsappLink(persona.whatsapp || persona.telefono) && (
              <a
                className="b-link-btn"
                href={whatsappLink(persona.whatsapp || persona.telefono)!}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MessageCircle size={14} aria-hidden="true" /> WhatsApp
              </a>
            )}
            {emailLink(persona.emailContacto) && (
              <a className="b-link-btn" href={emailLink(persona.emailContacto)!}>
                <Mail size={14} aria-hidden="true" /> Correo
              </a>
            )}
            {mapaUrl && (
              <a
                className="b-link-btn"
                href={mapaUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MapPin size={14} aria-hidden="true" /> Abrir en Google Maps
              </a>
            )}
          </div>
        </div>
      </section>

      <nav className="b-tabs" role="tablist" aria-label="Ficha del empleado">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => onCambiarTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <section
        className="b-panel"
        role="tabpanel"
        id={`panel-${tab}`}
        aria-labelledby={`tab-${tab}`}
      >
        {tab === 'datos' && <TabDatos persona={persona} esAdminCoord={esAdminCoord} />}
        {tab === 'trabajo' && (
          <TabTrabajo
            persona={persona}
            acceso={acceso}
            personal={personal}
            esAdminCoord={esAdminCoord}
            onRefrescarAcceso={onRefrescarAcceso}
          />
        )}
        {tab === 'nomina' && <TabNomina persona={persona} esAdminCoord={esAdminCoord} />}
        {tab === 'cuenta' && (
          <TabCuenta
            persona={persona}
            acceso={acceso}
            onRefrescarAcceso={onRefrescarAcceso}
            esAdmin={esAdmin}
            esAdminCoord={esAdminCoord}
            currentUserUid={currentUserUid}
          />
        )}
        {tab === 'documentos' && <TabDocumentos persona={persona} esAdminCoord={esAdminCoord} />}
        {tab === 'referencias' && <TabReferencias persona={persona} esAdminCoord={esAdminCoord} />}
      </section>
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Tab 1 — Datos personales (identidad + contacto + domicilio)
// ────────────────────────────────────────────────────────────────────────

interface SaveState {
  guardando: boolean;
  mensaje: string;
}

function useFichaForm<T>(persona: Personal, mapear: (p: Personal) => T) {
  const [form, setForm] = useState<T>(() => mapear(persona));
  // Sync al cambiar de persona
  useEffect(() => {
    setForm(mapear(persona));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persona.id]);
  return [form, setForm] as const;
}

function TabDatos({ persona, esAdminCoord }: { persona: Personal; esAdminCoord: boolean }) {
  const [form, setForm] = useFichaForm(persona, (p) => ({
    cedula: p.cedula ?? '',
    telefono: p.telefono ?? '',
    telefonoFlota: p.telefonoFlota ?? '',
    whatsapp: p.whatsapp ?? '',
    email: p.emailContacto ?? '',
    direccion: p.direccion ?? '',
    ubicacionEnlace: p.ubicacionCasa?.enlace ?? '',
  }));
  const [estado, setEstado] = useState<SaveState>({ guardando: false, mensaje: '' });

  const coords = useMemo(() => detectarCoordenadasURL(form.ubicacionEnlace), [form.ubicacionEnlace]);
  const mapaUrl = urlAbrirMapa({ enlace: form.ubicacionEnlace.trim(), ...(coords ?? {}) });
  const enlaceInvalido = !!form.ubicacionEnlace.trim() && !mapaUrl;

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!esAdminCoord) return;
    setEstado({ guardando: true, mensaje: '' });
    try {
      if (enlaceInvalido) throw new Error('Pega una ubicación válida de Google Maps.');
      const ubicacion = form.ubicacionEnlace.trim()
        ? limpiarUndefined({
            enlace: form.ubicacionEnlace.trim(),
            lat: coords?.lat,
            lng: coords?.lng,
          })
        : null;
      await actualizarFicha(
        doc(db, 'personal', persona.id),
        limpiarActualizacion({
          cedula: form.cedula.trim() || undefined,
          telefono: form.telefono.trim() || undefined,
          telefonoFlota: form.telefonoFlota.trim() || undefined,
          whatsapp: form.whatsapp.trim() || undefined,
          emailContacto: form.email.trim().toLowerCase() || undefined,
          direccion: form.direccion.trim() || undefined,
          ubicacionCasa: ubicacion ?? undefined,
        }),
      );
      toast.success('Datos personales guardados');
      setEstado({ guardando: false, mensaje: 'Guardado.' });
    } catch (err) {
      console.error('TabDatos guardar:', err);
      toast.error('No se pudieron guardar los datos.');
      setEstado({ guardando: false, mensaje: 'Error al guardar.' });
    }
  }

  const readonly = !esAdminCoord;

  return (
    <form onSubmit={guardar}>
      <h3 className="b-h3">Identidad y contacto</h3>
      <div className="b-fields">
        <Campo etiqueta="Cédula o identificación">
          <input
            className="b-input"
            value={form.cedula}
            onChange={(e) => setForm({ ...form, cedula: e.target.value })}
            placeholder="Número de identificación"
            disabled={readonly}
            maxLength={30}
            inputMode="numeric"
          />
        </Campo>
        <Campo etiqueta="Teléfono personal">
          <input
            className="b-input"
            value={form.telefono}
            onChange={(e) => setForm({ ...form, telefono: e.target.value })}
            placeholder="809 000 0000"
            disabled={readonly}
            inputMode="tel"
            maxLength={20}
          />
        </Campo>
        <Campo etiqueta="Flota · opcional">
          <input
            className="b-input"
            value={form.telefonoFlota}
            onChange={(e) => setForm({ ...form, telefonoFlota: e.target.value })}
            placeholder="Número asignado por la empresa"
            disabled={readonly}
            inputMode="tel"
            maxLength={20}
          />
        </Campo>
        <Campo etiqueta="WhatsApp">
          <input
            className="b-input"
            value={form.whatsapp}
            onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
            placeholder="Si es distinto al teléfono personal"
            disabled={readonly}
            inputMode="tel"
            maxLength={20}
          />
        </Campo>
        <Campo etiqueta="Correo de contacto" ancho="completo">
          <input
            className="b-input"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="Correo personal (no es el de acceso)"
            disabled={readonly}
          />
          <p className="b-help">
            Este correo se muestra como contacto del empleado. El correo de acceso al sistema se
            edita en la pestaña Cuenta y permisos.
          </p>
        </Campo>
      </div>

      <div className="b-group">
        <h3 className="b-h3">Domicilio</h3>
        <div className="b-fields">
          <Campo etiqueta="Dirección escrita" ancho="completo">
            <input
              className="b-input"
              value={form.direccion}
              onChange={(e) => setForm({ ...form, direccion: e.target.value })}
              placeholder="Calle, número, sector, referencia"
              disabled={readonly}
              maxLength={240}
            />
          </Campo>
          <Campo etiqueta="Enlace de ubicación · WhatsApp o Google Maps" ancho="completo">
            <input
              className="b-input"
              value={form.ubicacionEnlace}
              onChange={(e) => setForm({ ...form, ubicacionEnlace: e.target.value })}
              placeholder="Pega aquí la ubicación o enlace de Maps"
              disabled={readonly}
              autoCapitalize="none"
            />
            {enlaceInvalido && (
              <p className="b-help" style={{ color: '#b45309' }}>
                No se reconoció una ubicación. Pegá el enlace completo de Maps o las coordenadas que
                aparecen en el mensaje. Un enlace de chat (wa.me) no indica un domicilio.
              </p>
            )}
          </Campo>
        </div>
        <div className="b-location">
          <div>
            <strong>Ubicación de la casa</strong>
            {coords ? (
              <p>Coordenadas detectadas: {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}</p>
            ) : mapaUrl ? (
              <p>Enlace de Maps guardado · se abrirá en una nueva pestaña.</p>
            ) : (
              <p>Agregá una ubicación para abrirla en Maps.</p>
            )}
          </div>
          {mapaUrl && (
            <a
              className="b-link-btn"
              href={mapaUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MapPin size={14} aria-hidden="true" /> Abrir en Google Maps
            </a>
          )}
        </div>
      </div>

      <FooterGuardar estado={estado} readonly={readonly} />
    </form>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Tab 2 — Trabajo y equipo
// ────────────────────────────────────────────────────────────────────────

function TabTrabajo({
  persona,
  acceso,
  personal,
  esAdminCoord,
  onRefrescarAcceso,
}: {
  persona: Personal;
  acceso: PersonaAcceso | null;
  personal: Personal[];
  esAdminCoord: boolean;
  onRefrescarAcceso: () => Promise<void>;
}) {
  const [form, setForm] = useFichaForm(persona, (p) => ({
    rol: p.rol,
    especialidad: p.especialidad ?? '',
    fechaIngreso: p.fechaIngreso ?? '',
    operariaId: p.operariaId ?? '',
  }));
  const [equipo, setEquipo] = useState<string>(acceso?.equipo ?? '');
  useEffect(() => {
    setEquipo(acceso?.equipo ?? '');
  }, [acceso?.equipo]);

  const [estado, setEstado] = useState<SaveState>({ guardando: false, mensaje: '' });

  const operariasDisponibles = useMemo(
    () => personal.filter((p) => p.rol === 'operaria' && p.activo && p.uid),
    [personal],
  );

  // @safe-non-tx: la escritura primaria es `personal/{id}`. La sincronización a
  // `usuarios/{uid}` y la auditoría son side-effects "best effort": si una falla
  // no debe revertir el cambio de rol/equipo ya aplicado al expediente. Patrón
  // heredado de la antigua `GestionUsuarios.tsx` (SPRINT-105 y SPRINT-PERSONAL-EDIT-UNIFY).
  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!esAdminCoord) return;
    setEstado({ guardando: true, mensaje: '' });
    try {
      const rolCambio = form.rol !== persona.rol;
      // 1. Guardar en personal/{id}
      const operariaNombre = operariasDisponibles.find((o) => o.id === form.operariaId)?.nombre;
      await actualizarFicha(
        doc(db, 'personal', persona.id),
        limpiarActualizacion({
          rol: form.rol,
          especialidad: form.especialidad.trim() || undefined,
          fechaIngreso: form.fechaIngreso || undefined,
          operariaId: form.operariaId || undefined,
          operariaNombre: operariaNombre || undefined,
        }),
      );
      // 2. Sync rol en usuarios/{uid} si hay auth vinculado (best effort)
      if (persona.uid && persona.uid !== 'existing' && rolCambio) {
        try {
          await setDoc(doc(db, 'usuarios', persona.uid), { rol: form.rol }, { merge: true });
        } catch (err) {
          console.warn('Sync rol a usuarios/{uid}:', err);
        }
        // 3. Auditoría cambio de rol (best effort)
        try {
          await addDoc(collection(db, 'auditoria_admin'), {
            accion: 'cambiar_rol_usuario',
            actorUid: auth.currentUser?.uid ?? null,
            solicitanteUid: auth.currentUser?.uid ?? null,
            solicitanteEmail: auth.currentUser?.email ?? null,
            objetivoUid: persona.uid,
            objetivoTipo: 'usuario',
            objetivoId: persona.id,
            cambios: { rol: { antes: persona.rol, despues: form.rol } },
            timestamp: serverTimestamp(),
            createdAt: serverTimestamp(),
          });
        } catch (err) {
          console.warn('Auditoría rol:', err);
        }
      }
      // 4. Equipo via /api/admin/accesos si cambió
      if (acceso && equipo !== (acceso.equipo ?? '')) {
        await equipoApi('/api/admin/accesos', {
          accion: 'guardar',
          uid: acceso.uid,
          version: acceso.version,
          nombre: acceso.nombre,
          usuario: acceso.usuario,
          equipo,
          especialidad: form.especialidad.trim(),
          rol: acceso.rol,
        });
        await onRefrescarAcceso();
      }
      toast.success('Trabajo y equipo guardados');
      setEstado({ guardando: false, mensaje: 'Guardado.' });
    } catch (err) {
      console.error('TabTrabajo guardar:', err);
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar.');
      setEstado({ guardando: false, mensaje: 'Error al guardar.' });
    }
  }

  const readonly = !esAdminCoord;

  return (
    <form onSubmit={guardar}>
      <h3 className="b-h3">Trabajo y equipo</h3>
      <div className="b-fields">
        <Campo etiqueta="Rol">
          <select
            className="b-input"
            value={form.rol}
            onChange={(e) => setForm({ ...form, rol: e.target.value as Rol })}
            disabled={readonly}
          >
            {ROL_OPCIONES_SISTEMA.map((r) => (
              <option key={r} value={r}>
                {ROL_LABELS[r]}
              </option>
            ))}
          </select>
          {form.rol !== persona.rol && (
            <p className="b-help" style={{ color: '#b45309' }}>
              El cambio de rol queda registrado en auditoría. No cambia el equipo automáticamente.
            </p>
          )}
        </Campo>
        <Campo etiqueta="Equipo">
          <select
            className="b-input"
            value={equipo}
            onChange={(e) => setEquipo(e.target.value)}
            disabled={readonly || !acceso}
          >
            <option value="">Sin equipo</option>
            <option value="A">Equipo A</option>
            <option value="B">Equipo B</option>
          </select>
          {!acceso && (
            <p className="b-help">
              Esta persona todavía no tiene acceso vinculado — el equipo se asigna una vez que se
              cree la cuenta de acceso.
            </p>
          )}
        </Campo>
        {form.rol !== 'operaria' && form.rol !== 'administrador' && form.rol !== 'coordinadora' && (
          <Campo etiqueta="Operaria responsable">
            <select
              className="b-input"
              value={form.operariaId}
              onChange={(e) => setForm({ ...form, operariaId: e.target.value })}
              disabled={readonly}
            >
              <option value="">Sin responsable asignada</option>
              {operariasDisponibles.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nombre}
                </option>
              ))}
            </select>
          </Campo>
        )}
        <Campo etiqueta="Fecha de entrada">
          <input
            className="b-input"
            type="date"
            value={form.fechaIngreso}
            onChange={(e) => setForm({ ...form, fechaIngreso: e.target.value })}
            disabled={readonly}
          />
        </Campo>
        <Campo etiqueta="Habilidades y especialidades" ancho="completo">
          <input
            className="b-input"
            value={form.especialidad}
            onChange={(e) => setForm({ ...form, especialidad: e.target.value })}
            placeholder="Ej. lavadoras, refrigeración, atención al cliente"
            disabled={readonly}
            maxLength={300}
          />
        </Campo>
      </div>
      <p className="b-help" style={{ marginTop: 12 }}>
        Rol, equipo y permisos individuales son configuraciones distintas. Cambiá sólo lo que
        corresponda.
      </p>
      <FooterGuardar estado={estado} readonly={readonly} />
    </form>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Tab 3 — Nómina y comisión
// ────────────────────────────────────────────────────────────────────────

function TabNomina({ persona, esAdminCoord }: { persona: Personal; esAdminCoord: boolean }) {
  const esTecnico = persona.rol === 'tecnico';
  const esMetaMensual = persona.rol === 'secretaria' || persona.rol === 'operaria';
  const [form, setForm] = useFichaForm(persona, (p) => ({
    sueldoBase: p.sueldoBase ?? 0,
    nivel: (p.nivel ?? 'junior') as 'junior' | 'senior',
    comisionPorcentaje: p.comisionPorcentaje ?? comisionDefaultPorNivel('junior'),
  }));
  const [vista, setVista] = useState<'admin' | 'empleado'>('admin');
  const [estado, setEstado] = useState<SaveState>({ guardando: false, mensaje: '' });

  const aplicaComision = ROLES_CON_COMISION.includes(persona.rol);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!esAdminCoord) return;
    setEstado({ guardando: true, mensaje: '' });
    try {
      await actualizarFicha(
        doc(db, 'personal', persona.id),
        limpiarActualizacion({
          sueldoBase: Number(form.sueldoBase),
          nivel: esTecnico ? form.nivel : undefined,
          comisionPorcentaje:
            esTecnico && form.comisionPorcentaje >= 0 ? Number(form.comisionPorcentaje) : undefined,
        }),
      );
      toast.success('Nómina y comisión guardadas');
      setEstado({ guardando: false, mensaje: 'Guardado.' });
    } catch (err) {
      console.error('TabNomina guardar:', err);
      toast.error('No se pudo guardar.');
      setEstado({ guardando: false, mensaje: 'Error al guardar.' });
    }
  }

  const readonly = !esAdminCoord;

  return (
    <form onSubmit={guardar}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
        <h3 className="b-h3" style={{ margin: 0 }}>
          Nómina y comisión
        </h3>
        {esAdminCoord && (
          <label className="b-field-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            Vista
            <select
              className="b-input"
              style={{ width: 'auto', minHeight: 38 }}
              value={vista}
              onChange={(e) => setVista(e.target.value as 'admin' | 'empleado')}
            >
              <option value="admin">Gestión autorizada</option>
              <option value="empleado">Cómo lo ve el empleado</option>
            </select>
          </label>
        )}
      </div>

      {vista === 'admin' && (
        <>
          <div className="b-fields">
            <Campo etiqueta="Salario base mensual · RD$">
              <input
                className="b-input"
                type="number"
                min={0}
                step={100}
                value={form.sueldoBase}
                onChange={(e) => setForm({ ...form, sueldoBase: Number(e.target.value) })}
                disabled={readonly}
              />
            </Campo>
            {aplicaComision && esTecnico && (
              <>
                <Campo etiqueta="Nivel técnico">
                  <select
                    className="b-input"
                    value={form.nivel}
                    onChange={(e) => {
                      const nivel = e.target.value as 'junior' | 'senior';
                      setForm({
                        ...form,
                        nivel,
                        comisionPorcentaje: comisionDefaultPorNivel(nivel),
                      });
                    }}
                    disabled={readonly}
                  >
                    <option value="junior">Junior</option>
                    <option value="senior">Senior</option>
                  </select>
                </Campo>
                <Campo etiqueta="Comisión por trabajo (%)">
                  <input
                    className="b-input"
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={form.comisionPorcentaje}
                    onChange={(e) =>
                      setForm({ ...form, comisionPorcentaje: Number(e.target.value) })
                    }
                    disabled={readonly}
                  />
                  <p className="b-help">
                    Default según nivel: {comisionDefaultPorNivel(form.nivel)}%. El ajuste en el
                    conduce todavía no está conectado — Jorge y Codex están definiendo la base de
                    cálculo.
                  </p>
                </Campo>
              </>
            )}
          </div>

          {esMetaMensual && (
            <div className="b-group">
              <h3 className="b-h3">Bono por meta mensual del equipo</h3>
              <div className="b-callout b-callout-warn">
                Las reglas de meta mensual (ventas efectivamente cobradas, cambios durante el mes,
                devoluciones, cierre de nómina) aún no están cerradas con Jorge. Por ahora el bono
                se queda en RD$0 hasta que se active el cálculo; el máximo acordado es RD$4,000 por
                persona, proporcional al cumplimiento.
              </div>
            </div>
          )}

          <div className="b-group">
            <h3 className="b-h3">Historial laboral vinculado</h3>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Link
                to={`/admin/nomina?personalId=${encodeURIComponent(persona.id)}`}
                className="b-link-btn"
              >
                Nómina
              </Link>
              <Link
                to={`/admin/ponches?personalId=${encodeURIComponent(persona.id)}`}
                className="b-link-btn"
              >
                Asistencia y horas
              </Link>
              <Link
                to={`/admin/prestamos?personalId=${encodeURIComponent(persona.id)}`}
                className="b-link-btn"
              >
                Préstamos
              </Link>
              <Link
                to={`/admin/avances?personalId=${encodeURIComponent(persona.id)}`}
                className="b-link-btn"
              >
                Avances
              </Link>
              <Link
                to={`/admin/comisiones?personalId=${encodeURIComponent(persona.id)}`}
                className="b-link-btn"
              >
                Comisiones
              </Link>
            </div>
          </div>
        </>
      )}

      {vista === 'empleado' && (
        <div>
          <h3 className="b-h3">Cumplimiento del equipo · ejemplo</h3>
          <div className="b-callout b-callout-info">
            El empleado sólo ve su porcentaje de cumplimiento, no los montos monetarios ni la meta.
            Este bloque entra en producción cuando Jorge active las reglas de meta.
          </div>
          <p style={{ marginTop: 12 }}>Avance mensual hacia la meta (muestra):</p>
          <div
            className="b-meter"
            role="progressbar"
            aria-valuenow={0}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Cumplimiento mensual (vista empleado)"
          >
            <span style={{ width: '0%' }} />
          </div>
          <p className="b-help" style={{ marginTop: 8 }}>
            Sin datos activos. Reglas de meta pendientes de autorización.
          </p>
        </div>
      )}

      {vista === 'admin' && <FooterGuardar estado={estado} readonly={readonly} />}
    </form>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Tab 4 — Cuenta y permisos
// ────────────────────────────────────────────────────────────────────────

function TabCuenta({
  persona,
  acceso,
  onRefrescarAcceso,
  esAdmin,
  esAdminCoord,
  currentUserUid,
}: {
  persona: Personal;
  acceso: PersonaAcceso | null;
  onRefrescarAcceso: () => Promise<void>;
  esAdmin: boolean;
  esAdminCoord: boolean;
  currentUserUid?: string;
}) {
  const [form, setForm] = useFichaForm(persona, (p) => ({
    correoRecuperacion: p.correoRecuperacion ?? '',
    permisosPersonalizados: !!p.permisosPersonalizados,
    permisosSistema: p.permisosSistema || permisosDefaultDeRol(p.rol),
    iaHabilitada: p.iaHabilitada === true,
  }));
  const [usuario, setUsuario] = useState(acceso?.usuario ?? '');
  useEffect(() => setUsuario(acceso?.usuario ?? ''), [acceso?.usuario]);

  const [estado, setEstado] = useState<SaveState>({ guardando: false, mensaje: '' });
  const [modoClave, setModoClave] = useState<'oculta' | 'cambiar' | 'reset-email' | 'crear'>('oculta');
  const [claveNueva, setClaveNueva] = useState('');
  const [verClave, setVerClave] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const iaBloqueada = persona.rol === 'tecnico' || persona.rol === 'ayudante';
  const propio = currentUserUid === persona.uid;

  const togglePermiso = (key: keyof PermisosSistema) => {
    setForm((f) => ({
      ...f,
      permisosSistema: { ...f.permisosSistema, [key]: !f.permisosSistema[key] },
    }));
  };

  // @safe-non-tx: `personal/{id}` es fuente de verdad. El sync a `usuarios/{uid}`
  // es best-effort para que los permisos se reflejen en tiempo real en el perfil
  // del usuario sin bloquear la escritura primaria. Patrón heredado de la antigua
  // `GestionUsuarios.tsx`.
  async function guardarPermisos(e: FormEvent) {
    e.preventDefault();
    if (!esAdminCoord) return;
    setEstado({ guardando: true, mensaje: '' });
    try {
      const data: Record<string, unknown> = limpiarActualizacion({
        correoRecuperacion: form.correoRecuperacion.trim() || undefined,
        permisosPersonalizados: form.permisosPersonalizados,
        iaHabilitada: form.iaHabilitada === true,
      });
      if (form.permisosPersonalizados) {
        data.permisosSistema = form.permisosSistema;
      }
      await actualizarFicha(doc(db, 'personal', persona.id), data);
      if (persona.uid && persona.uid !== 'existing') {
        try {
          const sync: Record<string, unknown> = { iaHabilitada: form.iaHabilitada === true };
          if (form.permisosPersonalizados) {
            sync.permisosPersonalizados = true;
            sync.permisosSistema = form.permisosSistema;
          } else {
            sync.permisosPersonalizados = false;
          }
          await setDoc(doc(db, 'usuarios', persona.uid), sync, { merge: true });
        } catch (err) {
          console.warn('Sync permisos:', err);
        }
      }
      toast.success('Permisos guardados');
      setEstado({ guardando: false, mensaje: 'Guardado.' });
    } catch (err) {
      console.error('TabCuenta permisos:', err);
      toast.error('No se pudieron guardar los permisos.');
      setEstado({ guardando: false, mensaje: 'Error al guardar.' });
    }
  }

  async function guardarUsuario() {
    if (!acceso) return;
    if (!esAdminCoord) return;
    if (usuario === acceso.usuario) return;
    setOcupado(true);
    try {
      await equipoApi('/api/admin/accesos', {
        accion: 'guardar',
        uid: acceso.uid,
        version: acceso.version,
        nombre: acceso.nombre,
        usuario,
        equipo: acceso.equipo,
        especialidad: acceso.especialidad,
        rol: acceso.rol,
      });
      await onRefrescarAcceso();
      toast.success('Nombre de usuario actualizado');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo cambiar el usuario.');
    } finally {
      setOcupado(false);
    }
  }

  async function cambiarClaveDirecta() {
    if (!persona.email || !persona.uid || persona.uid === 'existing') {
      toast.error('Esta persona no tiene cuenta Auth vinculada.');
      return;
    }
    if (claveNueva.length < 8) {
      toast.error('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (acceso) {
      // Preferir endpoint /api/admin/accesos cuando acceso está disponible (rota tokens).
      setOcupado(true);
      try {
        await equipoApi('/api/admin/accesos', { accion: 'clave', uid: acceso.uid, password: claveNueva });
        toast.success('Clave actualizada. Se cerraron sus sesiones anteriores.');
        setClaveNueva('');
        setModoClave('oculta');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'No se pudo cambiar la clave.');
      } finally {
        setOcupado(false);
      }
      return;
    }
    // Fallback al endpoint legacy /api/admin/reset-password
    setOcupado(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const resp = await fetch('/api/admin/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, targetEmail: persona.email, newPassword: claveNueva }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        toast.error(data.error || `Error ${resp.status}`);
        return;
      }
      toast.success('Clave cambiada.');
      setClaveNueva('');
      setModoClave('oculta');
    } catch (err) {
      console.error(err);
      toast.error('No se pudo cambiar la clave.');
    } finally {
      setOcupado(false);
    }
  }

  async function enviarResetEmail() {
    if (!persona.email) {
      toast.error('No hay email configurado.');
      return;
    }
    setOcupado(true);
    try {
      await sendPasswordResetEmail(auth, persona.email);
      toast.success('Email de recuperación enviado.');
      setModoClave('oculta');
    } catch (err) {
      console.error(err);
      toast.error('No se pudo enviar el email.');
    } finally {
      setOcupado(false);
    }
  }

  async function crearAcceso() {
    if (!persona.email) {
      toast.error('Esta persona no tiene email configurado.');
      return;
    }
    if (claveNueva.length < 8) {
      toast.error('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    setOcupado(true);
    try {
      // Usar app secundaria (preserva sesión del admin)
      const secondaryApp = initializeApp(auth.app.options, 'PersonalBambooCrearAcceso');
      const secondaryAuth = getAuth(secondaryApp);
      const cred = await createUserWithEmailAndPassword(secondaryAuth, persona.email, claveNueva);
      try {
        const secondaryDb = getFirestore(secondaryApp);
        await setDoc(doc(secondaryDb, 'usuarios', cred.user.uid), {
          nombre: persona.nombre,
          email: persona.email.toLowerCase(),
          rol: persona.rol,
          activo: persona.activo !== false,
          createdAt: serverTimestamp(),
          creadoDesdeGestionUsuarios: true,
        });
      } finally {
        await deleteApp(secondaryApp);
      }
      await actualizarFicha(doc(db, 'personal', persona.id), { uid: cred.user.uid });
      toast.success(`Acceso creado para ${persona.nombre}`);
      await onRefrescarAcceso();
      setClaveNueva('');
      setModoClave('oculta');
    } catch (err) {
      const errCode = (err as { code?: string })?.code;
      if (errCode === 'auth/email-already-in-use') {
        toast('Este email ya tiene cuenta Auth. Usá "Restablecer contraseña".', { icon: 'ℹ️' });
      } else if (errCode === 'auth/weak-password') {
        toast.error('Contraseña demasiado débil.');
      } else {
        console.error(err);
        toast.error('No se pudo crear la cuenta.');
      }
    } finally {
      setOcupado(false);
    }
  }

  async function alternarBloqueo() {
    if (!acceso) return;
    if (!esAdminCoord) return;
    if (propio) {
      toast.error('No podés bloquearte a vos mismo desde esta ficha.');
      return;
    }
    const activar = !acceso.activo;
    if (!activar && !confirm(`Eliminar el acceso de ${persona.nombre} cerrará sus sesiones. ¿Confirmás?`)) return;
    setOcupado(true);
    try {
      await equipoApi('/api/admin/accesos', {
        accion: activar ? 'restaurar' : 'eliminar',
        uid: acceso.uid,
      });
      await onRefrescarAcceso();
      toast.success(activar ? 'Acceso restaurado.' : 'Acceso eliminado (recuperable).');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo cambiar el estado.');
    } finally {
      setOcupado(false);
    }
  }

  async function alternarSupervisora() {
    if (!acceso || !esAdmin) return;
    if (acceso.rol !== 'coordinadora') return;
    setOcupado(true);
    try {
      await equipoApi('/api/admin/accesos', {
        accion: 'supervisora',
        uid: acceso.uid,
        habilitada: !acceso.supervisora,
      });
      await onRefrescarAcceso();
      toast.success(acceso.supervisora ? 'Supervisión retirada.' : 'Supervisora autorizada.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo actualizar.');
    } finally {
      setOcupado(false);
    }
  }

  async function alternarRecuperacion() {
    if (!acceso) return;
    const esElegible = acceso.rol === 'administrador' || (acceso.rol === 'coordinadora' && acceso.supervisora);
    if (!esElegible) return;
    if (!acceso.email) {
      toast.error('Configurá primero un correo real en la cuenta.');
      return;
    }
    setOcupado(true);
    try {
      await equipoApi('/api/admin/accesos', {
        accion: 'recuperacion',
        uid: acceso.uid,
        habilitada: !acceso.recuperacion,
      });
      await onRefrescarAcceso();
      toast.success('Recuperación por correo actualizada.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo actualizar.');
    } finally {
      setOcupado(false);
    }
  }

  const readonly = !esAdminCoord;
  const permisosGrupos: Array<{ titulo: string; keys: Array<keyof PermisosSistema> }> = [
    { titulo: 'Órdenes', keys: ['ordenesVer', 'ordenesCrear', 'ordenesModificar', 'ordenesModificarFueraGrupo', 'ordenesEliminar', 'ordenesVerEliminadas'] },
    { titulo: 'Cotizaciones', keys: ['cotizacionesVer', 'cotizacionesCrear', 'cotizacionesModificar', 'cotizacionesAprobarPrecio'] },
    { titulo: 'Facturas', keys: ['facturasVer', 'facturasCrear', 'facturasModificar', 'facturasEliminar'] },
    { titulo: 'Pagos y facturación', keys: ['pagosRegistrar', 'pagosVerificar', 'ordenesEnviarAFacturacion', 'facturasCerrar'] },
    { titulo: 'Clientes', keys: ['clientesVer', 'clientesCrear', 'clientesModificar', 'clientesEliminar'] },
    { titulo: 'Personal', keys: ['personalVer', 'personalCrear', 'personalModificar', 'personalEliminar'] },
    { titulo: 'Gastos', keys: ['gastosVer', 'gastosCrear', 'gastosEliminar'] },
    { titulo: 'Operaciones', keys: ['bancosGestionar', 'avancesGestionar', 'clientesReactivacionGestionar'] },
    { titulo: 'Otros', keys: ['rendimientoVer', 'configuracionVer', 'configuracionModificar', 'cierreDiaEjecutar'] },
  ];

  return (
    <form onSubmit={guardarPermisos}>
      <h3 className="b-h3">Cuenta de acceso</h3>

      {!acceso && (
        <div className="b-callout b-callout-info" style={{ marginBottom: 12 }}>
          Esta persona todavía no tiene cuenta de acceso vinculada. Usá los botones para crearla o
          sincronizarla con una cuenta Auth existente.
        </div>
      )}

      <div className="b-fields">
        <Campo etiqueta="Nombre de usuario">
          <input
            className="b-input"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value.toLowerCase())}
            placeholder="apellido, nombre.apellido…"
            disabled={readonly || !acceso}
            pattern="[a-z][a-z0-9._\-]{2,39}"
            autoCapitalize="none"
            autoComplete="off"
          />
          {acceso && usuario !== acceso.usuario && (
            <button
              type="button"
              className="b-btn is-ghost"
              onClick={guardarUsuario}
              disabled={ocupado}
              style={{ marginTop: 8 }}
            >
              Guardar nombre de usuario
            </button>
          )}
          {acceso && (
            <button
              type="button"
              className="b-btn is-ghost"
              onClick={() => setUsuario(sugerirUsuario(persona.nombre, acceso.equipo))}
              disabled={readonly}
              style={{ marginTop: 4 }}
            >
              Sugerir nuevo usuario
            </button>
          )}
        </Campo>
        <Campo etiqueta="Estado de la cuenta">
          <div className="b-link-btn" style={{ cursor: 'default', pointerEvents: 'none' }}>
            {acceso?.activo === false ? (
              <>
                <UserX size={14} aria-hidden="true" /> Desactivada (recuperable)
              </>
            ) : (
              <>
                <UserCheck size={14} aria-hidden="true" /> Activa
              </>
            )}
          </div>
          {acceso && !propio && esAdminCoord && (
            <button
              type="button"
              className={`b-btn ${acceso.activo ? 'is-danger' : 'is-primary'}`}
              onClick={alternarBloqueo}
              disabled={ocupado}
              style={{ marginTop: 8 }}
            >
              {acceso.activo ? 'Eliminar acceso' : 'Restaurar acceso'}
            </button>
          )}
        </Campo>
        <Campo etiqueta="Correo de recuperación · independiente del contacto" ancho="completo">
          <input
            className="b-input"
            type="email"
            value={form.correoRecuperacion}
            onChange={(e) => setForm({ ...form, correoRecuperacion: e.target.value })}
            placeholder="Correo autorizado para recuperación"
            disabled={readonly}
          />
          {acceso?.rol === 'administrador' || (acceso?.rol === 'coordinadora' && acceso?.supervisora) ? (
            <button
              type="button"
              className="b-btn is-ghost"
              onClick={alternarRecuperacion}
              disabled={ocupado || !acceso?.email}
              style={{ marginTop: 8 }}
            >
              {acceso?.recuperacion ? 'Deshabilitar recuperación por correo' : 'Habilitar recuperación por correo'}
            </button>
          ) : (
            <p className="b-help">Reservado para gerencia y supervisora autorizada.</p>
          )}
        </Campo>
      </div>

      <div className="b-group">
        <h3 className="b-h3">Contraseña</h3>
        {modoClave === 'oculta' && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {persona.uid && persona.uid !== 'existing' ? (
              <>
                <button
                  type="button"
                  className="b-btn"
                  onClick={() => setModoClave('cambiar')}
                  disabled={readonly}
                >
                  <Key size={14} aria-hidden="true" /> Cambiar contraseña
                </button>
                <button
                  type="button"
                  className="b-btn is-ghost"
                  onClick={() => setModoClave('reset-email')}
                  disabled={readonly || !persona.email}
                >
                  <Mail size={14} aria-hidden="true" /> Enviar email de reset
                </button>
              </>
            ) : (
              <button
                type="button"
                className="b-btn is-primary"
                onClick={() => setModoClave('crear')}
                disabled={readonly || !persona.email}
              >
                <KeyRound size={14} aria-hidden="true" /> Crear cuenta de acceso
              </button>
            )}
            {esAdmin && acceso?.rol === 'coordinadora' && (
              <button
                type="button"
                className="b-btn is-ghost"
                onClick={alternarSupervisora}
                disabled={ocupado}
              >
                <Shield size={14} aria-hidden="true" />{' '}
                {acceso.supervisora ? 'Retirar supervisión' : 'Autorizar como supervisora general'}
              </button>
            )}
          </div>
        )}

        {(modoClave === 'cambiar' || modoClave === 'crear') && (
          <div style={{ display: 'grid', gap: 8, maxWidth: 420, marginTop: 12 }}>
            <label className="b-field-label">Nueva contraseña (mín. 8 caracteres)</label>
            <div style={{ position: 'relative' }}>
              <input
                className="b-input"
                type={verClave ? 'text' : 'password'}
                value={claveNueva}
                onChange={(e) => setClaveNueva(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
              />
              <button
                type="button"
                className="b-btn is-ghost"
                onClick={() => setVerClave((v) => !v)}
                style={{ position: 'absolute', right: 2, top: 2, minHeight: 36 }}
                aria-label={verClave ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {verClave ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="b-btn is-primary"
                onClick={modoClave === 'cambiar' ? cambiarClaveDirecta : crearAcceso}
                disabled={ocupado || claveNueva.length < 8}
              >
                {modoClave === 'cambiar' ? 'Cambiar contraseña' : 'Crear acceso'}
              </button>
              <button
                type="button"
                className="b-btn is-ghost"
                onClick={() => {
                  setModoClave('oculta');
                  setClaveNueva('');
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {modoClave === 'reset-email' && (
          <div style={{ display: 'grid', gap: 8, maxWidth: 420, marginTop: 12 }}>
            <p>
              Se enviará un enlace de recuperación al correo <strong>{persona.email}</strong>.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="b-btn is-primary" onClick={enviarResetEmail} disabled={ocupado}>
                Enviar email
              </button>
              <button type="button" className="b-btn is-ghost" onClick={() => setModoClave('oculta')}>
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="b-group">
        <h3 className="b-h3">Permisos individuales</h3>
        <p className="b-help" style={{ marginBottom: 12 }}>
          Parten de los defaults del rol <strong>{ROL_LABELS[persona.rol]}</strong>. Marcá
          "Personalizar" para ajustar permisos sin cambiar el rol.
        </p>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <input
            type="checkbox"
            checked={form.permisosPersonalizados}
            onChange={() =>
              setForm((f) => ({
                ...f,
                permisosPersonalizados: !f.permisosPersonalizados,
                permisosSistema: f.permisosPersonalizados
                  ? permisosDefaultDeRol(persona.rol)
                  : f.permisosSistema,
              }))
            }
            disabled={readonly}
            style={{ width: 18, height: 18 }}
          />
          Personalizar permisos (sobrescribir defaults del rol)
        </label>

        {form.permisosPersonalizados && (
          <div style={{ display: 'grid', gap: 16 }}>
            {permisosGrupos.map((g) => (
              <div key={g.titulo}>
                <p
                  className="b-field-label"
                  style={{ fontWeight: 600, marginBottom: 8, color: 'var(--b-ink)' }}
                >
                  {g.titulo}
                </p>
                <div className="b-switches">
                  {g.keys.map((k) => (
                    <label key={k as string}>
                      <input
                        type="checkbox"
                        checked={!!form.permisosSistema[k]}
                        onChange={() => togglePermiso(k)}
                        disabled={readonly}
                      />
                      <span>{String(k)}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="b-group">
        <h3 className="b-h3">Acceso al Asistente IA</h3>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            cursor: iaBloqueada ? 'not-allowed' : 'pointer',
            opacity: iaBloqueada ? 0.6 : 1,
          }}
        >
          <input
            type="checkbox"
            checked={form.iaHabilitada === true}
            disabled={readonly || iaBloqueada}
            onChange={(e) => setForm({ ...form, iaHabilitada: e.target.checked })}
            style={{ width: 18, height: 18 }}
          />
          <span>Habilitar chat flotante del Asistente IA</span>
        </label>
        <p className="b-help" style={{ marginLeft: 28 }}>
          {iaBloqueada
            ? 'No disponible para el rol técnico/ayudante en esta fase.'
            : 'Si está activo, el usuario verá un chat flotante para preguntas al Asistente del sistema.'}
        </p>
      </div>

      <FooterGuardar estado={estado} readonly={readonly} />
    </form>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Tab 5 — Documentos
// ────────────────────────────────────────────────────────────────────────

function TabDocumentos({ persona, esAdminCoord }: { persona: Personal; esAdminCoord: boolean }) {
  const [form, setForm] = useFichaForm(persona, (p) => ({
    fotoUrl: p.fotoUrl ?? '',
    licenciaNumero: p.licenciaNumero ?? '',
    licenciaVencimiento: p.licenciaVencimiento ?? '',
  }));
  const [estado, setEstado] = useState<SaveState>({ guardando: false, mensaje: '' });

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!esAdminCoord) return;
    setEstado({ guardando: true, mensaje: '' });
    try {
      await actualizarFicha(
        doc(db, 'personal', persona.id),
        limpiarActualizacion({
          fotoUrl: form.fotoUrl.trim() || undefined,
          licenciaNumero: form.licenciaNumero.trim() || undefined,
          licenciaVencimiento: form.licenciaVencimiento || undefined,
        }),
      );
      toast.success('Documentos guardados');
      setEstado({ guardando: false, mensaje: 'Guardado.' });
    } catch (err) {
      console.error('TabDocumentos guardar:', err);
      toast.error('No se pudieron guardar los documentos.');
      setEstado({ guardando: false, mensaje: 'Error al guardar.' });
    }
  }

  const readonly = !esAdminCoord;

  return (
    <form onSubmit={guardar}>
      <h3 className="b-h3">Fotos y documentos</h3>
      <div className="b-callout b-callout-info" style={{ marginBottom: 16 }}>
        La <strong>carga directa</strong> de archivos a Firebase Storage queda para el siguiente
        lote (requiere subir reglas de Storage y permisos por rol). Mientras tanto podés pegar la
        URL pública de un archivo ya subido manualmente a Storage o a otro almacenamiento
        autorizado. Los metadatos de licencia (número y vencimiento) sí persisten.
      </div>

      <div className="b-fields">
        <Campo etiqueta="URL de foto del empleado" ancho="completo">
          <input
            className="b-input"
            value={form.fotoUrl}
            onChange={(e) => setForm({ ...form, fotoUrl: e.target.value })}
            placeholder="https://…"
            disabled={readonly}
          />
          <p className="b-help">
            Si pegás una URL válida, se muestra como avatar del empleado. Si no, se usan las
            iniciales del nombre.
          </p>
        </Campo>
        <SlotDocumento titulo="Foto de cédula · frente" />
        <SlotDocumento titulo="Foto de cédula · reverso" />
        <SlotDocumento titulo="Licencia de conducir · si tiene" />
        <Campo etiqueta="Número de licencia">
          <input
            className="b-input"
            value={form.licenciaNumero}
            onChange={(e) => setForm({ ...form, licenciaNumero: e.target.value })}
            placeholder="Opcional"
            disabled={readonly}
            maxLength={40}
          />
        </Campo>
        <Campo etiqueta="Vencimiento de licencia">
          <input
            className="b-input"
            type="date"
            value={form.licenciaVencimiento}
            onChange={(e) => setForm({ ...form, licenciaVencimiento: e.target.value })}
            disabled={readonly}
          />
        </Campo>
      </div>

      <FooterGuardar estado={estado} readonly={readonly} />
    </form>
  );
}

function SlotDocumento({ titulo }: { titulo: string }) {
  return (
    <div className="b-field">
      <label className="b-field-label">{titulo}</label>
      <div className="b-doc-slot">
        <Camera size={20} aria-hidden="true" />
        <strong>Carga pendiente</strong>
        <span>Disponible cuando se habilite Storage con permisos de documentos privados.</span>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Tab 6 — Referencias y emergencia
// ────────────────────────────────────────────────────────────────────────

function TabReferencias({ persona, esAdminCoord }: { persona: Personal; esAdminCoord: boolean }) {
  const [refs, setRefs] = useFichaForm(persona, (p) => {
    const base: Array<{ nombre: string; relacion: string; telefono: string }> = [
      { nombre: '', relacion: '', telefono: '' },
      { nombre: '', relacion: '', telefono: '' },
      { nombre: '', relacion: '', telefono: '' },
    ];
    (p.referenciasPersonales ?? []).forEach((r, i) => {
      if (i < 3) {
        base[i] = {
          nombre: r?.nombre ?? '',
          relacion: r?.relacion ?? '',
          telefono: r?.telefono ?? '',
        };
      }
    });
    return base;
  });

  const [emergencias, setEmergencias] = useFichaForm(persona, (p) => {
    const base: Array<{ nombre: string; parentesco: string; telefono: string }> = [
      { nombre: '', parentesco: '', telefono: '' },
      { nombre: '', parentesco: '', telefono: '' },
    ];
    (p.contactosEmergencia ?? []).forEach((c, i) => {
      if (i < 2) {
        base[i] = {
          nombre: c?.nombre ?? '',
          parentesco: c?.parentesco ?? '',
          telefono: c?.telefono ?? '',
        };
      }
    });
    return base;
  });

  const [estado, setEstado] = useState<SaveState>({ guardando: false, mensaje: '' });

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!esAdminCoord) return;
    setEstado({ guardando: true, mensaje: '' });
    try {
      const refsLimpias = refs.map((r) =>
        limpiarUndefined({
          nombre: r.nombre.trim() || undefined,
          relacion: r.relacion.trim() || undefined,
          telefono: r.telefono.trim() || undefined,
        }),
      );
      const emergenciasLimpias = emergencias.map((c) =>
        limpiarUndefined({
          nombre: c.nombre.trim() || undefined,
          parentesco: c.parentesco.trim() || undefined,
          telefono: c.telefono.trim() || undefined,
        }),
      );
      await actualizarFicha(doc(db, 'personal', persona.id), {
        referenciasPersonales: refsLimpias,
        contactosEmergencia: emergenciasLimpias,
      });
      toast.success('Referencias guardadas');
      setEstado({ guardando: false, mensaje: 'Guardado.' });
    } catch (err) {
      console.error('TabReferencias guardar:', err);
      toast.error('No se pudieron guardar las referencias.');
      setEstado({ guardando: false, mensaje: 'Error al guardar.' });
    }
  }

  const readonly = !esAdminCoord;

  return (
    <form onSubmit={guardar}>
      <h3 className="b-h3">Tres referencias personales</h3>
      {refs.map((r, i) => (
        <div className="b-ref-row" key={`ref-${i}`}>
          <Campo etiqueta={`Referencia ${i + 1}`}>
            <input
              className="b-input"
              value={r.nombre}
              onChange={(e) => {
                const next = [...refs];
                next[i] = { ...next[i], nombre: e.target.value };
                setRefs(next);
              }}
              placeholder="Nombre completo"
              disabled={readonly}
              maxLength={120}
            />
          </Campo>
          <Campo etiqueta="Relación">
            <input
              className="b-input"
              value={r.relacion}
              onChange={(e) => {
                const next = [...refs];
                next[i] = { ...next[i], relacion: e.target.value };
                setRefs(next);
              }}
              placeholder="Amiga, pastor, vecino…"
              disabled={readonly}
              maxLength={120}
            />
          </Campo>
          <Campo etiqueta="Teléfono">
            <input
              className="b-input"
              value={r.telefono}
              onChange={(e) => {
                const next = [...refs];
                next[i] = { ...next[i], telefono: e.target.value };
                setRefs(next);
              }}
              placeholder="809…"
              disabled={readonly}
              inputMode="tel"
              maxLength={20}
            />
          </Campo>
        </div>
      ))}

      <div className="b-group">
        <h3 className="b-h3">Contactos de emergencia</h3>
        {emergencias.map((c, i) => (
          <div className="b-ref-row" key={`em-${i}`}>
            <Campo etiqueta={i === 0 ? 'Contacto principal' : 'Contacto alternativo'}>
              <input
                className="b-input"
                value={c.nombre}
                onChange={(e) => {
                  const next = [...emergencias];
                  next[i] = { ...next[i], nombre: e.target.value };
                  setEmergencias(next);
                }}
                placeholder="Nombre completo"
                disabled={readonly}
                maxLength={120}
              />
            </Campo>
            <Campo etiqueta="Parentesco">
              <input
                className="b-input"
                value={c.parentesco}
                onChange={(e) => {
                  const next = [...emergencias];
                  next[i] = { ...next[i], parentesco: e.target.value };
                  setEmergencias(next);
                }}
                placeholder="Ej. madre, pareja, hermano"
                disabled={readonly}
                maxLength={60}
              />
            </Campo>
            <Campo etiqueta="Teléfono">
              <input
                className="b-input"
                value={c.telefono}
                onChange={(e) => {
                  const next = [...emergencias];
                  next[i] = { ...next[i], telefono: e.target.value };
                  setEmergencias(next);
                }}
                placeholder="809…"
                disabled={readonly}
                inputMode="tel"
                maxLength={20}
              />
            </Campo>
          </div>
        ))}
      </div>

      <FooterGuardar estado={estado} readonly={readonly} />
    </form>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Primitivos de formulario
// ────────────────────────────────────────────────────────────────────────

function Campo({ etiqueta, ancho, children }: { etiqueta: string; ancho?: 'completo'; children: ReactNode }) {
  return (
    <div className={`b-field ${ancho === 'completo' ? 'b-full' : ''}`}>
      <label className="b-field-label">{etiqueta}</label>
      {children}
    </div>
  );
}

function FooterGuardar({ estado, readonly }: { estado: SaveState; readonly: boolean }) {
  if (readonly) {
    return (
      <div className="b-footer">
        <span className="b-footer-status">Modo lectura · tu rol no puede editar.</span>
      </div>
    );
  }
  return (
    <div className="b-footer">
      <span className="b-footer-status" aria-live="polite">
        {estado.mensaje}
      </span>
      <button type="submit" className="b-btn is-primary" disabled={estado.guardando}>
        <Check size={14} aria-hidden="true" /> {estado.guardando ? 'Guardando…' : 'Guardar cambios'}
      </button>
    </div>
  );
}

