/**
 * @fileoverview 存储后端的文件系统接缝
 *
 * 把 {@link RxdbFileStorage} 与具体的文件系统实现解耦：服务层只依赖本文件的窄接口，
 * 浏览器 OPFS 与桌面原生文件（US-504）各自提供实现。
 *
 * 边界约定：
 * - 接口只承担**单步文件系统动作**。回滚日志、临时文件提交、快照补偿留在服务层，
 *   后端不得自行吞掉这套语义 —— 否则两个后端的事务行为会悄悄分叉，
 *   而分叉处正是「meta 在、文件不在」这类孤儿状态的来源。
 * - 路径一律由服务层规范化后传入：文件用相对存储根的路径（`a/b.txt`），
 *   目录用前导斜杠的绝对形式（`/a/b`，根目录为 `/`）。实现方负责映射到自己的物理布局。
 * - 目标不存在时必须抛出 `name === 'NotFoundError'` 的错误（见 {@link isStorageNotFoundError}）：
 *   服务层「不存在即视为空快照」的补偿分支依赖这一约定，换成别的错误会让回滚把
 *   本不该删的文件删掉。
 * - 幂等要求：{@link StorageFilesystem.removeFile} 与 {@link StorageFilesystem.removeDirectory}
 *   删除不存在的目标必须静默成功，其余方法一律抛错。
 *
 * @module rxdb-plugin-storage/filesystem/storage-filesystem
 */

/** 目录条目：只暴露服务层用得到的名称与类型，不泄漏底层句柄。 */
export interface StorageFilesystemEntry {
  /** 条目在所属目录内的名称（逻辑名，已由实现方解码）。 */
  readonly name: string;
  /** 条目类型。 */
  readonly kind: 'directory' | 'file';
}

/**
 * 单个文件的写入句柄。
 *
 * @remarks
 * 生命周期只有两个终态：{@link StorageFileWriter.close} 提交，
 * 或 {@link StorageFileWriter.abort} 丢弃。服务层保证任一路径上二者只调用其一。
 */
export interface StorageFileWriter {
  /**
   * 追加一个分片；分片按调用顺序拼接。
   *
   * @remarks
   * 分片必须由非共享的 `ArrayBuffer` 支撑：底层写入接口拒绝 `SharedArrayBuffer` 视图，
   * 调用方从流里读到的分片需自行拷贝一份再传入。
   */
  write(chunk: Blob | Uint8Array<ArrayBuffer>): Promise<void>;
  /** 提交全部已写入的分片。 */
  close(): Promise<void>;
  /**
   * 丢弃本次写入并释放资源。
   *
   * @param reason - 触发放弃的原始错误，供实现方记录或透传。
   * @remarks
   * 本方法**不得抛出**：它只在错误处理路径上被调用，二次抛错会覆盖掉真正的失败原因。
   */
  abort(reason: unknown): Promise<void>;
}

/**
 * 存储插件依赖的最小文件系统能力集合。
 *
 * @remarks
 * 方法集由 {@link RxdbFileStorage} 的实际调用点反推得到，不多不少 ——
 * 多出来的方法没有测试覆盖，少一个则会把句柄细节重新漏回服务层。
 */
export interface StorageFilesystem {
  /**
   * 跨上下文锁实现；返回 `undefined` 表示由 {@link PathLockManager} 自行探测环境。
   *
   * @remarks
   * OPFS 后端返回 `undefined`（浏览器 Web Locks 已覆盖同源多标签页）；
   * 桌面后端必须返回 host 仲裁的实现，否则多窗口之间的临界区会各自为政。
   */
  readonly lockBackend?: Pick<LockManager, 'request'> | undefined;

  /** 确保存储根目录存在；环境不支持时抛出 {@link StorageUnavailableError}。 */
  ensureRoot(): Promise<void>;

  /** 创建目录及其缺失的父目录；已存在时是空操作。 */
  ensureDirectory(directoryPath: string): Promise<void>;

  /** 判断目录是否存在。 */
  directoryExists(directoryPath: string): Promise<boolean>;

  /** 递归删除目录；目录不存在时静默返回。 */
  removeDirectory(directoryPath: string): Promise<void>;

  /**
   * 枚举目录的直属条目。
   *
   * @remarks
   * 返回**惰性**序列：服务层需要「先物化再删除」时会自行收集成数组，
   * 实现方不必也不应提前物化。
   */
  list(directoryPath: string): AsyncIterable<StorageFilesystemEntry>;

  /** 判断文件是否存在。 */
  fileExists(filePath: string): Promise<boolean>;

  /**
   * 读取文件的完整内容。
   *
   * @remarks
   * **不保证读写隔离**：并发写入期间的返回值只承诺「读到某个字节序列」，
   * 既可能是旧内容、新内容，也可能是两者的拼接。OPFS 后端在 File System snapshot
   * 失效时会抛错，桌面后端按帧读取则会读到撕裂内容 —— 接口只取二者的交集，
   * 调用方不得依赖强的那一侧，否则换后端就会静默出错。
   *
   * 因此串行化由服务层的路径锁负责，而不是靠这里。需要先读后写的调用方仍应用
   * {@link StorageFilesystem.openRead} 转存到临时文件，不要把返回值当长期快照留着。
   */
  readBlob(filePath: string): Promise<Blob>;

  /**
   * 打开文件的读取流；文件不存在时抛出 NotFound。
   *
   * @remarks
   * 读写隔离保证与 {@link StorageFilesystem.readBlob} 相同 —— 也就是没有保证。
   */
  openRead(filePath: string): Promise<ReadableStream<Uint8Array>>;

  /** 打开文件的写入句柄，缺失的父目录一并创建。 */
  openWrite(filePath: string): Promise<StorageFileWriter>;

  /** 删除文件；文件不存在时静默返回。 */
  removeFile(filePath: string): Promise<void>;

  /**
   * 判断文件是否支持原生移动。
   *
   * @remarks
   * 文件不存在时抛出 NotFound —— 调用方据此在重命名前置检查里发现源文件已消失。
   */
  supportsFileMove(filePath: string): Promise<boolean>;

  /** 原生移动文件；仅在 {@link StorageFilesystem.supportsFileMove} 为真时调用。 */
  moveFile(fromPath: string, toPath: string): Promise<void>;

  /** 判断目录是否支持原生移动；目录不存在时抛出 NotFound。 */
  supportsDirectoryMove(directoryPath: string): Promise<boolean>;

  /** 原生移动目录；仅在 {@link StorageFilesystem.supportsDirectoryMove} 为真时调用。 */
  moveDirectory(fromPath: string, toPath: string): Promise<void>;

  /** 释放缓存的句柄与连接；服务销毁时调用一次。 */
  dispose(): void;
}

/**
 * 创建后端实例时可见的宿主信息。
 *
 * @remarks
 * 只带**后端选型需要判据的字段**，不传 RxDB 实例：接缝一旦能拿到整个实例，
 * 后端就能绕过服务层直接读写库，两者的事务边界随即失去意义。
 */
export interface StorageFilesystemContext {
  /**
   * `sync.local` 配置的适配器名；未配置本地适配器时为 `undefined`。
   *
   * @remarks
   * 桌面后端据此拒绝「metadata 在浏览器存储、文件在原生目录」的错配组合 ——
   * 那正是 US-504 要消除的「两个备份域」，静默接受等于把问题换个形式留下。
   */
  readonly localAdapterName: string | undefined;
}

/**
 * 按存储根目录创建后端实例的工厂。
 *
 * @param rootDir - 已规范化的存储根目录相对路径（如 `files`）。
 * @param context - 宿主信息，供后端做启用前校验。
 */
export type StorageFilesystemFactory = (rootDir: string, context: StorageFilesystemContext) => StorageFilesystem;

/**
 * 判断错误是否表示「目标不存在」。
 *
 * @remarks
 * 同时接受 `DOMException` 与结构相同的普通对象：跨 IPC 还原的错误不是 `DOMException`
 * 实例，只靠 `instanceof` 判定会把「文件不存在」误当成真实故障，进而触发不必要的回滚。
 */
export const isStorageNotFoundError = (error: unknown): boolean => {
  if (error instanceof DOMException) {
    return error.name === 'NotFoundError';
  }

  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: string }).name === 'NotFoundError'
  );
};
