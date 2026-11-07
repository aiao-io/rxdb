import type { MarkdownExtensionStatus } from './markdown-extension.js';

const labels: Readonly<Record<MarkdownExtensionStatus, string>> = {
  disabled: '已禁用', idle: '已启用 · 首次使用时加载', loading: '正在加载扩展…', active: '已激活', failed: '加载失败'
};

/** 已安装插件的状态和启停入口。 */
export function mountMarkdownExtensionView(host: HTMLElement, options: { onToggle(): void; onPreview(): void }) {
  const section = document.createElement('section');
  section.className = 'wb-extension-details';
  section.setAttribute('aria-label', 'Markdown Preview Enhanced 扩展');
  section.innerHTML = '<div class="wb-extension-heading"><span class="codicon codicon-markdown"></span><h3>Markdown Preview Enhanced</h3></div><p>shd101wyy · 0.8.40</p><p>Markdown 实时预览，支持 HTML、Mermaid 和数学公式。</p><p data-extension-status role="status"></p><div class="wb-extension-actions"><button type="button" data-extension-toggle></button><button type="button" data-extension-preview>打开侧边预览</button></div><p>打开 Markdown 文件，使用编辑器标题栏预览按钮、右键菜单，或 Ctrl / ⌘ + K V。</p><p data-extension-error role="alert" hidden></p>';
  const toggle = section.querySelector<HTMLButtonElement>('[data-extension-toggle]')!;
  const preview = section.querySelector<HTMLButtonElement>('[data-extension-preview]')!;
  const status = section.querySelector<HTMLElement>('[data-extension-status]')!;
  const error = section.querySelector<HTMLElement>('[data-extension-error]')!;
  toggle.onclick = options.onToggle;
  preview.onclick = options.onPreview;
  host.replaceChildren(section);
  return {
    render(state: { enabled: boolean; status: MarkdownExtensionStatus; markdown: boolean; error: string }): void {
      status.textContent = labels[state.status];
      status.dataset['extensionStatus'] = state.status;
      toggle.textContent = state.enabled ? '禁用' : '启用';
      toggle.setAttribute('aria-label', `${toggle.textContent} Markdown Preview Enhanced`);
      preview.disabled = !state.enabled || !state.markdown || state.status === 'loading';
      error.textContent = state.error;
      error.hidden = !state.error;
    },
    dispose(): void { toggle.onclick = null; preview.onclick = null; section.remove(); }
  };
}
