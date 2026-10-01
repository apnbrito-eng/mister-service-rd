import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useConfigWeb } from '../../hooks/useConfigWeb';
import { obtenerWhatsAppPublico } from '../../utils/whatsappPublico';
import ImagenServicioPublico from '../../components/public/ImagenServicioPublico';

export default function ServiciosPage() {
  const { config, loading } = useConfigWeb();
  const servicios = Object.values(config.servicios || {})
    .filter(servicio => servicio.habilitado !== false)
    .sort((a, b) => a.orden - b.orden);
  return (
    <div className="web-contenedor">
      <header className="web-intro">
        <h1>Un servicio para cada equipo.</h1>
        <p>Encuentra tu electrodoméstico, consulta las fallas que atendemos y solicita una cita.</p>
      </header>
      {loading ? <p className="web-estado" role="status">Cargando servicios…</p> : (
        <div className="web-catalogo">
          {servicios.map(servicio => <article key={servicio.slug} className="web-servicio">
            <Link to={`/servicios/${servicio.slug}`} className="web-servicio-visual" aria-label={`Ver ${servicio.titulo}`}>
              <ImagenServicioPublico tipo={servicio.tipoEquipo} src={servicio.imagenCard} />
            </Link>
            <h2><Link to={`/servicios/${servicio.slug}`}>{servicio.titulo}</Link></h2>
            <p>{servicio.descripcionCorta}</p>
            <Link to={`/servicios/${servicio.slug}`} className="web-enlace">Ver servicio <ArrowRight size={17} aria-hidden="true" /></Link>
          </article>)}
          {!servicios.length && <p>No hay servicios disponibles en este momento. Puedes consultarnos por WhatsApp.</p>}
        </div>
      )}
      <section className="web-ayuda">
        <div><h2>¿No encuentras tu equipo?</h2><p>Cuéntanos qué necesita y te orientamos sobre el servicio.</p></div>
        <a href={obtenerWhatsAppPublico(config)} target="_blank" rel="noopener noreferrer" className="web-boton web-boton-contorno">Consultar por WhatsApp <ArrowRight size={17} aria-hidden="true" /></a>
      </section>
    </div>
  );
}
