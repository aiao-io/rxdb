import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, type Component } from 'vue';
import { createMemoryHistory, createRouter, RouterView, type Router } from 'vue-router';

/**
 * @fileoverview 详情页保存 / 取消后回到所在实体的列表：用真实 vue-router 解析最终地址，
 * 路由形状与 `src/router/index.ts` 一致（列表嵌在 `/entities` 壳页下、详情是扁平四段、未匹配回首页）。
 * 只断言传给 `push` 的实参测不到相对路径被解析到哪里。
 */

const stubs = vi.hoisted(() => ({ detail: null as unknown as Component }));

vi.mock('@aiao/rxdb-vue', () => ({ injectRxDB: () => ({}) }));

vi.mock('@aiao/rxdb-model-vue', async () => {
  const { defineComponent: define } = await import('vue');
  stubs.detail = define({
    name: 'EntityDetail',
    emits: ['formSubmitted', 'formCancelled'],
    setup: () => () => null
  });
  return { EntityDetail: stubs.detail };
});

import EntityDetailPage from './EntityDetailPage.vue';

// eslint-disable-next-line vue/one-component-per-file -- 测试桩：列表 / 首页只占位
const Blank = defineComponent({ setup: () => () => null });
// eslint-disable-next-line vue/one-component-per-file -- 测试桩：壳页只放出口
const Shell = defineComponent({ setup: () => () => h(RouterView) });

function createDemoRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/home', name: 'home', component: Blank },
      {
        path: '/entities',
        component: Shell,
        children: [
          { path: '', name: 'entity-index', component: Blank },
          { path: ':namespace/:name', name: 'entity-list', component: Blank }
        ]
      },
      { path: '/entities/:namespace/:name/:entityId', name: 'entity-detail', component: EntityDetailPage },
      { path: '/:pathMatch(.*)*', redirect: '/home' }
    ]
  });
}

const wrappers: VueWrapper[] = [];

async function openDeepLink(path: string) {
  const router = createDemoRouter();
  await router.push(path);
  await router.isReady();
  // eslint-disable-next-line vue/one-component-per-file -- 测试根组件：只放路由出口
  const wrapper = mount(defineComponent({ setup: () => () => h(RouterView) }), { global: { plugins: [router] } });
  wrappers.push(wrapper);
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  return { detail: wrapper.findComponent(stubs.detail), router };
}

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  vi.restoreAllMocks();
});

describe('EntityDetailPage：返回实体列表', () => {
  it.each([
    ['formSubmitted', { title: 'todo-1' }],
    ['formCancelled', undefined]
  ])('深链进入后 %s 回到所在实体的列表，而不是落到首页', async (event, payload) => {
    const { detail, router } = await openDeepLink('/entities/public/Todo/abc');
    expect(router.currentRoute.value.name).toBe('entity-detail');

    detail.vm.$emit(event, payload);
    await flushPromises();

    expect(router.currentRoute.value.fullPath).toBe('/entities/public/Todo');
    expect(router.currentRoute.value.name).toBe('entity-list');
  });

  it('非 public 命名空间同样回到自己的列表', async () => {
    const { detail, router } = await openDeepLink('/entities/other/ShellOther/42');

    detail.vm.$emit('formCancelled');
    await flushPromises();

    expect(router.currentRoute.value.fullPath).toBe('/entities/other/ShellOther');
  });
});
