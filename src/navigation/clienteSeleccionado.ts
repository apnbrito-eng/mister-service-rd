// Conserva códigos internacionales; solo normaliza el prefijo NANP para números de diez dígitos.
export function telefonoComparable(value: unknown): string {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length < 10) return '';
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
}
export function mismoTelefono(a: unknown, b: unknown): boolean {
  const value = telefonoComparable(a);
  return !!value && value === telefonoComparable(b);
}
