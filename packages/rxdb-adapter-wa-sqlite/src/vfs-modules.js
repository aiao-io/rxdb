export const VFS_MODULES = {
  MemoryVFS: () => import('wa-sqlite/src/examples/MemoryVFS.js'),
  MemoryAsyncVFS: () => import('wa-sqlite/src/examples/MemoryAsyncVFS.js'),
  IDBBatchAtomicVFS: () => import('wa-sqlite/src/examples/IDBBatchAtomicVFS.js'),
  IDBMirrorVFS: () => import('wa-sqlite/src/examples/IDBMirrorVFS.js'),
  AccessHandlePoolVFS: () => import('wa-sqlite/src/examples/AccessHandlePoolVFS.js'),
  OPFSAdaptiveVFS: () => import('wa-sqlite/src/examples/OPFSAdaptiveVFS.js'),
  OPFSAnyContextVFS: () => import('wa-sqlite/src/examples/OPFSAnyContextVFS.js'),
  OPFSCoopSyncVFS: () => import('wa-sqlite/src/examples/OPFSCoopSyncVFS.js'),
  OPFSWriteAheadVFS: () => import('wa-sqlite/src/examples/OPFSWriteAheadVFS.js')
};
