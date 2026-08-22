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

  const backupPath = targetExists ? `/.rxdb-storage-journal-${Date.now()}-${randomToken()}` : null;
  const backupJournal: DirectoryCopyJournal = { files: [], createdDirectories: [] };
  const copyJournal: DirectoryCopyJournal = { files: [], createdDirectories: [] };
  const removedTargetMetas: StorageFileMeta[] = [];
  const attemptedMoves: typeof moves = [];

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
      removedTargetMetas.push(targetMeta);
    }
    if (targetExists) await host.removeDirectoryPath(targetPath);
    await copyDirectory(host, sourcePath, targetPath, copyJournal);
    for (const move of moves) {
      attemptedMoves.push(move);
      await host.updateMeta(move.meta, { ...move.original, opfsPath: move.targetOpfsPath });
    }
    await host.removeDirectoryPath(sourcePath);
  } catch (error) {
    return throwAfterRollback(
      error,
      () => rollbackMetaMoves(host, attemptedMoves),
      () => rollbackDirectoryCopy(host, copyJournal),
      () => host.removeDirectoryPath(targetPath),
      () => restoreDirectoryBackup(host, backupPath, targetPath),
      () => restoreRemovedMetas(host, removedTargetMetas),
      () => (backupPath ? host.removeDirectoryPath(backupPath) : Promise.resolve())
    );
  }

  await discardDirectoryJournal(host, copyJournal);
  await discardDirectoryJournal(host, backupJournal);
  if (backupPath) await host.removeDirectoryPath(backupPath);
  return targetPath;
}

async function renameDirectoryWithMove(
  host: StorageFileOpsHost,
  targetExists: boolean,
  sourcePath: string,
  targetPath: string,
  moves: ReadonlyArray<{
    meta: StorageFileMeta;
    original: StorageMetaPatch;
    targetOpfsPath: string;
  }>,
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
