import { undo, undoDepth } from '@codemirror/commands';
import { LanguageDescription, LanguageSupport, StreamLanguage, language as languageFacet } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { Activity, StrictMode, createRef, useLayoutEffect, useRef, useState } from 'react';
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

type ActivityMode = 'hidden' | 'visible';

/** 宿主把编辑结果存进 state 再传回 `value` —— README 推荐的受控写法。 */
function ControlledInActivity({ mode, onChange }: { mode: ActivityMode; onChange: (value: string) => void }) {
  const [code, setCode] = useState('initial');
  return (
    <Activity mode={mode}>
      <CodeEditor
        language='plaintext'
        onChange={next => {
          setCode(next);
          onChange(next);
        }}
        value={code}
      />
    </Activity>
  );
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

// `<Activity>` 隐藏时执行 effect 清理、重显时重新接通，组件 state / ref 原样保留：
// EditorView 会被销毁重建，编辑器状态却必须跟组件状态同寿命。StrictMode 的双挂载发生在
// 用户输入之前，覆盖不到「编辑之后再隐藏」这条路径，所以这里一律用真实 Activity。
describe('Activity 隐藏再显示', () => {
  it('未受控输入：重显后保留文本、选区与撤销历史', () => {
    const onChange = vi.fn();
    const ui = (mode: ActivityMode) => (
      <Activity mode={mode}>
        <CodeEditor language='plaintext' onChange={onChange} value='initial' />
      </Activity>
    );
    const result = render(ui('visible'));
    const before = viewOf(result.container);
    act(() => before.dispatch({ changes: { from: 7, insert: '!' } }));
    act(() => before.dispatch({ selection: { anchor: 2, head: 5 } }));

    result.rerender(ui('hidden'));
    result.rerender(ui('visible'));

    const after = viewOf(result.container);
    expect(after.state.doc.toString()).toBe('initial!');
    expect(after.state.selection.main.anchor).toBe(2);
    expect(after.state.selection.main.head).toBe(5);
    expect(undoDepth(after.state)).toBe(1);
    expect(onChange).toHaveBeenCalledExactlyOnceWith('initial!');
    act(() => {
      undo(after);
    });
    expect(after.state.doc.toString()).toBe('initial');
  });

  it('受控回写：重显后保留选区与撤销历史，且不额外触发 onChange', () => {
    const onChange = vi.fn();
    const result = render(<ControlledInActivity mode='visible' onChange={onChange} />);
    const before = viewOf(result.container);
    act(() => before.dispatch({ changes: { from: 7, insert: '!' }, selection: { anchor: 8 } }));

    result.rerender(<ControlledInActivity mode='hidden' onChange={onChange} />);
    result.rerender(<ControlledInActivity mode='visible' onChange={onChange} />);

    const after = viewOf(result.container);
    expect(after.state.doc.toString()).toBe('initial!');
    expect(after.state.selection.main.head).toBe(8);
    expect(undoDepth(after.state)).toBe(1);
    expect(onChange).toHaveBeenCalledExactlyOnceWith('initial!');
  });

  // 与可见时同一条合同：value 变化才同步，且只同步差量、不进 undo 历史、不回调 onChange。
  // 隐藏期间 effect 不运行，这次变化推迟到重显时补上；没变化就不能拿 value 覆盖恢复出来的文档。
  it('隐藏期间 value 改变：重显时按差量同步新值，保留选区与此前的撤销历史', () => {
    const onChange = vi.fn();
    const ui = (mode: ActivityMode, value: string) => (
      <Activity mode={mode}>
        <CodeEditor language='plaintext' onChange={onChange} value={value} />
      </Activity>
    );
    const result = render(ui('visible', 'abc'));
    const before = viewOf(result.container);
    act(() => before.dispatch({ changes: { from: 1, insert: 'X' }, selection: { anchor: 2 } }));
    result.rerender(ui('visible', 'aXbc'));

    result.rerender(ui('hidden', 'aXbc'));
    result.rerender(ui('hidden', 'aXbc-tail'));
    result.rerender(ui('visible', 'aXbc-tail'));

    const after = viewOf(result.container);
    expect(after.state.doc.toString()).toBe('aXbc-tail');
    expect(after.state.selection.main.head).toBe(2);
    expect(undoDepth(after.state)).toBe(1);
    expect(onChange).toHaveBeenCalledExactlyOnceWith('aXbc');
    act(() => {
      undo(after);
    });
    expect(after.state.doc.toString()).toBe('abc-tail');
  });

  it('隐藏期间 value 改变：宿主新值覆盖未回写的输入，与可见时的同步语义一致', () => {
    const onChange = vi.fn();
    const ui = (mode: ActivityMode, value: string) => (
      <Activity mode={mode}>
        <CodeEditor language='plaintext' onChange={onChange} value={value} />
      </Activity>
    );
    const result = render(ui('visible', 'initial'));
    act(() => viewOf(result.container).dispatch({ changes: { from: 7, insert: '!' } }));

    result.rerender(ui('hidden', 'initial'));
    result.rerender(ui('hidden', 'replaced'));
    result.rerender(ui('visible', 'replaced'));

    expect(viewOf(result.container).state.doc.toString()).toBe('replaced');
    expect(onChange).toHaveBeenCalledExactlyOnceWith('initial!');
  });

  it('隐藏期间完成的语言装载只作用于重显后的新 view', async () => {
    const pending = deferred<LanguageSupport>();
    const loaded = support();
    const description = LanguageDescription.of({ name: 'Slow', load: () => pending.promise });
    const ui = (mode: ActivityMode) => (
      <Activity mode={mode}>
        <CodeEditor language='Slow' languages={[description]} value='initial' />
      </Activity>
    );
    const result = render(ui('visible'));
    const before = viewOf(result.container);
    act(() => before.dispatch({ changes: { from: 7, insert: '!' } }));

    result.rerender(ui('hidden'));
    const staleDispatch = vi.spyOn(before, 'dispatch');
    await act(async () => {
      pending.resolve(loaded);
      await settle();
    });
    result.rerender(ui('visible'));

    const after = viewOf(result.container);
    await waitFor(() => expect(after.state.facet(languageFacet)).toBe(loaded.language));
    expect(staleDispatch).not.toHaveBeenCalled();
    expect(after).not.toBe(before);
    expect(after.state.doc.toString()).toBe('initial!');
  });

  it('重显后才完成的语言装载丢弃旧请求，只向新 view 派发', async () => {
    const pending = deferred<LanguageSupport>();
    const loaded = support();
    const load = vi.fn(() => pending.promise);
    const description = LanguageDescription.of({ name: 'Slow', load });
    const ui = (mode: ActivityMode) => (
      <Activity mode={mode}>
        <CodeEditor language='Slow' languages={[description]} value='initial' />
      </Activity>
    );
    const result = render(ui('visible'));
    const before = viewOf(result.container);

    result.rerender(ui('hidden'));
    result.rerender(ui('visible'));
    const after = viewOf(result.container);
    const staleDispatch = vi.spyOn(before, 'dispatch');
    const freshDispatch = vi.spyOn(after, 'dispatch');
    await act(async () => {
      pending.resolve(loaded);
      await settle();
    });

    await waitFor(() => expect(after.state.facet(languageFacet)).toBe(loaded.language));
    expect(staleDispatch).not.toHaveBeenCalled();
    expect(freshDispatch).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledTimes(1);
  });
});
