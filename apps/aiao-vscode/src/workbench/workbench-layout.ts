import { iconMarkup } from './workbench-icons.js';
import { workbenchStyle } from './workbench-style.js';
import { getWorkbenchDisplayMode } from './display-mode.js';

/** 创建 VS Code 风格工作台外壳，内容面板随后交给 Dockview 管理。 */
export function createWorkbenchLayout(host: HTMLElement, assetBaseURL: string): HTMLElement {
  const root = document.createElement('section');
  root.className = 'ao-workbench';
  root.dataset['displayMode'] = getWorkbenchDisplayMode(host.ownerDocument.defaultView);
  root.tabIndex = -1;
  root.setAttribute('aria-label', '浏览器开发工作台');
  const shortcutKey = /mac/i.test(host.ownerDocument.defaultView?.navigator.platform ?? '') ? '⌘' : 'Ctrl';
  const shortcutShift = shortcutKey === '⌘' ? '⌘ ⇧' : 'Ctrl + Shift';
  const setiFont = new URL('fonts/seti.woff', assetBaseURL).href;
  root.innerHTML = `<style>@font-face{font-family:seti;font-weight:normal;font-style:normal;src:url("${setiFont}") format("woff")}${workbenchStyle}</style>
    <header class="wb-title">
      <button class="wb-menu-button" data-action="title-menu" aria-label="应用程序菜单" title="应用程序菜单">${iconMarkup('menu')}</button>
      <div class="wb-brand">${iconMarkup('code')}<span>Aiao Code</span></div>
      <div class="wb-command-center">
        <div class="wb-navigation" role="group" aria-label="编辑历史">
          <button data-action="navigate-back" aria-label="后退" title="后退" disabled>${iconMarkup('arrow-left')}</button>
          <button data-action="navigate-forward" aria-label="前进" title="前进" disabled>${iconMarkup('arrow-right')}</button>
        </div>
        <div class="wb-command-search">
          <button class="wb-command-search-main" data-action="command-center" aria-label="搜索文件和命令" aria-haspopup="dialog" title="搜索文件和命令 · ${shortcutKey} P">${iconMarkup('search')}<span data-slot="workspace-label">工作区</span></button>
          <button class="wb-workspace" data-action="workspace" aria-label="工作区" aria-haspopup="menu" title="切换工作区">${iconMarkup('chevron-down')}</button>
        </div>
      </div>
      <div class="wb-title-actions">
        <button class="wb-run-button" data-action="run" title="保存全部文件并运行项目">${iconMarkup('play')}<span>运行</span></button>
        <button data-action="terminal" aria-label="打开终端" title="打开终端 · Ctrl + 反引号">${iconMarkup('terminal')}</button>
        <button data-action="commands" aria-label="命令面板" title="命令面板 · Ctrl / ⌘ + Shift + P">${iconMarkup('more')}</button>
        <span class="wb-title-divider" aria-hidden="true"></span>
        <button data-action="toggle-sidebar" aria-label="切换侧栏" aria-pressed="true" title="切换侧栏 · ${shortcutKey} B">${iconMarkup('layout-sidebar-left')}</button>
        <button data-action="reset-layout" aria-label="重置布局" title="重置工作台布局">${iconMarkup('layout')}</button>
        <button data-action="panel" aria-label="切换面板" aria-pressed="true" title="切换面板 · ${shortcutKey} J">${iconMarkup('layout-panel')}</button>
        <button data-action="preview" aria-label="打开预览" aria-pressed="true" title="打开预览">${iconMarkup('open-preview')}</button>
      </div>
    </header>
    <div class="wb-body">
      <nav class="wb-activity" aria-label="活动栏">
        <button aria-label="切换资源管理器" aria-pressed="true" data-action="explorer" title="资源管理器">${iconMarkup('files')}</button>
        <button aria-label="切换搜索" aria-pressed="false" data-action="search" title="搜索">${iconMarkup('search')}</button>
        <button aria-label="切换 Git 视图" aria-pressed="false" data-action="git" title="源代码管理">${iconMarkup('source-control')}<span class="wb-activity-badge" data-slot="scm-count" hidden>0</span></button>
        <button aria-label="扩展" aria-pressed="false" data-action="extensions" title="扩展">${iconMarkup('extensions')}</button>
        <span class="wb-spacer"></span>
        <button aria-label="GitHub 帐户" data-action="github-account" title="GitHub 帐户" hidden>${iconMarkup('account')}<span class="wb-account-badge" data-slot="account-badge" hidden></span></button>
        <button aria-label="设置" data-action="settings" title="设置">${iconMarkup('settings-gear')}</button>
      </nav>
      <main class="wb-main" data-slot="dockview" aria-label="工作区布局"></main>
    </div>
    <footer class="wb-status" aria-label="状态栏">
      <span class="wb-remote-indicator">${iconMarkup('remote')}</span>
      <button data-action="show-scm" data-slot="branch" title="源代码管理 · ⌘ / Ctrl + Shift + G">${iconMarkup('git-branch')}<span data-slot="branch-name">main</span></button>
      <button data-action="git-sync" data-slot="remote-sync" data-remote-action aria-label="同步远端更改" title="先拉取远端更改，再提交并推送暂存内容" hidden>${iconMarkup('refresh')}<span>同步更改</span></button>
      <button data-action="panel" aria-label="打开问题面板">${iconMarkup('error')}<span data-slot="problem-count">0</span>${iconMarkup('warning')}<span>0</span></button>
      <span data-slot="save-status">尚未打开项目</span><span class="wb-spacer"></span>
      <button data-action="goto-line" data-slot="cursor" title="转到行 · ⌘ / Ctrl + G">行 1，列 1</button><button data-action="indent-picker" data-slot="indent" title="选择缩进大小">空格: 2</button><span data-slot="encoding">UTF-8</span><span data-slot="language">纯文本</span>
      <button data-action="preview" aria-label="打开预览" title="打开预览">${iconMarkup('open-preview')}</button>
    </footer>
    <div data-slot="panel-staging" hidden>
      <aside class="wb-side" aria-label="资源管理器">
        <div class="wb-side-header"><h2 data-slot="side-title">资源管理器</h2>
        <div class="wb-side-actions" data-view="explorer">
          <button data-action="more-actions" aria-label="视图和更多操作…" title="视图和更多操作…">${iconMarkup('ellipsis')}</button>
        </div>
        <div class="wb-side-actions" data-view="git" hidden>
          <button data-action="commit" aria-label="提交" title="提交">${iconMarkup('check')}</button>
          <button data-action="git-pull" data-remote-action aria-label="拉取远端更改" title="拉取远端更改" hidden>${iconMarkup('cloud-download')}</button>
          <button data-action="git-sync" data-remote-action aria-label="同步远端更改" title="同步远端更改" hidden>${iconMarkup('refresh')}</button>
          <button data-action="refresh-tree" aria-label="刷新" title="刷新">${iconMarkup('refresh')}</button>
          <button data-action="more-actions" aria-label="视图和更多操作…" title="视图和更多操作…">${iconMarkup('ellipsis')}</button>
        </div>
        <div class="wb-side-actions" data-view="search" hidden>
          <button data-action="clear-search" aria-label="清除搜索结果" title="清除搜索结果">${iconMarkup('clear-all')}</button>
          <button data-action="collapse-search" aria-label="折叠全部" title="折叠全部">${iconMarkup('collapse-all')}</button>
          <button data-action="more-actions" aria-label="视图和更多操作…" title="视图和更多操作…">${iconMarkup('ellipsis')}</button>
        </div></div>
        <div class="wb-tree" data-slot="files" role="tree" aria-label="项目文件树"></div>
        <div data-slot="search-view" hidden></div>
        <div data-slot="extensions-view" hidden></div>
        <div data-slot="git-view" hidden>
          <div data-slot="scm"></div>
          <details class="wb-history" data-scm-group="history">
            <summary class="wb-history-header"><span class="wb-history-chevron">${iconMarkup('chevron-right')}</span>提交历史</summary>
            <div data-slot="history"></div>
          </details>
        </div>
      </aside>
      <template data-slot="welcome"><div class="wb-welcome"><span class="wb-welcome-mark">${iconMarkup('code')}</span><h2>Aiao Code</h2><p>打开一个文件开始编辑</p><div><span>保存文件</span><kbd>${shortcutKey} S</kbd></div><div><span>快速打开文件</span><kbd>${shortcutKey} P</kbd></div><div><span>在文件中搜索</span><kbd>${shortcutShift} F</kbd></div><div><span>命令面板</span><kbd>${shortcutShift} P</kbd></div><div><span>拖动标签即可拆分编辑器</span></div></div></template>
      <section class="wb-preview" aria-label="项目预览"><div class="wb-preview-toolbar">${iconMarkup('globe')}<span>本地项目预览</span><span class="wb-preview-version">尚未运行</span><button data-action="rerun-preview" aria-label="重新运行预览" title="重新运行">${iconMarkup('refresh')}</button></div><div class="wb-preview-content"></div></section>
      <section class="wb-panel" data-log="problems" aria-label="底部面板"><div class="wb-panel-toolbar"><span>问题</span><span class="wb-spacer"></span><button data-action="clear-logs" aria-label="清空问题" title="清空">${iconMarkup('clear-all')}</button></div><div class="wb-panel-content" role="log" aria-live="polite"></div></section>
      <section class="wb-panel" data-log="output" aria-label="输出"><div class="wb-panel-toolbar"><span>工作台</span><span class="wb-spacer"></span><button data-action="clear-logs" aria-label="清空输出" title="清空">${iconMarkup('clear-all')}</button></div><div class="wb-panel-content" role="log"></div></section>
      <section class="wb-panel" data-log="console" aria-label="Console"><div class="wb-panel-toolbar"><span>预览控制台</span><span class="wb-spacer"></span><button data-action="clear-logs" aria-label="清空控制台" title="清空">${iconMarkup('clear-all')}</button></div><div class="wb-panel-content" role="log"></div></section>
      <section class="wb-panel" data-log="terminal" aria-label="终端"></section>
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
