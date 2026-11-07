import { DestroyRef, inject } from '@angular/core';
import type { WujieBinding } from './binding.js';
import { createWujieBinding } from './binding.js';
import type { WujieAppOptions, WujieRuntime } from './types.js';

/** 绑定 Angular 注入上下文生命周期，可在 afterNextRender 中装载容器。 */
export function injectWujie(runtime: WujieRuntime, options: WujieAppOptions): WujieBinding {
  const binding = createWujieBinding(runtime, options);
  inject(DestroyRef).onDestroy(() => binding.unmount());
  return binding;
}

export type { WujieBinding } from './binding.js';
