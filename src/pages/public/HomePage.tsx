import { Link } from 'react-router-dom';
import PortadaElectrodomesticos from '../../components/public/PortadaElectrodomesticos';
import ImagenServicioPublico from '../../components/public/ImagenServicioPublico';
import WhatsAppIcon from '../../components/icons/WhatsAppIcon';
import { useConfigWeb } from '../../hooks/useConfigWeb';
import { obtenerWhatsAppPublico } from '../../utils/whatsappPublico';
import '../../components/public/PortadaPublica.css';

const PASOS = [
  {
    numero: '01',
    titulo: 'Solicite su cita',
    descripcion:
      'Agende en línea o escríbanos por WhatsApp. Indíquenos el equipo y confirmamos la visita.',
  },
  {
    numero: '02',
    titulo: 'Diagnóstico profesional',
    descripcion:
      'Un técnico evalúa su equipo, explica la falla y presenta la cotización antes de intervenir.',
  },
  {
    numero: '03',
    titulo: 'Reparación con garantía',
    descripcion:
      'Realizamos el trabajo con repuestos de calidad y queda registro escrito del servicio.',
  },
];

export default function HomePage() {
  const { config, loading } = useConfigWeb();

  if (loading) {
    // Mantiene el fondo blanco con altura estable: nunca pintar stats hardcodeados
    // viejos antes de que Firestore resuelva (anti-flash — ver 1819dca).
    return (
      <div className="home-publica">
        <div className="home-publica-cargando" aria-hidden="true" />
      </div>
    );
  }

  const servicios = Object.values(config.servicios ?? {})
    .filter((s) => s.habilitado)
    .sort((a, b) => (a.orden ?? 999) - (b.orden ?? 999));
  const marcas = Array.isArray(config.marcas) ? config.marcas : [];

  return (
    <div className="home-publica">
      <PortadaElectrodomesticos config={config} />

      {servicios.length > 0 && (
        <>
          <hr className="home-publica-separador" />
          <section className="home-publica-seccion" aria-labelledby="home-servicios-titulo">
            <div className="home-publica-contenedor">
              <header className="home-publica-encabezado">
                <h2 id="home-servicios-titulo" className="home-publica-encabezado-titulo">
                  Servicios
                </h2>
                <p className="home-publica-encabezado-texto">
                  Elija el equipo que necesita reparar o mantener. Cada servicio tiene su
                  página con detalles, problemas comunes y marcas que atendemos.
                </p>
              </header>
              <ul className="home-publica-servicios" role="list">
                {servicios.map((s) => (
                  <li key={s.slug}>
                    <Link to={`/servicios/${s.slug}`} className="home-publica-servicio">
                      <div className="home-publica-servicio-media">
                        <ImagenServicioPublico tipo={s.tipoEquipo} src={s.imagenCard} />
                      </div>
                      <h3 className="home-publica-servicio-titulo">{s.titulo}</h3>
                      {s.descripcionCorta && (
                        <p className="home-publica-servicio-descripcion">
                          {s.descripcionCorta}
                        </p>
                      )}
                      <span className="home-publica-servicio-enlace">Ver detalle</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </>
      )}

      <hr className="home-publica-separador" />

      <section className="home-publica-seccion" aria-labelledby="home-proceso-titulo">
        <div className="home-publica-contenedor">
          <header className="home-publica-encabezado">
            <h2 id="home-proceso-titulo" className="home-publica-encabezado-titulo">
              Cómo trabajamos
            </h2>
            <p className="home-publica-encabezado-texto">
              Tres pasos claros, de principio a fin.
            </p>
          </header>
          <ol className="home-publica-pasos">
            {PASOS.map((paso) => (
              <li className="home-publica-paso" key={paso.numero}>
                <span className="home-publica-paso-numero">Paso {paso.numero}</span>
                <h3 className="home-publica-paso-titulo">{paso.titulo}</h3>
                <p className="home-publica-paso-descripcion">{paso.descripcion}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {marcas.length > 0 && (
        <>
          <hr className="home-publica-separador" />
          <section className="home-publica-seccion" aria-labelledby="home-marcas-titulo">
            <div className="home-publica-contenedor home-publica-marcas-wrap">
              <header className="home-publica-encabezado">
                <h2 id="home-marcas-titulo" className="home-publica-encabezado-titulo">
                  Marcas que reparamos
                </h2>
                <p className="home-publica-encabezado-texto">
                  Si no ve su marca, consúltenos.
                </p>
              </header>
              <ul className="home-publica-marcas" role="list">
                {marcas.map((marca) => (
                  <li key={marca} className="home-publica-marca">
                    {marca}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </>
      )}

      <section className="home-publica-cta-final" aria-labelledby="home-cta-titulo">
        <div className="home-publica-cta-final-contenedor">
          <div>
            <h2 id="home-cta-titulo" className="home-publica-cta-final-titulo">
              Agende su visita a domicilio
            </h2>
            <p className="home-publica-cta-final-texto">
              El técnico llega con las herramientas y repuestos comunes para diagnosticar
              y, cuando es posible, reparar en la misma visita.
            </p>
          </div>
          <div className="home-publica-cta-final-botones">
            <Link to="/agendar" className="home-publica-cta-final-primario">
              Agendar cita
            </Link>
            <a
              href={obtenerWhatsAppPublico(config)}
              target="_blank"
              rel="noopener noreferrer"
              className="home-publica-cta-final-secundario"
              aria-label="Escribir por WhatsApp"
            >
              <WhatsAppIcon size={18} filled={false} />
              WhatsApp
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
