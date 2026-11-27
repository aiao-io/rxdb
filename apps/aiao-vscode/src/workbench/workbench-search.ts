import type { WorkbenchFiles } from './session.js';
import { createCodicon, createFileIcon } from './workbench-icons.js';
import { workbenchSearchStyle } from './workbench-search-style.js';

/** 搜索查询规范；三个开关对应 VS Code 搜索视图的匹配选项。 */
export interface SearchSpec {
  readonly text: string;
  readonly caseSensitive: boolean;
  readonly wholeWord: boolean;
  readonly regexp: boolean;
}

/** 一条命中的行内区间；`span` 为命中文本，`text` 为整行内容。 */
export interface SearchMatch {
  readonly path: string;
  readonly line: number;
  readonly from: number;
  readonly to: number;
  readonly text: string;
  readonly span: string;
}

export interface SearchResult {
  readonly matches: readonly SearchMatch[];
  readonly error?: string;
}

export interface WorkbenchSearchOptions {
  onOpenMatch(path: string, line: number): void;
  /** 替换计算出的新文件内容；`scope` 为 `'all'`（全部文件）或单个路径。宿主负责确认、写入编辑缓冲并刷新。 */
  onReplaceFiles(files: Record<string, string>, scope: 'all' | string): void;
  onError?(cause: unknown): void;
}

export interface WorkbenchSearch {
  refresh(files: WorkbenchFiles): void;
  focus(): void;
  clear(): void;
  collapseAll(): void;
  dispose(): void;
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const messageFor = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause));

function compilePattern(spec: SearchSpec): RegExp {
  const source = spec.regexp ? spec.text : escapeRegExp(spec.text);
  const flags = spec.caseSensitive ? 'g' : 'gi';
  return new RegExp(spec.wholeWord ? `\\b(?:${source})\\b` : source, flags);
}

/** 逐行搜索文本文件，返回命中区间；空查询不搜索，非法正则返回错误。 */
export function searchFiles(files: WorkbenchFiles, spec: SearchSpec): SearchResult {
  if (!spec.text) return { matches: [] };
  let pattern: RegExp;
  try {
    pattern = compilePattern(spec);
  } catch (cause) {
    return { matches: [], error: messageFor(cause) };
  }
  const matches: SearchMatch[] = [];
  for (const [path, value] of Object.entries(files)) {
    if (typeof value !== 'string') continue;
    const lines = value.split('\n');
    for (const [index, lineText] of lines.entries()) {
      pattern.lastIndex = 0;
      let hit: RegExpExecArray | null;
      while ((hit = pattern.exec(lineText)) !== null) {
        if (hit[0] === '') {
          if (hit.index === pattern.lastIndex) pattern.lastIndex++;
          continue;
        }
        matches.push({
          path,
          line: index + 1,
          from: hit.index,
          to: hit.index + hit[0].length,
          text: lineText,
          span: hit[0]
        });
      }
    }
  }
  return { matches };
}

function replaceInFile(text: string, spec: SearchSpec, replacement: string): string {
  const pattern = compilePattern(spec);
  // 字面量替换里出现 `$` 时不参与正则替换语法。
  const safe = spec.regexp ? replacement : replacement.replace(/\$/g, '$$$$');
  return text
    .split('\n')
    .map(line => line.replace(pattern, safe))
    .join('\n');
}

/** 挂载 VS Code 风格的跨文件搜索视图：查询、三个匹配开关、替换与按文件分组的结果。 */
export function createWorkbenchSearch(host: HTMLElement, options: WorkbenchSearchOptions): WorkbenchSearch {
  const owner = host.ownerDocument;
  const style = owner.createElement('style');
  style.textContent = workbenchSearchStyle;
  host.append(style);
  const element = owner.createElement('section');
  element.className = 'wb-search';
  element.setAttribute('aria-label', '在文件中搜索');

  const inputRow = owner.createElement('div');
  inputRow.className = 'wb-search-input';
  inputRow.append(createCodicon('search'));
  const input = owner.createElement('input');
  input.type = 'text';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.setAttribute('aria-label', '搜索');
  input.placeholder = '在文件中搜索';
  const clearButton = owner.createElement('button');
  clearButton.type = 'button';
  clearButton.className = 'wb-search-clear';
  clearButton.title = '清除搜索结果';
  clearButton.setAttribute('aria-label', '清除搜索结果');
  clearButton.append(createCodicon('clear-all'));
  inputRow.append(input, clearButton);
  const flagRow = owner.createElement('div');
  flagRow.className = 'wb-search-flags';
  const flagDefinitions = [
    { key: 'case', icon: 'case-sensitive', label: '区分大小写' },
    { key: 'word', icon: 'whole-word', label: '全字匹配' },
    { key: 'regexp', icon: 'regex', label: '使用正则表达式' }
  ] as const;
  const flags = new Map<(typeof flagDefinitions)[number]['key'], HTMLButtonElement>();
  for (const definition of flagDefinitions) {
    const button = owner.createElement('button');
    button.type = 'button';
    button.dataset['searchFlag'] = definition.key;
    button.title = definition.label;
    button.setAttribute('aria-label', definition.label);
    button.setAttribute('aria-pressed', 'false');
    button.append(createCodicon(definition.icon));
    flags.set(definition.key, button);
    flagRow.append(button);
  }
  inputRow.append(flagRow);

  const replaceRow = owner.createElement('div');
  replaceRow.className = 'wb-search-replace';
  replaceRow.append(createCodicon('replace'));
  const replaceInput = owner.createElement('input');
  replaceInput.type = 'text';
  replaceInput.autocomplete = 'off';
  replaceInput.spellcheck = false;
  replaceInput.setAttribute('aria-label', '替换');
  replaceInput.placeholder = '替换';
  const replaceAll = owner.createElement('button');
  replaceAll.type = 'button';
  replaceAll.className = 'wb-search-replace-all';
  replaceAll.dataset['searchReplaceAll'] = '';
  replaceAll.title = '全部替换';
  replaceAll.setAttribute('aria-label', '全部替换');
  replaceAll.append(createCodicon('replace-all'));
  replaceRow.append(replaceInput, replaceAll);

  const results = owner.createElement('div');
  results.className = 'wb-search-results';
  const status = owner.createElement('p');
  status.className = 'wb-search-status';
  status.setAttribute('role', 'status');
  element.append(inputRow, replaceRow, status, results);
  // 样式必须与视图一起挂载：replaceChildren 会清掉先前追加的 style 元素。
  host.replaceChildren(style, element);

  let files: WorkbenchFiles = {};
  let spec: SearchSpec = { text: '', caseSensitive: false, wholeWord: false, regexp: false };
  let result: SearchResult = { matches: [] };
  let disposed = false;
  const groupToggles: { toggle: HTMLButtonElement; list: HTMLElement; path: string }[] = [];

  function groups(): readonly { path: string; matches: SearchMatch[] }[] {
    const grouped: { path: string; matches: SearchMatch[] }[] = [];
    for (const match of result.matches) {
      const last = grouped.at(-1);
      if (last && last.path === match.path) last.matches.push(match);
      else grouped.push({ path: match.path, matches: [match] });
    }
    return grouped;
  }

  function appendHighlighted(parent: HTMLElement, match: SearchMatch): void {
    parent.append(match.text.slice(0, match.from));
    const mark = owner.createElement('mark');
    mark.className = 'wb-search-match-highlight';
    mark.textContent = match.span;
    parent.append(mark, match.text.slice(match.to));
  }

  function render(): void {
    if (disposed) return;
    results.replaceChildren();
    groupToggles.splice(0);
    status.replaceChildren();
    status.hidden = false;
    if (!spec.text) {
      status.textContent = '输入关键词在项目中搜索';
      return;
    }
    if (result.error) {
      status.textContent = result.error;
      status.classList.add('wb-search-error');
      return;
    }
    status.classList.remove('wb-search-error');
    const entries = groups();
    if (!entries.length) {
      status.textContent = '未找到结果';
      return;
    }
    status.hidden = true;
    for (const group of entries) {
      const section = owner.createElement('div');
      section.className = 'wb-search-group';
      const header = owner.createElement('div');
      header.className = 'wb-search-group-header';
      const toggle = owner.createElement('button');
      toggle.type = 'button';
      toggle.className = 'wb-search-group-toggle';
      toggle.setAttribute('aria-label', `折叠 ${group.path}`);
      toggle.append(createCodicon('chevron-down'));
      toggle.onclick = () => {
        const collapsed = !list.hidden;
        list.hidden = collapsed;
        toggle.setAttribute('aria-label', `${collapsed ? '展开' : '折叠'} ${group.path}`);
        toggle.replaceChildren(createCodicon(collapsed ? 'chevron-right' : 'chevron-down'));
      };
      const path = owner.createElement('span');
      path.className = 'wb-search-group-path';
      path.textContent = group.path;
      const count = owner.createElement('span');
      count.className = 'wb-search-group-count';
      count.textContent = String(group.matches.length);
      const fileReplace = owner.createElement('button');
      fileReplace.type = 'button';
      fileReplace.className = 'wb-search-file-replace';
      fileReplace.dataset['searchReplaceFile'] = '';
      fileReplace.title = `替换 ${group.path} 中的全部匹配`;
      fileReplace.setAttribute('aria-label', `替换 ${group.path} 中的全部匹配`);
      fileReplace.append(createCodicon('replace-all'));
      fileReplace.onclick = () => {
        const replaced = replaceInFile(files[group.path] as string, spec, replaceInput.value);
        if (replaced !== files[group.path]) options.onReplaceFiles({ [group.path]: replaced }, group.path);
      };
      header.append(toggle, createFileIcon(group.path), path, count, fileReplace);
      const list = owner.createElement('div');
      list.className = 'wb-search-group-list';
      groupToggles.push({ toggle, list, path: group.path });
      for (const match of group.matches) {
        const row = owner.createElement('button');
        row.type = 'button';
        row.className = 'wb-search-match';
        row.title = `${group.path}:${match.line}`;
        const line = owner.createElement('span');
        line.className = 'wb-search-line';
        line.textContent = String(match.line);
        const content = owner.createElement('span');
        content.className = 'wb-search-content';
        appendHighlighted(content, match);
        row.append(line, content);
        row.onclick = () => options.onOpenMatch(group.path, match.line);
        list.append(row);
      }
      section.append(header, list);
      results.append(section);
    }
  }

  function syncFlags(): void {
    for (const [key, button] of flags) {
      const active =
        spec[
          key === 'case' ? 'caseSensitive'
          : key === 'word' ? 'wholeWord'
          : 'regexp'
        ];
      button.setAttribute('aria-pressed', String(active));
    }
  }

  function search(): void {
    spec = { ...spec, text: input.value };
    try {
      result = searchFiles(files, spec);
    } catch (cause) {
      result = { matches: [], error: messageFor(cause) };
      options.onError?.(cause);
    }
    render();
  }

  input.oninput = search;
  clearButton.onclick = () => {
    input.value = '';
    search();
    input.focus();
  };
  replaceInput.oninput = () => {
    // 替换内容不需要重搜，只影响替换按钮的可用性。
    replaceAll.disabled = !input.value.trim();
  };
  for (const [key, button] of flags) {
    button.onclick = () => {
      const field =
        key === 'case' ? 'caseSensitive'
        : key === 'word' ? 'wholeWord'
        : 'regexp';
      spec = { ...spec, [field]: !spec[field] };
      syncFlags();
      search();
    };
  }
  replaceAll.onclick = () => {
    const next: Record<string, string> = {};
    for (const group of groups()) {
      const value = files[group.path];
      if (typeof value !== 'string') continue;
      const replaced = replaceInFile(value, spec, replaceInput.value);
      if (replaced !== value) next[group.path] = replaced;
    }
    if (Object.keys(next).length) options.onReplaceFiles(next, 'all');
  };
  replaceAll.disabled = true;

  return {
    refresh(next) {
      if (disposed) return;
      files = next;
      search();
    },
    focus() {
      if (disposed) return;
      input.focus();
      input.select();
    },
    clear() {
      if (disposed) return;
      input.value = '';
      search();
    },
    collapseAll() {
      if (disposed) return;
      for (const { toggle, list, path } of groupToggles) {
        list.hidden = true;
        toggle.setAttribute('aria-label', `展开 ${path}`);
        toggle.replaceChildren(createCodicon('chevron-right'));
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      style.remove();
      element.remove();
    }
  };
}
