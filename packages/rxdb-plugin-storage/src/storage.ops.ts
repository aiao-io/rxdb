import { StorageConflictError, StorageFetchError, StorageMimeTypeMissingError, StorageOfflineError } from './errors.js';
import { StorageFileMeta } from './file-meta.entity.js';
import type { StorageFilesystem, StorageFileWriter } from './filesystem/storage-filesystem.js';
import { isStorageNotFoundError } from './filesystem/storage-filesystem.js';
import { getFileNameFromOpfsPath } from './paths.js';
import {
  randomToken,
  readStreamChunk,
  stripMimeParameters,
  throwAfterRollback,
  type FetchRemoteOptions,
  type StorageFileState,
  type StorageMetaPatch,
  type UploadOptions
} from './storage.helpers.js';

/** 文件读写 / 拉取 / 上传 sibling 需要的 Host。 */
export interface StorageFileOpsHost {
  readonly filesystem: StorageFilesystem;
  ensureLocalReady(): Promise<void>;
  getRequiredMeta(fileId: string): Promise<StorageFileMeta>;
  findMetaByOpfsPath(opfsPath: string): Promise<StorageFileMeta | null>;
  hasFile(opfsPath: string): Promise<boolean>;
  hasDirectory(directoryPath: string): Promise<boolean>;
  getAllMetas(): Promise<StorageFileMeta[]>;
  getMetaPatch(meta: StorageFileMeta): StorageMetaPatch;
  createMeta(meta: StorageFileMeta): Promise<StorageFileMeta>;
  updateMeta(meta: StorageFileMeta, patch: StorageMetaPatch): Promise<StorageFileMeta>;
  removeMeta(meta: StorageFileMeta): Promise<void>;
  instantiateMeta(initData: Partial<StorageFileMeta>): StorageFileMeta;
  createTemporaryFilePath(purpose: string): string;
  withPathLock<T>(opfsPaths: ReadonlyArray<string>, fn: () => Promise<T>): Promise<T>;
  removeFile(opfsPath: string): Promise<void>;
  removeDirectoryPath(directoryPath: string): Promise<void>;
  read(fileId: string): Promise<Blob>;
}

export async function fetchToOpfs(
  host: StorageFileOpsHost,
  normalizedPath: string,
  options: FetchRemoteOptions
): Promise<Blob> {
  await host.ensureLocalReady();

  const existingMeta = await host.findMetaByOpfsPath(normalizedPath);

  if (existingMeta && (await host.hasFile(normalizedPath))) {
    const cached = await host.filesystem.readBlob(normalizedPath);
    return options.mimeType ? cached.slice(0, cached.size, options.mimeType) : cached;
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new StorageOfflineError(normalizedPath, options.url);
  }

  let response: Response;
  try {
    response = await globalThis.fetch(options.url, { signal: options.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    if (error instanceof TypeError) {
      throw new StorageOfflineError(normalizedPath, options.url);
    }
    throw error;
  }

  if (!response.ok) {
    return rejectWithBodyCancelled(response, new StorageFetchError(normalizedPath, options.url, response.status));
  }

  const rawContentType = response.headers.get('content-type');
  const headerMimeType = rawContentType ? stripMimeParameters(rawContentType) : null;
  const mimeType = options.mimeType ?? headerMimeType;
  if (!mimeType) {
    return rejectWithBodyCancelled(response, new StorageMimeTypeMissingError(normalizedPath, options.url));
  }

  const fileName = getFileNameFromOpfsPath(normalizedPath);
  const temporaryPath = host.createTemporaryFilePath('fetch');

  try {
    const size = await streamResponseToFile(host, response, temporaryPath, options.signal);
    options.signal?.throwIfAborted();

    // STOR-002：只对**提交阶段**加锁，不把网络下载圈进临界区 ——
    // 否则同路径的 upload 会被一次慢下载阻塞整程。提交阶段与 upload / rename 的
    // 「写文件 → 写 metadata → 补偿」是同一类临界区，必须串行。
    //
    // 读回也在锁内：提交完就放锁，下一个持锁者（同路径的 upload / rename / delete）
    // 会在读到之前把文件换掉甚至删掉 —— 于是 `fetch()` 要么返回别人的内容，要么直接
    // 撞上「文件不存在」，而调用方拿到的是一次自称成功的下载。
    const committed = await host.withPathLock([normalizedPath], async () => {
      await commitFetchedFile(host, normalizedPath, temporaryPath, size, fileName, mimeType);
      return host.filesystem.readBlob(normalizedPath);
    });

    return committed.slice(0, committed.size, mimeType);
  } finally {
    await host.removeFile(temporaryPath);
  }
}

/**
 * RV-043：响应头阶段的拒绝（状态非 2xx、缺 MIME）发生在 streamResponseToFile 的
 * try/finally 之外——body 从未交给任何消费者，也没有其它收尾入口。调用方已经拿到
 * 业务错误、甚至 `destroy()` 已经跑完，底层 HTTP 下载仍在继续。
 *
 * 这里显式取消未消费的 body 再抛出原业务错误：取消失败不改变、也不掩盖原始分类
 * （镜像 {@link throwAfterRollback } 的「收尾异常不替换业务错误」约定），
 * 正常的流式消费路径不经过这里，不会被重复取消。
 */
async function rejectWithBodyCancelled(response: Response, error: Error): Promise<never> {
  try {
    await response.body?.cancel();
  } catch {
    // 取消失败不改变原业务错误的分类；资源收尾本身不是调用方需要关心的失败模式。
  }
  throw error;
}

async function commitFetchedFile(
  host: StorageFileOpsHost,
  normalizedPath: string,
  temporaryPath: string,
  size: number,
  fileName: string,
  mimeType: string
): Promise<void> {
  // 锁内重读：排队期间同路径可能已被 upload / rename 改写
  const existingMeta = await host.findMetaByOpfsPath(normalizedPath);
  const previousFile = await readFileIfExists(host, normalizedPath);
  const temporaryFile = await host.filesystem.readBlob(temporaryPath);
  try {
    await writeBlobToPath(host, normalizedPath, temporaryFile);
  } catch (error) {
    return throwAfterRollback(error, () => restoreFileState(host, normalizedPath, previousFile));
  }

  try {
    if (existingMeta) {
      await host.updateMeta(existingMeta, {
        name: fileName,
        mimeType,
        size,
        opfsPath: normalizedPath,
        contentVersion: (existingMeta.contentVersion || 0) + 1
      });
    } else {
      await host.createMeta(
        host.instantiateMeta({
          name: fileName,
          mimeType,
          size,
          opfsPath: normalizedPath,
          contentVersion: 1
        })
      );
    }
  } catch (error) {
    return throwAfterRollback(error, () => restoreFileState(host, normalizedPath, previousFile));
  }
  await discardFileState(host, previousFile);
}

async function streamResponseToFile(
  host: StorageFileOpsHost,
  response: Response,
  opfsPath: string,
  signal?: AbortSignal
): Promise<number> {
  return streamReadableToFile(host, response.body, opfsPath, signal);
}

export async function streamReadableToFile(
  host: StorageFileOpsHost,
  stream: ReadableStream<Uint8Array> | null,
  opfsPath: string,
  signal?: AbortSignal
): Promise<number> {
  const writer = await host.filesystem.openWrite(opfsPath);
  const reader = stream?.getReader();
  let size = 0;

  try {
    if (!reader) {
      await writer.write(new Blob([]));
      await writer.close();
      return 0;
    }

    while (true) {
      signal?.throwIfAborted();
      const chunk = await readStreamChunk(reader, signal);
      if (chunk.done) break;
      size += chunk.value.byteLength;
      const writableChunk = new Uint8Array(chunk.value.byteLength);
      writableChunk.set(chunk.value);
      await writer.write(writableChunk);
    }
    signal?.throwIfAborted();
    await writer.close();
    return size;
  } catch (error) {
    await reader?.cancel(error).catch(() => undefined);
    await writer.abort(error);
    throw error;
  }
}

/** 带快照补偿的整块写入：失败时把目标恢复成写之前的样子。 */
export async function writeBlobToPath(host: StorageFileOpsHost, opfsPath: string, blob: Blob): Promise<void> {
  const previous = await readFileIfExists(host, opfsPath);
  try {
    await writeBlobWithoutRollback(host, opfsPath, blob);
  } catch (error) {
    return throwAfterRollback(error, () => restoreFileState(host, opfsPath, previous));
  }
  await discardFileState(host, previous);
}

export async function writeBlobWithoutRollback(host: StorageFileOpsHost, opfsPath: string, blob: Blob): Promise<void> {
  let writer: StorageFileWriter | undefined;
  try {
    writer = await host.filesystem.openWrite(opfsPath);
    await writer.write(blob);
    await writer.close();
  } catch (error) {
    if (writer) {
      await writer.abort(error);
    }
    throw error;
  }
}

/**
 * `upload` 的临界区：检查 → 写文件 → 提交 meta 必须整段串行。
 *
 * @param host - 文件操作 Host
 * @param file - 待上传文件
 * @param options - 上传选项
 * @param opfsPath - 已解析的目标路径（同时是锁粒度）
 * @returns 新建或更新后的元数据
 *
 * @remarks
 * 这一段是 check-then-act。无互斥时两个并发的同路径 `upload` 会双双通过冲突检查，
 * 随后 B 的 meta 因 `opfs_path` 唯一索引写入失败、回滚走 `restoreFileState(path, null)`
 * → `removeFile(path)`，**把 A 刚成功注册的文件删掉**，留下「meta 在、文件不在」的孤儿 meta。
 *
 * 浏览器支持 Web Locks 时，临界区还会经过按 `rootDir` 隔离的同源锁，覆盖不同 tab
 * 的 storage service；没有该 API 的非浏览器测试环境退回进程内协议。
 */
export async function uploadLocked(
  host: StorageFileOpsHost,
  file: File,
  options: UploadOptions,
  opfsPath: string
): Promise<StorageFileMeta> {
  const existingMeta = await host.findMetaByOpfsPath(opfsPath);
  const previousFile = await readFileIfExists(host, opfsPath);

  if ((existingMeta || previousFile) && options.overwrite !== true) {
    await discardFileState(host, previousFile);
    throw new StorageConflictError(opfsPath);
  }

  // RV-044：`existingMeta` 按精确逻辑字符串查找，查不到；但 `previousFile` 已经证明
  // 原生卷上确实有物理对象。两种情况都会走到这里，必须分清楚：
  // - 真孤儿（崩溃恢复等遗留下的文件，没有任何 meta 认领）—— 允许继续，写入后建新 meta，
  //   这是既有、受支持的行为，不是本次要堵的洞。
  // - 另一个 meta 在别的逻辑路径上，但原生卷按大小写/Unicode 规范等价判它是同一个物理对象
  //   （如 `a.txt`/`A.txt`、NFC/NFD 的 `café.txt`）—— 直接写穿会让两个 metadata ID
  //   共享同一份物理内容，对方的记录从此悄悄指向被我们覆盖掉的新内容。
  // 只有后一种需要特殊处理，且判定只依赖「原生卷已经证明的物理读取结果」，不对所有名字做
  // 大小写/NFC 预判——在真正按字节区分大小写的卷（或 OPFS）上，`previousFile` 对一个
  // 全新的不同名字永远是 null，这条分支根本不会被触发，因此不会把 alpha.txt/beta.txt
  // 这类正常共存的不同文件误判成别名。
  if (!existingMeta && previousFile) {
    const aliasOwner = await findPhysicalAliasOwner(host, opfsPath);
    if (aliasOwner) {
      // 这份 previousFile 只是归 aliasOwner 所有的内容的一份临时备份快照，从未写过、
      // 也不会再写——真正落盘发生在 uploadAsPhysicalAlias 的独立物理路径上，这里只需要
      // 把临时快照清掉，不能调用 restoreFileState（那会去动 aliasOwner 名下的文件）。
      await discardFileState(host, previousFile);
      return uploadAsPhysicalAlias(host, file, opfsPath);
    }
  }

  try {
    await writeBlobToPath(host, opfsPath, file);
  } catch (error) {
    return throwAfterRollback(error, () => restoreFileState(host, opfsPath, previousFile));
  }

  let result: StorageFileMeta;
  try {
    if (existingMeta) {
      result = await host.updateMeta(existingMeta, {
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        opfsPath,
        contentVersion: (existingMeta.contentVersion || 0) + 1
      });
    } else {
      result = await host.createMeta(
        host.instantiateMeta({
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
          size: file.size,
          opfsPath,
          contentVersion: 1
        })
      );
    }
  } catch (error) {
    return throwAfterRollback(error, () => restoreFileState(host, opfsPath, previousFile));
  }
  await discardFileState(host, previousFile);
  return result;
}

/**
 * RV-044：在「本次目标路径查不到 meta，但原生卷上确实有物理文件」时，找出是不是
 * 另一个 meta——在大小写/Unicode 规范等价意义上——已经拥有这个物理对象。
 *
 * @remarks
 * 只比较 `opfsPath` 的 NFC 规范形 + 大小写折叠；不触碰文件名以外的任何字段，
 * 也不会主动遍历原生卷去发现「还有什么文件」——它只回答「现有 meta 里，有没有一个
 * 逻辑路径在这个等价类下撞上了目标路径」。调用方已经用一次真实的物理读取
 * （`previousFile`）证明了卷上确实有对象，这里只是去认领它的主人；如果没有任何
 * meta 命中，就是真孤儿，交回调用方按既有语义处理。
 *
 * 不做大小写/NFC 之外的归一化（不猜测卷的具体大小写敏感规则），也不缓存结果——
 * `getAllMetas()` 的量级与既有 `findMetaByOpfsPath` 扫描同阶，不引入新的性能量级。
 */
async function findPhysicalAliasOwner(host: StorageFileOpsHost, opfsPath: string): Promise<StorageFileMeta | null> {
  const canonicalTarget = canonicalPathKey(opfsPath);
  const metas = await host.getAllMetas();
  return metas.find(meta => meta.opfsPath !== opfsPath && canonicalPathKey(meta.opfsPath) === canonicalTarget) ?? null;
}

/** 大小写折叠 + NFC 规范化：覆盖 RV-044 两个已确认的别名来源（ASCII 大小写、NFC/NFD 组合字符）。 */
function canonicalPathKey(opfsPath: string): string {
  return opfsPath.normalize('NFC').toLowerCase();
}

/**
 * RV-044：目标逻辑路径与另一个 meta 在原生卷上物理别名时，两份内容仍必须各自独立可读——
 * 不能靠「拒绝第二次写入」解决（那会让 `overwrite: true` 在这种场景下变得不可用），
 * 也绝不能写穿 aliasOwner 名下的文件（那正是本条缺陷要堵的数据覆盖）。
 *
 * @remarks
 * 做法是把**这一条新 meta 自己的** `opfsPath` 换成追加了随机、物理上不会再与任何
 * 现有名字折叠相撞的后缀；`name` 仍然原样记录用户传入的文件名，变化只发生在内部
 * 寻址键上。`opfsPath` 本来就贯穿 read / rename / remove 全链路作为唯一寻址键，
 * 换成这个带后缀的路径后，后续对这条 meta 的一切操作自动落到不冲突的物理位置，
 * 不需要在 {@link StorageFileMeta} 上新增字段，也不需要改 {@link StorageFilesystem} 接口。
 *
 * 这是 RV-044 修复方案里「版本化物理编码」方向里最小的一步：只在**真正探测到别名碰撞**
 * 时才让路，不触碰任何未发生碰撞的既有文件的物理路径——因此不需要迁移，也不会让
 * 旧文件"消失"。rename / copy / 目录级别名与并发写入仍按评审记录里标注的范围另行处理，
 * 这里只保证 `upload` 本身不再把两个 metadata ID 悄悄焊在同一份内容上。
 */
async function uploadAsPhysicalAlias(host: StorageFileOpsHost, file: File, opfsPath: string): Promise<StorageFileMeta> {
  const aliasOpfsPath = `${opfsPath}.alias-${randomToken()}`;

  await writeBlobToPath(host, aliasOpfsPath, file);
  try {
    return await host.createMeta(
      host.instantiateMeta({
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        opfsPath: aliasOpfsPath,
        contentVersion: 1
      })
    );
  } catch (error) {
    return throwAfterRollback(error, () => restoreFileState(host, aliasOpfsPath, null));
  }
}

export async function deleteMetaAndFile(host: StorageFileOpsHost, meta: StorageFileMeta): Promise<void> {
  await host.removeMeta(meta);

  try {
    await host.removeFile(meta.opfsPath);
  } catch (error) {
    return throwAfterRollback(error, () => host.createMeta(meta).then(() => undefined));
  }
}

/**
 * 把当前内容流式复制到临时文件，作为可回滚快照。
 *
 * @param host - 文件操作 Host
 * @param opfsPath - 存储根下的相对路径
 * @returns 临时备份路径；文件不存在时返回 `null`
 *
 * @remarks
 * 不能保留 {@link StorageFilesystem.readBlob} 返回的 snapshot 后再覆写源文件，也不能用
 * `arrayBuffer()` 把大文件整体复制进 JS 堆。临时文件与源文件状态脱钩，
 * 复制过程的内存上限由流 chunk 大小决定。
 */
export async function readFileIfExists(host: StorageFileOpsHost, opfsPath: string): Promise<StorageFileState> {
  let backupPath: string | null = null;
  try {
    const source = await host.filesystem.openRead(opfsPath);
    backupPath = host.createTemporaryFilePath('rollback');
    await streamReadableToFile(host, source, backupPath);
    return { backupPath };
  } catch (error) {
    if (backupPath) await host.removeFile(backupPath);
    if (isStorageNotFoundError(error)) {
      return null;
    }
    throw error;
  }
}

export async function restoreFileState(
  host: StorageFileOpsHost,
  opfsPath: string,
  previous: StorageFileState
): Promise<void> {
  if (previous) {
    const backup = await host.filesystem.openRead(previous.backupPath);
    await streamReadableToFile(host, backup, opfsPath);
    await host.removeFile(previous.backupPath);
    return;
  }

  await host.removeFile(opfsPath);
}

export async function discardFileState(host: StorageFileOpsHost, previous: StorageFileState): Promise<void> {
  if (previous) await host.removeFile(previous.backupPath);
}
