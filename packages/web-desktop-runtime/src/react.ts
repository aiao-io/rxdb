import { useEffect, useMemo } from 'react';
import type { WujieBinding } from './binding.js';
import { createWujieBinding } from './binding.js';
import type { WujieAppOptions, WujieRuntime } from './types.js';

/** 绑定 React 组件生命周期；options 应使用稳定引用，容器就绪后调用 mount。 */
export function useWujie(runtime: WujieRuntime, options: WujieAppOptions): WujieBinding {
  const binding = useMemo(() => createWujieBinding(runtime, options), [runtime, options]);
  useEffect(() => () => binding.unmount(), [binding]);
  return binding;
}

export type { WujieBinding } from './binding.js';
