// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { textPdf } from '../../disk/formats/pdf';
import { OpenedPdf, openPdf } from './pdf-viewer';

describe('pdf.js 打开与读取 PDF（D-28）', () => {
  it('本项目生成的文本 PDF 也能按页打开，文本可以提取', async () => {
    const doc = await openPdf(
      textPdf({
        title: 'Interface Guidelines',
        subtitle: 'A short guide',
        sections: [{ title: 'Intro', text: 'Hello from the desktop.' }]
      })
    );
    expect(doc).toBeInstanceOf(OpenedPdf);
    expect(doc.pageCount).toBe(1);
    expect(await doc.textOf(1)).toContain('Interface Guidelines');
    expect(await doc.textOf(1)).toContain('Hello from the desktop');
    await doc.destroy();
  });

  it('放不下的内容换页，每页有独立尺寸', async () => {
    const doc = await openPdf(textPdf({ title: 'Long', sections: [{ title: 'A', text: 'word '.repeat(2000) }] }));
    expect(doc.pageCount).toBeGreaterThan(1);
    const first = await doc.pageSize(1, 1);
    const second = await doc.pageSize(2, 1);
    expect(first.width).toBeGreaterThan(0);
    expect(first.height).toBeGreaterThan(0);
    expect(second.width).toBe(first.width);
    await doc.destroy();
  });

  it('不是 PDF 的字节打不开', async () => {
    await expect(openPdf(new TextEncoder().encode('not a pdf'))).rejects.toThrow();
  });
});
