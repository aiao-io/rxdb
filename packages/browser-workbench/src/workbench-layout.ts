import { iconMarkup } from './workbench-icons.js';
import { workbenchStyle } from './workbench-style.js';

/** 创建工作台外壳，内容面板随后交给 Dockview 管理。 */
export function createWorkbenchLayout(host: HTMLElement, assetBaseURL: string): HTMLElement {
  const root = document.createElement('section');
  root.className = 'ao-workbench';
  root.setAttribute('aria-label', '浏览器开发工作台');
  root.innerHTML = `<style>${workbenchStyle}</style>
    <header class="wb-title">
      <div class="wb-brand">${iconMarkup('code')}<span>Aiao Code</span></div>
      <div class="wb-command-center">${iconMarkup('search')}<select class="wb-projects" aria-label="当前项目"><option value="">选择项目</option></select>${iconMarkup('chevron-down')}</div>
      <div class="wb-title-actions">
        <button data-action="new-project" title="新建项目">${iconMarkup('add')}<span>新建项目</span></button>
        <button data-action="import" title="导入项目">${iconMarkup('cloud-download')}<span>导入</span></button>
        <button data-action="export" title="导出项目">${iconMarkup('cloud-upload')}<span>导出</span></button>
        <button data-action="save" title="保存 · Ctrl / ⌘ + S">${iconMarkup('save')}<span>保存</span></button>
        <button class="wb-run-button" data-action="run" title="运行 · Ctrl / ⌘ + Enter">${iconMarkup('play')}<span>运行</span></button>
      </div>
    </header>
    <div class="wb-body">
      <nav class="wb-activity" aria-label="活动栏">
        <button aria-label="切换资源管理器" aria-pressed="true" data-action="explorer" title="资源管理器">${iconMarkup('files')}</button>
        <button aria-label="切换 Git 视图" aria-pressed="false" data-action="git" title="源代码管理">${iconMarkup('source-control')}</button>
        <span class="wb-spacer"></span>
        <button aria-label="切换底部面板" data-action="panel" title="切换面板">${iconMarkup('layout-panel')}</button>
        <button aria-label="重置布局" data-action="reset-layout" title="重置工作台布局">${iconMarkup('layout')}</button>
      </nav>
      <main class="wb-main" data-slot="dockview" aria-label="工作区布局"></main>
    </div>
    <footer class="wb-status" aria-label="状态栏">
      <span class="wb-remote-indicator">${iconMarkup('remote')}</span>
      <span data-slot="branch">${iconMarkup('git-branch')}<span data-slot="branch-name">main</span></span>
      <button data-action="panel" aria-label="打开问题面板">${iconMarkup('error')}<span data-slot="problem-count">0</span>${iconMarkup('warning')}<span>0</span></button>
      <span data-slot="save-status">尚未打开项目</span><span class="wb-spacer"></span>
      <span data-slot="cursor">行 1，列 1</span><span>空格: 2</span><span>UTF-8</span><span data-slot="language">纯文本</span>
      <button data-action="preview" aria-label="打开预览" title="打开预览">${iconMarkup('open-preview')}</button>
    </footer>
    <div data-slot="panel-staging" hidden>
      <aside class="wb-side" aria-label="资源管理器">
        <div class="wb-side-header"><h2 data-slot="side-title">资源管理器</h2><div class="wb-side-actions">
          <button data-action="new-file" aria-label="新建文件" title="新建文件">${iconMarkup('new-file')}</button>
          <button data-action="rename" aria-label="重命名当前文件" title="重命名">${iconMarkup('edit')}</button>
          <button data-action="delete" aria-label="删除当前文件" title="删除">${iconMarkup('trash')}</button>
        </div></div>
        <div class="wb-tree" data-slot="files" role="tree" aria-label="项目文件树"></div>
        <div data-slot="git-view" hidden>
          <form class="wb-git-form"><label for="wb-commit-message">提交说明</label><input id="wb-commit-message" name="message" autocomplete="off" placeholder="消息（提交已暂存的更改）"><button class="wb-primary" data-action="commit" type="submit">${iconMarkup('check')}提交已暂存内容</button><button data-action="stage-all" type="button">${iconMarkup('add')}暂存全部已保存修改</button><button data-action="discard" type="button">丢弃编辑缓冲…</button></form>
          <div class="wb-git-section"><h3>更改</h3><div class="wb-git-list" data-slot="changes"></div></div>
          <div class="wb-history"><h3>提交历史</h3><div data-slot="history"></div></div>
        </div>
      </aside>
      <div class="wb-welcome"><span class="wb-welcome-mark">${iconMarkup('code')}</span><h2>Aiao Code</h2><p>打开一个文件开始编辑</p><div><span>保存文件</span><kbd>⌘ S</kbd></div><div><span>运行项目</span><kbd>⌘ ↵</kbd></div><div><span>拖动标签即可拆分编辑器</span></div></div>
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
  const commitInput = root.querySelector<HTMLInputElement>('[name="message"]');
  const commitLabel = root.querySelector<HTMLLabelElement>('label');
  if (commitInput && commitLabel) {
    commitInput.id = `wb-message-${crypto.randomUUID()}`;
    commitLabel.htmlFor = commitInput.id;
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
