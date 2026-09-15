import { expect, it } from 'vitest';
import { costeSonnet46 } from '../../api/_lib/costeIA';
it('distingue entrada normal, caché escrita y caché leída en el coste por iteración', () => {
  expect(costeSonnet46({ input_tokens: 1000, output_tokens: 100 })).toBeCloseTo(0.0045, 8);
  expect(costeSonnet46({ input_tokens: 0, cache_creation_input_tokens: 1000, output_tokens: 100 })).toBeCloseTo(0.00525, 8);
  expect(costeSonnet46({ input_tokens: 0, cache_read_input_tokens: 1000, output_tokens: 100 })).toBeCloseTo(0.0018, 8);
});
