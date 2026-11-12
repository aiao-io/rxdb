import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchRemoteSqlSchema } from './remote-schema-api';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('fetchRemoteSqlSchema', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('命中 remote-schema 端点并返回 schema', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const remote = { tables: [{ name: 'users', columns: [], foreignKeys: [], indexes: [] }] };
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, remote }));

    await expect(fetchRemoteSqlSchema()).resolves.toEqual(remote);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/bff/model-designer/sql/remote-schema');
  });

  it('API 未配置数据源（503）时抛出 message', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(
      jsonResponse({ ok: false, error: 'schema_reader_unavailable', message: 'No SchemaReader configured' }, 503)
    );

    await expect(fetchRemoteSqlSchema()).rejects.toThrow('No SchemaReader configured');
  });

  it('响应体非 JSON 时用状态码兜底', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(new Response('<html>502</html>', { status: 502 }));

    await expect(fetchRemoteSqlSchema()).rejects.toThrow('HTTP 502');
  });
});
