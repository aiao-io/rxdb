import { onScopeDispose } from 'vue';
import type { WujieBinding } from './binding.js';
import { createWujieBinding } from './binding.js';
import type { WujieAppOptions, WujieRuntime } from './types.js';

/** 绑定 Vue 作用域生命周期，容器就绪后调用 mount。 */
export function useWujie(runtime: WujieRuntime, options: WujieAppOptions): WujieBinding {
  const binding = createWujieBinding(runtime, options);
  onScopeDispose(() => binding.unmount());
  return binding;
}

export type { WujieBinding } from './binding.js';
