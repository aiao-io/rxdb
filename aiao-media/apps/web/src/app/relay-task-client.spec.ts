import { createRelayTaskToken, relayResultKey, sealRelayResult } from '@aiao-media/api-contracts';
import { Blob as NodeBlob } from 'node:buffer';
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteRelayTask, relayTickets, runRelayTask, type RelayRun, type RelayTicket } from './relay-task-client';

const id = '10000000-0000-4000-8000-000000000021';
function png(width = 1024, height = 1024) {
  const bytes = new Uint8Array(33),
    data = new DataView(bytes.buffer);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  data.setUint32(8, 13);
  bytes.set([73, 72, 68, 82], 12);
  data.setUint32(16, width);
  data.setUint32(20, height);
  return bytes;
}
const encoded = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const view = (status: string, upstreamStatus: number | null = null) =>
  Response.json({ status, upstreamStatus, updatedAt: '2026-11-13T00:00:00.000Z' });
async function sealed(token: string, data: unknown = { data: [{ b64_json: encoded(png()) }] }) {
  return new Response(
    await sealRelayResult(await relayResultKey(token, id, 'encrypt'), new TextEncoder().encode(JSON.stringify(data)))
  );
}
function rig(options: Partial<RelayRun> = {}) {
  const ticket: RelayTicket = { token: createRelayTaskToken(), accepted: false, protocol: 'openai' };
  const accepted = vi.fn(async () => undefined);
  const run: RelayRun = {
    id,
    ratio: 'square',
    signal: new AbortController().signal,
    dispatch: { modelId: 'standard', accessToken: 'platform-session', prompt: '测试图片' },
    accepted,
    ...options,
    ticket: options.ticket ?? ticket
  };
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    if (init?.method === 'PUT') return view('dispatched');
    if (String(url).includes('?wait=')) return view('received', 200);
    if (String(url).endsWith('/result')) return sealed(run.ticket.token);
    return new Response(null, { status: 204 });
  });
  return { run, ticket: run.ticket, accepted };
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

describe('平台任务接单与确认', () => {
  it('只发送平台会话和模型标识，解密验证后确认扣费，不发送上游配置', async () => {
    const t = rig(),
      blob = await runRelayTask(t.run);
    expect(blob.type).toBe('image/png');
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(png());
    expect(t.accepted).toHaveBeenCalledTimes(1);
    expect(calls()).toEqual([
      `PUT /api/relay/tasks/${id}`,
      `GET /api/relay/tasks/${id}?wait=25`,
      `GET /api/relay/tasks/${id}/result`,
      `POST /api/relay/tasks/${id}/confirm`
    ]);
    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect(init).toMatchObject({
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer'
    });
    expect(init?.headers).toEqual({
      'x-relay-task-token': t.ticket.token,
      'content-type': 'application/json',
      authorization: 'Bearer platform-session'
    });
    expect(JSON.parse(String(init?.body))).toEqual({ model: 'standard', prompt: '测试图片', n: 1, size: '1024x1024' });
    for (const [, later] of vi.mocked(fetch).mock.calls.slice(1)) {
      expect(later?.headers).toEqual({ 'x-relay-task-token': t.ticket.token });
      expect(later?.body).toBeUndefined();
    }
  });
  it.each([
    ['square', '1024x1024'],
    ['landscape', '1536x1024'],
    ['portrait', '1024x1536']
  ] as const)('单张 %s 只使用平台参数', async (ratio, size) => {
    const t = rig({ ratio });
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({}, { status: 402 }));
    await expect(runRelayTask(t.run)).rejects.toMatchObject({ rejected: true });
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))).toEqual({
      model: 'standard',
      prompt: '测试图片',
      n: 1,
      size
    });
  });
  it('接单应答丢失后只用原标识重试，不生成新任务', async () => {
    vi.useFakeTimers();
    const t = rig();
    vi.mocked(fetch)
      .mockRejectedValueOnce(new TypeError('network'))
      .mockResolvedValueOnce(new Response('busy', { status: 502 }));
    const pending = runRelayTask(t.run);
    await vi.advanceTimersByTimeAsync(4000);
    await pending;
    expect(calls().slice(0, 3)).toEqual(Array(3).fill(`PUT /api/relay/tasks/${id}`));
  });
  it.each([401, 402, 403, 503])('接单 HTTP %i 不扣费，明确解释账号、积分或服务问题', async status => {
    const t = rig();
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({}, { status }));
    await expect(runRelayTask(t.run)).rejects.toMatchObject({ rejected: true });
    expect(t.accepted).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('上游仍处理中时持续查询，只在图片校验完成后确认', async () => {
    const t = rig();
    vi.mocked(fetch).mockResolvedValueOnce(view('dispatched')).mockResolvedValueOnce(view('dispatched'));
    await runRelayTask(t.run);
    expect(calls().filter(call => call.includes('?wait='))).toHaveLength(2);
  });
  it('确认应答丢失只重试确认，返回图片前不重发生成', async () => {
    const t = rig();
    let confirmations = 0;
    const original = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation((url, init) => {
      if (String(url).endsWith('/confirm') && ++confirmations === 1) return Promise.reject(new Error('lost receipt'));
      return original(url, init);
    });
    await runRelayTask(t.run);
    expect(confirmations).toBe(2);
    expect(calls().filter(call => call.startsWith('PUT'))).toHaveLength(1);
    expect(calls().some(call => call.includes('/discard'))).toBe(false);
  });
  it('确认服务不可用时保留可续接状态，刷新后只查询并确认原图', async () => {
    const t = rig();
    const original = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation((url, init) =>
      String(url).endsWith('/confirm') ? Promise.resolve(new Response(null, { status: 503 })) : original(url, init)
    );
    await expect(runRelayTask(t.run)).rejects.toMatchObject({ resumable: true, rejected: false });
    expect(calls().some(call => /discard|DELETE/.test(call))).toBe(false);
    vi.mocked(fetch).mockImplementation(original);
    await runRelayTask({ ...t.run, dispatch: null, ticket: { ...t.ticket, accepted: true } });
    expect(calls().filter(call => call.startsWith('PUT'))).toHaveLength(1);
  });
});

describe('刷新续接与图片错误', () => {
  it('未记录回执时声明放弃，已接单则继续原任务', async () => {
    const t = rig({ dispatch: null });
    vi.mocked(fetch).mockResolvedValueOnce(view('dispatched'));
    await runRelayTask(t.run);
    expect(calls()[0]).toBe(`POST /api/relay/tasks/${id}/abandon`);
    expect(t.accepted).toHaveBeenCalledTimes(1);
  });
  it('未接单的放弃解除本机锁定，不调用生成或扣费', async () => {
    const t = rig({ dispatch: null });
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 404 }));
    await expect(runRelayTask(t.run)).rejects.toMatchObject({ rejected: true });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('旧设备令牌继续解析原始协议，已记录回执的任务只查询和确认', async () => {
    const ticket: RelayTicket = {
      token: createRelayTaskToken(),
      accepted: true,
      baseUrl: 'https://provider.example/v1'
    };
    const t = rig({ ticket, dispatch: null });
    await runRelayTask(t.run);
    expect(calls()).toEqual([
      `GET /api/relay/tasks/${id}?wait=25`,
      `GET /api/relay/tasks/${id}/result`,
      `POST /api/relay/tasks/${id}/confirm`
    ]);
  });
  it('MiniMax 原始响应在本机按协议解析，不需要供应商地址', async () => {
    const t = rig({ ticket: { token: createRelayTaskToken(), accepted: true, protocol: 'minimax' }, dispatch: null });
    vi.mocked(fetch)
      .mockResolvedValueOnce(view('received'))
      .mockResolvedValueOnce(
        await sealed(t.ticket.token, { base_resp: { status_code: 0 }, data: { image_base64: [encoded(png())] } })
      );
    expect((await runRelayTask(t.run)).type).toBe('image/png');
    expect(calls().at(-1)).toContain('/confirm');
  });
  it.each(['rejected', 'needs_review'])('服务端 %s 不确认、不重发', async status => {
    const t = rig({ dispatch: null, ticket: { token: createRelayTaskToken(), accepted: true, protocol: 'openai' } });
    vi.mocked(fetch).mockResolvedValueOnce(view(status, 503));
    await expect(runRelayTask(t.run)).rejects.toMatchObject({ rejected: status === 'rejected' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('过期任务保持待核对，不生成新的图片', async () => {
    const t = rig({ dispatch: null, ticket: { token: createRelayTaskToken(), accepted: true, protocol: 'openai' } });
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 404 }));
    await expect(runRelayTask(t.run)).rejects.toMatchObject({ rejected: false });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each(['image', 'decryption', 'json'])('本机 %s 校验失败时释放预占，不确认扣费', async kind => {
    const t = rig();
    vi.mocked(fetch).mockResolvedValueOnce(view('received')).mockResolvedValueOnce(view('received'));
    vi.mocked(fetch).mockResolvedValueOnce(
      await sealed(
        kind === 'decryption' ? createRelayTaskToken() : t.ticket.token,
        kind === 'image' ? { data: [{ b64_json: encoded(png(1536, 1024)) }] } : 'invalid-json-envelope'
      )
    );
    await expect(runRelayTask(t.run)).rejects.toMatchObject({ rejected: false });
    expect(calls().at(-1)).toContain('/discard');
    expect(calls().some(call => call.includes('/confirm'))).toBe(false);
  });
  it('页面关闭立即停止等待，服务端任务留待刷新续接', async () => {
    const controller = new AbortController(),
      t = rig({ signal: controller.signal });
    vi.mocked(fetch).mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) =>
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        )
    );
    const pending = runRelayTask(t.run);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('设备私有任务令牌', () => {
  const ticket = { token: createRelayTaskToken(), accepted: false, protocol: 'openai' };
  it('同时读取新协议与旧本机地址记录，不改写原数据', () => {
    const old = { token: createRelayTaskToken(), accepted: true, baseUrl: 'https://api.minimax.cn/v1' };
    expect(relayTickets(null)).toEqual({});
    expect(relayTickets(JSON.stringify({ [id]: ticket }))).toEqual({ [id]: ticket });
    expect(relayTickets(JSON.stringify({ [id]: old }))).toEqual({ [id]: old });
  });
  it.each([
    [],
    { bad: ticket },
    { [id]: { ...ticket, token: 'bad' } },
    { [id]: { ...ticket, accepted: 'yes' } },
    { [id]: { ...ticket, protocol: 'unknown' } },
    { [id]: { ...ticket, key: 'private' } },
    { [id]: { ...ticket, baseUrl: 'https://private.test' } },
    { [id]: { token: ticket.token, accepted: true, baseUrl: 'http://private.test' } }
  ])('拒绝损坏或混入私密字段的记录 %j', value => {
    expect(() => relayTickets(JSON.stringify(value))).toThrow('任务记录');
  });
  it.each([204, 404])('删除 HTTP %i 才能忘记令牌', async status => {
    const t = rig();
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status }));
    await deleteRelayTask(id, t.ticket, new AbortController().signal);
    expect(calls()).toEqual([`DELETE /api/relay/tasks/${id}`]);
  });
  it('删除失败保留令牌，以便下次重试', async () => {
    const t = rig();
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 409 }));
    await expect(deleteRelayTask(id, t.ticket, new AbortController().signal)).rejects.toThrow('409');
  });
});
