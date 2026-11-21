// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { requestFolderProject } from './folder-picker.js';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

it('取消选择或关闭工作台时移除文件输入，不导入项目', async () => {
  for (const cancel of ['picker', 'dispose'] as const) {
    const controller = new AbortController();
    const result = requestFolderProject(document.body, controller.signal);
    const input = document.querySelector<HTMLInputElement>('input')!;
    expect(input.webkitdirectory).toBe(true);
    if (cancel === 'picker') input.dispatchEvent(new Event('cancel'));
    else controller.abort();
    expect(await result).toBeNull();
    expect(document.querySelector('input')).toBeNull();
  }
});

it('已经销毁时不打开选择器；浏览器拒绝选择器时清理节点', async () => {
  const controller = new AbortController();
  controller.abort();
  expect(await requestFolderProject(document.body, controller.signal)).toBeNull();
  vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {
    throw new Error('picker denied');
  });
  await expect(requestFolderProject(document.body, new AbortController().signal)).rejects.toThrow('picker denied');
  expect(document.querySelector('input')).toBeNull();
});

it('选择后按实际相对路径读取文件副本', async () => {
  const file = new File(['console.log(1)'], 'main.ts');
  Object.defineProperty(file, 'webkitRelativePath', { value: 'picked/src/main.ts' });
  vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (this: HTMLInputElement) {
    Object.defineProperty(this, 'files', { value: [file] });
    this.dispatchEvent(new Event('change'));
  });
  const result = await requestFolderProject(document.body, new AbortController().signal);
  expect(result?.name).toBe('picked');
  expect(result?.files['src/main.ts']).toBe('console.log(1)');
  expect(document.querySelector('input')).toBeNull();
});
