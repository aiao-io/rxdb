import type { WujieAppOptions, WujieInstance, WujieRuntime } from './types.js';

/** 三框架共享的容器绑定；卸载后再次 mount 会创建新实例。 */
export interface WujieBinding {
  /** 当前实例，首次装载前或卸载后为空。 */
  readonly instance: WujieInstance | undefined;
  /** 装载实例；重复调用同容器复用事务。 */
  mount(container: HTMLElement): Promise<void>;
  /** 销毁当前实例；允许 React StrictMode 再次装载。 */
  unmount(): void;
}

/** 创建与具体框架无关的容器绑定。 */
export function createWujieBinding(runtime: WujieRuntime, options: WujieAppOptions): WujieBinding {
  let current: WujieInstance | undefined;
  return {
    get instance() {
      return current;
    },
    mount(container) {
      current ??= runtime.createApp(options);
      return current.mount(container);
    },
    unmount() {
      current?.destroy();
      current = undefined;
    }
  };
}
