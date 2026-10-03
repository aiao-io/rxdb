/**
 * @fileoverview 把支付宝同步 FS 包装成 adapter 的 `MiniProgramFileSystemManager` 契约。
 *
 * 实验里的临时 host 用它（**不是** adapter 的正式实现）：支付宝 FS 失败时返回错误对象而不抛，
 * 写二进制只有「base64 串 + `'base64'`」两端字节一致（v2 探针模拟器与 iOS 实测）。
 * 包装层把错误对象变成抛错、把已知错误码的文案归一成 adapter VFS 正则认得的英文，再把原始对象挂在 cause 上。
 */
import type { MiniProgramFileSystemManager } from '@aiao/rxdb-adapter-miniprogram/runtime';
import type { AlipayApi, AlipayFsFailure, AlipayRawFileSystem, AlipayStats } from './alipay-api.js';
import type { DatabaseFile } from './core-contract.js';

/**
 * 已知错误码对应的归一文案，让 adapter VFS 的正则能分类。
 *
 * 10022 / 10025 两端实测；10028 取自文档「写入文件单个超过 10M 或者写入文件夹超过 50M」，未实测。
 */
const NORMALIZED_MESSAGES: Readonly<Record<string, string>> = {
  '10022': 'no such file or directory',
  '10025': 'file already exists',
  '10028': 'size limit exceeded'
};

/** 支付宝同步 FS 方法的返回值是失败对象：带 `error` 或 `errorCode` 键。 */
export function isAlipayFsFailure(value: unknown): value is AlipayFsFailure {
  return typeof value === 'object' && value !== null && ('error' in value || 'errorCode' in value);
}

/** 包装层抛出的错误：`cause` 是平台返回的原始失败对象。 */
export class AlipayFsError extends Error {
  override readonly name = 'AlipayFsError';
  /** 平台错误码：iOS 与模拟器多为数字 `error`，模拟器内部错误是字符串 `errorCode`。不叫 `code`，免得与 SQLite 错误码混淆。 */
  readonly platformCode: number | string | undefined;

  constructor(
    readonly method: string,
    readonly path: string,
    failure: AlipayFsFailure
  ) {
    const platformCode = failure.error ?? failure.errorCode;
    const raw = failure.errorMessage ?? failure.message ?? JSON.stringify(failure);
    const normalized = NORMALIZED_MESSAGES[String(platformCode)];
    const detail = `${raw} (${method} ${path}, error ${String(platformCode)})`;
    super(normalized ? `${normalized}: ${detail}` : detail);
    this.platformCode = platformCode;
    // 不走 Error 构造器的 cause 选项：不确定支付宝两端的引擎都支持
    this.cause = failure;
  }
}

/** 实验需要的文件系统：adapter 契约之外，再加清理、列目录与读代码包二进制。 */
export interface AlipayProbeFileSystem extends MiniProgramFileSystemManager {
  rmdirSync(path: string, recursive?: boolean): void;
  renameSync(oldPath: string, newPath: string): void;
  statSync(path: string): AlipayStats;
  readdirSync(path: string): string[];
  /** 读二进制；代码包里的文件用相对路径（模拟器实测）。 */
  readBinarySync(path: string): ArrayBuffer;
  /** 按 UTF-8 读文本；给代码包里的 base64 文本副本用，模拟器上二进制读会改写字节。 */
  readTextSync(path: string): string;
}

function typeTag(value: unknown): string {
  return Object.prototype.toString.call(value);
}

/** 平台返回失败对象就抛 {@link AlipayFsError}，否则原样返回。 */
function unwrap(method: string, path: string, result: unknown): unknown {
  if (isAlipayFsFailure(result)) throw new AlipayFsError(method, path, result);
  return result;
}

/** 从成功结果里取字段并核对类型；形状不对就报出实际形状，不猜。 */
function field(method: string, path: string, result: unknown, key: string, tag: string): unknown {
  const value: unknown = typeof result === 'object' && result !== null ? Reflect.get(result, key) : undefined;
  if (typeTag(value) !== tag) {
    throw new Error(`${method} ${path} 返回的 ${key} 是 ${typeTag(value)}，期望 ${tag}：${typeTag(result)}`);
  }
  return value;
}

function isStats(value: unknown): value is AlipayStats {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof Reflect.get(value, 'size') === 'number' &&
    typeof Reflect.get(value, 'isDirectory') === 'function'
  );
}

/** 包装原始 FS；`my` 只用来做 base64 转换。 */
export function wrapAlipayFileSystem(
  raw: AlipayRawFileSystem,
  my: Pick<AlipayApi, 'arrayBufferToBase64'>
): AlipayProbeFileSystem {
  const readBinarySync = (path: string): ArrayBuffer => {
    const result = unwrap('readFileSync', path, raw.readFileSync(path));
    // IDE 模拟器返回别的 realm 的 ArrayBuffer，instanceof 恒为假，只能看内部标签
    return field('readFileSync', path, result, 'data', '[object ArrayBuffer]') as ArrayBuffer;
  };
  return {
    accessSync: path => void unwrap('accessSync', path, raw.accessSync(path)),
    mkdirSync: (path, recursive) => void unwrap('mkdirSync', path, raw.mkdirSync(path, recursive)),
    readFileSync: path => my.arrayBufferToBase64(readBinarySync(path)),
    writeFileSync: (path, data) =>
      void unwrap('writeFileSync', path, raw.writeFileSync(path, my.arrayBufferToBase64(data), 'base64')),
    unlinkSync: path => void unwrap('unlinkSync', path, raw.unlinkSync(path)),
    rmdirSync: (path, recursive) => void unwrap('rmdirSync', path, raw.rmdirSync(path, recursive)),
    renameSync: (oldPath, newPath) =>
      void unwrap('renameSync', `${oldPath} → ${newPath}`, raw.renameSync(oldPath, newPath)),
    statSync: path => {
      const stats: unknown = Reflect.get(Object(unwrap('statSync', path, raw.statSync(path))), 'stats');
      if (!isStats(stats)) throw new Error(`statSync ${path} 返回的 stats 不是 Stats：${typeTag(stats)}`);
      return stats;
    },
    readdirSync: path => {
      const files = field(
        'readdirSync',
        path,
        unwrap('readdirSync', path, raw.readdirSync(path)),
        'files',
        '[object Array]'
      );
      return (files as unknown[]).map(String);
    },
    readBinarySync,
    readTextSync: path =>
      field(
        'readFileSync',
        path,
        unwrap('readFileSync', path, raw.readFileSync(path, 'utf8')),
        'data',
        '[object String]'
      ) as string
  };
}

/**
 * 分帧层写在每个用户文件最前面的字节。
 *
 * 模拟器拒绝任何形式的空写入（error 2「接口参数无效」，v3 探针实测），而 adapter VFS 建库时要写空文件。
 * 统一垫一个头字节让「空文件」也有 1 字节可写；取值无讲究，只要读的时候能核对。
 */
export const FRAME_HEADER = 0xa1;

function headerError(method: string, path: string, detail: string): Error {
  return new Error(`${method} ${path} 不是经分帧层写的文件（${detail}），缺分帧头`);
}

/**
 * 给用户文件加一字节分帧头：写入时垫在最前，读与 stat 时剥掉，对上层呈现逻辑内容与逻辑大小。
 *
 * 只给实验 host 与核心包建库用；FS 实验仍用 {@link wrapAlipayFileSystem} 直接记录平台事实。
 * `readBinarySync` / `readTextSync` 读代码包，原样透传。
 */
export function frameUserFiles(
  fileSystem: AlipayProbeFileSystem,
  my: Pick<AlipayApi, 'arrayBufferToBase64'>
): AlipayProbeFileSystem {
  return {
    ...fileSystem,
    readFileSync: path => {
      const bytes = new Uint8Array(fileSystem.readBinarySync(path));
      if (bytes[0] !== FRAME_HEADER) throw headerError('readFileSync', path, `首字节 ${String(bytes[0])}`);
      return my.arrayBufferToBase64(bytes.slice(1).buffer);
    },
    writeFileSync: (path, data) => {
      const framed = new Uint8Array(data.byteLength + 1);
      framed[0] = FRAME_HEADER;
      framed.set(new Uint8Array(data), 1);
      fileSystem.writeFileSync(path, framed.buffer);
    },
    statSync: path => {
      const stats = fileSystem.statSync(path);
      if (stats.isDirectory()) return stats;
      if (stats.size === 0) throw headerError('statSync', path, '0 字节');
      return { size: stats.size - 1, isDirectory: () => false, isFile: () => stats.isFile() };
    }
  };
}

/** 递归列出 `root` 下的文件与大小；路径相对 `root`、以 `/` 开头（与抖音 `statSync(root, true)` 同形）。 */
export function listFiles(fileSystem: AlipayProbeFileSystem, root: string, prefix = ''): DatabaseFile[] {
  return fileSystem.readdirSync(`${root}${prefix}`).flatMap(name => {
    const relative = `${prefix}/${name}`;
    const stats = fileSystem.statSync(`${root}${relative}`);
    return stats.isDirectory() ? listFiles(fileSystem, root, relative) : [{ path: relative, size: stats.size }];
  });
}
