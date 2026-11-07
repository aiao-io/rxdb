import { computeMinimalDocumentChange } from '@aiao/code-editor';
import * as monaco from 'monaco-editor';
import type { WorkbenchEditorMount } from './editor.js';

const workerKinds: Readonly<Record<string, string>> = {
  typescript: 'typescript',
  javascript: 'typescript',
  json: 'json',
  css: 'css',
  scss: 'css',
  less: 'css',
  html: 'html',
  handlebars: 'html',
  razor: 'html'
};
const languageIds: Readonly<Record<string, string>> = { tsx: 'typescript', jsx: 'javascript', vue: 'html' };
const extensions: Readonly<Record<string, string>> = {
  typescript: 'ts',
  javascript: 'js',
  vue: 'vue',
  plaintext: 'txt'
};
let nextModel = 0;

const environment = globalThis as typeof globalThis & { MonacoEnvironment?: monaco.Environment };
environment.MonacoEnvironment = {
  getWorker(_moduleId, label) {
    const kind = workerKinds[label] ?? 'editor-worker';
    return new Worker(new URL(`/browser-workbench-assets/monaco/${kind}.js`, location.href), {
      type: 'module',
      name: `monaco-${kind}`
    });
  }
};

monaco.editor.defineTheme('aiao-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [],
  colors: { 'editor.background': '#1f1f1f', 'editorLineNumber.foreground': '#858585' }
});

/** 将 Monaco 接到工作台统一接口，模型与事件随编辑器实例释放。 */
export const mountMonacoEditor: WorkbenchEditorMount = (host, initial) => {
  const model = monaco.editor.createModel(
    initial.value,
    languageIds[initial.language] ?? initial.language,
    monaco.Uri.parse(`inmemory://aiao/${++nextModel}/file.${extensions[initial.language] ?? initial.language}`)
  );
  const view = monaco.editor.create(host, {
    model,
    theme: 'aiao-dark',
    ariaLabel: '项目源码',
    automaticLayout: true,
    minimap: { enabled: false },
    fontSize: 13,
    scrollBeyondLastLine: false,
    insertSpaces: true,
    tabSize: (initial.indentUnit ?? '  ').length,
    detectIndentation: false,
    fixedOverflowWidgets: true
  });
  let synchronizing = false;
  let disposed = false;
  const change = view.onDidChangeModelContent(() => {
    if (!synchronizing) initial.onChange(model.getValue());
  });
  const viewport = () => {
    const ranges = view.getVisibleRanges();
    if (!ranges.length) return undefined;
    return { firstLine: ranges[0].startLineNumber, lastLine: ranges[ranges.length - 1].endLineNumber };
  };
  const scroll = view.onDidScrollChange(() => {
    const value = viewport();
    if (value) initial.onViewport?.(value);
  });
  const cursor = view.onDidChangeCursorPosition(event =>
    initial.onCursor(event.position.lineNumber, event.position.column)
  );

  return {
    update(value, language) {
      if (disposed) return;
      const id = languageIds[language] ?? language;
      if (model.getLanguageId() !== id) monaco.editor.setModelLanguage(model, id);
      if (model.getValue() === value) return;
      synchronizing = true;
      try {
        model.setValue(value);
      } finally {
        synchronizing = false;
      }
    },
    replace(value) {
      if (disposed) return;
      const change = computeMinimalDocumentChange(model.getValue(), value);
      if (!change) return;
      const start = model.getPositionAt(change.from);
      const end = model.getPositionAt(change.to);
      view.pushUndoStop();
      view.executeEdits('workbench', [
        {
          range: new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column),
          text: change.insert,
          forceMoveMarkers: true
        }
      ]);
      view.pushUndoStop();
    },
    layout: () => {
      if (!disposed) view.layout();
    },
    focus: () => {
      if (!disposed) view.focus();
    },
    setIndentUnit: unit => {
      if (!disposed) model.updateOptions({ insertSpaces: true, tabSize: unit.length });
    },
    setDiagnostics(diagnostics) {
      if (disposed) return;
      monaco.editor.setModelMarkers(
        model,
        'aiao-workbench',
        diagnostics.map(diagnostic => {
          const line = Math.min(Math.max(1, diagnostic.line), model.getLineCount());
          const column = Math.min(Math.max(1, diagnostic.column ?? 1), model.getLineMaxColumn(line));
          return {
            severity: monaco.MarkerSeverity.Error,
            message: diagnostic.message,
            startLineNumber: line,
            startColumn: column,
            endLineNumber: line,
            endColumn: Math.min(column + 1, model.getLineMaxColumn(line))
          };
        })
      );
    },
    runCommand(command, argument) {
      if (disposed) return false;
      if (command === 'gotoLineAt') {
        const line = Math.min(Math.max(1, argument ?? 1), model.getLineCount());
        view.setPosition({ lineNumber: line, column: 1 });
        view.revealLineInCenterIfOutsideViewport(line);
        view.focus();
        return true;
      }
      const actions = {
        gotoLine: 'editor.action.gotoLine',
        selectLine: 'expandLineSelection',
        insertLineAbove: 'editor.action.insertLineBefore',
        find: 'actions.find'
      };
      view.trigger('workbench', actions[command], undefined);
      return true;
    },
    getViewport: viewport,
    scrollToLine: line =>
      view.setScrollTop(view.getTopForLineNumber(Math.max(1, Math.min(line, model.getLineCount())))),
    getViewState() {
      const selection = view.getSelection()!;
      return {
        anchor: model.getOffsetAt(selection.getSelectionStart()),
        head: model.getOffsetAt(selection.getPosition()),
        scrollTop: view.getScrollTop(),
        scrollLeft: view.getScrollLeft()
      };
    },
    restoreViewState(state) {
      const anchor = model.getPositionAt(state.anchor);
      const head = model.getPositionAt(state.head);
      view.setSelection(new monaco.Selection(anchor.lineNumber, anchor.column, head.lineNumber, head.column));
      view.setScrollPosition({ scrollTop: state.scrollTop, scrollLeft: state.scrollLeft });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      change.dispose();
      cursor.dispose();
      scroll.dispose();
      view.dispose();
      model.dispose();
    }
  };
};
