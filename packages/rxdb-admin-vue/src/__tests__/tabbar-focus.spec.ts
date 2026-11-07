import { afterEach, describe, expect, it } from 'vitest';
import { act, fireEvent, screen, within } from './queries.js';
import { cleanup, mount } from './test-utils.js';

afterEach(cleanup);

const tabs = () => screen.getAllByTestId('admin-tab');
const titles = () => tabs().map(tab => tab.textContent);
const linkOf = (index: number) => within(tabs()[index]).getByRole('link');

/**
 * 键盘排序后焦点不能丢：Vue 的 keyed diff 重排时可能移动的正是被聚焦的那个节点（向左移动时），
 * 浏览器里被移动的节点会失焦，用户就没法连续按 Shift+方向键。真实浏览器里观察到、happy-dom 同样复现。
 */
describe('页签键盘排序的焦点', () => {
  const open = async (shell: ReturnType<typeof mount>['shell']): Promise<void> => {
    await act(() => {
      shell.syncRoute('/search');
      shell.syncRoute('/entities/assets/AssetCategory');
    });
  };

  it('Shift+← 移动页签后焦点仍在被移动的页签链接上', async () => {
    const { shell } = mount();
    await open(shell);
    expect(titles()).toEqual(['资产', '搜索', '资产分类']);
    const link = linkOf(1);
    link.focus();
    await fireEvent.keyDown(link, { key: 'ArrowLeft', shiftKey: true });
    expect(titles()).toEqual(['搜索', '资产', '资产分类']);
    expect(document.activeElement).toBe(link);
  });

  it('Shift+→ 移动页签后焦点仍在被移动的页签链接上', async () => {
    const { shell } = mount();
    await open(shell);
    const link = linkOf(0);
    link.focus();
    await fireEvent.keyDown(link, { key: 'ArrowRight', shiftKey: true });
    expect(titles()).toEqual(['搜索', '资产', '资产分类']);
    expect(document.activeElement).toBe(link);
  });

  it('连续按 Shift+← 可以一路把页签移到最前', async () => {
    const { shell } = mount();
    await open(shell);
    const link = linkOf(2);
    link.focus();
    await fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowLeft', shiftKey: true });
    await fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowLeft', shiftKey: true });
    expect(titles()).toEqual(['资产分类', '资产', '搜索']);
    expect(document.activeElement).toBe(link);
  });
});
