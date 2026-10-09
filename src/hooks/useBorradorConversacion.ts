import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react';
import toast from 'react-hot-toast';
function leerBorrador(estado: unknown, waId?: string): string | null {
  if (!estado || typeof estado !== 'object' || !('borradorChat' in estado)) return null;
  const valor = estado.borradorChat;
  if (!valor || typeof valor !== 'object' || !('waId' in valor) || !('texto' in valor)) return null;
  return valor.waId === waId && typeof valor.texto === 'string' && valor.texto.length <= 4096 ? valor.texto : null;
}
/** El borrador siempre pertenece a un destinatario; cambiar chat no lo traslada. */
export function useBorradorConversacion(waId: string | undefined, estado: unknown, claveRuta: string) {
  const [borrador, setBorrador] = useState<{ waId?: string; texto: string }>({ waId, texto: '' });
  const texto = borrador.waId === waId ? borrador.texto : '';
  const consumida = useRef('');
  const setTexto = useCallback((valor: SetStateAction<string>) => {
    setBorrador(anterior => ({ waId, texto: typeof valor === 'function' ? valor(anterior.waId === waId ? anterior.texto : '') : valor }));
  }, [waId]);
  useEffect(() => {
    if (consumida.current === claveRuta) return;
    consumida.current = claveRuta;
    const propuesto = leerBorrador(estado, waId);
    if (!propuesto) return;
    if (texto.trim()) {
      toast('Conservamos el borrador que estabas escribiendo. Revisa el mensaje antes de enviar.');
      return;
    }
    setTexto(propuesto);
  }, [claveRuta, estado, waId, texto, setTexto]);
  return { texto, setTexto };
}
