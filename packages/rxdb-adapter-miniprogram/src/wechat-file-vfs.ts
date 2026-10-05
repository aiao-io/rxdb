import { errorMessage } from './error-message.js';
import { assertMiniProgramHostPlatform, createWechatMiniProgramHost } from './host.js';
import type {
  MiniProgramFileLayout,
  MiniProgramFileSystemManager,
  MiniProgramHost,
  MiniProgramWechatApi,
  WaSqliteEmscriptenModule
} from './mini-program.interface.js';
import { resolveMiniProgramRuntimeGlobal } from './runtime-global.js';
import type { SQLiteVFS } from './wa-sqlite.interface.js';

const SQLITE_OK = 0;
const SQLITE_IOERR = 10;
const SQLITE_NOTFOUND = 12;
const SQLITE_FULL = 13;
const SQLITE_CANTOPEN = 14;
const SQLITE_IOERR_READ = 266;
const SQLITE_IOERR_SHORT_READ = 522;
const SQLITE_IOERR_WRITE = 778;
const SQLITE_IOERR_TRUNCATE = 1546;
const SQLITE_IOERR_FSTAT = 1802;
const SQLITE_IOERR_DELETE = 2570;
const SQLITE_IOERR_ACCESS = 3338;
const SQLITE_IOERR_CLOSE = 4106;

const SQLITE_OPEN_READWRITE = 0x00000002;
const SQLITE_OPEN_CREATE = 0x00000004;
const SQLITE_OPEN_DELETEONCLOSE = 0x00000008;
const SQLITE_OPEN_MAIN_DB = 0x00000100;
const SQLITE_OPEN_TEMP_DB = 0x00000200;
const SQLITE_OPEN_TRANSIENT_DB = 0x00000400;
const SQLITE_OPEN_TEMP_JOURNAL = 0x00001000;
const SQLITE_OPEN_SUBJOURNAL = 0x00002000;
const SQLITE_OPEN_MAIN_JOURNAL = 0x00000800;
const SQLITE_OPEN_SUPER_JOURNAL = 0x00004000;

const VFS_MAX_PATHNAME = 512;
const CANONICAL_FILENAME_PREFIX = 'rxdb-';
const CANONICAL_FILENAME_PATTERN = /^(?:[a-zA-Z0-9._-]|%[0-9A-F]{2})*$/;
const SAFE_FILENAME_CHARACTER_PATTERN = /^[a-zA-Z0-9._-]$/;
const ACTIVE_DATABASES = new Set<string>();
const SINGLE_FILE_LAYOUT: MiniProgramFileLayout = { kind: 'single' };
/** 回滚余量文件的后缀，接在主库路径后面；不以 `.数字` 结尾，不会与任何块重名。 */
const RESERVE_SUFFIX = '.rxdb-reserve';

/** 从宿主全局对象上已引导的 `crypto.getRandomValues` 填充安全随机数。 */
function fillSecureRandomValues(host: MiniProgramHost, target: Uint8Array<ArrayBuffer>): void {
  const cryptoApi = resolveMiniProgramRuntimeGlobal(host).crypto;
  if (typeof cryptoApi?.getRandomValues !== 'function') {
    throw new Error(`${host.displayName}安全随机源尚未引导`);
  }
  cryptoApi.getRandomValues(target);
}

interface BufferedFile {
  readonly path: string;
  data: Uint8Array;
  dirty: boolean;
  /** 块大小；单文件布局为 `Infinity`，任何位置都落在第 0 块。 */
  readonly chunkBytes: number;
  /** 写过、尚未落盘的块号。 */
  readonly dirtyChunks: Set<number>;
  /** 各块已落盘的字节数，按块号排列。 */
  persistedChunkSizes: number[];
  readonly writable: boolean;
  deleteOnClose: boolean;
  main: boolean;
}

/** 逻辑文件到宿主文件的映射；单文件与分块两种布局各一个实现。 */
interface FileStore {
  /** 逻辑文件是否存在；缺失返回 false，其余错误原样抛出。 */
  exists(path: string): boolean;
  /** 存在则整份读入，`create` 为 true 时不存在则新建空文件。 */
  open(path: string, create: boolean, writable: boolean): BufferedFile;
  /** 把改动落盘；失败时已落盘的部分如实记账，剩余改动留待下次。 */
  flush(file: BufferedFile): void;
  /** 删除逻辑文件；本来就不存在不算错，其余错误原样抛出。 */
  remove(path: string): void;
}

interface MiniProgramSQLiteVFS extends SQLiteVFS {
  xRandomness(pVfs: number, length: number, output: number): number;
  xSleep(pVfs: number, microseconds: number): number;
  xCurrentTime(pVfs: number, julianDay: number): number;
  xCurrentTimeInt64(pVfs: number, time: number): number;
  xShmMap(): number;
  xShmLock(): number;
  xShmBarrier(): void;
  xShmUnmap(): number;
}

/** 微信文件 VFS 配置。 */
export interface WechatFileVFSOptions {
  /** 微信小程序全局 `wx`。 */
  wechat: MiniProgramWechatApi;
  /** 数据库文件目录。 */
  root?: string;
  /** 用于清理数据库文件的名称。 */
  databaseName: string;
  /** VFS 名称。 */
  name?: string;
  /** 测试或宿主注入的文件系统。 */
  fileSystem?: MiniProgramFileSystemManager;
}

/** 平台无关的小程序文件 VFS 配置。 */
export interface MiniProgramFileVFSOptions {
  /** 小程序宿主，提供同步文件系统、默认目录与报错名称。 */
  host: MiniProgramHost;
  /** 数据库文件目录。默认 `${host.userDataPath}/rxdb-wa-sqlite`。 */
  root?: string;
  /** 用于清理数据库文件的名称。 */
  databaseName: string;
  /** VFS 名称。默认 `${host.platform}-file`。 */
  name?: string;
  /** 测试或宿主注入的文件系统，优先于 `host.getFileSystemManager()`。 */
  fileSystem?: MiniProgramFileSystemManager;
}

/** 小程序同步文件 VFS 句柄。 */
export interface MiniProgramFileVFS {
  readonly vfs: SQLiteVFS;
  readonly root: string;
  readonly lastError: Error | null;
  /**
   * 是否占着回滚余量。只有分块布局会占；单文件布局恒为 false。
   *
   * 新建主 journal 前占 2×`chunkBytes`，撞配额时让出给回滚。占不到（配额已满）不阻止打开，
   * 但这时撞配额后的回滚可能没空间，调用方据此决定要不要先腾空间。
   */
  readonly reserveHeld: boolean;
  clear(): void;
}

/** 微信同步文件 VFS 句柄。 */
export type WechatFileVFS = MiniProgramFileVFS;

function isMissingFileError(error: unknown): boolean {
  return /no such|not exist|doesn['\u2019]?t exist|ENOENT|not found|\u4e0d\u5b58\u5728|\u627e\u4e0d\u5230/i.test(
    errorMessage(error)
  );
}

/** 「已存在」文案；先排除缺失类，`does not exist` 里的 exist 不算。 */
function isAlreadyExistsError(error: unknown): boolean {
  return !isMissingFileError(error) && /already exist|file exists|EEXIST|\u5df2\u5b58\u5728/i.test(errorMessage(error));
}

/**
 * 落盘撞上存储配额。
 *
 * @remarks
 * 只认文案：抖音实测 `writeFileSync:fail user dir saved file size limit exceeded`（模拟器与 iOS 一致），
 * 微信文档 `the maximum size of the file storage limit is exceeded`。不按 errNo 判：抖音的 21103
 * 同时表示 readFile 缺失。
 */
function isQuotaExceededError(error: unknown): boolean {
  return /size limit exceeded|storage limit is exceeded/i.test(errorMessage(error));
}

/** 配额错误报 `SQLITE_FULL`，SQLite 据此回滚并把 13 交给调用方；其余报调用方给的 I/O 错误码。 */
function failureCode(error: unknown, ioErrorCode: number): number {
  return isQuotaExceededError(error) ? SQLITE_FULL : ioErrorCode;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(errorMessage(error), { cause: error });
}

function writeInt64(module: WaSqliteEmscriptenModule, address: number, value: number): void {
  const safeValue = Math.max(0, Number(value) || 0);
  const index = address >> 2;
  // 走 HEAP32 而非 HEAPU32：后者只存在于 glue 闭包内部。Int32Array 赋值经 ToInt32
  // 只保留低 32 位，写进内存的字节与 HEAPU32 完全一致（wasm 恒为小端）。
  module.HEAP32[index] = safeValue >>> 0;
  module.HEAP32[index + 1] = Math.floor(safeValue / 0x100000000) >>> 0;
}

function copyCString(module: WaSqliteEmscriptenModule, text: string, address: number, length: number): number {
  module.stringToUTF8(text, address, length);
  return SQLITE_OK;
}

function writeDouble(module: WaSqliteEmscriptenModule, address: number, value: number): void {
  // HEAPF64 未挂到模块对象上，只能经 glue 导出的 setValue 写入。
  module.setValue(address, value, 'double');
}

function basename(name: string): string {
  const raw = String(name);
  const withoutQuery = raw.split('?')[0].replace(/\\/g, '/');
  const lastSlash = withoutQuery.lastIndexOf('/');
  return lastSlash === -1 ? withoutQuery : withoutQuery.slice(lastSlash + 1);
}

/** 将不可信文件名编码为 `rxdb-` + percent 编码的安全路径段。 */
function encodeFilename(name: string): string {
  let result = CANONICAL_FILENAME_PREFIX;
  for (const character of name) {
    if (SAFE_FILENAME_CHARACTER_PATTERN.test(character)) {
      result += character;
      continue;
    }
    const encoded = encodeURIComponent(character);
    if (encoded !== character) {
      result += encoded;
      continue;
    }
    for (let index = 0; index < character.length; index++) {
      result += `%${character.charCodeAt(index).toString(16).padStart(2, '0').toUpperCase()}`;
    }
  }
  return result;
}

/** 解码已编码文件名的规范路径，非规范路径返回 `null`。 */
function canonicalFilePath(name: string, root: string): string | null {
  const normalized = String(name).split('?')[0].replace(/\\/g, '/');
  const prefix = `${root}/${CANONICAL_FILENAME_PREFIX}`;
  if (!normalized.startsWith(prefix)) return null;
  const filename = normalized.slice(prefix.length);
  if (!CANONICAL_FILENAME_PATTERN.test(filename)) return null;
  return normalized;
}

function makeFilePath(name: string, root: string): string {
  return canonicalFilePath(name, root) ?? `${root}/${encodeFilename(basename(name))}`;
}

function mkdirRecursive(fileSystem: MiniProgramFileSystemManager, directory: string): void {
  try {
    fileSystem.mkdirSync(directory, true);
  } catch (error) {
    if (!isAlreadyExistsError(error)) throw error;
  }
}

/** 文件是否存在；缺失返回 false，其余错误原样抛出。 */
function probeFile(fileSystem: MiniProgramFileSystemManager, path: string): boolean {
  try {
    fileSystem.accessSync(path);
    return true;
  } catch (error) {
    if (isMissingFileError(error)) return false;
    throw error;
  }
}

function fileExists(fileSystem: MiniProgramFileSystemManager, path: string): boolean {
  try {
    return probeFile(fileSystem, path);
  } catch (error) {
    throw new Error(`accessSync ${path}: ${errorMessage(error)}`, { cause: error });
  }
}

/** 删除文件；本来就不存在不算错，其余错误原样抛出。 */
function unlinkIfExists(fileSystem: MiniProgramFileSystemManager, path: string): void {
  try {
    fileSystem.unlinkSync(path);
  } catch (error) {
    if (!isMissingFileError(error)) throw error;
  }
}

/** 自定义 Base64 解码（不依赖 `atob`）。 */
function decodeBase64(text: string): Uint8Array {
  if (text.length === 0) return new Uint8Array(0);
  if (text.length % 4 !== 0) throw new Error('invalid base64 length');

  const value = (code: number): number => {
    if (code >= 65 && code <= 90) return code - 65;
    if (code >= 97 && code <= 122) return code - 71;
    if (code >= 48 && code <= 57) return code + 4;
    if (code === 43) return 62;
    if (code === 47) return 63;
    return -1;
  };
  const padding =
    text.endsWith('==') ? 2
    : text.endsWith('=') ? 1
    : 0;
  const result = new Uint8Array((text.length / 4) * 3 - padding);
  let output = 0;

  for (let index = 0; index < text.length; index += 4) {
    const a = value(text.charCodeAt(index));
    const b = value(text.charCodeAt(index + 1));
    const c = text.charCodeAt(index + 2) === 61 ? 0 : value(text.charCodeAt(index + 2));
    const d = text.charCodeAt(index + 3) === 61 ? 0 : value(text.charCodeAt(index + 3));
    if (a < 0 || b < 0 || c < 0 || d < 0) throw new Error('invalid base64 character');
    if (output < result.length) result[output++] = (a << 2) | (b >> 4);
    if (output < result.length) result[output++] = ((b & 15) << 4) | (c >> 2);
    if (output < result.length) result[output++] = ((c & 3) << 6) | d;
  }
  return result;
}

function bufferedFile(
  path: string,
  data: Uint8Array,
  writable: boolean,
  chunkBytes: number,
  persistedChunkSizes: number[]
): BufferedFile {
  return {
    path,
    data,
    dirty: false,
    chunkBytes,
    dirtyChunks: new Set(),
    persistedChunkSizes,
    writable,
    deleteOnClose: false,
    main: false
  };
}

function readWholeFile(fileSystem: MiniProgramFileSystemManager, path: string): Uint8Array {
  let encoded: string;
  try {
    encoded = fileSystem.readFileSync(path, 'base64');
  } catch (error) {
    throw new Error(`readFileSync(base64): ${errorMessage(error)}`, { cause: error });
  }
  return decodeBase64(encoded);
}

function createEmptyFile(fileSystem: MiniProgramFileSystemManager, path: string): void {
  try {
    fileSystem.writeFileSync(path, new ArrayBuffer(0));
  } catch (error) {
    throw new Error(`writeFileSync(create): ${errorMessage(error)}`, { cause: error });
  }
}

function writeWholeFile(fileSystem: MiniProgramFileSystemManager, path: string, data: Uint8Array): void {
  const copy = Uint8Array.from(data);
  try {
    fileSystem.writeFileSync(path, copy.buffer);
  } catch (error) {
    throw new Error(`writeFileSync ${path}: ${errorMessage(error)}`, { cause: error });
  }
}

/** 单文件布局：一个逻辑文件一个宿主文件，整文件覆盖写。 */
function createSingleFileStore(fileSystem: MiniProgramFileSystemManager): FileStore {
  return {
    exists: path => probeFile(fileSystem, path),
    open(path, create, writable) {
      if (fileExists(fileSystem, path)) {
        const data = readWholeFile(fileSystem, path);
        return bufferedFile(path, data, writable, Number.POSITIVE_INFINITY, [data.length]);
      }
      if (!create) throw new Error(`file does not exist: ${path}`);
      createEmptyFile(fileSystem, path);
      return bufferedFile(path, new Uint8Array(0), writable, Number.POSITIVE_INFINITY, [0]);
    },
    flush(file) {
      if (!file.dirty) return;
      writeWholeFile(fileSystem, file.path, file.data);
      file.persistedChunkSizes = [file.data.length];
      file.dirtyChunks.clear();
      file.dirty = false;
    },
    remove: path => unlinkIfExists(fileSystem, path)
  };
}

function chunkPath(path: string, index: number): string {
  return `${path}.${index}`;
}

/** 从 `from` 号块起顺序探测，返回第一个缺失的块号。 */
function probeChunkEnd(fileSystem: MiniProgramFileSystemManager, path: string, from: number): number {
  let index = from;
  while (fileExists(fileSystem, chunkPath(path, index))) index++;
  return index;
}

/** 倒序删掉 `[from, end)` 号块：中途失败时剩下的块号仍连续。 */
function removeChunksDescending(
  fileSystem: MiniProgramFileSystemManager,
  path: string,
  from: number,
  end: number
): void {
  for (let index = end - 1; index >= from; index--) unlinkIfExists(fileSystem, chunkPath(path, index));
}

function assertChunkIntact(path: string, index: number, size: number, chunkBytes: number, last: boolean): void {
  if (size > chunkBytes || (!last && size !== chunkBytes)) {
    throw new Error(
      `分块文件损坏: ${chunkPath(path, index)} 有 ${size} 字节，块大小 ${chunkBytes}，${last ? '末块' : '非末块'}`
    );
  }
}

function loadChunkedFile(
  fileSystem: MiniProgramFileSystemManager,
  path: string,
  writable: boolean,
  chunkBytes: number
): BufferedFile {
  const end = probeChunkEnd(fileSystem, path, 0);
  const chunks: Uint8Array[] = [];
  for (let index = 0; index < end; index++) {
    const chunk = readWholeFile(fileSystem, chunkPath(path, index));
    assertChunkIntact(path, index, chunk.length, chunkBytes, index === end - 1);
    chunks.push(chunk);
  }
  const data = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  chunks.forEach((chunk, index) => data.set(chunk, index * chunkBytes));
  return bufferedFile(
    path,
    data,
    writable,
    chunkBytes,
    chunks.map(chunk => chunk.length)
  );
}

/**
 * 写一个块并记下落盘大小。新块写失败时宿主可能留下 0 字节文件（抖音模拟器 v9 实测撞配额即如此），
 * 先按 0 记进已落盘块，截断才会删到它；不记的话它会落在块号空洞之后，日后库长回来就成了「非末块不满」。
 */
function writeChunk(
  fileSystem: MiniProgramFileSystemManager,
  file: BufferedFile,
  index: number,
  chunk: Uint8Array
): void {
  if (index >= file.persistedChunkSizes.length) file.persistedChunkSizes[index] = 0;
  writeWholeFile(fileSystem, chunkPath(file.path, index), chunk);
  file.persistedChunkSizes[index] = chunk.length;
}

/**
 * 分块布局：逻辑文件 `P` 存成 `P.0`、`P.1`…，`P.0` 恒存在（可为空）充当存在标记。
 *
 * 块号恒连续、除末块外都是满块。截断先倒序删尾块再写，删除先删 `P.0` 再倒序删其余，
 * 新建前清掉没有 `P.0` 的残块：中途崩溃时宿主上剩下的仍满足这两条，或者整个文件已消失。
 */
function createChunkedFileStore(fileSystem: MiniProgramFileSystemManager, chunkBytes: number): FileStore {
  return {
    exists: path => probeFile(fileSystem, chunkPath(path, 0)),
    open(path, create, writable) {
      if (fileExists(fileSystem, chunkPath(path, 0))) return loadChunkedFile(fileSystem, path, writable, chunkBytes);
      if (!create) throw new Error(`file does not exist: ${path}`);
      removeChunksDescending(fileSystem, path, 1, probeChunkEnd(fileSystem, path, 1));
      createEmptyFile(fileSystem, chunkPath(path, 0));
      return bufferedFile(path, new Uint8Array(0), writable, chunkBytes, [0]);
    },
    flush(file) {
      if (!file.dirty) return;
      const count = Math.max(1, Math.ceil(file.data.length / chunkBytes));
      for (let index = file.persistedChunkSizes.length - 1; index >= count; index--) {
        unlinkIfExists(fileSystem, chunkPath(file.path, index));
        file.persistedChunkSizes.length = index;
      }
      for (let index = 0; index < count; index++) {
        const chunk = file.data.subarray(index * chunkBytes, (index + 1) * chunkBytes);
        if (!file.dirtyChunks.has(index) && file.persistedChunkSizes[index] === chunk.length) continue;
        writeChunk(fileSystem, file, index, chunk);
        file.dirtyChunks.delete(index);
      }
      file.dirtyChunks.clear();
      file.dirty = false;
    },
    remove(path) {
      const end = probeChunkEnd(fileSystem, path, 1);
      unlinkIfExists(fileSystem, chunkPath(path, 0));
      removeChunksDescending(fileSystem, path, 1, end);
    }
  };
}

function requireFile(files: Map<number, BufferedFile>, pointer: number): BufferedFile {
  const file = files.get(pointer);
  if (!file) throw new Error(`unknown SQLite file handle: ${pointer}`);
  return file;
}

function readFile(
  file: BufferedFile,
  module: WaSqliteEmscriptenModule,
  output: number,
  length: number,
  position: number
): number {
  const bytesRead = Math.max(0, Math.min(length, file.data.length - position));
  if (bytesRead > 0) module.HEAPU8.set(file.data.subarray(position, position + bytesRead), output);
  return bytesRead;
}

function writeFile(
  file: BufferedFile,
  module: WaSqliteEmscriptenModule,
  input: number,
  length: number,
  position: number
): void {
  if (!file.writable) throw new Error(`file is read-only: ${file.path}`);
  const required = position + length;
  if (required > file.data.length) {
    const expanded = new Uint8Array(required);
    expanded.set(file.data);
    file.data = expanded;
  }
  file.data.set(module.HEAPU8.subarray(input, input + length), position);
  markDirty(file, position, required);
}

/** 把字节区间 `[start, end)` 覆盖到的块标脏；内容变了就得重写，不能只看块长度。 */
function markDirty(file: BufferedFile, start: number, end: number): void {
  const lastChunk = Math.floor((end - 1) / file.chunkBytes);
  for (let index = Math.floor(start / file.chunkBytes); index <= lastChunk; index++) file.dirtyChunks.add(index);
  file.dirty = true;
}

function truncateFile(file: BufferedFile, size: number): void {
  if (!file.writable) throw new Error(`file is read-only: ${file.path}`);
  if (size === file.data.length) return;
  const resized = new Uint8Array(size);
  resized.set(file.data.subarray(0, Math.min(size, file.data.length)));
  markDirty(file, Math.min(size, file.data.length), Math.max(size, file.data.length));
  file.data = resized;
}

/** 将 two 32-bit words 合并为一个 JS number。 */
function combineUint64(low: number, high: number): number {
  return high * 0x100000000 + low + (low < 0 ? 0x100000000 : 0);
}

/** 创建单连接、回滚日志模式的微信同步文件 VFS；`createMiniProgramFileVFS` 的微信封装。 */
export function createWechatFileVFS(module: WaSqliteEmscriptenModule, options: WechatFileVFSOptions): WechatFileVFS {
  const { wechat, ...rest } = options;
  return createMiniProgramFileVFS(module, { ...rest, host: createWechatMiniProgramHost(wechat) });
}

function resolveFileSystem(options: MiniProgramFileVFSOptions): MiniProgramFileSystemManager {
  const fileSystem = options.fileSystem ?? options.host.getFileSystemManager();
  if (fileSystem) return fileSystem;
  throw new Error(`${options.host.displayName}缺少 ${options.host.capabilityNames.fileSystem}`);
}

/** 校验并补全存储布局；未知布局与非正整数块大小直接拒绝，不回退到单文件。 */
function resolveFileLayout(host: MiniProgramHost): MiniProgramFileLayout {
  const layout = host.fileLayout ?? SINGLE_FILE_LAYOUT;
  if (layout.kind === 'single') return layout;
  if (layout.kind !== 'chunked') {
    throw new TypeError(
      `${host.displayName}的 host.fileLayout.kind 未知: ${String((layout as { kind: unknown }).kind)}`
    );
  }
  if (!Number.isInteger(layout.chunkBytes) || layout.chunkBytes <= 0) {
    throw new TypeError(`${host.displayName}的 host.fileLayout.chunkBytes 必须是正整数: ${layout.chunkBytes}`);
  }
  return layout;
}

/**
 * 存储布局的比较键：`single` 或 `chunked:<chunkBytes>`。
 *
 * @internal 供客户端身份比较，同一数据库的两次 init 布局不同即冲突。
 */
export function describeFileLayout(layout: MiniProgramFileLayout | undefined): string {
  return layout === undefined || layout.kind === 'single' ? 'single' : `chunked:${layout.chunkBytes}`;
}

function resolveRoot(options: MiniProgramFileVFSOptions): string {
  if (options.root === '') throw new Error('数据库目录不能为空串');
  if (options.root !== undefined) return options.root;
  const { host } = options;
  if (!host.userDataPath) {
    throw new Error(`${host.displayName}缺少 ${host.capabilityNames.userDataPath}，无法推导数据库目录`);
  }
  return `${host.userDataPath}/rxdb-wa-sqlite`;
}

/**
 * 创建单连接、回滚日志模式的小程序同步文件 VFS。
 *
 * 整库缓冲在内存、落盘走 `writeFileSync`；所有宿主共享同一张模块级单连接表，
 * 同一数据库文件的第二个连接直接拒绝，不指望小程序提供文件锁。
 * 存储布局由 `host.fileLayout` 决定，见 {@link MiniProgramFileLayout}。
 */
export function createMiniProgramFileVFS(
  module: WaSqliteEmscriptenModule,
  options: MiniProgramFileVFSOptions
): MiniProgramFileVFS {
  const { host } = options;
  assertMiniProgramHostPlatform(host);
  const fileSystem = resolveFileSystem(options);
  const root = resolveRoot(options);
  const databaseName = basename(options.databaseName);
  const activeDatabase = makeFilePath(databaseName, root);
  const layout = resolveFileLayout(host);
  const store =
    layout.kind === 'chunked' ?
      createChunkedFileStore(fileSystem, layout.chunkBytes)
    : createSingleFileStore(fileSystem);
  const reservePath = layout.kind === 'chunked' ? `${activeDatabase}${RESERVE_SUFFIX}` : null;
  const reserveBytes = layout.kind === 'chunked' ? 2 * layout.chunkBytes : 0;
  const files = new Map<number, BufferedFile>();
  let temporaryId = 0;
  let lastError: Error | null = null;
  let closed = false;
  let reserveHeld = false;

  mkdirRecursive(fileSystem, root);
  if (layout.kind === 'chunked' && fileExists(fileSystem, activeDatabase)) {
    throw new Error(`${host.shortName}文件 VFS 声明了分块布局，但 ${activeDatabase} 是单文件布局`);
  }
  if (layout.kind === 'single' && fileExists(fileSystem, chunkPath(activeDatabase, 0))) {
    throw new Error(`${host.shortName}文件 VFS 声明了单文件布局，但 ${activeDatabase} 是分块布局`);
  }
  if (ACTIVE_DATABASES.has(activeDatabase)) {
    throw new Error(`${host.shortName}文件 VFS 不支持同一数据库的并发连接: ${activeDatabase}`);
  }
  ACTIVE_DATABASES.add(activeDatabase);

  /**
   * 占回滚余量；已有大小正确的余量文件直接认领，配额不够时不占，其余错误抛出。
   * 写撞配额时宿主可能留下 0 字节文件（抖音模拟器 v9），删掉它，免得下次被当成余量认领。
   */
  const holdReserve = (path: string): void => {
    if (reserveHeld) return;
    if (fileExists(fileSystem, path) && readWholeFile(fileSystem, path).length === reserveBytes) {
      reserveHeld = true;
      return;
    }
    try {
      fileSystem.writeFileSync(path, new ArrayBuffer(reserveBytes));
      reserveHeld = true;
    } catch (error) {
      if (!isQuotaExceededError(error))
        throw new Error(`writeFileSync ${path}: ${errorMessage(error)}`, { cause: error });
      unlinkFailedReserve(path, error);
    }
  };

  const unlinkFailedReserve = (path: string, failure: unknown): void => {
    try {
      unlinkIfExists(fileSystem, path);
    } catch (error) {
      throw new Error(`占回滚余量撞配额（${errorMessage(failure)}）后删除残留 ${path} 失败: ${errorMessage(error)}`, {
        cause: error
      });
    }
  };

  /** 撞配额时让出余量给 SQLite 随后的回滚；让不出来也照报原错误，并把原因接在后面。 */
  const releaseReserve = (failure: Error): Error => {
    if (!reserveHeld || reservePath === null) return failure;
    try {
      unlinkIfExists(fileSystem, reservePath);
      reserveHeld = false;
      return failure;
    } catch (error) {
      return new Error(`${failure.message}；让出回滚余量 ${reservePath} 失败: ${errorMessage(error)}`, {
        cause: failure
      });
    }
  };

  /** 落盘失败：配额错误报 `SQLITE_FULL` 并让出余量，其余报 `ioErrorCode`。 */
  const flushFailure = (error: unknown, ioErrorCode: number): number => {
    const code = failureCode(error, ioErrorCode);
    lastError = code === SQLITE_FULL ? releaseReserve(toError(error)) : toError(error);
    return code;
  };

  const vfs: MiniProgramSQLiteVFS = {
    name: options.name ?? `${host.platform}-file`,
    mxPathname: VFS_MAX_PATHNAME,
    close: () => {
      if (closed) return;
      try {
        for (const file of files.values()) store.flush(file);
      } finally {
        files.clear();
        ACTIVE_DATABASES.delete(activeDatabase);
        closed = true;
      }
    },
    isReady: () => true,
    hasAsyncMethod: () => false,

    xOpen(_pVfs, zName, pFile, flags, pOutFlags) {
      let path = '';
      // 初值直接给第一段：try 的第一条语句之前没有能抛的代码，catch 永远读不到更早的值。
      // 但声明处不能不给值 —— catch 读 stage，TS 会判 TS2454（used before being assigned）。
      let stage = 'decode-name';
      try {
        const name = zName ? module.UTF8ToString(zName) : `temporary-${Date.now()}-${++temporaryId}-${pFile >>> 0}`;
        stage = 'make-path';
        path = makeFilePath(name, root);
        const temporary = !!(
          flags &
          (SQLITE_OPEN_TEMP_DB |
            SQLITE_OPEN_TRANSIENT_DB |
            SQLITE_OPEN_TEMP_JOURNAL |
            SQLITE_OPEN_SUBJOURNAL |
            SQLITE_OPEN_SUPER_JOURNAL)
        );
        stage = 'reserve';
        // 已有热 journal 时不占：那点空间正是回滚要用的
        if (reservePath !== null && flags & SQLITE_OPEN_MAIN_JOURNAL && !store.exists(path)) holdReserve(reservePath);
        stage = 'open-file';
        const file = store.open(path, !!(flags & SQLITE_OPEN_CREATE) || temporary, !!(flags & SQLITE_OPEN_READWRITE));
        stage = 'track-file';
        file.deleteOnClose = !!(flags & SQLITE_OPEN_DELETEONCLOSE) || temporary;
        file.main = !!(flags & SQLITE_OPEN_MAIN_DB);
        files.set(pFile, file);
        stage = 'write-out-flags';
        if (pOutFlags !== 0) module.HEAP32[pOutFlags >> 2] = flags | 0;
        lastError = null;
        return SQLITE_OK;
      } catch (error) {
        files.delete(pFile);
        lastError = new Error(
          `xOpen stage=${stage} ${path || '(unknown path)'} flags=0x${(flags >>> 0).toString(16)}: ${errorMessage(error)}`,
          { cause: error }
        );
        return failureCode(error, SQLITE_CANTOPEN);
      }
    },

    xClose(pFile) {
      const file = files.get(pFile);
      if (!file) return SQLITE_OK;
      // SQLite 不看 xClose 的返回值，句柄无论成败都要释放：留在表里，vfs.close 会再落一次盘再抛一次。
      // 没落下去的改动随之丢弃，与真实文件系统上写失败一致；日志与主库靠 SQLite 自己的回滚兜住
      files.delete(pFile);
      try {
        if (file.deleteOnClose) store.remove(file.path);
        else store.flush(file);
        return SQLITE_OK;
      } catch (error) {
        return flushFailure(error, SQLITE_IOERR_CLOSE);
      }
    },

    xRead(pFile, output, amount, offsetLow, offsetHigh) {
      try {
        const bytesRead = readFile(
          requireFile(files, pFile),
          module,
          output,
          amount,
          combineUint64(offsetLow, offsetHigh)
        );
        if (bytesRead === amount) return SQLITE_OK;
        module.HEAPU8.fill(0, output + bytesRead, output + amount);
        return SQLITE_IOERR_SHORT_READ;
      } catch (error) {
        lastError = toError(error);
        return SQLITE_IOERR_READ;
      }
    },

    xWrite(pFile, input, amount, offsetLow, offsetHigh) {
      try {
        writeFile(requireFile(files, pFile), module, input, amount, combineUint64(offsetLow, offsetHigh));
        return SQLITE_OK;
      } catch (error) {
        lastError = toError(error);
        return SQLITE_IOERR_WRITE;
      }
    },

    xTruncate(pFile, sizeLow, sizeHigh) {
      try {
        truncateFile(requireFile(files, pFile), combineUint64(sizeLow, sizeHigh));
        return SQLITE_OK;
      } catch (error) {
        lastError = toError(error);
        return SQLITE_IOERR_TRUNCATE;
      }
    },

    xSync(pFile) {
      try {
        store.flush(requireFile(files, pFile));
        return SQLITE_OK;
      } catch (error) {
        return flushFailure(error, SQLITE_IOERR_WRITE);
      }
    },

    xFileSize(pFile, output) {
      try {
        writeInt64(module, output, requireFile(files, pFile).data.length);
        return SQLITE_OK;
      } catch (error) {
        lastError = toError(error);
        return SQLITE_IOERR_FSTAT;
      }
    },

    xLock: () => SQLITE_OK,
    xUnlock: () => SQLITE_OK,
    xCheckReservedLock(_pFile, output) {
      module.HEAP32[output >> 2] = 0;
      return SQLITE_OK;
    },
    xFileControl: () => SQLITE_NOTFOUND,

    xDelete(_pVfs, zName) {
      const path = makeFilePath(module.UTF8ToString(zName), root);
      try {
        store.remove(path);
        return SQLITE_OK;
      } catch (error) {
        lastError = new Error(`xDelete ${path}: ${errorMessage(error)}`, { cause: error });
        return SQLITE_IOERR_DELETE;
      }
    },

    xAccess(_pVfs, zName, _flags, output) {
      const path = makeFilePath(module.UTF8ToString(zName), root);
      try {
        module.HEAP32[output >> 2] = store.exists(path) ? 1 : 0;
        return SQLITE_OK;
      } catch (error) {
        module.HEAP32[output >> 2] = 0;
        lastError = new Error(`xAccess ${path}: ${errorMessage(error)}`, { cause: error });
        return SQLITE_IOERR_ACCESS;
      }
    },

    xFullPathname(_pVfs, zName, outputLength, output) {
      const path = makeFilePath(module.UTF8ToString(zName), root);
      const byteLength = new TextEncoder().encode(path).byteLength;
      if (byteLength > VFS_MAX_PATHNAME || byteLength >= outputLength) {
        lastError = new Error(
          `xFullPathname 路径过长: ${byteLength} bytes, outputLength=${outputLength}, mxPathname=${VFS_MAX_PATHNAME}`
        );
        return SQLITE_CANTOPEN;
      }
      lastError = null;
      return copyCString(module, path, output, outputLength);
    },

    xRandomness(_pVfs, length, output) {
      fillSecureRandomValues(host, module.HEAPU8.subarray(output, output + length));
      return length;
    },
    xSleep: () => 0,
    xCurrentTime(_pVfs, output) {
      writeDouble(module, output, Date.now() / 86400000 + 2440587.5);
      return SQLITE_OK;
    },
    xCurrentTimeInt64(_pVfs, output) {
      writeInt64(module, output, Date.now() + 210866760000000);
      return SQLITE_OK;
    },
    xGetLastError(_pVfs, outputLength, output) {
      if (lastError && outputLength > 1) copyCString(module, lastError.message, output, outputLength);
      return SQLITE_OK;
    },
    xSectorSize: () => 4096,
    xDeviceCharacteristics: () => 0,
    xShmMap: () => SQLITE_IOERR,
    xShmLock: () => SQLITE_IOERR,
    xShmBarrier: () => undefined,
    xShmUnmap: () => SQLITE_OK
  };

  return {
    vfs,
    root,
    get lastError() {
      return lastError;
    },
    get reserveHeld() {
      return reserveHeld;
    },
    clear() {
      if (files.size > 0) throw new Error(`关闭数据库后才能清理${host.shortName} VFS 文件`);
      for (const suffix of ['', '-journal', '-wal', '-shm'])
        store.remove(makeFilePath(`${databaseName}${suffix}`, root));
      if (reservePath === null) return;
      unlinkIfExists(fileSystem, reservePath);
      reserveHeld = false;
    }
  };
}
