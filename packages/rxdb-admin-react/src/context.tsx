import type { AdminShell, ReadableStore } from '@aiao/rxdb-admin';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode
} from 'react';

const ShellContext = createContext<AdminShell<ReactNode> | undefined>(undefined);

/** {@link AdminShellProvider} 的属性。 */
export interface AdminShellProviderProps {
  /** 由 `createAdminShell` 创建的外壳。 */
  readonly shell: AdminShell<ReactNode>;
  /** 子树。 */
  readonly children?: ReactNode;
}

/**
 * 为子树提供外壳，并在挂载期间把外壳绑定到浏览器（快捷键、主题、布局变量、标题）。
 * 为避免首屏闪烁，建议在首次渲染之前就调用 `shell.attach()`；`attach` 幂等。
 * @param props - 外壳与子树。
 * @returns Provider 元素。
 */
export function AdminShellProvider({ shell, children }: AdminShellProviderProps): ReactElement {
  useEffect(() => shell.attach(), [shell]);
  return <ShellContext.Provider value={shell}>{children}</ShellContext.Provider>;
}

/**
 * 读取最近的外壳。
 * @returns 外壳。
 * @throws 缺少 {@link AdminShellProvider} 时抛错。
 */
export function useAdminShell(): AdminShell<ReactNode> {
  const shell = useContext(ShellContext);
  if (!shell) throw new Error('AdminShellProvider is missing. Wrap the tree in <AdminShellProvider shell={...}>.');
  return shell;
}

/**
 * 订阅一个外壳存储，返回当前快照；值变化时重新渲染。
 * @param store - 外壳暴露的任一可读存储。
 * @returns 当前值。
 */
export function useAdminStore<T>(store: ReadableStore<T>): T {
  const subscribe = useCallback((notify: () => void) => store.subscribe(() => notify()), [store]);
  return useSyncExternalStore(
    subscribe,
    () => store.value,
    () => store.value
  );
}

/**
 * 翻译函数，语言或目录变化时重新渲染。
 * @returns 翻译外壳文案的函数。
 */
export function useAdminText(): AdminShell['t'] {
  const shell = useAdminShell();
  useAdminStore(shell.text);
  return shell.t;
}
