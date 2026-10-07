/** Compatibilidad con enlaces guardados: el mapa único es Mapa de operaciones. */
import { Navigate, useLocation } from 'react-router-dom';

export default function MapaRutas() {
  const { search, hash } = useLocation();
  return <Navigate to={{ pathname: '/admin/mapa', search, hash }} replace />;
}
