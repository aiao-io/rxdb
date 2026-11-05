// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkbenchFiles } from './session.js';
import { createWorkbenchSearch, searchFiles, type SearchSpec } from './workbench-search.js';

const files: WorkbenchFiles = {
  'src/main.ts': 'const value = 1;\nconsole.log(value);\n',
  'README.md': 'Value guide\n'
};

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('searchFiles', () => {
  const spec = (text: string, extra: Partial<SearchSpec> = {}): SearchSpec => ({
    text,
    caseSensitive: false,
    wholeWord: false,
    regexp: false,
    ...extra
  });

  it('默认大小写不敏感，逐行返回命中、命中区间与片段', () => {
    const result = searchFiles(files, spec('value'));
    expect(result.error).toBeUndefined();
    expect(result.matches.map(match => ({ path: match.path, line: match.line, span: match.span }))).toEqual([
      { path: 'src/main.ts', line: 1, span: 'value' },
      { path: 'src/main.ts', line: 2, span: 'value' },
      { path: 'README.md', line: 1, span: 'Value' }
    ]);
    expect(result.matches[0].text).toBe('const value = 1;');
  });

  it('区分大小写与全字匹配', () => {
    expect(searchFiles(files, spec('Value', { caseSensitive: true })).matches.map(match => match.path)).toEqual([
      'README.md'
    ]);
    expect(searchFiles(files, spec('value', { wholeWord: true })).matches).toHaveLength(3);
    expect(searchFiles(files, spec('val', { wholeWord: true })).matches).toHaveLength(0);
  });

  it('正则匹配与非法正则返回错误', () => {
    const result = searchFiles(files, spec('value\\s*=', { regexp: true }));
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].span).toBe('value =');
    const invalid = searchFiles(files, spec('(', { regexp: true }));
    expect(invalid.matches).toHaveLength(0);
    expect(invalid.error).toBeTruthy();
  });

  it('跳过二进制文件与空查询', () => {
    const mixed: WorkbenchFiles = { 'asset.png': new Uint8Array([1, 2, 3]), 'src/main.ts': files['src/main.ts'] };
    expect(searchFiles(mixed, spec('value')).matches.map(match => match.path)).toEqual(['src/main.ts', 'src/main.ts']);
    expect(searchFiles(files, spec('')).matches).toHaveLength(0);
  });
});

describe('createWorkbenchSearch', () => {
  function mount(onOpenMatch: (path: string, line: number) => void) {
    const host = document.createElement('div');
    document.body.append(host);
    const search = createWorkbenchSearch(host, { onOpenMatch, onReplaceFiles: vi.fn() });
    search.refresh(files);
    return { host, search };
  }

  it('按文件分组渲染结果，点击命中回传路径与行号', () => {
    const onOpenMatch = vi.fn();
    const { host, search } = mount(onOpenMatch);
    const input = host.querySelector<HTMLInputElement>('.wb-search-input input')!;
    input.value = 'value';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const groups = [...host.querySelectorAll('.wb-search-group')];
    expect(groups.map(group => group.querySelector('.wb-search-group-path')?.textContent)).toEqual([
      'src/main.ts',
      'README.md'
    ]);
    expect(groups[0].querySelector('.wb-search-group-count')?.textContent).toBe('2');
    const rows = [...groups[0].querySelectorAll<HTMLElement>('.wb-search-match')];
    expect(rows.map(row => row.querySelector('.wb-search-line')?.textContent)).toEqual(['1', '2']);
    expect(rows[0].querySelector('mark')?.textContent).toBe('value');
    rows[0].click();
    expect(onOpenMatch).toHaveBeenCalledWith('src/main.ts', 1);
    search.dispose();
  });

  it('三个开关改变匹配结果并即时重搜', () => {
    const { host, search } = mount(vi.fn());
    const rows = () => host.querySelectorAll('.wb-search-match').length;
    const input = host.querySelector<HTMLInputElement>('.wb-search-input input')!;
    input.value = 'value';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(rows()).toBe(3);
    const caseToggle = host.querySelector<HTMLButtonElement>('[data-search-flag="case"]')!;
    caseToggle.click();
    expect(rows()).toBe(2);
    search.dispose();
  });

  it('按文件替换与全局替换把新内容交给 onReplaceFiles', () => {
    const onReplaceFiles = vi.fn();
    const host = document.createElement('div');
    document.body.append(host);
    const search = createWorkbenchSearch(host, { onOpenMatch: vi.fn(), onReplaceFiles });
    search.refresh(files);
    const input = host.querySelector<HTMLInputElement>('.wb-search-input input')!;
    input.value = 'value';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const replaceInput = host.querySelector<HTMLInputElement>('.wb-search-replace input')!;
    replaceInput.value = 'XXX';
    replaceInput.dispatchEvent(new Event('input', { bubbles: true }));
    host.querySelector<HTMLButtonElement>('[data-search-replace-file]')!.click();
    expect(onReplaceFiles).toHaveBeenCalledWith(
      { 'src/main.ts': 'const XXX = 1;\nconsole.log(XXX);\n' },
      'src/main.ts'
    );
    search.refresh({ 'src/main.ts': 'const XXX = 1;\nconsole.log(XXX);\n', 'README.md': 'Value guide\n' });
    onReplaceFiles.mockClear();
    host.querySelector<HTMLButtonElement>('[data-search-replace-all]')!.click();
    expect(onReplaceFiles).toHaveBeenCalledWith({ 'README.md': 'XXX guide\n' }, 'all');
    search.dispose();
  });

  it('折叠全部收起所有文件组', () => {
    const { host, search } = mount(vi.fn());
    const input = host.querySelector<HTMLInputElement>('.wb-search-input input')!;
    input.value = 'value';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(host.querySelectorAll<HTMLElement>('.wb-search-group-list[hidden]')).toHaveLength(0);
    search.collapseAll();
    expect(host.querySelectorAll<HTMLElement>('.wb-search-group-list[hidden]')).toHaveLength(2);
    search.dispose();
  });
});
