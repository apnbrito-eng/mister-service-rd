import { expect, it } from 'vitest';
import { analizarDevengo } from '../../scripts/invariantes/check-comision-devengo-unico';
it('detecta query/addDoc y resolución de técnico sin UID', () => {
  expect(analizarDevengo("addDoc(collection(db, 'comisiones'), payload);")).toHaveLength(1);
  expect(analizarDevengo('export function obtenerTecnicoParaComision(){ return getDoc(ref); }')).toHaveLength(1);
});
