/**
 * @fileoverview Vue 组件测试的挂载辅助。
 *
 * `useInfiniteScroll` / `useRxDB` 依赖 `provideRxDB` 的注入键（包内 Symbol，
 * 测试无法经 `global.provide` 提供），因此这里用宿主组件在 setup 里
 * `provideRxDB(rxdb)` 后再渲染目标组件 —— 等价 Angular 侧
 * TestBed `{ provide: RxDB, useValue: rxdb }`。props 经 attrs 透传、事件在
 * `wrapper.findComponent(Child)` 上断言。
 */
import type { RxDB } from '@aiao/rxdb';
import { provideRxDB } from '@aiao/rxdb-vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, h, provide, useAttrs, type Component, type InjectionKey } from 'vue';
import { ENTITY_DIALOG_CONTEXT } from '../../entity-dialog/dialog-context';

/** 提供 RxDB 的宿主（props/插槽经 attrs / slots 透传给目标组件）。 */
export function createRxDBHost(rxdb: RxDB, child: Component): Component {
  return defineComponent({
    setup(_props, { slots }) {
      provideRxDB(rxdb);
      const attrs = useAttrs();
      return () => h(child, attrs, slots);
    }
  });
}

/** 提供 RxDB + 对话框关闭上下文（CDK `DialogRef` 的包内替代）的宿主。 */
export function createRxDBDialogHost(rxdb: RxDB, close: (result?: unknown) => unknown, child: Component): Component {
  return defineComponent({
    setup(_props, { slots }) {
      provideRxDB(rxdb);
      provide(ENTITY_DIALOG_CONTEXT, { close });
      const attrs = useAttrs();
      return () => h(child, attrs, slots);
    }
  });
}

/** 提供任意 inject 键值对的宿主。 */
export function createProvidedHost(provides: Array<[InjectionKey<unknown>, unknown]>, child: Component): Component {
  return defineComponent({
    setup(_props, { slots }) {
      for (const [key, value] of provides) {
        provide(key, value);
      }
      const attrs = useAttrs();
      return () => h(child, attrs, slots);
    }
  });
}

/** 带 RxDB provider 挂载目标组件。 */
export function mountWithRxDB(
  component: Component,
  rxdb: RxDB,
  options?: Record<string, unknown>
): { wrapper: VueWrapper; child: VueWrapper } {
  const host = createRxDBHost(rxdb, component);
  const wrapper = mount(host, options as never);
  const child: VueWrapper = wrapper.findComponent(component as never) as never;
  return { wrapper, child };
}
