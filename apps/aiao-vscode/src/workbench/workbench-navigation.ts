/** 顶部前进、后退按钮打开的源码位置。 */
export interface WorkbenchNavigationTarget {
  readonly projectId: string;
  readonly path: string;
}

/** 单项目内的文件访问历史；导航后重复记录当前路径不会改变前进分支。 */
export interface WorkbenchNavigation {
  readonly canGoBack: boolean;
  readonly canGoForward: boolean;
  record(projectId: string, path: string): void;
  back(): WorkbenchNavigationTarget | null;
  forward(): WorkbenchNavigationTarget | null;
  reconcile(projectId: string, paths: readonly string[]): void;
  reset(): void;
}

/** 创建独立于标签顺序、随项目切换清空的文件导航历史。 */
export function createWorkbenchNavigation(): WorkbenchNavigation {
  let project: string | null = null;
  let entries: WorkbenchNavigationTarget[] = [];
  let cursor = -1;

  function reset(): void {
    project = null;
    entries = [];
    cursor = -1;
  }

  function selectProject(projectId: string): void {
    if (project === projectId) return;
    reset();
    project = projectId;
  }

  return {
    get canGoBack() {
      return cursor > 0;
    },
    get canGoForward() {
      return cursor < entries.length - 1;
    },
    record(projectId, path) {
      selectProject(projectId);
      if (entries[cursor]?.path === path) return;
      entries = entries.slice(0, cursor + 1);
      entries.push({ projectId, path });
      cursor = entries.length - 1;
    },
    back() {
      if (cursor <= 0) return null;
      return entries[--cursor];
    },
    forward() {
      if (cursor >= entries.length - 1) return null;
      return entries[++cursor];
    },
    reconcile(projectId, paths) {
      selectProject(projectId);
      const available = new Set(paths);
      const retained: WorkbenchNavigationTarget[] = [];
      let position = -1;
      for (const [index, entry] of entries.entries()) {
        if (!available.has(entry.path)) continue;
        if (retained.at(-1)?.path !== entry.path) retained.push(entry);
        if (index <= cursor) position = retained.length - 1;
      }
      entries = retained;
      cursor = position;
    },
    reset
  };
}
