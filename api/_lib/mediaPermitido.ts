/** Contenido descargable de WhatsApp: nunca HTML ni SVG ejecutable. */
export function mediaPermitido(mime: string): boolean {
  return /^(image\/(jpeg|png|webp|gif|heic)|video\/(mp4|3gpp)|audio\/(aac|mp4|mpeg|amr|ogg)|application\/(pdf|msword|vnd\.ms-excel|vnd\.ms-powerpoint|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation))|text\/plain)$/.test(mime.split(';')[0].trim());
}
export function limiteMedia(tipo: unknown): number { return (tipo === 'document' ? 100 : 16) * 1024 * 1024; }
