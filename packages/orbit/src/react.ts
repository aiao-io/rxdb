import { useEffect, useMemo } from 'react';
import type { OrbitBinding } from './binding.js';
import { createOrbitBinding } from './binding.js';
import type { OrbitAppOptions, OrbitRuntime } from './types.js';

/** 绑定 React 组件生命周期；options 应使用稳定引用，容器就绪后调用 mount。 */
export function useOrbit(runtime: OrbitRuntime, options: OrbitAppOptions): OrbitBinding {
  const binding = useMemo(() => createOrbitBinding(runtime, options), [runtime, options]);
  useEffect(() => () => binding.unmount(), [binding]);
  return binding;
}

export type { OrbitBinding } from './binding.js';
