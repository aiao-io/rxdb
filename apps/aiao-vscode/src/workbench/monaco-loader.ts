import type { WorkbenchEditorMount } from './editor.js';

let loading: Promise<WorkbenchEditorMount> | undefined;

function loadStyles(url: URL): Promise<void> {
  return new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = url.href;
    link.onload = () => resolve();
    link.onerror = () => {
      link.remove();
      reject(new Error('Monaco 样式加载失败'));
    };
    document.head.append(link);
  });
}

/** 同时加载自托管脚本与样式，资源就绪后再创建编辑器。 */
export function loadMonacoEditor(): Promise<WorkbenchEditorMount> {
  const base = new URL('/browser-workbench-assets/monaco/', location.href);
  loading ??= Promise.all([
    import(/* @vite-ignore */ new URL('editor.js', base).href) as Promise<{ mountMonacoEditor: WorkbenchEditorMount }>,
    loadStyles(new URL('editor.css', base))
  ])
    .then(([module]) => module.mountMonacoEditor)
    .catch((error: unknown) => {
      loading = undefined;
      throw error;
    });
  return loading;
}
