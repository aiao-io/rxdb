import { afterEach, describe, expect, it, vi } from 'vitest';

import { searchPlaces } from './maps-search';

const PLACE = {
  lat: '35.68',
  lon: '139.69',
  name: 'Tokyo',
  display_name: 'Tokyo, Japan',
  boundingbox: ['35', '36', '139', '140']
};

afterEach(() => vi.unstubAllGlobals());

describe('地图地点搜索', () => {
  it('只提交用户查询，传递取消信号并保留合法地点', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => [PLACE] }));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    expect(await searchPlaces('Tokyo & 日本', controller.signal)).toEqual([PLACE]);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('q=Tokyo%20%26%20%E6%97%A5%E6%9C%AC'), {
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });
  });

  it('合法空列表才表示没有结果', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => [] }))
    );
    expect(await searchPlaces('nowhere', new AbortController().signal)).toEqual([]);
  });

  it.each([
    { ok: false, body: [] },
    { ok: true, body: { error: 'busy' } },
    { ok: true, body: [null] },
    { ok: true, body: [{ ...PLACE, lat: 'NaN' }] },
    { ok: true, body: [{ ...PLACE, lon: '190' }] },
    { ok: true, body: [{ ...PLACE, lat: '' }] },
    { ok: true, body: [{ ...PLACE, display_name: '' }] },
    { ok: true, body: [{ ...PLACE, name: 2 }] },
    { ok: true, body: [{ ...PLACE, boundingbox: ['35', '36'] }] },
    { ok: true, body: [{ ...PLACE, boundingbox: ['36', '35', '139', '140'] }] }
  ])('拒绝 HTTP 或数据错误，不能作为空结果：%j', async ({ ok, body }) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok, json: async () => body }))
    );
    await expect(searchPlaces('Tokyo', new AbortController().signal)).rejects.toThrow();
  });

  it('名称和范围可缺省，断网或取消仍向调用方报告失败', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => [{ lat: '0', lon: '0', display_name: 'Equator' }]
    }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await searchPlaces('Equator', new AbortController().signal)).toEqual([
      { lat: '0', lon: '0', display_name: 'Equator' }
    ]);
    fetchMock.mockRejectedValueOnce(new DOMException('Aborted', 'AbortError'));
    await expect(searchPlaces('Equator', new AbortController().signal)).rejects.toMatchObject({ name: 'AbortError' });
  });
});
