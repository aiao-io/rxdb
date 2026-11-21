import {
  SETI_DEFAULT_ICON,
  SETI_EXTENSIONS,
  SETI_FILE_NAMES,
  SETI_ICONS,
  SETI_LANGUAGES
} from './workbench-seti-theme.js';

/** 文件图标：Seti 字体字形与颜色（对齐 VS Code 默认的 Seti 图标主题）。 */
export interface SetiIcon {
  readonly id: string;
  readonly glyph: string;
  readonly color: string;
}

/** VS Code 内置语言按扩展名的归属，仅列主题靠语言（而非扩展名）选图标的常见类型。 */
const LANGUAGE_BY_EXTENSION: Readonly<Record<string, string>> = {
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'typescriptreact',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascriptreact',
  json: 'json',
  jsonc: 'jsonc',
  jsonl: 'jsonl',
  md: 'markdown',
  markdown: 'markdown',
  css: 'css',
  scss: 'scss',
  sass: 'sass',
  less: 'less',
  html: 'html',
  htm: 'html',
  xml: 'xml',
  yml: 'yaml',
  yaml: 'yaml',
  sh: 'shellscript',
  bash: 'shellscript',
  zsh: 'shellscript',
  ps1: 'powershell',
  py: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  php: 'php',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  swift: 'swift',
  lua: 'lua',
  sql: 'sql',
  tex: 'latex',
  dart: 'dart',
  properties: 'properties',
  gitignore: 'ignore',
  npmignore: 'ignore',
  dockerignore: 'ignore',
  eslintignore: 'ignore',
  prettierignore: 'ignore'
};

/** 靠整个文件名确定语言的少数文件。 */
const LANGUAGE_BY_FILE_NAME: Readonly<Record<string, string>> = {
  dockerfile: 'dockerfile',
  makefile: 'makefile',
  gnumakefile: 'makefile',
  '.env': 'dotenv'
};

function languageFor(name: string): string | undefined {
  const byName = LANGUAGE_BY_FILE_NAME[name];
  if (byName) return byName;
  if (name.startsWith('.env.')) return 'dotenv';
  return LANGUAGE_BY_EXTENSION[name.slice(name.lastIndexOf('.') + 1)];
}

/** 扩展名候选，最长优先：a.test.ts → test.ts、ts；.npmrc → npmrc。 */
function extensionCandidates(name: string): string[] {
  const parts = name.split('.');
  return parts.slice(1).map((_, index) => parts.slice(index + 1).join('.'));
}

function resolveIconId(name: string): string {
  const byName = SETI_FILE_NAMES[name];
  if (byName) return byName;
  const extension = extensionCandidates(name).find(candidate => SETI_EXTENSIONS[candidate]);
  if (extension) return SETI_EXTENSIONS[extension];
  const language = languageFor(name);
  return (language && SETI_LANGUAGES[language]) || SETI_DEFAULT_ICON;
}

/** 按文件路径解析 Seti 图标：整个文件名 → 扩展名（长者优先）→ 语言 → 默认图标。 */
export function setiIconForFile(path: string): SetiIcon {
  const id = resolveIconId((path.split('/').at(-1) ?? path).toLowerCase());
  const [code, color] = SETI_ICONS[id];
  return { id, glyph: String.fromCodePoint(Number.parseInt(code, 16)), color };
}

/** 创建文件图标元素：装饰性字体字形，可访问名称由文件名承担。 */
export function createSetiIcon(path: string): HTMLSpanElement {
  const { id, glyph, color } = setiIconForFile(path);
  const icon = document.createElement('span');
  icon.className = 'wb-seti';
  icon.setAttribute('aria-hidden', 'true');
  icon.dataset['seti'] = id;
  icon.textContent = glyph;
  if (color) icon.style.color = color;
  return icon;
}
