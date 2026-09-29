import { CONFIG_RUNTIME_INICIAL, TARIFA_RUNTIME, validarRuntimeSeguro } from '../_lib/botServicioRuntime.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { accesoEquipo, ErrorAcceso } from '../_lib/accesoEquipo.js';
import { CONFIG_BOT_INICIAL, enteroSeguro, costeMaximoBot, periodosBot, resolverLineaBot, evaluarBot, validarConfigBot, type DatosServicioBot } from '../_lib/politicaBotServicio.js';
import { claveBot } from '../_lib/presupuestoBotServicio.js';
import { validarMiembrosEquipos } from '../_lib/equiposAtencion.js';
/** Administración del ensayo. No permite habilitar servicio ni enviar mensajes. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(req.method ?? '')) return res.status(405).json({ error: 'Método no permitido.' });
  try {
    const { db, uid, rol } = await accesoEquipo(req);
    if (rol !== 'administrador') throw new ErrorAcceso(403, 'Solo administración puede configurar este ensayo.');
    const ref = db.doc('bot_servicio_config/sistema');
    if (req.method === 'GET') {
      const p = periodosBot(Date.now());
      const [actual, dia, mes, extraDia, extraMes, personas] = await Promise.all([
        ref.get(), db.doc(`bot_servicio_sim_presupuesto/dia_${p.dia}`).get(), db.doc(`bot_servicio_sim_presupuesto/mes_${p.mes}`).get(),
        db.doc(`bot_servicio_sim_limites/dia_${p.dia}`).get(), db.doc(`bot_servicio_sim_limites/mes_${p.mes}`).get(),
        db.collection('usuarios').where('rol', 'in', ['operaria', 'secretaria']).get(),
      ]);
      const config = validarConfigBot(actual.data() ?? CONFIG_BOT_INICIAL);
      const [runtimeDoc, realDia, realMes, realExtraDia, realExtraMes] = await Promise.all([
        db.doc('bot_servicio_runtime/sistema').get(), db.doc(`bot_servicio_real_presupuesto/dia_${p.dia}`).get(), db.doc(`bot_servicio_real_presupuesto/mes_${p.mes}`).get(),
        db.doc(`bot_servicio_real_limites/dia_${p.dia}`).get(), db.doc(`bot_servicio_real_limites/mes_${p.mes}`).get(),
      ]);
      const runtime = validarRuntimeSeguro(runtimeDoc.data() ?? CONFIG_RUNTIME_INICIAL);
      const servidorPreparado = process.env.BOT_SERVICIO_ENABLED === 'true' && process.env.ALLOW_EXTERNAL_SENDS === 'true' && !!process.env.ANTHROPIC_API_KEY && !!process.env.META_ACCESS_TOKEN && !!process.env.CRON_SECRET && process.env.BOT_CENTRAL_PHONE_NUMBER_ID === runtime.phoneNumberId;
      return res.status(200).json({ config, runtime, servidorPreparado, presupuestoReal: { dia: { periodo: p.dia, comprometido: realDia.data()?.comprometido ?? 0, limite: realExtraDia.data()?.limiteMicroUsd ?? runtime.limiteDiaMicroUsd }, mes: { periodo: p.mes, comprometido: realMes.data()?.comprometido ?? 0, limite: realExtraMes.data()?.limiteMicroUsd ?? runtime.limiteMesMicroUsd } }, envioDisponible: runtime.habilitado && servidorPreparado,
        presupuesto: { dia: { periodo: p.dia, comprometido: dia.data()?.comprometido ?? 0, limite: extraDia.data()?.limiteMicroUsd ?? config.limiteDiaMicroUsd },
          mes: { periodo: p.mes, comprometido: mes.data()?.comprometido ?? 0, limite: extraMes.data()?.limiteMicroUsd ?? config.limiteMesMicroUsd } },
        personas: personas.docs.filter(d => d.data().activo !== false && d.data().eliminado !== true).map(d => ({ uid: d.id, nombre: String(d.data().nombre || d.id), rol: String(d.data().rol) })),
      });
    }
    let body;
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
    catch { throw new ErrorAcceso(400, 'Solicitud inválida.'); }
    if (!body || typeof body !== 'object') throw new ErrorAcceso(400, 'Solicitud inválida.');
    if (body.accion === 'simular') {
      const config = validarConfigBot((await ref.get()).data() ?? CONFIG_BOT_INICIAL);
      const datos = body.datos;
      if (!datos || typeof datos !== 'object' || [datos.equipo, datos.falla, datos.fotoId].some(v => v !== undefined && (typeof v !== 'string' || v.length > 1000)) ||
        (datos.servicio !== undefined && !['reparacion', 'mantenimiento'].includes(datos.servicio)) ||
        [body.pideHumano, body.baja, body.ventanaAbierta].some(v => typeof v !== 'boolean')) throw new ErrorAcceso(400, 'Datos de simulación inválidos.');
      return res.status(200).json({ resultado: evaluarBot(config, { ahora: Date.now(), pideHumano: body.pideHumano, baja: body.baja, ventanaAbierta: body.ventanaAbierta, datos: datos as DatosServicioBot }), envioDisponible: false });
    }
    if (body.accion === 'reparto') {
      if (typeof body.habilitado !== 'boolean' || !enteroSeguro(body.version) || !Array.isArray(body.equipos) || !/^[a-zA-Z0-9_-]{16,80}$/.test(body.requestId ?? '') || typeof body.motivo !== 'string' || !body.motivo.trim() || body.motivo.length > 1000) throw new ErrorAcceso(400, 'Cambio de reparto inválido.');
      const runtimeRef = db.doc('bot_servicio_runtime/sistema');
      const audit = db.doc(`auditoria_admin/reparto_estado_${claveBot(body.requestId)}`);
      const huella = claveBot(JSON.stringify({ uid, version: body.version, habilitado: body.habilitado, equipos: body.equipos, motivo: body.motivo.trim() }));
      await db.runTransaction(async tx => {
        const [previa, actual] = await Promise.all([tx.get(audit), tx.get(runtimeRef)]);
        if (previa.exists) { if (previa.data()?.huella !== huella) throw new ErrorAcceso(409, 'Identificador ya utilizado.'); return; }
        const anterior = validarRuntimeSeguro(actual.data() ?? CONFIG_RUNTIME_INICIAL);
        if (anterior.version !== body.version) throw new ErrorAcceso(409, 'La configuración cambió. Recarga.');
        let nueva;
        try { nueva = validarRuntimeSeguro({ ...anterior, repartoHabilitado: body.habilitado, equipos: body.equipos, version: anterior.version + 1 }); }
        catch { throw new ErrorAcceso(400, 'Revisa los equipos configurados.'); }
        if (body.habilitado) {
          if (nueva.equipos.length !== 2) throw new ErrorAcceso(400, 'Configura los dos equipos.');
          await validarMiembrosEquipos(db, tx, nueva.equipos);
        }
        tx.set(runtimeRef, nueva);
        tx.create(audit, { accion: 'reparto_equipos_estado', solicitanteUid: uid, objetivoTipo: 'bot_servicio_runtime', objetivoId: 'sistema', huella, anterior, nueva, motivo: body.motivo.trim(), timestampMs: Date.now() });
      });
      return res.status(200).json({ ok: true });
    }
    if (body.accion === 'estado') {
      if (typeof body.habilitado !== 'boolean' || !enteroSeguro(body.version) || typeof body.permitirHorarioLaboral !== 'boolean' ||
        (body.habilitado && body.confirmacion !== 'ACTIVAR') || !/^[a-zA-Z0-9_-]{16,80}$/.test(body.requestId ?? '') || typeof body.motivo !== 'string' || !body.motivo.trim() || body.motivo.length > 1000) throw new ErrorAcceso(400, 'Cambio de estado inválido.');
      const runtimeRef = db.doc('bot_servicio_runtime/sistema'), p = periodosBot(Date.now());
      const audit = db.doc(`auditoria_admin/bot_estado_${claveBot(body.requestId)}`);
      const huella = claveBot(JSON.stringify({ uid, version: body.version, habilitado: body.habilitado, permitirHorarioLaboral: body.permitirHorarioLaboral, motivo: body.motivo.trim() }));
      await db.runTransaction(async tx => {
        const [previa, actual, catalogo, dia, mes, extraDia, extraMes] = await Promise.all([
          tx.get(audit), tx.get(runtimeRef), tx.get(db.doc('config/whatsapp_numeros')),
          tx.get(db.doc(`bot_servicio_real_presupuesto/dia_${p.dia}`)), tx.get(db.doc(`bot_servicio_real_presupuesto/mes_${p.mes}`)),
          tx.get(db.doc(`bot_servicio_real_limites/dia_${p.dia}`)), tx.get(db.doc(`bot_servicio_real_limites/mes_${p.mes}`)),
        ]);
        if (previa.exists) { if (previa.data()?.huella !== huella) throw new ErrorAcceso(409, 'Identificador ya utilizado.'); return; }
        const anterior = validarRuntimeSeguro(actual.data() ?? CONFIG_RUNTIME_INICIAL);
        if (body.version !== anterior.version) throw new ErrorAcceso(409, 'El estado cambió. Recarga antes de continuar.');
        if (body.habilitado) {
          try {
            if (anterior.equipos.length !== 2) throw new Error('Equipos pendientes');
            const lineas = catalogo.data()?.numeros;
            if (!Array.isArray(lineas) || resolverLineaBot(anterior.numeroCentral, lineas.map(l => ({ numero: String(l.numeroReal ?? ''), phoneNumberId: String(l.phoneNumberId ?? '') }))) !== anterior.phoneNumberId) throw new Error('Línea pendiente');
            await validarMiembrosEquipos(db, tx, anterior.equipos);
          } catch { throw new ErrorAcceso(400, 'Prepara la línea central y los dos equipos activos antes de activar.'); }
          const usadoDia = dia.data()?.comprometido ?? 0, usadoMes = mes.data()?.comprometido ?? 0;
          const limiteDia = extraDia.data()?.limiteMicroUsd ?? anterior.limiteDiaMicroUsd, limiteMes = extraMes.data()?.limiteMicroUsd ?? anterior.limiteMesMicroUsd;
          if (![usadoDia, usadoMes, limiteDia, limiteMes].every(v => enteroSeguro(v)) || usadoDia + costeMaximoBot(TARIFA_RUNTIME) > limiteDia || usadoMes + costeMaximoBot(TARIFA_RUNTIME) > limiteMes) throw new ErrorAcceso(409, 'No hay presupuesto disponible para activar.');
        }
        const nueva = validarRuntimeSeguro({ ...anterior, habilitado: body.habilitado, permitirHorarioLaboral: body.permitirHorarioLaboral, version: anterior.version + 1 });
        tx.set(runtimeRef, nueva);
        tx.set(audit, { accion: body.habilitado ? 'bot_servicio_activar' : 'bot_servicio_desactivar', solicitanteUid: uid, objetivoTipo: 'bot_servicio_runtime', objetivoId: 'sistema', huella, motivo: body.motivo.trim(), anterior, nueva, timestampMs: Date.now() });
      });
      return res.status(200).json({ ok: true });
    }
    if (body.accion === 'preparar') {
      if (body.habilitado !== false || !enteroSeguro(body.version) || typeof body.permitirHorarioLaboral !== 'boolean' || !Array.isArray(body.equipos) || body.equipos.length !== 2 ||
        !/^[a-zA-Z0-9_-]{16,80}$/.test(body.requestId ?? '') || typeof body.motivo !== 'string' || !body.motivo.trim() || body.motivo.length > 1000) throw new ErrorAcceso(400, 'Preparación inválida; requiere dos equipos y servicio desactivado.');
      const runtimeRef = db.doc('bot_servicio_runtime/sistema');
      const audit = db.doc(`auditoria_admin/bot_preparar_${claveBot(body.requestId)}`);
      const huella = claveBot(JSON.stringify({ uid, version: body.version, equipos: body.equipos, permitirHorarioLaboral: body.permitirHorarioLaboral, motivo: body.motivo.trim() }));
      await db.runTransaction(async tx => {
        const [previa, actual, catalogo] = await Promise.all([tx.get(audit), tx.get(runtimeRef), tx.get(db.doc('config/whatsapp_numeros'))]);
        if (previa.exists) { if (previa.data()?.huella !== huella) throw new ErrorAcceso(409, 'Identificador ya utilizado.'); return; }
        const anterior = validarRuntimeSeguro(actual.data() ?? CONFIG_RUNTIME_INICIAL);
        if (anterior.version !== body.version) throw new ErrorAcceso(409, 'La configuración real cambió. Recarga antes de preparar.');
        let nueva;
        try {
          const lineas = catalogo.data()?.numeros;
          if (!Array.isArray(lineas)) throw new Error('Catálogo ausente');
          const phoneNumberId = resolverLineaBot(anterior.numeroCentral, lineas.map(l => ({ numero: String(l.numeroReal ?? ''), phoneNumberId: String(l.phoneNumberId ?? '') })));
          nueva = validarRuntimeSeguro({ ...anterior, habilitado: false, version: anterior.version + 1, permitirHorarioLaboral: body.permitirHorarioLaboral, equipos: body.equipos, phoneNumberId });
        } catch { throw new ErrorAcceso(400, 'Revisa equipos y catálogo vigente: la línea central debe tener una coincidencia única.'); }
        try { await validarMiembrosEquipos(db, tx, nueva.equipos); } catch { throw new ErrorAcceso(400, 'Revisa los roles y el estado de los miembros.'); }
        tx.set(runtimeRef, nueva);
        tx.set(audit, { accion: 'bot_servicio_preparar_desactivado', solicitanteUid: uid, objetivoTipo: 'bot_servicio_runtime', objetivoId: 'sistema', huella, motivo: body.motivo.trim(), anterior, nueva, timestampMs: Date.now() });
      });
      return res.status(200).json({ ok: true, envioDisponible: false });
    }
    if (body.accion === 'ampliar') {
      if (!['dia', 'mes'].includes(body.periodo) || !enteroSeguro(body.limiteMicroUsd, 1) || !enteroSeguro(body.limiteAnterior, 1) ||
        !/^[a-zA-Z0-9_-]{16,80}$/.test(body.requestId ?? '') || typeof body.motivo !== 'string' || !body.motivo.trim() || body.motivo.length > 1000) throw new ErrorAcceso(400, 'Ampliación inválida.');
      if (body.alcance !== undefined && !['permanente', 'periodo_actual'].includes(body.alcance)) throw new ErrorAcceso(400, 'Vigencia inválida.');
      if (body.periodo === 'dia' && body.alcance === 'permanente') throw new ErrorAcceso(400, 'La ampliación diaria solo puede durar hasta medianoche RD.');
      const permanente = body.periodo === 'mes' && body.alcance === 'permanente';
      const p = periodosBot(Date.now()), periodo = body.periodo === 'dia' ? p.dia : p.mes;
      if (body.periodoEsperado !== periodo) throw new ErrorAcceso(409, 'Cambió el período. Recarga antes de ampliar.');
      if (body.destino !== undefined && !['simulacion', 'produccion'].includes(body.destino)) throw new ErrorAcceso(400, 'Destino inválido.');
      const real = body.destino === 'produccion';
      const destinoRef = real ? db.doc('bot_servicio_runtime/sistema') : ref;
      const prefijo = real ? 'bot_servicio_real' : 'bot_servicio_sim';
      const extra = db.doc(`${prefijo}_limites/${body.periodo}_${periodo}`);
      const audit = db.doc(`auditoria_admin/bot_ampliar_${claveBot(body.requestId)}`);
      const huella = claveBot(JSON.stringify({ uid, periodo, tipo: body.periodo, real, permanente, limite: body.limiteMicroUsd, anterior: body.limiteAnterior, motivo: body.motivo.trim() }));
      await db.runTransaction(async tx => {
        const [previa, actual, incremento] = await Promise.all([tx.get(audit), tx.get(destinoRef), tx.get(extra)]);
        if (previa.exists) { if (previa.data()?.huella !== huella) throw new ErrorAcceso(409, 'Identificador ya utilizado.'); return; }
        const c = real ? validarRuntimeSeguro(actual.data() ?? CONFIG_RUNTIME_INICIAL) : validarConfigBot(actual.data() ?? CONFIG_BOT_INICIAL);
        const limiteAnterior = incremento.data()?.limiteMicroUsd ?? (body.periodo === 'dia' ? c.limiteDiaMicroUsd : c.limiteMesMicroUsd);
        if (body.limiteAnterior !== limiteAnterior) throw new ErrorAcceso(409, 'El límite cambió. Recarga antes de ampliar.');
        if (body.limiteMicroUsd <= limiteAnterior) throw new ErrorAcceso(400, 'El nuevo límite debe ser mayor.');
        if (permanente) {
          tx.set(destinoRef, { ...c, limiteMesMicroUsd: body.limiteMicroUsd, version: c.version + 1 });
          tx.delete(extra);
        } else tx.set(extra, { limiteMicroUsd: body.limiteMicroUsd, periodo, tipo: body.periodo, actualizadoPor: uid });
        tx.set(audit, { accion: real ? 'bot_servicio_ampliar_presupuesto' : 'bot_servicio_ampliar_simulacion', solicitanteUid: uid, objetivoTipo: 'bot_servicio_presupuesto', objetivoId: extra.id,
          huella, permanente, motivo: body.motivo.trim(), anterior: limiteAnterior, nuevo: body.limiteMicroUsd, timestampMs: Date.now() });
      });
      return res.status(200).json({ ok: true, envioDisponible: false });
    }
    if (body.accion !== 'guardar' || !/^[a-zA-Z0-9_-]{16,80}$/.test(body.requestId ?? '') || typeof body.motivo !== 'string' || !body.motivo.trim() || body.motivo.length > 1000) throw new ErrorAcceso(400, 'Identificador y motivo obligatorios.');
    let config;
    try { config = validarConfigBot(body.config); } catch { throw new ErrorAcceso(400, 'Configuración inválida: esta etapa permite solo simulación desactivada.'); }
    const huella = claveBot(JSON.stringify({ uid, config, motivo: body.motivo.trim() }));
    const audit = db.doc(`auditoria_admin/bot_config_${claveBot(body.requestId)}`);
    await db.runTransaction(async tx => {
      const [previa, actual] = await Promise.all([tx.get(audit), tx.get(ref)]);
      if (previa.exists) {
        if (previa.data()?.huella !== huella) throw new ErrorAcceso(409, 'Identificador ya utilizado.');
        return;
      }
      const anterior = validarConfigBot(actual.data() ?? CONFIG_BOT_INICIAL);
      if (config.limiteDiaMicroUsd !== anterior.limiteDiaMicroUsd || config.limiteMesMicroUsd !== anterior.limiteMesMicroUsd) throw new ErrorAcceso(400, 'Usa una ampliación temporal auditada para cambiar el presupuesto.');
      if (config.version !== anterior.version) throw new ErrorAcceso(409, 'La configuración cambió. Recarga antes de guardar.');
      try { await validarMiembrosEquipos(db, tx, config.equipos); } catch { throw new ErrorAcceso(400, 'Revisa los miembros activos y sus roles.'); }
      tx.set(ref, { ...config, version: config.version + 1 });
      tx.set(audit, { accion: 'bot_servicio_config_simulacion', solicitanteUid: uid, objetivoTipo: 'bot_servicio_config', objetivoId: 'sistema', huella,
        motivo: body.motivo.trim(), anterior, nueva: { ...config, version: config.version + 1 }, timestampMs: Date.now() });
    });
    return res.status(200).json({ ok: true, envioDisponible: false });
  } catch (err) {
    if (err instanceof ErrorAcceso) return res.status(err.status).json({ error: err.message });
    console.error('[bot-config] fallo inesperado', { clase: err instanceof Error ? 'error' : 'desconocido' });
    return res.status(500).json({ error: 'No se pudo procesar la configuración.' });
  }
}
