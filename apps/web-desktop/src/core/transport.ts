import { decodeBytes, digest, encodeBytes } from './bytes.js';
import { isRecord } from './catalog.js';
import { requireCondition } from './errors.js';
import { isJson } from './session.js';
import { TRANSFER_CHUNK, TRANSFER_INLINE, TRANSFER_LIMIT } from './transfers.js';
import type { Json } from './types.js';

export class DesktopTransport {
  constructor(private readonly call: (method: string, payload: Json) => Promise<unknown>) {}

  async request(method: string, payload: Json): Promise<Json> {
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    requireCondition(bytes.length <= TRANSFER_LIMIT, 'LIMIT', '请求超过传输上限');
    if (bytes.length <= TRANSFER_INLINE) return this.unwrap(await this.call(method, payload));
    const header = await this.call('transfer.begin', { method, size: bytes.length, sha256: await digest(bytes) });
    requireCondition(isRecord(header) && typeof header['id'] === 'string', 'INVALID', '上传身份无效');
    const id = header['id'];
    try {
      for (let offset = 0; offset < bytes.length; offset += TRANSFER_CHUNK)
        await this.call('transfer.append', {
          id,
          index: offset / TRANSFER_CHUNK,
          chunk: encodeBytes(bytes.subarray(offset, offset + TRANSFER_CHUNK))
        });
      return await this.unwrap(await this.call('transfer.commit', { id }));
    } finally {
      await this.call('transfer.release', { id }).catch(() => undefined);
    }
  }

  private async unwrap(envelope: unknown): Promise<Json> {
    requireCondition(isRecord(envelope), 'INVALID', '响应封装无效');
    if (envelope['type'] === 'inline') {
      requireCondition(isJson(envelope['value']), 'INVALID', '响应不是有效 JSON');
      return envelope['value'];
    }
    const { id, size, sha256 } = envelope;
    requireCondition(
      envelope['type'] === 'download' &&
        typeof id === 'string' &&
        typeof size === 'number' &&
        Number.isSafeInteger(size) &&
        size > 0 &&
        size <= TRANSFER_LIMIT &&
        typeof sha256 === 'string' &&
        /^[a-f0-9]{64}$/.test(sha256),
      'INVALID',
      '下载声明无效'
    );
    try {
      const bytes = new Uint8Array(size);
      for (let offset = 0; offset < size; offset += TRANSFER_CHUNK) {
        const response = await this.call('transfer.download', { id, index: offset / TRANSFER_CHUNK });
        requireCondition(
          isRecord(response) &&
            typeof response['chunk'] === 'string' &&
            response['chunk'].length <= Math.ceil(TRANSFER_CHUNK / 3) * 4,
          'INVALID',
          '下载分块无效'
        );
        const chunk = decodeBytes(response['chunk']);
        requireCondition(chunk.length === Math.min(TRANSFER_CHUNK, size - offset), 'INTEGRITY', '下载分块长度错误');
        bytes.set(chunk, offset);
      }
      requireCondition((await digest(bytes)) === sha256, 'INTEGRITY', '下载校验和不匹配');
      const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      requireCondition(isJson(value), 'INVALID', '下载不是有效 JSON');
      return value;
    } finally {
      await this.call('transfer.release', { id }).catch(() => undefined);
    }
  }
}
