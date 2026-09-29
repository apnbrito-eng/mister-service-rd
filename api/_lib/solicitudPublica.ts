import { createHash } from 'node:crypto';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { validarArchivoPublico } from './subidaPublica.js';
import { ErrorCitaPublica } from './citaPublica.js';
const invalido = (): never => { throw new ErrorCitaPublica(400, 'datos_invalidos', 'Revisa los datos del formulario.'); };
const texto = (v: unknown, max: number) => { if (typeof v !== 'string' || v.length > max) return invalido(); return v.trim(); };
// @safe-recursive-strip: hash solo recibe string y calcula SHA-256; no recursa ni transforma objetos Firestore.
const hash = (v: string) => createHash('sha256').update(v).digest('hex');
export async function registrarSolicitudPublica(db: Firestore, entrada: unknown, ahora = Date.now()) {
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada) || Buffer.byteLength(JSON.stringify(entrada)) > 65536) return invalido();
  const p = entrada as Record<string, unknown>;
  const formularioId = texto(p.formularioId, 100), requestId = texto(p.requestId, 80);
  if (!/^[\w-]+$/.test(formularioId) || !/^[\w-]{20,80}$/.test(requestId) || !p.datos || typeof p.datos !== 'object' || Array.isArray(p.datos) || !Array.isArray(p.archivos) || p.archivos.length > 20) return invalido();
  const datosEntrada = p.datos as Record<string, unknown>;
  for (const a of p.archivos) { if (!a || typeof a.url !== 'string' || typeof a.campoId !== 'string') return invalido(); await validarArchivoPublico(db,a.url,{formularioId,campoId:a.campoId}); }
  const control = db.doc(`solicitudes_publicas_control/${hash(formularioId + ':' + requestId)}`);
  const hora = Math.floor(ahora / 3600000), cuota = db.doc(`solicitudes_publicas_cuotas/${hora}`);
  const huella = hash(JSON.stringify({ formularioId, datos: p.datos, archivos: p.archivos }));
  return db.runTransaction(async tx => {
    const [form, anterior, contador, config] = await Promise.all([tx.get(db.doc(`formularios/${formularioId}`)), tx.get(control), tx.get(cuota), tx.get(db.doc('solicitudes_publicas_config/limites'))]);
    if (anterior.exists) { if (anterior.data()?.huella !== huella) throw new ErrorCitaPublica(409, 'reintento', 'Los datos cambiaron. Envía el formulario de nuevo.'); return { ok: true, referencia: anterior.data()!.referencia }; }
    const f = form.data();
    if (!f || f.activo !== true) throw new ErrorCitaPublica(400, 'formulario', 'El formulario no está disponible.');
    const campos = [...(Array.isArray(f.camposEstandar) ? f.camposEstandar : []), ...(Array.isArray(f.camposPersonalizados) ? f.camposPersonalizados : [])];
    if (campos.length > 80 || campos.some(c => !c || typeof c.id !== 'string' || !/^[\w-]{1,100}$/.test(c.id) || ['__proto__','constructor','prototype'].includes(c.id) || !['texto','numero','email','telefono','textarea','seleccion','seleccion_multiple','checkbox','fecha','direccion','foto','archivo','firma','ubicacion'].includes(c.tipo)) || new Set(campos.map(c => c.id)).size !== campos.length) throw new ErrorCitaPublica(503, 'configuracion', 'El formulario no está disponible.');
    if (Object.keys(datosEntrada).some(k => !campos.some(c => c.id === k))) return invalido();
    const archivos = (p.archivos as unknown[]).map((a: unknown) => {
      if (!a || typeof a !== 'object' || Array.isArray(a)) return invalido();
      const v = a as Record<string, unknown>, campoId = texto(v.campoId, 100), url = texto(v.url, 2048), nombre = texto(v.nombre, 200);
      if (!campos.some(c => c.id === campoId && ['foto', 'archivo', 'firma'].includes(c.tipo))) return invalido();
      let u: URL; try { u = new URL(url); } catch { return invalido(); }
      if (u.protocol !== 'https:' || u.hostname !== 'firebasestorage.googleapis.com' || !decodeURIComponent(u.pathname).includes('/o/solicitudes-publico/')) return invalido();
      return { campoId, url, nombre };
    });
    if (new Set(archivos.map(a => a.campoId)).size !== archivos.length) return invalido();
    const datos: Record<string, unknown> = {}; let ubicacion: {lat: number; lng: number} | undefined;
    for (const c of campos) {
      const v = datosEntrada[c.id], vacio = v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
      if (c.requerido && vacio) return invalido();
      if (vacio) continue;
      if (['foto', 'archivo', 'firma'].includes(c.tipo)) { if (!archivos.some(a => a.campoId === c.id)) return invalido(); datos[c.id] = '[archivo subido]'; }
      else if (c.tipo === 'ubicacion') {
        if (typeof v !== 'object' || !v || Array.isArray(v)) return invalido();
        const u = v as Record<string, unknown>;
        if (typeof u.lat !== 'number' || !Number.isFinite(u.lat) || Math.abs(u.lat) > 90 || typeof u.lng !== 'number' || !Number.isFinite(u.lng) || Math.abs(u.lng) > 180) return invalido();
        datos[c.id] = {lat: u.lat, lng: u.lng}; ubicacion ??= {lat: u.lat, lng: u.lng};
      } else if (c.tipo === 'checkbox') { if (typeof v !== 'boolean') return invalido(); datos[c.id] = v; }
      else if (c.tipo === 'seleccion_multiple') { if (!Array.isArray(v) || v.length > 50 || v.some(i => typeof i !== 'string' || !c.opciones?.includes(i))) return invalido(); datos[c.id] = [...new Set(v)]; }
      else {
        const t = texto(v, c.tipo === 'textarea' ? 10000 : 1000);
        if (c.tipo === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return invalido();
        if (c.tipo === 'telefono' && !/^\d{10,15}$/.test(t.replace(/\D/g, ''))) return invalido();
        if (c.tipo === 'numero' && !Number.isFinite(Number(t))) return invalido();
        if (c.tipo === 'seleccion' && !c.opciones?.includes(t)) return invalido();
        if (c.tipo === 'fecha' && !/^\d{4}-\d{2}-\d{2}$/.test(t)) return invalido();
        datos[c.id] = t;
      }
    }
    // Cupo técnico provisional configurable por servidor, nunca por IP o navegador.
    const limite = config.data()?.maxSolicitudesHora ?? 500, total = contador.data()?.total ?? 0;
    if (!Number.isSafeInteger(limite) || limite < 1 || limite > 100000 || !Number.isSafeInteger(total) || total < 0) throw new ErrorCitaPublica(503, 'configuracion', 'El formulario no está disponible.');
    if (total >= limite) { tx.set(db.doc(`solicitudes_publicas_alertas/${hora}`), {codigo: 'CUPO_HORA', hora, limite}); return {ok: false, limitado: true} as const; }
    const ref = db.collection('solicitudes_servicio').doc(), referencia = ref.id.slice(-8).toUpperCase();
    tx.create(ref, {formularioId, formularioNombre: texto(f.nombre ?? '', 300), empresaId: texto(f.empresaId ?? '', 100), empresaNombre: texto(f.empresaNombre ?? '', 300), datos, archivos, estado: 'pendiente', notas: '', ...(ubicacion ? {ubicacion} : {}), createdAt: Timestamp.fromMillis(ahora), updatedAt: Timestamp.fromMillis(ahora)});
    tx.set(control, {huella, referencia, creadoMs: ahora}); tx.set(cuota, {hora, total: total + 1});
    return {ok: true, referencia};
  });
}
