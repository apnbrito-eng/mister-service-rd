import { useState } from 'react';
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

// Sprite 2x2 compartido con el admin: evita 4 descargas separadas.
const POSICION_EQUIPO: Record<string, string> = {
  Lavadora: '0% 0%',
  Estufa: '100% 0%',
  Nevera: '0% 100%',
  'Aire Acondicionado': '100% 100%',
};

const EQUIPOS = [
  { tipo: 'Lavadora' },
  { tipo: 'Nevera' },
  { tipo: 'Aire Acondicionado' },
  { tipo: 'Estufa' },
] as const;

export default function PortadaElectrodomesticos({
  config,
  mostrarTitulo = true,
}: {
  config: ConfigWeb;
  mostrarTitulo?: boolean;
}) {
  const reducido = useMovimientoReducido();
  const [servicio, setServicio] = useState<IntencionServicio>('Reparación');
  const [seleccion, setSeleccion] = useState('');
  const [mostrarPresentacion, setMostrarPresentacion] = useState(false);
  const [imagenesFallidas, setImagenesFallidas] = useState<string[]>([]);

  const tiposPermitidos = config.tiposEquipoPublicos?.length
    ? config.tiposEquipoPublicos
    : TIPOS_EQUIPO_FALLBACK;
  const serviciosHabilitados = Object.values(config.servicios ?? {}).filter(
    (s) => s.habilitado,
  );
  const disponibles = EQUIPOS.filter(
    (e) =>
      tiposPermitidos.includes(e.tipo) &&
      serviciosHabilitados.some((s) => s.tipoEquipo === e.tipo),
  );

  const equipo = disponibles.some((e) => e.tipo === seleccion)
    ? seleccion
    : disponibles[0]?.tipo ?? '';
  const seleccionVisual = equipo;

  const mensaje = `Hola, necesito ${servicio.toLocaleLowerCase('es')} ${
    equipo ? `de ${equipo.toLocaleLowerCase('es')}` : 'de un electrodoméstico'
  }.`;
  const transicion = obtenerTransicionMovimiento(reducido);

  const imagenPara = (tipo: string): string | undefined => {
    const url = serviciosHabilitados.find((s) => s.tipoEquipo === tipo)?.imagenCard;
    return url && !imagenesFallidas.includes(url) ? url : undefined;
  };

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
                {(['Reparación', 'Mantenimiento'] as const).map((valor) => (
                  <motion.button
                    key={valor}
                    type="button"
                    aria-pressed={servicio === valor}
                    onClick={() => setServicio(valor)}
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
                    const imagen = imagenPara(tipo);
                    const activo = equipo === tipo;
                    return (
                      <motion.button
                        key={tipo}
                        type="button"
                        aria-pressed={activo}
                        onClick={() => { setSeleccion(tipo); setMostrarPresentacion(false); }}
                        whileTap={reducido ? undefined : { scale: ESCALA_PRESION }}
                        transition={transicion}
                        className="portada-publica-equipo-boton"
                      >
                        {imagen ? (
                          <img
                            src={imagen}
                            alt=""
                            loading="lazy"
                            className="portada-publica-equipo-icono-img"
                            onError={() => setImagenesFallidas(previas => [...previas, imagen])}
                          />
                        ) : (
                          <span
                            aria-hidden="true"
                            className="portada-publica-equipo-icono"
                            style={{ backgroundPosition: POSICION_EQUIPO[tipo] }}
                          />
                        )}
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

          {/* Área de medio: reservada; cuando llegue el video reemplaza el contenido
              interno sin romper el layout (relación 4:3, blanco, sin overlay). */}
          <div className="portada-publica-medio">
            {mostrarPresentacion && (config.hero.modo === 'fija' && config.hero.imagenFija || config.hero.modo === 'carrusel' && config.hero.imagenesCarrusel?.length) ? <MedioHeroPublico hero={config.hero} /> : disponibles.length === 0 ? (
              <div className="portada-publica-medio-vacio" aria-hidden="true" />
            ) : (
              disponibles.map(({ tipo }) => {
                const imagen = imagenPara(tipo);
                const visible = seleccionVisual === tipo;
                return (
                  <motion.div
                    key={tipo}
                    className="portada-publica-medio-slot"
                    aria-hidden={!visible}
                    initial={false}
                    animate={{ opacity: visible ? 1 : 0 }}
                    transition={transicion}
                  >
                    {imagen ? (
                      <img
                        src={imagen}
                        alt={tipo}
                        className="portada-publica-medio-imagen"
                        loading={visible ? 'eager' : 'lazy'}
                        onError={() => setImagenesFallidas(previas => [...previas, imagen])}
                      />
                    ) : (
                      <div
                        role="img"
                        aria-label={tipo}
                        className="portada-publica-medio-sprite"
                        style={{ backgroundPosition: POSICION_EQUIPO[tipo] }}
                      />
                    )}
                  </motion.div>
                );
              })
            )}
          </div>
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
