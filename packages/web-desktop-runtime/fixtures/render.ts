import type { WujieClient } from '../src/types.js';

export async function render(client: WujieClient, framework: string | null): Promise<void> {
  const text = client.context.instanceId;
  const root = document.getElementById('root')!;
  if (framework === 'react') {
    const { createElement, useEffect } = await import('react');
    const { createRoot } = await import('react-dom/client');
    function App() { useEffect(() => client.ready(), []); return createElement('span', null, text); }
    const app = createRoot(root); client.onDispose(() => app.unmount()); app.render(createElement(App)); return;
  }
  if (framework === 'vue') {
    const { createApp, h, nextTick } = await import('vue');
    const app = createApp({ render: () => h('span', text) }); app.mount(root); client.onDispose(() => app.unmount()); await nextTick(); client.ready(); return;
  }
  if (framework === 'angular') {
    await import('@angular/compiler');
    const { Component } = await import('@angular/core');
    const { bootstrapApplication } = await import('@angular/platform-browser');
    class App { label = text; }
    Component({ selector: 'fixture-app', standalone: true, template: '{{ label }}' })(App);
    root.replaceChildren(document.createElement('fixture-app'));
    const app = await bootstrapApplication(App); client.onDispose(() => app.destroy()); await app.whenStable(); client.ready(); return;
  }
  root.textContent = text; client.ready();
}
