import { StorageConflictError } from './errors.js';
import { StorageFileMeta } from './file-meta.entity.js';
import {
  getDirectoryPathFromOpfsPath,
  isOpfsPathInsideDirectory,
  joinDirectoryAndFileName,
  joinDirectoryPath,
  normalizeDirectoryPath,
  normalizeRelativeOpfsPath,
  validateStorageName
} from './paths.js';
import {
  randomToken,
  throwAfterRollback,
  type DirectoryCopyJournal,
  type RenameOptions,
  type StorageMetaPatch
} from './storage.helpers.js';
import {
  discardFileState,
  readFileIfExists,
  restoreFileState,
  writeBlobToPath,
  writeBlobWithoutRollback,
  type StorageFileOpsHost
} from './storage.ops.js';

export async function renameLocked(
  host: StorageFileOpsHost,
  fileId: string,
  newName: string,
  targetOpfsPath: string,
  options: RenameOptions
): Promise<StorageFileMeta> {
  // 锁内重读：排队期间 meta 可能已被前一个持锁者改动
  const meta = await host.getRequiredMeta(fileId);
  const targetMeta = await host.findMetaByOpfsPath(targetOpfsPath);
  if (targetMeta && targetMeta.id !== fileId && options.overwrite !== true) {
    throw new StorageConflictError(targetOpfsPath);
  }
  if (!targetMeta && options.overwrite !== true && (await host.hasFile(targetOpfsPath))) {
    throw new StorageConflictError(targetOpfsPath);
  }
  const originalMeta = host.getMetaPatch(meta);
  const previousTarget = await readFileIfExists(host, targetOpfsPath);
  if (await host.filesystem.supportsFileMove(originalMeta.opfsPath)) {
    return renameFileWithMove(
      host,
      meta,
      targetMeta,
      validateStorageName(newName),
      targetOpfsPath,
      originalMeta,
      previousTarget
    );
  }

  const blob = await host.read(fileId);
  let removedTargetMeta: StorageFileMeta | null = null;
  let updatedMeta: StorageFileMeta | null = null;
  try {
    if (targetMeta && targetMeta.id !== fileId) {
      await host.removeMeta(targetMeta);
      removedTargetMeta = targetMeta;
    }
    await writeBlobToPath(host, targetOpfsPath, blob);
    updatedMeta = await host.updateMeta(meta, {
      ...originalMeta,
      name: validateStorageName(newName),
      opfsPath: targetOpfsPath
    });
    await host.removeFile(originalMeta.opfsPath);
    await discardFileState(host, previousTarget);
    return updatedMeta;
  } catch (error) {
    return throwAfterRollback(
      error,
      () => (updatedMeta ? host.updateMeta(updatedMeta, originalMeta).then(() => undefined) : Promise.resolve()),
      () => (removedTargetMeta ? host.createMeta(removedTargetMeta).then(() => undefined) : Promise.resolve()),
      () => restoreFileState(host, targetOpfsPath, previousTarget)
    );
  }
}

async function renameFileWithMove(
  host: StorageFileOpsHost,
  meta: StorageFileMeta,
  targetMeta: StorageFileMeta | null,
  newName: string,
  targetOpfsPath: string,
  originalMeta: StorageMetaPatch,
  previousTarget: Awaited<ReturnType<typeof readFileIfExists>>
): Promise<StorageFileMeta> {
  let removedTargetMeta: StorageFileMeta | null = null;
  let updatedMeta: StorageFileMeta | null = null;
  let moved = false;

  try {
    if (targetMeta && targetMeta.id !== meta.id) {
      await host.removeMeta(targetMeta);
      removedTargetMeta = targetMeta;
    }
    await host.removeFile(targetOpfsPath);
    await host.filesystem.moveFile(originalMeta.opfsPath, targetOpfsPath);
    moved = true;
    updatedMeta = await host.updateMeta(meta, {
      ...originalMeta,
      name: newName,
      opfsPath: targetOpfsPath
    });
    await discardFileState(host, previousTarget);
    return updatedMeta;
  } catch (error) {
    return throwAfterRollback(
      error,
      () => (updatedMeta ? host.updateMeta(updatedMeta, originalMeta).then(() => undefined) : Promise.resolve()),
      async () => {
        if (!moved) return;
        await host.filesystem.moveFile(targetOpfsPath, originalMeta.opfsPath);
      },
      () => (removedTargetMeta ? host.createMeta(removedTargetMeta).then(() => undefined) : Promise.resolve()),
      () => restoreFileState(host, targetOpfsPath, previousTarget)
    );
  }
}

export async function renameDirectoryLocked(
  host: StorageFileOpsHost,
  directoryPath: string,
  newName: string,
  options: RenameOptions
): Promise<string> {
  const sourcePath = normalizeDirectoryPath(directoryPath);
  if (sourcePath === '/') {
    throw new Error('Root directory cannot be renamed');
  }

  const targetPath = normalizeDirectoryPath(
    joinDirectoryPath(getDirectoryPathFromOpfsPath(sourcePath.slice(1)), newName)
  );

  if (targetPath === sourcePath) {
    return sourcePath;
  }

  const targetExists = await host.hasDirectory(targetPath);
  if (targetExists && options.overwrite !== true) {
    throw new Error(`Directory already exists at path: ${targetPath}`);
  }

  const allMetas = await host.getAllMetas();
  const sourcePrefix = normalizeRelativeOpfsPath(sourcePath);
  const targetPrefix = normalizeRelativeOpfsPath(targetPath);
  const moves = allMetas
    .filter(meta => isOpfsPathInsideDirectory(meta.opfsPath, sourcePath))
    .map(meta => {
      const original = host.getMetaPatch(meta);
      const relativeOpfsPath = original.opfsPath.slice(sourcePrefix.length).replace(/^\//, '');
      return {
        meta,
        original,
        targetOpfsPath: [targetPrefix, relativeOpfsPath].filter(Boolean).join('/')
      };
    });

  const targetMetas = allMetas.filter(meta => isOpfsPathInsideDirectory(meta.opfsPath, targetPath));
  if (options.overwrite !== true && targetMetas.length > 0) {
    throw new StorageConflictError(targetMetas[0].opfsPath);
  }

  const canMoveSource = await host.filesystem.supportsDirectoryMove(sourcePath);
  const canMoveTarget = targetExists ? await host.filesystem.supportsDirectoryMove(targetPath) : true;
  if (canMoveSource && canMoveTarget) {
    return renameDirectoryWithMove(host, targetExists, sourcePath, targetPath, moves, targetMetas);
  }

  return renameDirectoryWithCopy(host, { sourcePath, targetPath, targetExists, moves, targetMetas });
}

/** 目录里一个已登记文件的 meta 要搬去哪 */
interface DirectoryMetaMove {
  meta: StorageFileMeta;
  original: StorageMetaPatch;
  targetOpfsPath: string;
}

/** 一次复制式目录重命名的输入 */
interface DirectoryCopyRenamePlan {
  readonly sourcePath: string;
  readonly targetPath: string;
  readonly targetExists: boolean;
  readonly moves: readonly DirectoryMetaMove[];
  readonly targetMetas: readonly StorageFileMeta[];
}

/** 复制式目录重命名已经做到哪一步：撤回按它来 */
interface DirectoryCopyRenameProgress {
  /** 被覆盖的旧目标的备份目录；目标原本不存在时为 `null` */
  readonly backupPath: string | null;
  readonly copyJournal: DirectoryCopyJournal;
  readonly removedTargetMetas: StorageFileMeta[];
  readonly attemptedMoves: DirectoryMetaMove[];
}

/**
 * 不支持原生目录 move 时的复制式重命名：备份被覆盖的旧目标 → 复制源到目标 → 改 meta → 删源。
 *
 * @remarks
 * 提交点是「删源成功」。在它之前失败，源目录一个字节都没动过，按日志撤掉目标与 meta 即可。
 * 删源本身失败时源目录可能已经删掉了一部分 —— `StorageFilesystem.removeDirectory` 只承诺递归删除与
 * 不存在时幂等，没有失败原子性 —— 这时目标里复制出来的那份才是唯一完整的副本，撤回必须先拿它把源补齐，
 * 见 {@link recoverFromSourceRemovalFailure}。
 */
async function renameDirectoryWithCopy(host: StorageFileOpsHost, plan: DirectoryCopyRenamePlan): Promise<string> {
  const { sourcePath, targetPath, targetExists, moves, targetMetas } = plan;
  const backupJournal: DirectoryCopyJournal = { files: [], createdDirectories: [] };
  const progress: DirectoryCopyRenameProgress = {
    backupPath: targetExists ? `/.rxdb-storage-journal-${Date.now()}-${randomToken()}` : null,
    copyJournal: { files: [], createdDirectories: [] },
    removedTargetMetas: [],
    attemptedMoves: []
  };
  const { backupPath } = progress;

  if (backupPath) {
    try {
      await copyDirectory(host, targetPath, backupPath, backupJournal);
    } catch (error) {
      return throwAfterRollback(
        error,
        () => rollbackDirectoryCopy(host, backupJournal),
        () => host.removeDirectoryPath(backupPath)
      );
    }
  }

  try {
    for (const targetMeta of targetMetas) {
      await host.removeMeta(targetMeta);
      progress.removedTargetMetas.push(targetMeta);
    }
    if (targetExists) await host.removeDirectoryPath(targetPath);
    await copyDirectory(host, sourcePath, targetPath, progress.copyJournal);
    for (const move of moves) {
      progress.attemptedMoves.push(move);
      await host.updateMeta(move.meta, { ...move.original, opfsPath: move.targetOpfsPath });
    }
  } catch (error) {
    return throwAfterRollback(error, ...rollbackCopyRename(host, plan, progress));
  }

  try {
    await host.removeDirectoryPath(sourcePath);
  } catch (error) {
    return recoverFromSourceRemovalFailure(host, error, plan, progress);
  }

  await discardDirectoryJournal(host, progress.copyJournal);
  await discardDirectoryJournal(host, backupJournal);
  if (backupPath) await host.removeDirectoryPath(backupPath);
  return targetPath;
}

/**
 * 撤回一次复制式重命名的动作清单：meta 搬回、删掉目标副本、从备份还原被覆盖的旧目标。
 *
 * @remarks
 * 只能在源目录完整时用 —— 第二步删的是目标里那份副本，源不完整时它就是唯一完整的那一份。
 */
function rollbackCopyRename(
  host: StorageFileOpsHost,
  plan: DirectoryCopyRenamePlan,
  progress: DirectoryCopyRenameProgress
): Array<() => Promise<void>> {
  const { backupPath } = progress;
  return [
    () => rollbackMetaMoves(host, progress.attemptedMoves),
    () => rollbackDirectoryCopy(host, progress.copyJournal),
    () => host.removeDirectoryPath(plan.targetPath),
    () => restoreDirectoryBackup(host, backupPath, plan.targetPath),
    () => restoreRemovedMetas(host, progress.removedTargetMetas),
    () => (backupPath ? host.removeDirectoryPath(backupPath) : Promise.resolve())
  ];
}

/**
 * 删源半途失败之后的撤回。
 *
 * @param error - 删源抛出的原始错误
 *
 * @remarks
 * 递归删除可能已经删掉了源里的一部分文件。照常撤回会先删掉目标里的副本，已经从源里删掉的那些文件就再也
 * 找不回来，meta 却被搬回去指向它们 —— 「meta 在、文件不在」。所以先用目标副本把源补齐，并确认每个已登记文件
 * 都回到了原路径，源重新完整之后才走常规撤回。
 *
 * 补齐失败时一个副本都不删：目标原样保留、meta 继续指向目标（文件照样读得到），被覆盖的旧目标也留在备份目录里；
 * 抛出的错误点名这些位置，由调用方处置。源目录此时可能只剩一部分，那里没有任何 meta 指向它。
 */
async function recoverFromSourceRemovalFailure(
  host: StorageFileOpsHost,
  error: unknown,
  plan: DirectoryCopyRenamePlan,
  progress: DirectoryCopyRenameProgress
): Promise<never> {
  try {
    await refillDirectory(host, plan.targetPath, plan.sourcePath);
    await assertFilesBackAtOrigin(host, plan.moves);
  } catch (restoreError) {
    throw new AggregateError([error, restoreError], incompleteRenameMessage(plan, progress.backupPath));
  }
  return throwAfterRollback(error, ...rollbackCopyRename(host, plan, progress));
}

/** 源目录补不回来时的错误消息：点名完整副本与旧目标备份各在哪 */
function incompleteRenameMessage(plan: DirectoryCopyRenamePlan, backupPath: string | null): string {
  const kept = `the complete copy is kept at ${plan.targetPath} and its metadata points there`;
  const backup = backupPath ? `; the overwritten target is kept at ${backupPath}` : '';
  return (
    `Directory rename from ${plan.sourcePath} to ${plan.targetPath} failed while removing the source, ` +
    `and the source could not be restored: ${kept}${backup}`
  );
}

/**
 * 用一份完整副本把目录补齐：只补缺的，已经在的原件一字不动。
 *
 * @remarks
 * 不复用 {@link copyDirectory}：那一个会给每个已存在的文件先做回滚快照再覆盖。这里既不该覆盖幸存的原件，
 * 也没有要回滚的东西 —— 补进去的每个文件本就是原件的副本，补到一半失败时补进去的那些照样是对的。
 */
async function refillDirectory(host: StorageFileOpsHost, fromPath: string, toPath: string): Promise<void> {
  await host.filesystem.ensureDirectory(toPath);
  for await (const { name, kind } of host.filesystem.list(fromPath)) {
    if (kind === 'directory') {
      await refillDirectory(host, joinDirectoryPath(fromPath, name), joinDirectoryPath(toPath, name));
      continue;
    }
    const toOpfsPath = joinDirectoryAndFileName(toPath, name);
    if (await host.hasFile(toOpfsPath)) continue;
    const file = await host.filesystem.readBlob(joinDirectoryAndFileName(fromPath, name));
    await writeBlobWithoutRollback(host, toOpfsPath, file);
  }
}

/** 确认每个已登记文件都回到了重命名之前的路径；缺一个就不算补齐 */
async function assertFilesBackAtOrigin(host: StorageFileOpsHost, moves: readonly DirectoryMetaMove[]): Promise<void> {
  for (const move of moves) {
    if (!(await host.hasFile(move.original.opfsPath))) {
      throw new Error(`Storage file was not restored to its original path: ${move.original.opfsPath}`);
    }
  }
}

async function renameDirectoryWithMove(
  host: StorageFileOpsHost,
  targetExists: boolean,
  sourcePath: string,
  targetPath: string,
  moves: readonly DirectoryMetaMove[],
  targetMetas: readonly StorageFileMeta[]
): Promise<string> {
  const parentPath = getDirectoryPathFromOpfsPath(targetPath.slice(1));
  const backupName = host.createTemporaryFilePath('directory');
  const backupPath = joinDirectoryPath(parentPath, backupName);
  const removedTargetMetas: StorageFileMeta[] = [];
  const attemptedMoves: Array<(typeof moves)[number]> = [];
  let targetMoved = false;
  let sourceMoved = false;

  try {
    if (targetExists) {
      await host.filesystem.moveDirectory(targetPath, backupPath);
      targetMoved = true;
    }
    for (const targetMeta of targetMetas) {
      await host.removeMeta(targetMeta);
      removedTargetMetas.push(targetMeta);
    }
    await host.filesystem.moveDirectory(sourcePath, targetPath);
    sourceMoved = true;
    for (const move of moves) {
      attemptedMoves.push(move);
      await host.updateMeta(move.meta, { ...move.original, opfsPath: move.targetOpfsPath });
    }
  } catch (error) {
    return throwAfterRollback(
      error,
      () => rollbackMetaMoves(host, attemptedMoves),
      async () => {
        if (!sourceMoved) return;
        await host.filesystem.moveDirectory(targetPath, sourcePath);
      },
      async () => {
        if (!targetMoved) return;
        await host.filesystem.moveDirectory(backupPath, targetPath);
      },
      () => restoreRemovedMetas(host, removedTargetMetas)
    );
  }

  if (targetMoved) await host.removeDirectoryPath(backupPath);
  return targetPath;
}

async function restoreDirectoryBackup(
  host: StorageFileOpsHost,
  backupPath: string | null,
  targetPath: string
): Promise<void> {
  if (!backupPath || !(await host.hasDirectory(backupPath))) return;
  const restoreJournal: DirectoryCopyJournal = { files: [], createdDirectories: [] };
  await copyDirectory(host, backupPath, targetPath, restoreJournal);
  await discardDirectoryJournal(host, restoreJournal);
}

async function restoreRemovedMetas(host: StorageFileOpsHost, metas: readonly StorageFileMeta[]): Promise<void> {
  const errors: unknown[] = [];
  for (const meta of metas) {
    try {
      await host.createMeta(meta);
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length > 0) throw new AggregateError(errors, 'Failed to restore overwritten storage metadata');
}

async function rollbackMetaMoves(
  host: StorageFileOpsHost,
  moves: Array<{ meta: StorageFileMeta; original: StorageMetaPatch }>
): Promise<void> {
  const rollbackErrors: unknown[] = [];
  for (const move of [...moves].reverse()) {
    try {
      await host.updateMeta(move.meta, move.original);
    } catch (error) {
      rollbackErrors.push(error);
    }
  }

  if (rollbackErrors.length > 0) {
    throw new AggregateError(rollbackErrors, 'Failed to roll back storage metadata');
  }
}

async function rollbackDirectoryCopy(host: StorageFileOpsHost, journal: DirectoryCopyJournal): Promise<void> {
  const rollbackErrors: unknown[] = [];
  for (const file of [...journal.files].reverse()) {
    try {
      await restoreFileState(host, file.opfsPath, file.previous);
    } catch (error) {
      rollbackErrors.push(error);
    }
  }

  for (const directoryPath of [...journal.createdDirectories].reverse()) {
    try {
      await host.removeDirectoryPath(directoryPath);
    } catch (error) {
      rollbackErrors.push(error);
    }
  }

  if (rollbackErrors.length > 0) {
    throw new AggregateError(rollbackErrors, 'Failed to roll back copied storage directory');
  }
}

async function discardDirectoryJournal(host: StorageFileOpsHost, journal: DirectoryCopyJournal): Promise<void> {
  const errors: unknown[] = [];
  for (const file of journal.files) {
    try {
      await discardFileState(host, file.previous);
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length > 0) throw new AggregateError(errors, 'Failed to clean storage rollback journal');
}

async function copyDirectory(
  host: StorageFileOpsHost,
  sourcePath: string,
  targetPath: string,
  journal: DirectoryCopyJournal
): Promise<void> {
  const targetExists = await host.hasDirectory(targetPath);
  await host.filesystem.ensureDirectory(targetPath);
  if (!targetExists) {
    journal.createdDirectories.push(targetPath);
  }

  for await (const { name, kind } of host.filesystem.list(sourcePath)) {
    if (kind === 'directory') {
      await copyDirectory(host, joinDirectoryPath(sourcePath, name), joinDirectoryPath(targetPath, name), journal);
      continue;
    }

    const targetOpfsPath = joinDirectoryAndFileName(targetPath, name);
    // 这里已经自己持有快照并登记进 journal，因此写入走不带回滚的那条：
    // 换成 writeBlobToPath 会让它再取一份同样的快照，等于把每个已有目标整份抄两遍。
    const previous = await readFileIfExists(host, targetOpfsPath);
    const file = await host.filesystem.readBlob(joinDirectoryAndFileName(sourcePath, name));
    try {
      await writeBlobWithoutRollback(host, targetOpfsPath, file);
    } catch (error) {
      return throwAfterRollback(error, () => restoreFileState(host, targetOpfsPath, previous));
    }
    journal.files.push({ opfsPath: targetOpfsPath, previous });
  }
}
