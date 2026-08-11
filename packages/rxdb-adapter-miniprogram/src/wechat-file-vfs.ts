import type {
  MiniProgramFileSystemManager,
  MiniProgramWechatApi,
  WaSqliteEmscriptenModule
} from './mini-program.interface.js';
import type { SQLiteVFS } from './wa-sqlite.interface.js';

const SQLITE_OK = 0;
const SQLITE_IOERR = 10;
const SQLITE_NOTFOUND = 12;
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
const SQLITE_OPEN_SUPER_JOURNAL = 0x00004000;

const VFS_MAX_PATHNAME = 512;
const CANONICAL_FILENAME_PREFIX = 'rxdb-';
const CANONICAL_FILENAME_PATTERN = /^(?:[a-zA-Z0-9._-]|%[0-9A-F]{2})*$/;
const SAFE_FILENAME_CHARACTER_PATTERN = /^[a-zA-Z0-9._-]$/;
const ACTIVE_DATABASES = new Set<string>();

/** 从已引导的 `crypto.getRandomValues` 填充安全随机数。 */
function fillSecureRandomValues(target: Uint8Array<ArrayBuffer>): void {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.getRandomValues !== 'function') {
    throw new Error('微信小程序安全随机源尚未引导');
  }
  cryptoApi.getRandomValues(target);
}

interface BufferedFile {
  readonly path: string;
  data: Uint8Array;
  dirty: boolean;
  readonly writable: boolean;
  deleteOnClose: boolean;
  main: boolean;
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

/** 微信同步文件 VFS 句柄。 */
export interface WechatFileVFS {
  readonly vfs: SQLiteVFS;
  readonly root: string;
  readonly lastError: Error | null;
  clear(): void;
}

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    const candidate = error as { errMsg?: unknown; message?: unknown };
    if (typeof candidate.errMsg === 'string') return candidate.errMsg;
    if (typeof candidate.message === 'string') return candidate.message;
  }
  return String(error);
}

function isMissingFileError(error: unknown): boolean {
  return /no such|not exist|doesn['\u2019]?t exist|ENOENT|not found|\u4e0d\u5b58\u5728|\u627e\u4e0d\u5230/i.test(
    errorMessage(error)
  );
}

function writeInt64(module: WaSqliteEmscriptenModule, address: number, value: number): void {
  const safeValue = Math.max(0, Number(value) || 0);
  module.HEAPU32[address >> 2] = safeValue >>> 0;
  module.HEAPU32[(address >> 2) + 1] = Math.floor(safeValue / 0x100000000) >>> 0;
}

function copyCString(module: WaSqliteEmscriptenModule, text: string, address: number, length: number): number {
  module.stringToUTF8(text, address, length);
  return SQLITE_OK;
}

function writeDouble(module: WaSqliteEmscriptenModule, address: number, value: number): void {
  module.HEAPF64[address >> 3] = value;
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
    if (!/exist|already/i.test(errorMessage(error))) throw error;
  }
}

function fileExists(fileSystem: MiniProgramFileSystemManager, path: string): boolean {
  try {
    fileSystem.accessSync(path);
    return true;
  } catch (error) {
    if (isMissingFileError(error)) return false;
    throw new Error(`accessSync ${path}: ${errorMessage(error)}`, { cause: error });
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

/** 打开文件（存在则读取，`create` 为 true 时不存在则创建）。 */
function openBufferedFile(
  fileSystem: MiniProgramFileSystemManager,
  path: string,
  create: boolean,
  writable: boolean
): BufferedFile {
  if (fileExists(fileSystem, path)) {
    let encoded: string;
    try {
      encoded = fileSystem.readFileSync(path, 'base64');
    } catch (error) {
      throw new Error(`readFileSync(base64): ${errorMessage(error)}`, { cause: error });
    }
    return { path, data: decodeBase64(encoded), dirty: false, writable, deleteOnClose: false, main: false };
  }
  if (!create) throw new Error(`file does not exist: ${path}`);

  try {
    fileSystem.writeFileSync(path, new ArrayBuffer(0));
  } catch (error) {
    throw new Error(`writeFileSync(create): ${errorMessage(error)}`, { cause: error });
  }
  return { path, data: new Uint8Array(0), dirty: false, writable, deleteOnClose: false, main: false };
}

function flushFile(fileSystem: MiniProgramFileSystemManager, file: BufferedFile): void {
  if (!file.dirty) return;
  const copy = Uint8Array.from(file.data);
  fileSystem.writeFileSync(file.path, copy.buffer);
  file.dirty = false;
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
  file.dirty = true;
}

function truncateFile(file: BufferedFile, size: number): void {
  if (!file.writable) throw new Error(`file is read-only: ${file.path}`);
  if (size === file.data.length) return;
  const resized = new Uint8Array(size);
  resized.set(file.data.subarray(0, Math.min(size, file.data.length)));
  file.data = resized;
  file.dirty = true;
}

/** 将 two 32-bit words 合并为一个 JS number。 */
function combineUint64(low: number, high: number): number {
  return high * 0x100000000 + low + (low < 0 ? 0x100000000 : 0);
}

/** 创建单连接、回滚日志模式的微信同步文件 VFS。 */
export function createWechatFileVFS(module: WaSqliteEmscriptenModule, options: WechatFileVFSOptions): WechatFileVFS {
  const fileSystem = options.fileSystem ?? options.wechat.getFileSystemManager();
  const root = options.root ?? `${options.wechat.env.USER_DATA_PATH}/rxdb-wa-sqlite`;
  const databaseName = basename(options.databaseName);
  const activeDatabase = makeFilePath(databaseName, root);
  const files = new Map<number, BufferedFile>();
  let temporaryId = 0;
  let lastError: Error | null = null;
  let closed = false;

  mkdirRecursive(fileSystem, root);
  if (ACTIVE_DATABASES.has(activeDatabase)) {
    throw new Error(`微信文件 VFS 不支持同一数据库的并发连接: ${activeDatabase}`);
  }
  ACTIVE_DATABASES.add(activeDatabase);

  const vfs: MiniProgramSQLiteVFS = {
    name: options.name ?? 'wechat-file',
    mxPathname: VFS_MAX_PATHNAME,
    close: () => {
      if (closed) return;
      try {
        for (const file of files.values()) flushFile(fileSystem, file);
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
        const file = openBufferedFile(
          fileSystem,
          path,
          !!(flags & SQLITE_OPEN_CREATE) || temporary,
          !!(flags & SQLITE_OPEN_READWRITE)
        );
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
        return SQLITE_CANTOPEN;
      }
    },

    xClose(pFile) {
      const file = files.get(pFile);
      if (!file) return SQLITE_OK;
      try {
        flushFile(fileSystem, file);
        files.delete(pFile);
        if (file.deleteOnClose) {
          try {
            fileSystem.unlinkSync(file.path);
          } catch (error) {
            if (isMissingFileError(error)) return SQLITE_OK;
            lastError = error instanceof Error ? error : new Error(errorMessage(error), { cause: error });
            return SQLITE_IOERR_CLOSE;
          }
        }
        return SQLITE_OK;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(errorMessage(error), { cause: error });
        return SQLITE_IOERR_CLOSE;
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
        lastError = error instanceof Error ? error : new Error(errorMessage(error), { cause: error });
        return SQLITE_IOERR_READ;
      }
    },

    xWrite(pFile, input, amount, offsetLow, offsetHigh) {
      try {
        writeFile(requireFile(files, pFile), module, input, amount, combineUint64(offsetLow, offsetHigh));
        return SQLITE_OK;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(errorMessage(error), { cause: error });
        return SQLITE_IOERR_WRITE;
      }
    },

    xTruncate(pFile, sizeLow, sizeHigh) {
      try {
        truncateFile(requireFile(files, pFile), combineUint64(sizeLow, sizeHigh));
        return SQLITE_OK;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(errorMessage(error), { cause: error });
        return SQLITE_IOERR_TRUNCATE;
      }
    },

    xSync(pFile) {
      try {
        flushFile(fileSystem, requireFile(files, pFile));
        return SQLITE_OK;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(errorMessage(error), { cause: error });
        return SQLITE_IOERR_WRITE;
      }
    },

    xFileSize(pFile, output) {
      try {
        writeInt64(module, output, requireFile(files, pFile).data.length);
        return SQLITE_OK;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(errorMessage(error), { cause: error });
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
        fileSystem.unlinkSync(path);
        return SQLITE_OK;
      } catch (error) {
        if (isMissingFileError(error)) return SQLITE_OK;
        lastError = new Error(`xDelete ${path}: ${errorMessage(error)}`, { cause: error });
        return SQLITE_IOERR_DELETE;
      }
    },

    xAccess(_pVfs, zName, _flags, output) {
      const path = makeFilePath(module.UTF8ToString(zName), root);
      try {
        fileSystem.accessSync(path);
        module.HEAP32[output >> 2] = 1;
        return SQLITE_OK;
      } catch (error) {
        module.HEAP32[output >> 2] = 0;
        if (isMissingFileError(error)) return SQLITE_OK;
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
      fillSecureRandomValues(module.HEAPU8.subarray(output, output + length));
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
    clear() {
      if (files.size > 0) throw new Error('关闭数据库后才能清理微信 VFS 文件');
      for (const suffix of ['', '-journal', '-wal', '-shm']) {
        try {
          fileSystem.unlinkSync(makeFilePath(`${databaseName}${suffix}`, root));
        } catch (error) {
          if (!isMissingFileError(error)) throw error;
        }
      }
    }
  };
}
