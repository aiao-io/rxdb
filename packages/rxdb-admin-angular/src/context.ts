import type { AdminShell, ReadableStore } from '@aiao/rxdb-admin';
import {
  DestroyRef,
  inject,
  InjectionToken,
  makeEnvironmentProviders,
  provideEnvironmentInitializer,
  signal,
  type EnvironmentProviders,
  type Signal
} from '@angular/core';
import type { LucideIconInput } from '@lucide/angular';

/**
 * 菜单、面包屑与命令面板条目使用的图标类型：`@lucide/angular` 的图标输入（图标类、图标数据或图标名）。
 * 创建外壳时以它作为泛型参数：`createAdminShell<AdminIcon>({ ... })`。
 */
export type AdminIcon = LucideIconInput;

/** 当前注入器中的后台外壳。 */
export const ADMIN_SHELL = new InjectionToken<AdminShell<AdminIcon>>('AdminShell');

/**
 * 提供外壳，并在环境初始化时把外壳绑定到浏览器（快捷键、主题、布局变量、标题），注入器销毁时解除。
 * 环境初始化早于任何组件的首次渲染，因此不会出现主题闪烁；`attach` 幂等。
 * @param shell - 由 `createAdminShell` 创建的外壳。
 * @returns 环境提供器，放进 `bootstrapApplication` / 路由 / `TestBed` 的 `providers`。
 * @example
 * ```ts
 * const shell = createAdminShell<AdminIcon>({ navigate: url => void router.navigateByUrl(url), brand: { title: '工作台' } });
 * bootstrapApplication(App, { providers: [provideAdminShell(shell)] });
 * ```
 */
export function provideAdminShell(shell: AdminShell<AdminIcon>): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: ADMIN_SHELL, useValue: shell },
    provideEnvironmentInitializer(() => {
      const detach = shell.attach();
      inject(DestroyRef).onDestroy(detach);
    })
  ]);
}

/**
 * 读取最近的外壳，须在注入上下文中调用。
 * @returns 外壳。
 * @throws 缺少 {@link provideAdminShell} 时抛错。
 */
export function injectAdminShell(): AdminShell<AdminIcon> {
  const shell = inject(ADMIN_SHELL, { optional: true });
  if (!shell) throw new Error('provideAdminShell() is missing. Add provideAdminShell(shell) to the providers.');
  return shell;
}

/**
 * 把外壳的可读存储桥接为 signal：值变化时依赖它的模板 / `computed` 重新计算；随当前注入上下文销毁而退订。
 * 须在注入上下文（构造函数或字段初始化器）中调用。
 * @param store - 外壳暴露的任一可读存储。
 * @returns 只读 signal，初值是存储的当前快照。
 */
export function injectAdminStore<T>(store: ReadableStore<T>): Signal<T> {
  const state = signal(store.value);
  const unsubscribe = store.subscribe(value => state.set(value));
  inject(DestroyRef).onDestroy(unsubscribe);
  return state.asReadonly();
}

/**
 * 翻译函数。在模板、`computed` 或 `effect` 里调用时会建立对 `shell.text` 的信号依赖，
 * 因此语言或目录变化后，OnPush + zoneless 的组件也会重新渲染。须在注入上下文中调用。
 * @returns 翻译外壳文案的函数。
 */
export function injectAdminText(): AdminShell['t'] {
  const shell = injectAdminShell();
  const revision = injectAdminStore(shell.text);
  return (key, params) => {
    revision();
    return shell.t(key, params);
  };
}
