import { LanguageDescription, LanguageSupport, StreamLanguage, language as languageFacet } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { StrictMode, createRef, useLayoutEffect, useRef } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CodeEditor, type CodeEditorHandle } from '../CodeEditor.js';

const deferred = <T,>() => {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason: Error) => void = () => undefined;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

const support = () =>
  new LanguageSupport(
    StreamLanguage.define<null>({
      startState: () => null,
      token(stream) {
        stream.skipToEnd();
        return null;
      }
    })
  );

const viewOf = (container: HTMLElement): EditorView => {
  const content = container.querySelector<HTMLElement>('.cm-content');
  const view = content ? EditorView.findFromDOM(content) : null;
  if (!view) throw new Error('编辑器实例不存在');
  return view;
};

const settle = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

function LayoutWriter({ onChange, append }: { onChange: (value: string) => void; append?: string }) {
  const ref = useRef<CodeEditorHandle>(null);
  useLayoutEffect(() => {
    const view = ref.current?.view;
    if (view && append) view.dispatch({ changes: { from: view.state.doc.length, insert: append } });
  }, [append]);
  return <CodeEditor language='plaintext' onChange={onChange} ref={ref} value='initial' />;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('续评：React 编辑器生命周期与提交边界', () => {
  it('StrictMode 重建只向存活实例装载语言，且销毁每个实例', async () => {
    const pending = deferred<LanguageSupport>();
    const loaded = support();
    const load = vi.fn(() => pending.promise);
    const description = LanguageDescription.of({ name: 'Slow', load });
    const destroy = vi.spyOn(EditorView.prototype, 'destroy');
    const ref = createRef<CodeEditorHandle>();
    const onChange = vi.fn();
    const result = render(
      <StrictMode>
        <CodeEditor language='Slow' languages={[description]} onChange={onChange} ref={ref} value='initial' />
      </StrictMode>
    );
    const view = viewOf(result.container);
    const retained = ref.current;
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledTimes(1);
    await act(async () => {
      pending.resolve(loaded);
      await settle();
    });
    await waitFor(() => expect(view.state.facet(languageFacet)).toBe(loaded.language));
    act(() => view.dispatch({ changes: { from: 7, insert: '!' } }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith('initial!');
    result.unmount();
    expect(destroy).toHaveBeenCalledTimes(2);
    expect(ref.current).toBeNull();
    expect(retained?.view).toBeNull();
    expect(retained?.host).toBeNull();
  });

  it('未选中条目变化不取消同一语言仍在途的装载', async () => {
    const pending = deferred<LanguageSupport>();
    const loaded = support();
    const load = vi.fn(() => pending.promise);
    const selected = LanguageDescription.of({ name: 'Selected', load });
    const other = LanguageDescription.of({ name: 'Other', load: () => Promise.resolve(support()) });
    const replacement = LanguageDescription.of({ name: 'Other', load: () => Promise.resolve(support()) });
    const result = render(<CodeEditor language='Selected' languages={[selected, other]} value='keep' />);
    const view = viewOf(result.container);
    result.rerender(<CodeEditor language='Selected' languages={[selected, replacement]} value='keep' />);
    await act(async () => {
      pending.resolve(loaded);
      await settle();
    });
    await waitFor(() => expect(view.state.facet(languageFacet)).toBe(loaded.language));
    expect(load).toHaveBeenCalledTimes(1);
    expect(view.state.doc.toString()).toBe('keep');
  });

  it('卸载后的成功结果不再向已销毁实例派发事务', async () => {
    const pending = deferred<LanguageSupport>();
    const description = LanguageDescription.of({ name: 'Late', load: () => pending.promise });
    const result = render(<CodeEditor language='Late' languages={[description]} />);
    const view = viewOf(result.container);
    result.unmount();
    const dispatch = vi.spyOn(view, 'dispatch');
    await act(async () => {
      pending.resolve(support());
      await settle();
    });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('卸载后的失败结果不向旧回调或日志上报', async () => {
    const pending = deferred<LanguageSupport>();
    const description = LanguageDescription.of({ name: 'Late', load: () => pending.promise });
    const report = vi.fn();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const result = render(<CodeEditor language='Late' languages={[description]} onLanguageError={report} />);
    result.unmount();
    await act(async () => {
      pending.reject(new Error('迟到失败'));
      await settle();
    });
    expect(report).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('销毁一个 root 不影响另一个实例及其回调', () => {
    const firstSink = vi.fn();
    const secondSink = vi.fn();
    const first = render(<CodeEditor language='plaintext' onChange={firstSink} value='A' />);
    const second = render(<CodeEditor language='plaintext' onChange={secondSink} value='B' />);
    const secondView = viewOf(second.container);
    first.unmount();
    act(() => secondView.dispatch({ changes: { from: 1, insert: '!' } }));
    expect(firstSink).not.toHaveBeenCalled();
    expect(secondSink).toHaveBeenCalledExactlyOnceWith('B!');
  });

  it('服务端渲染只生成宿主，不创建 EditorView', () => {
    const destroy = vi.spyOn(EditorView.prototype, 'destroy');
    const html = renderToString(<CodeEditor language='plaintext' value='server' />);
    expect(html).toContain('overflow-hidden');
    expect(html).not.toContain('cm-content');
    expect(destroy).not.toHaveBeenCalled();
  });

  it('父组件 layout effect 的编辑必须发送到本次提交的新回调', () => {
    const previous = vi.fn();
    const current = vi.fn();
    const result = render(<LayoutWriter onChange={previous} />);
    result.rerender(<LayoutWriter append='!' onChange={current} />);
    expect.soft(viewOf(result.container).state.doc.toString()).toBe('initial!');
    expect.soft(previous).not.toHaveBeenCalled();
    expect.soft(current).toHaveBeenCalledExactlyOnceWith('initial!');
  });
});
