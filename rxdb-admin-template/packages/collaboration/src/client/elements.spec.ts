import { Window } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { alert, avatar, button, dropdown, modal, tabList, tabPanel } from './elements.js';

let window: Window;
beforeEach(() => {
  window = new Window();
  vi.stubGlobal('document', window.document);
  vi.stubGlobal('KeyboardEvent', window.KeyboardEvent);
  vi.stubGlobal('Event', window.Event);
  window.HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('按钮', () => {
  it('外观对应 daisyUI 的实心语义色；只显示图标时文字改作可访问名称与悬停提示', () => {
    expect([...button('合并', () => undefined, false, { tone: 'primary' }).classList]).toContain('btn-primary');
    expect([...button('删除', () => undefined, false, { tone: 'danger' }).classList]).toContain('btn-error');
    const refresh = button('刷新团队状态', () => undefined, false, { icon: 'refresh-cw', iconOnly: true });
    expect(refresh.textContent).toBe('');
    expect(refresh.getAttribute('aria-label')).toBe('刷新团队状态');
    expect(refresh.title).toBe('刷新团队状态');
    expect(refresh.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });
  it('执行期间禁用并显示加载标记，结束后恢复成给定的可用状态', async () => {
    let finish!: () => void;
    const node = button('同步', () => new Promise<void>(resolve => (finish = resolve)));
    node.click();
    expect(node.disabled).toBe(true);
    expect(node.querySelector('.loading')).not.toBeNull();
    finish();
    await vi.waitFor(() => expect(node.disabled).toBe(false));
    expect(node.querySelector('.loading')).toBeNull();
  });
});

describe('页签组', () => {
  const items = [
    { id: 'a', label: '甲' },
    { id: 'b', label: '乙', count: 3 },
    { id: 'c', label: '丙', count: 2, quietCount: true }
  ] as const;
  it('WAI-ARIA 页签：只有选中的页签在 Tab 序列里；计数进入可访问名称，quietCount 的计数对读屏隐藏', () => {
    const list = tabList('分区', 'demo', items, 'b', vi.fn());
    const tabs = [...list.querySelectorAll<HTMLElement>('[role="tab"]')];
    expect(list.getAttribute('aria-label')).toBe('分区');
    expect(tabs.map(tab => [tab.id, tab.tabIndex, tab.getAttribute('aria-selected')])).toEqual([
      ['demo-tab-a', -1, 'false'],
      ['demo-tab-b', 0, 'true'],
      ['demo-tab-c', -1, 'false']
    ]);
    expect(tabs[1].textContent).toBe('乙 3');
    expect(tabs[2].querySelector('.badge')?.getAttribute('aria-hidden')).toBe('true');
    const panel = tabPanel('demo', 'b');
    expect([panel.id, panel.getAttribute('role'), panel.getAttribute('aria-labelledby')]).toEqual([
      'demo-panel',
      'tabpanel',
      'demo-tab-b'
    ]);
  });
  it('方向键首尾相接，Home / End 到首尾，其余按键不处理', () => {
    const choose = vi.fn();
    const tabs = [...tabList('分区', 'demo', items, 'a', choose).querySelectorAll<HTMLElement>('[role="tab"]')];
    const press = (tab: HTMLElement, key: string) => tab.dispatchEvent(new KeyboardEvent('keydown', { key }));
    press(tabs[2], 'ArrowRight');
    press(tabs[0], 'ArrowLeft');
    press(tabs[1], 'Home');
    press(tabs[0], 'End');
    press(tabs[0], 'Enter');
    expect(choose.mock.calls).toEqual([
      ['a', true],
      ['c', true],
      ['a', true],
      ['c', true]
    ]);
  });
});

describe('对话框', () => {
  it('挂在 body 上，标题就是可访问名称；Esc 取消时一并移除，close 关闭并移除', () => {
    const first = modal('邀请已创建', { description: '说明' });
    expect(first.dialog.parentElement).toBe(document.body);
    expect(first.dialog.getAttribute('aria-labelledby')).toBe(first.dialog.querySelector('h2')?.id);
    first.dialog.dispatchEvent(new Event('cancel'));
    expect(first.dialog.isConnected).toBe(false);
    const second = modal('放弃草稿');
    second.dialog.showModal();
    second.close();
    expect(second.dialog.isConnected).toBe(false);
  });
});

describe('提示条与头像', () => {
  it('提示条是 status，可以关闭', () => {
    const dismiss = vi.fn();
    const node = alert('邀请已接受', 'success', dismiss);
    expect(node.getAttribute('role')).toBe('status');
    expect(node.textContent).toBe('邀请已接受');
    node.querySelector<HTMLButtonElement>('button[aria-label="关闭提示"]')!.click();
    expect(dismiss).toHaveBeenCalledTimes(1);
  });
  it('头像取首字母、对读屏隐藏，同一名字颜色稳定', () => {
    const one = avatar('alice@example.test');
    expect(one.textContent).toBe('A');
    expect(one.getAttribute('aria-hidden')).toBe('true');
    expect(avatar('alice@example.test').className).toBe(one.className);
    expect(avatar('团队甲', 'md', 'square').className).toContain('rounded-field');
  });
});

describe('下拉菜单', () => {
  it('summary 在前、浮层面板在后；面板不挂 daisyUI 的 dropdown-content（收起时常驻的动画永不结束），淡入只在展开时挂上', () => {
    const { details, summary, panel } = dropdown('btn btn-ghost', 'ul', 'menu w-72', 'end');
    expect([...details.children]).toEqual([summary, panel]);
    expect(details.classList.contains('dropdown')).toBe(true);
    expect(summary.className).toBe('btn btn-ghost');
    expect(panel.tagName).toBe('UL');
    const classes = panel.className.split(' ');
    expect(classes).not.toContain('dropdown-content');
    expect(classes).toEqual(expect.arrayContaining(['absolute', 'top-full', 'end-0', 'menu', 'w-72']));
    expect(classes.filter(name => name.includes('animate'))).toEqual([
      'group-open/dropdown:motion-safe:animate-[dropdown_0.2s]'
    ]);
    expect(dropdown('btn', 'div', '').panel.classList.contains('start-0')).toBe(true);
  });
});
