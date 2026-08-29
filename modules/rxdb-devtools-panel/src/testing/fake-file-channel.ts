import { createDevToolsError, type DevToolsErrorCode } from '@aiao/rxdb-devtools';
import type { DevToolsFileChannel, DevToolsFileEntry, DevToolsFileResult } from '../transport';

/** 记录下来的一次文件信道调用。 */
export interface FakeFileCall {
  /** 调用的方法名。 */
  readonly op: 'list' | 'download' | 'remove' | 'createDirectory' | 'upload';
  /** 目标路径；`upload` 记的是目标目录。 */
  readonly path: string;
  /** `upload` 记下的文件名。 */
  readonly name?: string;
}

/**
 * 纯内存的 {@link DevToolsFileChannel} 实现。
 *
 * @remarks
 * 它是一棵**真目录树**而不是一张应答表：用例说「这个目录里有什么」，
 * 而不是说「第 3 次 `list` 返回什么」。后者会让「上传后文件是否出现」这类断言
 * 退化成「用例自己安排它出现」，而那恰好是上传路径唯一能观测到的成功证据。
 */
export class FakeDevToolsFileChannel implements DevToolsFileChannel {
  /** 全部调用，按时序记录。 */
  readonly calls: FakeFileCall[] = [];

  /** 目录路径（规范化后，根为 `''`）→ 该层条目。 */
  private readonly tree = new Map<string, DevToolsFileEntry[]>([['', []]]);

  /** 下一次调用要返回的失败；用完即清。 */
  private nextFailure: DevToolsErrorCode | null = null;

  /** 播种一个目录及其条目。 */
  seed(path: string, entries: readonly DevToolsFileEntry[]): void {
    this.tree.set(normalize(path), [...entries]);
  }

  /** 让**下一次**调用失败。 */
  failNext(code: DevToolsErrorCode): void {
    this.nextFailure = code;
  }

  list(path: string): Promise<DevToolsFileResult<readonly DevToolsFileEntry[]>> {
    this.calls.push({ op: 'list', path });
    const failure = this.takeFailure<readonly DevToolsFileEntry[]>();
    if (failure !== null) return Promise.resolve(failure);
    const entries = this.tree.get(normalize(path));
    if (entries === undefined) return Promise.resolve(fail('resource_not_found'));
    return Promise.resolve({ outcome: 'ok', value: entries });
  }

  download(path: string): Promise<DevToolsFileResult<void>> {
    this.calls.push({ op: 'download', path });
    return Promise.resolve(this.takeFailure<void>() ?? { outcome: 'ok', value: undefined });
  }

  remove(path: string): Promise<DevToolsFileResult<void>> {
    this.calls.push({ op: 'remove', path });
    const failure = this.takeFailure<void>();
    if (failure !== null) return Promise.resolve(failure);
    const parent = normalize(parentOf(path));
    const entries = this.tree.get(parent);
    if (entries !== undefined) this.tree.set(parent, entries.filter(entry => entry.name !== nameOf(path)));
    return Promise.resolve({ outcome: 'ok', value: undefined });
  }

  createDirectory(path: string): Promise<DevToolsFileResult<void>> {
    this.calls.push({ op: 'createDirectory', path });
    const failure = this.takeFailure<void>();
    if (failure !== null) return Promise.resolve(failure);
    this.insert(parentOf(path), { name: nameOf(path), kind: 'directory', path: normalize(path) });
    this.tree.set(normalize(path), []);
    return Promise.resolve({ outcome: 'ok', value: undefined });
  }

  upload(path: string, file: File): Promise<DevToolsFileResult<'sent'>> {
    this.calls.push({ op: 'upload', path, name: file.name });
    const failure = this.takeFailure<'sent'>();
    if (failure !== null) return Promise.resolve(failure);
    const target = normalize(path);
    this.insert(path, {
      name: file.name,
      kind: 'file',
      path: target.length === 0 ? file.name : `${target}/${file.name}`,
      size: file.size,
      lastModified: 0
    });
    return Promise.resolve({ outcome: 'ok', value: 'sent' });
  }

  private insert(directory: string, entry: DevToolsFileEntry): void {
    const key = normalize(directory);
    const entries = this.tree.get(key) ?? [];
    this.tree.set(key, [...entries.filter(existing => existing.name !== entry.name), entry]);
  }

  private takeFailure<T>(): DevToolsFileResult<T> | null {
    if (this.nextFailure === null) return null;
    const code = this.nextFailure;
    this.nextFailure = null;
    return fail(code);
  }
}

function fail<T>(code: DevToolsErrorCode): DevToolsFileResult<T> {
  return { outcome: 'failed', error: createDevToolsError(code) };
}

/** `'/'`、`'/a/b'`、`'a/b'` 一律归一成 `''` / `'a/b'`。 */
function normalize(path: string): string {
  return path.split('/').filter(Boolean).join('/');
}

function parentOf(path: string): string {
  return normalize(path).split('/').slice(0, -1).join('/');
}

function nameOf(path: string): string {
  return normalize(path).split('/').at(-1) ?? '';
}
