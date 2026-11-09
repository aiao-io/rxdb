// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { requestWorkbenchProject } from './workbench-dialog.js';

afterEach(() => document.body.replaceChildren());

function fixture(initialName?: string) {
  const trigger = document.createElement('button');
  document.body.append(trigger);
  trigger.focus();
  const result = requestWorkbenchProject(document.body, initialName);
  const dialog = document.querySelector<HTMLDialogElement>('dialog')!;
  const name = dialog.querySelector<HTMLInputElement>('[aria-label="项目名称"]')!;
  const submit = dialog.querySelector<HTMLButtonElement>('[type="submit"]')!;
  return { trigger, result, dialog, name, submit };
}

function submitForm(dialog: HTMLDialogElement): void {
  dialog.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
}

describe('新建项目', () => {
  it('同屏提供名称与四种模板，默认选择 React 并聚焦名称', async () => {
    const { dialog, name, submit, result } = fixture();
    expect(name.closest('[hidden]')).toBeNull();
    expect(document.activeElement).toBe(name);
    expect(dialog.querySelector('fieldset')?.textContent).toContain('项目模板');
    expect(dialog.querySelectorAll('input[type="radio"]')).toHaveLength(4);
    expect(dialog.querySelector<HTMLInputElement>('[value="react"]')?.checked).toBe(true);
    expect(submit.textContent).toBe('创建项目');
    submitForm(dialog);
    await expect(result).resolves.toEqual({ name: '我的项目', template: 'react' });
    expect(document.querySelector('dialog')).toBeNull();
  });

  it.each(['vanilla', 'react', 'vue', 'angular'])('选择 %s 后一次提交创建请求', async template => {
    const { dialog, name, result } = fixture();
    name.value = '  我的新项目  ';
    dialog.querySelector<HTMLInputElement>(`input[value="${template}"]`)!.click();
    submitForm(dialog);
    await expect(result).resolves.toEqual({ name: '我的新项目', template });
  });

  it('切换模板保留名称及模板控件焦点', async () => {
    const { dialog, name, result } = fixture('保留这个名称');
    const vue = dialog.querySelector<HTMLInputElement>('input[value="vue"]')!;
    vue.focus();
    vue.click();
    expect(document.activeElement).toBe(vue);
    expect(vue.checked).toBe(true);
    expect(name.value).toBe('保留这个名称');
    dialog.close();
    await expect(result).resolves.toBeNull();
  });

  it('空白名称禁用创建并提示原因，修正后可以提交', async () => {
    const { dialog, name, submit, result } = fixture();
    name.value = '   ';
    name.dispatchEvent(new Event('input'));
    expect(submit.disabled).toBe(true);
    expect(name.getAttribute('aria-invalid')).toBe('true');
    expect(dialog.textContent).toContain('请输入项目名称');
    submitForm(dialog);
    expect(dialog.open).toBe(true);
    name.value = '修正后的项目';
    name.dispatchEvent(new Event('input'));
    expect(submit.disabled).toBe(false);
    expect(name.getAttribute('aria-invalid')).toBe('false');
    submitForm(dialog);
    await expect(result).resolves.toEqual({ name: '修正后的项目', template: 'react' });
  });

  it.each(['取消', '关闭'])('%s 后返回空值并恢复入口焦点', async label => {
    const { dialog, trigger, result } = fixture();
    const button = [...dialog.querySelectorAll('button')].find(
      item => item.textContent === label || item.getAttribute('aria-label') === label
    )!;
    button.click();
    await expect(result).resolves.toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(document.querySelector('dialog')).toBeNull();
  });
});
