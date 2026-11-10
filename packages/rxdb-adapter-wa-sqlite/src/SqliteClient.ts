import {
  BATCH_TIMEOUT,
  DEFAULT_BATCH_TIMEOUT,
  DEFAULT_CACHE_SIZE_KB,
  releaseComlinkProxy,
  RxDBAdapterSqliteError,
  validateSqliteNumericOption
} from '@aiao/rxdb-adapter-sqlite-core';
import { checkVFSConfig, openWaSqliteDatabase, waSqliteLoad } from './sqlite-load.utils.js';
import type { LoadModuleOptions } from './sqlite.interface.js';
import {
  WaSqliteClientBase,
  type ResolvedWaSqliteClientOptions,
  type WaSqliteClientRuntime
} from './WaSqliteClientBase.js';

export type {
  LoadedWaSqliteClientRuntime,
  ResolvedWaSqliteClientOptions,
  WaSqliteClientEvents,
  WaSqliteClientRuntime
} from './WaSqliteClientBase.js';
export { BATCH_TIMEOUT };

/** wa-sqlite 浏览器 VFS 接受的数据库名最大 UTF-8 字节数。 */
export const WA_SQLITE_MAX_DATABASE_NAME_BYTES = 49;

const VFS_FILE_SUFFIX = '.sqlite';

/** 内置 VFS 认的文件：把 `${dbName}.sqlite` 当 URL 解析后的 pathname（打开、删除共用这一个映射） */
const vfsFilePathOf = (dbName: string): string => new URL(`${dbName}${VFS_FILE_SUFFIX}`, 'file://').pathname;

const PERCENT_ESCAPES = /^(?:%[0-9A-Fa-f]{2})+$/;

/** URL 解析器在路径中间把单个字符写成什么；被截断、丢掉或换成别的字符时返回 `undefined` */
const pathFormOf = (char: string): string | undefined => {
  const path = new URL(`/x${char}y`, 'file://').pathname;
  if (!path.startsWith('/x') || !path.endsWith('y')) return undefined;
  const form = path.slice(2, -1);
  return form === char || PERCENT_ESCAPES.test(form) ? form : undefined;
};

const decodePercentEscapes = (text: string): string | undefined => {
  try {
    return decodeURIComponent(text);
  } catch {
    return undefined;
  }
};

/** 名字里从 `index` 起字面写着的转义，是否正是解析器给某个字符的写法（那个字符的名字会撞到同一个文件） */
const isProducibleEscapeAt = (dbName: string, index: number): boolean => {
  for (let width = 1; width <= 4; width++) {
    const text = dbName.slice(index, index + width * 3);
    if (text.length !== width * 3 || !PERCENT_ESCAPES.test(text)) return false;
    const char = decodePercentEscapes(text);
    if (char !== undefined && [...char].length === 1 && pathFormOf(char) === text) return true;
  }
  return false;
};

/**
 * 库名到 VFS 文件的映射必须一一对应。
 *
 * @remarks
 * 内置 VFS（MemoryVFS、IDBBatchAtomicVFS、OPFS 系）都按 `${dbName}.sqlite` 的 URL pathname 认文件：
 * 空格编码成 `%20` 而字面的 `%20` 原样保留，`tenant alice` 与 `tenant%20alice` 落到同一个文件；
 * `?` / `#` 截掉后面的部分，`\` 变成 `/`，`.` 段（含 `%2e`）被折叠，制表、换行与开头的空白被丢掉，
 * 像 scheme 的前缀把整个名字解析成别的 URL。这些名字照样打得开，读写、删除的却是别的逻辑库的文件。
 *
 * 只拒绝会与别的名字撞文件的两类：解析器做了逐字符编码以外的改写；名字里字面写着解析器自己会产出的
 * 转义（它与解出的那个字符撞）。不会撞的 `%40`、小写转义等照常放行；拒绝而不是换一套编码，
 * 换编码会让存量库按原名找不到。
 */
const assertUniqueVfsFile = (dbName: string): void => {
  const forms = [...dbName].map(pathFormOf);
  const rewritten =
    forms.some(form => form === undefined) || vfsFilePathOf(dbName) !== `/${forms.join('')}${VFS_FILE_SUFFIX}`;
  const aliased = [...dbName.matchAll(/%/g)].some(match => isProducibleEscapeAt(dbName, match.index));
  if (!rewritten && !aliased) return;
  throw new RxDBAdapterSqliteError(
    `wa-sqlite database name maps to a VFS file that another name also maps to: ` +
      `dbName=${JSON.stringify(dbName)}, file=${JSON.stringify(vfsFilePathOf(dbName))}. ` +
      'Avoid ?, #, \\, tabs, leading spaces, dot segments, scheme-like prefixes and literal percent-escapes ' +
      'the URL parser itself produces (for example %20).'
  );
};

/**
 * 在加载浏览器 VFS 前校验数据库名。
 *
 * @param dbName - 适配器的库名
 * @throws {@link RxDBAdapterSqliteError} UTF-8 字节数超过 {@link WA_SQLITE_MAX_DATABASE_NAME_BYTES}，
 *   或名字会与别的名字落到同一个 VFS 文件（`tenant alice` / `tenant%20alice`、`a?x` / `a?y` 这类）
 */
export const assertWaSqliteDatabaseName = (dbName: string): void => {
  const byteLength = new TextEncoder().encode(dbName).byteLength;
  if (byteLength > WA_SQLITE_MAX_DATABASE_NAME_BYTES) {
    throw new RxDBAdapterSqliteError(
      `wa-sqlite database name exceeds the VFS path limit: actual=${byteLength} bytes, ` +
        `maximum=${WA_SQLITE_MAX_DATABASE_NAME_BYTES} bytes, dbName=${JSON.stringify(dbName)}. ` +
        'The built-in VFS reserves 8 bytes for -journal and the adapter appends .sqlite.'
    );
  }
  assertUniqueVfsFile(dbName);
};

function resolveBrowserOptions(dbName: string, options: LoadModuleOptions): ResolvedWaSqliteClientOptions {
  assertWaSqliteDatabaseName(dbName);
  const vfs = checkVFSConfig(options);
  const batchTimeout = validateSqliteNumericOption('batchTimeout', options.batchTimeout, DEFAULT_BATCH_TIMEOUT, {
    allowZero: true
  });
  const cacheSizeKb = validateSqliteNumericOption('cacheSizeKb', options.cacheSizeKb, DEFAULT_CACHE_SIZE_KB);
  return {
    batchTimeout,
    cacheSizeKb,
    identity: {
      async: vfs.useAsync,
      batchTimeout,
      cacheSizeKb,
      dbName,
      locateFile: options.locateFile,
      sharedWorker: options.sharedWorker === true,
      vfs: vfs.name,
      wasmPath: options.wasmPath,
      worker: options.worker === true
    }
  };
}

const BROWSER_RUNTIME: WaSqliteClientRuntime<LoadModuleOptions> = {
  clientName: 'rxdb-adapter-wa-sqlite',
  load: (_dbName, options) => waSqliteLoad(options),
  resolve: resolveBrowserOptions,
  releaseListener: releaseComlinkProxy,
  open: openWaSqliteDatabase
};

/** 浏览器 wa-sqlite 客户端。 */
export class WaSqliteClient extends WaSqliteClientBase<LoadModuleOptions> {
  constructor() {
    super(BROWSER_RUNTIME);
  }
}
