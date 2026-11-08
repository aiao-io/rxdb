import { Blob as NodeBlob } from 'node:buffer';
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRelayTaskToken, relayResultKey, sealRelayResult } from '@aiao-media/api-contracts';
import type { LocalProvider } from './local-provider';
import { deleteRelayTask, relayTickets, runRelayTask, type RelayRun, type RelayTicket } from './relay-task-client';

const id = '10000000-0000-4000-8000-000000000021';
const provider: LocalProvider = {
  id: '10000000-0000-4000-8000-000000000001',
  name: '代理供应商',
  baseUrl: 'https://provider.example/v1',
  model: 'fixture-model',
  mode: 'proxy',
  rememberKey: false
};
function png(width = 1024, height = 1024) {
  const bytes = new Uint8Array(33);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set([73, 72, 68, 82], 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}
const encoded = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const view = (status: string, upstreamStatus: number | null = null) =>
  Response.json({ status, upstreamStatus, updatedAt: '2026-11-03T00:00:00.000Z' });
async function sealed(token: string, data: unknown = { data: [{ b64_json: encoded(png()) }] }) {
  const key = await relayResultKey(token, id, 'encrypt');
  return new Response(await sealRelayResult(key, new TextEncoder().encode(JSON.stringify(data))));
}
function run(options: Omit<Partial<RelayRun>, 'ticket'> & { ticket?: Partial<RelayTicket> } = {}) {
  const ticket: RelayTicket = {
    token: createRelayTaskToken(),
    accepted: false,
    baseUrl: provider.baseUrl,
    ...options.ticket
  };
  const accepted = vi.fn(async () => undefined);
  const value: RelayRun = {
    id,
    ratio: 'square',
    signal: new AbortController().signal,
    dispatch: { provider, key: 'fixture-key', prompt: '测试图片' },
    accepted,
    ...options,
    ticket
  };
  return { value, ticket, accepted };
}
const calls = () => vi.mocked(fetch).mock.calls.map(([url, init]) => `${init?.method ?? 'GET'} ${String(url)}`);

beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('Blob', NodeBlob);
  vi.stubGlobal('fetch', vi.fn());
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async (blob: Blob) => {
      const data = new DataView(await blob.arrayBuffer());
      return { width: data.getUint32(16), height: data.getUint32(20), close: vi.fn() };
    })
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('dispatching a relay task', () => {
  it('sends the Key and token once, records the receipt, then reads and decrypts the stored result', async () => {
    const { value, ticket, accepted } = run();
    vi.mocked(fetch)
      .mockResolvedValueOnce(view('dispatched'))
      .mockResolvedValueOnce(view('dispatched'))
      .mockResolvedValueOnce(view('received', 200))
      .mockResolvedValueOnce(await sealed(ticket.token));
    const blob = await runRelayTask(value);
    expect(blob.type).toBe('image/png');
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(png());
    expect(accepted).toHaveBeenCalledTimes(1);
    expect(calls()).toEqual([
      `PUT /api/relay/tasks/${id}`,
      `GET /api/relay/tasks/${id}?wait=25`,
      `GET /api/relay/tasks/${id}?wait=25`,
      `GET /api/relay/tasks/${id}/result`
    ]);
    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect(init).toMatchObject({
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer'
    });
    expect(init?.headers).toEqual({
      'x-relay-task-token': ticket.token,
      'content-type': 'application/json',
      authorization: 'Bearer fixture-key',
      'x-provider-base': provider.baseUrl
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      model: provider.model,
      prompt: '测试图片',
      n: 1,
      size: '1024x1024',
      quality: 'low',
      output_format: 'png'
    });
    for (const [, later] of vi.mocked(fetch).mock.calls.slice(1)) {
      expect(later?.headers).toEqual({ 'x-relay-task-token': ticket.token });
      expect(later?.body).toBeUndefined();
    }
  });

  it('repeats the same task after a lost or failed receipt, because the relay accepts it only once', async () => {
    vi.useFakeTimers();
    const { value, ticket } = run();
    vi.mocked(fetch)
      .mockRejectedValueOnce(new TypeError('network'))
      .mockResolvedValueOnce(new Response('busy', { status: 502 }))
      .mockResolvedValueOnce(view('received', 200))
      .mockResolvedValueOnce(view('received', 200))
      .mockResolvedValueOnce(await sealed(ticket.token));
    const pending = runRelayTask(value);
    await vi.advanceTimersByTimeAsync(5000);
    await expect(pending).resolves.toBeInstanceOf(NodeBlob);
    expect(calls().slice(0, 3)).toEqual(Array(3).fill(`PUT /api/relay/tasks/${id}`));
  });

  it('sends MiniMax tasks the neutral request; the relay maps it to the native contract', async () => {
    const minimax = { ...provider, baseUrl: 'https://api.minimax.cn/v1', model: 'image-01' };
    vi.mocked(fetch).mockResolvedValue(Response.json({ error: 'stop here' }, { status: 400 }));
    await expect(
      runRelayTask(run({ dispatch: { provider: minimax, key: 'fixture-key', prompt: '测试图片' } }).value)
    ).rejects.toMatchObject({ rejected: true });
    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect(init?.headers).toMatchObject({ 'x-provider-base': minimax.baseUrl });
    expect(JSON.parse(String(init?.body))).toEqual({
      model: 'image-01',
      prompt: '测试图片',
      n: 1,
      size: '1024x1024',
      quality: 'low',
      output_format: 'png'
    });
  });

  it.each([400, 403, 404, 409, 413, 429, 503])(
    'unlocks a definite relay refusal %i without resending',
    async status => {
      vi.mocked(fetch).mockResolvedValue(Response.json({ error: 'private' }, { status }));
      await expect(runRelayTask(run().value)).rejects.toMatchObject({
        rejected: true,
        message: `供应商或代理返回 HTTP ${status}。请核对配置和供应商记录。`
      });
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  );

  it('names a missing relay when the task route is not answered with JSON', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('<!doctype html>', { status: 404, headers: { 'content-type': 'text/html' } })
    );
    await expect(runRelayTask(run().value)).rejects.toMatchObject({
      rejected: true,
      message: expect.stringContaining('/api/relay')
    });
  });

  it('validates the Key and the provider protocol before sending anything', async () => {
    await expect(
      runRelayTask(run({ dispatch: { provider, key: 'with space', prompt: '测试图片' } }).value)
    ).rejects.toMatchObject({ rejected: true });
    await expect(
      runRelayTask(
        run({
          dispatch: {
            provider: { ...provider, baseUrl: 'https://api.minimax.cn/v1', model: 'unsupported' },
            key: 'fixture-key',
            prompt: '测试图片'
          }
        }).value
      )
    ).rejects.toMatchObject({ rejected: true });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('resuming after a reload', () => {
  it('abandons a task the relay never received, so a late request cannot be sent later', async () => {
    const { value, accepted } = run({ dispatch: null });
    vi.mocked(fetch).mockResolvedValue(Response.json({ error: 'Task not found' }, { status: 404 }));
    await expect(runRelayTask(value)).rejects.toMatchObject({
      rejected: true,
      message: expect.stringContaining('没有送达本站')
    });
    expect(calls()).toEqual([`POST /api/relay/tasks/${id}/abandon`]);
    expect(accepted).not.toHaveBeenCalled();
  });

  it('keeps waiting for a task the relay had already accepted', async () => {
    const { value, ticket, accepted } = run({ dispatch: null });
    vi.mocked(fetch)
      .mockResolvedValueOnce(view('dispatched'))
      .mockResolvedValueOnce(view('received', 200))
      .mockResolvedValueOnce(await sealed(ticket.token));
    await runRelayTask(value);
    expect(accepted).toHaveBeenCalledTimes(1);
    expect(calls()[0]).toBe(`POST /api/relay/tasks/${id}/abandon`);
  });

  it('never abandons a task whose receipt was recorded', async () => {
    const { value, ticket } = run({ dispatch: null, ticket: { accepted: true } });
    vi.mocked(fetch)
      .mockResolvedValueOnce(view('received', 200))
      .mockResolvedValueOnce(await sealed(ticket.token));
    await runRelayTask(value);
    expect(calls()).toEqual([`GET /api/relay/tasks/${id}?wait=25`, `GET /api/relay/tasks/${id}/result`]);
  });
});

describe('relay task outcomes', () => {
  it('unlocks a definite provider rejection with its status', async () => {
    vi.mocked(fetch).mockResolvedValue(view('rejected', 401));
    await expect(runRelayTask(run({ ticket: { accepted: true } }).value)).rejects.toMatchObject({
      rejected: true,
      message: '供应商或代理返回 HTTP 401。请核对配置和供应商记录。'
    });
  });

  it('keeps an uncertain provider outcome locked', async () => {
    vi.mocked(fetch).mockResolvedValue(view('needs_review', 502));
    await expect(runRelayTask(run({ ticket: { accepted: true } }).value)).rejects.toMatchObject({
      rejected: false,
      message: expect.stringContaining('不会自动重发')
    });
  });

  it.each([
    ['an expired task', () => [Response.json({ error: 'Task not found' }, { status: 404 })]],
    ['a removed result', () => [view('received', 200), Response.json({ error: 'Result expired' }, { status: 410 })]]
  ])('keeps %s uncertain, because the provider may have charged', async (_name, responses) => {
    for (const response of responses()) vi.mocked(fetch).mockResolvedValueOnce(response);
    await expect(runRelayTask(run({ ticket: { accepted: true } }).value)).rejects.toMatchObject({ rejected: false });
  });

  it('keeps a result sealed for another token uncertain', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(view('received', 200))
      .mockResolvedValueOnce(await sealed(createRelayTaskToken()));
    await expect(runRelayTask(run({ ticket: { accepted: true } }).value)).rejects.toMatchObject({
      rejected: false,
      message: expect.stringContaining('无法解密')
    });
  });

  it('applies the existing image checks to the stored provider response', async () => {
    const { value, ticket } = run({ ratio: 'landscape', ticket: { accepted: true } });
    vi.mocked(fetch)
      .mockResolvedValueOnce(view('received', 200))
      .mockResolvedValueOnce(await sealed(ticket.token));
    await expect(runRelayTask(value)).rejects.toThrow('图片尺寸');
  });

  it('stops waiting when the page goes away and leaves the task to the next visit', async () => {
    const controller = new AbortController();
    vi.mocked(fetch).mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) =>
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        )
    );
    const pending = runRelayTask(run({ signal: controller.signal, ticket: { accepted: true } }).value);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('device-only relay tickets', () => {
  const ticket = { token: createRelayTaskToken(), accepted: false, baseUrl: provider.baseUrl };
  it('reads an empty or valid record', () => {
    expect(relayTickets(null)).toEqual({});
    expect(relayTickets(JSON.stringify({ [id]: ticket }))).toEqual({ [id]: ticket });
  });
  it.each([
    [],
    { invalid: ticket },
    { [id]: { ...ticket, token: 'short' } },
    { [id]: { ...ticket, accepted: 'yes' } },
    { [id]: { ...ticket, baseUrl: 'http://provider.example/v1' } },
    { [id]: { ...ticket, key: 'private' } }
  ])('rejects a malformed record instead of guessing', value => {
    expect(() => relayTickets(JSON.stringify(value))).toThrow('代理任务');
  });
});

describe('releasing a settled relay task', () => {
  const ticket = { token: createRelayTaskToken(), accepted: true, baseUrl: provider.baseUrl };
  it.each([204, 404])('treats HTTP %i as removed', async status => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status }));
    await deleteRelayTask(id, ticket, new AbortController().signal);
    expect(calls()).toEqual([`DELETE /api/relay/tasks/${id}`]);
  });
  it('keeps the ticket when the relay refuses to remove the task', async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ error: 'Task is still running' }, { status: 409 }));
    await expect(deleteRelayTask(id, ticket, new AbortController().signal)).rejects.toThrow('409');
  });
});
