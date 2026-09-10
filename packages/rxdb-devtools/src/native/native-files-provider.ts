/**
 * @fileoverview 原生文件后端的 `files` provider（US-904 阶段 D，AC#47）。
 *
 * @remarks
 * 与浏览器 OPFS provider（`browser/opfs-files-provider.ts`）**共用路径校验、共用错误码、
 * 共用传输状态机**，但有三处有意的不同，每一处都对应原生后端与 OPFS 的一条真实差异：
 *
 * 1. **`list` 只返回一层，不返回子树。** OPFS 那边返回整棵子树，是因为同源配额把规模
 *    压在一个可渲染的量级上；原生根目录不受这个约束，AC#48 的前置条件里就摆着「1001 条
 *    以上」。一次性物化整棵树意味着一个正常使用了几个月的应用会让面板卡死，而这不是
 *    加个 spinner 能解决的问题。
 *
 * 2. **`download` 的字节走 wire。** 原生文件不在 WebView 的可达范围内，页面没有任何
 *    「自己保存」的路径可走（OPFS 那边有，见该模块头第 2 条）。因此这里实现
 *    {@link DevToolsFilesProviderWithSource.createChunkSource}，字节经阶段 B 的 base64
 *    传输状态机分块送到面板，**两端都不整文件驻留**。
 *
 * 3. **路径校验做两次，这里是第一次。** 本层把 wire 上的字符串切成已校验的段
 *    （`provider/logical-path.ts`），host 侧再按自己的物理根解析并**独立**校验一次。
 *    两次校验不是冗余：本层挡的是协议层的非法输入，host 挡的是「本层被绕过」——
 *    同源脚本可以直接持 session 发请求（AC#50 的前置条件），那时本层的校验根本没跑。
 *
 * @module @aiao/rxdb-devtools/native/native-files-provider
 */

import type { DevToolsProviderDescriptor, DevToolsProviderRuntime } from '../provider/descriptor.js';
import { isValidPathSegment, joinLogicalPath, parseLogicalPath, splitLogicalPath } from '../provider/logical-path.js';
import type { DevToolsSnapshotPorts, DevToolsSnapshotResult, DevToolsSnapshotStore } from '../provider/snapshot.js';
import { createDevToolsSnapshotStore } from '../provider/snapshot.js';
import type {
  DevToolsChunkSink,
  DevToolsChunkSource,
  DevToolsProvider,
  DevToolsProviderResult
} from '../provider/types.js';
import { DEVTOOLS_MAX_INFLIGHT_REQUESTS } from '../v2/constants.js';
import { createProviderError, mapPlatformError } from '../v2/error-mapping.js';
import type { DevToolsProviderErrorCode } from '../v2/errors.js';
import { isRecord, isSafeIntegerInRange } from '../v2/guards.js';

/** 一条原生目录项。 */
export interface DevToolsNativeEntry {
  /** 条目在所属目录内的逻辑名。 */
  readonly name: string;
  /** 条目类型。 */
  readonly kind: 'directory' | 'file';
  /** 字节数；目录恒为 0。 */
  readonly size: number;
  /** 最后修改时间（epoch 毫秒）。 */
  readonly lastModified: number;
}

/**
 * provider 需要宿主提供的最小文件能力。
 *
 * @remarks
 * 刻意**不复用** `@aiao/rxdb-plugin-storage` 的 `StorageFilesystem`：那个接口是按
 * `RxdbFileStorage` 的调用点反推出来的（移动、锁后端、Blob 整读），devtools 一条都不需要，
 * 却少一件它必须有的东西——目录项的大小与时间。让 devtools 依赖那个包还会把桌面传输层
 * 拖进一个要能打进浏览器 bundle 的包里。装配层负责把两者对接（见 US-504 的
 * `@aiao/rxdb-plugin-storage/desktop`）。
 *
 * **入参是已校验的段序列，不是路径字符串**：字符串会诱导实现方再解析一次，而再解析一次
 * 就是再给一次 `..` 生效的机会。
 */
export interface DevToolsNativeFilesystem {
  /** 列出目录的直属条目；空段序列表示插件专用根。 */
  list(segments: readonly string[]): Promise<readonly DevToolsNativeEntry[]>;
  /** 取单个条目；不存在时为 `undefined`。 */
  stat(segments: readonly string[]): Promise<DevToolsNativeEntry | undefined>;
  /** 建目录；父目录一并创建。已存在时由 provider 先探测并拒绝，实现方不必处理冲突。 */
  createDirectory(segments: readonly string[]): Promise<void>;
  /** 递归删除文件或目录。 */
  remove(segments: readonly string[]): Promise<void>;
  /** 打开按需读取的字节源。 */
  openRead(segments: readonly string[]): Promise<DevToolsChunkSource>;
  /**
   * 打开一次写入。
   *
   * @remarks
   * 契约与 {@link DevToolsChunkSink} 一致：`commit()` 之前目标文件不得对其他读者可见，
   * `discard()` 必须清干净临时产物。AC#47 的「失败/取消/超时无半写文件」就落在这一条上。
   */
  openWrite(segments: readonly string[]): Promise<DevToolsChunkSink>;
}

/** 原生 `files` provider 的构造端口。 */
export interface DevToolsNativeFilesProviderPorts {
  /** 宿主文件能力。 */
  readonly filesystem: DevToolsNativeFilesystem;
  /** descriptor 声明的单次传输上限；必须是 host 的**真实**上限。 */
  readonly maxTransferBytes: number;
  /**
   * descriptor 显示用的宿主来源。
   *
   * @remarks
   * **必填、无默认值**：`kind: 'native-files'` 是宿主无关的（Electron 与 Tauri 用同一个 kind、
   * 同一套操作与状态机），能区分两端的只有这一个显示字段。给它一个默认值就等于让某一端在
   * 忘记声明时静默自称成另一端——那是一条 fallback，而不是缺省。
   *
   * 只进 descriptor，不参与任何行为分支：同一个 kind 在不同 runtime 下的操作与限额必须相同。
   */
  readonly runtime: DevToolsProviderRuntime;
  /**
   * 诊断快照端口；给定时 provider 额外提供 snapshot 物化与分页（AC#48）。
   *
   * @remarks
   * 省略即只读/写文件，`files.list` 的 `snapshot` 模式回 `provider_unsupported`。快照不是
   * 协议里独立的消息类型或操作——它经 `files.list` 的参数切换走 provider 内部的
   * {@link DevToolsSnapshotStore}，不新增 kind / 错误码 / 消息类型。
   */
  readonly snapshot?: DevToolsSnapshotPorts;
}

/** 同时具备出站字节源与入站落盘口的 `files` provider。 */
export interface DevToolsFilesProviderWithSource extends DevToolsProvider {
  /**
   * 取一次已登记上传的落盘接收器。
   *
   * @param transferId - `upload` 请求里声明的传输 ID。
   * @throws 该 ID 没有登记过上传时抛出——无主 sink 会把一处接线错误写成一个真实文件。
   * @returns 该次传输的 sink。
   */
  createChunkSink(transferId: string): DevToolsChunkSink;

  /**
   * 取一次已登记下载的字节源。
   *
   * @param requestId - `download` 请求的 ID。
   * @returns 该次下载的字节源；该 ID 没有登记过下载时为 `undefined`。
   */
  createChunkSource(requestId: string): DevToolsChunkSource | undefined;
}

/** 原生 `files` provider；在 {@link DevToolsFilesProviderWithSource} 之上多一个快照回收入口。 */
export interface DevToolsNativeFilesProvider extends DevToolsFilesProviderWithSource {
  /**
   * 释放诊断快照仓库与其计时器。
   *
   * @remarks
   * 幂等。快照仓库持有 15 s deadline 与 60 s cursor idle 两路计时器，session 拆除时
   * 必须一并回收——provider 按 session 装配，仓库因此也是 session 级资源。
   */
  dispose(): void;
}

/**
 * 一次已应答、等着被取走字节源的下载。
 *
 * @remarks
 * `size` 是 `download` 那次 `stat` 的值，随登记一起存下来：端点在**发 `TRANSFER_START`
 * 之前**就要读 `totalBytes`（限额预检 + START 的字段），那时 host 的读句柄还没开。
 * 临开句柄再问一次大小，等于让「面板按 A 个字节等」和「host 按 B 个字节发」有机会不一致。
 */
interface PendingDownload {
  /** 已校验的目标段序列。 */
  readonly segments: readonly string[];
  /** 应答时测得的字节数。 */
  readonly size: number;
}

function failure(code: DevToolsProviderErrorCode): DevToolsProviderResult {
  return { outcome: 'failed', error: createProviderError(code) };
}

function ok(result: unknown): DevToolsProviderResult {
  return { outcome: 'ok', result };
}

/** 平台异常 → 共享错误码；原生错误按 `node` 表映射，绝不透传原始文本。 */
function mapped(error: unknown): DevToolsProviderResult {
  return { outcome: 'failed', error: mapPlatformError('node', error) };
}

/**
 * 把快照仓库的结果翻译成 provider 结果。
 *
 * @remarks
 * `rejected` 直接透传仓库给的结构化错误（`snapshot_busy` / `snapshot_too_large` /
 * `snapshot_expired` / `invalid_message`）——它们是已冻结的共享码，不在这里改写。
 * `cancelled` 在 provider 语境下不可达（取消只来自 session 拆除时的 `dispose`，而那时没有
 * 在途请求），但诚实收敛成 `operation_failed` 而不是假装成功。
 */
function toSnapshotResult(result: DevToolsSnapshotResult): DevToolsProviderResult {
  if (result.outcome === 'page') return ok(result.page);
  if (result.outcome === 'rejected') return { outcome: 'failed', error: result.error };
  return failure('operation_failed');
}

/**
 * 建一个原生文件后端的 `files` provider。
 *
 * @param ports - 宿主文件能力、真实传输上限与（可选的）诊断快照端口。
 * @returns 可直接装进 `DevToolsProviderRegistry` 的 provider。
 */
export function createDevToolsNativeFilesProvider(
  ports: DevToolsNativeFilesProviderPorts
): DevToolsNativeFilesProvider {
  const uploads = new Map<string, readonly string[]>();
  const downloads = new Map<string, PendingDownload>();
  // 快照仓库是 session 级资源：provider 按 session 装配（见 connector 的 `#startNegotiation`），
  // 因此一份仓库恰好对应一个 session 的「最多一份活跃快照」。
  const snapshotStore: DevToolsSnapshotStore | undefined =
    ports.snapshot === undefined ? undefined : createDevToolsSnapshotStore(ports.snapshot);

  const descriptor: DevToolsProviderDescriptor = {
    domain: 'files',
    version: 1,
    kind: 'native-files',
    operations: ['list', 'download', 'upload', 'create-directory', 'delete'],
    runtime: ports.runtime,
    limits: { maxTransferBytes: ports.maxTransferBytes }
  };

  async function list(params: Record<string, unknown>): Promise<DevToolsProviderResult> {
    // `snapshot` 键出现即走诊断快照，否则按既有语义列一层目录。两者共用 `list` 这一操作，
    // 用参数区分而不是新增操作——快照不是协议消息类型，只是 provider 内部物化的翻页方式。
    if (params['snapshot'] !== undefined) return snapshotList(params['snapshot']);
    const segments = parseLogicalPath(params['path']);
    if (segments === undefined) return failure('invalid_path');
    const base = joinLogicalPath(segments);
    const entries = await ports.filesystem.list(segments);
    return ok({
      path: base,
      // 只有一层，所以 `path` 由本层拼；实现方不参与拼路径，也就无从拼出根外的路径。
      entries: entries.map(entry => ({ ...entry, path: joinLogicalPath([...segments, entry.name]) }))
    });
  }

  /**
   * `files.list` 的快照模式：物化第一页（`{ pageSize }`）或翻页（`{ cursor }`）。
   *
   * @remarks
   * 15 秒 deadline、epoch 重试、busy/too-large/expired 全部由 {@link DevToolsSnapshotStore}
   * 负责，这里只做两件事：把 wire 参数切成 store 认识的两个调用，再把结果翻译成 provider 结果。
   * 形状校验只到「类型」这一层——范围与绑定交给 store 的 guard（它们已由 snapshot 单测覆盖），
   * 在这里重复一遍只会让同一错误码有两条路径。
   */
  async function snapshotList(spec: unknown): Promise<DevToolsProviderResult> {
    if (snapshotStore === undefined) return failure('provider_unsupported');
    if (!isRecord(spec)) return failure('invalid_path');

    const cursor = spec['cursor'];
    if (cursor === undefined) {
      const pageSize = spec['pageSize'];
      if (pageSize !== undefined && typeof pageSize !== 'number') return failure('invalid_path');
      return toSnapshotResult(await snapshotStore.open(pageSize));
    }

    if (!isRecord(cursor) || typeof cursor['snapshotId'] !== 'string' || typeof cursor['offset'] !== 'number') {
      return failure('invalid_path');
    }
    return toSnapshotResult(snapshotStore.page({ snapshotId: cursor['snapshotId'], offset: cursor['offset'] }));
  }

  async function download(params: Record<string, unknown>): Promise<DevToolsProviderResult> {
    const target = splitLogicalPath(params['path']);
    const requestId = params['requestId'];
    if (target === undefined) return failure('invalid_path');
    if (typeof requestId !== 'string' || requestId.length === 0) return failure('invalid_path');

    const segments = [...target.parent, target.name];
    const stat = await ports.filesystem.stat(segments);
    if (stat === undefined || stat.kind !== 'file') return failure('resource_not_found');
    // 先量后开：超限的文件连句柄都不该开，否则一次「注定被拒的下载」也占着 host 的 fd。
    if (!isSafeIntegerInRange(stat.size, 0, ports.maxTransferBytes)) return failure('transfer_size_exceeded');

    // 登记只在「应答」与「取字节源」之间存活，而请求超时那条路上后者永远不会来，
    // 端点也没有任何通知回到 provider。并发在途请求本来就被会话额度封顶，于是超出
    // 这个上限的最旧一条**必然**属于一个已经结算掉的请求——按插入序淘汰它是准确的，
    // 不是近似：Map 保插入序，而每条登记都对应一个各不相同的 requestId。
    if (downloads.size >= DEVTOOLS_MAX_INFLIGHT_REQUESTS) {
      const [oldest] = downloads.keys();
      if (oldest !== undefined) downloads.delete(oldest);
    }
    downloads.set(requestId, { segments, size: stat.size });
    return ok({ path: joinLogicalPath(segments), name: target.name, size: stat.size });
  }

  async function upload(params: Record<string, unknown>): Promise<DevToolsProviderResult> {
    const transferId = params['transferId'];
    const segments = parseLogicalPath(params['path']);
    const name = params['name'];
    if (typeof transferId !== 'string' || transferId.length === 0) return failure('invalid_path');
    if (segments === undefined || !isValidPathSegment(name)) return failure('invalid_path');
    if (!isSafeIntegerInRange(params['size'], 0, ports.maxTransferBytes)) return failure('transfer_size_exceeded');
    if (uploads.has(transferId)) return failure('resource_conflict');

    uploads.set(transferId, [...segments, name]);
    return ok({ path: joinLogicalPath([...segments, name]), transferId });
  }

  async function createDirectory(params: Record<string, unknown>): Promise<DevToolsProviderResult> {
    const target = splitLogicalPath(params['path']);
    if (target === undefined) return failure('invalid_path');

    const segments = [...target.parent, target.name];
    // 先探再建：`ensureDirectory` 语义是幂等成功，不探就永远报不出 `resource_conflict`。
    if ((await ports.filesystem.stat(segments)) !== undefined) return failure('resource_conflict');
    await ports.filesystem.createDirectory(segments);
    return ok({ path: joinLogicalPath(segments) });
  }

  async function remove(params: Record<string, unknown>): Promise<DevToolsProviderResult> {
    const target = splitLogicalPath(params['path']);
    if (target === undefined) return failure('invalid_path');

    const segments = [...target.parent, target.name];
    if ((await ports.filesystem.stat(segments)) === undefined) return failure('resource_not_found');
    await ports.filesystem.remove(segments);
    return ok({ path: joinLogicalPath(segments) });
  }

  const handlers: Readonly<Record<string, (params: Record<string, unknown>) => Promise<DevToolsProviderResult>>> = {
    list,
    download,
    upload,
    'create-directory': createDirectory,
    delete: remove
  };

  return {
    descriptor,
    async invoke(operation, params) {
      const handler = Object.hasOwn(handlers, operation) ? handlers[operation] : undefined;
      if (handler === undefined) return failure('provider_unsupported');
      try {
        return await handler(isRecord(params) ? params : {});
      } catch (error) {
        return mapped(error);
      }
    },
    createChunkSink(transferId) {
      const segments = uploads.get(transferId);
      if (segments === undefined) throw new Error(`no devtools native upload registered for "${transferId}"`);
      uploads.delete(transferId);
      return deferredSink(() => ports.filesystem.openWrite(segments));
    },
    createChunkSource(requestId) {
      const registered = downloads.get(requestId);
      if (registered === undefined) return undefined;
      downloads.delete(requestId);
      return deferredSource(registered.size, () => ports.filesystem.openRead(registered.segments));
    },
    dispose() {
      snapshotStore?.dispose();
    }
  };
}

/**
 * 把「打开写入」推迟到第一次 `write`。
 *
 * @remarks
 * `createChunkSink` 是同步的（传输状态机在收到 START 的那一刻就要拿到它），而打开 host
 * 的写入句柄是异步的。推迟而不是在 `upload` 里就打开，是因为 START 未必会来——请求被拒、
 * session 断掉、面板改主意，都会让一个已打开的句柄挂在 host 上无人关闭。
 *
 * `discard()` 在句柄从未打开时是空操作：没有临时产物，也就没有要清的东西。
 */
function deferredSink(open: () => Promise<DevToolsChunkSink>): DevToolsChunkSink {
  let opened: DevToolsChunkSink | undefined;

  async function ensure(): Promise<DevToolsChunkSink> {
    opened ??= await open();
    return opened;
  }

  return {
    async write(data) {
      await (await ensure()).write(data);
    },
    async commit() {
      // 零字节文件也要 commit：不打开句柄的话，一次合法的空文件上传什么都不会创建。
      await (await ensure()).commit();
    },
    async discard() {
      await opened?.discard();
    }
  };
}

/**
 * 同上，把「打开读取」推迟到第一次 `read`；零字节文件因此一个句柄都不开。
 *
 * @remarks
 * `totalBytes` 用的是 `download` 应答里那个 `stat` 的值，而不是打开句柄后再问一次：
 * 端点在**发 `TRANSFER_START` 之前**就要读它（用于限额预检与 `totalBytes` 字段），
 * 那时句柄还没开。两处取值不一致意味着面板按 A 个字节等，host 按 B 个字节发。
 */
function deferredSource(totalBytes: number, open: () => Promise<DevToolsChunkSource>): DevToolsChunkSource {
  let opened: DevToolsChunkSource | undefined;

  return {
    totalBytes,
    async read(offset, length) {
      opened ??= await open();
      return opened.read(offset, length);
    },
    async close() {
      await opened?.close();
    }
  };
}
