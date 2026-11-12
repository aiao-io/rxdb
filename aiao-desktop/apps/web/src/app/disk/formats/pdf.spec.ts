import { describe, expect, it } from 'vitest';

import { readPdfText, textPdf } from './pdf';

const latin1 = (bytes: Uint8Array): string => new TextDecoder('latin1').decode(bytes);

const DOC = {
  title: 'Interface Guidelines',
  sections: [
    { title: '1 · Materials', text: 'Chrome is a material, not a colour (really).' },
    { title: '2 · Depth', text: 'Four shadow layers — a hairline, a contact shadow, a body and an ambient spill.' }
  ]
};

describe('textPdf', () => {
  it('生成带文件头、交叉引用表与结尾标记的 PDF', () => {
    const pdf = latin1(textPdf(DOC));
    expect(pdf.startsWith('%PDF-1.4\n')).toBe(true);
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(pdf).toContain('/Type /Catalog');
    expect(pdf).toContain('/BaseFont /Helvetica');
    expect(pdf).toContain('/Title (Interface Guidelines)');
  });

  it('交叉引用表里的每个偏移都指向对应对象', () => {
    const pdf = latin1(textPdf(DOC));
    const startxref = Number(/startxref\n(\d+)\n/.exec(pdf)?.[1]);
    expect(pdf.slice(startxref, startxref + 4)).toBe('xref');
    const rows = pdf.slice(startxref).split('\n').slice(2);
    const count = Number(/^xref\n0 (\d+)\n/.exec(pdf.slice(startxref))?.[1]);
    for (let id = 1; id < count; id++) {
      const offset = Number(rows[id].slice(0, 10));
      expect(pdf.slice(offset, offset + `${id} 0 obj`.length)).toBe(`${id} 0 obj`);
    }
  });

  it('括号与反斜杠被转义，长段落折行，内容太多时分页', () => {
    const long = { title: 'Long', sections: [{ title: 'Body', text: 'word '.repeat(2_000).trim() }] };
    const pdf = latin1(textPdf(long));
    expect(latin1(textPdf(DOC))).toContain('\\(really\\)');
    expect(Number(/\/Count (\d+)/.exec(pdf)?.[1])).toBeGreaterThan(1);
  });
});

describe('readPdfText', () => {
  it('读回标题与各节正文（折行重新拼接，WinAnsi 字符还原）', () => {
    expect(readPdfText(textPdf(DOC))).toEqual(DOC);
  });

  it('副标题单独读回', () => {
    const withSubtitle = { ...DOC, subtitle: 'Revision 4 · July 2026' };
    expect(readPdfText(textPdf(withSubtitle))).toEqual(withSubtitle);
  });

  it('不是本应用生成的 PDF 时返回 null', () => {
    expect(readPdfText(new TextEncoder().encode('%PDF-1.7\n%%EOF'))).toBeNull();
    expect(readPdfText(new TextEncoder().encode('hello'))).toBeNull();
  });
});
