import {
  createProjectCatalog,
  githubProjectInfo,
  type WorkbenchCatalog,
  type WorkbenchProjectInfo,
  type WorkbenchProjectState
} from './catalog.js';
import { createCompiler, type WorkbenchCompiler } from './compiler-client.js';
import type { ProjectTemplate } from './compiler/compiler-types.js';
import { CompilationError, type WorkbenchDiagnostic } from './compiler/compiler-types.js';
import type { WorkbenchEditorCommand, WorkbenchEditorHandle, WorkbenchEditorMount } from './editor.js';
import { readFolderProject } from './folder-import.js';
import { formatWorkbenchSource } from './formatter.js';
import { createGitBackend } from './git-backend.js';
import type { GitHubApi } from './git/github/github-api.js';
import type { GitHubAuth } from './git/github/github-auth.js';
import { requestGitHubLogin } from './git/github/github-login.js';
import { requestGitHubRepository } from './git/github/github-picker.js';
import type { GitHubSession } from './git/github/github-types.js';
import { mountPreview, type PreviewEvent } from './preview/preview-sandbox.js';
import { createSavePreviewController, type SavePreviewPhase } from './save-preview.js';
import { WorkbenchSession, type WorkbenchBackend, type WorkbenchState, type WorkbenchStatus } from './session.js';
import { angularTemplate, defaultAngularDemo } from './templates-angular.js';
import { defaultFrontendDemos, frontendTemplates, type WorkbenchTemplate } from './templates.js';
import {
  isRuntimeId,
  RUNTIME_LABELS,
  type RuntimeId,
  type TerminalRuntimeAdapter
} from './terminal/runtime-adapter.js';
import { createWebContainerAdapter } from './terminal/webcontainer-adapter.js';
import { createWorkbenchTerminal } from './terminal/workbench-terminal.js';
import { createWorkbenchCommands, type WorkbenchCommand } from './workbench-commands.js';
import { confirmWorkbenchAction, requestWorkbenchChoice, requestWorkbenchText } from './workbench-dialog.js';
import { createWorkbenchDiff, type WorkbenchDiffHandle } from './workbench-diff.js';
import { createWorkbenchDockview } from './workbench-dockview.js';
import {
  buildExplorerRows,
  explorerActiveAncestor,
  explorerCreationParent,
  explorerDecorations,
  explorerInsertion,
  explorerNameError,
  type ExplorerRow
} from './workbench-explorer-model.js';
import {
  createExplorerAction,
  createExplorerInputRow,
  createExplorerPane,
  createExplorerRow,
  type ExplorerRowContext
} from './workbench-explorer-view.js';
import { createCodicon, createFileIcon, type CodiconName } from './workbench-icons.js';
import { createWorkbenchLayout, workbenchElement } from './workbench-layout.js';
import { attachWorkbenchLongPress } from './workbench-longpress.js';
import { createWorkbenchNavigation } from './workbench-navigation.js';
import { createWorkbenchRecoveryJournal } from './workbench-recovery.js';
import { createWorkbenchScm, type WorkbenchDiffRequest } from './workbench-scm.js';
import { createWorkbenchSearch } from './workbench-search.js';
import { openWorkbenchSettings } from './workbench-settings.js';
import { defaultWorkbenchPreferences } from './workbench-state.js';
import { resolveTreeMove, treePathBase, treePathParent, type TreeMoveDecision } from './workbench-tree-drag.js';

/** 工作台的可注入服务与静态资源位置。 */
export interface BrowserWorkbenchOptions {
  readonly assetBaseURL?: string;
  readonly initialProjectId?: string;
  readonly backend?: WorkbenchBackend;
  readonly compiler?: WorkbenchCompiler;
  readonly catalog?: WorkbenchCatalog;
  /** 商用 WebContainer 授权配置，在首次启动终端前传入。 */
  readonly webContainerApiKey?: string;
  /** 提供后在欢迎视图显示「从 GitHub 打开仓库」入口。 */
  readonly githubApi?: GitHubApi;
  /** 提供后在欢迎视图显示「登录 GitHub」入口，并给仓库选择器接上登录按钮。 */
  readonly githubAuth?: GitHubAuth;
}

/** 工作台实例；释放会终止所有 Worker 与编辑器。 */
export interface WorkbenchHandle {
  readonly ready: Promise<void>;
  readonly session: WorkbenchSession;
  /** 强制按容器当前尺寸重布局；容器无尺寸时静默跳过。 */
  refreshLayout(): void;
  dispose(): void;
}

/** 顶栏布局按钮的 on/off 字形对：状态靠字形变体表达，不靠按钮底色（对齐 VS Code）。 */
const TOGGLE_ICONS: Readonly<Record<string, readonly [CodiconName, CodiconName]>> = {
  'toggle-sidebar': ['layout-sidebar-left', 'layout-sidebar-left-off'],
  panel: ['layout-panel', 'layout-panel-off']
};

/** 上下文菜单的一个条目：动作行（可勾选、可带快捷键提示）或分隔线。 */
type MenuEntry =
  | {
      readonly label: string;
      readonly id?: string;
      readonly action: () => Promise<unknown> | void;
      readonly disabled?: boolean;
      /** 勾选项：已勾选时在行首显示对勾。 */
      readonly checked?: boolean;
      readonly keybinding?: string;
    }
  | { readonly separator: true };

const SEPARATOR = { separator: true } as const;
/** 已接入、可在设置里选择的运行方式；其余在设置里显示为待接入（US-409）。 */
const AVAILABLE_RUNTIMES: ReadonlySet<RuntimeId> = new Set<RuntimeId>(['esbuild-wasm', 'webcontainer']);

const templates: Record<ProjectTemplate, WorkbenchTemplate> = {
  ...frontendTemplates,
  angular: { ...angularTemplate, title: 'Angular standalone' }
};
const defaultDemos: readonly { id: string; name: string; template: WorkbenchTemplate }[] = [
  { id: 'default-react', name: 'React 最小 Demo', template: defaultFrontendDemos.react },
  { id: 'default-vue', name: 'Vue 最小 Demo', template: defaultFrontendDemos.vue },
  { id: 'default-angular', name: 'Angular 最小 Demo', template: defaultAngularDemo }
];
const languages: Record<string, string> = {
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  jsx: 'jsx',
  vue: 'vue',
  css: 'css',
  html: 'html',
  json: 'json',
  md: 'markdown',
  svg: 'xml',
  yaml: 'yaml',
  yml: 'yaml'
};
const languageFor = (path: string): string => languages[path.split('.').at(-1) ?? ''] ?? 'plaintext';
const languageLabels: Readonly<Record<string, string>> = {
  typescript: 'TypeScript',
  tsx: 'TypeScript React',
  javascript: 'JavaScript',
  jsx: 'JavaScript React',
  vue: 'Vue',
  css: 'CSS',
  html: 'HTML',
  json: 'JSON',
  markdown: 'Markdown',
  xml: 'XML',
  yaml: 'YAML'
};
const languageLabel = (path: string): string => languageLabels[languageFor(path)] ?? languageFor(path);
const messageFor = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause));
/** 布局落库的防抖间隔：拖动分隔条时不逐帧写目录。 */
const LAYOUT_SAVE_DELAY_MS = 300;

/** 挂载三端共享的 VS Code 风格界面。用户代码只进入隔离预览。 */
export function mountWorkbench(
  host: HTMLElement,
  options: BrowserWorkbenchOptions,
  mountEditor: WorkbenchEditorMount
): WorkbenchHandle {
  const assetBase = options.assetBaseURL ?? '/browser-workbench-assets/';
  const base = new URL(assetBase.endsWith('/') ? assetBase : `${assetBase}/`, location.href).href;
  const root = createWorkbenchLayout(host, base);
  const element = <T extends HTMLElement = HTMLElement>(selector: string) => workbenchElement<T>(root, selector);
  const backend = options.backend ?? createGitBackend(base);
  const compiler = options.compiler ?? createCompiler(base);
  const catalog = options.catalog ?? createProjectCatalog();
  const recovery = createWorkbenchRecoveryJournal({
    getItem: key => window.sessionStorage.getItem(key),
    setItem: (key, value) => window.sessionStorage.setItem(key, value),
    removeItem: key => window.sessionStorage.removeItem(key)
  });
  const session = new WorkbenchSession(backend);
  const navigation = createWorkbenchNavigation();
  const logContents = new Map(
    ['problems', 'output', 'console'].map(kind => [kind, element(`[data-log="${kind}"] .wb-panel-content`)])
  );
  const previewContent = element('.wb-preview-content');
  const previewVersion = element('.wb-preview-version');
  const tree = element('[data-slot="files"]');
  const editors = new Map<string, { host: HTMLElement; handle: WorkbenchEditorHandle }>();
  const diffs = new Map<
    string,
    {
      projectId: string;
      path: string;
      kind: 'working' | 'staged';
      host: HTMLElement;
      request: number;
      view?: WorkbenchDiffHandle;
    }
  >();
  let previewPhase: SavePreviewPhase = 'idle';
  let scmBusy = false;
  const logs: {
    kind: 'problems' | 'output' | 'console';
    text: string;
    level?: string;
    targets?: readonly WorkbenchDiagnostic[];
  }[] = [];
  let projects: readonly WorkbenchProjectInfo[] = [];
  let project: WorkbenchProjectInfo | undefined;
  let sideView = 'explorer';
  let preview: ReturnType<typeof mountPreview> | undefined;
  let previewId = 0;
  let disposed = false;
  let initializing = true;
  let pendingOperations = 0;
  let gitRefresh = 0;
  let activeTreePath: string | null = null;
  let selectedEditorPath: string | null = null;
  let renderedProjectId: string | null = null;
  let treeProjectId: string | null = null;
  let creatingFile = false;
  let creatingFolder = false;
  /** 新建文件 / 文件夹的落点目录（空串为根）。 */
  let creatingParent = '';
  /** 对齐 vscode.dev：默认不显示「打开的编辑器」，由视图菜单切换。 */
  let showOpenEditors = false;
  let renamingPath: string | null = null;
  let treeFocusPath: string | null = null;
  let treeNavigation = false;
  let dragPath: string | null = null;
  let pendingDrop: TreeMoveDecision | null = null;
  let dropFeedbackKey: string | null = null;
  let autoExpandTimer: ReturnType<typeof setTimeout> | null = null;
  let autoExpandTarget: string | null = null;
  let contextMenu: HTMLElement | null = null;
  let gitStatus: WorkbenchStatus | null = null;
  let persistedState = '';
  let unrestoredProject: string | null = null;
  let preferencesRestored = false;
  /** 当前项目最近一次落库（或恢复）的布局 JSON，相同布局不重复写。 */
  let savedLayout = '';
  let layoutDirty = false;
  let layoutSaveTimer: ReturnType<typeof setTimeout> | undefined;
  let persistChain: Promise<void> = Promise.resolve();
  let restoring = false;
  let indentUnit = defaultWorkbenchPreferences.indentUnit;
  let editorEngine = defaultWorkbenchPreferences.editorEngine;
  const savedCommitMessages = new Map<string, string>();
  const editorDiagnostics = new Map<string, { line: number; column?: number; message: string }[]>();
  const collapsedFolders = new Set<string>();
  const collapsedSections = new Set<string>();
  let alwaysShowScmActions = defaultWorkbenchPreferences.alwaysShowScmActions;
  /** 设置里保存的运行方式；地址参数 `?runtime=` 只覆盖当前页面，供基准脚本批量切换，不写回设置。 */
  let preferredRuntime = defaultWorkbenchPreferences.runtime;
  const requestedRuntime = new URLSearchParams(location.search).get('runtime');
  const runtimeOverride = isRuntimeId(requestedRuntime) ? requestedRuntime : undefined;
  const currentRuntime = (): RuntimeId => runtimeOverride ?? preferredRuntime;
  let githubSession: GitHubSession | null = null;
  const serverPreviews = new Set<string>();
  const docking = createWorkbenchDockview(root, {
    onSelectEditor(path) {
      if (disposed || !session.state.tabs.includes(path)) return;
      if (session.state.activePath !== path)
        session.select(path, { preview: session.state.previewTabs.includes(path) });
      closeNarrowSidebar();
      if (!treeNavigation) focusEditor(path);
    },
    onPinEditor(path) {
      session.select(path);
    },
    onCloseEditor(path) {
      if (disposed) return;
      closeEditorTab(path);
    },
    onSelectTool(kind) {
      renderLogs();
      if (kind === 'terminal') void terminal.show().catch(report);
    },
    onCloseAuxiliary(id) {
      diffs.get(id)?.view?.dispose();
      diffs.delete(id);
    },
    onCloseSidebar() {
      if (disposed) return;
      docking.setSidebarVisible(false);
      renderActionState();
    },
    onCloseOthers(path) {
      for (const tab of [...session.state.tabs]) if (tab !== path) closeEditorTab(tab);
    },
    onCloseRight(path) {
      const tabs = session.state.tabs;
      for (const tab of tabs.slice(tabs.indexOf(path) + 1)) closeEditorTab(tab);
    },
    onClosePreview() {
      preview?.dispose();
      preview = undefined;
      previewId = 0;
    }
  });
  const narrowQuery = '(max-width: 768px)';
  const narrowMedia = window.matchMedia(narrowQuery);
  /** 窄屏抽屉模式下，选择文件后收起侧栏回到编辑器。 */
  const closeNarrowSidebar = (): void => {
    if (!narrowMedia.matches || !docking.isSidebarVisible()) return;
    docking.setSidebarVisible(false);
    renderActionState();
  };
  const applyNarrow = (matches: boolean): void => {
    docking.setSidebarOverlay(matches);
    renderActionState();
  };
  applyNarrow(narrowMedia.matches);
  const onNarrowChange = (event: MediaQueryListEvent): void => applyNarrow(event.matches);
  narrowMedia.addEventListener('change', onNarrowChange);

  // 首访时 dockview 的边缘组可能在挂载窗口内按 0 尺寸布局（上游竞态），布局事件与
  // ready 流程都可能延迟；refreshLayout 幂等且健康时开销极小，分档重试直到修复。
  const layoutRetries = [500, 1500, 4000].map(delay => setTimeout(() => docking.refreshLayout(), delay));

  /** 活动栏底部 GitHub 帐户入口：无认证能力时隐藏，登录后显示徽标与用户名。 */
  function renderAccountState(): void {
    const button = element<HTMLButtonElement>('[data-action="github-account"]');
    button.hidden = !options.githubAuth;
    const badge = element<HTMLElement>('[data-slot="account-badge"]');
    if (githubSession) {
      button.setAttribute('aria-pressed', 'true');
      button.title = `已登录 ${githubSession.login}`;
      badge.textContent = githubSession.login.slice(0, 1).toUpperCase();
      badge.hidden = false;
    } else {
      button.removeAttribute('aria-pressed');
      button.title = '登录 GitHub';
      badge.hidden = true;
    }
  }
  renderAccountState();
  if (options.githubAuth) {
    options.githubAuth.subscribe(session => {
      if (disposed) return;
      githubSession = session;
      renderAccountState();
    });
    void options.githubAuth.getSession().then(session => {
      if (disposed) return;
      githubSession = session;
      renderAccountState();
    });
  }
  const layoutChanges = docking.api.onDidLayoutChange(() => {
    queueMicrotask(() => {
      if (!disposed) {
        editors.forEach(editor => editor.handle.layout?.());
        diffs.forEach(diff => diff.view?.layout());
        terminal?.fit();
      }
    });
    scheduleLayoutSave();
  });
  /** 布局变化防抖落库；恢复项目期间的中间布局不记。 */
  function scheduleLayoutSave(): void {
    if (disposed || restoring || !renderedProjectId) return;
    layoutDirty = true;
    clearTimeout(layoutSaveTimer);
    layoutSaveTimer = setTimeout(flushLayout, LAYOUT_SAVE_DELAY_MS);
  }
  /** 把待写的布局落到界面上正显示的项目；切换项目时在编辑器换掉之前调用，布局不会串到新项目。 */
  function flushLayout(): void {
    clearTimeout(layoutSaveTimer);
    const id = renderedProjectId;
    if (!layoutDirty || !id || disposed) return;
    layoutDirty = false;
    const layout = docking.serializeLayout();
    const json = JSON.stringify(layout);
    if (json === savedLayout) return;
    savedLayout = json;
    persistChain = persistChain.then(() => catalog.putLayout(id, layout)).catch(report);
  }
  /** 应用项目保存的布局：只排布已打开的标签，活动文件仍以会话为准。 */
  function applySavedLayout(layout: unknown): void {
    if (!docking.applyLayout(layout)) {
      log('output', '项目布局记录无效，已保留当前布局');
      return;
    }
    if (session.state.activePath) docking.selectEditor(session.state.activePath);
    renderActionState();
  }

  const scm = createWorkbenchScm(element('[data-slot="scm"]'), {
    backend,
    session,
    onError: report,
    onBusyChange(busy) {
      scmBusy = busy;
      if (!disposed) renderActionState();
    },
    onOpenDiff: openDiff,
    onOpenFile(path) {
      session.select(path);
      docking.selectEditor(path);
      closeNarrowSidebar();
      focusEditor(path);
    },
    onRefresh: () => action(refreshGit),
    onContextMenu: (position, entries) => showContextMenu(position, entries),
    getSavedMessage: id => savedCommitMessages.get(id),
    onCommitMessage: (id, message) => {
      savedCommitMessages.set(id, message);
      persistState();
    },
    async onDidChange(snapshot, paths) {
      if (snapshot && snapshot.projectId === session.state.projectId) {
        cancelCompilation();
        session.applySavedSnapshot(snapshot, paths ?? []);
      }
      await refreshGit();
    }
  });
  const search = createWorkbenchSearch(element('[data-slot="search-view"]'), {
    onOpenMatch(path, line) {
      session.select(path);
      docking.selectEditor(path);
      editorCommand('gotoLineAt', line);
      closeNarrowSidebar();
      focusEditor(path);
    },
    onReplaceFiles(next, scope) {
      void (async () => {
        if (scope === 'all') {
          const confirmed = await confirmWorkbenchAction(
            root,
            '全部替换',
            `将在 ${Object.keys(next).length} 个文件中替换全部匹配项。`,
            '替换全部'
          );
          if (!confirmed) return;
        }
        for (const [path, content] of Object.entries(next)) session.edit(path, content);
        log('output', `已替换 ${Object.keys(next).length} 个文件中的匹配项`);
      })().catch(report);
    }
  });
  const savePreview = createSavePreviewController(
    session,
    async (snapshot, signal) => {
      const info = projects.find(item => item.id === snapshot.projectId) ?? project;
      if (!info || info.id !== snapshot.projectId) throw new Error('项目配置已切换');
      return compiler.compile({ files: { ...snapshot.files }, template: info.template, entry: info.entry }, signal);
    },
    {
      onPhase(phase) {
        previewPhase = phase;
        scm.setBusy(phase === 'saving');
        renderStatus();
        renderActionState();
        if (phase === 'idle') clearEditorDiagnostics();
      },
      onError: report
    }
  );

  const terminal = createWorkbenchTerminal(element('[data-log="terminal"]'), {
    session,
    adapter: () => runtimeAdapter(currentRuntime()),
    onError: report,
    onFilesChanged: () => {
      void refreshGit().catch(report);
    },
    onPreview(port, url) {
      const id = `server-preview:${port}`;
      const host = docking.ensureAuxiliary(id, `项目服务 :${port}`);
      const frame = document.createElement('iframe');
      frame.className = 'wb-server-preview';
      frame.title = `项目服务 :${port}`;
      frame.referrerPolicy = 'no-referrer';
      frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-modals allow-popups');
      frame.src = url;
      host.replaceChildren(frame);
      serverPreviews.add(id);
    },
    onStop() {
      for (const id of serverPreviews) docking.removeAuxiliary(id);
      serverPreviews.clear();
    }
  });

  function focusEditor(path: string | null): void {
    if (!path) return;
    const id = session.state.projectId;
    const previousFocus = root.ownerDocument.activeElement;
    queueMicrotask(() => {
      if (disposed) return;
      requestAnimationFrame(() => {
        if (disposed || session.state.projectId !== id || session.state.activePath !== path) return;
        if (docking.api.activePanel?.id !== `editor:${path}`) return;
        const focused = root.ownerDocument.activeElement;
        if (focused !== previousFocus && focused !== root && focused !== root.ownerDocument.body) return;
        editors.get(path)?.handle.focus?.();
      });
    });
  }

  function closeEditorTab(path: string): void {
    session.closeTab(path);
    root.focus();
    focusEditor(session.state.activePath);
  }

  function activeResource(): string | null {
    const active = docking.api.activePanel;
    return active ?
        (diffs.get(active.id)?.path ??
          (active.id.startsWith('editor:') ? active.id.slice(7) : session.state.activePath))
      : session.state.activePath;
  }

  function focusedEditorPath(): string | null {
    const focused = root.ownerDocument.activeElement;
    return (
      (focused && root.contains(focused) ?
        focused.closest('[data-editor-path]')?.getAttribute('data-editor-path')
      : null) ?? null
    );
  }

  function closeActiveEditor(): void {
    const path = focusedEditorPath();
    if (path && session.state.tabs.includes(path)) {
      closeEditorTab(path);
      return;
    }
    const panel = docking.api.activePanel;
    if (panel?.id.startsWith('editor:')) closeEditorTab(panel.id.slice(7));
    else if (panel && (panel.id.startsWith('diff:') || panel.id === 'preview')) panel.api.close();
  }

  function cycleEditor(direction: 1 | -1): void {
    const tabs = session.state.tabs;
    if (!tabs.length) return;
    const current = activeResource();
    const index = current ? tabs.indexOf(current) : -1;
    const base =
      index === -1 ?
        direction === 1 ?
          -1
        : 0
      : index;
    const next = tabs[(base + direction + tabs.length) % tabs.length];
    session.select(next);
    docking.selectEditor(next);
    focusEditor(next);
  }

  async function formatSource(): Promise<void> {
    const path = focusedEditorPath() ?? session.state.activePath;
    if (!path) return;
    const value = session.state.files[path];
    if (typeof value !== 'string') {
      log('output', `二进制文件无法格式化：${path}`);
      return;
    }
    const outcome = await formatWorkbenchSource(path, value);
    if (outcome.kind === 'formatted') {
      const editor = editors.get(path);
      if (!editor) throw new Error('文件编辑器尚未挂载');
      editor.handle.replace(outcome.text);
      log('output', `已格式化 ${path}`);
    } else if (outcome.kind === 'unsupported') {
      log('output', `没有可用于 ${path} 的格式化器`);
    }
  }

  function editorCommand(command: WorkbenchEditorCommand, argument?: number): void {
    const path = focusedEditorPath() ?? session.state.activePath;
    if (!path) return;
    const handle = editors.get(path)?.handle;
    if (!handle?.runCommand) return;
    if (argument === undefined) handle.runCommand(command);
    else handle.runCommand(command, argument);
  }

  async function loadDiff(id: string): Promise<void> {
    const entry = diffs.get(id);
    if (!entry) return;
    const request = ++entry.request;
    try {
      const model = await backend.readDiff(entry.projectId, entry.path, entry.kind);
      if (
        disposed ||
        session.state.projectId !== entry.projectId ||
        diffs.get(id) !== entry ||
        request !== entry.request
      )
        return;
      const staging = document.createElement('div');
      staging.style.height = '100%';
      const view = await createWorkbenchDiff(staging, model);
      if (
        disposed ||
        session.state.projectId !== entry.projectId ||
        diffs.get(id) !== entry ||
        request !== entry.request
      ) {
        view.dispose();
        return;
      }
      entry.view?.dispose();
      entry.view = view;
      entry.host.replaceChildren(staging);
      queueMicrotask(() => {
        if (diffs.get(id) === entry) view.layout();
      });
    } catch (cause) {
      if (
        disposed ||
        session.state.projectId !== entry.projectId ||
        diffs.get(id) !== entry ||
        request !== entry.request
      )
        return;
      const error = document.createElement('p');
      error.className = 'wb-diff-error';
      error.setAttribute('role', 'alert');
      error.textContent = `${entry.view ? '差异刷新失败，仍显示上次结果：' : '无法读取差异：'}${messageFor(cause)}`;
      entry.host.querySelector('.wb-diff-error')?.remove();
      entry.host.prepend(error);
      report(cause);
    }
  }

  async function openDiff(request: WorkbenchDiffRequest): Promise<void> {
    const id = `diff:${request.kind}:${request.path}`;
    const host = docking.ensureAuxiliary(
      id,
      `${request.path.split('/').at(-1)} (${request.kind === 'staged' ? '暂存区' : '工作区'})`
    );
    if (!diffs.has(id)) {
      host.textContent = '正在读取 Git 差异…';
      diffs.set(id, { projectId: projectId(), ...request, host, request: 0 });
    }
    await loadDiff(id);
  }

  function renderStatus(): void {
    const state = session.state;
    const path = activeResource();
    const modified = path ? session.isModified(path) : false;
    const remaining = Object.keys(state.files).filter(file => session.isModified(file)).length;
    for (const slot of ['branch']) element(`[data-slot="${slot}"]`).hidden = !state.projectId;
    for (const slot of ['cursor', 'indent', 'encoding', 'language']) element(`[data-slot="${slot}"]`).hidden = !path;
    const activity = previewPhase === 'compiling' || previewPhase === 'waiting' ? ' · 更新预览中…' : '';
    element('[data-slot="save-status"]').textContent =
      initializing ? '加载项目…'
      : previewPhase === 'saving' ? '正在保存…'
      : modified ? `未保存${activity}`
      : state.projectId ? `已保存在此浏览器${remaining ? ` · 另有 ${remaining} 个文件未保存` : ''}${activity}`
      : '尚未打开项目';
    previewVersion.textContent =
      state.preview ?
        `r${state.preview.revision}${state.dirty || state.preview.revision !== state.revision ? ' · 有未保存或更新的代码' : ''}${activity}`
      : activity ? '正在启动预览…'
      : '尚未运行';
  }

  function report(cause: unknown): void {
    if (cause instanceof DOMException && cause.name === 'AbortError') return;
    const text = messageFor(cause);
    const targets = cause instanceof CompilationError ? cause.diagnostics : undefined;
    const last = logs.at(-1);
    if (last?.kind === 'problems' && last.text === text) {
      if (targets?.length && !last.targets?.length) {
        logs[logs.length - 1] = { ...last, targets };
        renderLogs();
        applyEditorDiagnostics(targets);
      }
      return;
    }
    log('problems', text, 'error', targets);
    if (targets?.length) applyEditorDiagnostics(targets);
  }
  function cancelCompilation(): void {
    savePreview.cancel();
  }
  function log(
    kind: 'problems' | 'output' | 'console',
    text: string,
    level?: string,
    targets?: readonly WorkbenchDiagnostic[]
  ): void {
    if (disposed) return;
    logs.push({ kind, text: text.slice(0, 20_000), level, targets });
    if (logs.length > 400) logs.shift();
    renderLogs();
  }
  function renderLogs(): void {
    const emptyHints: Readonly<Record<'problems' | 'output' | 'console', string>> = {
      problems: '尚无问题',
      output: '尚无输出',
      console: '尚无控制台输出'
    };
    for (const kind of ['problems', 'output', 'console'] as const) {
      const content = logContents.get(kind)!;
      content.replaceChildren();
      const entries = logs.filter(item => item.kind === kind);
      if (!entries.length) {
        const empty = document.createElement('p');
        empty.className = 'wb-log-empty';
        empty.textContent = emptyHints[kind];
        content.append(empty);
      }
      for (const item of entries) {
        if (item.targets?.length) {
          for (const target of item.targets) {
            const row = document.createElement('button');
            row.type = 'button';
            row.className = 'wb-log-problem';
            const location =
              target.file ?
                `${target.file}${target.line === undefined ? '' : `:${target.line}${target.column === undefined ? '' : `:${target.column}`}`}`
              : '';
            row.textContent = location ? `${location} — ${target.message}` : target.message;
            row.title = '点击打开文件并跳转到该行';
            row.onclick = () => openDiagnostic(target);
            content.append(row);
          }
          continue;
        }
        const line = document.createElement('pre');
        line.textContent = item.text;
        if (item.level) line.className = `wb-log-${item.level}`;
        content.append(line);
      }
    }
    element('[data-slot="problem-count"]').textContent = String(logs.filter(item => item.kind === 'problems').length);
  }
  /** 编译失败后把诊断落到对应编辑器（未打开的文件在打开时补挂），成功预览后整体清除。 */
  function applyEditorDiagnostics(targets: readonly WorkbenchDiagnostic[]): void {
    editorDiagnostics.clear();
    for (const target of targets) {
      if (!target.file || target.line === undefined) continue;
      const list = editorDiagnostics.get(target.file) ?? [];
      list.push({ line: target.line, column: target.column, message: target.message });
      editorDiagnostics.set(target.file, list);
    }
    for (const [path, editor] of editors) editor.handle.setDiagnostics?.(editorDiagnostics.get(path) ?? []);
  }
  function clearEditorDiagnostics(): void {
    editorDiagnostics.clear();
    for (const editor of editors.values()) editor.handle.setDiagnostics?.([]);
  }
  function openDiagnostic(target: WorkbenchDiagnostic): void {
    if (!target.file || !Object.hasOwn(session.state.files, target.file)) {
      log('output', target.file ? `问题指向的文件不在项目中：${target.file}` : '该问题没有可定位的文件');
      return;
    }
    session.select(target.file);
    docking.selectEditor(target.file);
    if (target.line !== undefined) editorCommand('gotoLineAt', target.line);
    closeNarrowSidebar();
    focusEditor(target.file);
  }
  function action(operation: () => Promise<unknown> | void): void {
    pendingOperations++;
    renderActionState();
    void Promise.resolve()
      .then(operation)
      .catch(report)
      .finally(() => {
        pendingOperations--;
        if (!disposed) renderActionState();
      });
  }
  function projectId(): string {
    if (!project) throw new Error('请先新建或打开项目');
    return project.id;
  }
  /** 标签、活动文件或提交说明变化时串行落库，重开项目时恢复；初始恢复期间不写库。 */
  function captureProjectState(): WorkbenchProjectState {
    const { tabs, activePath, previewTabs, projectId: id } = session.state;
    const drafts = session.getDrafts();
    const commitMessage = id ? savedCommitMessages.get(id) : undefined;
    return {
      tabs: [...tabs],
      activePath,
      ...(commitMessage ? { commitMessage } : {}),
      ...(previewTabs.length ? { previewTabs: [...previewTabs] } : {}),
      ...(Object.keys(drafts).length ? { drafts } : {})
    };
  }

  function persistState(): void {
    const id = session.state.projectId;
    if (!id || restoring || unrestoredProject === id) return;
    const state = captureProjectState();
    const snapshot = JSON.stringify([id, state]);
    if (snapshot === persistedState) return;
    persistedState = snapshot;
    const acknowledge = stageRecovery(() => recovery.stageProject(id, state));
    persistChain = persistChain
      .then(async () => {
        await catalog.putState(id, state);
        acknowledge?.();
      })
      .catch((cause: unknown) => {
        if (persistedState === snapshot) persistedState = '';
        report(cause);
      });
  }

  function stageRecovery(stage: () => () => void): (() => void) | undefined {
    try {
      return stage();
    } catch (cause: unknown) {
      report(new Error(`刷新恢复日志写入失败：${messageFor(cause)}`, { cause }));
      return undefined;
    }
  }

  function persistPreferences(): void {
    if (!preferencesRestored) return;
    const preferences = { indentUnit, alwaysShowScmActions, runtime: preferredRuntime, editorEngine };
    const acknowledge = stageRecovery(() => recovery.stagePreferences(preferences));
    persistChain = persistChain
      .then(async () => {
        await catalog.putPreferences(preferences);
        acknowledge?.();
      })
      .catch(report);
  }
  async function refreshGit(): Promise<void> {
    if (!project || disposed) return;
    const id = project.id;
    const request = ++gitRefresh;
    const [status, commits] = await Promise.all([backend.status(id), backend.history(id)]);
    if (disposed || project?.id !== id || request !== gitRefresh) return;
    element('[data-slot="branch-name"]').textContent = status.branch;
    gitStatus = status;
    scm.update(status);
    renderActionState();
    renderFiles(session.state);
    const badge = element('[data-slot="scm-count"]');
    badge.textContent = String(status.entries.length);
    badge.hidden = status.entries.length === 0;
    await Promise.all([...diffs.keys()].map(loadDiff));
    if (disposed || project?.id !== id || request !== gitRefresh) return;
    const history = element('[data-slot="history"]');
    history.replaceChildren();
    for (const commit of commits) {
      const button = document.createElement('button');
      button.textContent = `${commit.oid.slice(0, 7)} ${commit.message}`;
      button.title = '将此提交恢复成工作区差异，保留 HEAD 与暂存区';
      button.dataset['mutation'] = 'true';
      button.onclick = () =>
        action(async () => {
          const confirmation = await confirmWorkbenchAction(
            root,
            '还原提交到工作区',
            '将所选提交恢复为未提交差异，保留 HEAD 和暂存区。',
            '还原文件'
          );
          if (!confirmation) return;
          cancelCompilation();
          await session.restore(commit.oid);
          await refreshGit();
          log('output', `恢复 ${commit.oid.slice(0, 7)}，HEAD 与 index 保持不变`);
        });
      history.append(button);
    }
  }
  function renderProjects(): void {
    projects = projects.toSorted((left, right) => right.updatedAt - left.updatedAt);
    const workspace = element<HTMLButtonElement>('[data-action="workspace"]');
    element('[data-slot="workspace-label"]').textContent = project?.name ?? '工作区';
    workspace.dataset['projectId'] = project?.id ?? '';
  }
  async function openProject(id: string): Promise<void> {
    if (id === session.state.projectId) return;
    const next = projects.find(item => item.id === id);
    if (!next) throw new Error('项目不在目录中');
    if (session.state.dirty) {
      const choice = await requestWorkbenchChoice(
        root,
        '切换项目',
        '当前项目存在未保存的更改。',
        '保存并切换',
        '放弃更改'
      );
      if (disposed) return;
      if (choice === null) return;
      if (choice === 'primary') await savePreview.save();
      else session.discard();
      if (session.state.dirty) throw new Error('保存期间内容发生变化，请重新切换项目');
    }
    await terminal?.stop();
    cancelCompilation();
    await persistChain;
    restoring = true;
    unrestoredProject = id;
    try {
      await session.open(id);
      if (disposed || session.state.projectId !== id) return;
      const recovered = recovery.getProject(id);
      const [durable, layout] = await Promise.all([
        catalog.getState(id),
        catalog.getLayout(id).catch((cause: unknown) => {
          report(cause);
          return null;
        })
      ]);
      if (disposed || session.state.projectId !== id) return;
      const saved = recovered ?? durable;
      savedCommitMessages.set(id, saved?.commitMessage ?? '');
      if (saved) {
        const conflicts = session.restoreDrafts(saved.drafts ?? {});
        if (conflicts.length) log('output', `已恢复草稿，以下文件的已保存版本已变化：${conflicts.join('、')}`);
        session.restoreTabs(saved.tabs, saved.activePath, saved.previewTabs);
        if (saved.commitMessage) scm.restoreMessage(saved.commitMessage);
      }
      // 标签先恢复，布局再排布它们
      if (layout !== null) applySavedLayout(layout);
      else ensureSavePreview();
      unrestoredProject = null;
      persistedState = saved && !recovered ? JSON.stringify([id, saved]) : '';
    } finally {
      restoring = false;
    }
    if (session.state.activePath) navigation.record(id, session.state.activePath);
    renderActionState();
    persistState();
    savedLayout = JSON.stringify(docking.serializeLayout());
    const opened = { ...next, updatedAt: Date.now() };
    project = opened;
    projects = [opened, ...projects.filter(item => item.id !== id)];
    renderProjects();
    focusEditor(session.state.activePath);
    void savePreview.runSaved().catch(report);
    await catalog.put(opened).catch(report);
    void refreshGit().catch(report);
    log('output', `已打开 ${next.name}`);
  }
  const treeRow = (path: string | null): HTMLElement | undefined =>
    path === null ? undefined : (
      [...tree.querySelectorAll<HTMLElement>('button[data-tree-path],button[data-tree-section]')].find(
        row => (row.dataset['treePath'] ?? row.dataset['treeSection']) === path
      )
    );

  /** 无项目打开时资源管理器显示 vscode.dev 风格的「无打开的文件夹」区块：打开文件夹 / 最近项目 / 初始化 Demo。 */
  function renderWelcomeView(): void {
    const welcome = document.createElement('div');
    welcome.className = 'wb-empty-view';
    welcome.setAttribute('role', 'region');
    welcome.setAttribute('aria-label', '欢迎使用');
    const hint = document.createElement('p');
    hint.className = 'wb-empty-view-hint';
    hint.textContent = '尚未打开文件夹。';
    welcome.append(hint);
    const openFolderButton = document.createElement('button');
    openFolderButton.type = 'button';
    openFolderButton.className = 'wb-empty-view-action';
    openFolderButton.dataset['welcomeAction'] = 'open-folder';
    openFolderButton.append(document.createTextNode('导入文件夹（副本）'));
    openFolderButton.onclick = () => action(openFolder);
    welcome.append(openFolderButton);
    const storageHint = document.createElement('p');
    storageHint.className = 'wb-empty-view-storage';
    storageHint.textContent = '导入副本保存在此浏览器，编辑与保存不会修改原文件夹。';
    welcome.append(storageHint);
    const recent = projects.slice(0, 10);
    if (recent.length) {
      const section = document.createElement('section');
      section.className = 'wb-empty-view-recent';
      section.setAttribute('aria-label', '最近打开的项目');
      const header = document.createElement('div');
      header.className = 'wb-empty-view-recent-header';
      header.textContent = '最近';
      section.append(header);
      for (const item of recent) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'wb-empty-view-recent-item';
        row.dataset['welcomeRecent'] = item.id;
        row.title = `打开 ${item.name}`;
        row.append(createCodicon('folder'), document.createTextNode(item.name));
        row.onclick = () => action(() => openProject(item.id));
        section.append(row);
      }
      welcome.append(section);
    }
    const demoButton = document.createElement('button');
    demoButton.type = 'button';
    demoButton.className = 'wb-empty-view-action';
    demoButton.dataset['welcomeAction'] = 'init-demo';
    demoButton.append(document.createTextNode('初始化 Demo 项目'));
    demoButton.onclick = () => showDemoMenu(demoButton);
    welcome.append(demoButton);
    if (options.githubApi) {
      const githubButton = document.createElement('button');
      githubButton.type = 'button';
      githubButton.className = 'wb-empty-view-action';
      githubButton.dataset['welcomeAction'] = 'open-github';
      githubButton.append(document.createTextNode('从 GitHub 打开仓库'));
      githubButton.onclick = () => action(openGitHubRepository);
      welcome.append(githubButton);
    }
    if (options.githubAuth) {
      const loginButton = document.createElement('button');
      loginButton.type = 'button';
      loginButton.className = 'wb-empty-view-action';
      loginButton.dataset['welcomeAction'] = 'github-login';
      loginButton.append(document.createTextNode('登录 GitHub'));
      loginButton.onclick = () => void requestGitHubLogin(root, { auth: options.githubAuth! });
      welcome.append(loginButton);
    }
    const pane = explorerPane('no-folder', '无打开的文件夹');
    if (!collapsedSections.has('no-folder')) pane.append(welcome);
    tree.append(pane);
  }

  /** 初始化 Demo 的模板选择菜单，条目与首次引导提供的三个最小 Demo 一致。 */
  function showDemoMenu(anchor: HTMLElement): void {
    const rectangle = anchor.getBoundingClientRect();
    showContextMenu(
      { x: rectangle.left, y: rectangle.bottom },
      defaultDemos.map(demo => ({ label: demo.name, action: () => createDefaultDemo(demo) }))
    );
  }

  /** 创建或直接打开一个内置最小 Demo；目录已登记同 id 项目时不重复创建。 */
  async function createDefaultDemo(demo: (typeof defaultDemos)[number]): Promise<void> {
    if (projects.some(item => item.id === demo.id)) {
      await openProject(demo.id);
      return;
    }
    const info: WorkbenchProjectInfo = {
      id: demo.id,
      name: demo.name,
      template: demo.template.template,
      entry: demo.template.entry,
      updatedAt: Date.now()
    };
    await backend.create(demo.id, {
      ...demo.template.files,
      'workbench.project.json': JSON.stringify({ template: info.template, entry: info.entry }, null, 2)
    });
    if (disposed) return;
    await catalog.put(info);
    projects = [...projects, info];
    await openProject(demo.id);
    log('output', `已初始化 ${demo.name}`);
  }

  /** 打开本地文件夹：目录选择器读取后登记为受控模板项目并打开，取消选择静默。 */
  async function openFolder(): Promise<void> {
    const picker = window as unknown as {
      showDirectoryPicker?: (options?: { mode?: 'read' }) => Promise<FileSystemDirectoryHandle>;
    };
    if (typeof picker.showDirectoryPicker !== 'function')
      throw new Error('当前浏览器不支持打开文件夹（需要 File System Access API）');
    let handle: FileSystemDirectoryHandle;
    try {
      handle = await picker.showDirectoryPicker({ mode: 'read' });
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      throw cause;
    }
    const imported = await readFolderProject(handle);
    const info: WorkbenchProjectInfo = {
      id: crypto.randomUUID(),
      name: handle.name,
      template: imported.template,
      entry: imported.entry,
      updatedAt: Date.now()
    };
    await backend.create(info.id, imported.files);
    if (disposed) return;
    await catalog.put(info);
    projects = [...projects, info];
    await openProject(info.id);
  }

  /** 从 GitHub 搜索 / 粘贴 URL 打开仓库：登记远程目录条目后走与本地项目相同的打开流程。 */
  async function openGitHubRepository(): Promise<void> {
    if (!options.githubApi) throw new Error('GitHub 能力未启用');
    const target = await requestGitHubRepository(root, options.githubApi, {
      onLogin: options.githubAuth ? () => void requestGitHubLogin(root, { auth: options.githubAuth! }) : undefined
    });
    if (disposed || !target) return;
    const info = githubProjectInfo(target.owner, target.repo, target.branch);
    await catalog.put(info);
    projects = [...projects.filter(item => item.id !== info.id), info];
    await openProject(info.id);
    log('output', `已打开 ${info.name}`);
  }

  /** 应用拖放反馈：目标行整行高亮（VS Code 的 drop-target），根区落点冒泡到最后一行。 */
  function applyTreeDropFeedback(decision: TreeMoveDecision | null, feedbackKey: string | null = null): void {
    for (const row of tree.querySelectorAll('.wb-drop-into')) row.classList.remove('wb-drop-into');
    tree.classList.remove('wb-root-drop');
    pendingDrop = decision;
    dropFeedbackKey = feedbackKey;
    if (!decision || decision.kind !== 'move') return;
    if (feedbackKey) {
      treeRow(feedbackKey)?.classList.add('wb-drop-into');
      return;
    }
    const last = [...tree.querySelectorAll<HTMLButtonElement>('button[data-tree-path]')].at(-1);
    if (last) last.classList.add('wb-drop-into');
    else tree.classList.add('wb-root-drop');
  }

  /** 折叠文件夹悬停约 1 秒自动展开（VS Code 的 list.autoExpand）。 */
  function scheduleAutoExpand(decision: TreeMoveDecision, button: HTMLButtonElement, path: string): void {
    if (decision.kind !== 'move') return;
    const expandable = button.classList.contains('wb-folder') && collapsedFolders.has(path);
    if (!expandable || autoExpandTarget === path) return;
    autoExpandTarget = path;
    if (autoExpandTimer !== null) clearTimeout(autoExpandTimer);
    autoExpandTimer = setTimeout(() => {
      autoExpandTimer = null;
      autoExpandTarget = null;
      if (!dragPath || !collapsedFolders.has(path)) return;
      collapsedFolders.delete(path);
      renderFiles(session.state);
    }, 1000);
  }

  /** 清除拖放的全部状态与反馈；放下后必须立即复位，迟到的清理会抹掉下一次拖放。 */
  function resetTreeDrag(): void {
    if (autoExpandTimer !== null) {
      clearTimeout(autoExpandTimer);
      autoExpandTimer = null;
    }
    autoExpandTarget = null;
    dragPath = null;
    applyTreeDropFeedback(null);
    root.classList.remove('wb-dragging');
  }

  /** 执行一次放下的移动；状态复位发生在异步写入之前。 */
  function finishTreeDrop(): void {
    const from = dragPath;
    const decision = pendingDrop;
    resetTreeDrag();
    if (!from || !decision || decision.kind !== 'move') return;
    const destination = decision.destination;
    action(async () => {
      cancelCompilation();
      await session.move(from, destination);
      await refreshGit();
      if (disposed || !project || project.id !== session.state.projectId) return;
      treeFocusPath = destination;
      collapsedFolders.delete(treePathParent(destination));
      renderFiles(session.state);
      treeRow(destination)?.focus();
    });
  }

  /** 给树行挂上 HTML5 拖放：文件、文件夹与打开的编辑器行共用同一套判定。 */
  function attachDragRow(button: HTMLButtonElement, path: string): void {
    button.draggable = true;
    attachWorkbenchLongPress(button, {
      onLongPress: event =>
        button.dispatchEvent(
          new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            clientX: event.clientX,
            clientY: event.clientY
          })
        )
    });
    button.addEventListener('dragstart', event => {
      if (creatingFile || creatingFolder || renamingPath) {
        event.preventDefault();
        return;
      }
      const transfer = event.dataTransfer;
      if (!transfer) return;
      dragPath = path;
      transfer.effectAllowed = 'move';
      transfer.setData('text/plain', path);
      root.classList.add('wb-dragging');
      treeFocusPath = path;
      syncTreeTabIndexes();
      event.stopPropagation();
    });
    button.addEventListener('dragover', event => {
      if (!dragPath) return;
      event.preventDefault();
      event.stopPropagation();
      const transfer = event.dataTransfer;
      const decision = resolveTreeMove(Object.keys(session.state.files), dragPath, path);
      if (transfer) transfer.dropEffect = decision.kind === 'move' ? 'move' : 'none';
      applyTreeDropFeedback(decision, button.dataset['treePath'] ?? path);
      scheduleAutoExpand(decision, button, path);
    });
    button.addEventListener('dragleave', event => {
      const related = event.relatedTarget;
      if (related instanceof Node && button.contains(related)) return;
      applyTreeDropFeedback(null);
    });
    button.addEventListener('drop', event => {
      event.preventDefault();
      event.stopPropagation();
      finishTreeDrop();
    });
    button.addEventListener('dragend', resetTreeDrag);
  }

  function syncTreeTabIndexes(): void {
    const rows = [...tree.querySelectorAll<HTMLButtonElement>('button[data-tree-path],button[data-tree-section]')];
    const focused = rows.find(row => (row.dataset['treePath'] ?? row.dataset['treeSection']) === treeFocusPath);
    rows.forEach(row => (row.tabIndex = row === focused ? 0 : -1));
    if (!focused) rows[0]?.setAttribute('tabindex', '0');
  }

  function toggleSection(key: string): void {
    treeFocusPath = key;
    if (collapsedSections.has(key)) collapsedSections.delete(key);
    else collapsedSections.add(key);
    renderFiles(session.state);
    treeRow(key)?.focus();
  }

  /** 资源管理器当前可见的行（折叠状态与紧凑文件夹已应用）：渲染、键盘导航与新建落点共用。 */
  function visibleRows(): ExplorerRow[] {
    return buildExplorerRows(Object.keys(session.state.files), { collapsed: collapsedFolders, compact: true });
  }

  /** 区块头：可折叠，悬停 / 聚焦该区块时显示区块级动作。 */
  function explorerPane(key: string, label: string, actions: HTMLButtonElement[] = []): HTMLElement {
    return createExplorerPane(key, label, collapsedSections.has(key), actions, () => toggleSection(key)).pane;
  }

  /** 打开的编辑器行：与资源管理器行同样的图标与选中语义，关闭按钮在行首。 */
  function openEditorRow(path: string): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'wb-editor-row';
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'wb-editor-open';
    open.dataset['treePath'] = `editor:${path}`;
    open.setAttribute('role', 'treeitem');
    open.setAttribute('aria-level', '2');
    open.title = path;
    const name = document.createElement('span');
    name.className = 'wb-editor-name';
    name.textContent = path.split('/').at(-1) ?? path;
    open.append(createFileIcon(path), name);
    open.onclick = () => {
      treeFocusPath = `editor:${path}`;
      treeNavigation = true;
      try {
        session.select(path);
        docking.selectEditor(path);
        closeNarrowSidebar();
      } finally {
        queueMicrotask(() => {
          treeNavigation = false;
        });
      }
    };
    open.addEventListener('auxclick', event => {
      if (event.button !== 1) return;
      event.preventDefault();
      closeEditorTab(path);
    });
    attachDragRow(open, path);
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'wb-editor-row-close';
    close.setAttribute('aria-label', `关闭编辑器 ${path}`);
    close.title = `关闭编辑器 ${path}`;
    close.append(createCodicon('close'));
    close.onclick = event => {
      event.stopPropagation();
      closeEditorTab(path);
    };
    wrap.append(open, close);
    return wrap;
  }

  function previewFile(path: string): void {
    const groupPaths = docking.getEditorGroupPaths();
    const replacePreview = session.state.previewTabs.find(preview => groupPaths.includes(preview));
    docking.ensureEditor(path);
    session.select(path, { preview: true, replacePreview });
    docking.selectEditor(path);
  }

  /** 文件夹 / 文件行及其交互：文件夹点击折叠展开，文件点击打开（预览，不抢走树内焦点）。 */
  function explorerRowElement(row: ExplorerRow, context: ExplorerRowContext): HTMLButtonElement {
    const button = createExplorerRow(row, context);
    attachDragRow(button, row.key);
    button.onclick = () => {
      treeFocusPath = row.key;
      if (row.kind === 'folder') {
        if (collapsedFolders.has(row.key)) collapsedFolders.delete(row.key);
        else collapsedFolders.add(row.key);
        renderFiles(session.state);
        treeRow(row.key)?.focus();
        return;
      }
      treeNavigation = true;
      try {
        previewFile(row.key);
        closeNarrowSidebar();
      } finally {
        queueMicrotask(() => {
          treeNavigation = false;
        });
      }
    };
    if (row.kind === 'file')
      button.ondblclick = () => {
        session.select(row.key);
        focusEditor(row.key);
      };
    return button;
  }

  /** 新建文件 / 文件夹的树内输入行，落在选中目录里；名称可含 / 一次建立多级目录。 */
  function newEntryRow(level: number, kind: 'file' | 'folder'): HTMLElement {
    const files = Object.keys(session.state.files);
    const parent = creatingParent;
    const finish = (): void => {
      creatingFile = false;
      creatingFolder = false;
    };
    return createExplorerInputRow({
      level,
      kind,
      initial: '',
      label: kind === 'file' ? '新建文件' : '新建文件夹',
      validate: value => explorerNameError(files, parent, value),
      onCommit: value => {
        finish();
        const name = value.replace(/\/+$/, '');
        if (name) {
          const path = parent ? `${parent}/${name}` : name;
          action(async () => {
            projectId();
            if (kind === 'file') {
              session.edit(path, '');
              session.select(path);
              return;
            }
            session.edit(`${path}/.gitkeep`, '');
            treeFocusPath = path;
            collapsedFolders.delete(path);
          });
        }
        renderFiles(session.state);
      },
      onCancel: () => {
        finish();
        renderFiles(session.state);
      }
    });
  }

  /** 重命名的树内输入行：文件走 rename，文件夹整体前缀走 move；紧凑链只改最深一段。 */
  function renameRow(row: ExplorerRow): HTMLElement {
    const from = row.key;
    const directory = treePathParent(from);
    const files = Object.keys(session.state.files);
    return createExplorerInputRow({
      level: row.level,
      kind: row.kind,
      initial: treePathBase(from),
      label: row.kind === 'file' ? '重命名文件' : '重命名文件夹',
      icon: row.kind === 'file' ? createFileIcon(from) : undefined,
      validate: value => explorerNameError(files, directory, value, from),
      onCommit: value => {
        renamingPath = null;
        const to = value ? `${directory ? `${directory}/` : ''}${value}` : '';
        if (to && to !== from) {
          action(async () => {
            cancelCompilation();
            if (row.kind === 'file') await session.rename(from, to);
            else await session.move(from, to);
            treeFocusPath = to;
            await refreshGit();
          });
        }
        renderFiles(session.state);
      },
      onCancel: () => {
        renamingPath = null;
        renderFiles(session.state);
      }
    });
  }

  function renderFiles(state: WorkbenchState): void {
    if (treeProjectId !== state.projectId) {
      treeProjectId = state.projectId;
      creatingFile = false;
      creatingFolder = false;
      renamingPath = null;
      gitStatus = null;
    }
    if ((creatingFile || creatingFolder || renamingPath) && tree.querySelector('.wb-inline-input')) return;
    if (!state.projectId) {
      tree.replaceChildren();
      if (!initializing) renderWelcomeView();
      return;
    }
    tree.replaceChildren();
    if (state.activePath !== activeTreePath) {
      activeTreePath = state.activePath;
      const parts = state.activePath?.split('/') ?? [];
      parts.slice(0, -1).forEach((_, index) => collapsedFolders.delete(parts.slice(0, index + 1).join('/')));
    }
    if (showOpenEditors && state.tabs.length) {
      const pane = explorerPane('open-editors', '打开的编辑器', [
        createExplorerAction('close-all-editors', '关闭全部编辑器', 'close-all')
      ]);
      if (!collapsedSections.has('open-editors')) pane.append(...state.tabs.map(openEditorRow));
      tree.append(pane);
    }
    if (creatingFile || creatingFolder) collapsedSections.delete('workspace');
    const projectName = projects.find(item => item.id === state.projectId)?.name ?? '项目';
    const pane = explorerPane('workspace', projectName, [
      createExplorerAction('new-file', '新建文件...', 'new-file'),
      createExplorerAction('new-folder', '新建文件夹...', 'new-folder'),
      createExplorerAction('refresh-tree', '刷新资源管理器', 'refresh'),
      createExplorerAction('collapse-tree', '在资源管理器中折叠文件夹', 'collapse-all')
    ]);
    tree.append(pane);
    if (collapsedSections.has('workspace')) {
      if (dragPath) applyTreeDropFeedback(pendingDrop, dropFeedbackKey);
      syncTreeTabIndexes();
      return;
    }
    const rows = visibleRows();
    const selected = treeFocusPath && rows.some(row => row.key === treeFocusPath) ? treeFocusPath : state.activePath;
    const context: ExplorerRowContext = {
      selectedPath: selected,
      decorations: explorerDecorations(gitStatus?.entries ?? []),
      activeGuide: explorerActiveAncestor(rows, selected)
    };
    const creating =
      creatingFile ? 'file'
      : creatingFolder ? 'folder'
      : null;
    const insertion = creating ? explorerInsertion(rows, creatingParent, creating) : null;
    for (const [index, row] of rows.entries()) {
      if (creating && insertion?.index === index) pane.append(newEntryRow(insertion.level, creating));
      pane.append(row.key === renamingPath ? renameRow(row) : explorerRowElement(row, context));
    }
    if (creating && insertion && insertion.index >= rows.length) pane.append(newEntryRow(insertion.level, creating));
    if (dragPath) applyTreeDropFeedback(pendingDrop, dropFeedbackKey);
    syncTreeTabIndexes();
  }

  /** 移动树焦点并按 VS Code 语义打开文件；选择只预览，不抢走树内焦点。 */
  function setTreeFocus(path: string | null, openFile: boolean): void {
    treeFocusPath = path;
    if (openFile && path) {
      treeNavigation = true;
      try {
        previewFile(path);
      } finally {
        queueMicrotask(() => {
          treeNavigation = false;
        });
      }
    }
    renderFiles(session.state);
    treeRow(path)?.focus();
  }

  /** 开始新建：输入行落在选中的文件夹里（选中文件则落在其父目录，无选中落在根），并展开该目录。 */
  function beginCreate(kind: 'file' | 'folder'): void {
    projectId();
    if (creatingFile || creatingFolder || renamingPath) return;
    creatingParent = explorerCreationParent(visibleRows(), treeFocusPath);
    collapsedFolders.delete(creatingParent);
    if (kind === 'file') creatingFile = true;
    else creatingFolder = true;
    renderFiles(session.state);
  }

  /** 侧栏按钮与 F2 作用的对象：树中的文件选中项，没有则回落活动文件。 */
  function treeTargetPath(): string | null {
    if (treeFocusPath && Object.hasOwn(session.state.files, treeFocusPath)) return treeFocusPath;
    return null;
  }

  /** 重命名可作用于树选中的文件或文件夹（紧凑链取最深目录）。 */
  function renameTargetPath(): string | null {
    const path = treeFocusPath;
    if (!path || path.startsWith('editor:')) return null;
    return visibleRows().some(row => row.key === path) ? path : null;
  }

  function startRename(path: string): void {
    if (creatingFile || creatingFolder || renamingPath) return;
    renamingPath = path;
    const parts = path.split('/');
    parts.slice(0, -1).forEach((_, index) => collapsedFolders.delete(parts.slice(0, index + 1).join('/')));
    renderFiles(session.state);
  }

  async function deletePath(path: string): Promise<void> {
    const confirmation = await confirmWorkbenchAction(
      root,
      '永久删除',
      `是否确定要永久删除“${treePathBase(path)}”？此操作不可逆！`,
      '永久删除'
    );
    if (confirmation) {
      cancelCompilation();
      await session.remove(path);
      await refreshGit();
    }
  }

  /** 写入系统剪贴板；浏览器拒绝（非安全上下文或无权限）时把原因交给统一错误通道。 */
  async function copyText(text: string): Promise<void> {
    await navigator.clipboard.writeText(text);
  }

  function closeContextMenu(): void {
    contextMenu?.remove();
    contextMenu = null;
  }

  function showContextMenu(
    position: { x: number; y: number },
    entries: readonly MenuEntry[],
    anchor?: HTMLElement
  ): void {
    closeContextMenu();
    // 编辑器标签菜单由 Dockview 管理，弹出前清掉避免叠层
    for (const menu of root.querySelectorAll('.wb-context-menu')) menu.remove();
    const menu = document.createElement('div');
    menu.className = 'wb-context-menu';
    menu.setAttribute('role', 'menu');
    for (const entry of entries) {
      if ('separator' in entry) {
        const separator = document.createElement('div');
        separator.className = 'wb-context-menu-sep';
        separator.setAttribute('role', 'separator');
        menu.append(separator);
        continue;
      }
      const item = document.createElement('button');
      item.type = 'button';
      item.setAttribute('role', entry.checked === undefined ? 'menuitem' : 'menuitemcheckbox');
      if (entry.checked !== undefined) item.setAttribute('aria-checked', String(entry.checked));
      if (entry.checked) {
        const check = createCodicon('check');
        check.classList.add('wb-menu-check');
        item.append(check);
      }
      const label = document.createElement('span');
      label.className = 'wb-menu-label';
      label.textContent = entry.label;
      item.append(label);
      if (entry.keybinding) {
        const keybinding = document.createElement('span');
        keybinding.className = 'wb-menu-keybinding';
        keybinding.textContent = entry.keybinding;
        item.append(keybinding);
      }
      if (entry.id) item.dataset['menuId'] = entry.id;
      item.disabled = entry.disabled ?? false;
      item.onclick = () => {
        closeContextMenu();
        action(entry.action);
      };
      menu.append(item);
    }
    menu.onkeydown = event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeContextMenu();
      }
    };
    root.append(menu);
    menu.style.left = `${position.x}px`;
    menu.style.top = `${position.y}px`;
    const bounds = menu.getBoundingClientRect();
    const viewport = root.ownerDocument.defaultView;
    if (anchor) {
      const rectangle = anchor.getBoundingClientRect();
      menu.style.top = `${Math.max(0, rectangle.top - bounds.height - 2)}px`;
    }
    if (viewport && bounds.right > viewport.innerWidth)
      menu.style.left = `${Math.max(0, viewport.innerWidth - bounds.width - 4)}px`;
    if (viewport && bounds.bottom > viewport.innerHeight)
      menu.style.top = `${Math.max(0, viewport.innerHeight - bounds.height - 4)}px`;
    contextMenu = menu;
  }

  /** 状态栏缩进选择器：应用到全部打开的编辑器（VS Code 的设置级行为）。 */
  function applyIndentUnit(unit: string, persist = true): void {
    indentUnit = unit;
    element('[data-slot="indent"]').textContent = `空格: ${unit.length}`;
    for (const editor of editors.values()) editor.handle.setIndentUnit?.(unit);
    if (persist) persistPreferences();
  }

  tree.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.isComposing) return;
    if (event.target instanceof Element && event.target.closest('input,textarea,select')) return;
    if (creatingFile || creatingFolder || renamingPath) return;
    const rows = [...tree.querySelectorAll<HTMLElement>('button[data-tree-path],button[data-tree-section]')];
    if (!rows.length) return;
    const rowKey = (element: HTMLElement): string | undefined =>
      element.dataset['treePath'] ?? element.dataset['treeSection'];
    const isFileRow = (element: HTMLElement): boolean =>
      element.classList.contains('wb-file') && !element.classList.contains('wb-folder');
    const current = rows.findIndex(item => rowKey(item) === treeFocusPath);
    const row = current === -1 ? undefined : rows[current];
    const path = row ? rowKey(row) : undefined;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const next = rows[Math.min(rows.length - 1, Math.max(0, current === -1 ? 0 : current + step))];
      setTreeFocus(rowKey(next) ?? null, isFileRow(next));
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const next = rows[event.key === 'Home' ? 0 : rows.length - 1];
      setTreeFocus(rowKey(next) ?? null, isFileRow(next));
      return;
    }
    if (event.key === 'Enter' && row) {
      event.preventDefault();
      if (row.classList.contains('wb-tree-section')) {
        if (path) toggleSection(path);
        return;
      }
      if (row.classList.contains('wb-folder') && path) {
        if (collapsedFolders.has(path)) collapsedFolders.delete(path);
        else collapsedFolders.add(path);
        treeFocusPath = path;
        renderFiles(session.state);
        treeRow(path)?.focus();
        return;
      }
      if (row.classList.contains('wb-file') && path) {
        setTreeFocus(path, true);
        focusEditor(path);
      }
      return;
    }
    if (event.key === 'ArrowRight' && row && path) {
      event.preventDefault();
      if (row.classList.contains('wb-tree-section')) {
        if (collapsedSections.has(path)) toggleSection(path);
        else setTreeFocus(rowKey(rows[Math.min(rows.length - 1, current + 1)]) ?? null, false);
        return;
      }
      if (row.classList.contains('wb-folder')) {
        if (collapsedFolders.has(path)) {
          collapsedFolders.delete(path);
          treeFocusPath = path;
          renderFiles(session.state);
          treeRow(path)?.focus();
        } else {
          setTreeFocus(rowKey(rows[Math.min(rows.length - 1, current + 1)]) ?? null, true);
        }
      }
      return;
    }
    if (event.key === 'ArrowLeft' && row && path) {
      event.preventDefault();
      if (row.classList.contains('wb-tree-section')) {
        if (!collapsedSections.has(path)) toggleSection(path);
        return;
      }
      if (row.classList.contains('wb-folder') && !collapsedFolders.has(path)) {
        collapsedFolders.add(path);
        treeFocusPath = path;
        renderFiles(session.state);
        treeRow(path)?.focus();
      } else if (row.dataset['treeParent']) {
        setTreeFocus(row.dataset['treeParent'], false);
      }
      return;
    }
    if (event.key === 'Delete' && row && isFileRow(row) && path) {
      event.preventDefault();
      action(() => deletePath(path));
    }
  });
  // 树空白区（行外的空隙）是根目录落点：反馈冒泡到最后一行，树为空时整树高亮。
  tree.addEventListener('dragover', event => {
    if (!dragPath) return;
    event.preventDefault();
    const transfer = event.dataTransfer;
    const decision = resolveTreeMove(Object.keys(session.state.files), dragPath, null);
    if (transfer) transfer.dropEffect = decision.kind === 'move' ? 'move' : 'none';
    applyTreeDropFeedback(decision);
  });
  tree.addEventListener('dragleave', event => {
    const related = event.relatedTarget;
    if (related instanceof Node && tree.contains(related)) return;
    applyTreeDropFeedback(null);
  });
  tree.addEventListener('drop', event => {
    event.preventDefault();
    finishTreeDrop();
  });
  /** 资源管理器右键菜单：条目与顺序对齐 vscode.dev，浏览器里不存在的动作不列。 */
  function explorerMenuEntries(targetPath: string | null, folder: boolean): MenuEntry[] {
    const create: MenuEntry[] = [
      { label: '新建文件...', id: 'new-file', action: operations['new-file'] },
      { label: '新建文件夹...', id: 'new-folder', action: operations['new-folder'] }
    ];
    if (!targetPath) return create;
    const projectName = projects.find(item => item.id === session.state.projectId)?.name ?? '';
    const copy: MenuEntry[] = [
      { label: '复制路径', id: 'copy-path', action: () => copyText(`/${projectName}/${targetPath}`) },
      { label: '复制相对路径', id: 'copy-relative-path', action: () => copyText(targetPath) }
    ];
    const modify: MenuEntry[] = [
      { label: '重命名...', id: 'rename', keybinding: 'F2', action: () => startRename(targetPath) }
    ];
    if (!folder)
      modify.push({ label: '删除', id: 'delete', keybinding: 'Delete', action: () => deletePath(targetPath) });
    return [...(folder ? [...create, SEPARATOR] : []), ...copy, SEPARATOR, ...modify];
  }

  tree.addEventListener('contextmenu', event => {
    if (creatingFile || creatingFolder || renamingPath) return;
    if (!session.state.projectId) return;
    event.preventDefault();
    const row =
      event.target instanceof Element ?
        event.target.closest<HTMLElement>('button[data-tree-path]:not(.wb-editor-open)')
      : null;
    const targetPath = row?.dataset['treePath'] ?? null;
    if (targetPath) {
      treeFocusPath = targetPath;
      renderFiles(session.state);
      treeRow(targetPath)?.focus();
    }
    showContextMenu(
      { x: event.clientX, y: event.clientY },
      explorerMenuEntries(targetPath, !row || row.classList.contains('wb-folder'))
    );
  });
  root.addEventListener('mousedown', event => {
    if (contextMenu && !(event.target instanceof Node && contextMenu.contains(event.target))) closeContextMenu();
  });
  root.addEventListener('contextmenu', event => {
    const editorHost = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-editor-path]') : null;
    if (!editorHost) return;
    event.preventDefault();
    showContextMenu({ x: event.clientX, y: event.clientY }, [
      { label: '格式化文档', action: () => void formatSource().catch(report) },
      { label: '转到行', action: () => editorCommand('gotoLine') },
      { label: '命令面板', action: () => commands.showCommandPalette() }
    ]);
  });
  function renderEditors(state: WorkbenchState): void {
    if (state.projectId !== renderedProjectId) {
      for (const [id, diff] of diffs) {
        diff.view?.dispose();
        docking.removeAuxiliary(id);
      }
      diffs.clear();
      editors.forEach(editor => editor.handle.dispose());
      editors.clear();
      for (const panel of [...docking.api.panels]) {
        if (panel.id.startsWith('editor:')) docking.removeEditor(panel.id.slice('editor:'.length));
      }
      renderedProjectId = state.projectId;
      selectedEditorPath = null;
    }
    for (const [path, editor] of editors) {
      if (state.tabs.includes(path) && typeof state.files[path] === 'string') continue;
      editor.handle.dispose();
      editors.delete(path);
    }
    for (const panel of [...docking.api.panels]) {
      if (!panel.id.startsWith('editor:')) continue;
      const path = panel.id.slice('editor:'.length);
      if (!state.tabs.includes(path)) docking.removeEditor(path);
    }
    for (const path of state.tabs) {
      const parent = docking.ensureEditor(path);
      const value = state.files[path];
      const base = path.split('/').at(-1) ?? path;
      const duplicate = state.tabs.some(other => other !== path && (other.split('/').at(-1) ?? other) === base);
      const directory = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
      const label = duplicate && directory ? `${directory}/${base}` : base;
      docking.setEditorTitle(path, `${label}${session.isModified(path) ? ' •' : ''}`);
      docking.setEditorPreview(path, state.previewTabs.includes(path));
      if (typeof value !== 'string') {
        parent.textContent = `二进制文件 · ${value?.byteLength ?? 0} bytes`;
        parent.classList.add('wb-binary');
        continue;
      }
      parent.classList.remove('wb-binary');
      let editor = editors.get(path);
      if (!editor) {
        parent.replaceChildren();
        const handle = mountEditor(parent, {
          value,
          language: languageFor(path),
          engine: editorEngine,
          indentUnit,
          onChange: content => session.edit(path, content),
          onCursor: (line, column) => {
            element('[data-slot="cursor"]').textContent = `行 ${line}，列 ${column}`;
          }
        });
        editor = { host: parent, handle };
        editors.set(path, editor);
        handle.setDiagnostics?.(editorDiagnostics.get(path) ?? []);
        queueMicrotask(() => {
          if (!disposed) handle.layout?.();
        });
      }
      editor.handle.update(value, languageFor(path));
    }
    if (state.activePath !== selectedEditorPath) {
      selectedEditorPath = state.activePath;
      if (state.activePath) docking.selectEditor(state.activePath);
    }
  }
  function previewEvent(event: PreviewEvent): void {
    if (event.type === 'console') log('console', event.values.join(' '), event.level);
    if (event.type === 'error') log('problems', `${event.message}\n${event.stack}`, 'error');
    if (event.type === 'ready') log('output', `运行 revision ${event.revision} 已就绪`);
    if (event.type === 'keydown') {
      commands.dispatchShortcut({
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey
      });
    }
  }
  function render(state: WorkbenchState): void {
    if (state.projectId) {
      navigation.reconcile(state.projectId, Object.keys(state.files));
      if (!restoring && state.activePath) navigation.record(state.projectId, state.activePath);
    } else navigation.reset();
    // 切换项目时编辑器即将换掉，先把原项目待写的布局落库
    if (state.projectId !== renderedProjectId) {
      flushLayout();
      savedLayout = '';
    }
    renderFiles(state);
    renderEditors(state);
    renderStatus();
    search.refresh(state.files);
    element('[data-slot="language"]').textContent = state.activePath ? languageLabel(state.activePath) : '纯文本';
    renderActionState();
    persistState();
    const document = root.ownerDocument;
    const projectName = projects.find(item => item.id === state.projectId)?.name;
    const file = state.activePath?.split('/').at(-1);
    document.title =
      state.projectId && file && projectName ?
        `${file} — ${projectName} — Aiao Code`
      : 'Aiao VSCode · 浏览器开发工作台';
    if (!state.preview) {
      preview?.dispose();
      preview = undefined;
      previewId = 0;
    }
    if (state.preview && docking.isPreviewOpen() && state.preview.runId !== previewId) {
      preview?.dispose();
      previewId = state.preview.runId;
      preview = mountPreview(
        previewContent,
        { ...state.preview, sessionId: crypto.randomUUID(), imports: {}, allowEval: project?.template === 'angular' },
        previewEvent
      );
    }
    if (state.error && logs.at(-1)?.text !== state.error) report(state.error);
  }
  /** 初始化、编译或操作进行中时顶栏动作整体置忙。 */
  function workbenchBusy(): boolean {
    return initializing || scmBusy || (session.state.busy && previewPhase !== 'compiling') || pendingOperations > 0;
  }
  function projectSwitchBusy(ownOperations = 0): boolean {
    return (
      initializing ||
      scmBusy ||
      ((session.state.busy || pendingOperations > ownOperations) && previewPhase !== 'compiling')
    );
  }
  function setPressed(button: HTMLElement, pressed: boolean): void {
    button.setAttribute('aria-pressed', String(pressed));
    const pair = TOGGLE_ICONS[button.dataset['action'] ?? ''];
    if (!pair) return;
    const icon = button.querySelector<HTMLElement>('.codicon');
    icon?.classList.toggle(`codicon-${pair[0]}`, pressed);
    icon?.classList.toggle(`codicon-${pair[1]}`, !pressed);
  }
  function renderActionState(): void {
    element<HTMLButtonElement>('[data-action="navigate-back"]').disabled = !navigation.canGoBack;
    element<HTMLButtonElement>('[data-action="navigate-forward"]').disabled = !navigation.canGoForward;
    for (const button of root.querySelectorAll<HTMLElement>('[data-action="explorer"],[data-action="git"]')) {
      button.setAttribute('aria-pressed', String(docking.isSidebarVisible() && button.dataset['action'] === sideView));
    }
    const toolsVisible = docking.isToolsVisible();
    for (const button of root.querySelectorAll<HTMLElement>('.wb-title-actions [data-action="panel"]'))
      setPressed(button, toolsVisible);
    const sidebarButton = root.querySelector<HTMLElement>('[data-action="toggle-sidebar"]');
    if (sidebarButton) setPressed(sidebarButton, docking.isSidebarVisible());
    const previewVisible = docking.isPreviewOpen();
    for (const button of root.querySelectorAll<HTMLElement>('.wb-title-actions [data-action="preview"]'))
      button.setAttribute('aria-pressed', String(previewVisible));
    const busy = workbenchBusy();
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-welcome-action],[data-welcome-recent]'))
      button.disabled = initializing || pendingOperations > 0;
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-action="run"],[data-action="rerun-preview"]'))
      button.disabled = !session.state.projectId || busy;
    for (const button of root.querySelectorAll<HTMLButtonElement>(
      '[data-mutation],[data-action=commit],[data-action=stage-all],[data-action=refresh-tree],[data-action=collapse-tree],[data-action=new-file],[data-action=new-folder],[data-action=discard]'
    ))
      button.disabled = !session.state.projectId || busy;
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-remote-action]')) {
      button.hidden = !gitStatus?.remote;
      button.disabled = !backend.pull || !session.state.projectId || busy || session.state.dirty;
    }
    const commitControl = element<HTMLButtonElement>('[data-action="commit"]');
    const commitLabel = gitStatus?.remote ? '提交并推送' : '提交';
    commitControl.setAttribute('aria-label', commitLabel);
    commitControl.title = commitLabel;
    element<HTMLButtonElement>('[data-action="workspace"]').disabled =
      initializing || (busy && previewPhase !== 'compiling');
  }
  async function newProject(): Promise<void> {
    const name = await requestWorkbenchText(root, '项目名称', '我的项目');
    if (!name) return;
    const kind = await requestWorkbenchText(root, '模板：vanilla / react / vue / angular', 'react');
    if (!kind) return;
    if (!Object.hasOwn(templates, kind)) throw new Error('请选择 vanilla、react、vue 或 angular');
    const template = templates[kind as ProjectTemplate];
    const id = crypto.randomUUID();
    const info: WorkbenchProjectInfo = {
      id,
      name,
      template: template.template,
      entry: template.entry,
      updatedAt: Date.now()
    };
    cancelCompilation();
    await terminal?.stop();
    await session.create(id, {
      ...template.files,
      'workbench.project.json': JSON.stringify({ template: info.template, entry: info.entry }, null, 2)
    });
    if (disposed || session.state.projectId !== id) return;
    projects = [...projects, info];
    project = info;
    renderProjects();
    ensureSavePreview();
    focusEditor(session.state.activePath);
    void savePreview.runSaved().catch(report);
    await catalog.put(info).catch(report);
    void refreshGit().catch(report);
    log('output', `已创建 ${name} · ${template.title}`);
  }
  /** 「运行方式」对应的终端运行时；即时编译与尚未接入的方式明确报错。 */
  function runtimeAdapter(id: RuntimeId): TerminalRuntimeAdapter {
    if (id === 'webcontainer') return createWebContainerAdapter({ apiKey: options.webContainerApiKey });
    if (id === 'esbuild-wasm') throw new Error('即时编译方式不提供终端，请在设置里换成 Node 运行时');
    throw new Error(`运行方式「${RUNTIME_LABELS[id]}」尚未接入`);
  }
  async function switchRuntime(): Promise<void> {
    await terminal.stop();
    log('output', `运行方式已切换为 ${RUNTIME_LABELS[currentRuntime()]}`);
  }
  async function run(): Promise<void> {
    if (currentRuntime() === 'esbuild-wasm') return runControlledPreview();
    const id = projectId();
    cancelCompilation();
    await session.save();
    if (disposed || session.state.projectId !== id) return;
    if (session.state.dirty) throw new Error('保存期间内容发生变化，请重试运行');
    docking.showTool('terminal');
    await terminal.runProject();
    await refreshGit();
  }
  async function runControlledPreview(): Promise<void> {
    projectId();
    docking.showPreview();
    await savePreview.run();
    await refreshGit();
  }
  function ensureSavePreview(): void {
    if (docking.isPreviewOpen()) return;
    const active = docking.api.activePanel;
    docking.showPreview();
    active?.api.setActive();
  }
  async function saveCurrent(): Promise<void> {
    const path = activeResource();
    if (!path) return;
    ensureSavePreview();
    await savePreview.save([path]);
    await refreshGit();
  }
  async function saveAll(): Promise<void> {
    projectId();
    ensureSavePreview();
    await savePreview.save();
    await refreshGit();
  }
  async function exportProject(): Promise<void> {
    const info = project;
    const id = projectId();
    await terminal?.flush();
    await session.save();
    if (session.state.dirty) throw new Error('保存期间内容发生变化，请重试导出');
    const archive = await backend.exportArchive(id);
    const blob = URL.createObjectURL(new Blob([new Uint8Array(archive)], { type: 'application/zip' }));
    const link = document.createElement('a');
    link.href = blob;
    link.download = `${info?.name ?? id}.zip`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(blob), 1000);
    log('output', '已导出源码、暂存区与 Git 历史');
  }
  function importProject(): void {
    if (session.state.dirty) throw new Error('存在未保存内容，请先保存');
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip,application/zip';
    input.onchange = () =>
      action(async () => {
        const file = input.files?.[0];
        if (!file) return;
        if (file.size > 24 * 1024 * 1024) throw new Error('归档超过 24 MiB 上限');
        const id = crypto.randomUUID();
        await backend.importArchive(id, new Uint8Array(await file.arrayBuffer()));
        const snapshot = await backend.open(id);
        const source = snapshot.files['workbench.project.json'];
        if (typeof source !== 'string') throw new Error(`归档缺少受控模板配置，仓库保留为 ${id}`);
        const config: unknown = JSON.parse(source);
        if (!config || typeof config !== 'object') throw new Error('无效模板配置');
        const metadata = config as Record<string, unknown>;
        if (
          typeof metadata['template'] !== 'string' ||
          !Object.hasOwn(templates, metadata['template']) ||
          typeof metadata['entry'] !== 'string' ||
          !Object.hasOwn(snapshot.files, metadata['entry'])
        )
          throw new Error('导入归档不属于受控模板');
        const info: WorkbenchProjectInfo = {
          id,
          name: file.name.replace(/\.zip$/i, ''),
          template: metadata['template'] as ProjectTemplate,
          entry: metadata['entry'],
          updatedAt: Date.now()
        };
        await catalog.put(info);
        projects = [...projects, info];
        await openProject(id);
      });
    input.click();
  }
  function showRecentProjects(returnFocus?: HTMLElement): void {
    if (projectSwitchBusy(1)) return;
    commands.showPicker({
      label: '打开最近项目',
      placeholder: '按名称搜索最近打开的项目',
      returnFocus,
      items: projects.map(item => ({
        id: `project:${item.id}`,
        label: item.name,
        description: item.id === session.state.projectId ? '当前项目' : item.template,
        run: () => {
          if (projectSwitchBusy()) return;
          action(() => openProject(item.id));
        }
      }))
    });
  }
  function navigateEditor(direction: 'back' | 'forward'): void {
    const target = navigation[direction]();
    if (!target) return;
    session.select(target.path);
    docking.selectEditor(target.path);
    focusEditor(target.path);
    renderActionState();
  }
  const operations: Record<string, () => Promise<unknown> | void> = {
    'title-menu': () => {
      const rectangle = element('[data-action="title-menu"]').getBoundingClientRect();
      // action() 在调用前已把本次菜单打开计为进行中操作；排除这一笔，只有另有操作在跑才算忙。
      const busy = initializing || (session.state.busy && previewPhase !== 'compiling') || pendingOperations > 1;
      const editable = !!session.state.projectId && !busy;
      showContextMenu({ x: rectangle.left, y: rectangle.bottom }, [
        { label: '新建项目', id: 'new-project', action: newProject, disabled: busy },
        {
          label: '打开最近项目…',
          id: 'open-recent',
          action: () => showRecentProjects(element('[data-action="title-menu"]')),
          disabled: busy,
          keybinding: 'Ctrl + R'
        },
        {
          label: '导入文件夹（副本）…',
          id: 'open-folder',
          action: openFolder,
          disabled: busy || !('showDirectoryPicker' in window)
        },
        ...(options.githubApi ?
          [{ label: '从 GitHub 打开仓库…', id: 'open-github', action: openGitHubRepository, disabled: busy }]
        : []),
        { label: '导入项目', id: 'import', action: importProject, disabled: busy },
        { label: '导出项目', id: 'export', action: exportProject, disabled: !editable },
        { separator: true },
        { label: '保存当前文件', id: 'save', action: saveCurrent, disabled: !editable },
        { label: '保存全部并预览', id: 'save-all', action: saveAll, disabled: !editable },
        {
          label: '打开终端',
          id: 'terminal',
          action: () => docking.showTool('terminal'),
          disabled: !editable,
          keybinding: 'Ctrl + `'
        }
      ]);
    },
    workspace: () => {
      const rectangle = element('[data-action="workspace"]').getBoundingClientRect();
      const busy = projectSwitchBusy(1);
      showContextMenu({ x: rectangle.left, y: rectangle.bottom }, [
        ...projects.map(item => ({
          label: item.name,
          checked: item.id === session.state.projectId,
          id: `project:${item.id}`,
          action: () => openProject(item.id),
          disabled: busy
        })),
        ...(projects.length > 0 ? ([{ separator: true }] as const) : []),
        {
          label: '打开最近项目…',
          id: 'open-recent',
          action: () => showRecentProjects(element('[data-action="workspace"]')),
          disabled: busy,
          keybinding: 'Ctrl + R'
        },
        {
          label: '导入文件夹（副本）…',
          id: 'open-folder',
          action: openFolder,
          disabled: busy || !('showDirectoryPicker' in window)
        },
        ...(options.githubApi ?
          [{ label: '从 GitHub 打开仓库…', id: 'open-github', action: openGitHubRepository, disabled: busy }]
        : []),
        { label: '新建项目', id: 'new-project', action: newProject, disabled: busy },
        { label: '导入项目', id: 'import', action: importProject, disabled: busy }
      ]);
    },
    'new-project': newProject,
    terminal: () => docking.showTool('terminal'),
    run,
    'rerun-preview': runControlledPreview,
    export: exportProject,
    import: importProject,
    save: saveCurrent,
    'save-all': saveAll,
    'new-file': () => beginCreate('file'),
    'new-folder': () => beginCreate('folder'),
    rename: () => {
      const path = renameTargetPath() ?? activeResource();
      if (path) startRename(path);
    },
    delete: (): Promise<void> | void => {
      const path = treeTargetPath() ?? activeResource();
      if (path) return deletePath(path);
    },
    commit: () => scm.commit(),
    'git-pull': () => scm.pull(),
    'git-push': () => scm.push(),
    'git-sync': () => scm.sync(),
    format: formatSource,
    'goto-line': () => editorCommand('gotoLine'),
    'show-scm': () => switchSide('git', true),
    'clear-search': () => search.clear(),
    'collapse-search': () => search.collapseAll(),
    'indent-picker': () => {
      const target = element('[data-slot="indent"]');
      showContextMenu(
        { x: target.getBoundingClientRect().left, y: target.getBoundingClientRect().top },
        [
          { label: '2 个空格', action: () => applyIndentUnit('  ') },
          { label: '4 个空格', action: () => applyIndentUnit('    ') },
          { label: '8 个空格', action: () => applyIndentUnit('        ') }
        ],
        target
      );
    },
    'select-line': () => editorCommand('selectLine'),
    'insert-line-above': () => editorCommand('insertLineAbove'),
    'clear-logs': () => {
      logs.splice(0);
      renderLogs();
    },
    'refresh-tree': () => action(refreshGit),
    'collapse-tree': () => {
      for (const path of Object.keys(session.state.files)) {
        const parts = path.split('/');
        for (let index = 1; index < parts.length; index++) collapsedFolders.add(parts.slice(0, index).join('/'));
      }
      renderFiles(session.state);
    },
    'close-all-editors': () => {
      for (const tab of [...session.state.tabs]) closeEditorTab(tab);
    },
    panel: () => {
      docking.toggleTools();
      renderActionState();
    },
    preview: () => {
      docking.showPreview();
      render(session.state);
    },
    'command-center': () => commands.showCommandCenter(),
    'navigate-back': () => navigateEditor('back'),
    'navigate-forward': () => navigateEditor('forward'),
    'quick-open': () => commands.showQuickOpen(),
    commands: () => commands.showCommandPalette(),
    'toggle-sidebar': () => switchSide(sideView),
    settings: () =>
      openWorkbenchSettings(root, {
        indentUnit,
        editorEngine,
        alwaysShowScmActions,
        runtime: preferredRuntime,
        availableRuntimes: AVAILABLE_RUNTIMES,
        onApply(settings) {
          const runtimeBefore = currentRuntime();
          applyIndentUnit(settings.indentUnit, false);
          alwaysShowScmActions = settings.alwaysShowScmActions;
          scm.setAlwaysShowActions(alwaysShowScmActions);
          preferredRuntime = settings.runtime;
          editorEngine = settings.editorEngine;
          for (const editor of editors.values()) editor.handle.setEngine?.(editorEngine);
          persistPreferences();
          log('output', '设置已更新并保存在此浏览器');
          if (currentRuntime() !== runtimeBefore) void switchRuntime().catch(report);
        }
      }),
    'github-account': () => {
      if (!options.githubAuth) return;
      if (githubSession) {
        const rectangle = element('[data-action="github-account"]').getBoundingClientRect();
        showContextMenu({ x: rectangle.left, y: rectangle.bottom }, [
          {
            label: `登出 GitHub（${githubSession.login}）`,
            action: async () => {
              await options.githubAuth!.logout();
              log('output', '已登出 GitHub');
            }
          }
        ]);
        return;
      }
      void requestGitHubLogin(root, { auth: options.githubAuth }).catch(report);
    },
    'reset-layout': () => {
      docking.resetLayout();
      render(session.state);
    }
  };
  /** 侧栏标题「视图和更多操作」菜单：条目随当前视图切换，对齐 VS Code 的标题栏 … 按钮。 */
  function showMoreMenu(anchor: HTMLElement): void {
    const rectangle = anchor.getBoundingClientRect();
    const entries: readonly MenuEntry[] =
      sideView === 'git' ?
        [
          ...scm.getMenuEntries(),
          SEPARATOR,
          {
            label: '始终显示操作',
            id: 'always-show-actions',
            checked: alwaysShowScmActions,
            action: () => {
              alwaysShowScmActions = !alwaysShowScmActions;
              scm.setAlwaysShowActions(alwaysShowScmActions);
              persistPreferences();
            }
          }
        ]
      : sideView === 'search' ?
        [
          { label: '清除搜索结果', id: 'clear-search', action: operations['clear-search'] },
          { label: '折叠全部', id: 'collapse-search', action: operations['collapse-search'] }
        ]
      : [
          {
            label: '打开的编辑器',
            id: 'toggle-open-editors',
            checked: showOpenEditors,
            action: () => {
              showOpenEditors = !showOpenEditors;
              renderFiles(session.state);
            }
          },
          {
            label: session.state.projectId ? '文件夹' : '无打开的文件夹',
            id: 'toggle-folders',
            checked: true,
            disabled: true,
            action: () => undefined
          }
        ];
    showContextMenu({ x: rectangle.left, y: rectangle.bottom }, entries);
  }

  function switchSide(view: string, force = false): void {
    const visible = force || !(sideView === view && docking.isSidebarVisible());
    docking.setSidebarVisible(visible);
    sideView = view;
    const isExplorer = view === 'explorer';
    const isSearch = view === 'search';
    element('[data-slot="files"]').hidden = !isExplorer;
    element('[data-slot="git-view"]').hidden = isExplorer || isSearch;
    element('[data-slot="search-view"]').hidden = !isSearch;
    for (const actions of root.querySelectorAll<HTMLElement>('.wb-side-actions[data-view]'))
      actions.hidden = actions.dataset['view'] !== view;
    const title =
      isExplorer ? '资源管理器'
      : isSearch ? '搜索'
      : '源代码管理';
    element('[data-slot="side-title"]').textContent = title;
    element('.wb-side').setAttribute('aria-label', title);
    for (const button of root.querySelectorAll<HTMLElement>(
      '[data-action="explorer"],[data-action="search"],[data-action="git"]'
    ))
      button.setAttribute('aria-pressed', String(visible && button.dataset['action'] === view));
    const sidebarButton = root.querySelector<HTMLElement>('[data-action="toggle-sidebar"]');
    if (sidebarButton) setPressed(sidebarButton, visible);
    if (view === 'git') action(refreshGit);
    // 快捷键强制显示时把焦点送进对应视图（对齐 VS Code 的 Ctrl/⌘+Shift+E / F / G）
    if (force && visible) {
      queueMicrotask(() => {
        if (disposed) return;
        if (isExplorer) {
          (treeRow(treeFocusPath) ?? tree.querySelector<HTMLElement>('[data-tree-section],[data-tree-path]'))?.focus();
        } else if (isSearch) {
          search.focus();
        } else {
          element<HTMLTextAreaElement>('.wb-scm-commit-form textarea')?.focus();
        }
      });
    }
  }
  const click = (event: Event) => {
    const target =
      event.target instanceof Element ? event.target.closest<HTMLElement>('[data-action],[data-panel]') : null;
    if (!target) return;
    const name = target.dataset['action'];
    if (name === 'explorer' || name === 'search' || name === 'git') {
      switchSide(name);
      return;
    }
    if (name === 'more-actions') {
      event.preventDefault();
      showMoreMenu(target);
      return;
    }
    const tool = target.dataset['panel'];
    if (tool === 'problems' || tool === 'output' || tool === 'console' || tool === 'terminal') {
      docking.showTool(tool);
      return;
    }
    if (name && operations[name]) {
      event.preventDefault();
      action(operations[name]);
    }
  };
  root.addEventListener('click', click);
  const commands = createWorkbenchCommands(root, {
    getFiles: () => Object.keys(session.state.files),
    getRecentPaths: () => session.state.tabs,
    getActivePath: activeResource,
    openFile(path) {
      treeFocusPath = path;
      session.select(path);
      docking.selectEditor(path);
      closeNarrowSidebar();
      focusEditor(path);
    },
    onError: report,
    getCommands: () => {
      const gitCommands = new Set(['commit', 'gitPush', 'gitPull', 'gitSync']);
      const invoke = (id: string, operation: () => Promise<unknown> | void) => () => {
        if (disposed || initializing) return;
        if (scmBusy && gitCommands.has(id)) return;
        if (
          pendingOperations > 0 &&
          !['save', 'saveAll', 'run', 'gotoLine', 'selectLine', 'insertLineAbove', 'find'].includes(id)
        )
          return;
        action(operation);
      };
      const definitions: readonly (readonly [string, string, string | undefined, () => Promise<unknown> | void])[] = [
        ['save', '文件: 保存并预览当前文件', '⌘ / Ctrl + S', saveCurrent],
        ['saveAll', '文件: 保存全部并预览', '⌘ / Ctrl + Shift + S', saveAll],
        ['format', '文件: 格式化代码', '⇧ / Shift + ⌥ / Alt + F', formatSource],
        ['gotoLine', '转到: 转到行', '⌘ / Ctrl + G', operations['goto-line']],
        ['selectLine', '编辑器: 展开行选择', '⌘ / Ctrl + L', operations['select-line']],
        ['insertLineAbove', '编辑器: 在上方插入行', '⌘ / Ctrl + Shift + Enter', operations['insert-line-above']],
        ['find', '编辑器: 查找', '⌘ / Ctrl + F', () => editorCommand('find')],
        ['run', '运行: 保存全部并运行项目', undefined, run],
        ['newFile', '文件: 新建文件', undefined, operations['new-file']],
        ['newProject', '项目: 新建项目', undefined, newProject],
        ['openRecent', '文件: 打开最近项目', 'Ctrl + R', showRecentProjects],
        ['navigateBack', '转到: 后退', undefined, () => navigateEditor('back')],
        ['navigateForward', '转到: 前进', undefined, () => navigateEditor('forward')],
        ['rename', '文件: 重命名', 'F2', operations['rename']],
        ['deleteFile', '文件: 删除文件', undefined, operations['delete']],
        ['toggleSidebar', '查看: 切换侧栏', '⌘ / Ctrl + B', () => switchSide(sideView)],
        ['showExplorer', '查看: 显示资源管理器', '⌘ / Ctrl + Shift + E', () => switchSide('explorer', true)],
        ['showSearch', '搜索: 在文件中搜索', '⌘ / Ctrl + Shift + F', () => switchSide('search', true)],
        ['showScm', '查看: 源代码管理', '⌘ / Ctrl + Shift + G', () => switchSide('git', true)],
        ['showProblems', '查看: 显示问题面板', '⌘ / Ctrl + Shift + M', () => docking.showTool('problems')],
        ['showOutput', '查看: 显示输出面板', '⌘ / Ctrl + Shift + U', () => docking.showTool('output')],
        ['showTerminal', '终端: 打开交互终端', 'Ctrl + `', () => docking.showTool('terminal')],
        ['commit', gitStatus?.remote ? 'Git: 提交并推送' : 'Git: 提交已暂存更改', undefined, () => scm.commit()],
        ...(gitStatus?.remote ?
          ([
            ['gitPush', 'Git: 推送', undefined, () => scm.push()],
            ['gitPull', 'Git: 拉取', undefined, () => scm.pull()],
            ['gitSync', 'Git: 同步更改', undefined, () => scm.sync()]
          ] as const)
        : []),
        ['togglePanel', '查看: 切换底部面板', '⌘ / Ctrl + J', () => docking.toggleTools()],
        ['split', '查看: 向右拆分编辑器', '⌘ / Ctrl + 反斜杠', () => docking.splitEditor()],
        ['resetLayout', '查看: 重置布局', undefined, operations['reset-layout']],
        ['closeEditor', '查看: 关闭当前编辑标签', '⌘ / Ctrl + W', closeActiveEditor],
        ['nextEditor', '查看: 打开下一个编辑器', 'Ctrl + Tab', () => cycleEditor(1)],
        ['prevEditor', '查看: 打开上一个编辑器', 'Ctrl + Shift + Tab', () => cycleEditor(-1)]
      ];
      return definitions
        .filter(([id]) => !scmBusy || !gitCommands.has(id))
        .map(([id, label, keybinding, operation]): WorkbenchCommand => ({
          id,
          label,
          keybinding,
          run: invoke(id, operation)
        }));
    }
  });
  const releaseState = session.subscribe(render);
  const ready = (async () => {
    const recoveredPreferences = recovery.getPreferences();
    const [listed, durablePreferences] = await Promise.all([catalog.list(), catalog.getPreferences()]);
    if (disposed) return;
    const preferences = recoveredPreferences ?? durablePreferences;
    preferencesRestored = true;
    projects = listed.toSorted((left, right) => right.updatedAt - left.updatedAt);
    if (preferences) {
      applyIndentUnit(preferences.indentUnit, false);
      alwaysShowScmActions = preferences.alwaysShowScmActions;
      scm.setAlwaysShowActions(alwaysShowScmActions);
      preferredRuntime = preferences.runtime;
      editorEngine = preferences.editorEngine;
    }
    if (recoveredPreferences) persistPreferences();
    if (requestedRuntime !== null && !runtimeOverride)
      report(new Error(`地址参数里的运行方式无效：${requestedRuntime}`));
    renderProjects();
    // 没有显式指定时恢复上次的会话：最近项目带会话状态（曾被打开过）就直接打开，
    // 全新目录或只有未打开过的新条目时停留在欢迎视图。
    const recent = projects[0];
    const restorable =
      recent ? (recovery.getProject(recent.id) ?? (await catalog.getState(recent.id))) !== null : false;
    const initial = options.initialProjectId ?? (restorable ? recent.id : null);
    if (initial) await openProject(initial);
  })()
    .catch(report)
    .finally(() => {
      initializing = false;
      if (!disposed) {
        renderFiles(session.state);
        renderStatus();
        renderActionState();
        // 挂载链全部落地后强制重布局，兜住 dockview 边缘组 overlay 首帧测量竞态
        requestAnimationFrame(() => {
          requestAnimationFrame(() => docking.refreshLayout());
        });
      }
    });
  return {
    ready,
    session,
    refreshLayout: () => docking.refreshLayout(),
    dispose() {
      if (disposed) return;
      disposed = true;
      closeContextMenu();
      releaseState();
      commands.dispose();
      scm.dispose();
      search.dispose();
      savePreview.dispose();
      terminal?.dispose();
      for (const diff of diffs.values()) diff.view?.dispose();
      diffs.clear();
      session.dispose();
      compiler.dispose();
      preview?.dispose();
      for (const editor of editors.values()) editor.handle.dispose();
      layoutChanges.dispose();
      docking.dispose();
      for (const dialog of root.querySelectorAll<HTMLDialogElement>('dialog')) dialog.close();
      narrowMedia.removeEventListener('change', onNarrowChange);
      for (const timer of layoutRetries) clearTimeout(timer);
      clearTimeout(layoutSaveTimer);
      root.removeEventListener('click', click);
      root.remove();
    }
  };
}
