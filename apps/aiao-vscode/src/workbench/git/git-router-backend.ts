import type { WorkbenchBackend, WorkbenchFiles, WorkbenchSnapshot } from '../session.js';

export interface RouterBackendOptions {
  readonly local: WorkbenchBackend;
  readonly github: WorkbenchBackend;
}

/**
 * 按项目标识分发的后端路由：`github:` 前缀交给虚拟仓库后端，其余交给本地 OPFS Git 后端。
 * 工作台会话与 UI 不感知后端差异，GitHub 项目与本地项目在同一个会话里切换。
 */
export function createRouterBackend(options: RouterBackendOptions): WorkbenchBackend {
  const backend = (projectId: string): WorkbenchBackend =>
    projectId.startsWith('github:') ? options.github : options.local;

  return {
    open: (projectId: string): Promise<WorkbenchSnapshot> => backend(projectId).open(projectId),
    create: (projectId: string, files: WorkbenchFiles): Promise<WorkbenchSnapshot> =>
      backend(projectId).create(projectId, files),
    save: (projectId: string, files: WorkbenchFiles, expectedRevision: string): Promise<WorkbenchSnapshot> =>
      backend(projectId).save(projectId, files, expectedRevision),
    remove: (projectId: string, path: string): Promise<void> => backend(projectId).remove(projectId, path),
    rename: (projectId: string, from: string, to: string): Promise<void> =>
      backend(projectId).rename(projectId, from, to),
    move: (projectId: string, from: string, to: string): Promise<void> => backend(projectId).move(projectId, from, to),
    status: (projectId: string) => backend(projectId).status(projectId),
    stage: (projectId: string, paths: readonly string[]): Promise<void> => backend(projectId).stage(projectId, paths),
    unstage: (projectId: string, paths: readonly string[]): Promise<void> =>
      backend(projectId).unstage(projectId, paths),
    readDiff: (projectId: string, path: string, kind: 'working' | 'staged') =>
      backend(projectId).readDiff(projectId, path, kind),
    discardWorking: (projectId: string, path: string): Promise<WorkbenchSnapshot> =>
      backend(projectId).discardWorking(projectId, path),
    commit: (projectId: string, message: string): Promise<string> => backend(projectId).commit(projectId, message),
    history: (projectId: string) => backend(projectId).history(projectId),
    restore: (projectId: string, oid: string): Promise<WorkbenchSnapshot> => backend(projectId).restore(projectId, oid),
    exportArchive: (projectId: string): Promise<Uint8Array> => backend(projectId).exportArchive(projectId),
    importArchive: (projectId: string, bytes: Uint8Array): Promise<void> =>
      backend(projectId).importArchive(projectId, bytes),
    dispose: (): void => {
      options.local.dispose();
      options.github.dispose();
    }
  };
}
