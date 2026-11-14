import { MARKDOWN_EXTENSION, type ExtensionInstallationState } from './extension-management.js';
import type { MarkdownExtensionStatus } from './markdown-extension.js';

const labels: Readonly<Record<MarkdownExtensionStatus, string>> = {
  uninstalled: '未安装',
  disabled: '已禁用',
  idle: '已启用 · 首次使用时加载',
  loading: '正在加载扩展…',
  active: '已激活',
  failed: '加载失败'
};

interface ExtensionViewState extends ExtensionInstallationState {
  readonly status: MarkdownExtensionStatus;
  readonly markdown: boolean;
}

interface ExtensionViewOptions {
  onToggle(): void;
  onInstall(): void;
  onUninstall(): void;
  onPreview(): void;
}

/** 扩展目录与已安装状态共享搜索、安装、卸载和运行入口。 */
export function mountMarkdownExtensionView(host: HTMLElement, options: ExtensionViewOptions) {
  const view = document.createElement('div');
  view.className = 'wb-extensions';
  view.innerHTML = `<div class="wb-extension-search"><input type="search" data-extension-search aria-label="搜索扩展" placeholder="搜索扩展"><button type="button" data-extension-clear aria-label="清除扩展搜索" title="清除扩展搜索"><span class="codicon codicon-clear-all"></span></button></div><div class="wb-extension-filters" role="group" aria-label="筛选扩展"><button type="button" data-extension-filter="@installed">已安装</button><button type="button" data-extension-filter="@enabled">已启用</button><button type="button" data-extension-filter="@disabled">已禁用</button><button type="button" data-extension-filter="@available">可安装</button></div><h3 class="wb-extension-group" data-extension-group></h3><div role="list" aria-label="扩展"><section class="wb-extension-details" role="listitem" aria-label="${MARKDOWN_EXTENSION.name} 扩展"><div class="wb-extension-heading"><span class="codicon codicon-markdown"></span><h3>${MARKDOWN_EXTENSION.name}</h3></div><p class="wb-extension-publisher">${MARKDOWN_EXTENSION.publisher} · ${MARKDOWN_EXTENSION.version}</p><p>Markdown 实时预览，支持 HTML、Mermaid 和数学公式。</p><p data-extension-status role="status"></p><div class="wb-extension-actions"><button type="button" data-extension-install>安装</button><button type="button" data-extension-toggle></button><button type="button" data-extension-uninstall>卸载</button><button type="button" data-extension-preview>打开侧边预览</button></div><p>打开 Markdown 文件，使用编辑器标题栏预览按钮、右键菜单，或 Ctrl / ⌘ + K V。</p><p data-extension-error role="alert" hidden></p></section></div><p class="wb-extension-empty" data-extension-empty role="status" hidden>未找到扩展</p>`;
  const element = <T extends HTMLElement>(selector: string) => view.querySelector<T>(selector)!;
  const section = element<HTMLElement>('.wb-extension-details');
  const search = element<HTMLInputElement>('[data-extension-search]');
  const clear = element<HTMLButtonElement>('[data-extension-clear]');
  const install = element<HTMLButtonElement>('[data-extension-install]');
  const uninstall = element<HTMLButtonElement>('[data-extension-uninstall]');
  const toggle = element<HTMLButtonElement>('[data-extension-toggle]');
  const preview = element<HTMLButtonElement>('[data-extension-preview]');
  const status = element<HTMLElement>('[data-extension-status]');
  const error = element<HTMLElement>('[data-extension-error]');
  const filters = [...view.querySelectorAll<HTMLButtonElement>('[data-extension-filter]')];
  let state: ExtensionViewState;

  function matches(term: string): boolean {
    if (term === '@installed') return state.installed;
    if (term === '@enabled') return state.installed && state.enabled;
    if (term === '@disabled') return state.installed && !state.enabled;
    if (term === '@available') return !state.installed;
    if (term.startsWith('@id:')) return MARKDOWN_EXTENSION.id === term.slice(4);
    return `${MARKDOWN_EXTENSION.name} ${MARKDOWN_EXTENSION.id} Markdown 实时预览 HTML Mermaid 数学公式`
      .toLowerCase()
      .includes(term);
  }
  function filter(): void {
    const terms = search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const visible = terms.every(matches);
    section.hidden = !visible;
    element('[data-extension-empty]').hidden = visible;
    element('[data-extension-group]').textContent = `${state.installed ? '已安装' : '可安装'}  ${Number(visible)}`;
    clear.disabled = !search.value;
    for (const button of filters)
      button.setAttribute('aria-pressed', String(terms.includes(button.dataset['extensionFilter']!)));
  }
  toggle.onclick = options.onToggle;
  install.onclick = options.onInstall;
  uninstall.onclick = options.onUninstall;
  preview.onclick = options.onPreview;
  search.oninput = filter;
  clear.onclick = () => {
    search.value = '';
    filter();
    search.focus();
  };
  for (const button of filters)
    button.onclick = () => {
      search.value = button.dataset['extensionFilter']!;
      filter();
      search.focus();
    };
  host.replaceChildren(view);
  return {
    render(next: ExtensionViewState): void {
      state = next;
      const busy = state.operation !== null;
      status.textContent =
        state.operation === 'installing' ? '正在安装…'
        : state.operation === 'uninstalling' ? '正在卸载…'
        : labels[state.status];
      status.dataset['extensionStatus'] = state.operation ?? state.status;
      section.setAttribute('aria-busy', String(busy));
      install.hidden = state.installed;
      install.disabled = busy;
      install.textContent = state.operation === 'installing' ? '正在安装…' : '安装';
      install.setAttribute('aria-label', `安装 ${MARKDOWN_EXTENSION.name}`);
      toggle.hidden = !state.installed;
      toggle.disabled = busy;
      toggle.textContent = state.enabled ? '禁用' : '启用';
      toggle.setAttribute('aria-label', `${toggle.textContent} ${MARKDOWN_EXTENSION.name}`);
      uninstall.hidden = !state.installed;
      uninstall.disabled = busy;
      uninstall.setAttribute('aria-label', `卸载 ${MARKDOWN_EXTENSION.name}`);
      preview.hidden = !state.installed;
      preview.disabled = busy || !state.enabled || !state.markdown || state.status === 'loading';
      error.textContent = state.error;
      error.hidden = !state.error;
      filter();
    },
    focus(): void {
      search.focus();
    },
    dispose(): void {
      for (const button of [toggle, install, uninstall, preview, clear, ...filters]) button.onclick = null;
      search.oninput = null;
      view.remove();
    }
  };
}
