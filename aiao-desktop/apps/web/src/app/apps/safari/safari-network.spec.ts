import { Window } from 'happy-dom';
import { describe, expect, it, vi } from 'vitest';

import { fetchWikiArticle } from './safari-network';

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
});
