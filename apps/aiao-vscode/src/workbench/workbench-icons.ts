/** 工作台统一使用 VS Code 官方 Codicons 字形。 */
export type CodiconName =
  | 'files'
  | 'source-control'
  | 'layout-panel'
  | 'play'
  | 'add'
  | 'edit'
  | 'trash'
  | 'new-file'
  | 'cloud-upload'
  | 'cloud-download'
  | 'save'
  | 'close'
  | 'git-commit'
  | 'git-branch'
  | 'warning'
  | 'error'
  | 'output'
  | 'debug-console'
  | 'chevron-right'
  | 'chevron-down'
  | 'folder'
  | 'folder-opened'
  | 'file-code'
  | 'json'
  | 'markdown'
  | 'symbol-color'
  | 'file-media'
  | 'file-binary'
  | 'settings-gear'
  | 'file-text'
  | 'file'
  | 'diff-modified'
  | 'diff-added'
  | 'diff-removed'
  | 'diff-renamed'
  | 'question'
  | 'check'
  | 'search'
  | 'extensions'
  | 'more'
  | 'refresh'
  | 'collapse-all'
  | 'expand-all'
  | 'split-horizontal'
  | 'split-vertical'
  | 'layout-sidebar-left'
  | 'layout-sidebar-right'
  | 'code'
  | 'layout'
  | 'remote'
  | 'open-preview'
  | 'globe'
  | 'clear-all'
  | 'circle-filled'
  | 'chevron-up'
  | 'remove'
  | 'discard'
  | 'git-compare'
  | 'ellipsis'
  | 'close-all'
  | 'diff';

function iconClass(name: CodiconName): string {
  if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new Error('无效的 VS Code 图标名称');
  return `codicon codicon-${name}`;
}

function escapedAttribute(value: string): string {
  const escapes: Record<string, string> = { '&': '&amp;', '"': '&quot;', "'": '&#39;', '<': '&lt;', '>': '&gt;' };
  return value.replace(/[&"'<>]/g, character => escapes[character]);
}

/** 创建独立或装饰性的官方图标；可访问名称由调用方显式提供。 */
export function createCodicon(name: CodiconName, label?: string): HTMLSpanElement {
  const icon = document.createElement('span');
  icon.className = iconClass(name);
  if (label) {
    icon.setAttribute('role', 'img');
    icon.setAttribute('aria-label', label);
  } else icon.setAttribute('aria-hidden', 'true');
  return icon;
}

/** 用于静态工作台布局的图标标记，名称与属性不会作为 HTML 执行。 */
export function iconMarkup(name: CodiconName, label?: string): string {
  const accessibility = label ? `role="img" aria-label="${escapedAttribute(label)}"` : 'aria-hidden="true"';
  return `<span class="${iconClass(name)}" ${accessibility}></span>`;
}

function fileLanguage(path: string): string {
  const name = path.split('/').at(-1)?.toLowerCase() ?? '';
  if (/\.(?:component|service|directive|pipe|guard|module)\.ts$/.test(name)) return 'angular';
  if (/\.[jt]sx$/.test(name)) return 'react';
  if (/\.vue$/.test(name)) return 'vue';
  if (/\.[cm]?ts$/.test(name)) return 'typescript';
  if (/\.[cm]?js$/.test(name)) return 'javascript';
  if (/\.(?:css|scss|sass|less)$/.test(name)) return 'css';
  if (/\.jsonc?$/.test(name)) return 'json';
  if (/\.mdx?$/.test(name)) return 'markdown';
  if (/\.html?$/.test(name)) return 'html';
  return '';
}

/** 文件名映射到 Codicons 内置文件字形，不引入第三方彩色文件图标。 */
export function fileCodicon(path: string): CodiconName {
  const name = path.split('/').at(-1)?.toLowerCase() ?? '';
  const language = fileLanguage(path);
  if (language === 'json') return 'json';
  if (language === 'markdown') return 'markdown';
  if (language === 'css') return 'symbol-color';
  if (language) return 'file-code';
  if (/\.(?:svg|png|jpe?g|gif|webp|avif|ico|mp[34]|wav|ogg|webm)$/.test(name)) return 'file-media';
  if (/\.(?:bin|sqlite|sqlite3|db|wasm|ttf|woff2?)$/.test(name)) return 'file-binary';
  if (/\.(?:ya?ml|toml|lock|ini|conf)$/.test(name) || name.startsWith('.')) return 'settings-gear';
  if (/^(?:licen[cs]e|readme|notice)(?:\.|$)/.test(name) || name.endsWith('.txt')) return 'file-text';
  return 'file';
}

/** 文件语言只控制宿主着色，图标形状始终来自官方字体。 */
export function createFileIcon(path: string): HTMLSpanElement {
  const icon = createCodicon(fileCodicon(path));
  const language = fileLanguage(path);
  if (language) icon.dataset['language'] = language;
  return icon;
}

/** 展开状态使用 VS Code 的目录字形。 */
export function folderCodicon(expanded: boolean): CodiconName {
  return expanded ? 'folder-opened' : 'folder';
}

/** 使用两列 Git 状态生成源代码管理的装饰图标。 */
export function gitStatusCodicon(status: string): CodiconName {
  if (status.includes('U')) return 'warning';
  if (status.includes('?')) return 'question';
  if (status.includes('R')) return 'diff-renamed';
  if (status.includes('D')) return 'diff-removed';
  if (status.includes('A')) return 'diff-added';
  if (/[MCT]/.test(status)) return 'diff-modified';
  return 'check';
}
