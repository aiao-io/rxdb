import type {
  WorkbenchEditorDiagnostic,
  WorkbenchEditorEngine,
  WorkbenchEditorHandle,
  WorkbenchEditorMount,
  WorkbenchEditorOptions,
  WorkbenchEditorViewState
} from './editor.js';

/** 按需加载编辑器，切换或关闭后忽略已过期的加载结果。 */
export function mountSwitchableEditor(
  host: HTMLElement,
  initial: WorkbenchEditorOptions,
  load: (engine: WorkbenchEditorEngine) => Promise<WorkbenchEditorMount>
): WorkbenchEditorHandle {
  let value = initial.value;
  let language = initial.language;
  let indentUnit = initial.indentUnit;
  let diagnostics: readonly WorkbenchEditorDiagnostic[] = [];
  let viewState: WorkbenchEditorViewState | undefined;
  let engine: WorkbenchEditorEngine | undefined;
  let current: WorkbenchEditorHandle | undefined;
  let generation = 0;
  let disposed = false;
  let focusRequested = false;

  function change(content: string): void {
    value = content;
    initial.onChange(content);
  }

  function setEngine(next: WorkbenchEditorEngine): void {
    if (disposed || engine === next) return;
    engine = next;
    viewState = current?.getViewState?.() ?? viewState;
    current?.dispose();
    current = undefined;
    const request = ++generation;
    const loading = document.createElement('div');
    loading.className = 'wb-editor-loading';
    loading.textContent = '正在加载编辑器…';
    host.replaceChildren(loading);
    host.dataset['editorEngine'] = next;
    host.setAttribute('aria-busy', 'true');
    void load(next)
      .then(mount => {
        if (disposed || request !== generation) return;
        const surface = document.createElement('div');
        surface.className = 'wb-editor-surface';
        surface.style.cssText = 'height:100%;width:100%;overflow:hidden';
        host.replaceChildren(surface);
        current = mount(surface, { ...initial, value, language, indentUnit, engine: next, onChange: change });
        current.setDiagnostics?.(diagnostics);
        if (viewState) current.restoreViewState?.(viewState);
        current.layout?.();
        if (focusRequested) current.focus?.();
        host.removeAttribute('aria-busy');
      })
      .catch((error: unknown) => {
        if (disposed || request !== generation) return;
        current?.dispose();
        current = undefined;
        const message = document.createElement('div');
        message.setAttribute('role', 'alert');
        message.textContent = `编辑器加载失败：${error instanceof Error ? error.message : String(error)}`;
        host.replaceChildren(message);
        host.removeAttribute('aria-busy');
      });
  }

  setEngine(initial.engine);
  return {
    update(content, nextLanguage) {
      value = content;
      language = nextLanguage;
      current?.update(content, nextLanguage);
    },
    replace(content) {
      if (current) current.replace(content);
      else change(content);
    },
    layout: () => current?.layout?.(),
    focus() {
      focusRequested = true;
      current?.focus?.();
    },
    runCommand: (command, argument) => current?.runCommand?.(command, argument) ?? false,
    setIndentUnit(unit) {
      indentUnit = unit;
      current?.setIndentUnit?.(unit);
    },
    setDiagnostics(next) {
      diagnostics = next;
      current?.setDiagnostics?.(next);
    },
    getViewport: () => current?.getViewport?.(),
    scrollToLine: line => current?.scrollToLine?.(line),
    getViewState: () => current?.getViewState?.() ?? viewState ?? { anchor: 0, head: 0, scrollTop: 0, scrollLeft: 0 },
    restoreViewState(state) {
      viewState = state;
      current?.restoreViewState?.(state);
    },
    setEngine,
    dispose() {
      if (disposed) return;
      disposed = true;
      generation++;
      current?.dispose();
      current = undefined;
      host.replaceChildren();
    }
  };
}
