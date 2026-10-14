import { FolderTree } from '@lucide/vue';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { h } from 'vue';
import type { ToolbarDropdownCopy } from '../utils/worktree-menu';
import ToolbarDropdown from './ToolbarDropdown.vue';

/**
 * @fileoverview 工具栏共享下拉的组件单测。
 *
 * @remarks
 * 锁 e2e 从界面上造不出来的几件事：列表读取失败的报错块与 Retry、忙碌态的禁用、ARIA 结构、
 * IME 守卫（组字中的 Enter / Escape）与「只认文本框里的 Enter」。真实的开合、切换与创建流程由
 * `apps/dev-rxdb-vue-e2e` 的 worktree 用例覆盖。按键用原生 `KeyboardEvent` 派发，与 e2e 同一口径。
 */

enableAutoUnmount(afterEach);

interface Row {
  readonly id: string;
  readonly active: boolean;
}

const COPY: ToolbarDropdownCopy = {
  caption: 'Current Worktree',
  heading: 'Worktrees',
  createButton: 'New worktree',
  createTitle: 'Create a worktree',
  filterPlaceholder: 'Filter',
  filterLabel: 'Filter worktrees',
  listLabel: 'Worktree list',
  backdropLabel: 'Close worktree menu',
  empty: 'No worktrees yet',
  noMatch: 'No matching worktrees'
};

const ROWS: readonly Row[] = [
  { id: 'main', active: true },
  { id: 'feature/x', active: false }
];

interface MountOptions {
  readonly items?: readonly Row[];
  readonly busy?: boolean;
  readonly listError?: string | null;
  readonly menuOpen?: boolean;
  readonly createOpen?: boolean;
}

const mountDropdown = (options: MountOptions = {}) =>
  mount(ToolbarDropdown<Row>, {
    attachTo: document.body,
    props: {
      testIdPrefix: 'wt-worktree',
      copy: COPY,
      icon: FolderTree,
      value: 'main',
      popupWidth: 320,
      items: options.items ?? ROWS,
      itemKey: row => row.id,
      itemLabel: row => row.id,
      itemBranchId: row => row.id,
      isActive: row => row.active,
      matches: (row, needle) => row.id.includes(needle),
      busy: options.busy ?? false,
      listError: options.listError ?? null,
      createError: null,
      createFocusKey: 'name',
      menuOpen: options.menuOpen ?? true,
      createOpen: options.createOpen ?? false
    },
    slots: {
      'row-meta': () => h('span', 'meta'),
      'row-actions': ({ item, busy }: { item: Row; busy: boolean }) =>
        h('button', { 'data-row-action': item.id, disabled: busy, type: 'button' }, 'remove'),
      create: () => [
        h('input', { 'data-autofocus': '', 'data-testid': 'name', type: 'text' }),
        h('input', { 'data-testid': 'mode', type: 'radio' })
      ]
    }
  });

/** 在元素上派发一次冒泡的原生 keydown。 */
const keydown = (target: EventTarget, init: KeyboardEventInit): void => {
  target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }));
};

describe('ToolbarDropdown', () => {
  it('ARIA：触发按钮 haspopup=dialog + aria-controls 指向列表弹层；行是 <li> 里不带 role 的按钮，当前项 aria-current', () => {
    const wrapper = mountDropdown();

    const trigger = wrapper.get('[data-testid="wt-worktree-menu"]');
    expect(trigger.attributes('aria-haspopup')).toBe('dialog');
    expect(trigger.attributes('aria-expanded')).toBe('true');
    expect(trigger.attributes('aria-controls')).toBe('wt-worktree-menu-popup');
    const popup = wrapper.get('[data-testid="wt-worktree-menu-popup"]');
    expect(popup.attributes('id')).toBe('wt-worktree-menu-popup');
    expect(popup.attributes('role')).toBe('dialog');
    expect(popup.attributes('aria-label')).toBe('Worktree list');
    expect(popup.attributes('aria-modal')).toBeUndefined();

    const rows = wrapper.findAll('[data-testid="wt-worktree-item"]');
    expect(rows.map(row => row.attributes('aria-current'))).toEqual(['true', undefined]);
    expect(rows.map(row => row.attributes('role'))).toEqual([undefined, undefined]);
    expect(rows.map(row => row.attributes('data-branch-id'))).toEqual(['main', 'feature/x']);
    expect(rows[0].element.parentElement?.closest('li')?.parentElement?.tagName).toBe('UL');
  });

  it('列表报错：role=alert 的提示块替换整个 <ul>，新建按钮禁用，Retry 发 retry', async () => {
    const wrapper = mountDropdown({ items: [], listError: "Couldn't load worktrees. boom" });

    const block = wrapper.get('[data-testid="wt-worktree-list-error"]');
    expect(block.attributes('role')).toBe('alert');
    expect(block.classes()).toContain('gd-warn-strip');
    expect(block.text()).toContain("Couldn't load worktrees. boom");
    expect(wrapper.find('ul').exists()).toBe(false);
    expect(wrapper.get('[data-testid="wt-worktree-create"]').attributes('disabled')).toBeDefined();

    await wrapper.get('[data-testid="wt-worktree-list-retry"]').trigger('click');
    expect(wrapper.emitted('retry')).toHaveLength(1);
  });

  it('忙碌：新建按钮与每个行按钮禁用，row-actions 槽拿到 busy', () => {
    const wrapper = mountDropdown({ busy: true });

    expect(wrapper.get('[data-testid="wt-worktree-create"]').attributes('disabled')).toBeDefined();
    const rows = wrapper.findAll('[data-testid="wt-worktree-item"]');
    expect(rows.every(row => row.attributes('disabled') !== undefined)).toBe(true);
    const actions = wrapper.findAll('[data-row-action]');
    expect(actions.every(action => action.attributes('disabled') !== undefined)).toBe(true);
  });

  it('忙碌：Create 禁用，文本框里的 Enter 也不提交', () => {
    const wrapper = mountDropdown({ busy: true, menuOpen: false, createOpen: true });

    expect(wrapper.get('[data-testid="wt-worktree-create-confirm"]').attributes('disabled')).toBeDefined();
    keydown(wrapper.get('[data-testid="name"]').element, { key: 'Enter' });
    expect(wrapper.emitted('confirm')).toBeUndefined();
  });

  it('IME：组字中的 Enter（isComposing 或 keyCode 229）不提交；普通 Enter 提交；只认文本框', () => {
    const wrapper = mountDropdown({ menuOpen: false, createOpen: true });
    const name = wrapper.get('[data-testid="name"]').element;

    keydown(name, { key: 'Enter', isComposing: true });
    keydown(name, { key: 'Enter', keyCode: 229 });
    expect(wrapper.emitted('confirm')).toBeUndefined();

    keydown(name, { key: 'Enter' });
    expect(wrapper.emitted('confirm')).toHaveLength(1);

    // 按钮上的 Enter 由原生 click 提交，单选框上的 Enter 不提交：两者都不经这条键盘路径。
    keydown(wrapper.get('[data-testid="wt-worktree-create-confirm"]').element, { key: 'Enter' });
    keydown(wrapper.get('[data-testid="mode"]').element, { key: 'Enter' });
    expect(wrapper.emitted('confirm')).toHaveLength(1);
  });

  it('IME：组字中的 Escape 不关菜单；普通 Escape 收起全部层；没有弹层开着时 Escape 什么都不做', async () => {
    const wrapper = mountDropdown();
    const filter = wrapper.get('input[aria-label="Filter worktrees"]').element;

    keydown(filter, { key: 'Escape', isComposing: true });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="wt-worktree-menu-popup"]').exists()).toBe(true);
    expect(wrapper.emitted('update:menuOpen')).toBeUndefined();

    keydown(filter, { key: 'Escape' });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="wt-worktree-menu-popup"]').exists()).toBe(false);
    expect(wrapper.emitted('update:menuOpen')).toEqual([[false]]);

    keydown(document, { key: 'Escape' });
    expect(wrapper.emitted('update:menuOpen')).toEqual([[false]]);
    expect(wrapper.emitted('update:createOpen')).toBeUndefined();
  });

  it('焦点：创建弹层打开后与 createFocusKey 变化后，聚焦带 data-autofocus 的控件', async () => {
    const wrapper = mountDropdown({ menuOpen: false });

    await wrapper.setProps({ createOpen: true });
    const name = wrapper.get('[data-testid="name"]').element;
    expect(document.activeElement).toBe(name);

    (wrapper.get('[data-testid="mode"]').element as HTMLElement).focus();
    await wrapper.setProps({ createFocusKey: 'other' });
    expect(document.activeElement).toBe(name);
  });

  it('点行：非当前项发 select，当前项只收起菜单', async () => {
    const wrapper = mountDropdown();
    const rows = wrapper.findAll('[data-testid="wt-worktree-item"]');

    await rows[1].trigger('click');
    expect(wrapper.emitted('select')).toEqual([[ROWS[1]]]);

    await rows[0].trigger('click');
    expect(wrapper.emitted('select')).toHaveLength(1);
    expect(wrapper.emitted('update:menuOpen')).toEqual([[false]]);
  });
});
