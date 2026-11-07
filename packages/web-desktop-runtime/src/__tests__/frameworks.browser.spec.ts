import '@angular/compiler';
import { runInInjectionContext } from '@angular/core';
import { createApplication } from '@angular/platform-browser';
import { createElement, StrictMode, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { createApp, h, onMounted, ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { injectWujie } from '../angular.js';
import { createWujie } from '../index.js';
import { useWujie as useReactWujie } from '../react.js';
import { useWujie as useVueWujie } from '../vue.js';
import type { WujieAppOptions } from '../types.js';

function setup() {
  const container = document.createElement('div'); document.body.append(container);
  const runtime = createWujie({ onError: () => undefined });
  const options: WujieAppOptions = { appId: 'framework', instanceId: crypto.randomUUID(), version: '1', url: new URL('/test-app/app.html', location.href).href, timeout: 10_000 };
  return { container, runtime, options, cleanup: () => { runtime.dispose(); container.remove(); } };
}

describe('三框架生命周期对称', () => {
  it('React StrictMode 重挂后仍只有一个实例，卸载即释放', async () => {
    const { container, runtime, options, cleanup } = setup();
    const root = createRoot(container);
    function Host() {
      const element = useRef<HTMLDivElement>(null);
      const binding = useReactWujie(runtime, options);
      useEffect(() => { void binding.mount(element.current!).catch(() => undefined); }, [binding]);
      return createElement('div', { ref: element });
    }
    try {
      root.render(createElement(StrictMode, null, createElement(Host)));
      await vi.waitFor(() => expect(runtime.instances.map(instance => instance.state)).toEqual(['ready']), { timeout: 15_000 });
      root.unmount(); expect(runtime.instances).toEqual([]);
    } finally { cleanup(); }
  }, 20_000);

  it('Vue 组件使用同一 binding 契约，作用域关闭释放实例', async () => {
    const { container, runtime, options, cleanup } = setup();
    const app = createApp({ setup() {
      const element = ref<HTMLElement>();
      const binding = useVueWujie(runtime, options);
      onMounted(() => { void binding.mount(element.value!).catch(() => undefined); });
      return () => h('div', { ref: element });
    } });
    try {
      app.mount(container);
      await vi.waitFor(() => expect(runtime.instances.map(instance => instance.state)).toEqual(['ready']), { timeout: 15_000 });
      app.unmount(); expect(runtime.instances).toEqual([]);
    } finally { cleanup(); }
  }, 20_000);

  it('Angular 注入上下文使用同一 binding 契约，DestroyRef 释放实例', async () => {
    const { container, runtime, options, cleanup } = setup();
    const app = await createApplication();
    try {
      const binding = runInInjectionContext(app.injector, () => injectWujie(runtime, options));
      await binding.mount(container);
      app.destroy(); expect(runtime.instances).toEqual([]);
    } finally { cleanup(); }
  });

  it.each(['react', 'vue', 'angular'])('真实 %s 子应用在渲染后才 ready', async framework => {
    const { container, runtime, options, cleanup } = setup();
    try {
      const instance = runtime.createApp({ ...options, url: options.url + '?framework=' + framework });
      await instance.mount(container);
      const result = await instance.request('inspect');
      expect(result).toMatchObject({ text: options.instanceId });
    } finally { cleanup(); }
  }, 20_000);
});
