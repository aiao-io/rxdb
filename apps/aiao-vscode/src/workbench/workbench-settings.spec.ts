// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openWorkbenchSettings } from './workbench-settings.js';
import { defaultWorkbenchPreferences } from './workbench-state.js';

afterEach(() => document.body.replaceChildren());

function fixture() {
  const trigger = document.createElement('button');
  document.body.append(trigger);
  trigger.focus();
  const onApply = vi.fn();
  const options = {
    ...defaultWorkbenchPreferences,
    availableRuntimes: new Set(['webcontainer', 'esbuild-wasm'] as const),
    onApply
  };
  openWorkbenchSettings(document.body, options);
  const dialog = document.querySelector<HTMLDialogElement>('dialog')!;
  const search = dialog.querySelector<HTMLInputElement>('[aria-label="搜索设置"]')!;
  return { trigger, onApply, options, dialog, search };
}

function button(dialog: HTMLElement, label: string): HTMLButtonElement {
  return dialog.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
}

function searchFor(input: HTMLInputElement, query: string): void {
  input.value = query;
  input.dispatchEvent(new Event('input'));
}

function visibleRows(dialog: HTMLElement): HTMLElement[] {
  return [...dialog.querySelectorAll<HTMLElement>('.wb-setting-row')].filter(row => !row.hidden);
}

describe('工作台设置', () => {
  it('提供标题栏、设置分类和用户作用域，自动聚焦搜索', () => {
    const { dialog, search } = fixture();
    expect(dialog.querySelector('header')?.textContent).toContain('设置');
    expect(dialog.querySelector('nav[aria-label="设置分类"]')?.textContent).toContain('文本编辑器');
    expect(dialog.querySelector('[aria-label="设置作用域"]')?.textContent).toContain('用户');
    expect(visibleRows(dialog)).toHaveLength(4);
    expect(document.activeElement).toBe(search);
    expect(dialog.querySelector('button[type="submit"]')).toBeNull();
  });

  it('切换分类只显示该分类设置，返回常用设置恢复全部', () => {
    const { dialog } = fixture();
    button(dialog, '源代码管理').click();
    expect(visibleRows(dialog)).toHaveLength(1);
    expect(visibleRows(dialog)[0].textContent).toContain('始终显示行内操作');
    expect(button(dialog, '源代码管理').getAttribute('aria-current')).toBe('true');
    button(dialog, '常用设置').click();
    expect(visibleRows(dialog)).toHaveLength(4);
  });

  it('搜索支持设置标识和多个关键词，展示结果数且排除下拉候选值', () => {
    const { dialog, search } = fixture();
    searchFor(search, 'EDITOR tabSize');
    expect(visibleRows(dialog)).toHaveLength(1);
    expect(visibleRows(dialog)[0].textContent).toContain('缩进大小');
    expect(dialog.querySelector('[role="status"]')?.textContent).toBe('找到 1 项设置');
    searchFor(search, '待接入');
    expect(visibleRows(dialog)).toHaveLength(0);
    expect(dialog.querySelector<HTMLElement>('.wb-settings-empty')?.hidden).toBe(false);
    button(dialog, '清除设置搜索').click();
    expect(search.value).toBe('');
    expect(visibleRows(dialog)).toHaveLength(4);
    expect(document.activeElement).toBe(search);
  });

  it('搜索跨分类显示结果并同步分类计数', () => {
    const { dialog, search } = fixture();
    button(dialog, '源代码管理').click();
    searchFor(search, '缩进');
    expect(visibleRows(dialog)).toHaveLength(1);
    expect(button(dialog, '文本编辑器').textContent).toContain('1');
    expect(button(dialog, '源代码管理').disabled).toBe(true);
  });

  it('修改立即应用所有当前值，关闭不重复保存并恢复焦点', () => {
    const { dialog, trigger, onApply } = fixture();
    const indent = dialog.querySelector<HTMLSelectElement>('[name="indent-unit"]')!;
    indent.value = '    ';
    indent.dispatchEvent(new Event('change', { bubbles: true }));
    expect(onApply).toHaveBeenLastCalledWith({ ...defaultWorkbenchPreferences, indentUnit: '    ' });
    const scm = dialog.querySelector<HTMLInputElement>('[name="always-show-scm-actions"]')!;
    scm.checked = true;
    scm.dispatchEvent(new Event('change', { bubbles: true }));
    expect(onApply).toHaveBeenLastCalledWith({
      ...defaultWorkbenchPreferences,
      indentUnit: '    ',
      alwaysShowScmActions: true
    });
    button(dialog, '关闭设置').click();
    expect(onApply).toHaveBeenCalledTimes(2);
    expect(document.querySelector('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('已修改筛选和重置使用默认值，重置后不再出现在筛选结果里', () => {
    const { dialog, onApply } = fixture();
    const engine = dialog.querySelector<HTMLSelectElement>('[name="editor-engine"]')!;
    engine.value = 'monaco';
    engine.dispatchEvent(new Event('change', { bubbles: true }));
    button(dialog, '仅显示已修改的设置').click();
    expect(visibleRows(dialog)).toHaveLength(1);
    expect(visibleRows(dialog)[0].dataset['modified']).toBe('true');
    button(dialog, '重置编辑器引擎').click();
    expect(onApply).toHaveBeenLastCalledWith(defaultWorkbenchPreferences);
    expect(visibleRows(dialog)).toHaveLength(0);
    expect(dialog.querySelector<HTMLElement>('.wb-settings-empty')?.hidden).toBe(false);
    button(dialog, '仅显示已修改的设置').click();
    expect(visibleRows(dialog)).toHaveLength(4);
  });

  it('运行方式保留部署可用性限制，选择后立即应用', () => {
    const { dialog, onApply } = fixture();
    const runtime = dialog.querySelector<HTMLSelectElement>('[name="runtime"]')!;
    expect([...runtime.options].filter(option => !option.disabled).map(option => option.value)).toEqual([
      'esbuild-wasm',
      'webcontainer'
    ]);
    runtime.value = 'esbuild-wasm';
    runtime.dispatchEvent(new Event('change', { bubbles: true }));
    expect(onApply).toHaveBeenLastCalledWith({ ...defaultWorkbenchPreferences, runtime: 'esbuild-wasm' });
  });

  it('最大化按钮切换尺寸，重复打开只聚焦已有面板', () => {
    const { dialog, search, options } = fixture();
    const maximize = button(dialog, '最大化设置');
    maximize.click();
    expect(maximize.getAttribute('aria-pressed')).toBe('true');
    expect(dialog.classList.contains('wb-settings-maximized')).toBe(true);
    maximize.click();
    expect(dialog.classList.contains('wb-settings-maximized')).toBe(false);
    openWorkbenchSettings(document.body, options);
    expect(document.querySelectorAll('dialog')).toHaveLength(1);
    expect(document.activeElement).toBe(search);
  });

  it('搜索回车不会提交设置，取消事件移除面板并恢复焦点', () => {
    const { dialog, search, trigger, onApply } = fixture();
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    search.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(true);
    expect(onApply).not.toHaveBeenCalled();
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(document.querySelector('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
