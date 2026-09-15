import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TextoAsistente } from '../../src/components/TextoAsistente';

describe('presentación segura de respuestas IA', () => {
  it('presenta énfasis sin mostrar asteriscos y conserva el resto del mensaje', () => {
    expect(renderToStaticMarkup(createElement(TextoAsistente, { texto: 'Pantalla **Marketing**.\nRevisa OS-0001.' })))
      .toBe('Pantalla <strong>Marketing</strong>.\nRevisa OS-0001.');
  });
  it('mantiene como texto HTML y enlaces recibidos del modelo', () => {
    const html = renderToStaticMarkup(createElement(TextoAsistente, { texto: '**<img src=x onerror=alert(1)>** [abrir](javascript:alert(1))' }));
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<a');
    expect(html).toContain('&lt;img');
  });
});
