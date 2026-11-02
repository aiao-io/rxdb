import { createProjectCatalog, type WorkbenchCatalog, type WorkbenchProjectInfo } from './catalog.js';
import { createCompiler, type WorkbenchCompiler } from './compiler-client.js';
import type { ProjectTemplate } from './compiler/compiler-types.js';
import type { WorkbenchEditorHandle, WorkbenchEditorMount } from './editor.js';
import { createGitBackend } from './git-backend.js';
import { mountPreview, type PreviewEvent } from './preview/preview-sandbox.js';
import { WorkbenchSession, type WorkbenchBackend, type WorkbenchState } from './session.js';
import { angularTemplate, defaultAngularDemo } from './templates-angular.js';
import { defaultFrontendDemos, frontendTemplates, type WorkbenchTemplate } from './templates.js';
import { requestWorkbenchText } from './workbench-dialog.js';
import { createWorkbenchDockview } from './workbench-dockview.js';
import { createCodicon, createFileIcon, folderCodicon, gitStatusCodicon } from './workbench-icons.js';
import { createWorkbenchLayout, workbenchElement } from './workbench-layout.js';

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
const messageFor = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause));

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
  const editors = new Map<string, { host: HTMLElement; handle: WorkbenchEditorHandle }>();
  const aborters = new Set<AbortController>();
  const logs: { kind: 'problems' | 'output' | 'console'; text: string; level?: string }[] = [];
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
  const collapsedFolders = new Set<string>();
  const docking = createWorkbenchDockview(root, {
    onSelectEditor(path) {
      if (disposed || !session.state.tabs.includes(path)) return;
      if (session.state.activePath !== path) session.select(path);
      queueMicrotask(() => {
        if (!disposed) editors.get(path)?.handle.focus?.();
      });
    },
    onCloseEditor(path) {
      if (!disposed) session.closeTab(path);
    },
    onSelectTool() {
      renderLogs();
    },
    onClosePreview() {
      preview?.dispose();
      preview = undefined;
      previewId = 0;
    }
  });
  const layoutChanges = docking.api.onDidLayoutChange(() => {
    queueMicrotask(() => {
      if (!disposed) editors.forEach(editor => editor.handle.layout?.());
    });
  });

  function report(cause: unknown): void {
    if (cause instanceof DOMException && cause.name === 'AbortError') return;
    log('problems', messageFor(cause), 'error');
  }
  function cancelCompilation(): void {
    for (const controller of aborters) controller.abort();
  }
  function log(kind: 'problems' | 'output' | 'console', text: string, level?: string): void {
    if (disposed) return;
    logs.push({ kind, text: text.slice(0, 20_000), level });
    if (logs.length > 400) logs.shift();
    renderLogs();
  }
  function renderLogs(): void {
    for (const kind of ['problems', 'output', 'console']) {
      const content = logContents.get(kind)!;
      content.replaceChildren();
      for (const item of logs.filter(item => item.kind === kind)) {
        const line = document.createElement('pre');
        line.textContent = item.text;
        if (item.level) line.className = `wb-log-${item.level}`;
        content.append(line);
      }
    }
    element('[data-slot="problem-count"]').textContent = String(logs.filter(item => item.kind === 'problems').length);
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
  async function refreshGit(): Promise<void> {
    if (!project || disposed) return;
    const id = project.id;
    const request = ++gitRefresh;
    const [status, commits] = await Promise.all([backend.status(id), backend.history(id)]);
    if (disposed || project?.id !== id || request !== gitRefresh) return;
    element('[data-slot="branch-name"]').textContent = status.branch;
    const changes = element('[data-slot="changes"]');
    changes.replaceChildren();
    for (const entry of status.entries) {
      const row = document.createElement('div');
      row.className = 'wb-change';
      const name = document.createElement('code');
      name.textContent = `${entry.index}${entry.worktree} ${entry.path}`;
      name.title = entry.path;
      const stage = document.createElement('button');
      stage.append(createCodicon('add'));
      stage.title = `暂存 ${entry.path}`;
      stage.dataset['mutation'] = 'true';
      stage.onclick = () =>
        action(async () => {
          await backend.stage(id, [entry.path]);
          await refreshGit();
        });
      row.append(createCodicon(gitStatusCodicon(`${entry.index}${entry.worktree}`)), name, stage);
      changes.append(row);
    }
    const history = element('[data-slot="history"]');
    history.replaceChildren();
    for (const commit of commits) {
      const button = document.createElement('button');
      button.textContent = `${commit.oid.slice(0, 7)} ${commit.message}`;
      button.title = '将此提交恢复成工作区差异，保留 HEAD 与暂存区';
      button.dataset['mutation'] = 'true';
      button.onclick = () =>
        action(async () => {
          const confirmation = await requestWorkbenchText(root, '输入 RESTORE 确认恢复为工作区差异');
          if (confirmation !== 'RESTORE') return;
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
    await session.open(id);
    if (disposed || session.state.projectId !== id) return;
    const opened = { ...next, updatedAt: Date.now() };
    project = opened;
    projects = projects.map(item => (item.id === id ? opened : item));
    renderProjects();
    await catalog.put(opened).catch(report);
    await refreshGit();
    log('output', `已打开 ${next.name}`);
  }
  function renderFiles(state: WorkbenchState): void {
    const tree = element('[data-slot="files"]');
    tree.replaceChildren();
    if (state.activePath !== activeTreePath) {
      activeTreePath = state.activePath;
      const parts = state.activePath?.split('/') ?? [];
      parts.slice(0, -1).forEach((_, index) => collapsedFolders.delete(parts.slice(0, index + 1).join('/')));
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
          if (collapsedFolders.has(folder)) collapsedFolders.delete(folder);
          else collapsedFolders.add(folder);
          renderFiles(session.state);
        };
        tree.append(button);
      }
      if (parents.some(parent => collapsedFolders.has(parent))) continue;
      const button = document.createElement('button');
      button.className = 'wb-file';
      button.setAttribute('aria-current', String(path === state.activePath));
      button.setAttribute('role', 'treeitem');
      button.setAttribute('aria-level', String(parts.length));
      button.style.paddingLeft = `${14 + (parts.length - 1) * 12}px`;
      button.title = path;
      const icon = createFileIcon(path);
      const name = document.createElement('span');
      name.textContent = parts.at(-1) ?? path;
      button.append(icon, name);
      button.onclick = () => {
        session.select(path);
        docking.selectEditor(path);
        editors.get(path)?.handle.focus?.();
      };
      tree.append(button);
    }
  }
  function renderEditors(state: WorkbenchState): void {
    if (state.projectId !== renderedProjectId) {
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
      docking.setEditorTitle(path, `${path.split('/').at(-1)}${session.isModified(path) ? ' •' : ''}`);
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
  }
  function render(state: WorkbenchState): void {
    renderFiles(state);
    renderEditors(state);
    element('[data-slot="save-status"]').textContent =
      state.busy ? '处理中…'
      : state.dirty ? '未保存'
      : state.projectId ? `已保存 · r${state.revision}`
      : '尚未打开项目';
    element('[data-slot="language"]').textContent = state.activePath ? languageFor(state.activePath) : '纯文本';
    renderActionState();
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
    previewVersion.textContent =
      state.preview ?
        `r${state.preview.revision}${state.dirty || state.preview.revision !== state.revision ? ' · 已过时' : ''}`
      : '尚未运行';
    if (state.error && logs.at(-1)?.text !== state.error) report(state.error);
  }
  function renderActionState(): void {
    for (const button of root.querySelectorAll<HTMLElement>('[data-action="explorer"],[data-action="git"]')) {
      button.setAttribute('aria-pressed', String(docking.isSidebarVisible() && button.dataset['action'] === sideView));
    }
    const busy = initializing || session.state.busy || pendingOperations > 0;
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
    element<HTMLSelectElement>('.wb-projects').disabled = busy && aborters.size === 0;
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
    await catalog.put(info).catch(report);
    await refreshGit();
    log('output', `已创建 ${name} · ${template.title}`);
  }
  async function run(): Promise<void> {
    const info = project;
    if (!info) throw new Error('请先打开项目');
    docking.showPreview();
    for (const controller of aborters) controller.abort();
    const controller = new AbortController();
    aborters.add(controller);
    try {
      await session.run(snapshot =>
        compiler.compile(
          { files: { ...snapshot.files }, template: info.template, entry: info.entry },
          controller.signal
        )
      );
      await refreshGit();
    } finally {
      aborters.delete(controller);
    }
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
    save: async () => {
      await session.save();
      await refreshGit();
    },
    'new-file': async () => {
      projectId();
      const path = await requestWorkbenchText(root, '文件路径', 'src/new.ts');
      if (!path) return;
      if (path in session.state.files) throw new Error('文件已存在');
      session.edit(path, '');
      session.select(path);
    },
    rename: async () => {
      const path = session.state.activePath;
      if (!path) return;
      const to = await requestWorkbenchText(root, '重命名文件', path);
      if (to && to !== path) {
        cancelCompilation();
        await session.rename(path, to);
        await refreshGit();
      }
    },
    delete: async () => {
      const path = session.state.activePath;
      if (!path) return;
      const confirmation = await requestWorkbenchText(root, `输入 DELETE 确认删除 ${path}`);
      if (confirmation === 'DELETE') {
        cancelCompilation();
        await session.remove(path);
        await refreshGit();
      }
    },
    'stage-all': async () => {
      if (session.state.dirty) throw new Error('请先保存文件再暂存');
      const id = projectId();
      const status = await backend.status(id);
      await backend.stage(
        id,
        status.entries.map(entry => entry.path)
      );
      await refreshGit();
    },
    commit: async () => {
      if (session.state.dirty) throw new Error('存在未保存内容，请先保存');
      const input = element<HTMLInputElement>('[name="message"]');
      if (!input.value.trim()) throw new Error('请填写提交说明');
      const message = input.value.trim();
      const oid = await backend.commit(projectId(), message);
      if (input.value.trim() === message) input.value = '';
      await refreshGit();
      log('output', `已提交 ${oid.slice(0, 7)}`);
    },
    discard: async () => {
      if ((await requestWorkbenchText(root, '输入 DISCARD 确认丢弃未保存编辑')) === 'DISCARD') session.discard();
    },
    'clear-logs': () => {
      logs.splice(0);
      renderLogs();
    },
    panel: () => docking.toggleTools(),
    preview: () => {
      docking.showPreview();
      render(session.state);
    },
    'reset-layout': () => {
      docking.resetLayout();
      render(session.state);
    }
  };
  function switchSide(view: string): void {
    const visible = !(sideView === view && docking.isSidebarVisible());
    docking.setSidebarVisible(visible);
    sideView = view;
    element('[data-slot="files"]').hidden = view !== 'explorer';
    element('[data-slot="git-view"]').hidden = view !== 'git';
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
  const submit = (event: Event) => {
    event.preventDefault();
    action(operations['commit']);
  };
  element('form').addEventListener('submit', submit);
  const select = element<HTMLSelectElement>('.wb-projects');
  select.onchange = () =>
    action(async () => {
      try {
        await openProject(select.value);
      } finally {
        renderProjects();
      }
    });
  const keydown = (event: KeyboardEvent) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    if (event.key.toLowerCase() === 's') {
      event.preventDefault();
      action(operations['save']);
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      action(run);
    }
  };
  root.addEventListener('keydown', keydown);
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
      if (!disposed) renderActionState();
    });
  return {
    ready,
    session,
    dispose() {
      if (disposed) return;
      disposed = true;
      releaseState();
      session.dispose();
      compiler.dispose();
      preview?.dispose();
      for (const controller of aborters) controller.abort();
      for (const editor of editors.values()) editor.handle.dispose();
      layoutChanges.dispose();
      docking.dispose();
      for (const dialog of root.querySelectorAll<HTMLDialogElement>('dialog')) dialog.close();
      window.removeEventListener('beforeunload', beforeUnload);
      root.removeEventListener('click', click);
      root.removeEventListener('keydown', keydown);
      root.remove();
    }
  };
}
