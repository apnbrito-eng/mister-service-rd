import { useCallback, useEffect, useState } from 'react';
import { equipoApi } from '../services/equipoApi';
export interface PreferenciaChat { waId: string; favorito?: boolean; silenciado?: boolean; lista?: string; ocultoHastaMs?: number; vaciadoHastaMs?: number; }
export function usePreferenciasChat(uid?: string) {
  const [items, setItems] = useState<Record<string, PreferenciaChat>>({});
  const cargar = useCallback(async () => {
    if (!uid) { setItems({}); return; }
    const r = await equipoApi<{ items: PreferenciaChat[] }>('/api/crm/preferencias-chat');
    setItems(Object.fromEntries(r.items.map(x => [x.waId, x])));
  }, [uid]);
  useEffect(() => { let active = true; if (!uid) { setItems({}); return; } equipoApi<{items: PreferenciaChat[]}>('/api/crm/preferencias-chat').then(r => { if(active) setItems(Object.fromEntries(r.items.map(x=>[x.waId,x]))); }).catch(() => {}); return () => { active = false; }; }, [uid]);
  const cambiar = async (waId: string, cambios: Record<string, unknown>) => { await equipoApi('/api/crm/preferencias-chat', { waId, ...cambios }); await cargar(); };
  return { preferencias: items, cambiar };
}
