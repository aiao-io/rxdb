import { createSha256, type Sha256Hasher } from '../system/sha256.js';
import { RxDBBackupError, type RxDBBackupErrorCode } from './backup-error.js';
import { parseRxDBBackupManifest } from './backup-manifest.js';
import type { RxDBBackupManifest, RxDBBackupTrailer } from './backup.interface.js';

/**
 * 单个数据帧的最大载荷（64 KiB）。
 *
 * @remarks
 * 写入方把任意大小的输入切成不超过它的帧，读取方拒绝更大的帧——这是两端内存上界的来源：
 * 无论数据库多大，编解码层同时持有的数据不超过一帧加上输入流自身的一个 chunk。
 */
export const RXDB_BACKUP_CHUNK_SIZE = 64 * 1024;

/** manifest / 条目头 / 结束标记这类 JSON 帧的上限。 */
const MAX_JSON_FRAME = 64 * 1024;

/** `RXDBBAK` + 格式代号 1。 */
const MAGIC = Uint8Array.from([0x52, 0x58, 0x44, 0x42, 0x42, 0x41, 0x4b, 0x01]);

const FRAME_MANIFEST = 0x01;
const FRAME_ENTRY = 0x02;
const FRAME_DATA = 0x03;
const FRAME_TRAILER = 0x7f;
const FRAME_HEADER_SIZE = 5;

const HEX_64 = /^[0-9a-f]{64}$/;

/**
 * 归档内一个条目的头。
 */
export interface RxDBBackupEntryHeader {
  /** 相对引擎数据目录的 POSIX 路径；不以 `/` 开头，不含空段、`.`、`..`、反斜杠或 NUL。 */
  readonly path: string;
  readonly kind: 'file' | 'directory';
  /** 文件字节数；目录恒为 0。 */
  readonly size: number;
}

/**
 * {@link RxDBBackupArchiveReader.next} 的产出。
 *
 * @remarks
 * 文件条目之后紧跟若干 `data`，字节数之和等于头里声明的 `size`；`end` 只在结束标记与摘要都校验
 * 通过、且其后再无字节时产出。
 */
export type RxDBBackupArchiveItem =
  | { readonly type: 'entry'; readonly header: RxDBBackupEntryHeader }
  | { readonly type: 'data'; readonly bytes: Uint8Array }
  | { readonly type: 'end'; readonly trailer: RxDBBackupTrailer };

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

const backupError = (code: RxDBBackupErrorCode, message: string, field?: string, cause?: unknown): RxDBBackupError =>
  new RxDBBackupError(code, message, { details: field === undefined ? {} : { field }, cause });

const corrupt = (field: string, message: string): RxDBBackupError => backupError('corrupt_archive', message, field);

const isSafeArchivePath = (path: string): boolean =>
  path.length > 0 &&
  !path.startsWith('/') &&
  !path.includes('\\') &&
  !path.includes('\u0000') &&
  path.split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..');

const throwIfAborted = (signal: AbortSignal | undefined): void => {
  if (signal?.aborted) throw backupError('aborted', 'Backup operation was aborted', undefined, signal.reason);
};

/**
 * 让一个可能永不 settle 的流操作也能被取消打断。
 */
const raceAbort = <T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> => {
  if (!signal) return promise;
  throwIfAborted(signal);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(backupError('aborted', 'Backup operation was aborted', undefined, signal.reason));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
};

/**
 * 把流 / 存储抛出的原始异常映射到稳定分类；已分类的原样返回。
 *
 * @remarks
 * `QuotaExceededError` → `storage_full`，其余 → `io_error`（原始异常挂在 `cause` 上）。
 * adapter 在自己的存储读写点复用它，保证同一种失败在所有 adapter 上落到同一个 code。
 *
 * @param error - 原始异常
 * @param message - 人读说明
 * @returns 分类后的错误
 */
export const classifyBackupIoError = (error: unknown, message: string): RxDBBackupError => {
  if (error instanceof RxDBBackupError) return error;
  const quota = error instanceof DOMException && error.name === 'QuotaExceededError';
  return backupError(quota ? 'storage_full' : 'io_error', message, undefined, error);
};

const encodeFrame = (type: number, payload: Uint8Array): Uint8Array => {
  const frame = new Uint8Array(FRAME_HEADER_SIZE + payload.length);
  frame[0] = type;
  new DataView(frame.buffer).setUint32(1, payload.length);
  frame.set(payload, FRAME_HEADER_SIZE);
  return frame;
};

/**
 * 流式归档写入器。
 *
 * @remarks
 * 调用顺序固定：{@link writeManifest} → 若干（{@link beginEntry} → {@link writeData}*）→ {@link finish}。
 * 违反顺序、路径不安全或写入字节与声明不符都报 `invalid_state`——这些是生产方的 bug，
 * 不能写出一个读取方必然拒绝的归档。写入器不关闭底层流，`close()` / `abort()` 由调用方决定。
 * 任何一步失败后写入器作废，后续调用一律 `invalid_state`。
 *
 * @example
 * ```typescript
 * const writer = new RxDBBackupArchiveWriter(sink.getWriter(), signal);
 * await writer.writeManifest(manifest);
 * await writer.beginEntry({ path: 'PG_VERSION', kind: 'file', size: bytes.length });
 * await writer.writeData(bytes);
 * const trailer = await writer.finish();
 * ```
 */
export class RxDBBackupArchiveWriter {
  readonly #sink: WritableStreamDefaultWriter<Uint8Array>;
  readonly #signal: AbortSignal | undefined;
  readonly #hash: Sha256Hasher = createSha256();
  readonly #paths = new Set<string>();
  #state: 'initial' | 'open' | 'finished' | 'failed' = 'initial';
  #remaining = 0;
  #entries = 0;
  #bytes = 0;

  constructor(sink: WritableStreamDefaultWriter<Uint8Array>, signal?: AbortSignal) {
    this.#sink = sink;
    this.#signal = signal;
  }

  /**
   * 写魔数与 manifest。必须是第一次调用。
   *
   * @param manifest - 归档元数据
   */
  writeManifest(manifest: RxDBBackupManifest): Promise<void> {
    return this.#guard('initial', async () => {
      const frame = encodeFrame(FRAME_MANIFEST, this.#json(manifest));
      const chunk = new Uint8Array(MAGIC.length + frame.length);
      chunk.set(MAGIC);
      chunk.set(frame, MAGIC.length);
      await this.#emit(chunk, true);
    });
  }

  /**
   * 开始一个条目。上一个文件必须已写满声明的字节数。
   *
   * @param header - 条目头
   */
  beginEntry(header: RxDBBackupEntryHeader): Promise<void> {
    return this.#guard('open', async () => {
      if (this.#remaining > 0) throw this.#misuse('previous file entry is incomplete');
      if (!isSafeArchivePath(header.path)) throw this.#misuse(`unsafe archive path ${JSON.stringify(header.path)}`);
      if (this.#paths.has(header.path)) throw this.#misuse(`duplicate archive path ${header.path}`);
      if (!Number.isSafeInteger(header.size) || header.size < 0)
        throw this.#misuse('entry size must be a non-negative integer');
      if (header.kind === 'directory' && header.size !== 0) throw this.#misuse('directory entries have no data');
      const { path, kind, size } = header;
      await this.#emit(encodeFrame(FRAME_ENTRY, this.#json({ path, kind, size })), true);
      this.#paths.add(path);
      this.#entries += 1;
      this.#remaining = size;
    });
  }

  /**
   * 写当前文件的一段数据；超过 {@link RXDB_BACKUP_CHUNK_SIZE} 的输入会被切成多帧。
   * 输入缓冲区只读不改，返回后调用方可以复用。
   *
   * @param bytes - 数据
   */
  writeData(bytes: Uint8Array): Promise<void> {
    return this.#guard('open', async () => {
      if (bytes.length > this.#remaining) throw this.#misuse('data exceeds the declared entry size');
      for (let offset = 0; offset < bytes.length; offset += RXDB_BACKUP_CHUNK_SIZE) {
        const piece = bytes.subarray(offset, offset + RXDB_BACKUP_CHUNK_SIZE);
        await this.#emit(encodeFrame(FRAME_DATA, piece), true);
        this.#remaining -= piece.length;
        this.#bytes += piece.length;
      }
    });
  }

  /**
   * 写结束标记。结束标记本身不进摘要。
   *
   * @returns 结束标记内容
   */
  finish(): Promise<RxDBBackupTrailer> {
    return this.#guard('open', async () => {
      if (this.#remaining > 0) throw this.#misuse('last file entry is incomplete');
      const trailer: RxDBBackupTrailer = { entries: this.#entries, bytes: this.#bytes, sha256: this.#hash.digestHex() };
      await this.#emit(encodeFrame(FRAME_TRAILER, this.#json(trailer)), false);
      this.#state = 'finished';
      return trailer;
    });
  }

  async #guard<T>(expected: 'initial' | 'open', task: () => Promise<T>): Promise<T> {
    if (this.#state !== expected) throw this.#misuse(`writer is ${this.#state}, expected ${expected}`);
    try {
      throwIfAborted(this.#signal);
      const result = await task();
      if (this.#state === 'initial') this.#state = 'open';
      return result;
    } catch (error) {
      this.#state = 'failed';
      throw error;
    }
  }

  async #emit(chunk: Uint8Array, hashed: boolean): Promise<void> {
    if (hashed) this.#hash.update(chunk);
    try {
      await raceAbort(this.#sink.write(chunk), this.#signal);
    } catch (error) {
      throw classifyBackupIoError(error, 'Failed to write backup archive');
    }
  }

  #json(value: unknown): Uint8Array {
    const bytes = encoder.encode(JSON.stringify(value));
    if (bytes.length > MAX_JSON_FRAME) throw this.#misuse('metadata frame exceeds 64 KiB');
    return bytes;
  }

  #misuse(message: string): RxDBBackupError {
    return backupError('invalid_state', `Backup archive writer: ${message}`);
  }
}

const parseJsonFrame = (payload: Uint8Array, field: string): unknown => {
  try {
    return JSON.parse(decoder.decode(payload));
  } catch {
    throw corrupt(field, `Backup archive ${field} frame is not valid JSON`);
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isCount = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;

const parseEntryHeader = (payload: Uint8Array): RxDBBackupEntryHeader => {
  const value = parseJsonFrame(payload, 'entry');
  if (!isRecord(value) || typeof value['path'] !== 'string')
    throw corrupt('entry', 'Backup archive entry header is malformed');
  const { path, kind, size } = value;
  const shapeOk = (kind === 'file' || kind === 'directory') && isCount(size) && (kind === 'file' || size === 0);
  if (!shapeOk) throw corrupt('entry', 'Backup archive entry header is malformed');
  if (!isSafeArchivePath(path)) throw corrupt('path', `Backup archive contains an unsafe path ${JSON.stringify(path)}`);
  return { path, kind, size };
};

const parseTrailer = (payload: Uint8Array): RxDBBackupTrailer => {
  const value = parseJsonFrame(payload, 'trailer');
  const valid =
    isRecord(value) &&
    isCount(value['entries']) &&
    isCount(value['bytes']) &&
    typeof value['sha256'] === 'string' &&
    HEX_64.test(value['sha256']);
  if (!valid) throw corrupt('trailer', 'Backup archive trailer is malformed');
  return { entries: value['entries'] as number, bytes: value['bytes'] as number, sha256: value['sha256'] as string };
};

const frameLimit = (type: number): number => {
  if (type === FRAME_DATA) return RXDB_BACKUP_CHUNK_SIZE;
  if (type === FRAME_MANIFEST || type === FRAME_ENTRY || type === FRAME_TRAILER) return MAX_JSON_FRAME;
  throw corrupt('frame', `Backup archive contains unknown frame type ${type}`);
};

/**
 * 流式归档读取器。
 *
 * @remarks
 * 先 {@link readManifest}，再反复 {@link next} 直到 `end`。所有结构问题在产出之前就地判定：
 * 魔数、帧类型与顺序、帧长度上限（越界时不等待、不分配）、路径安全与唯一、条目字节数、
 * 结束标记与 SHA-256、结束标记之后不得再有字节。输入在结束标记之前耗尽报 `truncated_archive`，
 * 其余损坏报 `corrupt_archive` 并在 `details.field` 标注位置；输入流自身失败报 `io_error`。
 *
 * 摘要只有读到结尾才知道，所以 manifest 和数据在校验摘要**之前**就已产出——调用方必须把它们
 * 写进可丢弃的暂存区，等到 `end` 之后才能提交。读取器不取消底层流，由调用方处置。
 */
export class RxDBBackupArchiveReader {
  readonly #source: ReadableStreamDefaultReader<Uint8Array>;
  readonly #signal: AbortSignal | undefined;
  readonly #hash: Sha256Hasher = createSha256();
  readonly #paths = new Set<string>();
  readonly #chunks: Uint8Array[] = [];
  #buffered = 0;
  #exhausted = false;
  #state: 'initial' | 'body' | 'ended' | 'failed' = 'initial';
  #current: { kind: RxDBBackupEntryHeader['kind']; remaining: number } | null = null;
  #entries = 0;
  #bytes = 0;

  constructor(source: ReadableStreamDefaultReader<Uint8Array>, signal?: AbortSignal) {
    this.#source = source;
    this.#signal = signal;
  }

  /**
   * 读取并校验魔数与 manifest 的结构（兼容性判定由调用方负责）。
   *
   * @returns 结构合格的 manifest
   */
  readManifest(): Promise<RxDBBackupManifest> {
    return this.#guard('initial', async () => {
      const magic = await this.#readExact(MAGIC.length);
      this.#hash.update(magic);
      if (!magic.every((byte, index) => byte === MAGIC[index]))
        throw corrupt('magic', 'Input is not an RxDB backup archive');
      const { type, payload } = await this.#readFrame();
      if (type !== FRAME_MANIFEST) throw corrupt('frame', 'Backup archive does not start with a manifest');
      const manifest = parseRxDBBackupManifest(parseJsonFrame(payload, 'manifest'));
      this.#state = 'body';
      return manifest;
    });
  }

  /**
   * 读取下一项。
   *
   * @returns 条目头、数据片段或结束
   */
  next(): Promise<RxDBBackupArchiveItem> {
    return this.#guard('body', async () => {
      const { type, payload } = await this.#readFrame();
      if (type === FRAME_ENTRY) return this.#onEntry(payload);
      if (type === FRAME_DATA) return this.#onData(payload);
      if (type === FRAME_TRAILER) return this.#onTrailer(payload);
      throw corrupt('frame', 'Backup archive contains a second manifest');
    });
  }

  #onEntry(payload: Uint8Array): RxDBBackupArchiveItem {
    this.#assertCurrentComplete();
    const header = parseEntryHeader(payload);
    if (this.#paths.has(header.path)) throw corrupt('path', `Backup archive contains duplicate path ${header.path}`);
    this.#paths.add(header.path);
    this.#entries += 1;
    this.#current = { kind: header.kind, remaining: header.size };
    return { type: 'entry', header };
  }

  #onData(payload: Uint8Array): RxDBBackupArchiveItem {
    if (this.#current?.kind !== 'file') throw corrupt('frame', 'Backup archive data frame outside a file entry');
    if (payload.length > this.#current.remaining)
      throw corrupt('size', 'Backup archive file has more data than declared');
    this.#current.remaining -= payload.length;
    this.#bytes += payload.length;
    return { type: 'data', bytes: payload };
  }

  async #onTrailer(payload: Uint8Array): Promise<RxDBBackupArchiveItem> {
    this.#assertCurrentComplete();
    const trailer = parseTrailer(payload);
    if (trailer.sha256 !== this.#hash.digestHex()) throw corrupt('sha256', 'Backup archive checksum mismatch');
    if (trailer.entries !== this.#entries) throw corrupt('entries', 'Backup archive entry count mismatch');
    if (trailer.bytes !== this.#bytes) throw corrupt('bytes', 'Backup archive byte count mismatch');
    if (await this.#fill(1)) throw corrupt('trailer', 'Backup archive has trailing bytes after the trailer');
    this.#state = 'ended';
    return { type: 'end', trailer };
  }

  #assertCurrentComplete(): void {
    if (this.#current && this.#current.remaining > 0)
      throw corrupt('size', 'Backup archive file has less data than declared');
  }

  async #guard<T>(expected: 'initial' | 'body', task: () => Promise<T>): Promise<T> {
    if (this.#state !== expected)
      throw backupError('invalid_state', `Backup archive reader is ${this.#state}, expected ${expected}`);
    try {
      return await task();
    } catch (error) {
      this.#state = 'failed';
      throw error;
    }
  }

  async #readFrame(): Promise<{ type: number; payload: Uint8Array }> {
    const header = await this.#readExact(FRAME_HEADER_SIZE);
    const type = header[0];
    const length = new DataView(header.buffer, header.byteOffset, FRAME_HEADER_SIZE).getUint32(1);
    const minimum = type === FRAME_DATA ? 1 : 0;
    if (length < minimum || length > frameLimit(type))
      throw corrupt('frame', `Backup archive frame length ${length} is out of range`);
    const payload = await this.#readExact(length);
    if (type !== FRAME_TRAILER) {
      this.#hash.update(header);
      this.#hash.update(payload);
    }
    return { type, payload };
  }

  async #readExact(length: number): Promise<Uint8Array> {
    if (!(await this.#fill(length))) throw backupError('truncated_archive', 'Backup archive ended before its trailer');
    const out = new Uint8Array(length);
    let offset = 0;
    while (offset < length) {
      const head = this.#chunks[0];
      const take = Math.min(head.length, length - offset);
      out.set(head.subarray(0, take), offset);
      offset += take;
      if (take === head.length) this.#chunks.shift();
      else this.#chunks[0] = head.subarray(take);
    }
    this.#buffered -= length;
    return out;
  }

  async #fill(length: number): Promise<boolean> {
    while (this.#buffered < length && !this.#exhausted) {
      const { done, value } = await this.#read();
      if (done) this.#exhausted = true;
      else if (value.length > 0) {
        this.#chunks.push(value);
        this.#buffered += value.length;
      }
    }
    return this.#buffered >= length;
  }

  async #read(): Promise<ReadableStreamReadResult<Uint8Array>> {
    try {
      return await raceAbort(this.#source.read(), this.#signal);
    } catch (error) {
      throw classifyBackupIoError(error, 'Failed to read backup archive');
    }
  }
}
