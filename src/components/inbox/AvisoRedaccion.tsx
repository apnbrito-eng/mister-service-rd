import { useEffect, useState } from "react";
import { equipoApi } from "../../services/equipoApi";
export default function AvisoRedaccion({ waId }: { waId: string }) {
  const [nombres, setNombres] = useState<string[]>([]);
  useEffect(() => {
    let activo = true;
    async function comprobar() {
      if (document.hidden) return;
      try {
        const r = await equipoApi<{ redactando: { nombre: string }[] }>(
          `/api/crm/atencion?waId=${encodeURIComponent(waId)}&soloPresencia=1`,
        );
        if (activo) setNombres(r.redactando.map((p) => p.nombre));
      } catch {
        if (activo) setNombres([]);
      }
    }
    void comprobar();
    const timer = window.setInterval(() => void comprobar(), 10000);
    return () => {
      activo = false;
      clearInterval(timer);
    };
  }, [waId]);
  return nombres.length ? (
    <p role="status" className="px-3 py-2 text-sm text-blue-800 bg-blue-50">
      {nombres.join(", ")} está preparando una respuesta. Coordina antes de
      enviar.
    </p>
  ) : null;
}
