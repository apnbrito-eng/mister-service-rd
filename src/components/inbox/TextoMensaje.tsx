/** Links are text, never HTML; only web URLs become navigable. */
export default function TextoMensaje({ texto }: { texto: string }) {
  return <p className="text-sm whitespace-pre-wrap break-words">{texto.split(/(https?:\/\/[^\s<>]+)/gi).map((part, i) => /^https?:\/\//i.test(part) ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 break-all">{part}</a> : part)}</p>;
}
