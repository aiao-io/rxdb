import { describe, expect, it, vi } from 'vitest';
import { OrbitError } from '../errors.js';
import { copyValue } from '../payload.js';
import type { OrbitValue } from '../types.js';
import type { WorkspaceExecute, WorkspacePhase, WorkspacePort } from '../workspace-transfer.js';
import {
  WORKSPACE_MAX,
  WORKSPACE_PART,
  WorkspaceTransferError,
  workspaceReceiver,
  workspaceSender
} from '../workspace-transfer.js';

const idle = () => new AbortController().signal;
const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0));

/** 配合取消的宿主操作：挂起，直到信号终止才以信号的原因拒绝。 */
const hang: WorkspaceExecute = (_value, signal) =>
  new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });

/** 把接收方接到发送方的另一端：分片经 JSON 复制往返，和真实的 RPC 一样；记下每个分片和它所处的阶段。 */
function link(execute: WorkspaceExecute, lifetime: AbortSignal = idle()) {
  const receive = workspaceReceiver(execute, lifetime);
  const sent: { frame: OrbitValue; phase: WorkspacePhase }[] = [];
  const send: WorkspacePort = async (frame, phase) => {
    sent.push({ frame: copyValue(frame), phase });
    return copyValue(await receive(copyValue(frame), idle()));
  };
  return { receive, send, sent, transfer: workspaceSender() };
}

/** 上传分片的线上形态。 */
const chunk = (id: string, offset: number, part: string, last: boolean) => ({ id, offset, part, last });

/** 序列化成 JSON 文本后恰好 `length` 个字符的字符串值（两个引号占 2 个）。 */
const jsonOf = (length: number, fill = 'x') => fill.repeat(length - 2);

const refused = (code: 'BUSY' | 'INVALID_ARGUMENT') =>
  expect.objectContaining({ name: 'WorkspaceTransferError', code });

describe('工作区分块会话：发送方', () => {
  it('超过单条消息的请求和结果各只执行一次，两个调用保持顺序', async () => {
    const execute = vi.fn(async (value: unknown) => ({ source: value }));
    const { send, transfer } = link(execute);
    const text = '保存 💾 \\"'.repeat(160000);
    expect(await Promise.all([transfer({ text }, send), transfer(2, send)])).toEqual([
      { source: { text } },
      { source: 2 }
    ]);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('告诉传输函数每个分片的阶段：上传、最后一个上传分片触发执行、其余响应分片是取回', async () => {
    const { send, sent, transfer } = link(async () => 'y'.repeat(WORKSPACE_PART * 2));
    await transfer('x'.repeat(WORKSPACE_PART * 2), send);
    expect(sent.map(({ phase }) => phase)).toEqual(['upload', 'upload', 'execute', 'fetch', 'fetch']);
    const [first, , third, fourth] = sent.map(({ frame }) => frame as Record<string, unknown>);
    expect(first).toMatchObject({ offset: 0, last: false });
    expect(third).toMatchObject({ last: true });
    expect(fourth).toEqual({ id: first!['id'], offset: WORKSPACE_PART });
  });

  it('同一个发送队列里的并发调用不会交错：每个调用的分片连续，且按调用顺序执行', async () => {
    const order: string[] = [];
    const { send, sent, transfer } = link(async value => {
      order.push(String((value as { name: string }).name));
      await flush();
      return null;
    });
    const big = 'x'.repeat(WORKSPACE_PART * 2);
    await Promise.all([
      transfer({ name: 'a', big }, send),
      transfer({ name: 'b' }, send),
      transfer({ name: 'c', big }, send)
    ]);
    expect(order).toEqual(['a', 'b', 'c']);
    const ids = sent.map(({ frame }) => (frame as { id: string }).id);
    expect(ids.filter((id, index) => id !== ids[index - 1])).toHaveLength(3);
  });

  it('一次传输失败不影响队列里的下一次', async () => {
    const { send, transfer } = link(async value => {
      if (value === 'boom') throw new Error('宿主出错');
      return value;
    });
    const results = await Promise.allSettled([transfer('boom', send), transfer('after', send)]);
    expect(results.map(result => result.status)).toEqual(['rejected', 'fulfilled']);
    expect(results[1]).toMatchObject({ value: 'after' });
  });

  it('请求不是 JSON 值或超过上限：发出之前就是 INVALID_ARGUMENT，什么也没发', async () => {
    const send = vi.fn<WorkspacePort>();
    const transfer = workspaceSender();
    const cyclic: Record<string, unknown> = {};
    cyclic['self'] = cyclic;
    for (const value of [undefined, () => 1, cyclic, 10n, jsonOf(WORKSPACE_MAX + 1)])
      await expect(transfer(value, send)).rejects.toEqual(refused('INVALID_ARGUMENT'));
    expect(send).not.toHaveBeenCalled();
  });

  it('请求与响应恰好等于传输上限放行', async () => {
    const edge = jsonOf(WORKSPACE_MAX);
    const execute = vi.fn(async (value: unknown) => value);
    const { send, transfer } = link(execute);
    expect(await transfer(edge, send)).toBe(edge);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  const unreadable: [string, OrbitValue][] = [
    ['没有响应分片', null],
    ['缺 last', { part: '1' }],
    ['part 不是文字', { part: 1, last: true }],
    ['空分片', { part: '', last: false }],
    ['不是 JSON', { part: '{', last: true }],
    ['累计超过传输上限', { part: 'x'.repeat(WORKSPACE_PART), last: false }]
  ];
  it.each(unreadable)('读不懂宿主的应答（%s）：INVALID_PAYLOAD', async (_name, reply) => {
    await expect(workspaceSender()(null, async () => reply)).rejects.toEqual(
      expect.objectContaining({ name: 'OrbitError', code: 'INVALID_PAYLOAD' })
    );
  });

  it('传输函数抛出的错误原样抛给调用方', async () => {
    const failure = new OrbitError('TIMEOUT', '请求超时');
    await expect(workspaceSender()(null, () => Promise.reject(failure))).rejects.toBe(failure);
  });
});

describe('工作区分块会话：接收方', () => {
  it('拒绝缺失的前序分片，下一次独立请求仍可执行', async () => {
    const execute = vi.fn(async () => 'ok');
    const { receive, send, transfer } = link(execute);
    await expect(receive(chunk('a', 4, 'null', true), idle())).rejects.toEqual(refused('INVALID_ARGUMENT'));
    expect(execute).not.toHaveBeenCalled();
    expect(await transfer(null, send)).toBe('ok');
  });

  it.each([
    ['不是对象', null],
    ['数组', []],
    ['缺 id', { offset: 0, part: 'null', last: true }],
    ['id 为空', chunk('', 0, 'null', true)],
    ['id 太长', chunk('x'.repeat(65), 0, 'null', true)],
    ['id 不是文字', { ...chunk('a', 0, 'null', true), id: 1 }],
    ['空分片', chunk('a', 0, '', true)],
    ['part 不是文字', { id: 'a', offset: 0, part: 1, last: true }],
    ['分片超过上限', chunk('a', 0, 'x'.repeat(WORKSPACE_PART + 1), false)],
    ['last 不是布尔值', { id: 'a', offset: 0, part: 'null', last: 'yes' }],
    ['没有会话就续传', chunk('a', 4, 'null', true)],
    ['取回时没有会话', { id: 'a', offset: 0 }]
  ])('帧不合法（%s）：INVALID_ARGUMENT，宿主不会被调用', async (_name, frame) => {
    const execute = vi.fn(async () => 'ok');
    const receive = workspaceReceiver(execute, idle());
    await expect(receive(frame as OrbitValue, idle())).rejects.toEqual(refused('INVALID_ARGUMENT'));
    expect(execute).not.toHaveBeenCalled();
  });

  it('请求内容收齐后不是 JSON：INVALID_ARGUMENT，会话释放，下一次传输照常', async () => {
    const execute = vi.fn(async () => 'ok');
    const { receive, send, transfer } = link(execute);
    await expect(receive(chunk('a', 0, '{"broken"', true), idle())).rejects.toEqual(refused('INVALID_ARGUMENT'));
    expect(execute).not.toHaveBeenCalled();
    expect(await transfer(null, send)).toBe('ok');
  });

  it('请求累计超过传输上限：INVALID_ARGUMENT，已收的缓冲立即释放', async () => {
    const execute = vi.fn(async () => 'ok');
    const { receive, send, transfer } = link(execute);
    const part = 'x'.repeat(WORKSPACE_PART);
    let offset = 0;
    while (offset + part.length <= WORKSPACE_MAX) {
      await receive(chunk('a', offset, part, false), idle());
      offset += part.length;
    }
    await expect(receive(chunk('a', offset, part, false), idle())).rejects.toEqual(refused('INVALID_ARGUMENT'));
    /* 会话已释放：同一个 id 接着上传是位置无效，新的传输从头开始则照常。 */
    await expect(receive(chunk('a', offset, 'null', true), idle())).rejects.toEqual(refused('INVALID_ARGUMENT'));
    expect(execute).not.toHaveBeenCalled();
    expect(await transfer(null, send)).toBe('ok');
  });

  it('宿主的结果超过传输上限是宿主的程序错误（不冒充稳定错误码），会话释放', async () => {
    let result: unknown = jsonOf(WORKSPACE_MAX + 1);
    const { send, transfer } = link(async () => result);
    const failure = await transfer(null, send).then(
      () => undefined,
      (error: unknown) => error
    );
    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(WorkspaceTransferError);
    result = 'ok';
    expect(await transfer(null, send)).toBe('ok');
  });

  it.each([
    ['一片', WORKSPACE_PART],
    ['整两片', WORKSPACE_PART * 2],
    ['两片多一个字符', WORKSPACE_PART * 2 + 1],
    ['整三片', WORKSPACE_PART * 3]
  ])('响应长度是 %s：不多出空分片，也不少取', async (_name, length) => {
    const value = jsonOf(length, '响');
    const { send, sent, transfer } = link(async () => value);
    expect(await transfer(null, send)).toBe(value);
    expect(sent.filter(({ phase }) => phase === 'fetch')).toHaveLength(Math.ceil(length / WORKSPACE_PART) - 1);
  });

  it('请求与响应里的代理对被分片边界切开：重新拼回完整文字', async () => {
    /* JSON 文本的第 0 个字符是引号：补 PART - 2 个字符，高代理在 PART - 1，低代理落到下一片开头；第二个表情同理切在第二个边界上。 */
    const value = 'a'.repeat(WORKSPACE_PART - 2) + '💾' + 'b'.repeat(WORKSPACE_PART - 2) + '💾';
    const seen = vi.fn();
    const { send, sent, transfer } = link(async received => {
      seen(received);
      return received;
    });
    expect(await transfer(value, send)).toBe(value);
    expect(seen).toHaveBeenCalledWith(value);
    const parts = sent.map(({ frame }) => (frame as { part?: string }).part ?? '');
    for (const boundary of [0, 1]) {
      expect(parts[boundary]!.at(-1)).toBe('\ud83d');
      expect(parts[boundary + 1]!.at(0)).toBe('\udcbe');
    }
  });

  it('宿主执行期间任何分片都是 BUSY，不动当前会话；执行取消后立即空闲', async () => {
    const execute = vi.fn<WorkspaceExecute>(hang);
    const receive = workspaceReceiver(execute, idle());
    const rpc = new AbortController();
    const first = receive(chunk('a', 0, 'null', true), rpc.signal);
    first.catch(() => undefined);
    await flush();
    for (const frame of [chunk('b', 0, 'null', true), chunk('a', 0, 'null', false), { id: 'a', offset: 0 }])
      await expect(receive(frame, idle())).rejects.toEqual(refused('BUSY'));
    expect(execute).toHaveBeenCalledTimes(1);
    rpc.abort(new Error('应用取消'));
    await expect(first).rejects.toThrow('应用取消');
    execute.mockResolvedValueOnce('ok');
    expect(await workspaceSender()(null, async frame => receive(frame, idle()))).toBe('ok');
  });

  it('取消之后释放会话，重试能成功；不看信号的宿主操作晚到的结果无人认领，不会混进新会话', async () => {
    const late = Promise.withResolvers<unknown>();
    const underlying = vi.fn(async (value: unknown) => (value === 'first' ? late.promise : 'fresh'));
    /* 与 serveDesktop 一样：宿主操作本身不看信号，execute 在信号终止时先结束。 */
    const execute: WorkspaceExecute = (value, signal) =>
      Promise.race([
        underlying(value),
        new Promise<never>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        })
      ]);
    const { receive, send, transfer } = link(execute);
    const rpc = new AbortController();
    const first = receive(chunk('a', 0, '"first"', true), rpc.signal);
    first.catch(() => undefined);
    await flush();
    rpc.abort();
    await expect(first).rejects.toBeDefined();
    expect(await transfer('second', send)).toBe('fresh');
    late.resolve('stale');
    await flush();
    expect(await transfer('third', send)).toBe('fresh');
    expect(underlying.mock.calls.map(([value]) => value)).toEqual(['first', 'second', 'third']);
  });

  it('宿主执行抛错：原样抛出，会话释放，下一次传输不受影响', async () => {
    const failure = new Error('宿主出错');
    const execute = vi.fn(async (value: unknown) => {
      if (value === 'boom') throw failure;
      return value;
    });
    const { receive, send, transfer } = link(execute);
    await expect(transfer('boom', send)).rejects.toThrow('宿主出错');
    /* 失败之后同一个 id 取回响应也不行：没有半截的结果留着。 */
    await expect(receive({ id: 'a', offset: 0 }, idle())).rejects.toEqual(refused('INVALID_ARGUMENT'));
    expect(await transfer('fine', send)).toBe('fine');
  });

  it('重放旧 id：完成之后旧会话的续传与取回都被拒绝；从 offset 0 重来是一次新的传输', async () => {
    const execute = vi.fn(async (value: unknown) => value);
    const { receive } = link(execute);
    const text = JSON.stringify('x'.repeat(WORKSPACE_PART));
    expect((await receive(chunk('a', 0, text.slice(0, 10), false), idle())) as unknown).toBeNull();
    const done = await receive(chunk('a', 10, text.slice(10), true), idle());
    expect(done).toMatchObject({ last: false });
    const fetched = await receive({ id: 'a', offset: WORKSPACE_PART }, idle());
    expect(fetched).toMatchObject({ last: true });
    await expect(receive({ id: 'a', offset: WORKSPACE_PART }, idle())).rejects.toEqual(refused('INVALID_ARGUMENT'));
    await expect(receive(chunk('a', 10, text.slice(10), true), idle())).rejects.toEqual(refused('INVALID_ARGUMENT'));
    expect(execute).toHaveBeenCalledTimes(1);
    expect(await receive(chunk('a', 0, '"again"', true), idle())).toMatchObject({ last: true });
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('另一个 id 的续传不属于当前会话：被拒绝，当前会话不受影响', async () => {
    const execute = vi.fn(async (value: unknown) => value);
    const { receive } = link(execute);
    await receive(chunk('a', 0, '"he', false), idle());
    await expect(receive(chunk('b', 3, 'llo"', true), idle())).rejects.toEqual(refused('INVALID_ARGUMENT'));
    expect(await receive(chunk('a', 3, 'llo"', true), idle())).toMatchObject({ part: '"hello"', last: true });
  });

  it('重试从 offset 0 重新开始会释放上一次没传完的缓冲，旧 id 的后续分片被拒绝', async () => {
    const execute = vi.fn(async (value: unknown) => value);
    const { receive } = link(execute);
    await receive(chunk('old', 0, '"par', false), idle());
    expect((await receive(chunk('new', 0, '"x"', true), idle())) as unknown).toMatchObject({ part: '"x"' });
    await expect(receive(chunk('old', 4, 'tial"', true), idle())).rejects.toEqual(refused('INVALID_ARGUMENT'));
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('响应只取了一半时新的传输开始：旧会话的取回被拒绝', async () => {
    const receive = workspaceReceiver(async () => 'y'.repeat(WORKSPACE_PART * 2), idle());
    const first = await receive(chunk('a', 0, 'null', true), idle());
    expect(first).toMatchObject({ last: false });
    await receive(chunk('b', 0, 'null', false), idle());
    await expect(receive({ id: 'a', offset: WORKSPACE_PART }, idle())).rejects.toEqual(refused('INVALID_ARGUMENT'));
  });

  it('传输中途 lifetime 终止（服务解绑、实例销毁）：已收的请求和没取完的响应都释放', async () => {
    const lifetime = new AbortController();
    const execute = vi.fn(async () => 'y'.repeat(WORKSPACE_PART * 2));
    const receive = workspaceReceiver(execute, lifetime.signal);
    await receive(chunk('a', 0, '"par', false), idle());
    lifetime.abort();
    await expect(receive(chunk('a', 4, 'tial"', true), idle())).rejects.toEqual(refused('INVALID_ARGUMENT'));
    expect(execute).not.toHaveBeenCalled();

    const next = new AbortController();
    const another = workspaceReceiver(execute, next.signal);
    expect(await another(chunk('b', 0, 'null', true), idle())).toMatchObject({ last: false });
    next.abort();
    await expect(another({ id: 'b', offset: WORKSPACE_PART }, idle())).rejects.toEqual(refused('INVALID_ARGUMENT'));
  });
});
