import { createProjectCatalog, type WorkbenchCatalog, type WorkbenchProjectInfo } from './catalog.js';
import { createCompiler, type WorkbenchCompiler } from './compiler-client.js';
import type { ProjectTemplate } from './compiler/compiler-types.js';
import { CompilationError, type WorkbenchDiagnostic } from './compiler/compiler-types.js';
import type { WorkbenchEditorCommand, WorkbenchEditorHandle, WorkbenchEditorMount } from './editor.js';
import { formatWorkbenchSource } from './formatter.js';
import { createGitBackend } from './git-backend.js';
import { mountPreview, type PreviewEvent } from './preview/preview-sandbox.js';
import { createSavePreviewController, type SavePreviewPhase } from './save-preview.js';
import { WorkbenchSession, type WorkbenchBackend, type WorkbenchState, type WorkbenchStatus } from './session.js';
import { angularTemplate, defaultAngularDemo } from './templates-angular.js';
import { defaultFrontendDemos, frontendTemplates, type WorkbenchTemplate } from './templates.js';
import { createWorkbenchCommands, type WorkbenchCommand } from './workbench-commands.js';
import { confirmWorkbenchAction, requestWorkbenchText } from './workbench-dialog.js';
import { createWorkbenchDiff, type WorkbenchDiffHandle } from './workbench-diff.js';
import { createWorkbenchDockview } from './workbench-dockview.js';
import { createCodicon, createFileIcon, folderCodicon } from './workbench-icons.js';
import { createWorkbenchLayout, workbenchElement } from './workbench-layout.js';
import { createWorkbenchScm, type WorkbenchDiffRequest } from './workbench-scm.js';

/** 工作台的可注入服务与静态资源位置。 */
export interface BrowserWorkbenchOptions {
  readonly assetBaseURL?: string;
  readonly initialProjectId?: string;
  readonly backend?: WorkbenchBackend;
  readonly compiler?: WorkbenchCompiler;
  readonly catalog?: WorkbenchCatalog;
}

/** 工作台实例；释放会终止所有 Worker 与编辑器。 */
export interface WorkbenchHandle {
  readonly ready: Promise<void>;
  readonly session: WorkbenchSession;
  dispose(): void;
}

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

/** 文件树内的 VS Code 风格输入行；Enter 提交、Esc 取消、失焦提交当前值。 */
function inlineTreeInput(
  initial: string,
  label: string,
  onCommit: (value: string) => void,
  onCancel: () => void
): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'wb-inline-input';
  input.value = initial;
  input.spellcheck = false;
  input.setAttribute('aria-label', label);
  let settled = false;
  const settle = (commit: boolean): void => {
    if (settled) return;
    settled = true;
    if (commit) onCommit(input.value.trim());
    else onCancel();
  };
  input.onkeydown = event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      settle(true);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      settle(false);
    }
  };
  input.onblur = () => settle(true);
  queueMicrotask(() => {
    input.focus();
    const dot = initial.lastIndexOf('.');
    input.setSelectionRange(0, dot > 0 ? dot : initial.length);
  });
  return input;
}

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
  const session = new WorkbenchSession(backend);
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
  let renamingPath: string | null = null;
  let treeFocusPath: string | null = null;
  let treeNavigation = false;
  let contextMenu: HTMLElement | null = null;
  let gitStatus: WorkbenchStatus | null = null;
  let persistedState = '';
  let persistChain: Promise<void> = Promise.resolve();
  let restoring = false;
  const collapsedFolders = new Set<string>();
  const docking = createWorkbenchDockview(root, {
    onSelectEditor(path) {
      if (disposed || !session.state.tabs.includes(path)) return;
      if (session.state.activePath !== path) session.select(path);
      if (!treeNavigation) focusEditor(path);
    },
    onCloseEditor(path) {
      if (disposed) return;
      closeEditorTab(path);
    },
    onSelectTool() {
      renderLogs();
    },
    onCloseAuxiliary(id) {
      diffs.get(id)?.view?.dispose();
      diffs.delete(id);
    },
    onClosePreview() {
      preview?.dispose();
      preview = undefined;
      previewId = 0;
    }
  });
  const layoutChanges = docking.api.onDidLayoutChange(() => {
    queueMicrotask(() => {
      if (!disposed) {
        editors.forEach(editor => editor.handle.layout?.());
        diffs.forEach(diff => diff.view?.layout());
      }
    });
  });

  const scm = createWorkbenchScm(element('[data-slot="scm"]'), {
    backend,
    session,
    onError: report,
    onOpenDiff: openDiff,
    onRefresh: () => action(refreshGit),
    async onDidChange(snapshot, paths) {
      if (snapshot && snapshot.projectId === session.state.projectId) {
        cancelCompilation();
        session.applySavedSnapshot(snapshot, paths ?? []);
      }
      await refreshGit();
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
      },
      onError: report
    }
  );

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
    const activity = previewPhase === 'compiling' || previewPhase === 'waiting' ? ' · 更新预览中…' : '';
    element('[data-slot="save-status"]').textContent =
      initializing ? '加载项目…'
      : previewPhase === 'saving' ? '正在保存…'
      : modified ? `未保存${activity}`
      : state.projectId ? `已保存${remaining ? ` · 另有 ${remaining} 个文件未保存` : ''}${activity}`
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
      }
      return;
    }
    log('problems', text, 'error', targets);
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
    for (const kind of ['problems', 'output', 'console']) {
      const content = logContents.get(kind)!;
      content.replaceChildren();
      const entries = logs.filter(item => item.kind === kind);
      if (!entries.length && kind === 'problems') {
        const empty = document.createElement('p');
        empty.className = 'wb-log-empty';
        empty.textContent = '尚无问题';
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
  function openDiagnostic(target: WorkbenchDiagnostic): void {
    if (!target.file || !Object.hasOwn(session.state.files, target.file)) {
      log('output', target.file ? `问题指向的文件不在项目中：${target.file}` : '该问题没有可定位的文件');
      return;
    }
    session.select(target.file);
    docking.selectEditor(target.file);
    if (target.line !== undefined) editorCommand('gotoLineAt', target.line);
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
  /** 标签或活动文件变化时串行落库，重开项目时恢复；初始恢复期间不写库。 */
  function persistState(): void {
    const id = session.state.projectId;
    if (!id || restoring) return;
    const snapshot = JSON.stringify([id, session.state.tabs, session.state.activePath]);
    if (snapshot === persistedState) return;
    persistedState = snapshot;
    persistChain = persistChain
      .then(() => catalog.putState(id, { tabs: [...session.state.tabs], activePath: session.state.activePath }))
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
    const select = element<HTMLSelectElement>('.wb-projects');
    select.replaceChildren();
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '选择项目';
    select.append(placeholder);
    for (const item of projects) {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = item.name;
      select.append(option);
    }
    select.value = project?.id ?? '';
  }
  async function openProject(id: string): Promise<void> {
    const next = projects.find(item => item.id === id);
    if (!next) throw new Error('项目不在目录中');
    cancelCompilation();
    restoring = true;
    try {
      await session.open(id);
      if (disposed || session.state.projectId !== id) return;
      const saved = await catalog.getState(id).catch(() => null);
      if (disposed || session.state.projectId !== id) return;
      if (saved) session.restoreTabs(saved.tabs, saved.activePath);
    } finally {
      restoring = false;
    }
    persistedState = JSON.stringify([id, session.state.tabs, session.state.activePath]);
    const opened = { ...next, updatedAt: Date.now() };
    project = opened;
    projects = projects.map(item => (item.id === id ? opened : item));
    renderProjects();
    focusEditor(session.state.activePath);
    void savePreview.runSaved().catch(report);
    await catalog.put(opened).catch(report);
    void refreshGit().catch(report);
    log('output', `已打开 ${next.name}`);
  }
  function renderFiles(state: WorkbenchState): void {
    if (treeProjectId !== state.projectId) {
      treeProjectId = state.projectId;
      creatingFile = false;
      renamingPath = null;
      gitStatus = null;
    }
    if ((creatingFile || renamingPath) && tree.querySelector('.wb-inline-input')) return;
    tree.replaceChildren();
    if (state.activePath !== activeTreePath) {
      activeTreePath = state.activePath;
      treeFocusPath = state.activePath;
      const parts = state.activePath?.split('/') ?? [];
      parts.slice(0, -1).forEach((_, index) => collapsedFolders.delete(parts.slice(0, index + 1).join('/')));
    }
    if (creatingFile) {
      const input = inlineTreeInput(
        '',
        '新建文件',
        value => {
          creatingFile = false;
          if (value) {
            action(async () => {
              projectId();
              if (value in session.state.files) throw new Error('文件已存在');
              session.edit(value, '');
              session.select(value);
            });
          }
          renderFiles(session.state);
        },
        () => {
          creatingFile = false;
          renderFiles(session.state);
        }
      );
      input.style.paddingLeft = '14px';
      tree.append(input);
    }
    const folders = new Set<string>();
    for (const path of Object.keys(state.files).sort()) {
      const parts = path.split('/');
      const parents = parts.slice(0, -1).map((_, index) => parts.slice(0, index + 1).join('/'));
      for (const [index, folder] of parents.entries()) {
        if (folders.has(folder) || parents.slice(0, index).some(parent => collapsedFolders.has(parent))) continue;
        folders.add(folder);
        const button = document.createElement('button');
        button.className = 'wb-file wb-folder';
        button.dataset['treePath'] = folder;
        button.style.paddingLeft = `${14 + index * 12}px`;
        button.setAttribute('role', 'treeitem');
        button.setAttribute('aria-expanded', String(!collapsedFolders.has(folder)));
        button.setAttribute('aria-level', String(index + 1));
        const label = document.createElement('span');
        label.textContent = parts[index];
        button.append(
          createCodicon(collapsedFolders.has(folder) ? 'chevron-right' : 'chevron-down'),
          createCodicon(folderCodicon(!collapsedFolders.has(folder))),
          label
        );
        button.title = folder;
        button.onclick = () => {
          treeFocusPath = folder;
          if (collapsedFolders.has(folder)) collapsedFolders.delete(folder);
          else collapsedFolders.add(folder);
          renderFiles(session.state);
          treeRow(folder)?.focus();
        };
        tree.append(button);
      }
      if (parents.some(parent => collapsedFolders.has(parent))) continue;
      if (path === renamingPath) {
        const input = inlineTreeInput(
          path.split('/').at(-1) ?? path,
          '重命名文件',
          value => {
            const from = path;
            renamingPath = null;
            const directory = from.includes('/') ? from.slice(0, from.lastIndexOf('/')) : '';
            const to = value ? `${directory ? `${directory}/` : ''}${value}` : '';
            if (to && to !== from) {
              action(async () => {
                cancelCompilation();
                await session.rename(from, to);
                await refreshGit();
              });
            }
            renderFiles(session.state);
          },
          () => {
            renamingPath = null;
            renderFiles(session.state);
          }
        );
        input.style.paddingLeft = `${14 + (parts.length - 1) * 12}px`;
        tree.append(input);
        continue;
      }
      const button = document.createElement('button');
      button.className = 'wb-file';
      button.dataset['treePath'] = path;
      button.setAttribute('aria-current', String(path === state.activePath));
      button.setAttribute('role', 'treeitem');
      button.setAttribute('aria-level', String(parts.length));
      button.style.paddingLeft = `${14 + (parts.length - 1) * 12}px`;
      button.title = path;
      const icon = createFileIcon(path);
      const name = document.createElement('span');
      name.className = 'wb-file-name';
      name.textContent = parts.at(-1) ?? path;
      button.append(icon, name);
      const gitEntry = gitStatus?.entries.find(entry => entry.path === path);
      const indexLetter = gitEntry && gitEntry.index !== ' ' ? gitEntry.index : '';
      const worktreeLetter = gitEntry && gitEntry.worktree !== ' ' ? gitEntry.worktree : '';
      const badge = (indexLetter && indexLetter !== '?' ? indexLetter : worktreeLetter).replace('?', 'U');
      if (badge) {
        const status = document.createElement('span');
        status.className = 'wb-file-status';
        status.dataset['status'] = badge;
        status.textContent = badge;
        button.append(status);
      }
      button.onclick = () => {
        treeFocusPath = path;
        treeNavigation = true;
        try {
          session.select(path);
          docking.selectEditor(path);
        } finally {
          queueMicrotask(() => {
            treeNavigation = false;
          });
        }
      };
      tree.append(button);
    }
    const rows = [...tree.querySelectorAll<HTMLButtonElement>('button[data-tree-path]')];
    const focused = rows.find(row => row.dataset['treePath'] === treeFocusPath);
    rows.forEach(row => (row.tabIndex = row === focused ? 0 : -1));
    if (!focused) rows[0]?.setAttribute('tabindex', '0');
  }

  const treeRow = (path: string | null): HTMLElement | undefined =>
    path === null ? undefined : (
      [...tree.querySelectorAll<HTMLElement>('button[data-tree-path]')].find(row => row.dataset['treePath'] === path)
    );

  /** 移动树焦点并按 VS Code 语义打开文件；选择只预览，不抢走树内焦点。 */
  function setTreeFocus(path: string | null, openFile: boolean): void {
    treeFocusPath = path;
    if (openFile && path) {
      treeNavigation = true;
      try {
        session.select(path);
        docking.selectEditor(path);
      } finally {
        queueMicrotask(() => {
          treeNavigation = false;
        });
      }
    }
    renderFiles(session.state);
    treeRow(path)?.focus();
  }

  function startRename(path: string): void {
    if (creatingFile || renamingPath) return;
    renamingPath = path;
    const parts = path.split('/');
    parts.slice(0, -1).forEach((_, index) => collapsedFolders.delete(parts.slice(0, index + 1).join('/')));
    renderFiles(session.state);
  }

  async function deletePath(path: string): Promise<void> {
    const confirmation = await confirmWorkbenchAction(root, '删除文件', `确定删除 ${path}？`, '删除文件');
    if (confirmation) {
      cancelCompilation();
      await session.remove(path);
      await refreshGit();
    }
  }

  function closeContextMenu(): void {
    contextMenu?.remove();
    contextMenu = null;
  }

  function showContextMenu(event: MouseEvent, entries: readonly { label: string; action: () => void }[]): void {
    event.preventDefault();
    closeContextMenu();
    const menu = document.createElement('div');
    menu.className = 'wb-context-menu';
    menu.setAttribute('role', 'menu');
    for (const entry of entries) {
      const item = document.createElement('button');
      item.type = 'button';
      item.setAttribute('role', 'menuitem');
      item.textContent = entry.label;
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
    menu.style.left = `${event.clientX}px`;
    menu.style.top = `${event.clientY}px`;
    const bounds = menu.getBoundingClientRect();
    const viewport = root.ownerDocument.defaultView;
    if (viewport && bounds.right > viewport.innerWidth)
      menu.style.left = `${Math.max(0, viewport.innerWidth - bounds.width - 4)}px`;
    if (viewport && bounds.bottom > viewport.innerHeight)
      menu.style.top = `${Math.max(0, viewport.innerHeight - bounds.height - 4)}px`;
    contextMenu = menu;
  }

  tree.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.isComposing) return;
    if (event.target instanceof Element && event.target.closest('input,textarea,select')) return;
    if (creatingFile || renamingPath) return;
    const rows = [...tree.querySelectorAll<HTMLElement>('button[data-tree-path]')];
    if (!rows.length) return;
    const current = rows.findIndex(row => row.dataset['treePath'] === treeFocusPath);
    const row = current === -1 ? undefined : rows[current];
    const path = row?.dataset['treePath'];
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const next = rows[Math.min(rows.length - 1, Math.max(0, current === -1 ? 0 : current + step))];
      setTreeFocus(next.dataset['treePath'] ?? null, !next.classList.contains('wb-folder'));
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const next = rows[event.key === 'Home' ? 0 : rows.length - 1];
      setTreeFocus(next.dataset['treePath'] ?? null, !next.classList.contains('wb-folder'));
      return;
    }
    if (event.key === 'Enter' && row) {
      event.preventDefault();
      if (row.classList.contains('wb-folder') && path) {
        if (collapsedFolders.has(path)) collapsedFolders.delete(path);
        else collapsedFolders.add(path);
        treeFocusPath = path;
        renderFiles(session.state);
        treeRow(path)?.focus();
      } else if (path) {
        setTreeFocus(path, true);
        focusEditor(path);
      }
      return;
    }
    if (event.key === 'ArrowRight' && row?.classList.contains('wb-folder') && path) {
      event.preventDefault();
      if (collapsedFolders.has(path)) {
        collapsedFolders.delete(path);
        treeFocusPath = path;
        renderFiles(session.state);
        treeRow(path)?.focus();
      } else {
        setTreeFocus(rows[Math.min(rows.length - 1, current + 1)].dataset['treePath'] ?? null, true);
      }
      return;
    }
    if (event.key === 'ArrowLeft' && row && path) {
      event.preventDefault();
      if (row.classList.contains('wb-folder') && !collapsedFolders.has(path)) {
        collapsedFolders.add(path);
        treeFocusPath = path;
        renderFiles(session.state);
        treeRow(path)?.focus();
      } else if (path.includes('/')) {
        setTreeFocus(path.slice(0, path.lastIndexOf('/')), false);
      }
      return;
    }
    if (event.key === 'Delete' && row && !row.classList.contains('wb-folder') && path) {
      event.preventDefault();
      action(() => deletePath(path));
    }
  });
  tree.addEventListener('contextmenu', event => {
    if (creatingFile || renamingPath) return;
    const row = event.target instanceof Element ? event.target.closest<HTMLElement>('button[data-tree-path]') : null;
    const targetPath = row?.dataset['treePath'] ?? null;
    if (targetPath) {
      treeFocusPath = targetPath;
      renderFiles(session.state);
      treeRow(targetPath)?.focus();
    }
    const entries =
      targetPath && !row?.classList.contains('wb-folder') ?
        [
          { label: '重命名', action: () => startRename(targetPath) },
          { label: '删除', action: () => deletePath(targetPath) }
        ]
      : [{ label: '新建文件', action: () => operations['new-file']() }];
    showContextMenu(event, entries);
  });
  root.addEventListener('mousedown', event => {
    if (contextMenu && !(event.target instanceof Node && contextMenu.contains(event.target))) closeContextMenu();
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
          onChange: content => session.edit(path, content),
          onCursor: (line, column) => {
            element('[data-slot="cursor"]').textContent = `行 ${line}，列 ${column}`;
          }
        });
        editor = { host: parent, handle };
        editors.set(path, editor);
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
    renderFiles(state);
    renderEditors(state);
    renderStatus();
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
  function renderActionState(): void {
    for (const button of root.querySelectorAll<HTMLElement>('[data-action="explorer"],[data-action="git"]')) {
      button.setAttribute('aria-pressed', String(docking.isSidebarVisible() && button.dataset['action'] === sideView));
    }
    const busy = initializing || (session.state.busy && previewPhase !== 'compiling') || pendingOperations > 0;
    for (const button of root.querySelectorAll<HTMLButtonElement>(
      '[data-action="save"],[data-action="run"],[data-action="rerun-preview"],[data-action="export"]'
    ))
      button.disabled = !session.state.projectId || busy;
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-action="new-project"],[data-action="import"]'))
      button.disabled = busy;
    for (const button of root.querySelectorAll<HTMLButtonElement>(
      '[data-mutation],[data-action=commit],[data-action=stage-all],[data-action=rename],[data-action=delete],[data-action=new-file],[data-action=discard]'
    ))
      button.disabled = !session.state.projectId || busy;
    element<HTMLSelectElement>('.wb-projects').disabled = initializing || (busy && previewPhase !== 'compiling');
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
    await session.create(id, {
      ...template.files,
      'workbench.project.json': JSON.stringify({ template: info.template, entry: info.entry }, null, 2)
    });
    if (disposed || session.state.projectId !== id) return;
    projects = [...projects, info];
    project = info;
    renderProjects();
    focusEditor(session.state.activePath);
    void savePreview.runSaved().catch(report);
    await catalog.put(info).catch(report);
    void refreshGit().catch(report);
    log('output', `已创建 ${name} · ${template.title}`);
  }
  async function run(): Promise<void> {
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
  const operations: Record<string, () => Promise<unknown> | void> = {
    'new-project': newProject,
    run,
    'rerun-preview': run,
    export: exportProject,
    import: importProject,
    save: saveCurrent,
    'save-all': saveAll,
    'new-file': () => {
      projectId();
      if (creatingFile || renamingPath) return;
      creatingFile = true;
      renderFiles(session.state);
    },
    rename: () => {
      const path = activeResource();
      if (path) startRename(path);
    },
    delete: (): Promise<void> | void => {
      const path = activeResource();
      if (path) return deletePath(path);
    },
    commit: () => scm.commit(),
    format: formatSource,
    'goto-line': () => editorCommand('gotoLine'),
    'select-line': () => editorCommand('selectLine'),
    'insert-line-above': () => editorCommand('insertLineAbove'),
    'clear-logs': () => {
      logs.splice(0);
      renderLogs();
    },
    panel: () => docking.toggleTools(),
    preview: () => {
      docking.showPreview();
      render(session.state);
    },
    'quick-open': () => commands.showQuickOpen(),
    commands: () => commands.showCommandPalette(),
    'reset-layout': () => {
      docking.resetLayout();
      render(session.state);
    }
  };
  function switchSide(view: string, force = false): void {
    const visible = force || !(sideView === view && docking.isSidebarVisible());
    docking.setSidebarVisible(visible);
    sideView = view;
    element('[data-slot="files"]').hidden = view !== 'explorer';
    element('[data-slot="git-view"]').hidden = view !== 'git';
    element('.wb-side-actions').hidden = view !== 'explorer';
    element('[data-slot="side-title"]').textContent = view === 'git' ? '源代码管理' : '资源管理器';
    for (const button of root.querySelectorAll<HTMLElement>('[data-action="explorer"],[data-action="git"]'))
      button.setAttribute('aria-pressed', String(visible && button.dataset['action'] === view));
    if (view === 'git') action(refreshGit);
  }
  const click = (event: Event) => {
    const target =
      event.target instanceof Element ? event.target.closest<HTMLElement>('[data-action],[data-panel]') : null;
    if (!target) return;
    const name = target.dataset['action'];
    if (name === 'explorer' || name === 'git') {
      switchSide(name);
      return;
    }
    const tool = target.dataset['panel'];
    if (tool === 'problems' || tool === 'output' || tool === 'console') {
      docking.showTool(tool);
      return;
    }
    if (name && operations[name]) {
      event.preventDefault();
      action(operations[name]);
    }
  };
  root.addEventListener('click', click);
  const select = element<HTMLSelectElement>('.wb-projects');
  select.onchange = () =>
    action(async () => {
      try {
        await openProject(select.value);
      } finally {
        renderProjects();
      }
    });
  const commands = createWorkbenchCommands(root, {
    getFiles: () => Object.keys(session.state.files),
    getActivePath: activeResource,
    openFile(path) {
      session.select(path);
      docking.selectEditor(path);
      focusEditor(path);
    },
    onError: report,
    getCommands: () => {
      const invoke = (id: string, operation: () => Promise<unknown> | void) => () => {
        if (disposed || initializing) return;
        if (
          pendingOperations > 0 &&
          !['save', 'saveAll', 'run', 'gotoLine', 'selectLine', 'insertLineAbove'].includes(id)
        )
          return;
        action(operation);
      };
      const definitions: readonly [string, string, string | undefined, () => Promise<unknown> | void][] = [
        ['save', '文件: 保存并预览当前文件', '⌘ / Ctrl + S', saveCurrent],
        ['saveAll', '文件: 保存全部并预览', '⌘ / Ctrl + Shift + S', saveAll],
        ['format', '文件: 格式化代码', '⇧ / Shift + ⌥ / Alt + F', formatSource],
        ['gotoLine', '转到: 转到行', '⌘ / Ctrl + G', operations['goto-line']],
        ['selectLine', '编辑器: 展开行选择', '⌘ / Ctrl + L', operations['select-line']],
        ['insertLineAbove', '编辑器: 在上方插入行', '⌘ / Ctrl + Shift + Enter', operations['insert-line-above']],
        ['run', '运行: 保存全部并运行项目', undefined, run],
        ['newFile', '文件: 新建文件', undefined, operations['new-file']],
        ['newProject', '项目: 新建项目', undefined, newProject],
        ['rename', '文件: 重命名', 'F2', operations['rename']],
        ['deleteFile', '文件: 删除文件', undefined, operations['delete']],
        ['toggleSidebar', '查看: 切换侧栏', '⌘ / Ctrl + B', () => switchSide(sideView)],
        ['showExplorer', '查看: 显示资源管理器', '⌘ / Ctrl + Shift + E', () => switchSide('explorer', true)],
        ['showScm', '查看: 源代码管理', '⌘ / Ctrl + Shift + G', () => switchSide('git', true)],
        ['showProblems', '查看: 显示问题面板', '⌘ / Ctrl + Shift + M', () => docking.showTool('problems')],
        ['showOutput', '查看: 显示输出面板', '⌘ / Ctrl + Shift + U', () => docking.showTool('output')],
        ['commit', 'Git: 提交已暂存更改', undefined, () => scm.commit()],
        ['togglePanel', '查看: 切换底部面板', '⌘ / Ctrl + J', () => docking.toggleTools()],
        ['split', '查看: 向右拆分编辑器', '⌘ / Ctrl + 反斜杠', () => docking.splitEditor()],
        ['resetLayout', '查看: 重置布局', undefined, operations['reset-layout']],
        ['closeEditor', '查看: 关闭当前编辑标签', '⌘ / Ctrl + W', closeActiveEditor],
        ['nextEditor', '查看: 打开下一个编辑器', 'Ctrl + Tab', () => cycleEditor(1)],
        ['prevEditor', '查看: 打开上一个编辑器', 'Ctrl + Shift + Tab', () => cycleEditor(-1)]
      ];
      return definitions.map(([id, label, keybinding, operation]): WorkbenchCommand => ({
        id,
        label,
        keybinding,
        run: invoke(id, operation)
      }));
    }
  });
  const releaseState = session.subscribe(render);
  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (session.state.dirty) {
      event.preventDefault();
      event.returnValue = '';
    }
  };
  window.addEventListener('beforeunload', beforeUnload);
  const ready = (async () => {
    projects = (await catalog.list()).toSorted((left, right) => right.updatedAt - left.updatedAt);
    if (disposed) return;
    if (projects.length === 0) {
      const createdAt = Date.now();
      projects = [];
      for (const demo of defaultDemos) {
        const info: WorkbenchProjectInfo = {
          id: demo.id,
          name: demo.name,
          template: demo.template.template,
          entry: demo.template.entry,
          updatedAt: createdAt
        };
        await backend.create(demo.id, {
          ...demo.template.files,
          'workbench.project.json': JSON.stringify({ template: info.template, entry: info.entry }, null, 2)
        });
        await catalog.put(info);
        projects = [...projects, info];
      }
    }
    renderProjects();
    const initial = options.initialProjectId ?? projects[0]?.id;
    if (initial) await openProject(initial);
  })()
    .catch(report)
    .finally(() => {
      initializing = false;
      if (!disposed) {
        renderStatus();
        renderActionState();
      }
    });
  return {
    ready,
    session,
    dispose() {
      if (disposed) return;
      disposed = true;
      closeContextMenu();
      releaseState();
      commands.dispose();
      scm.dispose();
      savePreview.dispose();
      for (const diff of diffs.values()) diff.view?.dispose();
      diffs.clear();
      session.dispose();
      compiler.dispose();
      preview?.dispose();
      for (const editor of editors.values()) editor.handle.dispose();
      layoutChanges.dispose();
      docking.dispose();
      for (const dialog of root.querySelectorAll<HTMLDialogElement>('dialog')) dialog.close();
      window.removeEventListener('beforeunload', beforeUnload);
      root.removeEventListener('click', click);
      root.remove();
    }
  };
}
