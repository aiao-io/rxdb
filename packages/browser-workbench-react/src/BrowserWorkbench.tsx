import { mountWorkbench, type BrowserWorkbenchOptions } from '@aiao/browser-workbench';
import type { CodeEditorHandle } from '@aiao/code-editor-react';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { WorkbenchEditor } from './WorkbenchEditor.js';

type EditorInitial = Parameters<Parameters<typeof mountWorkbench>[2]>[1];

interface MountedEditor {
  id: number;
  host: HTMLElement;
  initial: EditorInitial;
  editorRef: RefObject<CodeEditorHandle | null>;
  onReady(): void;
}

/** 浏览器工作台的 React 输入，与 Angular / Vue 同名同义。 */
export interface BrowserWorkbenchProps {
  /** 初始化选项；更新选项需要重新挂载工作台。 */
  options?: BrowserWorkbenchOptions;
}

/** 使用现有 CodeEditor 挂载共享工作台。 */
export function BrowserWorkbench({ options = {} }: BrowserWorkbenchProps) {
  const host = useRef<HTMLDivElement>(null);
  const initialOptions = useRef(options);
  const nextEditorId = useRef(0);
  const [editors, setEditors] = useState<MountedEditor[]>([]);

  useEffect(() => {
    const workbench = mountWorkbench(host.current!, initialOptions.current, (element, initial) => {
      const id = ++nextEditorId.current;
      const editorRef: RefObject<CodeEditorHandle | null> = { current: null };
      let focusRequested = false;
      const layout = () => editorRef.current?.view?.requestMeasure();
      const focus = () => {
        focusRequested = !editorRef.current?.view;
        editorRef.current?.focus();
      };
      const onReady = () => {
        layout();
        if (focusRequested) focus();
      };
      setEditors(current => [...current, { id, host: element, initial, editorRef, onReady }]);
      return {
        update: (value, language) =>
          setEditors(current =>
            current.map(editor => (editor.id === id ? { ...editor, initial: { ...initial, value, language } } : editor))
          ),
        dispose: () => setEditors(current => current.filter(editor => editor.id !== id)),
        layout,
        focus
      };
    });
    return () => workbench.dispose();
  }, []);

  return (
    <>
      <div ref={host} style={{ display: 'block', height: '100%', minHeight: 0 }} />
      {editors.map(editor =>
        createPortal(
          <WorkbenchEditor initial={editor.initial} editorRef={editor.editorRef} onReady={editor.onReady} />,
          editor.host,
          String(editor.id)
        )
      )}
    </>
  );
}
