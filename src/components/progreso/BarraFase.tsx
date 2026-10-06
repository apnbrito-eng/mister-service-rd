import type { FaseOrden } from '../../types';
import { faseLabel } from '../../utils';
import { estadoChipDeFase } from '../../utils/chipEstado';
const pasos = ['agendada','en_camino','en_sitio','diagnostico','trabajando','cobro','cerrada'];
/** Presentación de la fase existente. No deduce llegada, cobro confirmado ni pasos sin evidencia. */
export default function BarraFase({fase,garantia=false}:{fase:FaseOrden;garantia?:boolean}) {
  const indice=pasos.indexOf(estadoChipDeFase(fase));
  return <div className="apple-phase-bar" role="img" aria-label={`Estado: ${faseLabel(fase)}`}>
    {pasos.map((p,i)=><span key={p} style={{background: i<=indice ? garantia ? 'var(--ms-garantia)' : `var(--ms-paso-${i})` : 'var(--ms-pista)'}}/>)}
  </div>;
}
