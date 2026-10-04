/**
 * @fileoverview 把支付宝同步 FS 包装成 {@link MiniProgramFileSystemManager} 契约。
 *
 * 全部是保持语义的绕行，只用文档里的 API（US-211 支付宝探针 v2–v6，模拟器与 iOS 实测）：
 *
 * - 失败时平台**返回**错误对象而不抛：包装层改成抛 {@link AlipayFsError}，已知错误码的文案归一成文件 VFS 认得的英文，
 *   原始对象挂在 `cause` 上；
 * - 写二进制只有「base64 串 + `'base64'`」两端字节一致：读写都经 `my.arrayBufferToBase64` 转换；
 * - 模拟器拒收任何空写入，而文件 VFS 建库要写空文件：每个用户文件最前面垫 1 字节分帧头
 *   {@link ALIPAY_FRAME_HEADER}，读时核对并剥掉。所以支付宝的落盘格式与其他平台不同，各平台的数据本来就不互通。
 */
import type { MiniProgramFileSystemManager } from '../mini-program.interface.js';
import type { AlipayFsFailure, MiniProgramAlipayApi, MiniProgramAlipayRawFileSystem } from './alipay-api.js';

/**
 * 已知错误码对应的归一文案，让文件 VFS 的正则能分类。
 *
 * 10022 / 10025 两端实测；10028 模拟器实测（文档「单个超过 10M 或者文件夹超过 50M」），iOS 真机写到单文件 12 MiB、
 * 文件夹 72 MiB 都没撞上。
 */
const NORMALIZED_MESSAGES: Readonly<Record<string, string>> = {
  '10022': 'no such file or directory',
  '10025': 'file already exists',
  '10028': 'size limit exceeded'
};

/**
 * 分帧头：写在每个用户文件最前面的字节。取值无讲究，只要读的时候能核对。
 *
 * 包内与探针共用，不从包入口导出。
 */
export const ALIPAY_FRAME_HEADER = 0xa1;

/** 支付宝同步 FS 方法的返回值是失败对象：带 `error` 或 `errorCode` 键。 */
export function isAlipayFsFailure(value: unknown): value is AlipayFsFailure {
  return typeof value === 'object' && value !== null && ('error' in value || 'errorCode' in value);
}

/** 包装层抛出的错误：`cause` 是平台返回的原始失败对象。 */
export class AlipayFsError extends Error {
  override readonly name = 'AlipayFsError';
  /** 平台错误码：多为数字 `error`，模拟器内部错误是字符串 `errorCode`。不叫 `code`，免得与 SQLite 错误码混淆。 */
  readonly platformCode: number | string | undefined;

  /**
   * @param method - 出错的 FS 方法名
   * @param path - 操作的路径
   * @param failure - 平台返回的失败对象
   */
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
    // 不走 Error 构造器的 cause 选项：没核实过支付宝两端的引擎都支持
    this.cause = failure;
  }
}

/**
 * 平台返回失败对象就抛 {@link AlipayFsError}，否则原样返回。
 *
 * 包内与探针共用，不从包入口导出。
 */
export function unwrapAlipayFsResult(method: string, path: string, result: unknown): unknown {
  if (isAlipayFsFailure(result)) throw new AlipayFsError(method, path, result);
  return result;
}

function typeTag(value: unknown): string {
  return Object.prototype.toString.call(value);
}

/** 从成功结果里取 `data` 并按内部标签核对类型：模拟器返回别的 realm 的 ArrayBuffer，`instanceof` 恒为假。 */
function resultData(path: string, result: unknown, tag: string): unknown {
  const value: unknown = typeof result === 'object' && result !== null ? Reflect.get(result, 'data') : undefined;
  if (typeTag(value) !== tag) throw new Error(`readFileSync ${path} 返回的 data 是 ${typeTag(value)}，期望 ${tag}`);
  return value;
}

function readBinary(raw: MiniProgramAlipayRawFileSystem, path: string): ArrayBuffer {
  const result = unwrapAlipayFsResult('readFileSync', path, raw.readFileSync(path));
  return resultData(path, result, '[object ArrayBuffer]') as ArrayBuffer;
}

type Base64Encoder = Pick<MiniProgramAlipayApi, 'arrayBufferToBase64'>;

function readFramed(raw: MiniProgramAlipayRawFileSystem, my: Base64Encoder, path: string): string {
  const bytes = new Uint8Array(readBinary(raw, path));
  if (bytes[0] !== ALIPAY_FRAME_HEADER) {
    throw new Error(`readFileSync ${path} 不是经分帧层写的文件（首字节 ${String(bytes[0])}），缺分帧头`);
  }
  return my.arrayBufferToBase64(bytes.slice(1).buffer);
}

function writeFramed(raw: MiniProgramAlipayRawFileSystem, my: Base64Encoder, path: string, data: ArrayBuffer): void {
  const framed = new Uint8Array(data.byteLength + 1);
  framed[0] = ALIPAY_FRAME_HEADER;
  framed.set(new Uint8Array(data), 1);
  unwrapAlipayFsResult('writeFileSync', path, raw.writeFileSync(path, my.arrayBufferToBase64(framed.buffer), 'base64'));
}

/**
 * 把原始 FS 包装成文件 VFS 用的契约，用户文件带分帧头。
 *
 * 原始 FS 缺的方法不包装，交给运行时预检逐个报缺失；不在这里造一个调用时才 `TypeError` 的空壳。
 *
 * @param raw - `my.getFileSystemManager()` 的返回值
 * @param my - 支付宝全局 `my`，只用 `arrayBufferToBase64`
 */
export function createAlipayFileSystem(
  raw: MiniProgramAlipayRawFileSystem,
  my: Base64Encoder
): MiniProgramFileSystemManager {
  const methods: MiniProgramFileSystemManager = {
    accessSync: path => void unwrapAlipayFsResult('accessSync', path, raw.accessSync(path)),
    mkdirSync: (path, recursive) => void unwrapAlipayFsResult('mkdirSync', path, raw.mkdirSync(path, recursive)),
    readFileSync: path => readFramed(raw, my, path),
    writeFileSync: (path, data) => writeFramed(raw, my, path, data),
    unlinkSync: path => void unwrapAlipayFsResult('unlinkSync', path, raw.unlinkSync(path))
  };
  const available = Object.entries(methods).filter(([name]) => typeof Reflect.get(raw, name) === 'function');
  // 缺方法时有意交出不完整的对象：预检按方法名逐个核对并列出缺失项
  return Object.fromEntries(available) as unknown as MiniProgramFileSystemManager;
}

/** 读代码包里的文件；路径相对代码包根（模拟器实测只有相对路径可读）。 */
export interface AlipayCodePackageReader {
  /** 读二进制。模拟器把代码包文件当 UTF-8 文本读，非法字节序列会变成 `EF BF BD`，读到的未必是原样。 */
  readBinarySync(path: string): ArrayBuffer;
  /** 按 UTF-8 读文本。 */
  readTextSync(path: string): string;
}

/**
 * 代码包读取器：给 wasm 运行时用，不经分帧层。
 *
 * @param raw - `my.getFileSystemManager()` 的返回值
 */
export function createAlipayCodePackageReader(raw: MiniProgramAlipayRawFileSystem): AlipayCodePackageReader {
  return {
    readBinarySync: path => readBinary(raw, path),
    readTextSync: path => {
      const result = unwrapAlipayFsResult('readFileSync', path, raw.readFileSync(path, 'utf8'));
      return resultData(path, result, '[object String]') as string;
    }
  };
}
