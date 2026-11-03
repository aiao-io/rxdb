import type { ProjectTemplate } from './compiler/compiler-types.js';

/** 源码之外的项目目录信息。 */
export interface WorkbenchProjectInfo {
  readonly id: string;
  readonly name: string;
  readonly template: ProjectTemplate;
  readonly entry: string;
  readonly updatedAt: number;
}

/** 打开项目时恢复的编辑会话状态。 */
export interface WorkbenchProjectState {
  readonly tabs: readonly string[];
  readonly activePath: string | null;
  /** 最后一次成功提交的说明，重开时回填提交框。 */
  readonly commitMessage?: string;
}

/** 宿主可用 RxDB 等元数据存储实现本接口。 */
export interface WorkbenchCatalog {
  list(): Promise<readonly WorkbenchProjectInfo[]>;
  put(project: WorkbenchProjectInfo): Promise<void>;
  getState(projectId: string): Promise<WorkbenchProjectState | null>;
  putState(projectId: string, state: WorkbenchProjectState): Promise<void>;
}

/** 独立演示的项目目录；不与 Git 工作区共用文件根。 */
export function createProjectCatalog(): WorkbenchCatalog {
  const filename = 'projects.json';
  const directory = async () => {
    if (!navigator.storage?.getDirectory || !navigator.locks?.request)
      throw new Error('当前浏览器不支持 OPFS 或 Web Locks');
    return (await navigator.storage.getDirectory()).getDirectoryHandle('aiao-workbench-catalog', { create: true });
  };
  const read = async (): Promise<WorkbenchProjectInfo[]> => {
    const root = await directory();
    let handle: FileSystemFileHandle;
    try {
      handle = await root.getFileHandle(filename);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'NotFoundError') return [];
      throw cause;
    }
    const value: unknown = JSON.parse(await (await handle.getFile()).text());
    if (!Array.isArray(value) || !value.every(isWorkbenchProject))
      throw new Error('项目目录损坏，源码仓库仍保留在 OPFS');
    return value;
  };
  const lock = <T>(operation: () => Promise<T>): Promise<T> => {
    if (!navigator.storage?.getDirectory || !navigator.locks?.request)
      return Promise.reject(new Error('当前浏览器不支持 OPFS 或 Web Locks'));
    return navigator.locks.request('aiao-workbench-catalog', operation);
  };
  const stateFilename = (projectId: string): string => `state-${projectId}.json`;
  return {
    list: () => lock(read),
    put: project =>
      lock(async () => {
        const projects = await read();
        const next = [...projects.filter(item => item.id !== project.id), project];
        const root = await directory();
        let existed = true;
        try {
          await root.getFileHandle(filename);
        } catch (cause) {
          if (cause instanceof DOMException && cause.name === 'NotFoundError') existed = false;
          else throw cause;
        }
        const file = await root.getFileHandle(filename, { create: true });
        const writer = await file.createWritable();
        try {
          await writer.write(JSON.stringify(next));
          await writer.close();
        } catch (cause) {
          await writer.abort().catch(() => undefined);
          if (!existed) await root.removeEntry(filename).catch(() => undefined);
          throw cause;
        }
      }),
    getState: projectId =>
      lock(async () => {
        const root = await directory();
        let handle: FileSystemFileHandle;
        try {
          handle = await root.getFileHandle(stateFilename(projectId));
        } catch (cause) {
          if (cause instanceof DOMException && cause.name === 'NotFoundError') return null;
          throw cause;
        }
        const value: unknown = JSON.parse(await (await handle.getFile()).text());
        if (
          !value ||
          typeof value !== 'object' ||
          !Array.isArray((value as Record<string, unknown>)['tabs']) ||
          ((value as Record<string, unknown>)['tabs'] as unknown[]).some(item => typeof item !== 'string')
        )
          throw new Error('项目会话状态损坏');
        const item = value as Record<string, unknown>;
        return {
          tabs: item['tabs'] as string[],
          activePath: typeof item['activePath'] === 'string' ? item['activePath'] : null,
          commitMessage: typeof item['commitMessage'] === 'string' ? item['commitMessage'] : undefined
        };
      }),
    putState: (projectId, state) =>
      lock(async () => {
        const root = await directory();
        const file = await root.getFileHandle(stateFilename(projectId), { create: true });
        const writer = await file.createWritable();
        await writer.write(
          JSON.stringify({
            tabs: [...state.tabs],
            activePath: state.activePath,
            ...(state.commitMessage === undefined ? {} : { commitMessage: state.commitMessage })
          })
        );
        await writer.close();
      })
  };
}

/** 校验导入项目的元数据，不信任归档给出的模板与入口。 */
export function isWorkbenchProject(value: unknown): value is WorkbenchProjectInfo {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item['id'] === 'string' &&
    typeof item['name'] === 'string' &&
    typeof item['entry'] === 'string' &&
    typeof item['updatedAt'] === 'number' &&
    Number.isFinite(item['updatedAt']) &&
    ['vanilla', 'react', 'vue', 'angular'].includes(String(item['template']))
  );
}
