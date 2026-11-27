import { Window } from 'happy-dom';
import { describe, expect, it, vi } from 'vitest';

import { searchCommons } from './commons-search';

describe('searchCommons', () => {
  it('署名按 HTML 解析，解码实体并丢弃未闭合标签', async () => {
    vi.stubGlobal('DOMParser', new Window().DOMParser);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          query: {
            pages: {
              '1': {
                title: 'File:Example_photo.jpg',
                imageinfo: [
                  {
                    thumburl: '/photo.jpg',
                    extmetadata: {
                      Artist: { value: '  <a>A &amp; B</a><script' }
                    }
                  }
                ]
              }
            }
          }
        })
      })
    );
    await expect(searchCommons('example')).resolves.toEqual([
      { title: 'Example photo', credit: 'A & B', thumb: '/photo.jpg' }
    ]);
  });
});
