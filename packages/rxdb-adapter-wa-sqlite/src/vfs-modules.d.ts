import type { SQLiteVFS } from './wa-sqlite.interface.js';

interface VfsFactory {
  create(name: string, module: unknown, options?: unknown): Promise<SQLiteVFS> | SQLiteVFS;
}

export const VFS_MODULES: {
  readonly MemoryVFS: () => Promise<{ readonly MemoryVFS: VfsFactory }>;
  readonly MemoryAsyncVFS: () => Promise<{ readonly MemoryAsyncVFS: VfsFactory }>;
  readonly IDBBatchAtomicVFS: () => Promise<{ readonly IDBBatchAtomicVFS: VfsFactory }>;
  readonly IDBMirrorVFS: () => Promise<{ readonly IDBMirrorVFS: VfsFactory }>;
  readonly AccessHandlePoolVFS: () => Promise<{ readonly AccessHandlePoolVFS: VfsFactory }>;
  readonly OPFSAdaptiveVFS: () => Promise<{ readonly OPFSAdaptiveVFS: VfsFactory }>;
  readonly OPFSAnyContextVFS: () => Promise<{ readonly OPFSAnyContextVFS: VfsFactory }>;
  readonly OPFSCoopSyncVFS: () => Promise<{ readonly OPFSCoopSyncVFS: VfsFactory }>;
  readonly OPFSWriteAheadVFS: () => Promise<{ readonly OPFSWriteAheadVFS: VfsFactory }>;
};
