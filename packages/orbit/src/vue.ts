import { onScopeDispose } from 'vue';
import type { OrbitBinding } from './binding.js';
import { createOrbitBinding } from './binding.js';
import type { OrbitAppOptions, OrbitRuntime } from './types.js';

/** 绑定 Vue 作用域生命周期，容器就绪后调用 mount。 */
export function useOrbit(runtime: OrbitRuntime, options: OrbitAppOptions): OrbitBinding {
  const binding = createOrbitBinding(runtime, options);
  onScopeDispose(() => binding.unmount());
  return binding;
}

export type { OrbitBinding } from './binding.js';
