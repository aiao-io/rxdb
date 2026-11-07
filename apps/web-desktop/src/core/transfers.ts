import { decodeBytes, digest, encodeBytes } from './bytes.js';
import { isRecord } from './catalog.js';
import { requireCondition } from './errors.js';
import { isJson } from './session.js';
import type { Json } from './types.js';

export const TRANSFER_CHUNK = 128 * 1024;
export const TRANSFER_INLINE = 256 * 1024;
export const TRANSFER_LIMIT = 300 * 1024 * 1024;

const uploadMethods = new Set([
  'files.create',
  'files.write',
  'files.import',
  'backup.validate',
  'backup.restore',
  'storage.set',
  'clipboard.write'
]);
interface Transfer {
  owner: string;
  method: string | null;
  size: number;
  sha256: string;
  touched: number;
  chunks: Uint8Array<ArrayBuffer>[];
  received: number;
}

export class DesktopTransfers {
  private readonly entries = new Map<string, Transfer>();

  get size(): number {
    this.expire();
    return this.entries.size;
  }

  constructor(
    private readonly limit = TRANSFER_LIMIT,
    private readonly now = Date.now
  ) {}

  begin(owner: string, payload: unknown): { id: string } {
    requireCondition(isRecord(payload), 'INVALID', '传输声明须为对象');
    const { method, size, sha256 } = payload;
    requireCondition(typeof method === 'string' && uploadMethods.has(method), 'INVALID', '方法不支持大载荷');
    requireCondition(typeof size === 'number' && Number.isSafeInteger(size) && size > 0, 'INVALID', '传输长度无效');
    requireCondition(typeof sha256 === 'string' && /^[a-f0-9]{64}$/.test(sha256), 'INVALID', '传输校验和无效');
    return { id: this.reserve(owner, method, size, sha256) };
  }

  append(owner: string, payload: unknown): void {
    requireCondition(isRecord(payload), 'INVALID', '分块须为对象');
    const transfer = this.get(owner, payload['id']);
    requireCondition(
      transfer.method !== null && payload['index'] === transfer.chunks.length,
      'INVALID',
      '上传分块顺序无效'
    );
    const chunk = payload['chunk'];
    requireCondition(
      typeof chunk === 'string' && chunk.length <= Math.ceil(TRANSFER_CHUNK / 3) * 4,
      'LIMIT',
      '分块过大'
    );
    const bytes = decodeBytes(chunk);
    requireCondition(
      bytes.length === Math.min(TRANSFER_CHUNK, transfer.size - transfer.received) && bytes.length > 0,
      'INVALID',
      '分块长度无效'
    );
    transfer.chunks.push(bytes);
    transfer.received += bytes.length;
  }

  async collect(owner: string, id: string): Promise<{ method: string; payload: Json }> {
    const transfer = this.get(owner, id);
    requireCondition(transfer.method !== null && transfer.received === transfer.size, 'INVALID', '上传尚未完整');
    this.entries.delete(id);
    const bytes = new Uint8Array(transfer.size);
    let offset = 0;
    for (const chunk of transfer.chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    requireCondition((await digest(bytes)) === transfer.sha256, 'INTEGRITY', '上传校验和不匹配');
    const payload: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    requireCondition(isJson(payload), 'INVALID', '上传不是有效 JSON');
    return { method: transfer.method, payload };
  }

  async wrap(owner: string, value: Json, signal?: AbortSignal): Promise<Json> {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    if (bytes.length <= TRANSFER_INLINE) return { type: 'inline', value };
    const sha256 = await digest(bytes);
    requireCondition(!signal?.aborted, 'CANCELLED', '实例传输已取消');
    const id = this.reserve(owner, null, bytes.length, sha256);
    this.entries.get(id)!.chunks = [bytes];
    return { type: 'download', id, size: bytes.length, sha256 };
  }

  download(owner: string, payload: unknown): Json {
    requireCondition(isRecord(payload), 'INVALID', '下载分块须为对象');
    const transfer = this.get(owner, payload['id']);
    const index = payload['index'];
    requireCondition(
      transfer.method === null &&
        typeof index === 'number' &&
        Number.isSafeInteger(index) &&
        index >= 0 &&
        index * TRANSFER_CHUNK < transfer.size,
      'INVALID',
      '下载分块序号无效'
    );
    return { chunk: encodeBytes(transfer.chunks[0].subarray(index * TRANSFER_CHUNK, (index + 1) * TRANSFER_CHUNK)) };
  }

  release(owner: string, id: string): void {
    this.expire();
    if (!this.entries.has(id)) return;
    this.get(owner, id);
    this.entries.delete(id);
  }

  dispose(owner: string): void {
    for (const [id, transfer] of this.entries) if (transfer.owner === owner) this.entries.delete(id);
  }

  private expire(): void {
    for (const [id, transfer] of this.entries) if (this.now() - transfer.touched > 120000) this.entries.delete(id);
  }

  private get(owner: string, id: unknown): Transfer {
    this.expire();
    requireCondition(typeof id === 'string', 'INVALID', '缺少传输身份');
    const transfer = this.entries.get(id);
    requireCondition(transfer, 'NOT_FOUND', '传输已释放或过期');
    requireCondition(transfer.owner === owner, 'DENIED', '不能访问其他实例的传输');
    transfer.touched = this.now();
    return transfer;
  }

  private reserve(owner: string, method: string | null, size: number, sha256: string): string {
    this.expire();
    const entries = [...this.entries.values()];
    requireCondition(
      size <= this.limit &&
        entries.reduce((total, entry) => total + entry.size, 0) + size <= this.limit &&
        entries.filter(entry => entry.owner === owner).length < 4,
      'LIMIT',
      '传输缓冲区已满'
    );
    const id = crypto.randomUUID();
    this.entries.set(id, { owner, method, size, sha256, touched: this.now(), chunks: [], received: 0 });
    return id;
  }
}
