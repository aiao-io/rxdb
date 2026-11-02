import { workbenchStyle } from './workbench-style.js';

/** 创建共享工作台的静态布局，项目内容随后仅用文本节点填充。 */
export function createWorkbenchLayout(host: HTMLElement): HTMLElement {
  const root = document.createElement('section');
  root.className = 'ao-workbench';
  root.setAttribute('aria-label', '浏览器开发工作台');
  root.innerHTML = `<style>${workbenchStyle}</style>
    <header class="wb-title"><span class="wb-title-logo" aria-hidden="true">◈</span><span class="wb-title-name">Aiao Code</span><select class="wb-projects" aria-label="当前项目"><option value="">选择项目</option></select><span class="wb-spacer"></span><button data-action="new-project">新建项目</button><button data-action="import">导入</button><button data-action="export">导出</button><button data-action="save" title="Ctrl / ⌘ + S">保存</button><button class="wb-primary" data-action="run" title="Ctrl / ⌘ + Enter">▷ 运行</button></header>
    <div class="wb-body"><nav class="wb-activity" aria-label="活动栏"><button aria-label="切换资源管理器" aria-pressed="true" data-action="explorer" title="资源管理器">▤</button><button aria-label="切换 Git 视图" aria-pressed="false" data-action="git" title="源代码管理">⑂</button><span class="wb-spacer"></span><button aria-label="切换底部面板" data-action="panel" title="底部面板">▣</button></nav>
    <aside class="wb-side" aria-label="资源管理器"><div class="wb-side-header"><h2 data-slot="side-title">资源管理器</h2><span><button data-action="new-file" aria-label="新建文件">＋</button><button data-action="rename" aria-label="重命名当前文件">✎</button><button data-action="delete" aria-label="删除当前文件">×</button></span></div><div class="wb-tree" data-slot="files" role="tree" aria-label="项目文件树"></div><div data-slot="git-view" hidden><form class="wb-git-form"><label for="wb-commit-message">提交说明</label><input id="wb-commit-message" name="message" autocomplete="off" placeholder="描述本次修改"><button class="wb-primary" data-action="commit" type="submit">提交已暂存内容</button><button data-action="stage-all" type="button">暂存全部已保存修改</button><button data-action="discard" type="button">丢弃编辑缓冲…</button></form><div class="wb-git-list" data-slot="changes"></div><div class="wb-history"><h2>提交历史</h2><div data-slot="history"></div></div></div></aside>
    <div class="wb-divider" data-resize="sidebar" role="separator" aria-label="调整侧栏宽度" aria-orientation="vertical" tabindex="0"></div>
    <main class="wb-main"><div class="wb-workspace"><div class="wb-edit-group"><div class="wb-tabs" role="tablist" aria-label="编辑标签"></div><div class="wb-editor-area"><p class="wb-editor-placeholder">新建或打开项目，开始本地开发。</p></div></div><div class="wb-preview" aria-label="项目预览"><div class="wb-preview-header"><span>预览</span><span class="wb-preview-version">尚未运行</span></div><div class="wb-preview-content"></div></div></div><div class="wb-panel-divider" data-resize="panel" role="separator" aria-label="调整底部面板高度" aria-orientation="horizontal" tabindex="0"></div><section class="wb-panel" aria-label="底部面板"><div class="wb-panel-tabs" role="tablist"><button role="tab" aria-selected="true" data-panel="problems">问题</button><button role="tab" aria-selected="false" data-panel="output">输出</button><button role="tab" aria-selected="false" data-panel="console">Console</button><span class="wb-spacer"></span><button data-action="clear-logs" aria-label="清空面板">清空</button><button data-action="panel" aria-label="关闭底部面板">×</button></div><div class="wb-panel-content" role="log" aria-live="polite"></div></section></main></div>
    <footer class="wb-status" aria-label="状态栏"><span data-slot="branch">⑂ main</span><span data-slot="save-status">尚未打开项目</span><span class="wb-spacer"></span><span data-slot="cursor">行 1，列 1</span><span data-slot="language">纯文本</span><span>UTF-8</span><button data-action="panel" aria-label="打开问题面板">⚠ <span data-slot="problem-count">0</span></button></footer>`;
  const commitInput = root.querySelector<HTMLInputElement>('[name="message"]');
  const commitLabel = root.querySelector<HTMLLabelElement>('label');
  if (commitInput && commitLabel) {
    commitInput.id = `wb-message-${crypto.randomUUID()}`;
    commitLabel.htmlFor = commitInput.id;
  }
  host.replaceChildren(root);
  return root;
}

/** 在已知静态布局中定位必需元素。 */
export function workbenchElement<T extends HTMLElement = HTMLElement>(root: HTMLElement, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`工作台布局缺少 ${selector}`);
  return element;
}
