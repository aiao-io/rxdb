import { isRecord } from './payload.js';
import type { OrbitValue } from './types.js';

// 一个 UTF-16 单元在外层 JSON 最多编码为 6 字节。给信封和实例 ID 留出空间。
const PART = 96 * 1024;
const MAX = 40 * 1024 * 1024;
type Port = (frame: OrbitValue) => Promise<OrbitValue>;

function encoded(value: unknown): string {
  const text = JSON.stringify(value);
  if (!text || text.length > MAX) throw new Error('工作区传输超限');
  return text;
}

/** 按窗口串行传输一次逻辑调用，同一次保存的各片段在宿主一起提交。 */
export function workspaceSender(send: Port): (value: unknown) => Promise<OrbitValue> {
  let queue: Promise<unknown> = Promise.resolve();
  async function transfer(value: unknown): Promise<OrbitValue> {
    const text = encoded(value);
    const id = crypto.randomUUID();
    let reply: OrbitValue = null;
    for (let offset = 0; offset < text.length; offset += PART) {
      const part = text.slice(offset, offset + PART);
      reply = await send({ id, offset, part, last: offset + part.length === text.length });
    }
    let result = '';
    for (;;) {
      if (!isRecord(reply) || typeof reply['part'] !== 'string' || typeof reply['last'] !== 'boolean')
        throw new Error('工作区响应分片无效');
      result += reply['part'];
      if (result.length > MAX || !reply['part'].length) throw new Error('工作区响应大小无效');
      if (reply['last']) return JSON.parse(result) as OrbitValue;
      reply = await send({ id, offset: result.length });
    }
  }
  return value => {
    const current = queue.then(() => transfer(value));
    queue = current.catch(() => undefined);
    return current;
  };
}

/** 每个 Orbit 实例只保留一份有界的传输缓冲，重试或销毁实例时释放。 */
export function workspaceReceiver(execute: (value: unknown) => Promise<unknown>): Port {
  let active = '';
  let input = '';
  let output = '';
  let cursor = 0;
  let executing = false;
  const take = (): OrbitValue => {
    const part = output.slice(cursor, cursor + PART);
    cursor += part.length;
    const last = cursor === output.length;
    if (last) {
      active = '';
      output = '';
    }
    return { part, last };
  };
  return async frame => {
    if (!isRecord(frame) || typeof frame['id'] !== 'string' || frame['id'].length > 64 || !frame['id'] || executing)
      throw new Error('工作区传输无效或正忙');
    const { id, part, offset, last } = frame;
    if (part === undefined) {
      if (active !== id || !output || offset !== cursor) throw new Error('工作区响应位置无效');
      return take();
    }
    if (typeof part !== 'string' || !part.length || part.length > PART || typeof last !== 'boolean')
      throw new Error('工作区请求分片无效');
    if (offset === 0) {
      active = id;
      input = '';
      output = '';
    }
    if (id !== active || offset !== input.length || input.length + part.length > MAX || output)
      throw new Error('工作区请求位置无效');
    input += part;
    if (!last) return null;
    executing = true;
    try {
      const request: unknown = JSON.parse(input);
      input = '';
      output = encoded(await execute(request));
      cursor = 0;
      return take();
    } finally {
      executing = false;
    }
  };
}
