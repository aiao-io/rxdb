import { iconMarkup } from './workbench-icons.js';
import { workbenchStyle } from './workbench-style.js';

/** 创建 VS Code 风格工作台外壳，内容面板随后交给 Dockview 管理。 */
export function createWorkbenchLayout(host: HTMLElement, assetBaseURL: string): HTMLElement {
  const root = document.createElement('section');
  root.className = 'ao-workbench';
  root.tabIndex = -1;
  root.setAttribute('aria-label', '浏览器开发工作台');
  const shortcutKey = /mac/i.test(host.ownerDocument.defaultView?.navigator.platform ?? '') ? '⌘' : 'Ctrl';
  const shortcutShift = shortcutKey === '⌘' ? '⌘ ⇧' : 'Ctrl + Shift';
  root.innerHTML = `<style>${workbenchStyle}</style>
    <header class="wb-title">
      <div class="wb-brand">${iconMarkup('code')}<span>Aiao Code</span></div>
      <div class="wb-command-center"><button data-action="quick-open" aria-label="快速打开文件" title="快速打开文件 · Ctrl / ⌘ + P">${iconMarkup('search')}</button><select class="wb-projects" aria-label="当前项目"><option value="">选择项目</option></select>${iconMarkup('chevron-down')}</div>
      <div class="wb-title-actions">
        <button data-action="new-project" title="新建项目">${iconMarkup('add')}<span>新建项目</span></button>
        <button data-action="import" title="导入项目">${iconMarkup('cloud-download')}<span>导入</span></button>
        <button data-action="export" title="导出项目">${iconMarkup('cloud-upload')}<span>导出</span></button>
        <button data-action="save" title="保存当前文件并预览 · Ctrl / ⌘ + S">${iconMarkup('save')}<span>保存</span></button>
        <button class="wb-run-button" data-action="run" title="保存全部文件并运行项目">${iconMarkup('play')}<span>运行</span></button>
        <button data-action="commands" aria-label="命令面板" title="命令面板 · Ctrl / ⌘ + Shift + P">${iconMarkup('more')}</button>
      </div>
    </header>
    <div class="wb-body">
      <nav class="wb-activity" aria-label="活动栏">
        <button aria-label="切换资源管理器" aria-pressed="true" data-action="explorer" title="资源管理器">${iconMarkup('files')}</button>
        <button aria-label="切换 Git 视图" aria-pressed="false" data-action="git" title="源代码管理">${iconMarkup('source-control')}<span class="wb-activity-badge" data-slot="scm-count" hidden>0</span></button>
        <span class="wb-spacer"></span>
        <button aria-label="切换底部面板" data-action="panel" title="切换面板">${iconMarkup('layout-panel')}</button>
        <button aria-label="重置布局" data-action="reset-layout" title="重置工作台布局">${iconMarkup('layout')}</button>
      </nav>
      <main class="wb-main" data-slot="dockview" aria-label="工作区布局"></main>
    </div>
    <footer class="wb-status" aria-label="状态栏">
      <span class="wb-remote-indicator">${iconMarkup('remote')}</span>
      <button data-action="show-scm" data-slot="branch" title="源代码管理 · ⌘ / Ctrl + Shift + G">${iconMarkup('git-branch')}<span data-slot="branch-name">main</span></button>
      <button data-action="panel" aria-label="打开问题面板">${iconMarkup('error')}<span data-slot="problem-count">0</span>${iconMarkup('warning')}<span>0</span></button>
      <span data-slot="save-status">尚未打开项目</span><span class="wb-spacer"></span>
      <button data-action="goto-line" data-slot="cursor" title="转到行 · ⌘ / Ctrl + G">行 1，列 1</button><button data-action="indent-picker" data-slot="indent" title="选择缩进大小">空格: 2</button><span>UTF-8</span><span data-slot="language">纯文本</span>
      <button data-action="preview" aria-label="打开预览" title="打开预览">${iconMarkup('open-preview')}</button>
    </footer>
    <div data-slot="panel-staging" hidden>
      <aside class="wb-side" aria-label="资源管理器">
        <div class="wb-side-header"><h2 data-slot="side-title">资源管理器</h2>
        <div class="wb-side-actions" data-view="explorer">
          <button data-action="new-file" aria-label="新建文件" title="新建文件">${iconMarkup('new-file')}</button>
          <button data-action="refresh-tree" aria-label="刷新资源管理器" title="刷新资源管理器">${iconMarkup('refresh')}</button>
          <button data-action="collapse-tree" aria-label="折叠资源管理器中的文件夹" title="折叠资源管理器中的文件夹">${iconMarkup('collapse-all')}</button>
          <button data-action="more-actions" aria-label="视图和更多操作…" title="视图和更多操作…">${iconMarkup('ellipsis')}</button>
        </div>
        <div class="wb-side-actions" data-view="git" hidden>
          <button data-action="refresh-tree" aria-label="刷新" title="刷新">${iconMarkup('refresh')}</button>
          <button data-action="more-actions" aria-label="视图和更多操作…" title="视图和更多操作…">${iconMarkup('ellipsis')}</button>
        </div></div>
        <div class="wb-tree" data-slot="files" role="tree" aria-label="项目文件树"></div>
        <div data-slot="git-view" hidden>
          <div data-slot="scm"></div>
          <details class="wb-history" data-scm-group="history">
            <summary class="wb-history-header"><span class="wb-history-chevron">${iconMarkup('chevron-right')}</span>提交历史</summary>
            <div data-slot="history"></div>
          </details>
        </div>
      </aside>
      <div class="wb-welcome"><span class="wb-welcome-mark">${iconMarkup('code')}</span><h2>Aiao Code</h2><p>打开一个文件开始编辑</p><div><span>保存文件</span><kbd>${shortcutKey} S</kbd></div><div><span>快速打开文件</span><kbd>${shortcutKey} P</kbd></div><div><span>命令面板</span><kbd>${shortcutShift} P</kbd></div><div><span>拖动标签即可拆分编辑器</span></div></div>
      <section class="wb-preview" aria-label="项目预览"><div class="wb-preview-toolbar">${iconMarkup('globe')}<span>本地项目预览</span><span class="wb-preview-version">尚未运行</span><button data-action="rerun-preview" aria-label="重新运行预览" title="重新运行">${iconMarkup('refresh')}</button></div><div class="wb-preview-content"></div></section>
      <section class="wb-panel" data-log="problems" aria-label="底部面板"><div class="wb-panel-toolbar"><span>问题</span><span class="wb-spacer"></span><button data-action="clear-logs" aria-label="清空问题" title="清空">${iconMarkup('clear-all')}</button></div><div class="wb-panel-content" role="log" aria-live="polite"></div></section>
      <section class="wb-panel" data-log="output" aria-label="输出"><div class="wb-panel-toolbar"><span>工作台</span><span class="wb-spacer"></span><button data-action="clear-logs" aria-label="清空输出" title="清空">${iconMarkup('clear-all')}</button></div><div class="wb-panel-content" role="log"></div></section>
      <section class="wb-panel" data-log="console" aria-label="Console"><div class="wb-panel-toolbar"><span>预览控制台</span><span class="wb-spacer"></span><button data-action="clear-logs" aria-label="清空控制台" title="清空">${iconMarkup('clear-all')}</button></div><div class="wb-panel-content" role="log"></div></section>
    </div>`;
  for (const name of ['dockview', 'codicon']) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = new URL(`styles/${name}.css`, assetBaseURL).href;
    link.dataset['workbenchStyles'] = name;
    root.prepend(link);
  }
  host.replaceChildren(root);
  return root;
}

/** 在已知工作台面板中定位必需元素。 */
export function workbenchElement<T extends HTMLElement = HTMLElement>(root: HTMLElement, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`工作台布局缺少 ${selector}`);
  return element;
}
