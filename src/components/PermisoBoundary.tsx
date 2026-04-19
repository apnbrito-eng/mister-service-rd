import { useApp } from '../context/AppContext';
import { puede, AccionPermiso } from '../utils/permisos';

interface Props {
  permiso: AccionPermiso;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

/** Renderiza children solo si el userProfile actual tiene el permiso. */
export default function PermisoBoundary({ permiso, fallback = null, children }: Props) {
  const { userProfile } = useApp();
  if (!puede(userProfile, permiso)) return <>{fallback}</>;
  return <>{children}</>;
}
