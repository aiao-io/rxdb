import * as monaco from 'monaco-editor';
import type { WorkbenchFileVersion } from './session.js';
import type { WorkbenchDiffMount } from './workbench-diff.js';

let nextDiff = 0;

function textDocument(version: WorkbenchFileVersion): string {
  if (!version.exists) return '';
  if (version.binary || version.text === null) throw new Error('二进制或缺失文本不能作为编辑器文档');
  return version.text;
}

/** 使用独立模型比较 Git 快照，两侧只读且随视图释放。 */
export const mountMonacoDiff: WorkbenchDiffMount = (host, diff) => {
  const id = ++nextDiff;
  const models: monaco.editor.ITextModel[] = [];
  let view: monaco.editor.IStandaloneDiffEditor | undefined;
  let disposed = false;
  const labels = diff.kind === 'staged' ? ['HEAD', 'index'] : ['index', 'worktree'];
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    view?.dispose();
    models.forEach(model => model.dispose());
  };
  try {
    for (const [side, version] of [diff.base, diff.modified].entries()) {
      models.push(
        monaco.editor.createModel(
          textDocument(version),
          undefined,
          monaco.Uri.from({
            scheme: 'inmemory',
            authority: 'aiao-diff',
            path: `/${id}/${side}/${diff.path}`
          })
        )
      );
    }
    view = monaco.editor.createDiffEditor(host, {
      theme: 'aiao-dark',
      originalAriaLabel: `${labels[0]}（只读）`,
      modifiedAriaLabel: `${labels[1]}（只读）`,
      readOnly: true,
      originalEditable: false,
      renderSideBySide: true,
      useInlineViewWhenSpaceIsLimited: false,
      ignoreTrimWhitespace: false,
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 13,
      scrollBeyondLastLine: false,
      fixedOverflowWidgets: true
    });
    view.setModel({ original: models[0], modified: models[1] });
  } catch (cause) {
    dispose();
    throw cause;
  }
  return {
    layout() {
      if (!disposed) view?.layout();
    },
    dispose
  };
};
