import { DestroyRef, inject } from '@angular/core';
import type { OrbitBinding } from './binding.js';
import { createOrbitBinding } from './binding.js';
import type { OrbitAppOptions, OrbitRuntime } from './types.js';

/** 绑定 Angular 注入上下文生命周期，可在 afterNextRender 中装载容器。 */
export function injectOrbit(runtime: OrbitRuntime, options: OrbitAppOptions): OrbitBinding {
  const binding = createOrbitBinding(runtime, options);
  inject(DestroyRef).onDestroy(() => binding.unmount());
  return binding;
}

export type { OrbitBinding } from './binding.js';
