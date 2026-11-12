import type { WorkbenchEditorMount } from './editor.js';
import type { WorkbenchDiffMount } from './workbench-diff.js';

interface MonacoModule {
  readonly mountMonacoEditor: WorkbenchEditorMount;
  readonly mountMonacoDiff: WorkbenchDiffMount;
}

let loading: Promise<MonacoModule> | undefined;

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
function loadMonaco(): Promise<MonacoModule> {
  const base = new URL('/browser-workbench-assets/monaco/', location.href);
  loading ??= Promise.all([
    import(/* @vite-ignore */ new URL('editor.js', base).href) as Promise<MonacoModule>,
    loadStyles(new URL('editor.css', base))
  ])
    .then(([module]) => module)
    .catch((error: unknown) => {
      loading = undefined;
      throw error;
    });
  return loading;
}

/** 按需加载源码编辑器，与差异视图共享脚本和样式。 */
export async function loadMonacoEditor(): Promise<WorkbenchEditorMount> {
  return (await loadMonaco()).mountMonacoEditor;
}

/** 按需加载只读双栏差异编辑器。 */
export async function loadMonacoDiff(): Promise<WorkbenchDiffMount> {
  return (await loadMonaco()).mountMonacoDiff;
}
