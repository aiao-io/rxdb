import type { AdminShell, AdminShellOptions, MenuNode, PasswordHasher } from '@aiao/rxdb-admin';
import { createTestShell, type FakeWindowOptions, type TestShell } from '@aiao/rxdb-admin/testing';
import { mount as mountVue, type VueWrapper } from '@vue/test-utils';
import { defineComponent, h, nextTick, shallowReactive, type Component, type VNodeChild } from 'vue';
import AdminShellProvider from '../admin-shell-provider.vue';
import AdminLayout from '../layout/admin-layout.vue';

export const fakeHasher: PasswordHasher = { hash: async (password, salt) => `${salt}:${password}` };

export const menu: MenuNode<Component>[] = [
  {
    id: 'entities',
    label: '实体',
    expanded: true,
    children: [
      { id: 'asset', label: '资产', route: '/entities/assets/Asset', testId: 'nav-asset' },
      { id: 'category', label: '资产分类', route: '/entities/assets/AssetCategory', testId: 'nav-category' }
    ]
  },
  {
    id: 'data',
    label: '数据',
    expanded: true,
    children: [{ id: 'search', label: '搜索', route: '/search', testId: 'nav-search' }]
  }
];

/** {@link AdminLayout} 的插槽，写法对应 React 版的 `brandIcon` / `renderMenuExtra` / `headerStart` / `headerEnd`。 */
export interface LayoutSlots {
  'brand-icon'?: () => VNodeChild;
  'menu-extra'?: (props: { node: MenuNode<Component> }) => VNodeChild;
  'header-start'?: () => VNodeChild;
  'header-end'?: () => VNodeChild;
}

/** 挂载时可改的布局输入，`rerender` 传入同样的形状。 */
export interface LayoutInput {
  menu: readonly MenuNode<Component>[];
  url: string;
  navigating: boolean;
  slots: LayoutSlots;
}

export interface Mounted extends TestShell<Component> {
  readonly wrapper: VueWrapper;
  /** 改布局输入并等一次更新（对应 React 的 `rerender`）。 */
  rerender(input: Partial<LayoutInput>): Promise<void>;
}

const mounted = new Set<VueWrapper>();

/** 登记挂载的树，手动 `unmount` 之后从登记里移除，避免 `cleanup` 重复卸载。 */
function track(wrapper: VueWrapper): VueWrapper {
  const unmount = wrapper.unmount.bind(wrapper);
  wrapper.unmount = () => {
    mounted.delete(wrapper);
    unmount();
  };
  mounted.add(wrapper);
  return wrapper;
}

/** 卸载本文件挂载的所有树并清空文档（对应 `@testing-library/react` 的 `cleanup`）。 */
export function cleanup(): void {
  for (const wrapper of [...mounted]) wrapper.unmount();
  document.body.innerHTML = '';
}

/**
 * 把任意组件挂到文档上（对应 `@testing-library/react` 的 `render`）。
 * 外壳不经 VTU 的 `props` 传入：VTU 会把 props 深度代理，外壳里的 `#private` 字段在代理上读不到。
 */
export function render(component: Component): VueWrapper {
  return track(mountVue(component, { attachTo: document.body }));
}

/**
 * 把子组件放进 `AdminShellProvider` 里挂载，用于不需要整个布局的用例。
 * 外壳经渲染函数的闭包传入，不走 VTU 的 `props`（理由同 {@link render}）。
 */
export function renderWithShell(shell: AdminShell<Component>, child: Component): VueWrapper {
  return render({ render: () => h(AdminShellProvider, { shell }, { default: () => h(child) }) });
}

/**
 * 用测试外壳挂载 `AdminShellProvider` + `AdminLayout`。
 * 布局输入放在 `shallowReactive` 里而不是 VTU 的 props：VTU 会把 props 深度代理，菜单图标（组件对象）会被代理后触发 Vue 的告警。
 */
export function mount(
  options: Partial<AdminShellOptions<Component>> = {},
  input: Partial<LayoutInput> = {},
  windowOptions: FakeWindowOptions = {}
): Mounted {
  const test = createTestShell<Component>(
    { brand: { title: '工作台' }, lockHasher: fakeHasher, ...options },
    windowOptions
  );
  const state = shallowReactive<LayoutInput>({
    menu,
    url: '/entities/assets/Asset',
    navigating: false,
    slots: {},
    ...input
  });
  const Host = defineComponent({
    setup: () => () =>
      h(
        AdminShellProvider,
        { shell: test.shell },
        {
          default: () =>
            h(
              AdminLayout,
              { menu: state.menu, url: state.url, navigating: state.navigating },
              { default: () => h('p', { 'data-testid': 'page' }, '页面内容'), ...state.slots }
            )
        }
      )
  });
  const wrapper = render(Host);
  return {
    ...test,
    wrapper,
    rerender: async next => {
      Object.assign(state, next);
      await nextTick();
    }
  };
}
