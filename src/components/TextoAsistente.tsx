import { Fragment } from 'react';

/** Énfasis básico sin interpretar HTML, enlaces ni contenido ejecutable del modelo. */
export function TextoAsistente({ texto }: { texto: string }) {
  return <>{texto.split(/(\*\*[^*\n]+\*\*)/g).map((parte, indice) =>
    parte.startsWith('**') && parte.endsWith('**') && parte.length > 4
      ? <strong key={indice}>{parte.slice(2, -2)}</strong>
      : <Fragment key={indice}>{parte}</Fragment>
  )}</>;
}
