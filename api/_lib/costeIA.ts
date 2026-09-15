/** Estimación USD Sonnet 4.6, caché de 5 min. Tarifas verificadas 15/09/2026.
 * https://platform.claude.com/docs/en/build-with-claude/prompt-caching
 * No incluye impuestos ni acuerdos particulares de la cuenta.
 */
export function costeSonnet46(uso: { input_tokens: number; output_tokens: number; cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null }): number {
  return (uso.input_tokens * 3 + (uso.cache_creation_input_tokens ?? 0) * 3.75 + (uso.cache_read_input_tokens ?? 0) * 0.3 + uso.output_tokens * 15) / 1_000_000;
}
