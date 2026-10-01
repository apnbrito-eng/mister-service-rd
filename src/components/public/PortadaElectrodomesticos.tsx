import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import type { ConfigWeb } from '../../services/configWeb.service';
import {
  enlaceAgendar,
  obtenerWhatsAppPublico,
  type IntencionServicio,
} from '../../utils/whatsappPublico';
import { TIPOS_EQUIPO_FALLBACK } from '../../utils/tiposEquipoFallback';
import { ESCALA_PRESION, obtenerTransicionMovimiento } from '../../utils/motion';
import { useMovimientoReducido } from '../../hooks/useMovimientoReducido';
import WhatsAppIcon from '../icons/WhatsAppIcon';
import './PortadaPublica.css';
import MedioHeroPublico from './MedioHeroPublico';

const IMAGEN_EQUIPO: Record<string, string> = {
  Lavadora: '/portada/lavadora-armada-desarmada.jpg',
  Secadora: '/portada/secadora-armada-desarmada.jpg',
  Nevera: '/portada/nevera-armada-desarmada.jpg',
  Estufa: '/portada/estufa-armada-desarmada.jpg',
  'Aire Acondicionado': '/portada/aire-armado-desarmado.jpg',
};

const EQUIPOS = [
  { tipo: 'Lavadora' },
  { tipo: 'Nevera' },
  { tipo: 'Aire Acondicionado' },
  { tipo: 'Estufa' },
  { tipo: 'Secadora' },
] as const;

const DETALLE_EQUIPO: Record<string, string> = {
  Lavadora: 'Centrifugado, drenaje, fugas y limpieza de tu lavadora.',
  Nevera: 'Enfriamiento, fugas y revisión de tu nevera.',
  'Aire Acondicionado': 'Enfriamiento, limpieza e instalación de tu aire acondicionado.',
  Estufa: 'Quemadores, encendido y horno de tu estufa.',
  Secadora: 'Calentamiento, giro del tambor y limpieza de tu secadora.',
};

export default function PortadaElectrodomesticos({
  config,
  mostrarTitulo = true,
}: {
  config: ConfigWeb;
  mostrarTitulo?: boolean;
}) {
  const reducido = useMovimientoReducido();
  const [servicio, setServicio] = useState<IntencionServicio>('Reparación');
  const [diapositiva, setDiapositiva] = useState({ tipo: '', desarmado: false });
  const [pausado, setPausado] = useState(false);
  const [punteroEncima, setPunteroEncima] = useState(false);
  const [paginaOculta, setPaginaOculta] = useState(false);
  const [mostrarPresentacion, setMostrarPresentacion] = useState(false);
  const [imagenesFallidas, setImagenesFallidas] = useState<string[]>([]);

  const serviciosHabilitados = useMemo(() => Object.values(config.servicios ?? {}).filter(s => s.habilitado), [config.servicios]);
  const disponibles = useMemo(() => {
    const tipos = config.tiposEquipoPublicos?.length ? config.tiposEquipoPublicos : TIPOS_EQUIPO_FALLBACK;
    return EQUIPOS.filter(e => tipos.includes(e.tipo) && serviciosHabilitados.some(s => s.tipoEquipo === e.tipo));
  }, [config.tiposEquipoPublicos, serviciosHabilitados]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const actualizar = () => setPaginaOculta(document.hidden);
    actualizar();
    document.addEventListener('visibilitychange', actualizar);
    return () => document.removeEventListener('visibilitychange', actualizar);
  }, []);

  const avanzar = useCallback((paso: number) => {
    setDiapositiva(actual => {
      const equipoActual = disponibles.findIndex(e => e.tipo === actual.tipo);
      const indice = Math.max(0, equipoActual) * 2 + (equipoActual >= 0 && actual.desarmado ? 1 : 0);
      const siguiente = (indice + paso + disponibles.length * 2) % (disponibles.length * 2);
      return { tipo: disponibles[Math.floor(siguiente / 2)]?.tipo || '', desarmado: siguiente % 2 === 1 };
    });
  }, [disponibles]);

  useEffect(() => {
    if (reducido || pausado || punteroEncima || paginaOculta || mostrarPresentacion || !disponibles.length) return;
    const timer = setInterval(() => avanzar(1), 5000);
    return () => clearInterval(timer);
  }, [avanzar, disponibles.length, reducido, pausado, punteroEncima, paginaOculta, mostrarPresentacion]);

  const cambiarDiapositiva = (paso: number) => { setPausado(true); avanzar(paso); };
  const equipo = disponibles.some(e => e.tipo === diapositiva.tipo) ? diapositiva.tipo : disponibles[0]?.tipo ?? '';
  const desarmado = equipo === diapositiva.tipo && diapositiva.desarmado;

  const mensaje = `Hola, necesito ${servicio.toLocaleLowerCase('es')} ${
    equipo ? `de ${equipo.toLocaleLowerCase('es')}` : 'de un electrodoméstico'
  }.`;
  const transicion = obtenerTransicionMovimiento(reducido);

  const tituloFallback = 'Reparación y mantenimiento de electrodomésticos';
  const titulo = config.hero.titulo?.trim() || tituloFallback;
  const tituloDestacado = config.hero.tituloDestacado?.trim() || '';

  return (
    <section className="portada-publica" aria-label="Seleccionar servicio">
      <div className="portada-publica-contenedor">

        <div className="portada-publica-grid">
          <div className="portada-publica-copy">
        {mostrarTitulo && (
          <header className="portada-publica-encabezado">
            {config.hero.badge && (
              <p className="portada-publica-insignia">{config.hero.badge}</p>
            )}
            <h1 className="portada-publica-titulo">
              {titulo}
              {tituloDestacado && (
                <>
                  {' '}
                  <span className="portada-publica-titulo-destacado">
                    {tituloDestacado}
                  </span>
                </>
              )}
            </h1>
            {config.hero.subtitulo && (
              <p className="portada-publica-subtitulo">{config.hero.subtitulo}</p>
            )}
          </header>
        )}

            <div>
              <p className="portada-publica-etiqueta">¿Qué necesita?</p>
              <div
                className="portada-publica-grupo"
                role="group"
                aria-label="Tipo de servicio"
              >
                {(['Reparación', 'Mantenimiento', 'Instalación'] as const).map((valor) => (
                  <motion.button
                    key={valor}
                    type="button"
                    aria-pressed={servicio === valor}
                    onClick={() => { setServicio(valor); setPausado(true); }}
                    whileTap={reducido ? undefined : { scale: ESCALA_PRESION }}
                    transition={transicion}
                    className="portada-publica-pill"
                  >
                    {valor}
                  </motion.button>
                ))}
              </div>
            </div>

            {disponibles.length > 0 && (
              <div>
                <p className="portada-publica-etiqueta">¿Qué equipo?</p>
                <div
                  className="portada-publica-equipos"
                  role="group"
                  aria-label="Equipo"
                >
                  {disponibles.map(({ tipo }) => {
                    const activo = equipo === tipo;
                    return (
                      <motion.button
                        key={tipo}
                        type="button"
                        aria-pressed={activo}
                        onClick={() => { setDiapositiva({ tipo, desarmado: false }); setMostrarPresentacion(false); setPausado(true); }}
                        whileTap={reducido ? undefined : { scale: ESCALA_PRESION }}
                        transition={transicion}
                        className="portada-publica-equipo-boton"
                      >
                        <span aria-hidden="true" className="portada-publica-equipo-par" style={{ backgroundImage: `url("${IMAGEN_EQUIPO[tipo]}")` }} />
                        {tipo}
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="portada-publica-ctas">
              <Link
                to={enlaceAgendar(equipo, servicio)}
                className="portada-publica-cta portada-publica-cta-primario"
              >
                Agendar servicio
              </Link>
              <a
                href={obtenerWhatsAppPublico(config, mensaje)}
                target="_blank"
                rel="noopener noreferrer"
                className="portada-publica-cta portada-publica-cta-secundario"
                aria-label="Escribir por WhatsApp"
              >
                <WhatsAppIcon size={18} filled={false} />
                Escribir por WhatsApp
              </a>
            </div>
          </div>

          <section className="portada-publica-diapositivas" aria-label="Servicios por electrodoméstico" aria-roledescription="carrusel" onMouseEnter={() => setPunteroEncima(true)} onMouseLeave={() => setPunteroEncima(false)} onFocusCapture={evento => { if (!evento.target.hasAttribute('data-reproduccion')) setPausado(true); }}>
          <div className="portada-publica-medio">
            {mostrarPresentacion && (config.hero.modo === 'fija' && config.hero.imagenFija || config.hero.modo === 'carrusel' && config.hero.imagenesCarrusel?.length) ? <MedioHeroPublico hero={config.hero} /> : disponibles.length === 0 ? (
              <div className="portada-publica-medio-vacio" aria-hidden="true" />
            ) : (
              <div role="img" aria-label={`${equipo}: ${desarmado ? 'desarmado' : 'armado'}`} className="portada-publica-foto-ventana">
                {imagenesFallidas.includes(IMAGEN_EQUIPO[equipo]) ? <p>{equipo}</p> : <img src={IMAGEN_EQUIPO[equipo]} alt="" className={`portada-publica-foto-par${desarmado ? ' desarmado' : ''}`} onError={() => setImagenesFallidas(previas => [...previas, IMAGEN_EQUIPO[equipo]])} />}
              </div>
            )}
          </div>
          {!mostrarPresentacion && disponibles.length > 0 && <>
            <div className="portada-publica-detalle-equipo" aria-live={pausado || reducido ? 'polite' : 'off'} aria-atomic="true">
              <h2>{equipo}</h2>
              <span className="portada-publica-estado-equipo">{desarmado ? 'Vista desarmada' : 'Equipo armado'}</span>
              <p>{serviciosHabilitados.find(s => s.tipoEquipo === equipo)?.descripcionCorta || DETALLE_EQUIPO[equipo]}</p>
              <ul aria-label="Servicios disponibles"><li>Reparación</li><li>Mantenimiento</li><li>Instalación</li></ul>
            </div>
            <div className="portada-publica-diapositivas-controles">
              <button type="button" aria-label="Diapositiva anterior" onClick={() => cambiarDiapositiva(-1)}><ChevronLeft size={20} /></button>
              <span>{disponibles.findIndex(e => e.tipo === equipo) * 2 + (desarmado ? 2 : 1)} / {disponibles.length * 2}</span>
              {!reducido && <button type="button" data-reproduccion="true" aria-label={pausado ? 'Reanudar diapositivas' : 'Pausar diapositivas'} onClick={() => setPausado(actual => !actual)}>{pausado ? <Play size={18} /> : <Pause size={18} />}</button>}
              <button type="button" aria-label="Diapositiva siguiente" onClick={() => cambiarDiapositiva(1)}><ChevronRight size={20} /></button>
            </div>
          </>}
          </section>
        </div>
        {(config.hero.modo === 'fija' && config.hero.imagenFija || config.hero.modo === 'carrusel' && config.hero.imagenesCarrusel?.length) && <button type="button" className="web-enlace portada-presentacion" aria-pressed={mostrarPresentacion} onClick={() => setMostrarPresentacion(!mostrarPresentacion)}>{mostrarPresentacion ? 'Ver equipo seleccionado' : 'Ver presentación del servicio'}</button>}

        {mostrarTitulo && (
          <ul className="portada-publica-datos">
            {[config.estadisticas.experiencia, config.estadisticas.servicios].map(
              (dato, i) =>
                dato?.valor ? (
                  <li key={i}>
                    <strong>{dato.valor}</strong>
                    {dato.etiqueta}
                  </li>
                ) : null,
            )}
          </ul>
        )}
      </div>
    </section>
  );
}
