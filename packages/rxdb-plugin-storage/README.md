# @aiao/rxdb-plugin-storage

> Implements: [US-502 Storage 插件](https://github.com/aiao-io/rxdb/blob/main/requirements/stories/plugin/US-502-storage-plugin.md)、[US-504 Electron 本地文件存储](https://github.com/aiao-io/rxdb/blob/main/requirements/stories/plugin/US-504-electron-local-file-storage.md)

RxDB 文件存储插件：文件元数据写入 RxDB，文件内容写入可替换的文件系统后端。

- **浏览器**（默认）—— 内容落在 Origin Private File System（OPFS）。
- **Electron 桌面**（`@aiao/rxdb-plugin-storage/desktop`）—— 内容落在应用数据目录下的原生文件，与桌面 SQLite 库（US-207）同属一个备份域。

## 能力范围

- 上传、覆盖、读取、删除和按目录清理文件
- 创建、列出和重命名目录
- 重命名文件
- 从远程 URL 拉取并永久缓存到 OPFS
- 通过 `Blob` URL 预览或下载文件
- 通过 RxDB 查询、监听文件元数据
- 对文件体与元数据的跨存储更新执行补偿回滚

以下能力尚未实现：

- 自定义 `rxdb-file://` 协议或 `file://` URL
- stale-while-revalidate、ETag、TTL 或远程版本协商
- 缩略图生成和多级加载链路
- LRU 淘汰、流式分块上传和断点续传
- 跨设备文件体同步

## 数据模型

```ts
interface StorageFileMeta {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  opfsPath: string;
  contentVersion: number;
  createdAt: Date;
  updatedAt: Date;
}
```

- `opfsPath` 是相对于插件 `rootDir` 的路径。
- `contentVersion` 在覆盖写入或远程缓存更新时递增。
- 文件名和目录名只允许单个合法路径段；`/`、`\\`、空段、`.`、`..` 和首尾空格会被拒绝，不会被静默改写。

## 公开 API

```ts
interface RxDBStoragePluginOptions {
  rootDir?: string;
  previewLimitBytes?: number;
  /** 文件系统后端工厂；省略即 OPFS。 */
  filesystem?: StorageFilesystemFactory;
}

interface UploadOptions {
  path?: string;
  overwrite?: boolean;
}

interface FetchRemoteOptions {
  url: string;
  mimeType?: string;
  signal?: AbortSignal;
}

interface RenameOptions {
  overwrite?: boolean;
}

class RxdbFileStorage {
  readonly activeObjectUrlCount: number;

  init(): Promise<void>;

  upload(file: File, options?: UploadOptions): Promise<StorageFileMeta>;
  read(fileId: string): Promise<Blob>;
  fetch(opfsPath: string, options: FetchRemoteOptions): Promise<Blob>;

  preview(fileId: string): Promise<StoragePreviewResult>;
  createObjectUrl(fileId: string): Promise<string>;
  revokeObjectUrl(url: string): void;
  download(fileId: string, options?: { suggestedName?: string }): Promise<void>;

  getMeta(fileId: string): Promise<StorageFileMeta | null>;
  list(options?: { path?: string; recursive?: boolean }): Promise<StorageFileMeta[]>;
  listEntries(options?: { path?: string }): Promise<StorageBrowserEntry[]>;
  watch(fileId: string): Observable<StorageFileMeta | null>;

  createDirectory(name: string, options?: { path?: string }): Promise<string>;
  rename(fileId: string, newName: string, options?: RenameOptions): Promise<StorageFileMeta>;
  renameDirectory(directoryPath: string, newName: string, options?: RenameOptions): Promise<string>;
  delete(fileId: string): Promise<void>;
  clear(path?: string): Promise<void>;

  destroy(): Promise<void>;
}
```

`db.storage` **只在连接期间存在**：安装前与断开连接后都是 `undefined`。插件声明 `lifecycle: 'scoped'`，
建服务、挂 `db.storage`、注册 metadata 实体三步各占一条作用域条目，`disconnectAll()` 时逆序退回——
先摘实体、再摘属性、最后等 storage 排空写任务。重新 `connect()` 会建一个全新的服务实例，
旧实例上取得的对象 URL 与句柄不再有效。

`list()` 的目录语义：

- 省略 `path` — 返回整库全部文件元数据（跨目录）。
- 指定 `path` — 只返回该目录的**直属**文件；`''` 与 `'/'` 等价，都表示根目录。
- 指定 `path` + `recursive: true` — 连同子目录一并返回。

`listEntries()` 只看直属层级，同时返回直属文件和子目录。

`fetch()` 的缓存键是规范化后的 `opfsPath`：

- 已有缓存时直接返回 OPFS 文件，不发网络请求。
- 同一路径并发请求共享一个 in-flight 请求。
- 非 2xx、离线、Abort 或 MIME 缺失不会污染现有缓存。
- 这是永久缓存，不包含自动刷新策略。

## 错误类型

```ts
StorageInvalidPathError;
StorageConflictError;
StorageUnavailableError;
StoragePreviewLimitError;
StorageOfflineError;
StorageFetchError;
StorageMimeTypeMissingError;

// 后端（文件系统 / 宿主）来源的失败，带稳定错误码
class StorageBackendError extends Error {
  readonly code: StorageBackendErrorCode;
  readonly detail?: unknown;
}

type StorageBackendErrorCode =
  | 'backend_unavailable'
  | 'invalid_physical_name'
  | 'path_escape'
  | 'name_too_long'
  | 'permission_denied'
  | 'disk_full'
  | 'write_aborted'
  | 'adapter_mismatch'
  | 'backend_internal_error';
```

调用方应按错误类型处理，不要匹配英文错误消息。跨 IPC 的失败按 `code` 判别 —— 结构化克隆不保留原型，`instanceof` 在 renderer 侧不成立；原始原因经 `detail` 透出。

当主操作失败且补偿回滚也失败时，服务会抛 `AggregateError`，其中第一个错误仍是原始失败原因。

## 使用方式

```ts
import { rxDBPluginStorage } from '@aiao/rxdb-plugin-storage';

rxdb.use(rxDBPluginStorage, {
  rootDir: 'files',
  previewLimitBytes: 50 * 1024 * 1024
});

await rxdb.storage.init();

const meta = await rxdb.storage.upload(file, {
  path: '/avatars',
  overwrite: true
});

const preview = await rxdb.storage.preview(meta.id);
try {
  image.src = preview.url;
} finally {
  preview.dispose();
}
```

远程缓存：

```ts
const blob = await rxdb.storage.fetch('images/avatar.png', {
  url: 'https://static.example.com/avatar.png',
  signal: abortController.signal
});
```

## 桌面后端（Electron）

```ts
import { rxDBPluginStorage } from '@aiao/rxdb-plugin-storage';
import { createDesktopStorageFilesystem } from '@aiao/rxdb-plugin-storage/desktop';

rxdb.use(rxDBPluginStorage, {
  rootDir: 'files',
  filesystem: createDesktopStorageFilesystem()
});
```

- 文件内容落在主进程解析的应用数据目录下（示例应用为 `userData/rxdb-files`），**不经过 OPFS**；拷贝该目录即完整带走文件与数据库。
- 走 US-207 已有的那条 host 通道，**不新增 preload 方法**。读写按 4 MiB 分帧，内容不整块进 JS 堆。
- 写入是原子的：临时文件 → `fsync` → `rename`。会话关闭或窗口销毁会中止未提交的写入并删掉临时文件。
- 路径锁由 host 仲裁，跨窗口串行化不依赖 WebView 的 Web Locks。
- 启用前校验 `sync.local.adapter` 必须是桌面 SQLite 适配器；不匹配即抛 `StorageBackendError('adapter_mismatch')`，**不降级、不静默接受**——否则 metadata 与文件又回到两个备份域。

### 与 OPFS 后端的唯一行为分歧

逻辑名到物理文件名走确定性可逆编码（`%XX` 转义 Windows 非法字符、结尾空格与点、保留设备名）。**编码后单个路径分段超过 255 UTF-8 字节即抛 `StorageBackendError('name_too_long')`**，同名操作在 OPFS 后端仍会成功。

不做哈希截断是有意的：`listEntries()` 与目录拷贝要从磁盘上的物理名回推逻辑名，截断不可逆，一旦引入就再也读不回原名。宁可在写入时当场失败，也不要写进去以后读不出来。

## 运行要求

- `rxdb.config.sync.local.adapter` 必须存在，元数据必须落到本地适配器。
- 浏览器后端要求运行环境支持 `navigator.storage.getDirectory()`；桌面后端要求 preload 注入的 host 桥接可用。
- `showSaveFilePicker` 可用时 `download()` 使用文件选择器；否则回退到临时 `<a download>`。
- `watch()` 监听本插件触发的元数据变化，不监视其他代码绕过插件直接改动文件的行为。
- 断开连接会回收本实例创建的全部对象 URL（宿主释放作用域时调用服务的 `destroy()`）。

## 一致性策略

文件系统后端与 RxDB 不共享事务。插件采用补偿日志维持用户可见一致性：

- 写入失败：恢复旧文件，或删除本次新建的孤儿文件。
- 元数据创建/更新失败：恢复对应文件体。
- 删除文件失败：重建已删除的元数据。
- 文件或目录重命名失败：按逆序恢复元数据、目标文件和本次新建目录。

这不是跨进程的分布式事务。同一路径的并发修改由路径锁串行化：浏览器后端用 Web Locks（同 origin 内跨标签页有效），桌面后端用 host 仲裁的锁（跨窗口有效）。跨**应用实例**（各自独立进程、各自的 host）仍无保护。

## 开发命令

```bash
pnpm nx run rxdb-plugin-storage:typecheck
pnpm nx run rxdb-plugin-storage:lint --max-warnings=0
pnpm nx test rxdb-plugin-storage --run --browser.enabled=false --coverage.enabled=false
pnpm nx run rxdb-plugin-storage:test-browser --run --coverage.enabled=false
pnpm nx run rxdb-plugin-storage:build
```
