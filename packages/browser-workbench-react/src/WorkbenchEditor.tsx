import { mountWorkbench } from '@aiao/browser-workbench';
import { CodeEditor, type CodeEditorHandle } from '@aiao/code-editor-react';
import { useEffect, type RefObject } from 'react';

type EditorInitial = Parameters<Parameters<typeof mountWorkbench>[2]>[1];

/** 每个文件保留自己的编辑器与选区，不共享游标实例。 */
export function WorkbenchEditor({
  initial,
  editorRef,
  onReady
}: {
  initial: EditorInitial;
  editorRef: RefObject<CodeEditorHandle | null>;
  onReady(): void;
}) {
  useEffect(onReady, [onReady]);
  const reportCursor = () => {
    const view = editorRef.current!.view!;
    const position = view.state.selection.main.head;
    const line = view.state.doc.lineAt(position);
    initial.onCursor(line.number, position - line.from + 1);
  };
  return (
    <div style={{ height: '100%' }} onKeyUp={reportCursor} onMouseUp={reportCursor} onInput={reportCursor}>
      <CodeEditor
        ref={editorRef}
        value={initial.value}
        language={initial.language}
        theme='dark'
        label='项目源码'
        onChange={initial.onChange}
      />
    </div>
  );
}
