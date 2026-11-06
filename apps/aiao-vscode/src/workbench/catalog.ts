import type { SerializedDockview } from 'dockview-core';
import type { ProjectTemplate } from './compiler/compiler-types.js';
import {
  parseWorkbenchPreferences,
  parseWorkbenchProjectState,
  type WorkbenchPreferences,
  type WorkbenchProjectState
} from './workbench-state.js';
export type { WorkbenchPreferences, WorkbenchProjectState } from './workbench-state.js';

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

/** 宿主可用 RxDB 等元数据存储实现本接口。 */
export interface WorkbenchCatalog {
  list(): Promise<readonly WorkbenchProjectInfo[]>;
  getPreferences(): Promise<WorkbenchPreferences | null>;
  putPreferences(preferences: WorkbenchPreferences): Promise<void>;
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
  const readJson = async (name: string): Promise<unknown> => {
    const root = await directory();
    let handle: FileSystemFileHandle;
    try {
      handle = await root.getFileHandle(name);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'NotFoundError') return undefined;
      throw cause;
    }
    return JSON.parse(await (await handle.getFile()).text()) as unknown;
  };
  const writeJson = async (name: string, value: unknown): Promise<void> => {
    const root = await directory();
    let existed = true;
    try {
      await root.getFileHandle(name);
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === 'NotFoundError')) throw cause;
      existed = false;
    }
    const file = await root.getFileHandle(name, { create: true });
    const writer = await file.createWritable();
    try {
      await writer.write(JSON.stringify(value));
      await writer.close();
    } catch (cause) {
      await writer.abort().catch(() => undefined);
      if (!existed) await root.removeEntry(name).catch(() => undefined);
      throw cause;
    }
  };
  const read = async (): Promise<WorkbenchProjectInfo[]> => {
    const value = await readJson(filename);
    if (value === undefined) return [];
    if (!Array.isArray(value) || !value.every(isWorkbenchProject))
      throw new Error('项目目录损坏，源码仓库仍保留在 OPFS');
    return value;
  };
  const lock = <T>(operation: () => Promise<T>): Promise<T> => {
    if (!navigator.storage?.getDirectory || !navigator.locks?.request)
      return Promise.reject(new Error('当前浏览器不支持 OPFS 或 Web Locks'));
    return navigator.locks.request('aiao-workbench-catalog', operation);
  };
  const stateFilename = (projectId: string): string => `state-${encodeURIComponent(projectId)}.json`;
  const layoutFilename = (projectId: string): string => `layout-${encodeURIComponent(projectId)}.json`;
  return {
    list: () => lock(read),
    put: project =>
      lock(async () => {
        const projects = await read();
        await writeJson(filename, [...projects.filter(item => item.id !== project.id), project]);
      }),
    getState: projectId =>
      lock(async () => {
        const value = await readJson(stateFilename(projectId));
        return value === undefined ? null : parseWorkbenchProjectState(value);
      }),
    putState: (projectId, state) => lock(() => writeJson(stateFilename(projectId), state)),
    getPreferences: () =>
      lock(async () => {
        const value = await readJson('preferences.json');
        return value === undefined ? null : parseWorkbenchPreferences(value);
      }),
    putPreferences: preferences => lock(() => writeJson('preferences.json', preferences)),
    getLayout: projectId => lock(async () => (await readJson(layoutFilename(projectId))) ?? null),
    putLayout: (projectId, layout) => lock(() => writeJson(layoutFilename(projectId), layout))
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
