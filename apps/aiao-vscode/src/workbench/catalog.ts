import type { SerializedDockview } from 'dockview-core';
import type { ProjectTemplate } from './compiler/compiler-types.js';

/** GitHub 远程仓库的目录条目补充信息。 */
export interface WorkbenchRemoteInfo {
  readonly kind: 'github';
  readonly owner: string;
  readonly repo: string;
  readonly branch: string;
}

/** 源码之外的项目目录信息。 */
export interface WorkbenchProjectInfo {
  readonly id: string;
  readonly name: string;
  readonly template: ProjectTemplate;
  readonly entry: string;
  readonly updatedAt: number;
  /** 远程仓库条目；本地模板项目没有该字段。远程条目不参与模板编译预览。 */
  readonly remote?: WorkbenchRemoteInfo;
}

/** 远程项目的 GitHub 后端项目标识：分支经 encodeURIComponent 编码。 */
export function githubProjectId(owner: string, repo: string, branch: string): string {
  return `github:${owner}/${repo}@${encodeURIComponent(branch)}`;
}

/** 构造 GitHub 远程仓库的目录条目；template / entry 为目录 schema 的占位值，预览对远程仓库不承诺。 */
export function githubProjectInfo(
  owner: string,
  repo: string,
  branch: string,
  updatedAt = Date.now()
): WorkbenchProjectInfo {
  return {
    id: githubProjectId(owner, repo, branch),
    name: `${owner}/${repo}`,
    template: 'vanilla',
    entry: '',
    updatedAt,
    remote: { kind: 'github', owner, repo, branch }
  };
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
  /** 读取项目上次的工作台布局；没有时为 null。读出的值不可信，由 Dockview 桥校验后才会应用。 */
  getLayout(projectId: string): Promise<unknown>;
  /** 保存项目的工作台布局（Dockview 序列化结果）。 */
  putLayout(projectId: string, layout: SerializedDockview): Promise<void>;
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
  const layoutFilename = (projectId: string): string => `layout-${projectId}.json`;
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
      }),
    getLayout: projectId =>
      lock(async () => {
        const root = await directory();
        let handle: FileSystemFileHandle;
        try {
          handle = await root.getFileHandle(layoutFilename(projectId));
        } catch (cause) {
          if (cause instanceof DOMException && cause.name === 'NotFoundError') return null;
          throw cause;
        }
        return JSON.parse(await (await handle.getFile()).text()) as unknown;
      }),
    putLayout: (projectId, layout) =>
      lock(async () => {
        const root = await directory();
        const file = await root.getFileHandle(layoutFilename(projectId), { create: true });
        const writer = await file.createWritable();
        await writer.write(JSON.stringify(layout));
        await writer.close();
      })
  };
}

/** 校验导入项目的元数据，不信任归档给出的模板与入口。 */
export function isWorkbenchProject(value: unknown): value is WorkbenchProjectInfo {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  const base =
    typeof item['id'] === 'string' &&
    typeof item['name'] === 'string' &&
    typeof item['entry'] === 'string' &&
    typeof item['updatedAt'] === 'number' &&
    Number.isFinite(item['updatedAt']) &&
    ['vanilla', 'react', 'vue', 'angular'].includes(String(item['template']));
  if (!base) return false;
  if (item['remote'] === undefined) return true;
  if (!item['remote'] || typeof item['remote'] !== 'object') return false;
  const remote = item['remote'] as Record<string, unknown>;
  return (
    remote['kind'] === 'github' &&
    typeof remote['owner'] === 'string' &&
    typeof remote['repo'] === 'string' &&
    typeof remote['branch'] === 'string'
  );
}
