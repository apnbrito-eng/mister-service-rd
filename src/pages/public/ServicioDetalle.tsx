import { useEffect, useId, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { useConfigWeb } from '../../hooks/useConfigWeb';
import { enlaceAgendar, obtenerWhatsAppPublico } from '../../utils/whatsappPublico';
import { ConfigWeb, ServicioDetalle as ServicioDetalleType } from '../../services/configWeb.service';
import ImagenServicioPublico from '../../components/public/ImagenServicioPublico';

function buildServiceJsonLd(
  servicio: ServicioDetalleType,
  config: ConfigWeb,
): string {
  const telefono = config.contacto?.telefono;
  const whatsapp = config.whatsapp?.numeros?.find((n) => n.activo)?.numero;
  const direccion = config.contacto?.direccion;
  const descripcion = servicio.descripcionLarga || servicio.descripcionCorta;

  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    serviceType: servicio.titulo,
    provider: {
      '@type': 'LocalBusiness',
      name: 'Mister Service RD',
      ...(telefono ? { telephone: telefono } : whatsapp ? { telephone: whatsapp } : {}),
      ...(direccion ? { address: direccion } : {}),
    },
    areaServed: 'Santo Domingo, República Dominicana',
    ...(descripcion ? { description: descripcion } : {}),
  };
  return JSON.stringify(data);
}


function FaqAccordion({ faqs }: { faqs: ServicioDetalleType['faqs'] }) {
  const [abierto, setAbierto] = useState<number | null>(null);
  const id = useId();
  return <div className="web-faq">{faqs.map((faq, indice) => {
    const expandido = abierto === indice;
    return <div key={indice} className="web-faq-item">
      <h3><button type="button" id={`${id}-boton-${indice}`} aria-expanded={expandido} aria-controls={`${id}-respuesta-${indice}`} onClick={() => setAbierto(expandido ? null : indice)}>
        {faq.pregunta}{expandido ? <ChevronUp size={20} aria-hidden="true" /> : <ChevronDown size={20} aria-hidden="true" />}
      </button></h3>
      <div id={`${id}-respuesta-${indice}`} role="region" aria-labelledby={`${id}-boton-${indice}`} hidden={!expandido}>{faq.respuesta}</div>
    </div>;
  })}</div>;
}

export default function ServicioDetalle() {
  const { slug = '' } = useParams<{ slug: string }>();
  const { config, loading } = useConfigWeb();
  const servicio = (config.servicios || {})[slug];
  const valido = !!servicio && servicio.habilitado !== false;
  // ─── Meta tags + JSON-LD ────────────────────────────
  // Manejamos los nodos que añadimos manualmente para limpiarlos en
  // unmount sin tocar otros <meta> / <title> / <script> del documento.
  useEffect(() => {
    if (!valido || !servicio) return;

    const prevTitle = document.title;
    document.title = `${servicio.titulo} | Mister Service RD`;

    // <meta name="description">
    let descMeta = document.querySelector(
      'meta[name="description"]',
    ) as HTMLMetaElement | null;
    let descMetaCreated = false;
    const previousDescContent = descMeta?.content;
    if (!descMeta) {
      descMeta = document.createElement('meta');
      descMeta.name = 'description';
      document.head.appendChild(descMeta);
      descMetaCreated = true;
    }
    descMeta.content =
      servicio.descripcionCorta || servicio.descripcionLarga || '';

    // <script type="application/ld+json"> propio
    const ldScript = document.createElement('script');
    ldScript.type = 'application/ld+json';
    ldScript.dataset.servicio = servicio.slug;
    ldScript.text = buildServiceJsonLd(servicio, config);
    document.head.appendChild(ldScript);

    return () => {
      document.title = prevTitle;
      if (descMetaCreated) {
        descMeta?.parentNode?.removeChild(descMeta);
      } else if (descMeta) {
        descMeta.content = previousDescContent ?? '';
      }
      ldScript.parentNode?.removeChild(ldScript);
    };
  }, [valido, servicio, config]);


  if (loading) return <div className="web-contenedor"><p className="web-estado" role="status">Cargando servicio…</p></div>;
  if (!valido || !servicio) return <div className="web-contenedor"><section className="web-estado">
    <h1>Servicio no encontrado</h1><p>El servicio que buscas no está disponible.</p>
    <div className="web-acciones"><Link to="/servicios" className="web-boton web-boton-primario">Ver servicios</Link><a href={obtenerWhatsAppPublico(config)} target="_blank" rel="noopener noreferrer" className="web-boton web-boton-contorno">Consultar por WhatsApp</a></div>
  </section></div>;
  const whatsapp = obtenerWhatsAppPublico(config, `Hola, me interesa el servicio de ${servicio.tipoEquipo || servicio.titulo}.`);
  const agenda = enlaceAgendar(servicio.tipoEquipo, 'Reparación');
  return <div className="web-contenedor">
    <section className="web-detalle-hero">
      <div>
        <Link to="/servicios" className="web-ruta"><ArrowLeft size={16} aria-hidden="true" /> Todos los servicios</Link>
        <h1>{servicio.titulo}</h1><p>{servicio.descripcionCorta}</p>
        {servicio.tiempoEstimadoReparacion && <p className="mt-4 text-sm">Tiempo estimado: {servicio.tiempoEstimadoReparacion}</p>}
        <div className="web-acciones"><Link to={agenda} className="web-boton web-boton-primario">Agendar cita <ArrowRight size={17} aria-hidden="true" /></Link><a href={whatsapp} target="_blank" rel="noopener noreferrer" className="web-boton web-boton-contorno">WhatsApp</a></div>
      </div>
      <div className="web-detalle-visual"><ImagenServicioPublico tipo={servicio.tipoEquipo} src={servicio.imagenHero || servicio.imagenCard} principal /></div>
    </section>
    {servicio.descripcionLarga && <section className="web-detalle-seccion"><h2>Sobre el servicio</h2><p className="web-detalle-texto">{servicio.descripcionLarga}</p></section>}
    {!!servicio.problemasComunes?.length && <section className="web-detalle-seccion"><h2>Problemas que atendemos</h2><ul className="web-problemas">{servicio.problemasComunes.map(problema => <li key={problema}><CheckCircle size={19} aria-hidden="true" /><span>{problema}</span></li>)}</ul></section>}
    {!!servicio.marcasReparadas?.length && <section className="web-detalle-seccion"><h2>Marcas que reparamos</h2><ul className="web-marcas">{servicio.marcasReparadas.map(marca => <li key={marca}>{marca}</li>)}</ul></section>}
    {!!servicio.faqs?.length && <section className="web-detalle-seccion"><h2>Preguntas frecuentes</h2><FaqAccordion key={slug} faqs={servicio.faqs} /></section>}
    <section className="web-ayuda"><div><h2>Solicita tu visita.</h2><p>Completa tus datos y cuéntanos qué le sucede a tu equipo.</p></div><div className="web-acciones"><Link to={agenda} className="web-boton web-boton-primario">Agendar cita <ArrowRight size={17} aria-hidden="true" /></Link><a href={whatsapp} target="_blank" rel="noopener noreferrer" className="web-boton web-boton-contorno">Consultar</a></div></section>
  </div>;
}
