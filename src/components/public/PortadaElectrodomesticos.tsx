import { TIPOS_EQUIPO_FALLBACK } from '../../utils/tiposEquipoFallback';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { Waves, Refrigerator, Wind, Flame, Calendar } from 'lucide-react';
import type { ConfigWeb } from '../../services/configWeb.service';
import { enlaceAgendar, obtenerWhatsAppPublico, type IntencionServicio } from '../../utils/whatsappPublico';
import { DESPLAZAMIENTO_PANEL, ESCALA_PRESION, SEPARACION_ENTRADA_EQUIPOS, obtenerTransicionMovimiento } from '../../utils/motion';
import { useMovimientoReducido } from '../../hooks/useMovimientoReducido';
import WhatsAppIcon from '../icons/WhatsAppIcon';

const POSICION_EQUIPO: Record<string, string> = { Lavadora: '0% 0%', Estufa: '100% 0%', Nevera: '0% 100%', 'Aire Acondicionado': '100% 100%' };
const EQUIPOS = [
  { tipo: 'Lavadora', Icono: Waves },
  { tipo: 'Nevera', Icono: Refrigerator },
  { tipo: 'Aire Acondicionado', Icono: Wind },
  { tipo: 'Estufa', Icono: Flame },
];

export default function PortadaElectrodomesticos({ config, mostrarTitulo = true }: { config: ConfigWeb; mostrarTitulo?: boolean }) {
  const reducido = useMovimientoReducido();
  const [servicio, setServicio] = useState<IntencionServicio>('Reparación');
  const tiposPermitidos = config.tiposEquipoPublicos?.length ? config.tiposEquipoPublicos : TIPOS_EQUIPO_FALLBACK;
  const disponibles = EQUIPOS.filter(e => tiposPermitidos.includes(e.tipo) && Object.values(config.servicios ?? {}).some(s => s.habilitado && s.tipoEquipo === e.tipo));
  const [seleccion, setSeleccion] = useState('');
  const equipo = disponibles.some(e => e.tipo === seleccion) ? seleccion : (disponibles[0]?.tipo ?? '');
  const seleccionValida = disponibles.some(e => e.tipo === seleccion) ? seleccion : '';
  const seleccionVisual = seleccionValida || (disponibles.length < EQUIPOS.length ? equipo : '');
  const mensaje = `Hola, necesito ${servicio.toLocaleLowerCase('es')} ${equipo ? `de ${equipo.toLocaleLowerCase('es')}` : 'de un electrodoméstico'}.`;
  const transicion = obtenerTransicionMovimiento(reducido);
  return (
    <section className="bg-white px-4 py-4 sm:px-6 sm:py-10 md:py-16" aria-label="Seleccionar servicio">
      <div className="mx-auto max-w-6xl">
        {mostrarTitulo && <div className="mx-auto max-w-3xl text-center">
          {config.hero.badge && <p className="mb-3 text-sm font-medium text-primary">{config.hero.badge}</p>}
          <h1 className="text-2xl font-bold leading-tight tracking-tight text-gray-900 sm:text-4xl md:text-5xl">Reparación y mantenimiento de electrodomésticos</h1>
          <p className="mx-auto mt-2 max-w-2xl sm:mt-4 text-base leading-relaxed text-gray-600">{config.hero.subtitulo}</p>
        </div>}
        <div className="mt-3 grid items-center gap-3 sm:mt-8 sm:gap-6 lg:grid-cols-2 lg:gap-12">
          {disponibles.length > 0 && <div className="relative h-32 sm:h-80 lg:h-[420px]" aria-label={seleccion || 'Electrodomésticos'}>
            <div className="absolute inset-0 grid grid-cols-2 grid-rows-2" aria-hidden={!!seleccionVisual}>
              {disponibles.map(({ tipo }, indice) => <motion.div key={tipo}
                initial={reducido ? false : { opacity: 0, y: DESPLAZAMIENTO_PANEL }}
                animate={{ opacity: seleccionVisual ? 0 : 1, y: 0 }}
                transition={{ ...transicion, delay: reducido || seleccionVisual ? 0 : indice * SEPARACION_ENTRADA_EQUIPOS }}
                className="flex items-center justify-center">
                <div role="img" aria-label={tipo} className="aspect-square h-full max-w-full" style={{ backgroundImage: 'url(/portada/equipos-individuales.webp)', backgroundSize: '200% 200%', backgroundPosition: POSICION_EQUIPO[tipo] }} />
              </motion.div>)}
            </div>
            {disponibles.map(({ tipo }) => {
              const imagen = Object.values(config.servicios ?? {}).find(s => s.habilitado && s.tipoEquipo === tipo)?.imagenCard;
              const visible = seleccionVisual === tipo;
              return <motion.div key={tipo} initial={false} animate={{ opacity: visible ? 1 : 0, x: reducido || visible ? 0 : DESPLAZAMIENTO_PANEL }} transition={transicion}
                aria-hidden={!visible} className="absolute inset-0 flex items-center justify-center">
                {imagen ? <img src={imagen} alt={tipo} className="h-full w-full object-contain" /> : <div role="img" aria-label={tipo} className="aspect-square h-full max-w-full" style={{ backgroundImage: 'url(/portada/equipos-individuales.webp)', backgroundSize: '200% 200%', backgroundPosition: POSICION_EQUIPO[tipo], backgroundRepeat: 'no-repeat' }} />}
              </motion.div>;
            })}
          </div>}
          <div>
          <h2 className="mb-3 text-center text-xl sm:mb-5 sm:text-2xl font-semibold text-gray-900 lg:text-left">¿Qué necesita tu equipo?</h2>
          <div className="mb-3 flex justify-center sm:mb-6 gap-2" role="group" aria-label="Tipo de servicio">
            {(['Reparación', 'Mantenimiento'] as const).map(valor => <motion.button key={valor} type="button" aria-pressed={servicio === valor} onClick={() => setServicio(valor)}
              whileTap={reducido ? undefined : { scale: ESCALA_PRESION }} transition={transicion}
              className={`min-h-[48px] flex-1 rounded-full px-4 py-3 text-sm font-semibold sm:flex-none sm:px-8 ${servicio === valor ? 'bg-primary text-white' : 'bg-gray-100 text-gray-700'}`}>{valor}</motion.button>)}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:gap-3 sm:grid-cols-4" role="group" aria-label="Equipo">
            {disponibles.map(({ tipo }) => {
              const imagen = Object.values(config.servicios ?? {}).find(s => s.habilitado && s.tipoEquipo === tipo)?.imagenCard;
              return <motion.button key={tipo} type="button" aria-pressed={equipo === tipo} onClick={() => setSeleccion(tipo)}
                whileTap={reducido ? undefined : { scale: ESCALA_PRESION }} transition={transicion}
                className={`flex min-h-[64px] items-center justify-center gap-2 rounded-2xl border p-2 sm:min-h-[104px] sm:flex-col sm:p-3 text-sm font-medium ${equipo === tipo ? 'border-primary bg-primary/5 text-primary' : 'border-gray-200 text-gray-700'}`}>
                {imagen ? <img src={imagen} alt="" className="h-10 w-10 object-contain sm:h-12 sm:w-16" /> : <span aria-hidden="true" className="h-10 w-10 flex-shrink-0 sm:h-16 sm:w-16" style={{ backgroundImage: 'url(/portada/equipos-individuales.webp)', backgroundSize: '200% 200%', backgroundPosition: POSICION_EQUIPO[tipo] }} />}{tipo}
              </motion.button>;
            })}
          </div>
          <div className="mt-3 flex flex-col justify-center gap-2 sm:mt-6 sm:gap-3 sm:flex-row">
            <Link to={enlaceAgendar(equipo, servicio)} className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full bg-primary px-7 py-3 font-semibold text-white"><Calendar size={18} />Agendar servicio</Link>
            <a href={obtenerWhatsAppPublico(config, mensaje)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full border border-gray-300 px-7 py-3 font-semibold text-primary"><WhatsAppIcon size={20} />Escribir por WhatsApp</a>
          </div>
          </div>
        </div>
          {mostrarTitulo && <div className="mt-8 flex flex-wrap justify-center gap-x-10 gap-y-3 text-center text-sm text-gray-500">
            {[config.estadisticas.experiencia, config.estadisticas.servicios].map((dato, indice) => <p key={indice}><span className="mr-2 font-semibold text-gray-900">{dato.valor}</span>{dato.etiqueta}</p>)}
          </div>}
      </div>
    </section>
  );
}
