import { Window } from 'happy-dom';
import { describe, expect, it, vi } from 'vitest';

import { fetchReader, fetchWikiArticle } from './safari-network';

describe('Safari 网络正文', () => {
  it('维基显示标题按 HTML 解析，不保留实体或未闭合标签', async () => {
    vi.stubGlobal('DOMParser', new Window().DOMParser);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({ json: async () => ({ titles: { display: '<b>A &amp; B</b><script' } }) })
        .mockResolvedValueOnce({ json: async () => ({}) })
    );
    expect((await fetchWikiArticle('Example')).title).toBe('A & B');
  });

  it('阅读器按可见正文长度判断空文章，HTML 实体不充当额外字符', async () => {
    vi.stubGlobal('DOMParser', new Window().DOMParser);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => `Title: Empty
Markdown Content:
${'&'.repeat(10)}`
      })
    );
    await expect(fetchReader('example.com')).rejects.toThrow('empty');
  });

  it('阅读器保留足够长的正文和标题', async () => {
    vi.stubGlobal('DOMParser', new Window().DOMParser);
    const body = 'An article with enough readable text to remain available to the reader.';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => `Title: Example
Markdown Content:
${body}`
      })
    );
    await expect(fetchReader('example.com')).resolves.toEqual({ title: 'Example', html: `<p>${body}</p>` });
  });
});
