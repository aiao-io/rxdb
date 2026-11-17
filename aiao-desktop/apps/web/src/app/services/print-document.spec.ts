import { describe, expect, it, vi } from 'vitest';

import { printDocument, printableText } from './print-document';

class Element {
  textContent = '';
  title = '';
  src = '';
  alt = '';
  tabIndex = 0;
  readonly style = { cssText: '' };
  readonly attributes = new Map<string, string>();
  readonly children: Element[] = [];
  readonly remove = vi.fn();
  readonly decode = vi.fn(async (): Promise<void> => undefined);
  constructor(readonly tagName: string) {}
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
  append(...children: Element[]): void {
    this.children.push(...children);
  }
}

function setup() {
  const elements: Element[] = [];
  const print = vi.fn();
  const body = new Element('body');
  const head = new Element('head');
  const frameDocument = {
    title: '',
    body,
    head,
    createElement: (tag: string) => {
      const element = new Element(tag);
      elements.push(element);
      return element;
    }
  };
  const frame = Object.assign(new Element('iframe'), { contentDocument: frameDocument, contentWindow: { print } });
  const outer = { body: new Element('body'), createElement: () => frame } as unknown as Document;
  return { outer, frame, frameDocument, elements, print };
}

const content = { title: '<script>title</script>', paragraphs: ['line one\nline two', '<img src=x onerror=alert(1)>'] };

describe('printDocument', () => {
  it('文本格式保留标题、段落与换行', () => {
    expect(printableText(content)).toBe('<script>title</script>\n\nline one\nline two\n\n<img src=x onerror=alert(1)>');
  });

  it('只打印所选内容，所有用户内容写 textContent；结束后释放 iframe', async () => {
    const { outer, frame, frameDocument, elements, print } = setup();
    await printDocument(content, new AbortController().signal, outer);
    expect(frameDocument.title).toBe(content.title);
    expect(elements.filter(e => e.tagName === 'h1' || e.tagName === 'p').map(e => e.textContent)).toEqual([
      content.title,
      ...content.paragraphs
    ]);
    expect(elements.some(e => e.tagName === 'script')).toBe(false);
    expect(frame.attributes.get('sandbox')).toBe('allow-same-origin allow-modals');
    expect(print).toHaveBeenCalledTimes(1);
    expect(frame.remove).toHaveBeenCalledTimes(1);
  });

  it('图片成功解码后才打印，并保留准确名称', async () => {
    const { outer, elements, print } = setup();
    await printDocument(
      { title: 'Photo', paragraphs: [], image: { url: 'data:image/png;base64,AA==', alt: 'Actual photo' } },
      new AbortController().signal,
      outer
    );
    const image = elements.find(e => e.tagName === 'img');
    expect(image?.src).toBe('data:image/png;base64,AA==');
    expect(image?.alt).toBe('Actual photo');
    expect(image?.decode).toHaveBeenCalledTimes(1);
    expect(print).toHaveBeenCalledTimes(1);
  });

  it('打印抛错也清理资源，不吞异常', async () => {
    const { outer, frame, print } = setup();
    print.mockImplementation(() => {
      throw new Error('Print denied');
    });
    await expect(printDocument(content, new AbortController().signal, outer)).rejects.toThrow('Print denied');
    expect(frame.remove).toHaveBeenCalledTimes(1);
  });

  it('图片解码失败不打印且清理资源', async () => {
    const { outer, frame, frameDocument, print } = setup();
    const original = frameDocument.createElement;
    frameDocument.createElement = tag => {
      const element = original(tag);
      if (tag === 'img') element.decode.mockRejectedValue(new Error('Bad image'));
      return element;
    };
    await expect(
      printDocument({ ...content, image: { url: 'bad', alt: 'bad' } }, new AbortController().signal, outer)
    ).rejects.toThrow('Bad image');
    expect(print).not.toHaveBeenCalled();
    expect(frame.remove).toHaveBeenCalledTimes(1);
  });

  it('关闭窗口时移除正在解码的打印文档，迟到结果不得打开打印', async () => {
    const { outer, frame, frameDocument, print } = setup();
    const controller = new AbortController();
    let decoded!: () => void;
    const original = frameDocument.createElement;
    frameDocument.createElement = tag => {
      const element = original(tag);
      if (tag === 'img')
        element.decode.mockImplementation(
          () =>
            new Promise<void>(resolve => {
              decoded = resolve;
            })
        );
      return element;
    };
    const pending = printDocument({ ...content, image: { url: 'image', alt: 'image' } }, controller.signal, outer);
    controller.abort();
    expect(frame.remove).toHaveBeenCalled();
    decoded();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(print).not.toHaveBeenCalled();
  });

  it('已取消或缺少打印文档时拒绝操作并释放资源', async () => {
    const { outer, frame } = setup();
    const controller = new AbortController();
    controller.abort();
    await expect(printDocument(content, controller.signal, outer)).rejects.toMatchObject({ name: 'AbortError' });
    expect(frame.remove).not.toHaveBeenCalled();
    Object.assign(frame, { contentDocument: null });
    await expect(printDocument(content, new AbortController().signal, outer)).rejects.toThrow(
      'Print document is unavailable'
    );
    expect(frame.remove).toHaveBeenCalledTimes(1);
  });

  it('浏览器未提供打印窗口时拒绝操作', async () => {
    const { outer, frame } = setup();
    Object.assign(frame, { contentWindow: null });
    await expect(printDocument(content, new AbortController().signal, outer)).rejects.toThrow(
      'Print document is unavailable'
    );
    expect(frame.remove).toHaveBeenCalledTimes(1);
  });
});
