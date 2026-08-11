# @aiao/rxdb-plugin-storage

> Implements: [US-502 Storage 插件](https://github.com/aiao-io/rxdb/blob/main/requirements/stories/plugin/US-502-storage-plugin.md)

基于 RxDB 与 Origin Private File System（OPFS）的浏览器文件存储插件：文件体写入 OPFS，文件元数据写入 RxDB。

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

  destroy(): void;
}
```

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
```

调用方应按错误类型处理，不要匹配英文错误消息。

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

## 运行要求

- `rxdb.config.sync.local.adapter` 必须存在，元数据必须落到本地适配器。
- 运行环境必须支持 `navigator.storage.getDirectory()`。
- `showSaveFilePicker` 可用时 `download()` 使用文件选择器；否则回退到临时 `<a download>`。
- `watch()` 监听本插件触发的元数据变化，不监视其他代码直接修改 OPFS 的行为。
- `destroy()` 会回收本实例创建的全部对象 URL。

## 一致性策略

OPFS 与 RxDB 不共享事务。插件采用补偿日志维持用户可见一致性：

- 写入失败：恢复旧文件，或删除本次新建的孤儿文件。
- 元数据创建/更新失败：恢复对应文件体。
- 删除文件失败：重建已删除的元数据。
- 文件或目录重命名失败：按逆序恢复元数据、目标文件和本次新建目录。

这不是跨进程的分布式事务；同一路径仍应由一个应用实例串行修改。

## 开发命令

```bash
pnpm nx run rxdb-plugin-storage:typecheck
pnpm nx run rxdb-plugin-storage:lint --max-warnings=0
pnpm nx test rxdb-plugin-storage --run --browser.enabled=false --coverage.enabled=false
pnpm nx run rxdb-plugin-storage:test-browser --run --coverage.enabled=false
pnpm nx run rxdb-plugin-storage:build
```
