import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserWorkbench } from './BrowserWorkbench';

const mocks = vi.hoisted(() => ({ mount: vi.fn(), dispose: vi.fn(), change: vi.fn(), cursor: vi.fn() }));
vi.mock('@aiao/browser-workbench', () => ({ mountWorkbench: mocks.mount }));
let editor: { update(value: string, language: string): void; layout(): void; focus(): void; dispose(): void };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.mount.mockImplementation((host, _options, mountEditor) => {
    const element = document.createElement('div');
    host.append(element);
    editor = mountEditor(element, {
      value: 'initial',
      language: 'plaintext',
      onChange: mocks.change,
      onCursor: mocks.cursor
    });
    return {
      dispose: () => {
        editor.dispose();
        mocks.dispose();
      }
    };
  });
});

describe('BrowserWorkbench React binding', () => {
  it('retains activation requested before the editor portal mounts', async () => {
    const mount = mocks.mount.getMockImplementation()!;
    mocks.mount.mockImplementation((host, options, mountEditor) => {
      const workbench = mount(host, options, mountEditor);
      editor.layout();
      editor.focus();
      return workbench;
    });
    const view = render(<BrowserWorkbench />);
    await waitFor(() => expect(document.activeElement).toBe(view.container.querySelector('.cm-content')));
    view.unmount();
  });

  it('mounts the existing editor, updates values and disposes the workbench', async () => {
    const view = render(<BrowserWorkbench options={{ initialProjectId: 'fixture' }} />);
    await waitFor(() => expect(view.container.querySelector('.cm-content')?.textContent).toBe('initial'));
    act(() => editor.update('changed', 'plaintext'));
    await waitFor(() => expect(view.container.querySelector('.cm-content')?.textContent).toBe('changed'));
    act(() => editor.layout());
    fireEvent.keyUp(view.container.querySelector('.cm-content') as HTMLElement);
    expect(mocks.cursor).toHaveBeenCalledWith(1, 1);
    const paste = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(paste, 'clipboardData', { value: { getData: () => 'pasted', files: [] } });
    act(() => view.container.querySelector('.cm-content')?.dispatchEvent(paste));
    expect(mocks.change).toHaveBeenCalledWith(expect.stringContaining('pasted'));
    act(() => editor.focus());
    expect(document.activeElement).toBe(view.container.querySelector('.cm-content'));
    expect(mocks.mount.mock.calls[0][1]).toEqual({ initialProjectId: 'fixture' });
    view.unmount();
    expect(() => {
      editor.layout();
      editor.focus();
    }).not.toThrow();
    expect(mocks.dispose).toHaveBeenCalledOnce();
  });

  it('retains independent editors for multiple files and releases a closed file', async () => {
    const view = render(<BrowserWorkbench />);
    await waitFor(() => expect(view.container.querySelectorAll('.cm-content')).toHaveLength(1));
    const secondHost = document.createElement('div');
    view.container.firstElementChild?.append(secondHost);
    let second: typeof editor;
    act(() => {
      second = mocks.mount.mock.calls[0][2](secondHost, {
        value: 'second',
        language: 'plaintext',
        onChange: mocks.change,
        onCursor: mocks.cursor
      });
    });
    await waitFor(() => expect(view.container.querySelectorAll('.cm-content')).toHaveLength(2));
    act(() => editor.update('first changed', 'plaintext'));
    await waitFor(() =>
      expect([...view.container.querySelectorAll('.cm-content')].map(element => element.textContent)).toEqual([
        'first changed',
        'second'
      ])
    );
    act(() => second.dispose());
    await waitFor(() => expect(view.container.querySelectorAll('.cm-content')).toHaveLength(1));
    view.unmount();
  });
});
