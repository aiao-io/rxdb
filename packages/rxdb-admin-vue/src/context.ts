import type { AdminShell, ReadableStore } from '@aiao/rxdb-admin';
import { inject, onScopeDispose, shallowRef, type Component, type InjectionKey, type Ref, type ShallowRef } from 'vue';

/** 外壳的注入键，只在包内使用：Provider 提供、各组件经 {@link useAdminShell} 读取。 */
export const ADMIN_SHELL_KEY: InjectionKey<AdminShell<Component>> = Symbol('rxdb-admin-shell');

/**
 * 读取最近的外壳。
 * @returns 外壳。
 * @throws 缺少 `AdminShellProvider` 时抛错。
 */
export function useAdminShell(): AdminShell<Component> {
  const shell = inject<AdminShell<Component> | undefined>(ADMIN_SHELL_KEY, undefined);
  if (!shell) throw new Error('AdminShellProvider is missing. Wrap the tree in <AdminShellProvider :shell="...">.');
  return shell;
}

/**
 * 订阅一个外壳存储，返回随之更新的只读 ref；组件卸载（作用域释放）时自动退订。
 * 值用 `shallowRef` 承载：存储里的快照是不可变的，不需要也不应该被 Vue 深层代理（菜单图标是组件对象）。
 * @param store - 外壳暴露的任一可读存储。
 * @returns 当前值的只读 ref。
 */
export function useAdminStore<T>(store: ReadableStore<T>): Readonly<Ref<T>> {
  const state = shallowRef(store.value) as ShallowRef<T>;
  onScopeDispose(
    store.subscribe(value => {
      state.value = value;
    })
  );
  return state;
}

/**
 * 翻译函数，语言或目录变化时模板重新渲染：每次调用都会读取文案修订号，渲染副作用因此依赖它。
 * @returns 翻译外壳文案的函数。
 */
export function useAdminText(): AdminShell['t'] {
  const shell = useAdminShell();
  const revision = useAdminStore(shell.text);
  return (key, params) => {
    void revision.value;
    return shell.t(key, params);
  };
}
