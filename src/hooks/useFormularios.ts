import { useState, useEffect } from 'react';
import { EmpresaAliada, FormularioServicio, SolicitudServicio, EstadoSolicitud } from '../types/formularios';
import { listarEmpresas, obtenerEmpresa } from '../services/empresasAliadas.service';
import { listarFormularios, obtenerFormularioPorSlug } from '../services/formularios.service';
import { onSolicitudesChange, listarSolicitudes } from '../services/solicitudes.service';

/** Hook para listar empresas aliadas */
export function useEmpresas(soloActivas?: boolean) {
  const [empresas, setEmpresas] = useState<EmpresaAliada[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listarEmpresas(soloActivas)
      .then(data => { if (!cancelled) setEmpresas(data); })
      .catch(err => console.error('Error cargando empresas:', err))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [soloActivas]);

  return { empresas, loading };
}

/** Hook para listar formularios, opcionalmente filtrados por empresa */
export function useFormularios(empresaId?: string) {
  const [formularios, setFormularios] = useState<FormularioServicio[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listarFormularios(empresaId)
      .then(data => { if (!cancelled) setFormularios(data); })
      .catch(err => console.error('Error cargando formularios:', err))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [empresaId]);

  return { formularios, loading };
}

/** Hook para solicitudes en tiempo real */
export function useSolicitudes(filtros?: { estado?: EstadoSolicitud; empresaId?: string }) {
  const [solicitudes, setSolicitudes] = useState<SolicitudServicio[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Si hay filtros específicos, usar getDocs (no real-time) porque Firestore
    // requiere índices compuestos para queries con multiple where + orderBy
    if (filtros?.estado || filtros?.empresaId) {
      let cancelled = false;
      setLoading(true);
      listarSolicitudes(filtros)
        .then(data => { if (!cancelled) setSolicitudes(data); })
        .catch(err => console.error('Error cargando solicitudes:', err))
        .finally(() => { if (!cancelled) setLoading(false); });
      return () => { cancelled = true; };
    }

    // Sin filtros: usar onSnapshot para tiempo real
    setLoading(true);
    const unsub = onSolicitudesChange((data) => {
      setSolicitudes(data);
      setLoading(false);
    });
    return () => unsub();
  }, [filtros?.estado, filtros?.empresaId]);

  return { solicitudes, loading };
}

/** Hook para cargar un formulario público por slug + su empresa */
export function useFormularioPublico(slug: string) {
  const [formulario, setFormulario] = useState<FormularioServicio | null>(null);
  const [empresa, setEmpresa] = useState<EmpresaAliada | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    obtenerFormularioPorSlug(slug)
      .then(async (form) => {
        if (cancelled) return;
        if (!form) {
          setError('Formulario no encontrado');
          setLoading(false);
          return;
        }
        setFormulario(form);

        // Cargar empresa asociada
        if (form.empresaId) {
          const emp = await obtenerEmpresa(form.empresaId);
          if (!cancelled) setEmpresa(emp);
        }
        if (!cancelled) setLoading(false);
      })
      .catch(err => {
        console.error('Error cargando formulario público:', err);
        if (!cancelled) {
          setError('Error al cargar el formulario');
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [slug]);

  return { formulario, empresa, loading, error };
}
