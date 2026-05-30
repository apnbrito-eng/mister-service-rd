import { useEffect, useState } from 'react';
import FormularioAgendarPublico from '../../components/public/FormularioAgendarPublico';
import {
  CONFIG_FORMULARIO_AGENDAR_DEFAULTS,
  ConfigFormularioAgendar,
} from '../../types/configFormularioAgendar';
import { suscribirConfigFormularioAgendar } from '../../services/formularioAgendar.service';

/**
 * Página pública `/agendar`. Muestra:
 *  - Hero con título/subtítulo configurables desde `/admin/web`.
 *  - Formulario funcional que escribe directo a `citas_por_confirmar`.
 *  - Si admin apaga el form, muestra un mensaje de cierre con CTA a WhatsApp.
 */
export default function AgendarPage() {
  const [config, setConfig] = useState<ConfigFormularioAgendar>({
    ...CONFIG_FORMULARIO_AGENDAR_DEFAULTS,
  });

  // Suscripción ligera solo para los textos del hero — el form interno
  // mantiene su propia suscripción para validar `habilitado` y campos.
  useEffect(() => {
    const unsub = suscribirConfigFormularioAgendar(setConfig);
    return () => unsub();
  }, []);

  const titulo =
    config.tituloHero ?? CONFIG_FORMULARIO_AGENDAR_DEFAULTS.tituloHero;
  const subtitulo =
    config.subtituloHero ?? CONFIG_FORMULARIO_AGENDAR_DEFAULTS.subtituloHero;

  return (
    <div>
      {/* Hero */}
      {/* @safe-gradient: hero marketing público — branding */}
      <section className="bg-gradient-to-br from-primary to-primary-medium py-16 md:py-20">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <h1 className="text-3xl md:text-4xl font-extrabold text-white mb-4">
            {titulo}
          </h1>
          <p className="text-blue-200 text-lg max-w-2xl mx-auto">
            {subtitulo}
          </p>
        </div>
      </section>

      <section className="py-12 md:py-16 bg-gray-bg">
        <div className="max-w-3xl mx-auto px-4">
          <FormularioAgendarPublico />
        </div>
      </section>
    </div>
  );
}
