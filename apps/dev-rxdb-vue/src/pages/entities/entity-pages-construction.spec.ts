import { Entity, EntityBase } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref, type Component } from 'vue';

// ── 测试夹具 ──────────────────────────────────────────────

/** 非 public namespace 的测试实体（壳页分组用）。 */
@Entity({ name: 'ShellOther', namespace: 'other' })
class ShellOther extends EntityBase {}

/** 每次用例可替换的 mock rxdb（壳页 / 列表页 / 详情页都注入它）。 */
const rxdbHolder = vi.hoisted(() => ({ current: { config: { entities: [] as unknown[] } } }));
const push = vi.hoisted(() => vi.fn());
const routeHolder = vi.hoisted(() => ({
  current: { fullPath: '/entities', params: {} as Record<string, string> }
}));
/** 组件桩的记录器与桩本体：mock 工厂在导入期执行（早于模块体），共享状态只能走 hoisted。 */
const stubs = vi.hoisted(() => ({
  listProps: { props: null as Record<string, unknown> | null },
  detailProps: { props: null as Record<string, unknown> | null },
  EntityListStub: null as unknown as Component,
  EntityDetailStub: null as unknown as Component
}));

vi.mock('@aiao/rxdb-vue', () => ({
  injectRxDB: () => rxdbHolder.current,
  useCount: () => ({
    value: ref(0),
    error: undefined,
    isLoading: false,
    isEmpty: undefined,
    hasValue: false
  })
}));

vi.mock('vue-router', async () => {
  const { defineComponent } = await import('vue');
  return {
    RouterLink: defineComponent({ template: '<a><slot /></a>' }),
    RouterView: defineComponent({ template: '<div><slot /></div>' }),
    useRoute: () => routeHolder.current,
    useRouter: () => ({ push })
  };
});

vi.mock('@aiao/rxdb-model-vue', async () => {
  const { defineComponent } = await import('vue');
  stubs.EntityListStub = defineComponent({
    name: 'EntityList',
    props: { namespace: String, name: String },
    setup: props => {
      stubs.listProps.props = props;
      return () => null;
    }
  });
  stubs.EntityDetailStub = defineComponent({
    name: 'EntityDetail',
    props: { namespace: String, name: String, entityId: String },
    emits: ['formSubmitted', 'formCancelled'],
    setup(props) {
      stubs.detailProps.props = props;
      return () => null;
    }
  });
  return { EntityList: stubs.EntityListStub, EntityDetail: stubs.EntityDetailStub };
});

import EntityDetailPage from './EntityDetailPage.vue';
import EntityListPage from './EntityListPage.vue';
import EntityShellPage from './EntityShellPage.vue';

const makeRxdb = (entities: unknown[] = [Todo]) => ({ config: { entities } });

const setRoute = (fullPath: string, params: Record<string, string>) => {
  routeHolder.current = { fullPath, params };
};

describe('entity demo page construction contracts', () => {
  beforeEach(() => {
    push.mockClear();
    stubs.listProps.props = null;
    stubs.detailProps.props = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('entity 壳页：public 实体平铺、其余按 namespace 分组，无路由参数时重定向到首个实体', async () => {
    rxdbHolder.current = makeRxdb([ShellOther, Todo]);
    setRoute('/entities', {});

    const wrapper: VueWrapper = mount(EntityShellPage);
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('Todo');
    expect(wrapper.text()).toContain('ShellOther');
    expect(wrapper.text()).toContain('other');
    expect(wrapper.text()).toContain('共 2 个实体');
    // 空路由参数 → 命名路由导航到首个实体
    expect(push).toHaveBeenCalledWith({ name: 'entity-list', params: { namespace: 'other', name: 'ShellOther' } });
  });

  it('entity 壳页：已有 namespace/name 路由参数时不重定向', async () => {
    rxdbHolder.current = makeRxdb([ShellOther, Todo]);
    setRoute('/entities/public/Todo', { namespace: 'public', name: 'Todo' });

    mount(EntityShellPage);
    await Promise.resolve();

    expect(push).not.toHaveBeenCalled();
  });

  it('entity-list 页以 namespace/name 路由参数定位实体（查看由组件内置编辑对话框承载）', async () => {
    rxdbHolder.current = makeRxdb();
    setRoute('/entities/public/Todo', { namespace: 'public', name: 'Todo' });

    const wrapper: VueWrapper = mount(EntityListPage);
    await wrapper.vm.$nextTick();

    expect(stubs.listProps.props).toMatchObject({ namespace: 'public', name: 'Todo' });
  });

  it('entity-detail 页按 namespace/name/entityId 路由参数定位实体，提交/取消后相对导航回实体列表', async () => {
    rxdbHolder.current = makeRxdb();
    setRoute('/entities/public/Todo/abc', { namespace: 'public', name: 'Todo', entityId: 'abc' });
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    const wrapper: VueWrapper = mount(EntityDetailPage);
    await wrapper.vm.$nextTick();

    expect(stubs.detailProps.props).toMatchObject({ namespace: 'public', name: 'Todo', entityId: 'abc' });

    wrapper.findComponent(stubs.EntityDetailStub).vm.$emit('formSubmitted', { title: 'todo-1' });
    wrapper.findComponent(stubs.EntityDetailStub).vm.$emit('formCancelled');
    await wrapper.vm.$nextTick();

    expect(infoSpy).toHaveBeenCalledTimes(2);
    expect(push).toHaveBeenCalledTimes(2);
    expect(push).toHaveBeenNthCalledWith(1, '..');
    expect(push).toHaveBeenNthCalledWith(2, '..');
  });
});
