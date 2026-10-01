import { useEffect, useState } from 'react';
import FormularioAgendarPublico from '../../components/public/FormularioAgendarPublico';
import { CONFIG_FORMULARIO_AGENDAR_DEFAULTS, ConfigFormularioAgendar } from '../../types/configFormularioAgendar';
import { suscribirConfigFormularioAgendar } from '../../services/formularioAgendar.service';

/** Solicitud pública: mantiene el envío protegido y la configuración del administrador. */
export default function AgendarPage() {
  const [config, setConfig] = useState<ConfigFormularioAgendar>({ ...CONFIG_FORMULARIO_AGENDAR_DEFAULTS });
  useEffect(() => suscribirConfigFormularioAgendar(setConfig), []);
  const titulo = config.tituloHero ?? CONFIG_FORMULARIO_AGENDAR_DEFAULTS.tituloHero;
  const subtitulo = config.subtituloHero ?? CONFIG_FORMULARIO_AGENDAR_DEFAULTS.subtituloHero;
  return (
    <div className="web-contenedor web-agenda">
      <header className="web-intro"><h1>{titulo}</h1><p>{subtitulo}</p></header>
      <section className="web-agenda-formulario" aria-label="Datos para solicitar una cita"><FormularioAgendarPublico /></section>
    </div>
  );
}
