import { useState, useEffect } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { Calendario } from '../../types';
import { Link } from 'react-router-dom';
import { Calendar, User, Clock, ChevronRight, AlertCircle } from 'lucide-react';
import WhatsAppIcon from '../../components/icons/WhatsAppIcon';
import LoadingSpinner from '../../components/LoadingSpinner';
import { useConfigWeb, getWhatsAppUrl } from '../../hooks/useConfigWeb';

export default function AgendarPage() {
  const [loading, setLoading] = useState(true);
  const [calendarios, setCalendarios] = useState<Calendario[]>([]);
  const { config } = useConfigWeb();

  useEffect(() => {
    const fetchCalendarios = async () => {
      try {
        const q = query(collection(db, 'calendarios'), where('activo', '==', true));
        const snap = await getDocs(q);
        const cals: Calendario[] = snap.docs.map(doc => {
          const raw = doc.data();
          return {
            id: doc.id,
            nombre: raw.nombre || '',
            asignadoId: raw.asignadoId || '',
            asignadoNombre: raw.asignadoNombre || '',
            color: raw.color || '#2563EB',
            activo: true,
            dias: raw.dias || [],
            horas: raw.horas || [],
            createdAt: raw.createdAt?.toDate?.() || new Date(),
          };
        });
        setCalendarios(cals);
      } catch (err) {
        console.error('Error loading calendarios:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchCalendarios();
  }, []);

  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-br from-primary to-primary-medium py-16 md:py-20">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <h1 className="text-3xl md:text-4xl font-extrabold text-white mb-4">
            Agendar Cita
          </h1>
          <p className="text-blue-200 text-lg max-w-2xl mx-auto">
            Seleccione un calendario disponible para agendar su cita de servicio técnico.
            Le confirmaremos por teléfono o WhatsApp.
          </p>
        </div>
      </section>

      <section className="py-12 md:py-16 bg-gray-bg">
        <div className="max-w-3xl mx-auto px-4">
          {loading ? (
            <div className="py-12">
              <LoadingSpinner text="Cargando calendarios disponibles..." />
            </div>
          ) : calendarios.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
              <AlertCircle size={48} className="mx-auto text-yellow-400 mb-3" />
              <h2 className="text-xl font-bold text-gray-900 mb-2">No hay calendarios disponibles</h2>
              <p className="text-gray-500 text-sm mb-6">
                En este momento no hay calendarios habilitados para agendar citas en línea.
                Por favor contáctenos directamente.
              </p>
              <a
                href={getWhatsAppUrl(config, 'Hola, quiero agendar una cita')}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-green-500 text-white px-6 py-3 rounded-xl font-semibold text-sm hover:bg-green-600 transition-colors"
              >
                <WhatsAppIcon filled={false} className="text-white" size={16} /> Agendar por WhatsApp
              </a>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-gray-500 text-center mb-6">
                Seleccione el calendario que mejor se ajuste a su ubicación o preferencia
              </p>
              {calendarios.map(cal => (
                <Link
                  key={cal.id}
                  to={`/cita/${cal.id}`}
                  className="block bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:shadow-md hover:border-primary/20 transition-all group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center"
                        style={{ backgroundColor: cal.color + '20' }}
                      >
                        <Calendar size={22} style={{ color: cal.color }} />
                      </div>
                      <div>
                        <h3 className="font-bold text-gray-900 group-hover:text-primary transition-colors">
                          {cal.nombre}
                        </h3>
                        {cal.asignadoNombre && (
                          <div className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
                            <User size={10} /> {cal.asignadoNombre}
                          </div>
                        )}
                        <div className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
                          <Clock size={10} /> {cal.dias.join(', ')}
                        </div>
                      </div>
                    </div>
                    <ChevronRight size={20} className="text-gray-300 group-hover:text-primary transition-colors" />
                  </div>
                </Link>
              ))}

              <div className="text-center pt-6">
                <p className="text-sm text-gray-500 mb-3">¿Prefiere contacto directo?</p>
                <a
                  href={getWhatsAppUrl(config, 'Hola, quiero agendar una cita')}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 bg-green-500 text-white px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-green-600 transition-colors"
                >
                  <WhatsAppIcon filled={false} className="text-white" size={14} /> Escribir por WhatsApp
                </a>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
